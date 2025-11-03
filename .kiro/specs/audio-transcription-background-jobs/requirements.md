# Requirements Document

## Introduction

This feature enhances the existing audio transcription functionality by implementing asynchronous background job processing with real-time status updates displayed in the document editor. Currently, transcription is synchronous and blocks the user interface during processing. This enhancement will allow users to continue working while large audio files are being transcribed, with a visual status card showing progress.

## Glossary

- **Transcription System**: The audio transcription feature that converts audio files to text using an external service
- **Background Job**: An asynchronous task that runs independently of the HTTP request-response cycle
- **Status Card**: A visual component displayed in the document editor showing transcription progress
- **Job Queue**: A system for managing and processing background tasks
- **Editor Node**: A ProseMirror node type that represents content in the document editor
- **WebSocket**: A bidirectional communication protocol for real-time updates between server and client

## Requirements

### Requirement 1

**User Story:** As a user, I want audio transcription to happen in the background, so that I can continue editing my document while waiting for large files to be transcribed

#### Acceptance Criteria

1. WHEN a user uploads an audio file for transcription, THE Transcription System SHALL create a background job and return immediately
2. THE Transcription System SHALL insert a status card node into the document at the cursor position
3. WHILE the transcription job is processing, THE Status Card SHALL display "Transcribing…" with a loading indicator
4. WHEN the transcription job completes successfully, THE Transcription System SHALL replace the status card with the transcribed text
5. IF the transcription job fails, THEN THE Transcription System SHALL update the status card to show an error message with retry option

### Requirement 2

**User Story:** As a user, I want to see real-time updates on transcription progress, so that I know the system is working and can estimate completion time

#### Acceptance Criteria

1. THE Status Card SHALL display the current status of the transcription job
2. WHEN the job status changes, THE Transcription System SHALL push updates to the client within 2 seconds
3. THE Status Card SHALL show one of the following states: "Queued", "Processing", "Completed", or "Failed"
4. WHERE the transcription service provides progress percentage, THE Status Card SHALL display a progress bar
5. THE Status Card SHALL include the audio file name and size

### Requirement 3

**User Story:** As a user, I want to retry failed transcriptions without re-uploading the file, so that I can recover from temporary service failures

#### Acceptance Criteria

1. WHEN a transcription job fails, THE Status Card SHALL display a "Retry" button
2. WHEN the user clicks the retry button, THE Transcription System SHALL create a new background job using the existing attachment
3. THE Transcription System SHALL preserve the audio file attachment until transcription succeeds or the user manually deletes it
4. THE Status Card SHALL update to show the new job status after retry is initiated


### Requirement 4

**User Story:** As a developer, I want the background job system to be reliable and maintainable, so that transcription jobs complete successfully even during server restarts

#### Acceptance Criteria

1. THE Transcription System SHALL persist job state to the database
2. WHEN the server restarts, THE Transcription System SHALL resume processing incomplete jobs
3. THE Transcription System SHALL implement exponential backoff for failed external service calls with a maximum of 3 retry attempts
4. THE Transcription System SHALL log all job state transitions for debugging purposes
5. THE Transcription System SHALL clean up completed or failed jobs older than 7 days


### Requirement 5

**User Story:** As a user with multiple documents open, I want status updates to appear only in the correct document, so that I don't see confusing updates in unrelated documents

#### Acceptance Criteria

1. THE Transcription System SHALL associate each job with a specific document ID
2. THE Transcription System SHALL send status updates only to clients viewing the associated document
3. WHEN a user opens a document with pending transcription jobs, THE Status Card SHALL display the current job status
4. THE Transcription System SHALL support multiple concurrent transcription jobs across different documents
