# AI Ask Feature Configuration

This document describes all configuration options available for the AI Ask feature.

## Environment Variables

### AI_ASK_ENABLED

**Type:** Boolean  
**Default:** `true`  
**Required:** No

Enable or disable the AI Ask feature. When disabled, the AI Ask interface will not be accessible to users.

**Example:**
```bash
AI_ASK_ENABLED=true
```

**Notes:**
- This setting is exposed to the frontend via the `@Public` decorator
- Even when enabled, the feature requires valid LLM configuration (`LLM_API_KEY`, `LLM_API_BASE_URL`, `LLM_MODEL_NAME`)
- Can be used to temporarily disable the feature without removing LLM configuration

---

### AI_ASK_MAX_DOCUMENTS

**Type:** Number  
**Default:** `20`  
**Required:** No

Maximum number of documents to include in the LLM context when generating answers.

**Example:**
```bash
AI_ASK_MAX_DOCUMENTS=20
```

**Notes:**
- Higher values provide more context but increase:
  - Token usage and API costs
  - Response latency
  - Memory consumption
- Lower values may result in less comprehensive answers
- Recommended range: 10-30 documents
- The actual number of documents used may be less if fewer relevant documents are found

---

### AI_ASK_MAX_CONVERSATION_TURNS

**Type:** Number  
**Default:** `10`  
**Required:** No

Maximum number of conversation turns (question-answer pairs) to maintain in session context.

**Example:**
```bash
AI_ASK_MAX_CONVERSATION_TURNS=10
```

**Notes:**
- Each "turn" consists of one user question and one AI answer
- Conversation context helps the AI understand follow-up questions
- Higher values:
  - Provide better context for multi-turn conversations
  - Increase token usage per request
  - Increase memory consumption
- Lower values:
  - Reduce costs and memory usage
  - May lose context in longer conversations
- Recommended range: 5-15 turns
- Older turns are automatically removed when the limit is reached (FIFO)

---

### AI_ASK_SESSION_TIMEOUT_MS

**Type:** Number (milliseconds)  
**Default:** `3600000` (1 hour)  
**Required:** No

Session timeout duration for AI Ask conversations. Sessions inactive for longer than this duration will be cleared.

**Example:**
```bash
AI_ASK_SESSION_TIMEOUT_MS=3600000  # 1 hour
AI_ASK_SESSION_TIMEOUT_MS=7200000  # 2 hours
AI_ASK_SESSION_TIMEOUT_MS=1800000  # 30 minutes
```

**Notes:**
- Sessions are stored in memory (not persisted to database in MVP)
- Inactive sessions are automatically cleaned up to free memory
- Users can start a new session at any time
- Recommended range: 30 minutes to 2 hours
- Shorter timeouts:
  - Reduce memory usage
  - May interrupt active conversations
- Longer timeouts:
  - Better user experience for long research sessions
  - Increase memory usage

---

## Related Configuration

The AI Ask feature also depends on the following LLM configuration variables:

### LLM_API_KEY

**Type:** String  
**Required:** Yes (for AI features)

API key for the LLM service.

**Example:**
```bash
LLM_API_KEY=sk-your-api-key-here
```

---

### LLM_API_BASE_URL

**Type:** String (URL)  
**Required:** Yes (for AI features)

Base URL for the LLM API endpoint.

**Example:**
```bash
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_API_BASE_URL=http://localhost:8000
```

---

### LLM_MODEL_NAME

**Type:** String  
**Required:** Yes (for AI features)

Name of the LLM model to use for AI Ask.

**Example:**
```bash
LLM_MODEL_NAME=gpt-4-turbo-preview
LLM_MODEL_NAME=qwen-3-coder-480b
```

---

### LLM_MODEL_NAME_AI_SEARCH

**Type:** String  
**Required:** No

Optional model name specifically for AI Search operations. If not set, falls back to `LLM_MODEL_NAME`.

**Example:**
```bash
LLM_MODEL_NAME_AI_SEARCH=gpt-3.5-turbo
```

**Notes:**
- Recommended to use a faster, more cost-effective model for search query generation
- Falls back to main model if not specified

---

## Configuration Examples

### Development Environment

```bash
# Enable AI Ask with generous limits for testing
AI_ASK_ENABLED=true
AI_ASK_MAX_DOCUMENTS=30
AI_ASK_MAX_CONVERSATION_TURNS=15
AI_ASK_SESSION_TIMEOUT_MS=7200000  # 2 hours

# LLM Configuration
LLM_API_KEY=sk-dev-key
LLM_API_BASE_URL=http://localhost:8000
LLM_MODEL_NAME=gpt-4-turbo-preview
```

### Production Environment (Cost-Optimized)

