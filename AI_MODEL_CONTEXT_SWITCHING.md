# AI Model Context-Based Switching Feature

## Overview

This feature implements intelligent AI model selection based on context length for both "Auto Summary" (AI Generate) and "AI Search" features. The system automatically switches between a primary model and a fallback model depending on the length of the input context.

## Key Features

### 1. Context-Length-Based Model Switching

- **Threshold**: Configurable context length threshold (default: 500 characters)
- **Logic**: 
  - If context length < threshold → Use fallback model (optimized for short contexts)
  - If context length >= threshold → Use primary model (optimized for long contexts)

### 2. Workspace-Level AI Configuration

New admin preferences available in **Workspace → Settings → AI**:

| Setting | Description | Default |
|---------|-------------|---------|
| **Context Length Threshold** | Character count threshold for model switching | 500 |
| **Generate Text Model** | Primary model for AI text generation (long contexts) | From env: `LLM_MODEL_NAME` |
| **Generate Text Fallback Model** | Fallback model for short contexts | From env: `LLM_MODEL_NAME_AI_SEARCH` |
| **AI Search Model** | Primary model for AI search (long contexts) | From env: `LLM_MODEL_NAME_AI_SEARCH` |
| **AI Search Fallback Model** | Fallback model for AI search (short contexts) | From env: `LLM_MODEL_NAME` |
| **Vision Model** | Model for vision/image analysis tasks | From env: `LLM_MODEL_NAME_VISION` |

## Use Cases

### Auto Summary in Recording

When generating summaries from audio transcriptions:
- **Short transcripts** (< 500 chars): Uses `qwen3-30b-a3b-instruct` (faster, cost-effective)
- **Long transcripts** (>= 500 chars): Uses `qwen-3-coder-480b` (better quality for complex content)

### AI Search

When searching documents and generating answers:
- **Short context** (few documents, < 500 chars): Uses fallback model
- **Long context** (many documents, >= 500 chars): Uses primary model

### Generate Text Feature

When generating text with document references:
- Context length = prompt length + context length + referenced documents
- Model selection based on total context length

## Configuration

### Environment Variables (Global Defaults)

Add to `.env` or `.env.development`:

```bash
# API Configuration
LLM_API_KEY=your-api-key
LLM_API_BASE_URL=https://api.example.com

# Model Names
LLM_MODEL_NAME=qwen-3-coder-480b                    # Primary model for generate text
LLM_MODEL_NAME_AI_SEARCH=qwen3-30b-a3b-instruct     # Primary model for AI search
LLM_MODEL_NAME_VISION=grok-4-fast-non-reasoning     # Vision model
```

### Workspace-Level Configuration (Overrides Environment)

Admins can configure per-workspace via API:

```bash
POST /api/team.update
{
  "preferences": {
    "aiContextLengthThreshold": 500,
    "aiGenerateTextModel": "qwen-3-coder-480b",
    "aiGenerateTextFallbackModel": "qwen3-30b-a3b-instruct",
    "aiSearchModel": "qwen3-30b-a3b-instruct",
    "aiSearchFallbackModel": "qwen-3-coder-480b",
    "aiVisionModel": "grok-4-fast-non-reasoning"
  }
}
```

## Implementation Details

### Model Selection Logic

```typescript
// Pseudo-code
if (contextLength < threshold) {
  // Use fallback model for short contexts
  selectedModel = fallbackModel;
  backupModel = primaryModel;
} else {
  // Use primary model for long contexts
  selectedModel = primaryModel;
  backupModel = fallbackModel;
}
```

### Logging

The system logs model selection decisions:

```
INFO: Using fallback model for short context
{
  contextLength: 342,
  threshold: 500,
  primaryModel: "qwen-3-coder-480b",
  fallbackModel: "qwen3-30b-a3b-instruct",
  forAiSearch: false
}
```

## Database Schema

New fields added to `TeamPreferences`:

```typescript
export enum TeamPreference {
  // ... existing preferences
  AiContextLengthThreshold = "aiContextLengthThreshold",
  AiGenerateTextModel = "aiGenerateTextModel",
  AiGenerateTextFallbackModel = "aiGenerateTextFallbackModel",
  AiSearchModel = "aiSearchModel",
  AiSearchFallbackModel = "aiSearchFallbackModel",
  AiVisionModel = "aiVisionModel",
}
```

Stored in `teams.preferences` JSONB column.

## Benefits

1. **Cost Optimization**: Use cheaper/faster models for simple tasks
2. **Quality Optimization**: Use powerful models for complex tasks
3. **Flexibility**: Per-workspace configuration allows different teams to optimize differently
4. **Automatic**: No user intervention required - system decides based on context

## Migration Path

1. Existing workspaces will use environment variable defaults
2. Admins can gradually configure workspace-specific settings
3. No breaking changes - fully backward compatible

## Testing

To test the feature:

1. Set different models in workspace preferences
2. Generate text with short prompt (< 500 chars) - should use fallback
3. Generate text with long prompt (>= 500 chars) - should use primary
4. Check logs to verify model selection

## Future Enhancements

- Token-based counting instead of character-based
- Multiple threshold tiers (small/medium/large)
- Model performance metrics and automatic optimization
- UI for admin settings in the web interface
