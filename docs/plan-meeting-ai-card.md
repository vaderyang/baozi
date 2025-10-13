# Meeting AI Card Implementation Plan

## Overview
Implement a Meeting AI card for the Outline editor that enables real-time audio transcription with speaker identification, live note-taking, and AI-powered meeting summarization using OpenAI Realtime API.

## Goals
- Enable users to record meetings with live transcription directly within documents
- Provide real-time speaker-identified transcription via WebSocket streaming
- Support manual marking of important moments with context extraction
- Generate AI-powered meeting summaries on demand
- Persist transcripts and notes for future reference
- Follow existing Text AI Card patterns and architecture

## Requirements

### Functional Requirements

#### 1. Slash Command Integration
- Trigger: `/meeting-ai` in the block menu
- Menu item: "Meeting AI" with Lightning icon
- Position: 2nd in menu (right after "Text AI")
- Separator immediately below the item
- Keywords: "meeting ai transcript voice record lightning"

#### 2. Meeting AI Card UI States

**Listening State:**
- "Start listening" button changes to "Stop listening"
- Audio level indicator shows microphone activity
- Mark button visible and active
- Real-time transcript streaming in Transcript tab
- Notes tab fully editable (ProseMirror editor)

**Stopped State:**
- "Stop listening" button disabled and greyed out
- "Generate Summary" button appears (with diamond/shapes icon)
- Transcript tab shows final transcript (read-only)
- Notes tab remains fully editable
- Audio file uploaded and URL stored (not visible to user)

#### 3. Two-Tab Interface

**Notes Tab:**
- Full-featured ProseMirror editor (contentDOM)
- User can type freely during and after recording
- Mark button appends timestamped excerpts
- Summary can be inserted here manually

**Transcript Tab:**
- Read-only view of streaming transcript
- Format: `[HH:MM:SS] Speaker N:\n text\n\n`
- Updates in real-time during listening
- Persisted and reloaded on page refresh

#### 4. Mark Button Behavior
- When clicked during listening:
  - Captures transcript from 3 seconds before to 7 seconds after click time
  - Appends to Notes: `[HH:MM:SS] marked 'captured text'`
  - If transcript not yet available in that window, appends: `[HH:MM:SS] marked`
  - Waits up to small grace period for future text to arrive

#### 5. Audio Recording & Upload
- Capture audio via getUserMedia + MediaRecorder (webm/opus)
- Show audio level indicator using Web Audio AnalyserNode
- On Stop, upload recorded audio as attachment via editor's uploadFile callback
- Store URL in node attrs.audioUrl
- Do NOT display audio player in UI (development only feature)

#### 6. Real-time Transcription
- Stream audio chunks (PCM16 @ 16kHz) via WebSocket to backend
- Backend forwards to OpenAI Realtime API
- Receive transcript segments with speaker identification
- Display immediately in Transcript tab
- Batch persist to node attrs every ~0.5-1s

#### 7. Generate Summary
- Appears after Stop listening
- Calls `/api/ai.meetingSummary` with full transcript
- Inserts summary text into Notes editor
- Uses same LLM client as Text AI Card

#### 8. Data Persistence

**Node Attributes:**
```typescript
{
  listening: boolean,           // Current recording state
  generated: boolean,            // Has summary been generated
  transcript: TranscriptSegment[], // Array of {startMs, endMs, speaker, text}
  audioUrl?: string,             // Uploaded audio attachment URL
  startedAt?: number            // Recording start timestamp
}
```

**Content:**
- Standard ProseMirror block+ (Notes content)

**Markdown Serialization:**
```markdown
```meeting-ai {"listening":false,"generated":true,"transcript":[...],"audioUrl":"..."}
<notes content>
```
```

### Non-Functional Requirements
- **Security**: OpenAI API key stored server-side only
- **Performance**: Throttled attr updates (1 Hz), non-blocking WebSocket streaming
- **Compatibility**: Works with collaboration, undo/redo, clipboard
- **Development**: HTTP only (no SSL), auth bypass via x-dev-api-key header
- **Privacy**: Audio not exposed in UI, transcript persisted

## Technical Architecture

### Backend Components

#### 1. WebSocket Namespace (`/meeting-ai`)

