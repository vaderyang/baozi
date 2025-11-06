# AI Ask Search Strategy Improvement - Design Document

## Overview

This design improves the AI Ask search keyword decomposition strategy to provide better search coverage and user transparency. The current implementation extracts keywords as multi-word phrases, which can be too specific and miss relevant documents. The improved strategy decomposes queries into individual words, executes parallel searches, merges and ranks results, and provides real-time visual feedback to users.

### Key Design Principles

1. **Individual Word Decomposition**: Break queries into single words rather than phrases for broader coverage
2. **Parallel Search Execution**: Execute multiple keyword searches concurrently for speed
3. **Intelligent Result Merging**: Combine and rank results based on relevance across multiple searches
4. **Real-time Progress Display**: Show users the search strategy and progress as it happens
5. **Immediate Navigation**: Redirect to results page immediately after query submission

## Architecture Changes

### Modified Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Backend (Koa)                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  /api/ai.ask (Enhanced)                               │ │
│  │  - Individual keyword extraction                       │ │
│  │  - Parallel search execution                           │ │
│  │  - Result merging and ranking                          │ │
│  │  - Progress event streaming                            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ SSE Events
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  AIAskScene (Enhanced)                                │ │
│  │  - Immediate results page navigation                   │ │
│  │  - Search progress display                             │ │
│  │  - Dynamic keyword visualization                       │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Enhanced Data Flow

1. **Question Submission**
   - User enters question → Immediately navigate to results page
   - Show loading state with user question displayed
   - Initiate SSE stream to `/api/ai.ask`

2. **Keyword Extraction (New)**
   - LLM extracts 1-5 individual words from query
   - Emit `search_strategy` event with extracted keywords
   - Frontend displays extracted keywords to user

3. **Parallel Search Execution (New)**
   - Execute separate search for each keyword in parallel
   - Emit `search_progress` event for each keyword search
   - Show progress: "Searching for 'keyword'... X results"

4. **Result Merging (New)**
   - Deduplicate documents across searches
   - Calculate combined relevance scores
   - Rank by relevance
   - Emit `search_complete` event with merged results count

5. **Answer Generation (Existing)**
   - Proceed with existing answer generation flow
   - Stream answer tokens via `content` events

## Component Details

### Backend Changes

#### 1. Enhanced extractKeywords Function

**Location**: `server/routes/api/ai/ai.ts`

**Current Implementation**:
```typescript
// Returns: "REST GraphQL difference" (multi-word phrase)
```

**New Implementation**:
```typescript
/**
 * Extract individual keywords from a natural language query using LLM
 * Returns array of individual words, not phrases
 */
const extractIndividualKeywords = async (
  query: string,
  apiKey: string,
  apiBase: string,
  model: string
): Promise<string[]> => {
  const systemPrompt = `You are a keyword extraction assistant. Extract individual words (NOT phrases) from the user's question for document search.

CRITICAL RULES:
1. Extract 1-5 INDIVIDUAL WORDS ONLY - NO multi-word phrases
2. Each keyword must be a SINGLE WORD (no spaces)
3. Focus on nouns, technical terms, and specific concepts
4. Remove question words (what, how, why, when, where, who)
5. Remove common words (is, the, a, an, of, in, on, at)
6. Keep technical abbreviations and acronyms (e.g., FTP, API, HTTP)
7. For Chinese queries, extract individual meaningful characters or words
8. Return ONLY the keywords separated by spaces, no explanation

Examples:
- "什么是FTP" → "FTP"
- "How does authentication work?" → "authentication"
- "What is the difference between REST and GraphQL?" → "REST GraphQL"
- "如何配置数据库连接" → "配置 数据库 连接"
- "How to set up FTP server configuration" → "FTP server configuration"`;

  // ... LLM call implementation
  
  // Parse response and split into individual words
  const keywords = parseAiResponse(data.choices?.[0] || {})
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .slice(0, 5); // Max 5 keywords

  return keywords;
};
```

**Design Rationale**: Extracting individual words instead of phrases provides broader search coverage. A document containing "REST" or "GraphQL" will be found even if it doesn't contain the exact phrase "REST GraphQL difference".

#### 2. New searchWithMultipleKeywords Function

**Location**: `server/routes/api/ai/ai.ts`

