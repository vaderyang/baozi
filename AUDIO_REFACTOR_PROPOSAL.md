# Audio Recording & Transcription Architecture Refactoring

## Executive Summary

The current audio recording and transcription system suffers from critical stability issues due to:
1. **Synchronous blocking** in background tasks during external ASR service calls
2. **Triple polling mechanisms** creating race conditions and resource waste
3. **Tight frontend-backend coupling** preventing graceful degradation
4. **Missing event-driven patterns** despite existing websocket infrastructure

This proposal outlines an **event-driven, queue-based architecture** that moves all complex handling to the backend with real-time notifications to the frontend.

---

## Current Architecture Problems

### Problem 1: Synchronous HTTP Blocking (CRITICAL)

**Location**: `server/queues/tasks/TranscriptionTask.ts:164-170`

```typescript
// Current: Blocks entire worker thread for minutes
const response = await fetch(transcriptionEndpoint, {
  method: "POST",
  body: form,
  headers: form.getHeaders(),
});
```

**Impact**:
- Worker thread blocked for 30s - 10+ minutes per job
- No concurrency for multiple transcription jobs
- Timeouts on long recordings
- Queue backlog in high-traffic scenarios

### Problem 2: Triple Polling Mechanisms

Three separate systems poll for the same job status:

1. **AudioRecorderStore**: Every 5s for 10 minutes max
2. **TranscriptionJobsStore**: Every 2s indefinitely
3. **TranscriptionStatusManager**: Every 5s for all status cards

**Impact**:
- 3x redundant API calls
- Race conditions causing duplicate transcript insertions
- Inconsistent UI state updates
- No coordination between pollers

### Problem 3: Frontend-Backend Coupling

```typescript
// Frontend manages entire lifecycle
stopRecording() → uploadAndTranscribe() → pollStatus() → insertTranscript()
```

**Impact**:
- Lost recordings on navigation/refresh during upload
- No recovery if frontend crashes
- Fire-and-forget async operations swallow errors
- Document state mutated during async operations

### Problem 4: No Event-Driven Updates

Websocket infrastructure exists but is unused:
- Backend emits `transcription:status` events
- Frontend has no listeners
- Relies entirely on HTTP polling

---

## Proposed Event-Driven Architecture

### Core Principles

1. **Backend Owns Lifecycle**: All complex operations run in backend workers
2. **Events Over Polling**: Websocket push notifications replace HTTP polling
3. **Separation of Concerns**: Recording session decoupled from transcription job
4. **Graceful Degradation**: Frontend remains stable even during long-running jobs
5. **Observability**: Job queue provides monitoring and retry mechanisms

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│                                                              │
│  ┌──────────────────┐      ┌─────────────────────┐         │
│  │ RecordingSession │      │ TranscriptionMonitor│         │
│  │  - Mic access    │      │  - WebSocket listener│        │
│  │  - MediaRecorder │      │  - Status card UI    │        │
│  │  - Chunk storage │      │  - Progress display  │        │
│  └────────┬─────────┘      └──────────▲──────────┘         │
│           │                            │                     │
└───────────┼────────────────────────────┼─────────────────────┘
            │ 1. Upload                  │ 5. Events
            │    audio blob              │    (WebSocket)
            ↓                            │
