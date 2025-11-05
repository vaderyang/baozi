# Audio Recording: Remove Live Preview & Add Auto-Summary Feature

## Overview
This document outlines the implementation plan for modifying the audio recording/transcription feature with three key changes:
1. Remove live transcript preview functionality during recording
2. Remove live transcription toast notifications
3. Add optional auto-summary generation after transcription completes

## Current Flow
```
Recording → Upload → Transcription → Insert: [Audio Attachment] + ## Transcript + [Transcript Text]
```

## New Flow
```
Recording → Upload → Transcription → [Optional AI Summary] → Insert: [Audio Attachment] + [Summary (if enabled)] + ## Transcript + [Transcript Text]
```

## Requirements

### 1. Remove Live Preview Functionality
- Remove the real-time transcript preview that appears during recording
- Remove `useSpeechRecognition` hook usage from `RecordingPlaceholderCard`
- Keep the hook file for potential future use
- Maintain audio recording controls (start/pause/resume/stop)

### 2. Remove Live Transcription Prompts/Toasts
- Remove toast messages about browser support for live transcription
- Remove hints like "Live transcript preview not supported in this browser"
- Remove "Listening..." state messages
- Clean up related i18n keys

### 3. Add Auto-Summary Feature
- Add checkbox in recording UI: "Auto-generate summary"
- Checkbox state stored in `AudioRecorderStore.autoGenerateSummary`
- When enabled and transcription completes:
  - Call `/ai.generate` API with prompt: "Summarize a meeting minute based on the following transcript by using the language mainly used in the transcript:"
  - Use existing AI generation with fallback mechanism (same as Generate Text feature)
  - Insert summary between audio attachment and transcript
- If disabled or AI generation fails, skip summary and insert transcript normally

## Implementation Plan

### Step 1: Setup
- Create feature branch: `feat/audio-remove-live-preview-add-auto-summary`
- Save this plan to `docs/plan/audio_remove_live_preview_add_auto_summary.md`

### Step 2: Add Auto-Summary State to AudioRecorderStore
**File:** `app/stores/AudioRecorderStore.ts`

Add:
```typescript
@observable
autoGenerateSummary = false;

@action
setAutoGenerateSummary = (value: boolean): void => {
  this.autoGenerateSummary = value;
};
```

Reset in cleanup:
```typescript
this.autoGenerateSummary = false;
```

### Step 3: Remove Live Preview from RecordingPlaceholderCard
**File:** `app/components/RecordingPlaceholderCard.tsx`

Remove:
- Import and usage of `useSpeechRecognition`
- `TranscriptSection` component and related styled components
- All speech recognition lifecycle methods (startListening, stopListening, pauseListening, resumeListening)
- State: `transcript`, `interimTranscript`, `isListening`, `isSpeechSupported`
- Effects that start/stop speech recognition
- Toast notifications about browser support

Keep:
- Audio recording controls
- Recording status display
- Duration tracking
- Error handling for audio recording

### Step 4: Add Auto-Summary Checkbox to RecordingPlaceholderCard
**File:** `app/components/RecordingPlaceholderCard.tsx`

Add checkbox UI:
```tsx
const { audioRecorder } = useStores();

// In the render, add before button controls:
<AutoSummaryOption>
  <label>
    <input
      type="checkbox"
      checked={audioRecorder.autoGenerateSummary}
      onChange={(e) => audioRecorder.setAutoGenerateSummary(e.target.checked)}
      disabled={!canControlRecording}
    />
    <span>{t("Auto-generate summary")}</span>
  </label>
</AutoSummaryOption>
```

