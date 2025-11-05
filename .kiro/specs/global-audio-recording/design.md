# Design Document

## Overview

This document outlines the technical design for implementing a global audio recording feature that allows users to record audio directly in the browser and transcribe it into documents. The design focuses on providing a seamless user experience with minimal maintenance overhead by leveraging browser-native APIs and existing infrastructure.

### Key Design Principles

1. **Browser-Native First**: Use MediaRecorder API to avoid external dependencies
2. **Reuse Existing Infrastructure**: Leverage current transcription service, upload mechanisms, and UI patterns
3. **State Persistence**: Maintain recording state across document navigation
4. **Progressive Enhancement**: Gracefully degrade in unsupported browsers
5. **Minimal Maintenance**: Simple, well-tested code with clear separation of concerns

## Architecture

### High-Level Component Structure

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
├─────────────────────────────────────────────────────────┤
│  Layout.tsx                                             │
│  └── GlobalRecorderController (conditional render)      │
│                                                          │
│  Editor                                                  │
│  └── SuggestionsMenu                                    │
│      └── Trigger recording via /transcript command      │
│  └── RecordingPlaceholderCard (ProseMirror NodeView)   │
├─────────────────────────────────────────────────────────┤
│                    State Management                      │
│  AudioRecorderStore (MobX)                              │
│  - Recording state                                       │
│  - Audio data management                                 │
│  - Insertion point tracking                              │
├─────────────────────────────────────────────────────────┤
│                    Business Logic                        │
│  useAudioRecorder Hook                                  │
│  - MediaRecorder lifecycle                               │
│  - Audio processing                                      │
│  - Waveform analysis                                     │
├─────────────────────────────────────────────────────────┤
│                    Browser APIs                          │
│  MediaRecorder API | AudioContext API                   │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Action → Store Update → UI Re-render
     ↓
MediaRecorder → Audio Chunks → Blob → Upload → Transcription → Insert
```

## Components and Interfaces

### 1. AudioRecorderStore (MobX Store)

**Location**: `app/stores/AudioRecorderStore.ts`

**Purpose**: Global state management for recording sessions

**State Properties**:
```typescript
interface AudioRecorderState {
  // Recording status
  isRecording: boolean;
  isPaused: boolean;
  startTime: number | null;
  
  // Document context
  sourceDocumentId: string | null;
  insertionPoint: InsertionPoint | null;
  
  // Audio data
  audioChunks: Blob[];
  audioBlob: Blob | null;
  
  // MediaRecorder instance
  mediaRecorder: MediaRecorder | null;
  mediaStream: MediaStream | null;
  
  // Waveform data for visualization
  audioContext: AudioContext | null;
  analyser: AnalyserNode | null;
}

interface InsertionPoint {
  documentId: string;
  position: number; // ProseMirror position
  nodeId: string; // Unique ID for the placeholder node
}
```

**Actions**:
```typescript
class AudioRecorderStore {
  // Start recording
  async startRecording(documentId: string, position: number): Promise<void>
  
  // Pause/Resume
  pauseRecording(): void
  resumeRecording(): void
  
  // Stop and process
  async stopRecording(): Promise<Blob>
  
  // Cancel and cleanup
  cancelRecording(): void
  
  // Computed properties
  get duration(): number
  get isActive(): boolean
  get canRecord(): boolean
}
```

### 2. useAudioRecorder Hook

**Location**: `app/hooks/useAudioRecorder.ts`

**Purpose**: Encapsulate MediaRecorder logic and audio processing

**Interface**:
```typescript
interface UseAudioRecorderReturn {
  // State
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  waveformData: Uint8Array;
  error: string | null;
  
  // Actions
  startRecording: (documentId: string, position: number) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  cancelRecording: () => void;
  
