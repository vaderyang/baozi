# Audio-First Experience Design Document

## Overview

This design transforms the application into an audio-first knowledge capture system. Instead of the traditional document-centric workflow, users begin with audio recording, uploading, or URL import. The system automatically creates documents, transcribes content, and uses AI to suggest optimal organization locations.

The core philosophy is "recording before documentation" - reducing friction in the capture phase while leveraging AI for intelligent organization afterward.

## Architecture

### High-Level Component Structure

```
┌─────────────────────────────────────────────────────────────┐
│                        Audio Hub                             │
│  (Landing page with Record/Upload/Import options)           │
└─────────────────┬───────────────────────────────────────────┘
                  │
        ┌─────────┼─────────┐
        │         │         │
        ▼         ▼         ▼
   ┌────────┐ ┌──────┐ ┌────────┐
   │ Record │ │Upload│ │URL     │
   │ Studio │ │Queue │ │Import  │
   └────┬───┘ └───┬──┘ └───┬────┘
        │         │        │
        └─────────┼────────┘
                  │
                  ▼
         ┌────────────────┐
         │ Audio Document │
         │  (in Inbox)    │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │ Transcription  │
         │    Service     │
         └────────┬───────┘
                  │
                  ▼
         ┌────────────────┐
         │  AI Archive    │
         │  Suggestion    │
         └────────────────┘
```

### Data Flow

1. **Capture Phase**: User initiates recording/upload/import → Audio Document created in Audio Inbox
2. **Processing Phase**: Audio saved as Attachment → TranscriptionJob created → Transcription service processes
3. **Organization Phase**: Transcript inserted into document → AI analyzes content → Suggestions presented
4. **Archive Phase**: User accepts suggestion → Document moved to target location

## Components and Interfaces

### 1. Audio Hub Component

**Purpose**: Primary landing page for audio-first workflow

**Location**: `app/scenes/AudioHub/AudioHub.tsx`

**Props Interface**:
```typescript
interface AudioHubProps {
  // No props - uses stores directly
}
```

**Key Features**:
- Three primary action cards: Record, Upload, Import
- Recent Recordings section (last 5 from Audio Inbox)
- Processing section (active transcription jobs)
- Quick link to full Audio Inbox

**Design Decision**: Make this the default landing page for new users or users with no recent activity. This shifts the mental model from "create document first" to "capture audio first."

**Rationale**: Reduces cognitive load and decision paralysis. Users don't need to decide where to put content before capturing it.

### 2. Recording Studio Component

**Purpose**: Dedicated full-screen recording interface

**Location**: `app/scenes/RecordingStudio/RecordingStudio.tsx`

**Props Interface**:
```typescript
interface RecordingStudioProps {
  documentId: string; // The Audio Document being recorded into
  onMinimize: () => void;
  onComplete: () => void;
  onCancel: () => void;
}
```

**State Management**:
```typescript
interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number; // in seconds
  audioChunks: Blob[];
  waveformData: number[]; // For visualization
  realtimeTranscript?: string;
  markers: Array<{ timestamp: number; label?: string }>;
}
```

**Key Features**:
- Large waveform visualization using Web Audio API
- Real-time duration counter
- Control buttons: Pause/Resume, Stop, Cancel, Mark
- Optional title input field
- Real-time transcription panel (if supported)
- Minimize button to enable navigation while recording

**Design Decision**: Use a dedicated full-screen interface rather than inline recording in the document editor.

**Rationale**: Creates a focused, distraction-free recording experience. The large waveform provides visual feedback that recording is active and working properly.

### 3. Global Recording Control Component

**Purpose**: Persistent recording indicator when user navigates away from Recording Studio

**Location**: `app/components/GlobalRecordingControl.tsx`

**Props Interface**:
```typescript
interface GlobalRecordingControlProps {
  recordingSession: {
    documentId: string;
    duration: number;
    isPaused: boolean;
  };
  onReopen: () => void;
  onStop: () => void;
}
```

**Key Features**:
- Floating UI element (bottom-right corner, 60px height)
- Shows: recording icon, duration, clickable area
- Click to reopen Recording Studio
- Hover/right-click for Stop action
- Visible across all pages