Add styled component:
```typescript
const AutoSummaryOption = styled.div`
  padding: 8px 0;
  
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
    color: ${s("text")};
    
    input[type="checkbox"] {
      cursor: pointer;
    }
    
    &:has(input:disabled) {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
`;
```

### Step 5: Update i18n Files

**Add new key:**
- `shared/i18n/locales/en_US/translation.json`: `"Auto-generate summary": "Auto-generate summary"`
- `shared/i18n/locales/zh_CN/translation.json`: `"Auto-generate summary": "自动生成摘要"`
- `shared/i18n/locales/zh_TW/translation.json`: `"Auto-generate summary": "自動生成摘要"`

**Remove keys:**
- `"Live transcript preview not supported in this browser"`
- `"Listening..."`

### Step 6: Implement AI Summary Generation in TranscriptionStatusManager
**File:** `app/editor/components/TranscriptionStatusManager.tsx`

Add imports:
```typescript
import { client } from "~/utils/ApiClient";
import useStores from "~/hooks/useStores";
```

Modify `replaceStatusCardWithTranscript` function:

```typescript
const replaceStatusCardWithTranscript = React.useCallback(
  async (
    jobId: string,
    result: TranscriptionStatusEvent["result"],
    attachmentId?: string
  ) => {
    // ... existing code to find card and format transcript ...

    const formattedText = formatTranscriptText(result);
    if (!formattedText) {
      // ... existing empty transcript handling ...
      return;
    }

    // Build content to insert
    let contentMarkdown = "";

    // Add audio attachment
    if (attachmentId && schema.nodes.attachment) {
      const attachmentUrl = `/api/attachments.redirect?id=${attachmentId}`;
      contentMarkdown += `[${fileName} ${fileSize}](${attachmentUrl})\n\n`;
    }

    // Generate AI summary if enabled
    const { audioRecorder } = useStores();
    if (audioRecorder.autoGenerateSummary) {
      try {
        Logger.info("editor", "Generating AI summary for transcript", { jobId });
        
        const prompt = "Summarize a meeting minute based on the following transcript by using the language mainly used in the transcript:";
        const response = await client.post<{ data: { text?: string } }>(
          "/ai.generate",
          { 
            prompt, 
            context: formattedText 
          },
          { retry: false }
        );

        const summary = response?.data?.text?.trim();
        if (summary) {
          contentMarkdown += `${summary}\n\n`;
          Logger.info("editor", "AI summary generated successfully", { 
            jobId, 
            summaryLength: summary.length 
          });
        } else {
          Logger.warn("AI summary generation returned empty result", { jobId });
        }
      } catch (error) {
        Logger.error("Failed to generate AI summary", error as Error, { jobId });
        // Continue without summary - don't block transcript insertion
      }
    }

    // Add transcript heading and content
    const transcriptHeading = dictionary.transcript || "Transcript";
    contentMarkdown += `## ${transcriptHeading}\n\n\`\`\`\n${formattedText}\n\`\`\`\n\n`;

    // ... rest of existing code to parse and insert markdown ...
  },
  [dictionary, formatTranscriptText]
);
```

### Step 7: Cleanup
- Remove dead imports and unused code
- Remove references to removed i18n keys
- Run TypeScript type checking
- Run linter

### Step 8: Testing

**Manual QA Scenarios:**

1. **Live Preview Removal:**
   - Start recording → Verify no live transcript preview appears
   - Verify no toast about browser support

2. **Auto-Summary Disabled (default):**
   - Uncheck "Auto-generate summary"
   - Complete recording and transcription
   - Verify document structure: `[Audio] → [Transcript]`

3. **Auto-Summary Enabled:**
   - Check "Auto-generate summary"
   - Complete recording and transcription
   - Verify document structure: `[Audio] → [Summary] → [Transcript]`
   - Verify summary is in the same language as the transcript

4. **Checkbox Behavior:**
   - Verify checkbox is only enabled during recording/paused states
   - Verify checkbox state persists within same recording session
   - Toggle checkbox during recording → verify state changes

5. **Multi-Language:**
   - Test in English → Verify "Auto-generate summary"
   - Test in Chinese (Simplified) → Verify "自动生成摘要"
   - Test in Chinese (Traditional) → Verify "自動生成摘要"

6. **Error Handling:**
   - Simulate AI generation failure
   - Verify transcript still inserts successfully without summary

7. **Edge Cases:**
   - Empty transcript → No summary generated
   - Very long transcript → Summary generation handles gracefully
   - Navigation away during recording → State preserved

## Files Modified

### Core Implementation
- `app/stores/AudioRecorderStore.ts` - Add autoGenerateSummary state
- `app/components/RecordingPlaceholderCard.tsx` - Remove live preview, add checkbox
- `app/editor/components/TranscriptionStatusManager.tsx` - Add AI summary generation

### i18n
- `shared/i18n/locales/en_US/translation.json`
- `shared/i18n/locales/zh_CN/translation.json`
- `shared/i18n/locales/zh_TW/translation.json`

### Preserved
- `app/hooks/useSpeechRecognition.ts` - Keep file, remove usage

## Success Criteria

- ✅ No live transcript preview during recording
- ✅ No toast messages about live transcription
- ✅ "Auto-generate summary" checkbox appears and functions correctly
- ✅ When enabled, AI summary is generated and inserted between audio and transcript
- ✅ When disabled, only transcript is inserted (current behavior)
- ✅ AI generation uses existing fallback mechanism
- ✅ Translations work in all supported languages
- ✅ No TypeScript errors or lint warnings
- ✅ All manual QA scenarios pass

## Rollout Notes

- Feature is opt-in via checkbox (default: disabled)
- No breaking changes to existing recordings
- AI generation uses existing `/ai.generate` endpoint with fallback
- If AI generation fails, transcript insertion proceeds normally
- User preference could be persisted in future enhancement

## Future Enhancements (Out of Scope)

- Persist auto-summary preference across sessions
- Allow customization of summary prompt
- Add summary regeneration button
- Support for different summary formats (bullet points, paragraphs, etc.)