```bash
# Enable AI Ask with conservative limits to control costs
AI_ASK_ENABLED=true
AI_ASK_MAX_DOCUMENTS=15
AI_ASK_MAX_CONVERSATION_TURNS=8
AI_ASK_SESSION_TIMEOUT_MS=1800000  # 30 minutes

# LLM Configuration
LLM_API_KEY=sk-prod-key
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4-turbo-preview
LLM_MODEL_NAME_AI_SEARCH=gpt-3.5-turbo  # Cheaper model for search
```

### Production Environment (Quality-Optimized)

```bash
# Enable AI Ask with higher limits for better quality
AI_ASK_ENABLED=true
AI_ASK_MAX_DOCUMENTS=25
AI_ASK_MAX_CONVERSATION_TURNS=12
AI_ASK_SESSION_TIMEOUT_MS=3600000  # 1 hour

# LLM Configuration
LLM_API_KEY=sk-prod-key
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4-turbo-preview
```

### Disabled AI Ask

```bash
# Disable AI Ask feature
AI_ASK_ENABLED=false

# LLM configuration can remain for other AI features
LLM_API_KEY=sk-key
LLM_API_BASE_URL=https://api.openai.com/v1
LLM_MODEL_NAME=gpt-4-turbo-preview
```

---

## Monitoring and Optimization

### Key Metrics to Monitor

1. **Token Usage**
   - Monitor average tokens per request
   - Track total token consumption
   - Adjust `AI_ASK_MAX_DOCUMENTS` if costs are too high

2. **Response Time**
   - Monitor average response time
   - If too slow, consider:
     - Reducing `AI_ASK_MAX_DOCUMENTS`
     - Using a faster model
     - Implementing caching

3. **Memory Usage**
   - Monitor server memory consumption
   - If too high, consider:
     - Reducing `AI_ASK_MAX_CONVERSATION_TURNS`
     - Reducing `AI_ASK_SESSION_TIMEOUT_MS`

4. **User Satisfaction**
   - Track answer quality feedback
   - Monitor conversation length
   - Adjust limits based on usage patterns

### Optimization Tips

1. **Start Conservative**
   - Begin with default values
   - Monitor usage and costs
   - Gradually adjust based on data

2. **Balance Quality vs. Cost**
   - More documents = better answers but higher costs
   - Find the sweet spot for your use case

3. **Use Different Models**
   - Use cheaper models for search query generation
   - Use premium models for answer generation

4. **Implement Caching**
   - Cache search query generation for identical questions
   - Cache document fragments for frequently accessed documents

---

## Troubleshooting

### AI Ask Not Available

**Symptoms:** AI Ask interface not accessible

**Possible Causes:**
1. `AI_ASK_ENABLED=false`
2. Missing LLM configuration
3. Invalid LLM API credentials

**Solutions:**
1. Check `AI_ASK_ENABLED` is set to `true`
2. Verify all LLM environment variables are set
3. Test LLM API credentials

### Slow Response Times

**Symptoms:** Answers take too long to generate

**Possible Causes:**
1. Too many documents in context
2. Slow LLM model
3. Network latency

**Solutions:**
1. Reduce `AI_ASK_MAX_DOCUMENTS`
2. Use a faster model
3. Check network connectivity to LLM API

### High Memory Usage

**Symptoms:** Server memory consumption increasing

**Possible Causes:**
1. Too many active sessions
2. Long conversation histories
3. Session timeout too long

**Solutions:**
1. Reduce `AI_ASK_SESSION_TIMEOUT_MS`
2. Reduce `AI_ASK_MAX_CONVERSATION_TURNS`
3. Implement session cleanup

### High API Costs

**Symptoms:** LLM API bills higher than expected

**Possible Causes:**
1. Too many documents per request
2. Long conversation histories
3. Expensive model

**Solutions:**
1. Reduce `AI_ASK_MAX_DOCUMENTS`
2. Reduce `AI_ASK_MAX_CONVERSATION_TURNS`
3. Use cheaper model for search operations
4. Implement rate limiting

---

## Security Considerations

1. **API Key Protection**
   - Never commit API keys to version control
   - Use environment variables or secrets management
   - Rotate keys regularly

2. **Rate Limiting**
   - Consider implementing per-user rate limits
   - Monitor for abuse patterns
   - Set reasonable limits based on usage

3. **Data Privacy**
   - Ensure LLM provider doesn't train on your data
   - Use zero-retention API options when available
   - Document data handling in privacy policy

4. **Permission Enforcement**
   - AI Ask respects document permissions
   - Only authorized documents are included in context
   - No configuration needed - handled automatically

---

## Version History

- **v1.0.0** - Initial configuration options
  - `AI_ASK_ENABLED`
  - `AI_ASK_MAX_DOCUMENTS`
  - `AI_ASK_MAX_CONVERSATION_TURNS`
  - `AI_ASK_SESSION_TIMEOUT_MS`
