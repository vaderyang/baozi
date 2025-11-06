# Implementation Plan

- [x] 1. Set up core data models and API infrastructure
  - Create TranscriptionJob model with fields: id, documentId, userId, teamId, sourceType, status, progress, audioAttachmentId, transcriptText, metadata, error, timestamps
  - Create API endpoint POST /api/audio/start-recording that creates an Audio Document in Audio Inbox and returns documentId and sessionId
  - Create API endpoint POST /api/audio/stop-recording that accepts audio blob, creates attachment, and creates TranscriptionJob
  - Add audioMetadata field to Document model to store sourceType, duration, markers, aiArchiveSuggestion
  - _Requirements: 1.1, 4_

- [x] 2. Implement Audio Inbox Collection
  - [x] 2.1 Create AudioInboxStore with ensureInboxExists(), getInboxDocuments(), moveDocumentFromInbox() methods
    - Auto-create Audio Inbox Collection on first use with type 'audio-inbox', private: true, special inbox icon
    - Implement computed properties: unarchivedCount, recentDocuments
    - _Requirements: 1.1, 6_
  
  - [x] 2.2 Create Audio Inbox UI view
    - Build collection view with special inbox icon and count badge
    - Display documents in reverse chronological order with compact card layout
    - Show title, recording date, duration, transcription status for each document
    - Add "New Recording" button at top
    - _Requirements: 6, 10_
  
  - [x] 2.3 Add search and filter functionality
    - Implement search input matching title and Summary text
    - Add filter options: All, Transcribing, Ready to Archive
    - Add sort options: Newest First, Oldest First, Longest Duration, Shortest Duration
    - Preserve search/filter state on navigation
    - _Requirements: 12_

- [x] 3. Build Recording Studio interface
  - [x] 3.1 Create AudioRecorderStore
    - Implement state: activeSession (documentId, sessionId, startTime, isPaused, markers), isMinimized, realtimeTranscript
    - Implement actions: startRecording(), pauseRecording(), resumeRecording(), stopRecording(), cancelRecording(), addMarker(), minimizeStudio(), reopenStudio()
    - Integrate Web Audio API for audio capture
    - _Requirements: 2, 3_
  
  - [x] 3.2 Build Recording Studio component
    - Create full-screen/dedicated recording interface at app/scenes/RecordingStudio/RecordingStudio.tsx
    - Add large waveform visualization using Web Audio API and Canvas
    - Display real-time transcript. Optimize for multiple speaker.
    - Display speaker status. (words statistics, even mood detection, character/power analysis with AI)
    - Display real-time duration counter (MM:SS format, updated every second)
    - Add control buttons: Pause/Resume, Stop, Cancel, Mark, Minimize
    - Add optional title input field with placeholder "Untitled Recording", if there is defined title, use AI regarding summary text to generate Title eventually.
    - Show visual recording indicator (pulsing red dot)
    - _Requirements: 2, 7_
  
  - [x] 3.3 Reuse current Global Recording Control
    - Create floating UI component at app/components/GlobalRecordingControl.tsx
    - Position at bottom-right corner, show recording icon and duration
    - Make clickable to reopen Recording Studio
    - Add hover/right-click Stop action
    - Ensure visibility across all pages
    - _Requirements: 3_
  
  - [x] 3.4 Add IndexedDB recovery system
    - Create IndexedDB database 'outline-audio-recovery' with 'recording-chunks' object store
    - Save audio chunks every 10 seconds during recording
    - Detect incomplete recordings on app load
    - Display recovery notification with "Recover" and "Discard" options
    - Reconstruct audio from chunks on recovery
    - Auto-cleanup chunks older than 7 days
    - _Requirements: 11_