  // Capabilities
  isSupported: boolean;
  hasPermission: boolean | null;
}
```

**Key Responsibilities**:
- Request microphone permission
- Initialize MediaRecorder with optimal codec
- Collect audio chunks
- Generate waveform data using AudioContext
- Handle browser compatibility

### 3. RecordingPlaceholderCard Component

**Location**: `app/editor/components/RecordingPlaceholderCard.tsx`

**Purpose**: Inline card showing recording status in the document

**Props**:
```typescript
interface RecordingPlaceholderCardProps {
  nodeId: string;
  status: 'recording' | 'paused' | 'uploading' | 'transcribing' | 'error';
  duration: number;
  waveformData: Uint8Array;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onCancel: () => void;
  onRetry?: () => void;
  error?: string;
}
```

**Visual Design**:
```
┌────────────────────────── Recording ─────────────────────┐
│ ● REC  00:00:47        L ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯          │
│                       R ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▯▯▯▯▯▯           │
│                                                          │
│  +0dB |                     ▒    ← 峰值保持 (3s)         │
│  -3dB |                ▒    █                            │
│  -6dB |            ▒   █    █                            │
│ -12dB |        ▒   █   █   ██   ▒                        │
│ -24dB |    ▒   ██  ██  ██  ██  ██   ▒                    │
│ -36dB | ▒  ██  ██ ███ ███ ███ ███  ██   ▒                │
│ -48dB | ██ ███ ███ ███ ███ ███ ███ ███ ███               │
│        ────────────────────────────────────────────────→  │
│         0s            2s           4s           6s       │
└──────────────────────────────────────────────────────────┘
```

**Implementation as ProseMirror NodeView**:
- Custom node type: `recordingPlaceholder`
- Rendered as a React component via NodeView
- Persists in document state during navigation
- Replaced with transcribed text on completion

### 4. GlobalRecorderController Component

**Location**: `app/components/GlobalRecorderController.tsx`

**Purpose**: Floating controller visible when user navigates away from source document

**Props**:
```typescript
interface GlobalRecorderControllerProps {
  isVisible: boolean; // Hide when on source document
  status: 'recording' | 'paused';
  duration: number;
  sourceDocumentId: string;
  sourceDocumentTitle: string;
  onStop: () => void;
  onCancel: () => void;
  onNavigateToSource: () => void;
}
```

**Visual Design**:
```
     ●
    ●●
   ●●●
    ●●
     ●
```
一个圆形的提示呼吸灯，内部图纹表达录音电平的变动，鼠标直接点击后会跳转到Document的录音位置。如果鼠标停留，旁边会伸展出 Stop的方框按钮

**Positioning**: Fixed bottom-right, z-index above content

### 5. AudioWaveform Component

**Location**: `app/components/AudioWaveform.tsx`

**Purpose**: Real-time audio visualization

**Props**:
```typescript
interface AudioWaveformProps {
  data: Uint8Array; // Frequency data from AnalyserNode
  width: number;
  height: number;
  color: string;
  isPaused: boolean;
}
```

**Implementation**:
- Canvas-based rendering for performance
- Updates at 30 FPS
- Displays last N samples (e.g., 100 bars)
- Smooth animation using requestAnimationFrame

### 6. ProseMirror Integration

**Location**: `app/editor/extensions/RecordingPlaceholder.ts`

**Purpose**: Custom ProseMirror node for recording placeholder

**Node Spec**:
```typescript
const recordingPlaceholder: NodeSpec = {
  group: "block",
  atom: true,
  attrs: {
    nodeId: { default: "" },
    status: { default: "recording" },
    startTime: { default: null },
  },
  parseDOM: [{
    tag: "div[data-recording-placeholder]",
    getAttrs: (dom) => ({
      nodeId: dom.getAttribute("data-node-id"),
      status: dom.getAttribute("data-status"),
      startTime: dom.getAttribute("data-start-time"),
    }),
  }],
  toDOM: (node) => [
    "div",
    {
      "data-recording-placeholder": "",
      "data-node-id": node.attrs.nodeId,
      "data-status": node.attrs.status,
      "data-start-time": node.attrs.startTime,
    },
  ],
};
```

**NodeView Implementation**:
```typescript
class RecordingPlaceholderView implements NodeView {
  dom: HTMLElement;
  
  constructor(node: Node, view: EditorView, getPos: () => number) {
    this.dom = document.createElement("div");
    this.dom.className = "recording-placeholder";
    
    // Render React component
    ReactDOM.render(
      <RecordingPlaceholderCard
        nodeId={node.attrs.nodeId}
        // ... other props from store
      />,
      this.dom
    );
  }
  
  update(node: Node): boolean {
    // Re-render on node updates
    return true;
  }
  
  destroy() {
    ReactDOM.unmountComponentAtNode(this.dom);
  }
}
```

## Data Models

### Recording Session Model

```typescript
interface RecordingSession {
  id: string; // UUID
  documentId: string;
  position: number;
  startTime: number;
  pausedDuration: number; // Total time paused
  status: RecordingStatus;
  audioChunks: Blob[];
}

type RecordingStatus = 
  | 'recording'
  | 'paused'
  | 'stopped'
  | 'uploading'
  | 'transcribing'
  | 'completed'
  | 'error';
