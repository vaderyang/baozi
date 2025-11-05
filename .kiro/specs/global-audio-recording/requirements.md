# Requirements Document

## Introduction

This document specifies the requirements for a global audio recording feature that allows users to record audio directly in the browser and transcribe it into documents. The feature must support continuous recording even when users navigate between different documents, providing a seamless and reliable user experience with minimal maintenance overhead.

## Glossary

- **Recording System**: The browser-based audio recording functionality that captures user's microphone input
- **Global Recorder Controller**: A persistent UI component that displays recording status and controls across all documents
- **Recording Placeholder Card**: An inline card inserted at the cursor position in the document that shows recording status, duration, and audio visualization
- **Source Document**: The document where the user initiated the recording
- **Insertion Point**: The exact cursor position in the Source Document where the /transcript command was invoked
- **Recording Session**: The period from when recording starts until it stops or is cancelled
- **Transcription Service**: The external service that converts audio files to text (already implemented)
- **Audio Blob**: The binary audio data captured during a recording session

## Requirements

### Requirement 1

**User Story:** As a user, I want to start recording audio from within a document, so that I can capture spoken content for transcription without uploading a file.

#### Acceptance Criteria

1. WHEN the user types "/transcript" in the document editor, THE Recording System SHALL display both "Upload Audio" and "Start Recording" options in the slash command menu.
2. WHEN the user selects "Start Recording", THE Recording System SHALL request microphone permission from the browser.
3. IF microphone permission is denied, THEN THE Recording System SHALL display an error message "Microphone access denied" and SHALL NOT start recording.
4. WHEN microphone permission is granted, THE Recording System SHALL begin capturing audio and SHALL insert a Recording Placeholder Card at the Insertion Point.
5. WHEN microphone permission is granted, THE Recording System SHALL display the Global Recorder Controller.
6. THE Recording System SHALL capture audio in a format compatible with the existing Transcription Service (WAV, MP3, or WebM).
7. THE Recording System SHALL store the Insertion Point reference for later text insertion.

### Requirement 2

**User Story:** As a user, I want to see an inline recording status card at the exact position where transcription will be inserted, so that I know where the audio belongs and can track its status.

#### Acceptance Criteria

1. WHEN recording starts, THE Recording System SHALL insert a Recording Placeholder Card at the Insertion Point in the Source Document.
2. THE Recording Placeholder Card SHALL display the text "Recording" or "🔴 Recording".
3. THE Recording Placeholder Card SHALL display the current recording duration in MM:SS format, updated every second.
4. THE Recording Placeholder Card SHALL display a real-time audio waveform visualization based on the microphone input.
5. THE Recording Placeholder Card SHALL provide a "Pause" button to temporarily pause recording.
6. THE Recording Placeholder Card SHALL provide a "Stop" button to end the recording.
7. THE Recording Placeholder Card SHALL provide a "Cancel" button to discard the recording.
8. WHEN the user pauses recording, THE Recording Placeholder Card SHALL display "Paused" status and SHALL change the "Pause" button to a "Continue" button.
9. WHEN the user clicks "Continue", THE Recording System SHALL resume audio capture and SHALL update the card to show "Recording" status.
10. THE Recording Placeholder Card SHALL remain visible and functional when the user scrolls within the document.
11. WHEN the user navigates away from the Source Document, THE Recording Placeholder Card SHALL persist in the document and SHALL be visible when the user returns.
12. WHEN the Source Document is the active document, THE Global Recorder Controller SHALL be hidden to avoid UI redundancy.
13. WHEN the user navigates away from the Source Document, THE Global Recorder Controller SHALL become visible to maintain recording awareness.

### Requirement 3

**User Story:** As a user, I want to continue recording when I navigate to different documents, so that I can reference other content while recording without interrupting my audio capture.

#### Acceptance Criteria

1. WHEN a Recording Session is active and the user navigates to a different document, THE Recording System SHALL continue capturing audio without interruption.
2. WHEN a Recording Session is active and the user navigates away from the Source Document, THE Global Recorder Controller SHALL become visible.
3. THE Global Recorder Controller SHALL display the current recording duration, status (Recording/Paused), and provide Stop and Cancel buttons.
4. THE Global Recorder Controller SHALL provide a clickable link or button to navigate back to the Source Document.
5. THE Recording System SHALL maintain references to both the Source Document and the Insertion Point throughout the Recording Session.
6. WHEN the user navigates during recording, THE Recording System SHALL NOT lose any captured audio data.
7. WHEN the user returns to the Source Document during an active Recording Session, THE Recording Placeholder Card SHALL still be visible at the Insertion Point with updated duration and waveform.
8. WHEN the user returns to the Source Document, THE Global Recorder Controller SHALL hide automatically.

### Requirement 4

**User Story:** As a user, I want the transcribed text to be inserted at the exact position where I started recording, so that the content appears in the logical place within my document.

#### Acceptance Criteria