```typescript
/**
 * Execute parallel searches for multiple keywords and merge results
 */
const searchWithMultipleKeywords = async (
  keywords: string[],
  user: User,
  searchOptions: SearchOptions,
  onProgress?: (keyword: string, resultCount: number) => void
): Promise<MergedSearchResult[]> => {
  const SearchHelper = (await import("@server/models/helpers/SearchHelper")).default;
  
  // Execute searches in parallel
  const searchPromises = keywords.map(async (keyword) => {
    const results = await SearchHelper.searchForUser(user, {
      ...searchOptions,
      query: keyword,
      limit: 10, // Max 10 results per keyword
    });
    
    // Emit progress event
    if (onProgress) {
      onProgress(keyword, results.results.length);
    }
    
    return {
      keyword,
      results: results.results,
    };
  });
  
  const allSearchResults = await Promise.all(searchPromises);
  
  // Merge and deduplicate results
  const documentMap = new Map<string, MergedSearchResult>();
  
  for (const { keyword, results } of allSearchResults) {
    for (const result of results) {
      const docId = result.document.id;
      
      if (documentMap.has(docId)) {
        // Document found in multiple searches - boost relevance
        const existing = documentMap.get(docId)!;
        existing.relevanceScore += result.ranking;
        existing.matchedKeywords.push(keyword);
      } else {
        // New document
        documentMap.set(docId, {
          document: result.document,
          relevanceScore: result.ranking,
          matchedKeywords: [keyword],
          context: result.context,
        });
      }
    }
  }
  
  // Sort by combined relevance score
  const mergedResults = Array.from(documentMap.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 20); // Max 20 final results
  
  return mergedResults;
};

interface MergedSearchResult {
  document: any;
  relevanceScore: number;
  matchedKeywords: string[];
  context: string;
}
```

**Design Rationale**: Parallel execution minimizes latency. Merging results with relevance boosting ensures documents matching multiple keywords rank higher, improving answer quality.

#### 3. Enhanced SSE Event Types

**New Event Types**:
```typescript
// Search strategy extracted
{ 
  type: 'search_strategy', 
  keywords: string[] 
}

// Progress for individual keyword search
{ 
  type: 'search_progress', 
  keyword: string, 
  resultCount: number,
  status: 'searching' | 'complete'
}

// All searches complete, results merged
{ 
  type: 'search_complete', 
  totalDocuments: number,
  uniqueDocuments: number
}

// Existing events remain unchanged
{ type: 'sources', sources: DocumentReference[] }
{ type: 'content', content: string }
{ type: 'followups', followups: string[] }
{ type: 'done' }
{ type: 'error', error: string }
```

#### 4. Modified ai.ask Endpoint Flow

```typescript
router.post("ai.ask", auth(), validate(T.AiAskSchema), async (ctx) => {
  // ... existing setup code ...
  
  // 1. Extract individual keywords
  const keywords = await extractIndividualKeywords(
    contextualQuery,
    apiKey,
    apiBase,
    model
  );
  
  Logger.info("AI Ask keywords extracted", {
    originalQuery: query,
    extractedKeywords: keywords,
    keywordCount: keywords.length,
  });
  
  // Emit search strategy event
  ctx.res.write(
    `data: ${JSON.stringify({ 
      type: "search_strategy", 
      keywords 
    })}\n\n`
  );
  
  // 2. Execute parallel searches with progress callbacks
  const mergedResults = await searchWithMultipleKeywords(
    keywords,
    user,
    searchOptions,
    (keyword, resultCount) => {
      // Emit progress event for each keyword
      ctx.res.write(
        `data: ${JSON.stringify({ 
          type: "search_progress", 
          keyword,
          resultCount,
          status: 'complete'
        })}\n\n`
      );
    }
  );
  
  Logger.info("AI Ask search complete", {
    totalDocuments: mergedResults.length,
    keywords,
  });
  
  // Emit search complete event
  ctx.res.write(
    `data: ${JSON.stringify({ 
      type: "search_complete", 
      totalDocuments: mergedResults.length,
      uniqueDocuments: mergedResults.length
    })}\n\n`
  );
  
  // 3. Fetch full documents (with permission filtering)
  const resultDocumentIds = mergedResults.map(r => r.document.id);
  const documents = await Document.withMembershipScope(user.id, {
    includeDrafts: true,
  }).findAll({
    where: { id: resultDocumentIds, teamId: user.teamId },
  });
  
  // ... continue with existing answer generation flow ...
});
```

