# Design Document: Audio Transcription Background Jobs

## Overview

This design enhances the existing audio transcription feature by implementing asynchronous background job processing with real-time status updates. The current implementation processes transcriptions synchronously, blocking the HTTP request until completion. This redesign leverages the existing Bull queue infrastructure and Socket.IO websockets to provide a non-blocking, user-friendly experience with visual feedback.

## Architecture

### High-Level Flow

```
User uploads audio → API creates job → Returns immediately with job ID
                                    ↓
                          Background worker processes job
                                    ↓
                          WebSocket pushes status updates
                                    ↓
                          Editor updates status card node
                                    ↓
                          On completion: Replace card with transcript
```

### System Components

1. **TranscriptionJob Model** - Database persistence for job state
2. **TranscriptionTask** - Background task worker
3. **TranscriptionStatusCard Node** - ProseMirror editor node
4. **Transcription API** - Modified endpoint for async operation
5. **WebSocket Events** - Real-time status updates
6. **Frontend Status Manager** - React component for status display

## Components and Interfaces

### 1. Database Model: TranscriptionJob

**Location**: `server/models/TranscriptionJob.ts`

**Schema**:
```typescript
{
  id: UUID (primary key)
  teamId: UUID (foreign key to Team)
  userId: UUID (foreign key to User)
  documentId: UUID (foreign key to Document)
  attachmentId: UUID (foreign key to Attachment)
  status: ENUM('queued', 'processing', 'completed', 'failed')
  progress: INTEGER (0-100, nullable)
  error: TEXT (nullable)
  result: JSONB (nullable) - stores transcribed text and metadata
  createdAt: TIMESTAMP
  updatedAt: TIMESTAMP
}
```

**Indexes**:
- `documentId` - for querying jobs by document
- `status` - for cleanup queries
- `createdAt` - for cleanup queries

**Methods**:
- `updateStatus(status, progress?, error?)` - Updates job status and emits websocket event
- `complete(result)` - Marks job as completed with result
- `fail(error)` - Marks job as failed with error message

### 2. Background Task: TranscriptionTask

**Location**: `server/queues/tasks/TranscriptionTask.ts`

**Extends**: `BaseTask<TranscriptionTaskProps>`

**Props Interface**:
```typescript
{
  jobId: string;
  attachmentId: string;
  userId: string;
  documentId: string;
}
```

**Implementation**:
- Fetches TranscriptionJob and Attachment from database
- Updates job status to 'processing'
- Downloads audio file from storage
- Sends to external transcription service
- Handles retries with exponential backoff (3 attempts)
- On success: Updates job with result, emits completion event
- On failure: Updates job with error, emits failure event
- Optionally deletes audio file based on env config

**Options**:
```typescript
{
  priority: TaskPriority.Normal,
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 60000 // 1 minute
  }
}
```

### 3. API Endpoint Modifications

**Location**: `server/routes/api/transcriptions/transcriptions.ts`

**Modified Endpoint**: `POST /api/transcriptions.create`

**Request**:
```typescript
{
  attachmentId: string;
  documentId: string;
}
```

**Response**:
```typescript
{
  data: {
    jobId: string;
    status: 'queued';
  }
}
```

**Flow**:
1. Validate attachment access
2. Create TranscriptionJob record
3. Schedule TranscriptionTask
4. Return job ID immediately
5. Client inserts status card node with job ID

**New Endpoint**: `GET /api/transcriptions.info`

**Request**:
```typescript
{
  jobId: string;
}
```

**Response**:
```typescript
{
  data: {
    id: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    progress?: number;
    error?: string;
    result?: {
      text: string;
      speakerSegments: Array<{speaker: string, text: string}>;
    };
  }
}
```

**New Endpoint**: `POST /api/transcriptions.retry`

**Request**:
```typescript
{
  jobId: string;
}
```

**Response**: Same as `transcriptions.create`

**New Endpoint**: `POST /api/transcriptions.cancel`

**Request**:
```typescript
{
  jobId: string;
}
```

**Response**:
```typescript
{
  success: boolean;
}
```

### 4. ProseMirror Node: TranscriptionStatusCard

**Location**: `shared/editor/nodes/TranscriptionStatusCard.tsx`