┌─────────────────────────────────────────────────────────────┐
│                      API LAYER                               │
│                                                              │
│  POST /api/audio.upload                                     │
│    ├─ Save file to storage                                  │
│    ├─ Create TranscriptionJob (status: queued)              │
│    └─ Queue TranscriptionTask                               │
│                                                              │
│  GET /api/transcriptions/:id (optional polling fallback)    │
└─────────────────────┬───────────────────────────────────────┘
                      │ 2. Queue job
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                  JOB QUEUE (Bull/BullMQ)                     │
│                                                              │
│  TranscriptionQueue                                          │
│    ├─ Priority: normal                                       │
│    ├─ Concurrency: 3-5 workers                              │
│    ├─ Retry: 3 attempts, exponential backoff                │
│    └─ Timeout: 30 minutes                                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ 3. Worker picks job
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                 TRANSCRIPTION WORKER                         │
│                                                              │
│  TranscriptionTask.perform():                               │
│    1. Update job: status = "processing"                     │
│    2. Emit event: "transcription:processing"                │
│    3. Download audio from storage                           │
│    4. Stream to ASR service (async, non-blocking)           │
│    5. For each chunk received:                              │
│       ├─ Update job: progress += 10%                        │
│       └─ Emit event: "transcription:progress"               │
│    6. Parse final result                                    │
│    7. Update job: status = "completed", result = {...}      │
│    8. Emit event: "transcription:completed"                 │
│    9. If autoSummary: Queue AutoSummaryTask                 │
│                                                              │
│  Error Handling:                                             │
│    ├─ On failure: Update job status = "failed"              │
│    ├─ Emit event: "transcription:failed"                    │
│    └─ Queue retry (via Bull retry mechanism)                │
└─────────────────────┬───────────────────────────────────────┘
                      │ 4. Emit events
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                 WEBSOCKET BROADCASTER                        │
│                                                              │
│  Event Types:                                                │
│    - transcription:processing  { jobId, documentId }        │
│    - transcription:progress    { jobId, progress }          │
│    - transcription:completed   { jobId, result }            │
│    - transcription:failed      { jobId, error }             │
│                                                              │
│  Broadcasting:                                               │
│    ├─ To user who owns the document                         │
│    ├─ To all viewers of the document (collaboration)        │
│    └─ Fallback: Store event in Redis for polling            │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Backend Job Queue Infrastructure (Week 1)

#### 1.1 Upgrade TranscriptionTask to Async/Streaming

**File**: `server/queues/tasks/TranscriptionTask.ts`

**Changes**:
```typescript
import { Readable } from "stream";
import FormData from "form-data";

export default class TranscriptionTask extends BaseTask<TranscriptionJobData> {
  public async perform(data: TranscriptionJobData) {
    const { transcriptionJobId } = data;
    const job = await TranscriptionJob.findByPk(transcriptionJobId);

    // Update status and emit event
    await job.update({ status: "processing", startedAt: new Date() });
    await this.emitProgress(job, 0, "Starting transcription...");

    try {
      // Download audio file
      const audioBuffer = await this.downloadAudio(job.audioFileId);

      // Stream to ASR service with progress tracking
      const result = await this.streamTranscription(job, audioBuffer);

      // Update job with result
      await job.update({
        status: "completed",
        completedAt: new Date(),
        result: {
          text: result.text,
          speakerSegments: result.speakerSegments,
        },
      });

      await this.emitProgress(job, 100, "Transcription completed");

      // Queue summary generation if enabled
      if (job.autoSummary) {
        await AutoSummaryTask.schedule({ transcriptionJobId: job.id });
      }

    } catch (error) {
      await job.update({
        status: "failed",
        failedAt: new Date(),
        error: error.message,
      });

      await this.emitError(job, error);
      throw error; // Let Bull handle retry
    }
  }

  /**
   * Stream audio to ASR service with chunked upload and progress tracking
   */
  private async streamTranscription(
    job: TranscriptionJob,
    audioBuffer: Buffer
  ): Promise<{ text: string; speakerSegments: any[] }> {
    const form = new FormData();

    // Create readable stream from buffer
    const audioStream = Readable.from(audioBuffer);
    let uploadedBytes = 0;
    const totalBytes = audioBuffer.length;

    // Track upload progress
    audioStream.on("data", (chunk) => {
      uploadedBytes += chunk.length;
      const uploadProgress = Math.floor((uploadedBytes / totalBytes) * 50); // 0-50%
      void this.emitProgress(job, uploadProgress, "Uploading audio...");
    });

    form.append("file", audioStream, {
      filename: "audio.webm",
      contentType: "audio/webm",
    });

    // Non-blocking async HTTP call with streaming response
    const response = await fetch(env.TRANSCRIPTION_ENDPOINT, {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`ASR service error: ${response.statusText}`);
    }

    // Parse response (ASR service returns JSON)
    const result = await response.json();

    await this.emitProgress(job, 100, "Processing transcription...");

    return result;
  }

  /**
   * Emit progress event via WebSocket
   */
  private async emitProgress(
    job: TranscriptionJob,
    progress: number,
    message: string
  ): Promise<void> {
    const document = await job.$get("document");
    if (!document) return;

    // Broadcast to all viewers of the document
    websockets.emit("transcription:progress", {
      jobId: job.id,
      documentId: document.id,
      progress,
      message,
      status: job.status,
    }, {
      teamId: document.teamId,
      documentId: document.id,
    });

    // Also update job record for polling fallback
    await job.update({ progress, lastProgressMessage: message });
  }

  private async emitError(job: TranscriptionJob, error: Error): Promise<void> {
    const document = await job.$get("document");
    if (!document) return;

    websockets.emit("transcription:failed", {
      jobId: job.id,
      documentId: document.id,
      error: error.message,
    }, {
      teamId: document.teamId,
      documentId: document.id,
    });
  }
}
```

