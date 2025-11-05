# Implementation Plan

This document outlines the step-by-step implementation tasks for the global audio recording feature. Each task builds incrementally on previous tasks and references specific requirements from the requirements document.

## Task List

- [x] 1. Set up core infrastructure and state management
  - Create AudioRecorderStore with MobX for global recording state management
  - Implement state properties: isRecording, isPaused, startTime, sourceDocumentId, insertionPoint, audioChunks, mediaRecorder, mediaStream
  - Implement actions: startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording
  - Implement computed properties: duration, isActive, canRecord
  - Add AudioRecorderStore to RootStore
  - _Requirements: 9.1, 9.2, 9.3, 9.5_

- [x] 2. Implement audio recording hook with MediaRecorder API
  - [x] 2.1 Create useAudioRecorder hook with MediaRecorder lifecycle management
    - Implement browser support detection for MediaRecorder API
    - Implement codec selection logic (prefer audio/webm, audio/mp4, audio/wav)
    - Request microphone permission using getUserMedia
    - Initialize MediaRecorder with selected codec
    - Handle permission denied and not supported errors
    - _Requirements: 1.2, 1.3, 8.1, 8.2, 8.4_
  
  - [x] 2.2 Implement audio chunk collection and blob generation
    - Set up ondataavailable handler to collect audio chunks
    - Implement onstop handler to create final audio blob
    - Store chunks in AudioRecorderStore
    - Handle recording errors with onerror handler
    - _Requirements: 1.6, 3.4_
  
  - [x] 2.3 Implement pause and resume functionality
    - Add pause() method to pause MediaRecorder
    - Add resume() method to resume MediaRecorder
    - Track paused duration for accurate time calculation
    - Update store state on pause/resume
    - _Requirements: 2.8, 2.9_
  
  - [x] 2.4 Implement audio waveform data generation
    - Create AudioContext and AnalyserNode for real-time audio analysis
    - Connect microphone stream to analyser
    - Generate frequency data using getByteFrequencyData
    - Update waveform data at 30 FPS using requestAnimationFrame
    - Stop waveform updates when paused
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
  
  - [x] 2.5 Implement resource cleanup
    - Stop all media tracks on cancel or stop
    - Close AudioContext
    - Clear audio chunks from memory
    - Remove event listeners
    - Reset store state
    - _Requirements: 5.6, 9.4_

- [x] 3. Create AudioWaveform visualization component
  - Create AudioWaveform component with canvas-based rendering
  - Implement real-time waveform drawing from frequency data
  - Display last 100 samples as vertical bars
  - Update at 30 FPS for smooth animation
  - Show flat line when no audio detected
  - Freeze visualization when paused
  - Style with theme colors
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 4. Implement RecordingPlaceholderCard component
  - [x] 4.1 Create RecordingPlaceholderCard React component
    - Design card layout with status, duration, waveform, and buttons
    - Display recording status (Recording, Paused, Uploading, Transcribing, Error)
    - Show duration in MM:SS format, updated every second
    - Integrate AudioWaveform component
    - Add Pause/Continue button (toggle based on state)
    - Add Stop button
    - Add Cancel button
    - Style with pulsing red indicator for recording state
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 7.1, 7.2_
  
  - [x] 4.2 Implement button handlers
    - Connect Pause button to AudioRecorderStore.pauseRecording
    - Connect Continue button to AudioRecorderStore.resumeRecording
    - Connect Stop button to stop and upload flow
    - Connect Cancel button to AudioRecorderStore.cancelRecording with confirmation
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9, 5.1_
  
  - [x] 4.3 Implement upload and transcription status display
    - Show "Uploading..." status with progress indicator
    - Show "Transcribing..." status with animated indicator
    - Show error state with "Transcription failed" and Retry button
    - Display error message from transcription service
    - _Requirements: 7.3, 7.4, 7.6_
  
  - [x] 4.4 Add warning for long recordings
    - Display warning icon when duration exceeds 60 minutes
    - Show tooltip with warning message
    - _Requirements: 7.7_

- [x] 5. Integrate RecordingPlaceholderCard into ProseMirror editor
  - [x] 5.1 Create custom ProseMirror node type for recording placeholder
    - Define recordingPlaceholder node spec with attrs: nodeId, status, startTime
    - Set node as atom and block group
    - Implement parseDOM and toDOM methods
    - Add node to editor schema
    - _Requirements: 2.1, 2.11_
  
  - [x] 5.2 Implement ProseMirror NodeView for RecordingPlaceholderCard
    - Create RecordingPlaceholderView class implementing NodeView interface
    - Render RecordingPlaceholderCard React component in NodeView
    - Connect NodeView to AudioRecorderStore for reactive updates
    - Implement update method to re-render on state changes
    - Implement destroy method to cleanup React component
    - _Requirements: 2.10, 2.11, 3.5_
  
  - [x] 5.3 Implement insertion point tracking
    - Store ProseMirror position when recording starts
    - Generate unique nodeId for placeholder
    - Create InsertionPoint object with documentId, position, nodeId
    - Store in AudioRecorderStore
    - Persist insertion point across document navigation
    - _Requirements: 1.7, 3.3, 9.6_

