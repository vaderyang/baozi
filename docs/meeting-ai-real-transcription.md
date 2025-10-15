# Meeting AI Card - Real Transcription Implementation

## Current Architecture

The Meeting AI Card currently has a hybrid implementation that includes:

1. **Mock Transcription** (fallback)
   - Location: `shared/editor/components/MeetingAICard.tsx:179-226`
   - Triggered when: `forceMock` prop is true OR WebSocket connection fails
   - Uses hardcoded script with Speaker 1 and Speaker 2
   - Generates segments every 1 second with predefined text

2. **Real Transcription** (primary path)
   - Client: `shared/editor/components/MeetingAICard.tsx:234-323`
   - Server: `server/services/meetingAI.ts`
   - Integration: `server/services/openai-realtime.ts`
   - Uses OpenAI Realtime API with Whisper-1 transcription

## Current Flow

### Client Side (MeetingAICard.tsx)
1. User clicks "Start Listening"
2. Request microphone access via `navigator.mediaDevices.getUserMedia()`
3. Create WebSocket connection to `/meeting-ai`
4. If `forceMock` is true → start mock streaming
5. If WebSocket connection fails → fallback to mock streaming
6. If successful:
   - Send `{type: "start"}` message
   - Capture audio via `ScriptProcessorNode`
   - Convert Float32 audio to Int16 PCM
   - Stream PCM audio chunks to server as binary frames
   - Receive transcript segments from server
   - Display in UI and store in node attributes

### Server Side (meetingAI.ts)
1. Authenticate WebSocket connection via cookie or dev bypass
2. On `start` message:
   - Check `OPENAI_API_KEY` environment variable
   - Initialize `OpenAIRealtimeClient`
   - Connect to OpenAI Realtime API
3. On binary audio data:
   - Forward PCM audio to OpenAI client
4. On transcript callback:
   - Receive segments from OpenAI
   - Send to client via `partial-transcript` or `final-transcript` messages
5. On `stop` message:
   - Commit final audio buffer
   - Wait 500ms for final transcription
   - Send final segments and `stopped` message

### OpenAI Integration (openai-realtime.ts)
1. Connect to `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`
2. Configure session with:
   - Input format: PCM16
   - Transcription: Whisper-1
   - VAD (Voice Activity Detection): Server-side
   - Threshold: 0.5, silence duration: 500ms
3. Handle events:
   - `conversation.item.input_audio_transcription.completed` → Extract transcript
   - `input_audio_buffer.speech_started/stopped` → Track timing
4. Simple speaker identification based on turn-taking (item_id)
5. Emit segments via callback to server

## Issues with Current Mock Implementation

1. **forceMock prop**: Hardcoded in component, requires code change to switch
2. **Automatic fallback**: WebSocket errors silently fall back to mock (lines 311-322)
3. **No user feedback**: Users don't know if they're using mock or real transcription
4. **Configuration not checked**: No validation of OPENAI_API_KEY before attempting connection
5. **Mixed concerns**: Mock logic embedded in production component

## Transition Plan

### Phase 1: Remove forceMock and Mock Fallback
**Goal**: Make real transcription the only path, provide clear error messages when it fails

**Changes to MeetingAICard.tsx**:
1. Remove `forceMock` constant (line 33)
2. Remove `startMockStreaming()` function (lines 179-226)
3. Remove automatic fallback in `ws.onerror` (lines 311-320)
4. Remove catch block fallback (lines 321-323)
5. Update error handling to show specific failure reasons:
   - Microphone permission denied
   - WebSocket connection failed
   - OpenAI API not configured
   - OpenAI connection failed

**Changes to meetingAI.ts**:
1. Enhance error messages for better client feedback
2. Add configuration check before attempting OpenAI connection
3. Return specific error codes for different failure modes

### Phase 2: Configuration Validation
**Goal**: Check configuration early and provide clear feedback

**Add to server startup or WebSocket connection**:
```typescript
// Check if OPENAI_API_KEY is configured
if (!env.OPENAI_API_KEY) {
  Logger.warn("OPENAI_API_KEY not configured - Meeting AI transcription will not work");
}

// Optionally check if the API key is valid by making a test request
```

**Client-side configuration UI**:
- Show warning if transcription service is not available
- Provide admin instructions for configuring OPENAI_API_KEY

### Phase 3: Enhanced Error Handling
**Goal**: Give users actionable feedback when things go wrong

**Error Categories**:
1. **Microphone Access**: "Microphone access denied. Please allow microphone access in your browser settings."
2. **Network Issues**: "Unable to connect to transcription service. Please check your network connection."
3. **Service Not Configured**: "Transcription service is not configured. Please contact your administrator."
4. **Service Error**: "Transcription service encountered an error: [error message]"

### Phase 4: Optional Features
1. **Transcription language selection**: Add language picker in UI
2. **Advanced speaker diarization**: Use external service or ML model for better speaker identification
3. **Custom vocabulary**: Support domain-specific terms
4. **Real-time editing**: Allow users to correct transcripts in real-time

## Files to Modify

### Primary Changes
- `shared/editor/components/MeetingAICard.tsx` (lines 33, 179-226, 311-323)
  - Remove mock logic
  - Enhance error handling
  - Add configuration status checks

- `server/services/meetingAI.ts` (lines 104-112, 128-136, 147-155)
  - Add early configuration validation
  - Improve error messages with specific codes
  - Add structured error responses

### Optional Enhancements
- `app/scenes/Settings/components/Features.tsx` (if exists)
  - Add Meeting AI configuration section

- `server/env.ts`
  - Add OPENAI_REALTIME_MODEL validation
  - Add configuration documentation

## Testing Plan

### Unit Tests
1. Test WebSocket connection handling
2. Test error scenarios (no API key, network failure, API error)
3. Test audio chunk streaming
4. Test transcript segment parsing

### Integration Tests
1. Test full flow with real OpenAI API (requires valid API key)
2. Test microphone permission scenarios
3. Test concurrent sessions (multiple users)
4. Test long-running sessions

### Manual Testing
1. Verify error messages are user-friendly
2. Test on different browsers (Chrome, Firefox, Safari)
3. Test on different devices (desktop, mobile)
4. Verify audio quality and transcription accuracy
5. Test speaker identification with multiple speakers

## Environment Variables

Required:
- `OPENAI_API_KEY`: OpenAI API key with Realtime API access

Optional:
- `OPENAI_REALTIME_MODEL`: Model to use (default: `gpt-4o-realtime-preview`)

## Rollout Strategy

1. **Development**: Test with real API in dev environment
2. **Staging**: Enable for internal team testing
3. **Production**:
   - Phase 1: Enable for select users (feature flag)
   - Phase 2: Enable for all authenticated users
   - Monitor error rates and user feedback
   - Optimize based on usage patterns

## Success Metrics

- Transcription accuracy > 95%
- WebSocket connection success rate > 99%
- Error recovery rate (user retries after error)
- User satisfaction with transcription quality
- Average session duration
- Cost per transcription hour (OpenAI API usage)

## Known Limitations

1. **Speaker Identification**: Current implementation uses simple turn-based detection
   - Limitation: Cannot distinguish overlapping speech
   - Future: Integrate dedicated speaker diarization service

2. **Language Support**: Currently optimized for English
   - Limitation: May have lower accuracy for other languages
   - Future: Add language detection and optimization

3. **Latency**: Real-time transcription has ~1-3 second delay
   - Limitation: Not suitable for instant captions
   - Current: Acceptable for meeting notes use case

4. **Cost**: OpenAI Realtime API charges per minute
   - Current: No usage limits or quotas implemented
   - Future: Add usage tracking and limits per team/user
