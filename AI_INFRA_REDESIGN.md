# AI Infrastructure Redesign - Three-Tier Model System

## Overview

This redesign implements a three-tier AI model system with backend-first architecture to optimize cost, performance, and reliability across all AI-powered features.

## Architecture Changes

### Three-Tier Model System

#### 1. Primary Model (Default: `zai-glm-4.6`)
**Purpose**: Heavy-duty AI tasks requiring high quality and complex reasoning

**Use Cases**:
- AI Summary Generation (full document summaries)
- Generate Text (editor AI text generation)
- AI Ask (conversational RAG search)
- AI Search / AI Answer (semantic search with concise answers)

**Configuration**:
- Environment: `LLM_PRIMARY_MODEL_NAME` (fallback aliases: `LLM_MODEL_NAME`, `AI_MODEL_NAME`, `OPENAI_MODEL_NAME`)
- Team Preference: `AiGenerateTextModel` and `AiSearchModel`

#### 2. Task Model (Default: `qwen3-30b-a3b-instruct`)
**Purpose**: Lightweight, frequent operations optimized for speed and cost

**Use Cases**:
- Document title generation
- Transcript time-segment summaries (for TranscriptCard)
- AI Suggestions (quick editor suggestions)
- Archive location suggestions
- Topic extraction and classification

**Configuration**:
- Environment: `LLM_TASK_MODEL_NAME` (aliases: `LLM_TASK_MODEL`, `AI_TASK_MODEL`, `TASK_MODEL`)
- Team Preference: `AiTaskModel`

#### 3. Fallback Model (Default: `GLM-4.6`)
**Purpose**: Universal backup when Primary or Task models fail

**Triggers**:
- Rate limit errors (429, "too many requests")
- Context window overflow (400 with context_length_exceeded)
- Service unavailable (500, 503)
- Other provider failures

**Configuration**:
- Environment: `LLM_FALLBACK_MODEL_NAME` (aliases: `LLM_FALLBACK_MODEL`, `AI_FALLBACK_MODEL`, `FALLBACK_MODEL`)
- Team Preference: `AiFallbackModel`

---

## Implementation Details

### Backend Changes

#### 1. Environment Variables (`server/env.ts`)

**New Variables**:
```typescript
LLM_API_KEY                 // API key for LLM services
LLM_API_BASE_URL            // Base URL for LLM API endpoints
LLM_PRIMARY_MODEL_NAME      // Primary model (default: zai-glm-4.6)
LLM_TASK_MODEL_NAME         // Task model (default: qwen3-30b-a3b-instruct)
LLM_FALLBACK_MODEL_NAME     // Fallback model (default: GLM-4.6)
LLM_MODEL_NAME_AI_SEARCH    // Optional search-specific model
LLM_MODEL_NAME_SENSITIVE    // Optional sensitive/privacy model
LLM_MODEL_NAME_VISION       // Optional vision model
LLM_MAX_CONTEXT_LENGTH      // Context threshold (default: 15000 chars)
```

**Backward Compatibility**: All existing environment variable aliases are preserved.

#### 2. Team Preferences (`shared/types.ts`)

**New Preferences**:
```typescript
enum TeamPreference {
  // ... existing preferences
  AiTaskModel = "aiTaskModel",              // Task model override
  AiFallbackModel = "aiFallbackModel",      // Universal fallback override
}
```

**Existing Preferences** (still supported):
- `AiGenerateTextModel` - Now maps to Primary model
- `AiSearchModel` - Now maps to Primary model
- `AiVisionModel` - Vision tasks (unchanged)

#### 3. Model Selection (`server/routes/api/ai/ai.ts`)

**Refactored `getModelConfig()` function**:
```typescript
/**
 * Three-tier AI model selection system
 */
const getModelConfig = async (
  purpose: 'primary' | 'task' = 'primary',
  teamId?: string,
  contextLength?: number
) => {
  // Returns: { apiKey, apiBase, model, fallbackModel }
}
```

**Changes**:
- Replaced boolean `forAiSearch` parameter with `purpose: 'primary' | 'task'`
- Removed context-length-based model switching
- Implemented universal fallback for both Primary and Task models
- Simplified model selection logic

**Usage Examples**:
```typescript
// For AI Ask, AI Search, Generate Text, AI Summary
const config = await getModelConfig('primary', user.teamId);

// For title generation, summaries, suggestions
const config = await getModelConfig('task', user.teamId);
```

#### 4. Service Updates