**Design Decision**: Use a floating, always-visible control rather than a header bar notification.

**Rationale**: Doesn't interfere with existing navigation. Users can reference other documents while recording (e.g., recording meeting notes while viewing agenda).

### 4. Audio Inbox Collection

**Purpose**: Private collection for all new audio documents before archiving

**Location**: Extends existing Collection model with special type

**Data Model**:
```typescript
interface AudioInboxCollection extends Collection {
  type: 'audio-inbox'; // Special collection type
  userId: string; // Owner
  isPrivate: true; // Always private
}
```

**Key Features**:
- Special inbox icon in navigation
- Reverse chronological sorting
- Compact card layout optimized for audio content
- Count badge showing unarchived items
- Bulk selection for moving multiple documents
- Search and filter: All, Transcribing, Ready to Archive
- Sort options: Newest, Oldest, Longest, Shortest

**Design Decision**: Use a special Collection type rather than a separate data structure.

**Rationale**: Leverages existing Collection infrastructure (permissions, navigation, search). Users can apply familiar document operations (move, delete, share).

### 5. Audio Document Component

**Purpose**: Document view optimized for audio content

**Location**: `app/scenes/Document/AudioDocument.tsx`

**Data Model Extensions**:
```typescript
interface AudioDocumentMetadata {
  sourceType: 'recording' | 'upload' | 'url';
  duration?: number; // in seconds
  originalFilename?: string;
  sourceUrl?: string;
  markers?: Array<{ timestamp: number; label?: string }>;
  aiArchiveSuggestion?: {
    suggestions: Array<{
      targetId: string; // Collection or Document ID
      targetType: 'collection' | 'document';
      targetName: string;
      reason: string;
      confidence: number;
    }>;
    status: 'pending' | 'accepted' | 'dismissed';
    acceptedSuggestionId?: string;
  };
}
```

**Key Features**:
- Inline title editing
- Description field
- Audio player with waveform
- Transcript section with markers
- AI Archive Suggestion card (when available)
- Processing status indicator

**Design Decision**: Extend Document model with metadata rather than creating a separate AudioDocument model.

**Rationale**: Maintains compatibility with existing document features (search, sharing, versioning). Audio documents can evolve into regular documents after archiving.

### 6. Upload Queue Component

**Purpose**: Manages batch upload of audio/video files

**Location**: `app/components/UploadQueue/UploadQueue.tsx`

**State Interface**:
```typescript
interface UploadQueueItem {
  id: string;
  file: File;
  documentId?: string;
  status: 'pending' | 'uploading' | 'extracting' | 'transcribing' | 'completed' | 'failed';
  progress: number; // 0-100
  error?: string;
}

interface UploadQueueState {
  items: UploadQueueItem[];
  concurrencyLimit: 3;
}
```

**Key Features**:
- Display all queued files with status
- Progress indicators for each file
- Retry button for failed uploads
- Cancel button for pending/uploading items
- Summary notification on completion
- Sequential processing with concurrency limit

**Design Decision**: Process uploads sequentially with a concurrency limit of 3.

**Rationale**: Prevents overwhelming the transcription service. Provides predictable resource usage. Users can see clear progress through the queue.

### 7. URL Import Dialog Component

**Purpose**: Import audio from external URLs

**Location**: `app/components/URLImportDialog/URLImportDialog.tsx`

**Props Interface**:
```typescript
interface URLImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (urls: string[]) => void;
}
```

**Key Features**:
- Text input for single or multiple URLs (one per line)
- URL validation and metadata extraction
- Preview card with title, duration, thumbnail
- Support for YouTube, Vimeo, podcasts, direct links
- Batch import capability

**Design Decision**: Use a third-party service (e.g., yt-dlp, youtube-dl) for URL extraction rather than building custom extractors.

**Rationale**: Maintains compatibility with many platforms. Reduces maintenance burden. Handles format changes automatically through service updates.

### 8. AI Archive Suggestion Service

**Purpose**: Analyze transcript and suggest organization locations

**Location**: `server/services/AIArchiveSuggestionService.ts`

