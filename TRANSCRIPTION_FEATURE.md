# Audio Transcription Feature

## Overview
Added a new audio transcription feature that allows users to upload audio files and get them transcribed using an external transcription service.

## Implementation

### 1. Environment Configuration
- Added `TRANSCRIPTION_ENDPOINT` environment variable in `.env` and `.env.sample`
- Default value: `http://v.netis.com.cn:13000/transcribe`
- Added to `server/env.ts` with proper validation

### 2. Backend API
Created new transcription API endpoint:
- **Route**: `POST /api/transcriptions.create`
- **Location**: `server/routes/api/transcriptions/`
- **Files**:
  - `transcriptions.ts` - Main route handler
  - `schema.ts` - Request validation schema
  - `index.ts` - Export file
- **Functionality**:
  - Accepts `attachmentId` in request body
  - Validates user access to the attachment
  - Downloads the audio file from storage
  - Sends it to the transcription service
  - Returns transcribed text

### 3. Frontend Integration
- Added `/transcript` slash command to the editor block menu
- Updated `app/editor/menus/block.tsx` to include the transcript option
- Modified `app/editor/components/SuggestionsMenu.tsx` to handle transcription:
  - Triggers audio file picker when `/transcript` is used
  - Uploads audio file as a document attachment using `uploadFile` from `~/utils/files`
  - Calls transcription API with the attachment ID
  - Inserts transcribed text into document as:
    ```markdown
    ## Transcript
    
    ```
    [transcribed text]
    ```
    ```

### 4. Translations
Added new translation strings in `shared/i18n/locales/en_US/translation.json`:
- "Transcript"
- "Transcribe Audio"
- "Transcribing…"
- "Transcription failed"
- "Transcription service is not available"
- "Audio file transcribed successfully"

Updated `app/hooks/useDictionary.ts` to include these strings.

### 5. Validations
Added audio content types to `shared/validations.ts`:
- WAV (audio/wav, audio/wave, audio/x-wav)
- MP3 (audio/mpeg, audio/mp3)
- FLAC (audio/flac)
- OGG (audio/ogg)
- M4A (audio/x-m4a, audio/m4a)
- OPUS (audio/opus)
- AAC (audio/aac)
- WMA (audio/x-ms-wma)

### 6. File Size Limits
Created a new `AttachmentPreset.AudioTranscription` preset:
- Added to `shared/types.ts`
- Configured in `server/models/helpers/AttachmentHelper.ts` with 100MB limit
- Updated `server/routes/api/attachments/attachments.ts` to authorize audio transcription uploads
- This allows audio files up to 100MB (vs the default 1MB for regular attachments)

## Usage

1. In a document, type `/transcript` to trigger the slash command menu
2. Select "Transcribe Audio" from the menu
3. Choose an audio file from your device (supported formats: WAV, MP3, FLAC, OGG, M4A, OPUS, AAC, WMA)
4. The file will be uploaded and sent to the transcription service
5. Once transcription is complete, the text will be inserted into the document under a "## Transcript" heading in a code block

## API Reference

### Transcription Service Endpoint
The transcription service should accept POST requests with:
- **Content-Type**: `multipart/form-data`
- **Field**: `audio` (the audio file)

Expected response format:
```json
{
  "text": "transcribed text here",
  "speaker_statistics": {} // optional
}
```

## Configuration

Set the transcription endpoint in your `.env` file:
```bash
# Transcription service endpoint
TRANSCRIPTION_ENDPOINT=http://your-transcription-service:8000/transcribe

# Delete audio files after transcription (optional)
# Set to true to save storage space, false to keep audio files as attachments
# Default: false (audio files are persisted)
TRANSCRIPTION_DELETE_AUDIO_AFTER=false
```

If `TRANSCRIPTION_ENDPOINT` is not set, it defaults to `http://172.16.103.100:8000/transcribe`.

### Audio File Storage

By default (`TRANSCRIPTION_DELETE_AUDIO_AFTER=false`):
- Audio files are **persisted** as document attachments
- Stored in `FILE_STORAGE_LOCAL_ROOT_DIR` (default: `./data/uploads/`)
- Linked to the document in the database
- Can be accessed/downloaded like any other attachment

If you set `TRANSCRIPTION_DELETE_AUDIO_AFTER=true`:
- Audio files are automatically deleted after successful transcription
- Only the transcribed text remains in the document
- Saves storage space for large audio files

## Branch
Created on branch: `feature/audio-transcription`