**Node Spec**:
```typescript
{
  attrs: {
    jobId: { default: null },
    fileName: { default: '' },
    fileSize: { default: 0 },
    status: { default: 'queued' },
    progress: { default: 0 },
    error: { default: null }
  },
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  parseDOM: [{
    tag: 'div.transcription-status-card',
    getAttrs: (dom) => ({
      jobId: dom.dataset.jobId,
      fileName: dom.dataset.fileName,
      fileSize: parseInt(dom.dataset.fileSize || '0'),
      status: dom.dataset.status,
      progress: parseInt(dom.dataset.progress || '0'),
      error: dom.dataset.error
    })
  }],
  toDOM: (node) => ['div', {
    class: 'transcription-status-card',
    'data-job-id': node.attrs.jobId,
    'data-file-name': node.attrs.fileName,
    'data-file-size': node.attrs.fileSize,
    'data-status': node.attrs.status,
    'data-progress': node.attrs.progress,
    'data-error': node.attrs.error
  }, 0]
}
```

**React Component**:
- Displays file name and size
- Shows status: "Queued", "Transcribing...", "Completed", "Failed"
- Progress bar (when available)
- Loading spinner for queued/processing states
- Error message with retry button for failed state
- Cancel button for queued/processing states

**Commands**:
- `insertTranscriptionStatusCard(attrs)` - Inserts the node at cursor
- `updateTranscriptionStatus(jobId, updates)` - Updates node attributes
- `removeTranscriptionStatusCard(jobId)` - Removes the node

### 5. WebSocket Events

**Event**: `transcription:status`

**Payload**:
```typescript
{
  jobId: string;
  documentId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  result?: {
    text: string;
    speakerSegments: Array<{speaker: string, text: string}>;
  };
}
```

**Rooms**: `document-${documentId}`

**Emitted by**: TranscriptionJob model after status updates

**Handled by**: Frontend status manager in editor

### 6. Frontend Integration

**Location**: `app/editor/components/TranscriptionStatusManager.tsx`

**Responsibilities**:
- Subscribes to websocket events for current document
- Listens for `transcription:status` events
- Updates status card nodes in editor
- On completion: Replaces status card with formatted transcript
- On failure: Updates card to show error with retry option

**Editor Menu Integration**:
- Modify `app/editor/components/SuggestionsMenu.tsx`
- On `/transcript` command:
  1. Show file picker
  2. Upload file as attachment
  3. Call `transcriptions.create` API
  4. Insert status card node with job ID
  5. Status manager handles updates

## Data Models

### TranscriptionJob Table

```sql
CREATE TABLE transcription_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL REFERENCES attachments(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  progress INTEGER,
  error TEXT,
  result JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transcription_jobs_document_id ON transcription_jobs(document_id);
CREATE INDEX idx_transcription_jobs_status ON transcription_jobs(status);
CREATE INDEX idx_transcription_jobs_created_at ON transcription_jobs(created_at);
```

### Migration Strategy

1. Create migration file: `server/migrations/YYYYMMDDHHMMSS-create-transcription-jobs.ts`
2. Add up/down methods for table creation
3. Run migration on deployment

## Error Handling

### Error Scenarios

1. **Attachment Not Found**
   - Status: 400 Bad Request
   - Message: "Attachment not found"
   - Action: Don't create job

2. **Transcription Service Unavailable**
   - Status: Job marked as 'failed'
   - Error: "Transcription service is not available"
   - Action: Retry with exponential backoff (3 attempts)
   - UI: Show error with retry button

3. **Invalid Audio Format**
   - Status: Job marked as 'failed'
   - Error: "Invalid audio format"
   - Action: No retry
   - UI: Show error message

4. **Job Timeout**
   - Status: Job marked as 'failed' after 30 minutes
   - Error: "Transcription timed out"
   - Action: Cleanup task marks as failed
   - UI: Show error with retry button

5. **Server Restart During Processing**
   - Status: Job remains in 'processing' state
   - Action: Worker resumes job on startup
   - UI: Continues showing processing state

### Retry Strategy

- **API Level**: No retries (immediate response)
- **Task Level**: 3 attempts with exponential backoff (1min, 2min, 4min)
- **User Level**: Manual retry button on failure

### Logging

All operations logged with context:
- `jobId`
- `attachmentId`
- `userId`
- `documentId`
- `status`
- `error` (if applicable)

## Testing Strategy

### Unit Tests

1. **TranscriptionJob Model**
   - Test status transitions
   - Test validation rules
   - Test event emission

2. **TranscriptionTask**
   - Test successful transcription
   - Test retry logic
   - Test error handling
   - Mock external service calls

3. **API Endpoints**
   - Test job creation
   - Test authorization
   - Test invalid inputs
   - Test job info retrieval

### Integration Tests