**Interface**:
```typescript
interface AIArchiveSuggestionService {
  analyzeTranscript(params: {
    documentId: string;
    transcript: string;
    userId: string;
  }): Promise<AIArchiveSuggestion>;
}

interface AIArchiveSuggestion {
  suggestions: Array<{
    targetId: string;
    targetType: 'collection' | 'document';
    targetName: string;
    reason: string;
    confidence: number;
  }>;
  suggestedTitle?: string;
  topics: string[];
  documentType: 'meeting' | 'interview' | 'note' | 'lecture' | 'other';
}
```

**Algorithm**:
1. Extract key topics and entities from transcript using LLM
2. Search user's Collections and Documents for semantic matches
3. Rank matches by relevance score
4. Generate human-readable explanations for top 3 suggestions
5. Optionally suggest improved title based on content

**Design Decision**: Use the existing AI service infrastructure (OpenAI/Anthropic) rather than a specialized model.

**Rationale**: Leverages existing API integrations. Provides high-quality natural language understanding. Can generate contextual explanations.

**Prompt Template**:
```
Analyze this transcript and suggest where to archive it:

Transcript: {transcript}

User's Collections: {collections}
Recent Documents: {recentDocuments}

Provide:
1. Top 3 archive locations with reasons
2. Suggested title (if current title is generic)
3. Main topics discussed
4. Document type classification

Format as JSON.
```

## Data Models

### TranscriptionJob Model

**Location**: `server/models/TranscriptionJob.ts`

```typescript
interface TranscriptionJob {
  id: string;
  documentId: string;
  userId: string;
  teamId: string;
  sourceType: 'recording' | 'upload' | 'url';
  sourceUrl?: string; // For URL imports
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  audioAttachmentId: string;
  transcriptText?: string;
  metadata: {
    duration?: number;
    language?: string;
    markers?: Array<{ timestamp: number; label?: string }>;
    originalFilename?: string;
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
```

### AudioInbox Collection

Auto-created on first use with these properties:
```typescript
{
  name: 'Audio Inbox', // Localized
  type: 'audio-inbox',
  icon: 'inbox',
  private: true,
  userId: string,
  teamId: string,
}
```

### IndexedDB Schema for Recovery

**Database**: `outline-audio-recovery`

**Object Store**: `recording-chunks`

```typescript
interface RecordingChunk {
  sessionId: string; // UUID for this recording session
  documentId: string;
  chunkIndex: number;
  blob: Blob;
  timestamp: number;
  duration: number; // Cumulative duration at this chunk
}
```

## API Endpoints

### POST /api/audio/start-recording

Creates Audio Document and returns ID for recording session.

**Request**:
```typescript
{
  title?: string;
}
```

**Response**:
```typescript
{
  documentId: string;
  sessionId: string;
  audioInboxId: string;
}
```

### POST /api/audio/stop-recording

Finalizes recording and creates transcription job.

**Request**:
```typescript
{
  documentId: string;
  sessionId: string;
  audioBlob: Blob; // multipart/form-data
  markers?: Array<{ timestamp: number; label?: string }>;
}
```

**Response**:
```typescript
{
  transcriptionJobId: string;
  attachmentId: string;
}
```

### POST /api/audio/upload

Handles file uploads.

**Request**: multipart/form-data with files

**Response**:
```typescript
{
  jobs: Array<{
    documentId: string;
    transcriptionJobId: string;
    filename: string;
  }>;
}
```

### POST /api/audio/import-url

Imports audio from URL.

**Request**:
```typescript
{
  urls: string[];
}
```

**Response**:
```typescript
{
  jobs: Array<{
    documentId: string;
    transcriptionJobId: string;
    url: string;
    metadata?: {
      title: string;
      duration: number;
      thumbnail: string;
    };
  }>;
}
```

### GET /api/audio/transcription-status/:jobId

Polls transcription status.

**Response**:
```typescript
{
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}
```

### POST /api/audio/archive-suggestion

Generates AI archive suggestions.

**Request**:
```typescript
{
  documentId: string;
}
```