- [x] 6. Add recording option to slash command menu
  - [x] 6.1 Update SuggestionsMenu to include recording option
    - Add "Start Recording" option to /transcript command menu
    - Keep existing "Upload Audio" option
    - Show recording option only if MediaRecorder is supported
    - _Requirements: 1.1, 8.2_
  
  - [x] 6.2 Implement recording start flow from slash command
    - Get current cursor position from editor state
    - Call AudioRecorderStore.startRecording with documentId and position
    - Insert recordingPlaceholder node at cursor position
    - Handle permission request and errors
    - Show error toast if permission denied or not supported
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [ ] 7. Create GlobalRecorderController component
  - [x] 7.1 Create GlobalRecorderController React component
    - Design floating controller UI (bottom-right position)
    - Display recording status (Recording/Paused) with pulsing indicator
    - Show duration in MM:SS format
    - Display source document title
    - Add "View Document" button to navigate back to source
    - Add "Stop" button
    - Add "Cancel" button
    - Style with high z-index and shadow for visibility
    - _Requirements: 3.2, 3.3_
  
  - [x] 7.2 Implement conditional visibility logic
    - Show controller only when recording is active AND user is not on source document
    - Hide controller when user is on source document
    - Use observer pattern to react to document navigation
    - _Requirements: 2.12, 2.13, 3.8_
  
  - [x] 7.3 Implement navigation to source document
    - Add click handler for "View Document" button
    - Use router to navigate to source document
    - Scroll to recording placeholder if needed
    - _Requirements: 3.4_

- [x] 8. Integrate GlobalRecorderController into application layout
  - Add GlobalRecorderController to Layout component
  - Position as fixed element above all content
  - Connect to AudioRecorderStore for state
  - Ensure it renders on all pages when recording is active
  - _Requirements: 3.1, 3.2_

- [x] 9. Implement stop recording and upload flow
  - [x] 9.1 Implement stop recording logic
    - Stop MediaRecorder and collect final audio blob
    - Update placeholder card status to "Uploading..."
    - Release microphone and cleanup resources
    - _Requirements: 4.1, 4.2_
  
  - [x] 9.2 Implement audio upload
    - Create File object from audio blob with appropriate name and type
    - Use existing uploadFile utility with AttachmentPreset.AudioTranscription
    - Show upload progress in placeholder card
    - Handle upload errors with retry option
    - _Requirements: 4.3, 10.1, 10.2_
  
  - [x] 9.3 Implement transcription API call
    - Call existing POST /api/transcriptions.create with attachmentId
    - Update placeholder card status to "Transcribing..."
    - Handle transcription errors with retry option
    - _Requirements: 4.4, 4.5, 10.3_
  
  - [x] 9.4 Implement text insertion at insertion point
    - Get transcribed text from API response
    - Find insertion point in editor state using stored position and nodeId
    - Replace recordingPlaceholder node with transcribed text
    - Format text as "## Transcript" heading with code block
    - Handle case where insertion point is no longer valid (insert at end)
    - Show warning notification if inserted at fallback position
    - _Requirements: 4.6, 4.7, 4.8, 4.9, 10.4_

- [x] 10. Implement cancel recording flow
  - Stop MediaRecorder immediately
  - Discard all audio chunks and blob
  - Remove recordingPlaceholder node from document
  - Hide GlobalRecorderController
  - Release microphone and cleanup resources
  - Reset AudioRecorderStore state
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 11. Add browser beforeunload warning
  - Add beforeunload event listener when recording starts
  - Show browser confirmation dialog: "Recording in progress. Are you sure you want to leave?"
  - Remove event listener when recording stops or is cancelled
  - Handle user confirmation to stop recording and discard audio
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 12. Add translation strings
  - Add new translation keys to shared/i18n/locales/en_US/translation.json
  - Keys: "Start Recording", "Recording", "Paused", "Stop Recording", "Cancel Recording", "Pause Recording", "Resume Recording", "Recording in progress", "Microphone access denied", "Audio recording is not supported in this browser", "Recording duration is long. Consider stopping soon.", "Navigate to recording", "Recording in \"{title}\""
  - Update app/hooks/useDictionary.ts to include new keys
  - _Requirements: 1.3, 7.7, 8.2_

- [x] 13. Add error handling and user feedback
  - [x] 13.1 Implement error handling for permission denied
    - Show error toast with message and link to browser settings
    - Don't start recording
    - Log error for debugging
    - _Requirements: 1.3_
  
  - [x] 13.2 Implement error handling for unsupported browser
    - Detect MediaRecorder support on mount
    - Hide recording option if not supported
    - Show informational message if user somehow triggers it
    - _Requirements: 8.2_
  
  - [x] 13.3 Implement error handling for recording failures
    - Catch MediaRecorder errors
    - Stop recording and cleanup
    - Show error toast with message
    - Allow user to retry
    - _Requirements: 7.6_
  
  - [x] 13.4 Implement error handling for upload failures
    - Keep placeholder card in error state
    - Show "Upload failed" with Retry button
    - Preserve audio blob for retry
    - Log error details
    - _Requirements: 7.6_
  
  - [x] 13.5 Implement error handling for transcription failures
    - Keep placeholder card in error state
    - Show "Transcription failed" with Retry button
    - Display error message from API
    - Allow retry without re-uploading
    - _Requirements: 7.6_
  
  - [x] 13.6 Implement error handling for invalid insertion point
    - Detect if insertion point is no longer valid
    - Insert transcribed text at end of document as fallback
    - Show warning notification to user
    - Log for debugging
    - _Requirements: 4.9_