```

### Insertion Point Tracking

```typescript
interface InsertionPointTracker {
  documentId: string;
  position: number;
  nodeId: string;
  
  // Validation
  isValid(editorState: EditorState): boolean;
  
  // Fallback strategy
  getFallbackPosition(editorState: EditorState): number;
}
```

## Error Handling

### Error Types

```typescript
enum AudioRecordingError {
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NOT_SUPPORTED = 'NOT_SUPPORTED',
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  RECORDING_FAILED = 'RECORDING_FAILED',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  TRANSCRIPTION_FAILED = 'TRANSCRIPTION_FAILED',
  INVALID_INSERTION_POINT = 'INVALID_INSERTION_POINT',
}
```

### Error Handling Strategy

1. **Permission Denied**:
   - Show error message with instructions
   - Provide link to browser settings
   - Don't start recording

2. **Not Supported**:
   - Detect on mount
   - Hide recording option in menu
   - Show informational message if user tries

3. **Recording Failed**:
   - Stop recording
   - Show error toast
   - Clean up resources
   - Allow retry

4. **Upload/Transcription Failed**:
   - Keep placeholder card
   - Show error state with retry button
   - Preserve audio blob for retry

5. **Invalid Insertion Point**:
   - Insert at end of document
   - Show warning notification
   - Log for debugging

### Error Recovery

```typescript
class ErrorRecovery {
  // Retry with exponential backoff
  async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T>
  
  // Cleanup on error
  cleanupOnError(): void {
    // Stop media recorder
    // Release media stream
    // Clear audio chunks
    // Remove placeholder
  }
}
```

## Testing Strategy

### Unit Tests

**AudioRecorderStore Tests**:
- State transitions (idle → recording → paused → stopped)
- Duration calculation
- Cleanup on cancel
- Error state handling

**useAudioRecorder Hook Tests**:
- MediaRecorder initialization
- Permission handling
- Audio chunk collection
- Waveform data generation

**RecordingPlaceholderCard Tests**:
- Rendering different states
- Button interactions
- Duration display
- Waveform visualization

### Integration Tests

**Recording Flow**:
1. User types `/transcript` and selects "Start Recording"
2. Permission granted
3. Placeholder card appears
4. Recording starts
5. User navigates to different document
6. Global controller appears
7. User returns to source document
8. Global controller hides
9. User stops recording
10. Upload and transcription complete
11. Text inserted at correct position

**Cross-Document Recording**:
1. Start recording in Document A
2. Navigate to Document B
3. Navigate to Document C
4. Return to Document A
5. Verify placeholder still visible and functional
6. Stop recording
7. Verify text inserted in Document A

### Browser Compatibility Tests

Test matrix:
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

Test scenarios:
- MediaRecorder API support
- Codec availability
- AudioContext API
- Permission prompts

## Performance Considerations

### Audio Processing

**Waveform Generation**:
- Use Web Audio API AnalyserNode
- Update at 30 FPS (not 60) to reduce CPU usage
- Use Uint8Array for frequency data (lighter than Float32Array)
- Limit visualization to last 100 samples

**Memory Management**:
- Store audio chunks as Blob array
- Don't keep raw ArrayBuffer in memory
- Clear chunks after successful upload
- Limit recording duration warning at 30 minutes

### State Updates

**MobX Optimizations**:
- Use `@computed` for derived values (duration, isActive)
- Batch state updates with `runInAction`
- Avoid unnecessary re-renders with `observer`

**React Optimizations**:
- Memoize waveform component with `React.memo`
- Use `useCallback` for event handlers
- Debounce duration updates (update every second, not every millisecond)

### Bundle Size

**Code Splitting**:
- Lazy load recording components
- Only load when user triggers `/transcript`
- Estimated bundle impact: ~15KB gzipped

## Security Considerations

### Microphone Permission

- Request permission only when user initiates recording
- Handle permission denial gracefully
- Don't persist permission state (browser handles this)
- Clear explanation of why permission is needed

### Audio Data Handling

- Audio data stays in browser until upload
- Use existing secure upload mechanism
- Respect TRANSCRIPTION_DELETE_AUDIO_AFTER setting
- No audio data sent to third parties

### XSS Prevention

- Sanitize transcribed text before insertion
- Use ProseMirror's built-in sanitization
- Don't execute any code from transcription response

## Browser Compatibility

### MediaRecorder API Support

| Browser | Version | Support | Preferred Codec |
|---------|---------|---------|-----------------|
| Chrome  | 47+     | ✅      | audio/webm      |
| Firefox | 25+     | ✅      | audio/webm      |
| Safari  | 14.1+   | ✅      | audio/mp4       |
| Edge    | 79+     | ✅      | audio/webm      |

### Codec Selection Strategy

```typescript
function selectBestCodec(): string {
  const codecs = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/wav',
  ];
  
  for (const codec of codecs) {
    if (MediaRecorder.isTypeSupported(codec)) {
      return codec;
    }
  }
  
  // Fallback to default
  return '';
}
```

### Polyfills

No polyfills needed - graceful degradation:
- If MediaRecorder not supported, hide recording option
- Show informational message if user's browser doesn't support it

## Integration with Existing Systems

### Transcription Service

**Reuse Existing API**:
- Endpoint: `POST /api/transcriptions.create`
- Request: `{ attachmentId: string }`
- Response: `{ text: string, speaker_statistics?: object }`

**No Backend Changes Required**:
- Recording produces standard audio file
- Upload via existing `uploadFile` utility
- Transcription service doesn't know if audio was recorded or uploaded

### File Upload

**Reuse Existing Upload Flow**:
```typescript
import { uploadFile } from "~/utils/files";

