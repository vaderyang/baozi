# AI Ask Configuration

This document describes the configuration options available for the AI Ask feature's search strategy.

## Search Strategy Configuration

The AI Ask feature uses a parallel multi-keyword search strategy to provide comprehensive results. The following environment variables control this behavior:

### AI_ASK_MAX_KEYWORDS

**Default:** `5`

**Description:** Maximum number of individual keywords to extract from a user query for parallel search. The system uses an LLM to decompose natural language questions into individual search terms.

**Impact:**
- Higher values provide broader search coverage by searching for more terms
- Lower values reduce search time and API costs
- Recommended range: 3-7

**Example:**
```bash
AI_ASK_MAX_KEYWORDS=5
```

### AI_ASK_RESULTS_PER_KEYWORD

**Default:** `10`

**Description:** Maximum number of search results to retrieve per individual keyword before merging and deduplication.

**Impact:**
- Higher values increase the pool of potential documents
- Lower values reduce search time and memory usage
- Recommended range: 5-15

**Example:**
```bash
AI_ASK_RESULTS_PER_KEYWORD=10
```

### AI_ASK_MIN_TOTAL_RESULTS

**Default:** `5`

**Description:** Minimum number of total search results required before proceeding to answer generation. If fewer results are found across all keyword searches, the system will display a no-results message.

**Impact:**
- Higher values ensure sufficient context for answer generation
- Lower values allow answers with limited context
- Recommended range: 3-10

**Example:**
```bash
AI_ASK_MIN_TOTAL_RESULTS=5
```

### AI_ASK_PARALLEL_SEARCH_LIMIT

**Default:** `5`

**Description:** Maximum number of parallel keyword searches to execute concurrently. This limits the concurrent load on the search system.

**Impact:**
- Higher values speed up search execution
- Lower values reduce system load
- Should not exceed AI_ASK_MAX_KEYWORDS
- Recommended range: 3-10

**Example:**
```bash
AI_ASK_PARALLEL_SEARCH_LIMIT=5
```

## Related Configuration

These search strategy settings work in conjunction with other AI Ask configuration:

### AI_ASK_MAX_DOCUMENTS

**Default:** `20`

**Description:** Maximum number of documents to include in the final LLM context after merging and ranking all search results.

**Example:**
```bash
AI_ASK_MAX_DOCUMENTS=20
```

## Configuration Examples

### High Performance (Fast, Lower Coverage)

```bash
AI_ASK_MAX_KEYWORDS=3
AI_ASK_RESULTS_PER_KEYWORD=5
AI_ASK_MIN_TOTAL_RESULTS=3
AI_ASK_PARALLEL_SEARCH_LIMIT=5
AI_ASK_MAX_DOCUMENTS=15
```

### Balanced (Default)

```bash
AI_ASK_MAX_KEYWORDS=5
AI_ASK_RESULTS_PER_KEYWORD=10
AI_ASK_MIN_TOTAL_RESULTS=5
AI_ASK_PARALLEL_SEARCH_LIMIT=5
AI_ASK_MAX_DOCUMENTS=20
```

### High Coverage (Comprehensive, Slower)

```bash
AI_ASK_MAX_KEYWORDS=7
AI_ASK_RESULTS_PER_KEYWORD=15
AI_ASK_MIN_TOTAL_RESULTS=8
AI_ASK_PARALLEL_SEARCH_LIMIT=7
AI_ASK_MAX_DOCUMENTS=25
```

## Monitoring

The system logs detailed metrics for search strategy performance:

- Keyword extraction results
- Individual keyword search results
- Result merging statistics
- Documents matching multiple keywords
- Permission filtering results

Monitor these logs to optimize configuration for your use case:

```
Logger.info("utils", "Parallel search merge complete", {
  keywords,
  totalSearches,
  successfulSearches,
  uniqueDocuments,
  finalResultCount,
  multiKeywordMatches,
  userId,
  teamId,
});
```

## Performance Considerations

1. **Token Usage:** More keywords and results increase LLM token consumption
2. **Search Load:** Parallel searches increase database query load
3. **Latency:** More keywords increase total search time despite parallelization
4. **Memory:** Larger result sets require more memory for merging

## Best Practices

1. Start with default values and adjust based on monitoring
2. Increase `AI_ASK_MAX_KEYWORDS` if users report missing relevant documents
3. Decrease `AI_ASK_RESULTS_PER_KEYWORD` if search is too slow
4. Set `AI_ASK_PARALLEL_SEARCH_LIMIT` based on your database capacity
5. Monitor multi-keyword match rates to validate search strategy effectiveness
