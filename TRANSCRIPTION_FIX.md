# Transcription Status Card Fix

## Problem

When uploading an audio file for transcription, the status card would show "queued" indefinitely even though the ASR server had already processed the audio. Attempting to cancel the transcription would fail with:

```
POST http://localhost:3030/api/transcriptions.cancel 400 (Bad Request)
Failed to cancel transcription
{error: BadRequestError: Only queued or processing jobs can be cancelled}
```

## Root Cause

The websocket events for transcription status updates were not reaching the frontend, causing status cards to remain stuck showing "queued" even after jobs completed on the server.

## Solution

**Replaced websocket-based updates with polling mechanism:**

The component now polls the server every 5 seconds to check the status of all transcription jobs that have status cards in the document. This ensures status updates are reliably received regardless of websocket connection issues.

### Polling Behavior

- Polls every 5 seconds while there are status cards in the document
- Checks the actual status of each job via the `/transcriptions.info` endpoint
- Updates status cards based on the current job status:
  - **Completed jobs**: Replace the status card with the formatted transcript
  - **Failed jobs**: Update the card to show the error state with retry button
  - **Cancelled jobs**: Remove the status card
  - **Processing/Queued jobs**: Update progress indicator
- Stops polling automatically when no status cards remain

### Enhanced Cancel Error Handling

When cancellation fails, the component checks the actual job status:

- If the job is completed, it replaces the status card with the transcript and shows "Transcription already completed"
- If the job is cancelled, it removes the status card and shows "Transcription already cancelled"
- Otherwise, it shows the generic error message

## Changes Made

Modified `app/editor/components/TranscriptionStatusManager.tsx`:

1. Removed websocket event listener (`transcription:status`)
2. Removed `WebsocketContext` import and usage
3. Replaced orphaned card detection with continuous polling mechanism
4. Added 5-second interval polling that checks all status cards
5. Enhanced `handleCancelTranscription` to gracefully handle completed/cancelled jobs
6. Updated component documentation to reflect polling approach

## Testing

To test the fix:

1. Upload an audio file for transcription
2. Observe the status card polling every 5 seconds (check browser network tab)
3. Wait for the ASR server to process it (check server logs)
4. The status card should automatically update and be replaced with the transcript within 5 seconds of completion
5. Try cancelling a completed job - it should show "Transcription already completed" and insert the transcript

## Benefits

- **Reliability**: No dependency on websocket connection stability
- **Simplicity**: Easier to debug and understand than event-based updates
- **Resilience**: Works even if websocket connection is lost or never established
- **Automatic recovery**: Status cards sync with server state on every poll

## Performance Considerations

- Polling only occurs when status cards are present in the document
- Each poll makes one API call per status card
- 5-second interval provides good balance between responsiveness and server load
- Polling stops automatically when all jobs complete

## Additional Fixes

### 1. LocalStorage File Access

Fixed an issue where TranscriptionTask was failing with DNS lookup errors when using LocalStorage:

**Problem**: When `FILE_STORAGE=local`, the task tried to download audio files via HTTP using `localhost:3030`, which caused IPv6 DNS lookup failures.

**Solution**: Modified `TranscriptionTask.ts` to read files directly from the filesystem when using LocalStorage, bypassing HTTP entirely. This is both more reliable and more efficient.

```typescript
// For LocalStorage, read directly from disk to avoid localhost DNS issues
if (env.FILE_STORAGE === "local" && attachment.key) {
    const filePath = path.join(env.FILE_STORAGE_LOCAL_ROOT_DIR, attachment.key);
    fileBuffer = await fs.readFile(filePath);
}
```

### 2. Private IP Address Configuration

Fixed configuration for allowing requests to the ASR server on a private network:

**Problem**: The `ALLOWED_PRIVATE_IP_ADDRESSES` environment variable was incomplete (`172.16.1` instead of the full IP).

**Solution**: Updated `.env` to include the complete IP address:

```bash
ALLOWED_PRIVATE_IP_ADDRESSES=172.16.103.100
```

**Important**: After changing environment variables, you must restart the server for changes to take effect:

```bash
# Stop the server (Ctrl+C)
# Then restart it
yarn dev
```