**Location:** `server/services/websockets.ts` (extend existing)

**Authentication:**
- Production: Cookie-based JWT auth (reuse existing)
- Development: Allow `x-dev-api-key: dev_test_key` header bypass

**Client → Server Events:**
```typescript
{
  start: { language?: string },
  'audio-chunk': { data: ArrayBuffer, timestampMs: number },
  stop: {},
  mark: { timestampMs: number }
}
```

**Server → Client Events:**
```typescript
{
  'partial-transcript': { segments: TranscriptSegment[] },
  'final-transcript': { segments: TranscriptSegment[] },
  'speaker-updates': { segments: TranscriptSegment[] },
  error: { code: string, message: string },
  stopped: {}
}
```

**TranscriptSegment:**
```typescript
{
  startMs: number,
  endMs: number,
  speaker: string,  // "Speaker 1", "Speaker 2", etc.
  text: string
}
```

#### 2. OpenAI Realtime Bridge

**Environment Variables:**
- `OPENAI_API_KEY` - API key (user provides)
- `OPENAI_REALTIME_MODEL` - Model name (default: suitable Realtime model)

**Implementation:**
- Establish server-side WebSocket to OpenAI Realtime API
- Forward PCM16 16kHz audio chunks from client
- Enable speaker diarization if model supports it
- Parse interim/final transcript events into TranscriptSegment[]
- Broadcast segments to client in real-time
- Handle reconnection and error cases

#### 3. Summary Generation Endpoint

**Route:** `POST /api/ai.meetingSummary`

**Schema:**
```typescript
{
  body: {
    transcript: string,  // Full transcript text or segments JSON
    prompt?: string      // Optional custom prompt
  }
}
```

**Handler:**
- Reuse existing LLM client from Text AI (`server/routes/api/ai/ai.ts`)
- Prompt: "Generate a concise summary of this meeting transcript: ..."
- Support dev bypass header: `x-dev-api-key: dev_test_key`
- Return: `{ data: { summary: string } }`

#### 4. Router Registration

**File:** `server/routes/api/index.ts`
- Import and mount ai router (already includes ai.generate)
- Add meetingSummary route to existing ai router

### Frontend Components

#### 1. MeetingAICard Node

**File:** `shared/editor/nodes/MeetingAICard.tsx`

**Extends:** ReactNode

**Schema:**
```typescript
{
  name: "meeting_ai_card",
  group: "block",
  content: "block+",
  defining: true,
  draggable: true,
  selectable: true,
  attrs: {
    listening: { default: false },
    generated: { default: false },
    transcript: { default: [] },
    audioUrl: { default: "" },
    startedAt: { default: null }
  },
  parseDOM: [/* custom parser */],
  toDOM: [/* custom serializer */]
}
```

**Commands:**
```typescript
meeting_ai_card(): Command
```

**Markdown:**
- Fenced code block format: ` ```meeting-ai {...attrs}` 
- Rule plugin: `shared/editor/rules/meetingAICard.ts`

#### 2. MeetingAICard Component

**File:** `shared/editor/components/MeetingAICard.tsx`

**State:**
```typescript
{
  isHover: boolean,
  activeTab: 'notes' | 'transcript',
  isLoading: boolean,
  error: string | null,
  audioLevel: number,
  pendingMarks: Array<{ timestampMs: number, endTime: number }>
}
```

**UI Structure:**
```
┌─ Wrapper ────────────────────────────────────────┐
│ ┌─ Toolbar ─────────────────────────────────┐   │
│ │ [Start/Stop] [====] [Mark] [Summary]      │   │
│ └───────────────────────────────────────────┘   │
│ ┌─ Tabs ────────────────────────────────────┐   │
│ │ [Notes] [Transcript]                      │   │
│ └───────────────────────────────────────────┘   │
│ ┌─ Content ─────────────────────────────────┐   │
│ │ (Notes: ProseMirror contentDOM)           │   │
│ │ (Transcript: Formatted read-only text)    │   │
│ └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**Key Handlers:**
- `handleStartListening()`: Request mic, start WebSocket, start recording
- `handleStopListening()`: Stop all streams, upload audio, finalize transcript
- `handleMark()`: Record timestamp, schedule extraction window
- `handleGenerateSummary()`: Call API, insert into Notes
- `handleTabChange()`: Switch between Notes and Transcript views