- [ ] 4. Integrate with existing transcription infrastructure
  - [ ] 4.1 Review existing transcription system
    - Note: TranscriptionJob model already exists with status, progress, error, result fields
    - Note: API endpoints already exist: transcriptions.create, transcriptions.info, transcriptions.retry, transcriptions.cancel, transcriptions.list
    - Note: TranscriptionTask already handles background processing with retry logic and WebSocket events
    - Note: Transcription endpoint configurable via team preferences (TeamPreference.TranscriptionEndpoint)
    - Verify existing system works correctly with audio attachments
    - _Requirements: 4_
  
  - [ ] 4.2 Build TranscriptionJobsStore for frontend
    - Create app/stores/TranscriptionJobsStore.ts
    - Implement state: jobs Map<stic (exponescriptionJob>
    - Implement actions: createJob() calling transcriptions.create API, pollJobStatus() calling transcriptions.info, retryJob() calling transcriptions.retry, cancelJob() calling transcriptions.cancel
    - Add computed properties: activeJobs, completedJobs, failedJobs
    - Subscribe to WebSocket 'transcription:status' events for real-time updates
    - _Requirements: 4, 16_
  
  - [ ] 4.3 Create Audio Document view with transcript display
    - Extend document view to display audio player with waveform
    - Show transcript section with "## Transcript" heading using result.text from TranscriptionJob
    - Display speaker segments if available (result.speakerSegments with spk, text, timestamps)
    - Display processing status indicator during transcription (status: queued/processing)
    - Show error message with "Retry" button on failure (status: failed)
    - Auto-refresh view when transcription completes via WebSocket event
    - _Requirements: 4, 7_
  
  - [ ] 4.4 Wire Recording Studio to transcription API
    - After recording stops, upload audio as Attachment
    - Call transcriptions.create API with attachmentId and documentId
    - Store returned jobId in recording session
    - Transition to "Processing" view showing transcription progress
    - Poll or listen to WebSocket for job status updates
    - _Requirements: 4_

- [ ] 5. Build AI Archive Suggestion feature
  - [ ] 5.1 Create AI Archive Suggestion Service
    - Create server/services/AIArchiveSuggestionService.ts
    - Implement analyzeTranscript() method using existing AI service (OpenAI/Anthropic)
    - Extract key topics, entities, and document type from transcript
    - Search user's Collections and Documents for semantic matches
    - Rank matches and generate top 3 suggestions with explanations
    - Optionally suggest improved title based on content
    - _Requirements: 5_
  
  - [ ] 5.2 Create API endpoints for archive suggestions
    - Create POST /api/audio/archive-suggestion endpoint
    - Create POST /api/audio/accept-suggestion endpoint that moves document to target location
    - Store suggestions in Audio Document metadata
    - _Requirements: 5_
  
  - [ ] 5.3 Build AI Archive Suggestion UI component
    - Create suggestion card component displayed at top of Audio Document
    - Show up to 3 suggestions with target name, reason, and confidence
    - Add action buttons: "Move Here", "Create New Collection", "Keep in Inbox", "Dismiss"
    - Handle "Move Here" action to move document to suggested location
    - Handle "Create New Collection" with name prompt
    - Update suggestion status in metadata
    - _Requirements: 5_

- [ ] 6. Create Audio Hub landing page
  - [ ] 6.1 Build Audio Hub component
    - Create app/scenes/AudioHub/AudioHub.tsx
    - Display prominent heading "Capture Audio, Create Knowledge"
    - Create three primary action cards: Record Audio, Upload Files, Import from URL
    - Each card shows icon, title, and description
    - Add "Recent Recordings" section showing last 5 documents from Audio Inbox
    - Add "Processing" section for active transcription jobs
    - Add quick link to full Audio Inbox
    - _Requirements: 1, 16_
  
  - [ ] 6.2 Wire up Audio Hub actions
    - Connect "Record Audio" to start recording flow (create document, open Recording Studio)
    - Connect "Upload Files" to open file picker
    - Connect "Import from URL" to open URL import dialog
    - _Requirements: 1, 1.1_
  
  - [ ] 6.3 Add Audio Hub to navigation
    - Add "Audio Hub" menu item with microphone icon
    - Make Audio Hub default landing page for new users (configurable)
    - _Requirements: 1_

- [ ] 7. Implement file upload functionality
  - [ ] 7.1 Create Upload Queue component
    - Create app/components/UploadQueue/UploadQueue.tsx
    - Implement state: items array with id, file, documentId, status, progress, error
    - Display all queued files with status indicators
    - Show progress bars for each file
    - Add retry button for failed uploads, cancel button for pending items
    - Process files sequentially with concurrency limit of 3
    - _Requirements: 14_
  
  - [ ] 7.2 Create file upload API endpoint
    - Create POST /api/audio/upload endpoint accepting multipart/form-data
    - Support audio formats: mp3, wav, m4a, webm, ogg, flac
    - Support video formats: mp4, mov, avi, mkv (extract audio)
    - Create Audio Document in Audio Inbox for each file
    - Set document title to filename (without extension)
    - Create TranscriptionJob with sourceType 'upload'
    - Return array of jobs with documentId, transcriptionJobId, filename
    - _Requirements: 14_
  
  - [ ] 7.3 Add drag-and-drop support
    - Add drag-and-drop zone to Audio Hub
    - Display drop zone overlay "Drop files to transcribe" when files dragged over
    - Handle dropped files same as file picker selection
    - _Requirements: 14_

- [ ] 8. Build URL Import feature
  - [ ] 8.1 Create URL Import Dialog component
    - Create app/components/URLImportDialog/URLImportDialog.tsx
    - Add text input for single or multiple URLs (one per line)
    - Show placeholder "Paste YouTube, podcast, or video URL"
    - Display example URLs below input
    - Add URL validation
    - Show preview card with extracted title, duration, thumbnail
    - Add "Confirm Import" button
    - Support batch import (multiple URLs)
    - _Requirements: 15_
  
  - [ ] 8.2 Create URL import API endpoint
    - Create POST /api/audio/import-url endpoint
    - Integrate yt-dlp or similar service for URL extraction
    - Support YouTube, Vimeo, podcast RSS, direct audio/video URLs
    - Extract metadata: title, duration, thumbnail
    - Create Audio Document in Audio Inbox
    - Create TranscriptionJob with sourceType 'url'
    - Download/extract audio in background
    - Return array of jobs with documentId, transcriptionJobId, url, metadata
    - _Requirements: 15_
  
  - [ ] 8.3 Handle URL import errors
    - Display error "Unable to extract audio from this URL" for invalid URLs
    - Show supported platforms list
    - Handle geo-restricted and copyright-protected content with appropriate messages
    - _Requirements: 15_

- [ ] 9. Add marker functionality
  - [ ] 9.1 Implement marker creation in Recording Studio
    - Add "Mark" button to Recording Studio controls
    - Record timestamp when user clicks "Mark"
    - Store markers in TranscriptionJob metadata
    - Display markers in Recording Studio UI
    - User can input note mannully
    - _Requirements: 9_
  
  - [ ] 9.2 Display markers in transcript
    - Show markers as inline badges or highlights at corresponding text positions
    - Add "Jump to Marker" navigation feature
    - Scroll to marker position when clicked
    - _Requirements: 9_

- [ ] 10. Implement responsive design for mobile
  - [ ] 10.1 Make Recording Studio mobile-responsive
    - Use responsive design for screen sizes 320px to 1920px
    - Stack controls vertically on mobile (< 768px width)
    - Optimize waveform visualization for smaller screens
    - Support touch gestures for pause/resume
    - Prevent screen sleep during recording on mobile
    - _Requirements: 13_
  
  - [ ] 10.2 Make Audio Hub mobile-responsive
    - Adapt action cards layout for mobile screens
    - Ensure touch targets are minimum 44x44px
    - Test on mobile browsers
    - _Requirements: 13_
  
  - [ ] 10.3 Position Global Recording Control for mobile
    - Position at bottom center on mobile devices
    - Ensure doesn't interfere with mobile navigation
    - _Requirements: 13_

- [ ]* 11. Add keyboard shortcuts and accessibility
  - Add keyboard shortcut Cmd/Ctrl+R to start recording
  - Add keyboard shortcut Cmd/Ctrl+S to stop recording
  - Ensure all controls accessible via keyboard (tab navigation)
  - Add ARIA labels to all buttons and controls
  - Announce recording status changes for screen readers
  - Announce transcription progress for screen readers
  - Ensure high contrast recording indicator
  - _Requirements: All (accessibility)_

- [ ]* 12. Implement real-time transcription (optional)
  - Check if transcription service supports streaming transcription
  - Add "Real-time Transcription" panel to Recording Studio
  - Display transcribed text as it becomes available
  - Show most recent 10-20 seconds of text
  - Mark as "Preview" or "Draft"
  - Buffer updates (500ms) for performance
  - _Requirements: 8_

- [ ]* 13. Add internationalization support
  - Externalize all UI strings to i18n files
  - Localize Audio Inbox name
  - Localize error messages
  - Auto-detect transcription language from audio
  - Allow manual language selection
  - Format dates/times using user's locale
  - _Requirements: All (i18n)_

- [ ]* 14. Performance optimization
  - Optimize waveform rendering with Canvas API (30fps max)
  - Implement virtual scrolling for long transcripts
  - Stream large file uploads instead of loading into memory
  - Use Web Workers for audio extraction
  - Compress IndexedDB chunks
  - Cache AI suggestions in document metadata
  - _Requirements: All (performance)_

- [ ]* 15. Write integration tests
  - Test complete recording flow: start → pause → resume → stop
  - Test upload flow with multiple files
  - Test URL import flow with YouTube URL
  - Test archive suggestion flow: transcription → AI analysis → accept suggestion
  - Test IndexedDB recovery after browser crash
  - _Requirements: All_

- [ ]* 16. Write end-to-end tests
  - Test complete recording journey from Audio Hub to archive
  - Test batch upload journey with 5 files
  - Test mobile recording on mobile viewport
  - Test concurrent transcription jobs
  - _Requirements: All_
