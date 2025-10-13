# AI API Testing Guide

## Dev Mode Authentication Bypass

In development mode, the AI API endpoint supports a special authentication bypass for testing purposes.

### How It Works

When `NODE_ENV=development`, you can bypass normal authentication by including a special header:

```
X-Dev-API-Key: dev_test_key
```

### Testing the API

#### Using the Test Script

```bash
./scripts/test-ai-api.sh
```

#### Using curl

```bash
curl -X POST http://localhost:3030/api/ai.generate \
  -H "Content-Type: application/json" \
  -H "X-Dev-API-Key: dev_test_key" \
  -d '{
    "prompt": "Write a haiku about programming"
  }'
```

#### Expected Response

```json
{
  "data": {
    "text": "Generated text content here..."
  }
}
```

### Configuration

Make sure your `.env` file has the LLM configuration:

```env
LLM_API_KEY=your_api_key
LLM_API_BASE_URL=http://your-llm-endpoint/v1
LLM_MODEL_NAME=your-model-name
```

### Testing with Different Prompts

```bash
# Simple greeting
curl -X POST http://localhost:3030/api/ai.generate \
  -H "Content-Type: application/json" \
  -H "X-Dev-API-Key: dev_test_key" \
  -d '{"prompt": "Say hello"}'

# Code generation
curl -X POST http://localhost:3030/api/ai.generate \
  -H "Content-Type: application/json" \
  -H "X-Dev-API-Key: dev_test_key" \
  -d '{"prompt": "Write a Python function to calculate fibonacci"}'

# Content generation
curl -X POST http://localhost:3030/api/ai.generate \
  -H "Content-Type: application/json" \
  -H "X-Dev-API-Key: dev_test_key" \
  -d '{"prompt": "List the top 5 mountains in the world with their heights"}'
```

### Security Notes

⚠️ **IMPORTANT**: The dev mode bypass is **ONLY** available when:
- `NODE_ENV=development`
- The special header `X-Dev-API-Key: dev_test_key` is present

This feature is automatically disabled in production environments.

### Troubleshooting

#### 401 Unauthorized

- Make sure you're including the `X-Dev-API-Key` header
- Verify `NODE_ENV=development` is set
- Restart the server after changing environment variables

#### 500 Internal Server Error

- Check that your LLM endpoint is reachable
- Verify your `LLM_API_KEY` is valid
- Check server logs for detailed error messages

#### Empty Response

- Verify the LLM model name matches your endpoint's available models
- Check that the API base URL includes `/v1` if required
- Test the LLM endpoint directly (see examples below)

### Testing the LLM Endpoint Directly

To verify your LLM configuration is correct:

```bash
curl -X POST ${LLM_API_BASE_URL}/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${LLM_API_KEY}" \
  -d '{
    "model": "'${LLM_MODEL_NAME}'",
    "messages": [{"role": "user", "content": "Say hello"}],
    "temperature": 0.7
  }'
```

Expected response should include:
```json
{
  "choices": [
    {
      "message": {
        "content": "Hello!",
        "role": "assistant"
      }
    }
  ]
}
```