**Audio Processing:**
```typescript
// Dual path:
// 1. AnalyserNode → Audio level meter
// 2. AudioContext → ScriptProcessor → PCM16 16kHz → WebSocket
// 3. MediaRecorder → webm blob → upload on stop
```

**WebSocket Client:**
```typescript
const socket = io('/meeting-ai', {
  auth: { token: getCookie('accessToken') }
});

socket.on('partial-transcript', updateTranscript);
socket.on('final-transcript', finalizeTranscript);
socket.on('error', handleError);
```

**Transcript Persistence:**
- Buffer segments in memory
- Batch update node attrs every 500-1000ms
- Full persist on stop
- Avoid cursor jumps and collaboration conflicts

#### 3. Slash Menu Integration

**File:** `app/editor/menus/block.tsx`

**Insert at position 2 (after Text AI):**
```typescript
{
  name: "meeting_ai_card",
  title: "Meeting AI",
  icon: <LightningIcon />,
  keywords: "meeting ai transcript voice record lightning",
  priority: 999,  // Just below Text AI's 1000
},
{
  name: "separator",
},
```

#### 4. Extension Registration

**File:** `shared/editor/nodes/index.ts`

```typescript
import MeetingAICard from "./MeetingAICard";

export const richExtensions: Nodes = [
  ...basicExtensions.filter((n) => n !== SimpleImage),
  Image,
  CodeBlock,
  CodeFence,
  Blockquote,
  Embed,
  Attachment,
  Video,
  Notice,
  TextAICard,
  MeetingAICard,  // ADD HERE
  Heading,
  // ...rest
];
```

## Data Flow

### Recording Flow

1. User types `/meeting-ai` → Card inserted with empty Notes paragraph
2. User clicks "Start listening"
3. Component requests microphone permission
4. Establish WebSocket connection to `/meeting-ai`
5. Start dual audio processing:
   - AnalyserNode → Update level indicator UI
   - AudioWorklet/ScriptProcessor → PCM16 chunks → socket.emit('audio-chunk')
   - MediaRecorder → Accumulate webm blob
6. Server forwards audio to OpenAI Realtime
7. Server receives transcript segments, emits to client
8. Client appends to transcript array, batches attr updates
9. Transcript tab updates in real-time

### Mark Flow

1. User clicks "Mark" at time T
2. Record mark timestamp T
3. Schedule extraction window [T-3s, T+7s]
4. Filter transcript segments in window (or wait for future segments up to T+7s + grace)
5. If segments found: Append to Notes: `[HH:MM:SS] marked 'text'`
6. If no segments: Append to Notes: `[HH:MM:SS] marked`

### Stop Flow

1. User clicks "Stop listening"
2. Stop audio streams
3. socket.emit('stop')
4. Wait for final transcript events
5. Upload webm blob via uploadFile()
6. Set attrs: `{ listening: false, audioUrl: uploadedUrl, transcript: finalSegments }`
7. Disable Stop button, show Generate Summary button

### Summary Flow

1. User clicks "Generate Summary"
2. Extract full transcript text from attrs.transcript
3. POST /api/ai.meetingSummary with transcript
4. Insert returned summary into Notes editor at cursor or end
5. Set attrs: `{ generated: true }`

## Implementation Steps

### Phase 1: Git & Planning ✅
- [x] Create this plan document
- [ ] Merge feature/text-ai-card → netis_house, push
- [ ] Create feature/meeting-ai-card from netis_house, push
- [ ] Delete remote branches: origin/feature/meeting-recording-transcription, origin/transcription_enhancement

### Phase 2: Backend WebSocket Foundation
- [ ] Extend `server/services/websockets.ts` with `/meeting-ai` namespace
- [ ] Implement auth (cookie + dev bypass)
- [ ] Add event handlers: start, audio-chunk, stop, mark
- [ ] Mock transcript emission for testing
- [ ] Commit: `feat(ws): add Meeting AI WebSocket namespace with auth`