**Response**:
```typescript
{
  suggestions: Array<{
    targetId: string;
    targetType: 'collection' | 'document';
    targetName: string;
    reason: string;
    confidence: number;
  }>;
  suggestedTitle?: string;
  topics: string[];
  documentType: string;
}
```

### POST /api/audio/accept-suggestion

Moves document to suggested location.

**Request**:
```typescript
{
  documentId: string;
  targetId: string;
  targetType: 'collection' | 'document';
}
```

**Response**:
```typescript
{
  success: boolean;
  newLocation: {
    collectionId: string;
    parentDocumentId?: string;
  };
}
```

## Error Handling

### Recording Errors

1. **Microphone Permission Denied**
   - Display: "Microphone access required to record"
   - Action: Show browser-specific instructions to enable permission
   - Fallback: Offer Upload or URL Import options

2. **Browser Crash During Recording**
   - Detection: Check IndexedDB on app load
   - Display: "Recover incomplete recording from {time}?"
   - Action: Reconstruct audio from chunks or discard

3. **Storage Quota Exceeded**
   - Display: "Not enough storage space for recording"
   - Action: Prompt user to free up space or stop recording
   - Prevention: Check available quota before starting

### Transcription Errors

1. **Service Unavailable**
   - Display: "Transcription service temporarily unavailable"
   - Action: Retry button with exponential backoff
   - Fallback: Queue job for later processing

2. **Unsupported Audio Format**
   - Display: "Audio format not supported"
   - Action: Attempt conversion to supported format
   - Fallback: Allow manual download of audio file

3. **Transcription Timeout**
   - Display: "Transcription taking longer than expected"
   - Action: Continue processing in background, notify when complete
   - Threshold: 5 minutes for recordings, 15 minutes for uploads

### URL Import Errors

1. **Invalid URL**
   - Display: "Unable to extract audio from this URL"
   - Action: Show supported platforms list
   - Fallback: Suggest manual download and upload

2. **Geo-Restricted Content**
   - Display: "Content not available in your region"
   - Action: Explain limitation
   - Fallback: Suggest VPN or manual download

3. **Copyright Protected**
   - Display: "Unable to access protected content"
   - Action: Respect copyright restrictions
   - Fallback: None

### AI Suggestion Errors

1. **AI Service Unavailable**
   - Display: "Archive suggestions temporarily unavailable"
   - Action: Allow manual organization
   - Fallback: Keep document in Audio Inbox

2. **No Relevant Matches Found**
   - Display: "No similar collections found. Keep in Inbox or create new collection?"
   - Action: Offer manual organization options
   - Fallback: Provide generic suggestions based on document type

## State Management

### AudioRecorderStore

**Location**: `app/stores/AudioRecorderStore.ts`

**State**:
```typescript
class AudioRecorderStore {
  // Current recording session
  activeSession: {
    documentId: string;
    sessionId: string;
    startTime: number;
    isPaused: boolean;
    markers: Array<{ timestamp: number; label?: string }>;
  } | null;

  // Global recording control visibility
  isMinimized: boolean;

  // Real-time transcription
  realtimeTranscript: string;

  // Actions
  startRecording(documentId: string): Promise<void>;
  pauseRecording(): void;
  resumeRecording(): void;
  stopRecording(): Promise<void>;
  cancelRecording(): Promise<void>;
  addMarker(label?: string): void;
  minimizeStudio(): void;
  reopenStudio(): void;
}
```

### TranscriptionJobsStore

**Location**: `app/stores/TranscriptionJobsStore.ts`

**State**:
```typescript
class TranscriptionJobsStore {
  jobs: Map<string, TranscriptionJob>;
  
  // Actions
  createJob(params: CreateJobParams): Promise<TranscriptionJob>;
  pollJobStatus(jobId: string): void;
  retryJob(jobId: string): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
  
  // Computed
  get activeJobs(): TranscriptionJob[];
  get completedJobs(): TranscriptionJob[];
  get failedJobs(): TranscriptionJob[];
}
```

### AudioInboxStore

**Location**: `app/stores/AudioInboxStore.ts`

