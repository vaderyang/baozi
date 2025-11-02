# AI Search Feature

## Overview

The AI Search feature provides intelligent, context-aware answers to user queries by leveraging your document knowledge base. When enabled, it searches through relevant documents and uses AI to generate comprehensive, well-formatted answers with proper source citations.

## Features

- **Intelligent Document Search**: Automatically finds the most relevant documents based on your query
- **AI-Generated Answers**: Provides comprehensive answers in Markdown format
- **Source Citations**: All answers include references to the source documents
- **Contextual Snippets**: Shows relevant excerpts from documents
- **Filter Support**: Works with all existing search filters (collection, user, date, status)
- **Toggle On/Off**: Easy to enable or disable per search

## How It Works

1. User enters a search query
2. System searches for relevant documents (up to 5 by default)
3. Document content is sent to the configured LLM
4. AI generates a comprehensive answer with citations
5. Answer is displayed above traditional search results

## Configuration

### Required Environment Variables

The AI Search feature requires the same LLM configuration as the existing AI features:

```bash
# API Key (one of these)
LLM_API_KEY=your-api-key
AI_API_KEY=your-api-key
OPENAI_API_KEY=your-api-key

# API Base URL (one of these)
LLM_API_BASE_URL=https://api.openai.com/v1
AI_API_BASE_URL=https://api.openai.com/v1
OPENAI_API_BASE_URL=https://api.openai.com/v1

# Model Name (one of these)
LLM_MODEL_NAME=gpt-4
AI_MODEL_NAME=gpt-4
OPENAI_MODEL_NAME=gpt-4
```

### Supported LLM Providers

Any OpenAI-compatible API endpoint:
- OpenAI (GPT-3.5, GPT-4, GPT-4-turbo)
- Azure OpenAI
- Local models via LM Studio, Ollama, etc.
- Other compatible providers (Anthropic via proxy, etc.)

## Usage

### For End Users

1. Navigate to the Search page
2. Enter your search query
3. Click the "AI Answer" toggle in the filter bar
4. Wait for the AI to generate an answer
5. View the answer with source citations above the search results

### API Endpoint

**Endpoint**: `POST /api/ai.search`

**Request Body**:
```json
{
  "query": "How do I configure authentication?",
  "collectionId": "optional-collection-id",
  "userId": "optional-user-id",
  "dateFilter": "month",
  "statusFilter": ["published", "draft"],
  "maxDocuments": 5
}
```

**Response**:
```json
{
  "data": {
    "answer": "# Authentication Configuration\n\nTo configure authentication...",
    "sources": [
      {
        "id": "doc-id-1",
        "title": "Authentication Guide",
        "url": "/doc/authentication-guide-abc123",
        "collectionId": "collection-id"
      }
    ]
  }
}
```

## Implementation Details

### Architecture

```
User Query
    ↓
Search Documents (SearchHelper)
    ↓
Fetch Full Document Content
    ↓
Build Context with Document Content
    ↓
Send to LLM with System Prompt
    ↓
Parse and Format Response
    ↓
Return Answer + Sources
```

### System Prompt

The AI is instructed to:
- Write answers in clear, well-formatted Markdown
- Reference specific documents using `[Document Title](doc-id)` format
- Acknowledge when information is insufficient
- Be concise but comprehensive
- Use bullet points, headings, and formatting
- Include relevant quotes from documents
- Add a "Sources" section at the end

### Document Context

For each relevant document, the system provides:
- Document title
- Document ID
- Collection name
- Document URL
- Relevant excerpt (if available)
- Full document content in Markdown

### Performance Considerations

- Maximum 5 documents per query (configurable)
- Documents are fetched in parallel
- Response time depends on LLM provider
- Consider implementing caching for frequently asked questions

## Future Enhancements

Potential improvements for future versions:

1. **Streaming Responses**: Real-time answer generation
2. **Vector Search**: Semantic search using embeddings
3. **Conversation History**: Multi-turn conversations
4. **Answer Caching**: Cache common queries
5. **Custom Prompts**: Allow workspace-level prompt customization
6. **Answer Feedback**: Thumbs up/down for answer quality
7. **Related Questions**: Suggest follow-up questions
8. **Export Answers**: Save AI answers as documents

## Troubleshooting

### AI Answer Not Showing

1. Check that LLM environment variables are configured
2. Verify the "AI Answer" toggle is enabled
3. Ensure your query returns search results
4. Check server logs for API errors

### Poor Answer Quality

1. Try more specific queries
2. Ensure relevant documents exist in the knowledge base
3. Consider using a more capable model (e.g., GPT-4 instead of GPT-3.5)
4. Check that documents have sufficient content

### Slow Response Times

1. Reduce `maxDocuments` parameter
2. Use a faster LLM model
3. Consider implementing caching
4. Check network latency to LLM provider

## Security Considerations

- AI Search respects all document permissions
- Only documents the user has access to are included
- API requires authentication
- Document content is sent to the configured LLM provider
- Consider data privacy implications when using external LLM providers

## Cost Considerations

- Each AI search query consumes LLM tokens
- Cost depends on:
  - Number of documents retrieved
  - Document length
  - LLM model used
  - Query frequency
- Consider implementing rate limiting for cost control
- Monitor usage via LLM provider dashboard

## Testing

To test the AI Search feature:

1. Ensure LLM configuration is set up
2. Create some test documents with content
3. Navigate to Search page
4. Enter a query related to your documents
5. Enable "AI Answer" toggle
6. Verify answer quality and source citations

## Support

For issues or questions:
- Check server logs for detailed error messages
- Verify LLM configuration
- Test with simple queries first
- Review document permissions