### Phase 3: OpenAI Realtime Integration
- [ ] Add env vars: OPENAI_API_KEY, OPENAI_REALTIME_MODEL
- [ ] Create OpenAI Realtime client bridge
- [ ] Forward audio chunks to OpenAI
- [ ] Parse transcript responses into TranscriptSegment[]
- [ ] Handle speaker diarization
- [ ] Emit real-time events to client
- [ ] Commit: `feat(ai): integrate OpenAI Realtime for transcription`

### Phase 4: Summary API Endpoint
- [ ] Add schema: `server/routes/api/ai/schema.ts` (MeetingSummarySchema)
- [ ] Add route handler: `server/routes/api/ai/ai.ts` (ai.meetingSummary)
- [ ] Reuse LLM client, format prompt
- [ ] Support dev bypass header
- [ ] Commit: `feat(api): add meeting summary generation endpoint`

### Phase 5: Frontend Node & Component Scaffold
- [ ] Create `shared/editor/nodes/MeetingAICard.tsx`
- [ ] Define schema with attrs
- [ ] Implement commands
- [ ] Create `shared/editor/rules/meetingAICard.ts`
- [ ] Create `shared/editor/components/MeetingAICard.tsx` (scaffold)
- [ ] Register in `shared/editor/nodes/index.ts`
- [ ] Commit: `feat(editor): add Meeting AI card node and scaffold`

### Phase 6: Slash Menu Integration
- [ ] Update `app/editor/menus/block.tsx`
- [ ] Insert Meeting AI item at position 2 with Lightning icon
- [ ] Add separator below
- [ ] Test slash command appears correctly
- [ ] Commit: `feat(menu): add Meeting AI to slash menu with separator`

### Phase 7: Audio Capture & Level Indicator
- [ ] Implement getUserMedia request
- [ ] Set up AnalyserNode for level meter
- [ ] Set up AudioWorklet/ScriptProcessor for PCM16 conversion
- [ ] Set up MediaRecorder for webm recording
- [ ] Connect to UI controls
- [ ] Commit: `feat(audio): implement audio capture with level indicator`

### Phase 8: WebSocket Client & Streaming
- [ ] Add socket.io-client connection to `/meeting-ai`
- [ ] Implement audio-chunk emission
- [ ] Handle partial-transcript events
- [ ] Update Transcript tab in real-time
- [ ] Batch persist attrs.transcript
- [ ] Commit: `feat(ui): wire WebSocket streaming to Transcript tab`

### Phase 9: Mark Button & Context Extraction
- [ ] Implement Mark button handler
- [ ] Record timestamp and schedule extraction window
- [ ] Filter/wait for segments in [T-3s, T+7s]
- [ ] Append to Notes editor
- [ ] Handle edge cases (no transcript, recording stopped)
- [ ] Commit: `feat(mark): implement Mark button with context extraction`

### Phase 10: Stop & Audio Upload
- [ ] Implement Stop handler
- [ ] Stop all audio streams
- [ ] Upload webm blob via uploadFile
- [ ] Store audioUrl in attrs
- [ ] Disable Stop button, show Generate Summary
- [ ] Commit: `feat(stop): finalize recording and upload audio`

### Phase 11: Generate Summary Integration
- [ ] Add Generate Summary button (ShapesIcon)
- [ ] Call /api/ai.meetingSummary
- [ ] Insert summary into Notes editor
- [ ] Handle loading and error states
- [ ] Commit: `feat(summary): integrate meeting summary generation`

### Phase 12: Persistence & Rehydration
- [ ] Ensure attrs.transcript persists on save
- [ ] Reload transcript on card mount
- [ ] Display in Transcript tab
- [ ] Notes content persists via contentDOM
- [ ] Test page reload scenarios
- [ ] Commit: `feat(persist): full persistence and rehydration of Meeting AI card`

### Phase 13: Error Handling & UX Polish
- [ ] Microphone permission denied handling
- [ ] WebSocket connection errors
- [ ] OpenAI API errors and rate limiting
- [ ] Loading states and spinners
- [ ] Tooltips and aria-labels
- [ ] Commit: `feat(ux): add error handling and accessibility`

### Phase 14: i18n Strings
- [ ] Add English translations for all UI strings
- [ ] Update `shared/i18n/locales/en_US/translation.json`
- [ ] Fallback for other locales
- [ ] Commit: `chore(i18n): add Meeting AI translations`