**Benefits**:
- ✅ Non-blocking async operations
- ✅ Real-time progress events (0% → 100%)
- ✅ Graceful error handling with retry
- ✅ Concurrent job processing

#### 1.2 Add Progress Tracking to TranscriptionJob Model

**File**: `server/models/TranscriptionJob.ts`

**Migration**: Add columns
```sql
ALTER TABLE transcription_jobs
ADD COLUMN progress INTEGER DEFAULT 0,
ADD COLUMN last_progress_message TEXT,
ADD COLUMN started_at TIMESTAMP,
ADD COLUMN failed_at TIMESTAMP;
```

**Model Update**:
```typescript
@Table({ tableName: "transcription_jobs" })
class TranscriptionJob extends Model {
  @Column(DataType.INTEGER)
  progress: number;

  @Column(DataType.TEXT)
  lastProgressMessage: string | null;

  @Column(DataType.DATE)
  startedAt: Date | null;

  @Column(DataType.DATE)
  failedAt: Date | null;

  // Emit websocket event on every update
  @AfterUpdate
  static async broadcastUpdate(job: TranscriptionJob) {
    const document = await job.$get("document");
    if (!document) return;

    websockets.emit("transcription:status", {
      jobId: job.id,
      documentId: document.id,
      status: job.status,
      progress: job.progress,
      message: job.lastProgressMessage,
      result: job.result,
    }, {
      teamId: document.teamId,
      documentId: document.id,
    });
  }
}
```

#### 1.3 Optimize Audio Upload Endpoint

**File**: `server/routes/api/audio/audio.ts`

**Changes**:
```typescript
router.post(
  "audio.upload",
  rateLimiter(RateLimiterStrategy.TenPerMinute),
  async (ctx) => {
    const { documentId, nodeId, autoSummary = false } = ctx.request.body;
    const { user } = ctx.state.auth;

    // Validate document access
    const document = await Document.findByPk(documentId);
    authorize(user, "update", document);

    // Upload file to storage (already async)
    const file = await uploadFile(ctx.request.file, {
      preset: AttachmentPreset.AudioTranscription,
      userId: user.id,
      teamId: user.teamId,
    });

    // Create job record
    const job = await TranscriptionJob.create({
      documentId,
      nodeId,
      audioFileId: file.id,
      userId: user.id,
      teamId: user.teamId,
      status: "queued",
      autoSummary,
      progress: 0,
    });

    // Queue background task (non-blocking)
    await TranscriptionTask.schedule({
      transcriptionJobId: job.id,
    });

    // Return immediately with job ID
    ctx.body = {
      data: {
        jobId: job.id,
        status: "queued",
        progress: 0,
        message: "Transcription queued",
      },
    };
  }
);
```

**Benefits**:
- ✅ Fast response time (<1s)
- ✅ No blocking on transcription
- ✅ Job queued for background processing

---

### Phase 2: Frontend Event-Driven Updates (Week 2)

#### 2.1 Add WebSocket Event Listeners

**File**: `app/components/WebsocketProvider.tsx`