### Frontend Changes

#### 1. Enhanced AIAskStore

**Location**: `app/stores/AIAskStore.ts`

**New Observable Properties**:
```typescript
class AIAskStore extends BaseStore<never> {
  // Existing properties
  @observable conversation: ConversationTurn[] = [];
  @observable activeDocumentId: string | null = null;
  @observable sessionId: string | null = null;
  
  // New properties for search progress
  @observable searchStrategy: SearchStrategy | null = null;
  @observable searchProgress: Map<string, SearchProgress> = new Map();
  
  @action
  handleStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'search_strategy':
        this.searchStrategy = {
          keywords: event.keywords,
          timestamp: new Date(),
        };
        break;
        
      case 'search_progress':
        this.searchProgress.set(event.keyword, {
          keyword: event.keyword,
          resultCount: event.resultCount,
          status: event.status,
        });
        break;
        
      case 'search_complete':
        // Update current turn with search completion
        if (this.currentTurn) {
          this.currentTurn.searchComplete = true;
          this.currentTurn.totalDocuments = event.totalDocuments;
        }
        break;
        
      // ... existing event handlers ...
    }
  }
}

interface SearchStrategy {
  keywords: string[];
  timestamp: Date;
}

interface SearchProgress {
  keyword: string;
  resultCount: number;
  status: 'searching' | 'complete';
}
```

#### 2. New AIAskSearchProgress Component

**Location**: `app/scenes/AIAsk/components/SearchProgress.tsx`

```typescript
interface SearchProgressProps {
  strategy: SearchStrategy | null;
  progress: Map<string, SearchProgress>;
  isComplete: boolean;
}

export const AIAskSearchProgress: React.FC<SearchProgressProps> = ({
  strategy,
  progress,
  isComplete,
}) => {
  if (!strategy) return null;
  
  return (
    <SearchProgressContainer>
      <SearchStrategySection>
        <SectionTitle>Search Strategy</SectionTitle>
        <KeywordList>
          {strategy.keywords.map((keyword) => (
            <KeywordChip key={keyword}>
              {keyword}
              {progress.has(keyword) && (
                <ResultBadge>
                  {progress.get(keyword)!.resultCount} results
                </ResultBadge>
              )}
            </KeywordChip>
          ))}
        </KeywordList>
      </SearchStrategySection>
      
      <ProgressSection>
        {Array.from(progress.entries()).map(([keyword, info]) => (
          <ProgressItem key={keyword}>
            <ProgressIcon status={info.status} />
            <ProgressText>
              Searching for "{keyword}"... {info.resultCount} documents found
            </ProgressText>
          </ProgressItem>
        ))}
      </ProgressSection>
      
      {isComplete && (
        <CompletionMessage>
          ✓ Search complete - Generating answer from {getTotalDocuments(progress)} documents
        </CompletionMessage>
      )}
    </SearchProgressContainer>
  );
};
```

**Design Rationale**: Visual feedback helps users understand the search process and builds trust in the AI system. Showing individual keyword results demonstrates thoroughness.

#### 3. Enhanced AIAskScene Navigation

**Location**: `app/scenes/AIAsk/AIAsk.tsx`

**Current Behavior**: User submits question → Wait for response → Show results

**New Behavior**: User submits question → Immediately show results page with loading state

```typescript
const handleQuestionSubmit = async (question: string) => {
  // Immediately navigate to results view
  setShowResults(true);
  
  // Scroll to top of results
  window.scrollTo({ top: 0, behavior: 'smooth' });
  
  // Submit question (async)
  await aiAskStore.submitQuestion(question);
};

return (
  <SceneContainer>
    {!showResults ? (
      // Landing page
      <LandingView>
        <QueryInput onSubmit={handleQuestionSubmit} />
      </LandingView>
    ) : (
      // Results page (shown immediately)
      <ResultsView>
        <QuestionHeader>{currentTurn?.question}</QuestionHeader>
        
        {/* Show search progress */}
        <AIAskSearchProgress
          strategy={aiAskStore.searchStrategy}
          progress={aiAskStore.searchProgress}
          isComplete={currentTurn?.searchComplete || false}
        />
        
        {/* Show answer when ready */}
        {currentTurn?.answer && (
          <AIAskAnswer answer={currentTurn.answer} />
        )}
        
        {/* Query input for follow-ups */}
        <QueryInput onSubmit={handleQuestionSubmit} />
      </ResultsView>
    )}
  </SceneContainer>
);
```