**AIArchiveSuggestionService** (`server/services/AIArchiveSuggestionService.ts`):
- Updated to use Task model for lightweight operations
- Title generation
- Topic extraction
- Document type classification
- Archive location suggestions

---

### Frontend Changes

#### Settings UI (`app/scenes/Settings/AI.tsx`)

**Redesigned UI Structure**:

1. **Primary Model Section**
   - Single configuration for all heavy-duty tasks
   - Syncs both `AiGenerateTextModel` and `AiSearchModel`
   - Default: zai-glm-4.6

2. **Task Model Section**
   - Configuration for lightweight, frequent operations
   - Default: qwen3-30b-a3b-instruct

3. **Fallback Model Section**
   - Universal fallback for both Primary and Task
   - Default: GLM-4.6

4. **Vision Model Section** (unchanged)
   - Specialized for image analysis

5. **Transcription Endpoint** (unchanged)
   - Audio transcription service URL

**Removed**:
- Context length threshold setting
- Separate "Text Generation" and "AI Search" sections with individual fallbacks

**Model Suggestions** (when API unavailable):
```
- zai-glm-4.6 (Primary default)
- GLM-4.6 (Fallback default)
- qwen3-30b-a3b-instruct (Task default)
- qwen-3-coder-480b
- grok-4-fast-non-reasoning
```

---

## Benefits

### 1. Cost Optimization
- **Task model** handles frequent, lightweight operations at lower cost
- **Primary model** reserved for complex tasks requiring high quality
- Reduced token usage through smart model routing

### 2. Performance Optimization
- Faster response times for title generation and summaries (Task model)
- No context-length computation overhead
- Streamlined model selection logic

### 3. Reliability
- **Universal fallback** handles both Primary and Task model failures
- Consistent error recovery strategy
- Reduced complexity in fallback logic

### 4. Simplified Configuration
- Clear, purpose-based model tiers
- Unified fallback model (one config for all)
- Easier to understand and maintain

### 5. Backward Compatibility
- All existing environment variables still work
- Existing team preferences continue to function
- Gradual migration path for deployments

---

## Migration Guide

### For New Deployments

Set the following environment variables:

```bash
# Required
LLM_API_KEY=your-api-key
LLM_API_BASE_URL=https://your-llm-provider.com

# Optional (defaults shown)
LLM_PRIMARY_MODEL_NAME=zai-glm-4.6
LLM_TASK_MODEL_NAME=qwen3-30b-a3b-instruct
LLM_FALLBACK_MODEL_NAME=GLM-4.6
```

### For Existing Deployments

**Option 1: No Changes Required**
- Existing `LLM_MODEL_NAME` will be used as Primary model
- Existing `LLM_MODEL_NAME_AI_SEARCH` will be used for search
- System will use defaults for Task and Fallback models

**Option 2: Explicit Migration**
1. Set `LLM_PRIMARY_MODEL_NAME` to your current primary model
2. Set `LLM_TASK_MODEL_NAME` to a lightweight model (recommended: qwen3-30b-a3b-instruct)
3. Set `LLM_FALLBACK_MODEL_NAME` to a reliable backup (recommended: GLM-4.6)
4. Remove old variables after verification

### Team-Level Configuration

In Settings → AI:
1. **Primary Model**: Select high-quality model for complex tasks
2. **Task Model**: Select lightweight, fast model for frequent operations
3. **Fallback Model**: Select reliable backup model
4. **Vision Model**: (optional) Select vision-capable model

---

## Technical Details

### Model Selection Flow

```
┌─────────────────────────────────────────┐
│ getModelConfig(purpose, teamId)         │
└──────────────┬──────────────────────────┘
               │
               ├─► Check Team Preferences
               │   ├─► AiTaskModel (if purpose='task')
               │   ├─► AiGenerateTextModel / AiSearchModel (if purpose='primary')
               │   └─► AiFallbackModel (universal)
               │
               ├─► Fallback to Environment Variables
               │   ├─► LLM_TASK_MODEL_NAME (if purpose='task')
               │   ├─► LLM_PRIMARY_MODEL_NAME (if purpose='primary')
               │   └─► LLM_FALLBACK_MODEL_NAME (universal)
               │
               └─► Return { apiKey, apiBase, model, fallbackModel }
```

### Fallback Mechanism

```
┌─────────────────┐
│ Primary/Task    │
│ Model Request   │
└────────┬────────┘
         │
         ├─► Success ──────────► Return Response
         │
         ├─► Rate Limit (429) ─┐
         ├─► Context Overflow ──┤
         ├─► Service Error ─────┼─► Retry with Fallback Model
         └─► Other Failure ─────┘
                                │
                                └─► Success ──────────► Return Response
                                │
                                └─► Failure ──────────► Return Error
```

