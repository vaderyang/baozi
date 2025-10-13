# Text AI Card Implementation Plan

## Overview
Add a new inline block node called "Text AI Card" to the Outline editor that allows users to generate text content using an LLM (OpenAI-compatible API) by typing `/text-ai` in the slash command menu.

## Goals
- Enable users to generate AI-powered text content directly within documents
- Provide an intuitive UI for prompting and regenerating content
- Support OpenAI-compatible API providers (OpenAI, Azure OpenAI, local models via Ollama, etc.)
- Maintain full editability of generated content as standard document text
- Follow existing Outline patterns for nodes, styling, and API integration

## Requirements

### Functional Requirements
1. **Slash Command Integration**
   - Trigger: `/text-ai` in the block menu
   - Creates a new Text AI Card block node

2. **Text AI Card UI States**
   - **Initial/Configure State** (not yet generated):
     - Prompt input box (textarea) visible
     - "Generate" button
     - Border visible (light blue, rounded corners)
   - **Generated State**:
     - Generated content displayed as editable paragraphs
     - Prompt collapsed/hidden
     - "Settings" and "Generate" buttons visible in top-right
     - Border hidden (unless hover or focus)
   - **Editing Prompt State** (after clicking Settings):
     - Prompt box re-expanded
     - Can modify prompt and regenerate (replaces all content)

3. **Content Generation Flow**
   - User enters prompt
   - Clicks Generate
   - Loading state shown
   - Backend calls LLM API
   - Generated text inserted as editable paragraphs
   - Prompt collapses, Settings button appears

4. **Styling Requirements**
   - Border: light/slim blurred blue border with rounded corners
   - Border visibility:
     - Always shown: when not generated, on hover, or when selected/focused
     - Hidden: when generated, not hovered, and not focused
   - Generated content: looks like normal document text
   - Buttons: positioned top-right with appropriate spacing

5. **Data Persistence**
   - Node attributes: `prompt` (string), `generated` (boolean)
   - Content: standard ProseMirror paragraphs (fully editable)
   - Markdown serialization: custom fenced code block format

### Non-Functional Requirements
- **Security**: API key stored server-side only
- **Performance**: Non-blocking API calls with loading states
- **Compatibility**: Works with existing collaboration, undo/redo, clipboard
- **Extensibility**: OpenAI-compatible API allows various providers

## Technical Architecture

### Backend Components

#### 1. Environment Configuration (`/server/env.ts`)
Add three new environment variables:
```typescript
/**
 * API key for LLM provider (OpenAI-compatible)
 */
@IsOptional()
public LLM_API_KEY = this.toOptionalString(environment.LLM_API_KEY);

/**
 * Base URL for LLM API endpoint (OpenAI-compatible)
 * Example: https://api.openai.com/v1
 */
@IsOptional()
@IsUrl()
public LLM_API_BASE_URL = this.toOptionalString(
  environment.LLM_API_BASE_URL
);

/**
 * Model name/identifier for LLM
 * Example: gpt-4o-mini, gpt-4, llama3.1
 */
@IsOptional()
public LLM_MODEL_NAME = environment.LLM_MODEL_NAME ?? "gpt-4o-mini";
```

#### 2. API Route Schema (`/server/routes/api/ai/schema.ts`)
```typescript
import { z } from "zod";

export const GenerateSchema = z.object({
  body: z.object({
    prompt: z.string().min(1).max(4000),
  }),
});

export type GenerateReq = z.infer<typeof GenerateSchema>;
export type GenerateRes = { text: string };
```

#### 3. AI Route Handler (`/server/routes/api/ai/ai.ts`)
- POST endpoint: `/api/ai.generate`
- Authentication: require authenticated user
- Validation: use Zod schema
- LLM API call:
  ```typescript
  POST ${LLM_API_BASE_URL}/chat/completions
  Headers: 
    Authorization: Bearer ${LLM_API_KEY}
    Content-Type: application/json
  Body:
    {
      "model": env.LLM_MODEL_NAME,
      "messages": [{"role": "user", "content": prompt}],
      "temperature": 0.7
    }
  ```