**State**:
```typescript
class AudioInboxStore {
  inboxCollection: Collection | null;
  
  // Actions
  ensureInboxExists(): Promise<Collection>;
  getInboxDocuments(options?: FilterOptions): Promise<Document[]>;
  moveDocumentFromInbox(documentId: string, targetId: string, targetType: 'collection' | 'document'): Promise<void>;
  
  // Computed
  get unarchived Count(): number;
  get recentDocuments(): Document[];
}
```

## Testing Strategy

### Unit Tests

1. **AudioRecorderStore**
   - Test recording state transitions
   - Test marker creation
   - Test minimize/reopen behavior
   - Mock Web Audio API

2. **TranscriptionJobsStore**
   - Test job creation and polling
   - Test retry logic with exponential backoff
   - Test concurrent job limits
   - Mock API responses

3. **AI Archive Suggestion Service**
   - Test suggestion generation with various transcript types
   - Test ranking algorithm
   - Test edge cases (no collections, no matches)
   - Mock LLM responses

4. **IndexedDB Recovery**
   - Test chunk storage and retrieval
   - Test audio reconstruction from chunks
   - Test cleanup of old chunks
   - Mock IndexedDB

### Integration Tests

1. **Recording Flow**
   - Start recording → pause → resume → stop
   - Verify Audio Document created in Audio Inbox
   - Verify TranscriptionJob created
   - Verify audio saved as Attachment

2. **Upload Flow**
   - Upload multiple files
   - Verify queue processing with concurrency limit
   - Verify documents created for each file
   - Verify transcription jobs created

3. **URL Import Flow**
   - Import YouTube URL
   - Verify metadata extraction
   - Verify audio download
   - Verify transcription

4. **Archive Suggestion Flow**
   - Complete transcription
   - Verify AI analysis triggered
   - Verify suggestions displayed
   - Accept suggestion and verify document moved

### End-to-End Tests

1. **Complete Recording Journey**
   - Navigate to Audio Hub
   - Start recording
   - Navigate to another page (verify Global Recording Control)
   - Return to Recording Studio
   - Stop recording
   - Wait for transcription
   - Accept archive suggestion
   - Verify document in target location

2. **Batch Upload Journey**
   - Upload 5 audio files
   - Monitor processing queue
   - Verify all transcriptions complete
   - Review AI suggestions for each
   - Archive multiple documents

3. **Mobile Recording**
   - Test on mobile viewport
   - Verify responsive layout
   - Test touch gestures
   - Verify screen sleep prevention

### Performance Tests

1. **Long Recording Handling**
   - Record for 60+ minutes
   - Verify chunk saving to IndexedDB
   - Verify memory usage stays reasonable
   - Verify transcription completes

2. **Large File Upload**
   - Upload 500MB video file
   - Verify progress tracking
   - Verify audio extraction
   - Verify transcription

3. **Concurrent Transcriptions**
   - Queue 10 transcription jobs
   - Verify concurrency limit respected
   - Verify all jobs complete
   - Monitor server resource usage

## Security Considerations

1. **Audio Inbox Privacy**
   - Audio Inbox is always private to the user
   - Cannot be shared or made public
   - Documents can be moved to shared collections after archiving

2. **Microphone Permission**
   - Request permission only when user initiates recording
   - Clearly explain why permission is needed
   - Respect user's denial

3. **URL Import Validation**
   - Validate URLs before processing
   - Sanitize extracted metadata
   - Respect robots.txt and copyright
   - Rate limit URL imports to prevent abuse

4. **Transcription Data**
   - Transcripts stored with same permissions as documents
   - Audio files stored as regular attachments
   - No transcription data sent to third parties without consent

5. **IndexedDB Security**
   - Recording chunks stored locally only
   - Cleared after successful upload
   - Encrypted if browser supports it

## Accessibility

1. **Keyboard Navigation**
   - All recording controls accessible via keyboard
   - Keyboard shortcut to start recording (Cmd/Ctrl+R)
   - Keyboard shortcut to stop recording (Cmd/Ctrl+S)
   - Tab navigation through all interactive elements