**Changes**:
```typescript
export default function WebsocketProvider({ children }: Props) {
  const stores = useStores();

  // Existing listeners...

  // NEW: Transcription event listeners
  useEffect(() => {
    const socket = stores.websockets.socket;
    if (!socket) return;

    // Handle transcription progress
    socket.on("transcription:progress", (event: {
      jobId: string;
      documentId: string;
      progress: number;
      message: string;
      status: string;
    }) => {
      stores.transcriptionJobs.updateJobFromEvent(event);
    });

    // Handle transcription completion
    socket.on("transcription:completed", (event: {
      jobId: string;
      documentId: string;
      result: { text: string; speakerSegments: any[] };
    }) => {
      stores.transcriptionJobs.handleCompletion(event);

      // Insert TranscriptCard into document
      if (stores.documents.active?.id === event.documentId) {
        stores.transcriptionJobs.insertTranscriptCard(event.jobId);
      }
    });

    // Handle transcription failure
    socket.on("transcription:failed", (event: {
      jobId: string;
      documentId: string;
      error: string;
    }) => {
      stores.transcriptionJobs.handleFailure(event);
      stores.toasts.showError("Transcription failed: " + event.error);
    });

    return () => {
      socket.off("transcription:progress");
      socket.off("transcription:completed");
      socket.off("transcription:failed");
    };
  }, [stores]);

  return <>{children}</>;
}
```

#### 2.2 Refactor AudioRecorderStore (Separation of Concerns)

**File**: `app/stores/AudioRecorderStore.ts`

**Changes**:
```typescript
export default class AudioRecorderStore {
  // REMOVE: uploadAndTranscribe, pollTranscriptionStatus methods
  // KEEP: Recording session management only

  /**
   * Stop recording and upload audio
   * No longer manages transcription lifecycle
   */
  async stopRecording(): Promise<void> {
    if (!this.mediaRecorder || this.status !== "recording") return;

    this.mediaRecorder.stop();
    this.status = "stopped";

    // Create audio blob
    const audioBlob = new Blob(this.audioChunks, { type: this.mimeType });

    // Snapshot current context
    const context = this.snapshotCurrentContext();

    // Upload and create job (no polling!)
    await this.uploadAudio(audioBlob, context);

    // Clean up
    this.cleanup();
  }

  /**
   * Upload audio and create transcription job
   * Returns immediately, backend handles the rest
   */
  private async uploadAudio(
    audioBlob: Blob,
    context?: RecordingContext
  ): Promise<void> {
    this.status = "uploading";

    try {
      // Upload file
      const file = await this.api.upload("/api/audio.upload", audioBlob, {
        documentId: context?.documentId,
        nodeId: context?.nodeId,
        autoSummary: true,
      }, {
        onProgress: (progress) => {
          this.uploadProgress = progress;
        },
      });

      // Job created in backend, we're done!
      this.status = "completed";

      // TranscriptionJobsStore will handle status updates via WebSocket
      this.ui.showToast({
        message: "Recording uploaded. Transcription in progress...",
        type: "info",
      });

    } catch (error) {
      this.status = "failed";
      this.ui.showToast({
        message: "Upload failed: " + error.message,
        type: "error",
      });
      throw error;
    }
  }
}
```

**Benefits**:
- ✅ Reduced complexity (1295 → ~600 lines)
- ✅ Single responsibility: recording only
- ✅ No polling logic
- ✅ Fast upload, immediate return

#### 2.3 Simplify TranscriptionJobsStore (Event-Driven)

**File**: `app/stores/TranscriptionJobsStore.ts`