## Configuration

### Environment Variables

```bash
# Search Strategy Configuration
AI_ASK_MAX_KEYWORDS=5                    # Max keywords to extract
AI_ASK_RESULTS_PER_KEYWORD=10            # Max results per keyword search
AI_ASK_MIN_TOTAL_RESULTS=5               # Minimum results before proceeding
AI_ASK_PARALLEL_SEARCH_LIMIT=5           # Max concurrent searches
AI_ASK_SEARCH_TIMEOUT_MS=10000           # Timeout per keyword search
```

## Performance Considerations

### Optimization Strategies

1. **Parallel Search Execution**
   - Execute up to 5 keyword searches concurrently
   - Use Promise.all for parallel execution
   - Timeout individual searches after 10 seconds

2. **Result Limiting**
   - Limit each keyword search to 10 results
   - Limit final merged results to 20 documents
   - Prevents overwhelming the LLM context window

3. **Early Termination**
   - If first 2 keywords return 20+ combined results, skip remaining searches
   - Reduces latency for queries with abundant results

4. **Caching**
   - Cache keyword extraction for identical queries (1 hour TTL)
   - Cache individual keyword search results (5 minute TTL)
   - Reduces redundant LLM calls and searches

## Error Handling

### Edge Cases

1. **No Keywords Extracted**
   - Fallback: Use original query as single keyword
   - Log warning for analysis

2. **All Keyword Searches Return Zero Results**
   - Display: "No documents found for any search terms"
   - Suggest: Alternative questions or broader terms

3. **Partial Search Failures**
   - Continue with successful searches
   - Log failed keywords for debugging
   - Don't block answer generation

4. **Permission Filtering Removes All Results**
   - Display: "Found documents but you don't have access"
   - Maintain existing permission error handling

## Migration Strategy

### Backward Compatibility

- Existing `ai.search` endpoint remains unchanged
- New search strategy only applies to `ai.ask` endpoint
- Frontend gracefully handles missing new event types
- Can be rolled out incrementally with feature flag

### Rollout Plan

1. **Phase 1**: Deploy backend changes with feature flag disabled
2. **Phase 2**: Deploy frontend changes (backward compatible)
3. **Phase 3**: Enable feature flag for 10% of users
4. **Phase 4**: Monitor metrics and gradually increase to 100%

## Success Metrics

### Key Performance Indicators

1. **Search Coverage**
   - Average documents found per query (target: >10)
   - Percentage of queries with sufficient results (target: >90%)

2. **User Experience**
   - Time to first visual feedback (target: <500ms)
   - Time to search completion (target: <5s)
   - User satisfaction with search transparency

3. **Answer Quality**
   - Percentage of queries with relevant answers (target: >85%)
   - User feedback on answer helpfulness

## Testing Strategy

### Unit Tests

1. **extractIndividualKeywords**
   - Test with English queries
   - Test with Chinese queries
   - Test with mixed language queries
   - Test with technical terms and acronyms

2. **searchWithMultipleKeywords**
   - Test parallel execution
   - Test result merging and deduplication
   - Test relevance score calculation
   - Test result limiting

### Integration Tests

1. **End-to-End Flow**
   - Submit query → Extract keywords → Parallel search → Merge results → Generate answer
   - Verify all SSE events emitted in correct order
   - Verify frontend displays progress correctly

2. **Permission Filtering**
   - Verify each keyword search respects permissions
   - Verify merged results maintain permission filtering
   - Verify no unauthorized document leakage

### Performance Tests

1. **Parallel Search Performance**
   - Measure latency with 1, 3, 5 keywords
   - Verify parallel execution is faster than sequential
   - Test with high concurrency (50+ simultaneous users)

2. **Result Merging Performance**
   - Test with varying result set sizes
   - Measure merging and sorting time
   - Verify performance scales linearly