1. WHEN the user clicks "Stop" on the Recording Placeholder Card or Global Recorder Controller, THE Recording System SHALL stop audio capture immediately.
2. WHEN recording stops, THE Recording Placeholder Card SHALL update to show "Uploading..." status.
3. THE Recording System SHALL upload the audio file using the existing upload mechanism.
4. WHEN the audio upload completes, THE Recording Placeholder Card SHALL update to show "Transcribing..." status with an animated indicator.
5. THE Recording System SHALL call the existing transcription API with the attachment ID.
6. WHEN the transcription completes successfully, THE Recording System SHALL replace the Recording Placeholder Card with the transcribed text at the Insertion Point.
7. THE transcribed text SHALL be formatted in the same way as file-based transcription (## Transcript heading with code block).
8. WHEN the user is viewing a different document when transcription completes, THE Recording System SHALL still insert the text at the correct Insertion Point in the Source Document.
9. IF the user has edited the Source Document and the Insertion Point is no longer valid, THEN THE Recording System SHALL insert the transcribed text at the end of the document and SHALL display a warning notification.

### Requirement 5

**User Story:** As a user, I want to cancel a recording if I make a mistake, so that I don't waste time transcribing unwanted audio.

#### Acceptance Criteria

1. WHEN the user clicks "Cancel" on the Recording Placeholder Card or Global Recorder Controller, THE Recording System SHALL stop capturing audio immediately.
2. WHEN recording is cancelled, THE Recording System SHALL discard all captured audio data.
3. WHEN recording is cancelled, THE Recording System SHALL remove the Recording Placeholder Card from the document.
4. WHEN recording is cancelled, THE Recording System SHALL hide the Global Recorder Controller.
5. WHEN recording is cancelled, THE Recording System SHALL NOT upload any audio or call the transcription service.
6. WHEN recording is cancelled, THE Recording System SHALL release the microphone resource.


### Requirement 6

**User Story:** As a user, I want to be warned before leaving the page while recording, so that I don't accidentally lose my recording.

#### Acceptance Criteria

1. WHEN a Recording Session is active and the user attempts to close the browser tab or window, THE Recording System SHALL display a browser confirmation dialog warning "Recording in progress. Are you sure you want to leave?".
2. WHEN a Recording Session is active and the user attempts to navigate away from the application, THE Recording System SHALL display a browser confirmation dialog.
3. WHEN the user confirms leaving during an active Recording Session, THE Recording System SHALL stop recording and discard the audio.

### Requirement 7

**User Story:** As a user, I want clear feedback during the recording and transcription process, so that I understand what's happening at each stage.

#### Acceptance Criteria

1. WHEN recording starts, THE Recording Placeholder Card SHALL display "Recording" status with a pulsing red indicator.
2. WHEN the user pauses recording, THE Recording Placeholder Card SHALL display "Paused" status.
3. WHEN recording stops and upload begins, THE Recording Placeholder Card SHALL display "Uploading..." status with a progress indicator.
4. WHEN upload completes and transcription begins, THE Recording Placeholder Card SHALL display "Transcribing..." status with an animated indicator.
5. WHEN transcription completes successfully, THE Recording System SHALL replace the Recording Placeholder Card with the transcribed text.
6. IF transcription fails, THEN THE Recording Placeholder Card SHALL display "Transcription failed" with a "Retry" button and SHALL display an error notification with the failure reason.
7. IF the recording duration exceeds 30 minutes, THEN THE Recording Placeholder Card SHALL display a warning icon and THE Recording System SHALL display a warning notification "Recording duration is long. Consider stopping soon.".

### Requirement 8

**User Story:** As a user, I want the recording feature to work reliably across different browsers, so that I can use it regardless of my browser choice.

#### Acceptance Criteria

1. THE Recording System SHALL use the browser's native MediaRecorder API for audio capture.
2. THE Recording System SHALL detect if MediaRecorder API is not supported and SHALL display an error message "Audio recording is not supported in this browser".
3. THE Recording System SHALL support Chrome, Firefox, Safari, and Edge browsers (latest two versions).
4. WHEN the browser supports multiple audio codecs, THE Recording System SHALL prefer codecs in this order: audio/webm, audio/mp4, audio/wav.

### Requirement 9

**User Story:** As a developer, I want the recording state to be managed globally, so that the feature is maintainable and the state is consistent across the application.

#### Acceptance Criteria

1. THE Recording System SHALL store recording state in a global state management solution (React Context or Zustand store).
2. THE Recording System SHALL expose the following state properties: isRecording, isPaused, startTime, sourceDocumentId, insertionPoint, audioBlob.
3. THE Recording System SHALL expose the following actions: startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording.
4. THE Recording System SHALL clean up all resources (microphone stream, event listeners) when recording stops or is cancelled.
5. THE Recording System SHALL prevent starting a new recording while another Recording Session is active.
6. THE Recording System SHALL persist the insertionPoint reference even when the user navigates away from the Source Document.

### Requirement 10

**User Story:** As a user, I want the recording feature to integrate seamlessly with the existing transcription workflow, so that the experience is consistent whether I upload a file or record audio.

#### Acceptance Criteria

1. THE Recording System SHALL reuse the existing AttachmentPreset.AudioTranscription preset for file size limits.
2. THE Recording System SHALL reuse the existing uploadFile utility for uploading recorded audio.
3. THE Recording System SHALL reuse the existing transcriptions.create API endpoint for transcription.
4. THE Recording System SHALL insert transcribed text in the same format as file-based transcription (## Transcript heading with code block).
5. THE Recording System SHALL respect the TRANSCRIPTION_DELETE_AUDIO_AFTER environment variable for audio file retention.

### Requirement 11

**User Story:** As a user, I want to see a visual representation of my audio input while recording, so that I can confirm my microphone is working and adjust my speaking volume.

#### Acceptance Criteria

1. THE Recording Placeholder Card SHALL display a real-time audio waveform visualization. Use a single color theme which match the look and feel of the whole app in daylight and night themes.
2. THE waveform visualization SHALL update at least 30 times per second to appear smooth.
3. THE waveform visualization SHALL reflect the amplitude of the audio input from the microphone.
4. WHEN the microphone is not detecting sound, THE waveform SHALL display a flat line or minimal activity.
5. WHEN the microphone detects sound, THE waveform SHALL display amplitude variations corresponding to the audio level.
6. WHEN recording is paused, THE waveform visualization SHALL stop updating and SHALL display the last captured state.