**Changes**:
```typescript
export default class TranscriptionJobsStore extends BaseStore {
  @observable jobs = new Map<string, TranscriptionJob>();

  // REMOVE: startPolling, stopPolling methods

  /**
   * Update job from WebSocket event
   */
  @action
  updateJobFromEvent(event: {
    jobId: string;
    progress?: number;
    status?: string;
    message?: string;
  }): void {
    const job = this.jobs.get(event.jobId);
    if (!job) return;

    if (event.progress !== undefined) job.progress = event.progress;
    if (event.status) job.status = event.status;
    if (event.message) job.lastMessage = event.message;
  }

  /**
   * Handle transcription completion
   */
  @action
  async handleCompletion(event: {
    jobId: string;
    documentId: string;
    result: { text: string; speakerSegments: any[] };
  }): Promise<void> {
    const job = this.jobs.get(event.jobId);
    if (!job) return;

    job.status = "completed";
    job.progress = 100;
    job.result = event.result;

    this.ui.showToast({
      message: "Transcription completed!",
      type: "success",
    });
  }

  /**
   * Insert TranscriptCard into active document
   */
  @action
  async insertTranscriptCard(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || !job.result) return;

    const document = this.documents.active;
    if (!document || document.id !== job.documentId) return;

    // Find placeholder node and replace with TranscriptCard
    const { view } = this.editor;
    if (!view) return;

    // Implementation: Replace RecordingPlaceholder with TranscriptCard
    // (existing logic from TranscriptionStatusManager)
  }

  /**
   * Handle transcription failure
   */
  @action
  handleFailure(event: {
    jobId: string;
    error: string;
  }): void {
    const job = this.jobs.get(event.jobId);
    if (!job) return;

    job.status = "failed";
    job.error = event.error;
  }

  /**
   * Polling fallback (for WebSocket disconnections)
   */
  @action
  async pollJobStatus(jobId: string): Promise<void> {
    // Only used if WebSocket is disconnected
    if (this.websockets.isConnected) return;

    const job = await this.api.get(`/api/transcriptions/${jobId}`);
    this.updateJobFromEvent(job);
  }
}
```

**Benefits**:
- ✅ Event-driven updates (no polling)
- ✅ Polling only as fallback
- ✅ Clean separation from recording

#### 2.4 Remove TranscriptionStatusManager Polling

**File**: `app/editor/components/TranscriptionStatusManager.tsx`

**Changes**:
```typescript
// REMOVE: Entire polling mechanism
// KEEP: Only TranscriptCard insertion logic

export default function TranscriptionStatusManager() {
  const { transcriptionJobs, editor } = useStores();

  // Listen for completion events (already handled in WebsocketProvider)
  // This component now only handles UI rendering

  return null; // No polling UI needed
}
```

---

### Phase 3: Graceful Degradation & Observability (Week 3)

#### 3.1 Polling Fallback for WebSocket Disconnections

**File**: `app/stores/TranscriptionJobsStore.ts`

**Add**:
```typescript
/**
 * Auto-enable polling if WebSocket disconnects during active job
 */
@computed
get hasActiveJobs(): boolean {
  return Array.from(this.jobs.values()).some(
    job => job.status === "queued" || job.status === "processing"
  );
}

@action
startPollingFallback(): void {
  if (this.websockets.isConnected || !this.hasActiveJobs) return;

  // Poll every 10 seconds as fallback
  this.pollingInterval = setInterval(() => {
    this.jobs.forEach((job) => {
      if (job.status === "queued" || job.status === "processing") {
        void this.pollJobStatus(job.id);
      }
    });
  }, 10000);
}

@action
stopPollingFallback(): void {
  if (this.pollingInterval) {
    clearInterval(this.pollingInterval);
    this.pollingInterval = null;
  }
}
```

#### 3.2 Job Queue Monitoring Dashboard

**New File**: `server/routes/api/admin/queues.ts`

```typescript
import Router from "koa-router";
import { Queue } from "bull";
import { transcriptionQueue } from "@server/queues";

const router = new Router();

router.get("admin.queues.status", async (ctx) => {
  const { user } = ctx.state.auth;
  authorize(user, "read", "AdminDashboard");

  const queue = transcriptionQueue as Queue;

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  const jobs = await queue.getJobs(["waiting", "active", "failed"], 0, 50);

  ctx.body = {
    data: {
      counts: { waiting, active, completed, failed },
      jobs: jobs.map(job => ({
        id: job.id,
        name: job.name,
        data: job.data,
        progress: job.progress(),
        timestamp: job.timestamp,
        attemptsMade: job.attemptsMade,
      })),
    },
  };
});

export default router;
```

#### 3.3 IndexedDB Recovery Enhancement

**File**: `app/stores/AudioRecorderStore.ts`