2. **Screen Reader Support**
   - Announce recording status changes
   - Announce transcription progress
   - Label all buttons and controls
   - Provide text alternatives for visual indicators

3. **Visual Indicators**
   - High contrast recording indicator
   - Clear visual feedback for all actions
   - Progress indicators for long operations
   - Error messages with clear instructions

4. **Mobile Accessibility**
   - Touch targets minimum 44x44px
   - Swipe gestures optional, not required
   - Voice control compatible
   - Works with mobile screen readers

## Internationalization

1. **UI Strings**
   - All UI text externalized to i18n files
   - Audio Inbox name localized
   - Error messages localized
   - AI suggestions in user's language

2. **Transcription Language**
   - Auto-detect language from audio
   - Allow manual language selection
   - Support multiple languages in same recording
   - Preserve language metadata

3. **Date/Time Formatting**
   - Use user's locale for timestamps
   - Duration formatting (MM:SS vs HH:MM:SS)
   - Relative time ("2 hours ago")

## Performance Optimization

1. **Waveform Rendering**
   - Use Canvas API for efficient rendering
   - Downsample audio data for visualization
   - Update at 30fps maximum
   - Throttle updates during navigation

2. **Real-time Transcription**
   - Buffer transcript updates (500ms)
   - Limit displayed text to recent 20 seconds
   - Use virtual scrolling for long transcripts

3. **Upload Queue**
   - Stream large files instead of loading into memory
   - Process files in chunks
   - Use Web Workers for audio extraction
   - Implement resumable uploads

4. **IndexedDB Optimization**
   - Store chunks in compressed format
   - Batch writes every 10 seconds
   - Clean up old data on app start
   - Limit total storage to 500MB

5. **AI Suggestion Caching**
   - Cache suggestions in document metadata
   - Don't regenerate on every view
   - Invalidate cache if user's collections change significantly

## Migration Strategy

### Phase 1: Core Infrastructure (Week 1-2)
- Create AudioInboxStore and ensure inbox creation
- Implement TranscriptionJob model and API
- Set up basic transcription service integration
- Create Audio Document metadata schema

### Phase 2: Recording Experience (Week 3-4)
- Build Recording Studio component
- Implement Web Audio API integration
- Add Global Recording Control
- Implement IndexedDB recovery system

### Phase 3: Upload & Import (Week 5-6)
- Build Upload Queue component
- Implement file upload handling
- Build URL Import dialog
- Integrate audio extraction service

### Phase 4: AI Features (Week 7-8)
- Implement AI Archive Suggestion service
- Build suggestion UI components
- Add real-time transcription (if supported)
- Implement marker system

### Phase 5: Audio Hub & Polish (Week 9-10)
- Build Audio Hub landing page
- Implement search and filtering
- Add mobile responsive design
- Performance optimization and testing

### Phase 6: Launch Preparation (Week 11-12)
- End-to-end testing
- Documentation
- User onboarding flow
- Gradual rollout to users

## Open Questions

1. **Transcription Service Selection**
   - Which service to use? (Whisper, AssemblyAI, Deepgram, Rev.ai)
   - Self-hosted vs API service?
   - Cost implications for large audio files?
   - **Recommendation**: Start with Whisper API (OpenAI) for consistency with existing AI features, evaluate alternatives based on cost/quality

2. **Real-time Transcription**
   - Is streaming transcription worth the complexity?
   - Which services support it?
   - Fallback behavior if not available?
   - **Recommendation**: Make it optional, implement only if transcription service supports it natively

3. **Audio Storage**
   - Store original audio files permanently or delete after transcription?
   - Storage limits per user/team?
   - Compression strategy?
   - **Recommendation**: Keep original audio as attachments, apply existing attachment storage limits, use lossy compression for long recordings

4. **Default Landing Page**
   - Make Audio Hub default for all users or just new users?
   - Provide user preference to choose landing page?
   - **Recommendation**: New users see Audio Hub by default, existing users keep current behavior, add preference in settings

5. **Mobile App Integration**
   - Should this work in mobile browsers or require native app?
   - Background recording support?
   - **Recommendation**: Start with mobile web, evaluate native app features based on user feedback