### Error Handling

**Retry Conditions** (`shouldRetryWithFallback()`):
- `429` - Rate limit exceeded
- `400` + context_length_exceeded - Context window overflow
- `500`, `503` - Service unavailable
- "too many requests", "no server is available" - Provider issues

**Non-Retry Conditions**:
- `400` (non-context errors) - Invalid request
- `401`, `403` - Authentication/authorization errors
- `404` - Endpoint not found

---

## API Reference

### getModelConfig(purpose, teamId?, contextLength?)

**Purpose-based model selection**

**Parameters**:
- `purpose` - `'primary' | 'task'` - Model tier to use
- `teamId` - `string` (optional) - Team ID for preferences
- `contextLength` - `number` (optional) - For logging only (not used for selection)

**Returns**:
```typescript
{
  apiKey: string;
  apiBase: string;
  model: string;          // Selected model for the purpose
  fallbackModel: string;  // Universal fallback model
}
```

**Examples**:
```typescript
// AI Ask, AI Search, Generate Text, AI Summary
const config = await getModelConfig('primary', user.teamId);

// Title generation, transcript summaries, suggestions
const config = await getModelConfig('task', user.teamId);
```

---

## Testing

### Manual Testing Checklist

- [ ] AI Ask feature works with Primary model
- [ ] AI Search returns results with Primary model
- [ ] Generate Text uses Primary model
- [ ] Title generation uses Task model
- [ ] Transcript summaries use Task model
- [ ] Archive suggestions use Task model
- [ ] Fallback triggers on rate limit (429)
- [ ] Fallback triggers on context overflow
- [ ] Fallback triggers on service unavailable
- [ ] Settings UI displays three tiers correctly
- [ ] Changing Primary model in Settings works
- [ ] Changing Task model in Settings works
- [ ] Changing Fallback model in Settings works
- [ ] Environment variables override defaults
- [ ] Team preferences override environment

### Integration Testing

```bash
# Build server
yarn build:server

# Run tests
yarn test

# Start development server
yarn dev
```

---

## Troubleshooting

### Issue: "AI configuration is incomplete"

**Cause**: Missing `LLM_API_KEY` or `LLM_API_BASE_URL`

**Solution**:
```bash
export LLM_API_KEY=your-api-key
export LLM_API_BASE_URL=https://your-provider.com
```

### Issue: Model not found (404)

**Cause**: Configured model doesn't exist in provider's model list

**Solution**:
1. Check available models via Settings → AI
2. Select a valid model from the dropdown
3. Or set correct model name in environment variables

### Issue: Rate limits with fallback

**Cause**: Both Primary/Task and Fallback models hitting rate limits

**Solution**:
1. Increase rate limits with provider
2. Configure different fallback model with separate quota
3. Implement request queuing or throttling

---

## Future Enhancements

### Potential Improvements

1. **Dynamic Model Selection**
   - Automatic model routing based on request complexity
   - Cost/performance profiling per feature

2. **Model Health Monitoring**
   - Track success/failure rates per model
   - Automatic model switching on degraded performance

3. **Per-Feature Model Configuration**
   - Fine-grained control: different models for AI Ask vs Generate Text
   - User-level model preferences

4. **Caching Layer**
   - Cache responses for identical requests
   - Reduce API calls and costs

5. **A/B Testing Framework**
   - Compare model performance across features
   - Data-driven model selection

---

## Changelog

### v1.0.0 - 2025-01-08

**Added**:
- Three-tier model system (Primary, Task, Fallback)
- Purpose-based model selection (`'primary' | 'task'`)
- Universal fallback mechanism
- New environment variables for model configuration
- New team preferences: `AiTaskModel`, `AiFallbackModel`
- Redesigned Settings → AI UI

**Changed**:
- Refactored `getModelConfig()` function signature
- Updated AIArchiveSuggestionService to use Task model
- Simplified model selection logic
- Removed context-length-based switching

**Deprecated**:
- Context length threshold setting (preserved in DB, not used)
- Separate fallback models for text generation and search

**Backward Compatible**:
- All existing environment variable aliases preserved
- Existing team preferences continue to work
- Gradual migration path for deployments

---

## Contact

For questions or issues related to the AI infrastructure redesign:
1. Check this documentation first
2. Review the code comments in `server/routes/api/ai/ai.ts`
3. Open an issue on GitHub with `[AI-INFRA]` prefix