**Add**:
```typescript
/**
 * Recover failed uploads from IndexedDB
 */
@action
async recoverFailedUploads(): Promise<void> {
  const db = await openDB();
  const failedSessions = await db.getAll("recording-sessions",
    IDBKeyRange.only("failed")
  );

  for (const session of failedSessions) {
    const confirm = await this.ui.confirm({
      title: "Recover failed recording?",
      message: `Recording from ${session.timestamp} failed to upload. Retry?`,
    });

    if (confirm) {
      const audioBlob = new Blob(session.audioChunks, { type: session.mimeType });
      await this.uploadAudio(audioBlob, session.context);
    }
  }
}
```

---

## Migration Strategy

### Step 1: Deploy Backend Changes (No Frontend Impact)
1. Add database migration for progress columns
2. Deploy upgraded TranscriptionTask (still emits events)
3. Existing polling continues to work

### Step 2: Deploy Frontend WebSocket Listeners
1. Add event listeners in WebsocketProvider
2. Both polling and events work simultaneously
3. Monitor for event delivery issues

### Step 3: Remove Frontend Polling (Gradual)
1. Add feature flag: `WEBSOCKET_TRANSCRIPTION_UPDATES`
2. If enabled: Disable polling, use events only
3. Monitor error rates, rollback if issues
4. Enable for 10% → 50% → 100% of users

### Step 4: Cleanup
1. Remove polling code entirely
2. Remove TranscriptionStatusManager component
3. Remove redundant API endpoints

---

## Performance Expectations

| Metric | Current | After Refactor |
|--------|---------|----------------|
| **Upload Response Time** | ~5s | <1s |
| **Frontend Polling Overhead** | 3 polls/5s | 0 (events only) |
| **Worker Concurrency** | 1 job at a time | 3-5 concurrent jobs |
| **Max Job Duration** | 10 min (timeout) | 30 min (configurable) |
| **Event Latency** | N/A (polling) | <100ms (WebSocket) |
| **Recovery Time (crash)** | Lost session | Full recovery via queue |

---

## Rollback Plan

If issues arise during deployment:

1. **Phase 2 Rollback**: Disable WebSocket listeners, re-enable polling
   - Feature flag: `WEBSOCKET_TRANSCRIPTION_UPDATES=false`
   - No code deployment needed

2. **Phase 1 Rollback**: Revert TranscriptionTask changes
   - Deploy previous version of task
   - Queue will continue processing jobs

3. **Database Rollback**: Migration is additive (no breaking changes)
   - New columns can remain unused

---

## Success Metrics

### Reliability
- ✅ 99.9% transcription job completion rate
- ✅ <1% lost recordings due to crashes
- ✅ Zero duplicate transcript insertions

### Performance
- ✅ Upload response time <1s (vs. current ~5s)
- ✅ 90% reduction in API polling overhead
- ✅ 3-5x increase in transcription throughput

### User Experience
- ✅ Real-time progress updates (0% → 100%)
- ✅ No frontend freezing during long transcriptions
- ✅ Graceful handling of WebSocket disconnections

---

## Open Questions

1. **ASR Service Streaming**: Does the transcription service support chunked responses?
   - If yes: Implement streaming progress updates
   - If no: Keep current batch processing with event emissions

2. **Queue Infrastructure**: Use existing Bull setup or upgrade to BullMQ?
   - BullMQ: Better TypeScript support, more features
   - Bull: Already in use, less migration risk

3. **Event Persistence**: Store events in Redis for offline users?
   - Store last 24h of events per job
   - Replay on reconnection

4. **Progress Granularity**: How often to emit progress events?
   - Option 1: Every 10% increment
   - Option 2: Time-based (every 5s)
   - Recommendation: Hybrid (max 10% or 5s intervals)

---

## Conclusion

This event-driven architecture refactoring will transform the audio transcription system from a **polling-heavy, blocking, fragile** implementation to a **scalable, resilient, real-time** system that can handle:

- ✅ Concurrent multi-user transcription jobs
- ✅ Long recordings (30+ minutes)
- ✅ Graceful degradation on failures
- ✅ Real-time progress updates
- ✅ Full recovery from crashes

The phased migration strategy ensures **zero downtime** and provides **rollback safety** at each step.

**Estimated Effort**: 3 weeks (1 backend + 1 frontend + 1 testing/monitoring)

**Risk Level**: Medium (mitigated by feature flags and gradual rollout)

**Impact**: High (solves critical stability issues)
