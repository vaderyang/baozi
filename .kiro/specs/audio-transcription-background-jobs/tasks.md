# Implementation Plan

- [ ] 1. Create database migration and TranscriptionJob model
  - Create migration file for transcription_jobs table with all required columns and indexes
  - Implement TranscriptionJob Sequelize model with status enum, validation, and associations
  - Add updateStatus, complete, and fail methods to emit websocket events
  - _Requirements: 1.1, 5.1, 5.2_

- [ ] 2. Implement TranscriptionTask background worker
  - Create TranscriptionTask class extending BaseTask in server/queues/tasks/
  - Implement perform method to fetch job, download audio, call transcription service
  - Add exponential backoff retry logic with 3 attempts
  - Update job status at each stage (processing, completed, failed)
  - Handle audio file deletion based on TRANSCRIPTION_DELETE_AUDIO_AFTER config
  - Implement onFailed method for final failure handling
  - _Requirements: 1.1, 1.4, 5.3, 5.4_

- [ ] 3. Create TranscriptionStatusCard ProseMirror node
  - Create TranscriptionStatusCard.tsx in shared/editor/nodes/
  - Define NodeSpec with attrs for jobId, fileName, fileSize, status, progress, error
  - Implement React component with loading spinner, progress bar, and status display
  - Add retry button for failed state and cancel button for queued/processing states
  - Implement parseDOM and toDOM for serialization
  - Add commands for insert, update, and remove operations
  - _Requirements: 1.2, 1.3, 2.1, 2.3, 2.5, 3.1, 4.1, 4.2_

- [ ] 4. Modify transcription API endpoints
- [ ] 4.1 Update transcriptions.create endpoint for async operation
  - Modify endpoint to create TranscriptionJob record instead of processing synchronously
  - Schedule TranscriptionTask with job details
  - Return job ID and 'queued' status immediately
  - Update schema to require documentId in request
  - _Requirements: 1.1, 1.2_

- [ ] 4.2 Create transcriptions.info endpoint
  - Implement GET endpoint to retrieve job status by jobId
  - Verify user has access to the job's document
  - Return current status, progress, error, and result
  - _Requirements: 2.1, 6.1_

- [ ] 4.3 Create transcriptions.retry endpoint
  - Implement POST endpoint to retry failed transcription
  - Verify user owns the job and it's in failed state
  - Create new TranscriptionJob using existing attachment
  - Schedule new TranscriptionTask
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 4.4 Create transcriptions.cancel endpoint
  - Implement POST endpoint to cancel queued/processing job
  - Verify user owns the job
  - Remove job from task queue
  - Update job status to cancelled
  - Optionally delete audio file based on config
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 5. Implement WebSocket event handling
  - Add 'transcription:status' event type to websocket processor
  - Emit events to document-specific rooms (document-${documentId})
  - Include jobId, status, progress, error, and result in payload
  - Ensure events only sent to users with document access
  - _Requirements: 2.2, 6.1, 6.2_

- [ ] 6. Create TranscriptionStatusManager frontend component
  - Create TranscriptionStatusManager.tsx in app/editor/components/
  - Subscribe to websocket 'transcription:status' events for current document
  - Find and update status card nodes in editor by jobId
  - On completion: Replace status card with formatted transcript text
  - On failure: Update card to show error message
  - Handle retry and cancel button clicks
  - _Requirements: 1.3, 1.4, 1.5, 2.1, 2.2, 3.1, 4.1, 4.2, 6.3_

- [ ] 7. Update editor menu integration
  - Modify SuggestionsMenu.tsx to use new async API
  - After file upload, call transcriptions.create with documentId
  - Insert TranscriptionStatusCard node with returned jobId
  - Remove synchronous transcription handling code
  - _Requirements: 1.1, 1.2_

- [ ] 8. Add environment configuration
  - Add TRANSCRIPTION_JOB_TIMEOUT to server/env.ts with default 1800000 (30 min)
  - Add TRANSCRIPTION_CLEANUP_DAYS to server/env.ts with default 7
  - Add TRANSCRIPTION_MAX_CONCURRENT_PER_USER to server/env.ts with default 10
  - Update .env.sample with new variables
  - _Requirements: 5.1, 5.5_

- [ ] 9. Implement cleanup task for old jobs
  - Create CleanupOldTranscriptionJobsTask extending BaseTask
  - Query and delete jobs older than TRANSCRIPTION_CLEANUP_DAYS
  - Set as scheduled task with daily cron
  - _Requirements: 5.5_

- [ ] 10. Add job resumption on server restart
  - Modify worker startup to query jobs in 'processing' state
  - Re-schedule TranscriptionTask for incomplete jobs
  - Update job status from 'processing' to 'queued' before re-scheduling
  - _Requirements: 5.2_

- [ ] 11. Implement document load job query
  - Add API endpoint or extend document.info to include pending transcription jobs
  - Query TranscriptionJob by documentId and status (queued, processing)
  - Frontend inserts status cards for pending jobs on document load
  - _Requirements: 6.3_

- [ ] 12. Add translations for new UI elements
  - Add "Transcribing…" status text
  - Add "Queued" status text
  - Add "Transcription failed" error text
  - Add "Retry" button text
  - Add "Cancel" button text
  - Add "Transcription cancelled" message
  - Update useDictionary.ts with new keys
  - _Requirements: 1.2, 1.3, 3.1, 4.1_

- [ ] 13. Add authorization checks
  - Verify user has access to attachment before creating job
  - Verify user has access to document before sending websocket updates
  - Verify user owns job before retry/cancel operations
  - Add rate limiting for transcription jobs per user
  - _Requirements: 6.1, 6.2_

- [ ] 14. Update documentation
  - Update TRANSCRIPTION_FEATURE.md with background job architecture
  - Document new API endpoints (info, retry, cancel)
  - Document new environment variables
  - Add troubleshooting section for common issues
  - _Requirements: All_