- [x] 14. Implement recording state persistence across navigation
  - Ensure AudioRecorderStore state persists when navigating between documents
  - Verify recordingPlaceholder node persists in document state
  - Test that waveform and duration continue updating when returning to source document
  - Verify GlobalRecorderController shows/hides correctly based on current document
  - _Requirements: 2.11, 3.1, 3.3, 3.4, 3.5, 3.8_

- [ ] 15. Add browser compatibility checks and codec selection
  - Implement MediaRecorder.isTypeSupported checks for codec selection
  - Prefer codecs in order: audio/webm;codecs=opus, audio/webm, audio/mp4, audio/ogg;codecs=opus, audio/wav
  - Fall back to browser default if none supported
  - Test on Chrome, Firefox, Safari, and Edge
  - _Requirements: 8.1, 8.3, 8.4_

- [ ] 16. Implement performance optimizations
  - Memoize AudioWaveform component with React.memo
  - Use useCallback for event handlers in RecordingPlaceholderCard
  - Debounce duration updates to once per second
  - Use runInAction for batched MobX state updates
  - Limit waveform visualization to last 100 samples
  - Update waveform at 30 FPS (not 60)
  - _Requirements: 11.2_

- [ ] 17. Add integration with existing transcription workflow
  - Verify audio files use AttachmentPreset.AudioTranscription (100MB limit)
  - Verify uploadFile utility works with recorded audio blobs
  - Verify transcriptions.create API accepts recorded audio attachments
  - Verify transcribed text format matches file-based transcription
  - Verify TRANSCRIPTION_DELETE_AUDIO_AFTER environment variable is respected
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 18. Write unit tests for core functionality
  - [ ] 18.1 Write tests for AudioRecorderStore
    - Test state transitions (idle → recording → paused → stopped)
    - Test duration calculation with pauses
    - Test cleanup on cancel
    - Test error state handling
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [ ] 18.2 Write tests for useAudioRecorder hook
    - Test MediaRecorder initialization
    - Test permission handling (granted/denied)
    - Test audio chunk collection
    - Test waveform data generation
    - Test cleanup on unmount
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 11.1_
  
  - [ ] 18.3 Write tests for RecordingPlaceholderCard component
    - Test rendering different states (recording, paused, uploading, transcribing, error)
    - Test button interactions (pause, resume, stop, cancel)
    - Test duration display formatting
    - Test waveform visualization
    - Test error state with retry button
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 7.1, 7.2, 7.3, 7.4, 7.6_
  
  - [ ] 18.4 Write tests for GlobalRecorderController component
    - Test conditional visibility based on current document
    - Test navigation to source document
    - Test stop and cancel actions
    - _Requirements: 2.12, 2.13, 3.2, 3.4, 3.8_

- [ ] 19. Write integration tests for recording flow
  - [ ] 19.1 Test complete recording flow
    - User types /transcript and selects "Start Recording"
    - Permission granted
    - Placeholder card appears at cursor position
    - Recording starts
    - User pauses and resumes
    - User stops recording
    - Upload and transcription complete
    - Text inserted at correct position
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.8, 2.9, 4.1, 4.6_
  
  - [ ] 19.2 Test cross-document recording flow
    - Start recording in Document A
    - Navigate to Document B
    - Verify GlobalRecorderController appears
    - Navigate back to Document A
    - Verify GlobalRecorderController hides
    - Verify placeholder card still visible and functional
    - Stop recording
    - Verify text inserted in Document A
    - _Requirements: 3.1, 3.2, 3.5, 3.8, 4.8_
  
  - [ ] 19.3 Test cancel recording flow
    - Start recording
    - Navigate to different document
    - Cancel from GlobalRecorderController
    - Verify placeholder removed from source document
    - Verify no audio uploaded
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [ ] 19.4 Test error scenarios
    - Test permission denied
    - Test unsupported browser
    - Test upload failure with retry
    - Test transcription failure with retry
    - Test invalid insertion point fallback
    - _Requirements: 1.3, 4.9, 7.6, 8.2_

- [ ] 20. Test browser compatibility
  - Test on Chrome (latest 2 versions)
  - Test on Firefox (latest 2 versions)
  - Test on Safari (latest 2 versions)
  - Test on Edge (latest 2 versions)
  - Verify MediaRecorder API support
  - Verify codec availability
  - Verify AudioContext API
  - Verify permission prompts work correctly
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

## Notes
- Each task references specific requirements from the requirements document
- Tasks should be completed in order as they build on each other
- The implementation reuses existing infrastructure (upload, transcription API, UI patterns)
- No backend changes are required for this feature