### Phase 15: Testing & Validation
- [ ] Unit tests for segment buffering
- [ ] Unit tests for Mark extraction logic
- [ ] Integration test for summary endpoint
- [ ] Manual testing with live audio
- [ ] Performance check (attr update throttling)
- [ ] Commit: `test: add Meeting AI card tests`

### Phase 16: Documentation
- [ ] Update README with Meeting AI feature
- [ ] Document env vars
- [ ] Add curl examples for summary endpoint
- [ ] Developer setup instructions
- [ ] Commit: `docs: add Meeting AI documentation`

## Configuration

### Environment Variables

```bash
# Required for transcription
OPENAI_API_KEY=sk-...

# Optional, defaults provided
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview

# Development only (already exists)
SERVER_SSL_ENABLED=false
```

### Development Setup

```bash
# Install dependencies (if not already)
yarn install

# Set environment variables
export OPENAI_API_KEY="sk-..."

# Start dev server (HTTP only)
yarn dev

# In browser, type /meeting-ai to test
```

### Testing Commands

```bash
# Test summary endpoint with curl
curl -X POST http://localhost:3000/api/ai.meetingSummary \
  -H "Content-Type: application/json" \
  -H "x-dev-api-key: dev_test_key" \
  -d '{"transcript":"Team discussed roadmap. Action: John to draft proposal by Friday."}'

# WebSocket connection test (browser console)
const socket = io('/meeting-ai', {
  auth: { token: 'dev_test_key' }
});
socket.on('connect', () => console.log('Connected'));
socket.on('partial-transcript', (data) => console.log(data));
```

## Success Criteria

- [ ] Slash command `/meeting-ai` inserts Meeting AI card in 2nd position
- [ ] Card has Lightning icon and separator below in menu
- [ ] Start listening captures audio and shows level indicator
- [ ] Real-time transcript appears in Transcript tab with speaker labels
- [ ] Mark button extracts [-3s, +7s] context into Notes
- [ ] Stop listening disables button and shows Generate Summary
- [ ] Generate Summary calls API and inserts into Notes
- [ ] Transcript persists across page reload
- [ ] Audio uploads and URL stored (but not displayed)
- [ ] Works with existing collaboration and undo/redo
- [ ] No SSL in development, auth bypass works
- [ ] All commits follow conventional commit format

## Risk Mitigation

### Audio Streaming Performance
- **Risk:** High frequency audio chunks overwhelm WebSocket
- **Mitigation:** Buffer and batch chunks (e.g., 100ms windows)

### Transcript Update Race Conditions
- **Risk:** Rapid attr updates cause cursor jumps or collaboration conflicts
- **Mitigation:** Throttle updates to 1 Hz, batch segments

### OpenAI Realtime Connection Issues
- **Risk:** WebSocket drops, reconnection needed
- **Mitigation:** Implement exponential backoff, queue audio during reconnect

### Mark Context Missing
- **Risk:** Mark clicked before/after transcript coverage
- **Mitigation:** Graceful fallback to timestamp-only message

### Audio Upload Failures
- **Risk:** Large file, slow network
- **Mitigation:** Show progress, allow retry, compress before upload

## Future Enhancements (Out of Scope)

- [ ] Export transcript as PDF/Markdown
- [ ] Multi-language transcription
- [ ] Custom speaker names (instead of Speaker 1, 2, etc.)
- [ ] Keyword search within transcript
- [ ] Highlight action items automatically
- [ ] Integration with calendar for automatic meeting detection
- [ ] Voice commands during recording
- [ ] Sentiment analysis

## References

### Existing Code Patterns
- Text AI Card: `shared/editor/components/TextAICard.tsx`
- Text AI Node: `shared/editor/nodes/TextAICard.tsx`
- AI API: `server/routes/api/ai/ai.ts`
- WebSocket Service: `server/services/websockets.ts`
- Slash Menu: `app/editor/menus/block.tsx`
- Icon Library: `shared/utils/IconLibrary.tsx`

### External Documentation
- OpenAI Realtime API: https://platform.openai.com/docs/guides/realtime
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- MediaRecorder API: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- Socket.io: https://socket.io/docs/v4/

---

**Document Version:** 1.0  
**Last Updated:** 2025-10-13  
**Status:** Ready for Implementation