- Response parsing: extract `choices[0].message.content`
- Error handling: 400, 401, 429, 5xx with appropriate error classes

#### 4. Router Registration (`/server/routes/api/ai/index.ts`, `/server/routes/api/index.ts`)
- Create router mounting ai.generate
- Register in main API router

### Frontend Components

#### 1. TextAICard Node (`/shared/editor/nodes/TextAICard.tsx`)
ProseMirror node definition extending ReactNode:
- **Name**: `text_ai_card`
- **Group**: `block`
- **Content**: `block+` (allows nested paragraphs)
- **Attributes**:
  - `prompt`: string (default: "")
  - `generated`: boolean (default: false)
- **Schema properties**:
  - `atom`: false
  - `defining`: true
  - `selectable`: true
- **Commands**:
  - `insertTextAICard()`: insert node with empty prompt
- **Markdown serialization**:
  ```markdown
  ```text-ai {"prompt":"...", "generated":true}
  <nested paragraph content>
  ```
  ```

#### 2. TextAICard Component (`/shared/editor/components/TextAICard.tsx`)
React component for rendering the card:
- **State management**:
  - `isHover`: boolean
  - `isLoading`: boolean
  - `showPrompt`: boolean (initially true, false after generation)
- **UI Elements**:
  - Prompt textarea
  - Generate button (primary action)
  - Settings button (toggle prompt visibility)
  - Content container (contentDOM for editable paragraphs)
- **Event Handlers**:
  - `handleGenerate()`: validate, call API, update content
  - `handleSettings()`: toggle `showPrompt`
- **Styling**:
  - Conditional border based on state/hover/focus
  - Absolute positioned buttons (top-right)
  - Content area inherits document styles

#### 3. Block Menu Integration (`/app/editor/menus/block.tsx`)
Add menu item:
```typescript
{
  name: "text_ai_card",
  title: dictionary.textAICard,
  icon: <MagicWandIcon />, // or suitable icon
  keywords: "text ai generate llm gpt",
}
```

#### 4. Extension Registration (`/shared/editor/nodes/index.ts`)
Add TextAICard to `richExtensions` array.

### Data Flow

#### Generation Flow
1. User types `/text-ai` → TextAICard node inserted
2. User enters prompt in textarea
3. User clicks "Generate"
4. Component calls `ApiClient.post('/ai.generate', { prompt })`
5. Backend validates request, calls LLM API
6. Backend returns `{ text: "generated content..." }`
7. Component splits text into paragraphs (on `\n\n`)
8. Component creates ProseMirror transaction:
   - Sets node attrs: `{ prompt, generated: true }`
   - Replaces node content with paragraph nodes
9. Prompt collapses, content becomes editable

#### Regeneration Flow
1. User clicks "Settings" → prompt expands
2. User modifies prompt, clicks "Generate"
3. Same API call as above
4. **All existing content replaced** with new paragraphs
5. Prompt collapses again

### Markdown Serialization

#### Export Format
```markdown
```text-ai {"prompt":"List top mountains in the world","generated":true}
Mount Everest is the highest mountain in the world.

K2 is the second highest mountain.
```
```

#### Import/Parse
- Custom markdown-it rule recognizes `text-ai` fence
- Parses JSON from info string to restore `prompt` and `generated` attrs
- Parses nested markdown content as paragraphs

## File Changes

### New Files
- `/server/routes/api/ai/schema.ts` - Zod schemas
- `/server/routes/api/ai/ai.ts` - Route handler
- `/server/routes/api/ai/index.ts` - Router export
- `/shared/editor/nodes/TextAICard.tsx` - Node definition
- `/shared/editor/components/TextAICard.tsx` - React component

### Modified Files
- `/server/env.ts` - Add LLM env vars
- `/server/routes/api/index.ts` - Register AI router
- `/shared/editor/nodes/index.ts` - Register TextAICard
- `/app/editor/menus/block.tsx` - Add menu item
- `.env.sample` - Document env vars
- `.env.development` - Add dev defaults

## Testing Plan

### Unit Tests
1. **Schema validation**: prompt length limits, required fields
2. **Markdown serialization**: roundtrip (serialize → parse → same structure)
3. **API handler**: mock LLM response, verify return format