async function uploadRecording(audioBlob: Blob): Promise<string> {
  const file = new File([audioBlob], "recording.webm", {
    type: audioBlob.type,
  });
  
  const attachment = await uploadFile(file, {
    documentId,
    preset: AttachmentPreset.AudioTranscription,
  });
  
  return attachment.id;
}
```

### Document Editor

**ProseMirror Integration**:
- Add custom node type for placeholder
- Use existing node view infrastructure
- Follow existing patterns for block nodes
- Reuse transaction system for text insertion

### Translations

**New Translation Keys**:
```json
{
  "Start Recording": "Start Recording",
  "Recording": "Recording",
  "Paused": "Paused",
  "Stop Recording": "Stop Recording",
  "Cancel Recording": "Cancel Recording",
  "Pause Recording": "Pause Recording",
  "Resume Recording": "Resume Recording",
  "Recording in progress": "Recording in progress",
  "Microphone access denied": "Microphone access denied",
  "Audio recording is not supported in this browser": "Audio recording is not supported in this browser",
  "Recording duration is long. Consider stopping soon.": "Recording duration is long. Consider stopping soon.",
  "Navigate to recording": "Navigate to recording",
  "Recording in \"{title}\"": "Recording in \"{title}\"",
}
```

## Deployment Considerations

### Feature Flag

**Optional**: Add feature flag for gradual rollout
```typescript
// app/utils/FeatureFlags.ts
export const AUDIO_RECORDING_ENABLED = 
  env.AUDIO_RECORDING_ENABLED !== "false";
```

### Monitoring

**Metrics to Track**:
- Recording start rate
- Recording completion rate
- Average recording duration
- Error rates by type
- Browser/codec distribution
- Transcription success rate for recordings vs uploads

### Rollback Plan

If issues arise:
1. Disable feature via feature flag
2. Hide `/transcript` recording option
3. Existing recordings in progress will complete
4. No data loss (audio files already uploaded)

## Future Enhancements

### Phase 2 (Optional)

1. **Audio Playback**: Play back recording before transcribing
2. **Trim Audio**: Allow user to trim start/end
3. **Multiple Recordings**: Support multiple recordings in one document
4. **Speaker Diarization**: Show speaker labels if transcription service supports it
5. **Real-time Transcription**: Stream audio for live transcription
6. **Audio Quality Settings**: Let user choose quality/file size tradeoff

### Technical Debt to Avoid

- Don't build custom audio processing (use browser APIs)
- Don't create new upload mechanism (reuse existing)
- Don't duplicate transcription logic (reuse existing)
- Don't create new state management pattern (use MobX)

## Open Questions

1. **Recording Duration Limit**: Should we enforce a hard limit (e.g., 4 hours)?
   - Recommendation: Soft warning at 30 minutes, hard limit at 4 hours

2. **Multiple Simultaneous Recordings**: Should we allow recording in multiple documents?
   - Recommendation: No, limit to one active recording at a time

3. **Offline Support**: Should recordings work offline?
   - Recommendation: No for MVP, requires significant complexity

4. **Mobile Support**: Should this work on mobile browsers?
   - Recommendation: Yes, MediaRecorder works on mobile Chrome/Safari

## Conclusion

This design provides a robust, maintainable solution for in-browser audio recording with minimal new infrastructure. By leveraging browser-native APIs and existing systems, we minimize maintenance burden while delivering a seamless user experience. The architecture supports future enhancements while keeping the initial implementation focused and simple.