1. **End-to-End Flow**
   - Upload audio → Create job → Process → Complete
   - Verify websocket events emitted
   - Verify database state transitions

2. **WebSocket Communication**
   - Test event delivery to correct document room
   - Test multiple concurrent jobs
   - Test reconnection scenarios

3. **Editor Integration**
   - Test status card insertion
   - Test status updates
   - Test transcript replacement
   - Test retry functionality
   - Test cancel functionality

### Manual Testing Scenarios

1. Upload small audio file (< 1MB) - should complete quickly
2. Upload large audio file (50MB+) - should show progress
3. Disconnect network during processing - should resume
4. Restart server during processing - should resume
5. Multiple users transcribing in same document
6. Cancel job mid-processing
7. Retry failed job

## Performance Considerations

### Scalability

- **Concurrent Jobs**: Limited by `WORKER_CONCURRENCY_TASKS` (default: 10)
- **Queue Capacity**: Bull queue backed by Redis, handles thousands of jobs
- **WebSocket Connections**: Socket.IO with Redis adapter for horizontal scaling

### Resource Management

- **Memory**: Audio files streamed, not loaded entirely into memory
- **Storage**: Audio files deleted after transcription if configured
- **Database**: Cleanup task removes jobs older than 7 days

### Optimization

- **Job Deduplication**: Check for existing pending job for same attachment
- **Progress Updates**: Throttle to max 1 update per 2 seconds
- **WebSocket Rooms**: Use document-specific rooms to reduce broadcast overhead

## Security Considerations

1. **Authorization**
   - Verify user has access to attachment before creating job
   - Verify user has access to document before sending updates
   - Verify user owns job before retry/cancel operations

2. **Data Privacy**
   - Audio files stored securely with signed URLs
   - Transcription results stored in database (encrypted at rest)
   - WebSocket events only sent to authorized users

3. **Rate Limiting**
   - Limit transcription jobs per user (e.g., 10 concurrent)
   - Limit retry attempts per job (3 total)
   - API rate limiting applies to all endpoints

## Configuration

### Environment Variables

```bash
# Existing
TRANSCRIPTION_ENDPOINT=http://transcription-service:8000/transcribe
TRANSCRIPTION_DELETE_AUDIO_AFTER=false

# New
TRANSCRIPTION_JOB_TIMEOUT=1800000  # 30 minutes in ms
TRANSCRIPTION_CLEANUP_DAYS=7       # Days to keep completed jobs
TRANSCRIPTION_MAX_CONCURRENT_PER_USER=10
```

### Feature Flags

None required - feature is backward compatible with existing implementation.

## Migration Path

### Phase 1: Database and Models
1. Create migration for TranscriptionJob table
2. Implement TranscriptionJob model
3. Deploy database changes

### Phase 2: Background Task
1. Implement TranscriptionTask
2. Test task execution
3. Deploy worker changes

### Phase 3: API Changes
1. Modify transcriptions.create endpoint
2. Add new endpoints (info, retry, cancel)
3. Deploy API changes

### Phase 4: Frontend
1. Implement TranscriptionStatusCard node
2. Implement TranscriptionStatusManager
3. Update SuggestionsMenu integration
4. Deploy frontend changes

### Rollback Strategy

If issues arise:
1. Revert frontend changes - falls back to synchronous API
2. Keep background infrastructure for future use
3. Database table can remain (no harm if unused)

## Dependencies

### Existing
- Bull (job queue)
- Socket.IO (websockets)
- ProseMirror (editor)
- Sequelize (ORM)

### New
None - uses existing infrastructure

## Open Questions

1. Should we support progress updates from the transcription service?
   - **Decision**: Yes, if service provides progress, display it
   - **Fallback**: Show indeterminate spinner if no progress

2. Should we allow multiple transcriptions in the same document?
   - **Decision**: Yes, each gets its own status card
   - **Limit**: Max 10 concurrent per document

3. What happens if user closes document during transcription?
   - **Decision**: Job continues, status card appears when document reopened
   - **Implementation**: Query pending jobs on document load

4. Should we support canceling jobs?
   - **Decision**: Yes, add cancel button to status card
   - **Implementation**: Remove job from queue, delete status card

## Future Enhancements

1. **Batch Transcription**: Upload multiple files at once
2. **Speaker Identification**: Enhanced UI for multi-speaker transcripts
3. **Transcript Editing**: Allow users to edit transcribed text
4. **Export Options**: Export transcript as separate file
5. **Language Detection**: Auto-detect audio language
6. **Timestamps**: Display timestamps for each segment