### Integration Tests
1. **API endpoint**: authenticated request returns text
2. **Error handling**: 401, 429, 500 responses handled correctly
3. **Editor commands**: insertTextAICard creates correct node

### Manual QA Checklist
- [ ] Insert TextAICard via `/text-ai`
- [ ] Enter prompt and generate content
- [ ] Verify content is fully editable
- [ ] Verify border shows/hides correctly
- [ ] Click Settings, modify prompt, regenerate
- [ ] Verify regeneration replaces all content
- [ ] Test hover/focus border behavior
- [ ] Test undo/redo (single transaction)
- [ ] Copy/paste card within editor
- [ ] Export document to markdown
- [ ] Import markdown with text-ai fence
- [ ] Test in read-only mode
- [ ] Test with authentication errors
- [ ] Test with rate limiting
- [ ] Test with network errors

## Security Considerations

1. **API Key Protection**
   - Stored server-side only (never exposed to client)
   - Validated in environment config
   - Never logged or included in error messages

2. **Input Validation**
   - Prompt length limited (1-4000 chars)
   - Authentication required for API calls
   - CSRF token validated

3. **Error Handling**
   - Safe error messages (no sensitive data leakage)
   - Rate limiting information not exposed
   - Provider errors sanitized

## Performance Considerations

1. **API Calls**
   - Non-blocking with loading states
   - Timeout handling (provider may be slow)
   - Error recovery (retry logic if needed)

2. **Content Rendering**
   - Efficient paragraph splitting (regex-based)
   - React component memoization where appropriate
   - No layout thrashing (border transitions)

## Future Enhancements

1. **Advanced Features**
   - Streaming responses (SSE)
   - Multiple LLM providers selection
   - Temperature/model selection in UI
   - Conversation history (multiple turns)

2. **UX Improvements**
   - Inline editing of prompt without expand
   - Preview mode before accepting generation
   - Diff view for regeneration

3. **Integration**
   - Document-wide AI features (summarize, rewrite)
   - Template prompts library
   - Prompt history/favorites

## Implementation Phases

### Phase 1: Backend Foundation (Tasks 1-6)
- Environment configuration
- API route implementation
- Router registration

### Phase 2: Editor Node (Tasks 7-9)
- Node definition
- React component
- Extension registration

### Phase 3: UI Integration (Tasks 10-12)
- Block menu
- API client wiring
- Styling polish

### Phase 4: Polish & Testing (Tasks 13-16)
- Markdown serialization
- Collaboration/undo
- Tests and QA
- Documentation

### Phase 5: Deployment (Task 17)
- Code review
- Merge to main

## Success Criteria

1. ✅ User can insert Text AI Card via `/text-ai`
2. ✅ User can enter prompt and generate content
3. ✅ Generated content is fully editable like regular text
4. ✅ Prompt can be modified and content regenerated
5. ✅ Border behavior matches specifications
6. ✅ Markdown export/import preserves card and content
7. ✅ No security vulnerabilities (API key protected)
8. ✅ Error handling provides good UX
9. ✅ Works with collaboration and undo/redo
10. ✅ Documentation complete

## Timeline Estimate

- **Phase 1**: 2-3 hours
- **Phase 2**: 3-4 hours
- **Phase 3**: 2-3 hours
- **Phase 4**: 2-3 hours
- **Phase 5**: 1-2 hours

**Total**: 10-15 hours of development time

## Dependencies

- OpenAI-compatible API provider (OpenAI, Azure, Ollama, etc.)
- Existing editor infrastructure (ProseMirror, React, styled-components)
- API client and authentication middleware
- Markdown parser/serializer

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM API costs | Rate limiting, user quotas |
| API latency | Loading states, timeout handling |
| Provider unavailability | Graceful error messages, retry logic |
| Complex markdown | Extensive testing, fallback to plain text |
| Content conflicts in collaboration | Single transaction updates, proper selection |

---

**Document Status**: Draft  
**Last Updated**: 2025-10-13  
**Author**: AI Assistant  
**Reviewers**: TBD
