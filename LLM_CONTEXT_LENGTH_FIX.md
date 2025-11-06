# LLM Context Length Fallback Fix

## Problem

The `qwen3-30b-a3b-instruct` model was receiving contexts that exceeded its maximum capacity (~15000 characters), causing requests to fail. The system had fallback logic, but it only triggered AFTER a failed request, not proactively.

Example error log:
```
[backend] [api] info: [utils] AI Ask LLM request {
  "model":"qwen3-30b-a3b-instruct",
  "contextLength":27073,  // Too large!
  ...
}
```

## Solution

Added **proactive context length checking** that switches to the fallback model BEFORE making the request if the context exceeds the model's capacity.

### Changes Made

1. **server/routes/api/ai/ai.ts**
   - Added context length check in both `ai.ask` and `ai.search` endpoints
   - If `context.length > MAX_CONTEXT_LENGTH` and a fallback model is configured, automatically use the fallback model
   - Prevents the primary model from receiving contexts it cannot handle

2. **.env.sample**
   - Added new environment variable: `LLM_MAX_CONTEXT_LENGTH`
   - Default value: 15000 characters
   - Configurable per deployment based on the primary model's capabilities

### Configuration

Add to your `.env` file:

```bash
# Maximum context length (in characters) that the primary LLM model can handle
# If the context exceeds this limit, the system will automatically use the fallback model
# Some models like qwen3-30b-a3b-instruct can only handle ~15000 characters
# Defaults to 15000
LLM_MAX_CONTEXT_LENGTH=15000
```

### How It Works

**Before (Reactive):**
1. Send request to primary model with large context
2. Request fails with context length error
3. Retry with fallback model

**After (Proactive):**
1. Check context length before making request
2. If context > MAX_CONTEXT_LENGTH, use fallback model immediately
3. No failed request, faster response time

### Logging

The system now logs when it switches to the fallback model:

```
[utils] Context too large for primary model, using fallback {
  "primaryModel": "qwen3-30b-a3b-instruct",
  "fallbackModel": "qwen-3-coder-480b",
  "contextLength": 27073,
  "maxContextLength": 15000,
  "userId": "..."
}
```

### Testing

To test the fix:
1. Set `LLM_MAX_CONTEXT_LENGTH=15000` in your `.env`
2. Configure a primary model (e.g., `qwen3-30b-a3b-instruct`) and fallback model
3. Ask a question that retrieves many documents (large context)
4. Check logs - should see "Context too large for primary model, using fallback"
5. Request should succeed without errors

### Notes

- This is separate from the existing `AiContextLengthThreshold` team preference, which is used for switching models based on SHORT contexts (< 500 chars)
- The new `LLM_MAX_CONTEXT_LENGTH` is for preventing contexts that are TOO LARGE for the model
- Both mechanisms can work together:
  - Short contexts (< 500): Use fast model
  - Medium contexts (500-15000): Use primary model
  - Large contexts (> 15000): Use fallback model with larger capacity
