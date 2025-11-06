# Implementation Plan - AI Ask Search Strategy Improvement

## Overview

This implementation plan improves the AI Ask search keyword decomposition strategy to extract individual words instead of phrases, execute parallel searches, merge and rank results, and provide real-time visual feedback to users.

**Current State:**
- ✅ Basic keyword extraction exists but returns multi-word phrases
- ✅ Single search execution per query
- ✅ SSE streaming infrastructure in place
- ❌ No individual word decomposition
- ❌ No parallel search execution
- ❌ No result merging and ranking
- ❌ No search progress display in UI
- ❌ No immediate navigation to results page

## Tasks

- [ ] 1. Enhance backend keyword extraction for individual words
  - [x] 1.1 Modify extractKeywords function to return array of individual words
    - Update LLM prompt to emphasize SINGLE WORDS ONLY (no multi-word phrases)
    - Add explicit examples showing individual word extraction
    - Parse LLM response and split by whitespace into array
    - Filter out empty strings and limit to 5 keywords maximum
    - Add language detection for Chinese vs English queries
    - Log extracted keywords for monitoring
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 1.2 Add fallback handling for keyword extraction failures
    - If LLM returns empty or invalid response, use original query as single keyword
    - Log extraction failures for analysis
    - Ensure system continues to function with fallback
    - _Requirements: 1.1, 8.4_

- [ ] 2. Implement parallel search execution with result merging
  - [x] 2.1 Create searchWithMultipleKeywords function
    - Accept array of keywords and search options
    - Execute SearchHelper.searchForUser for each keyword in parallel using Promise.all
    - Limit each keyword search to 10 results maximum
    - Add progress callback parameter for real-time updates
    - Handle individual search failures gracefully
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 8.1, 8.2_

  - [x] 2.2 Implement result merging and deduplication logic
    - Create Map to track documents by ID
    - For duplicate documents, sum relevance scores from multiple searches
    - Track which keywords matched each document
    - Sort merged results by combined relevance score descending
    - Limit final results to 20 documents maximum
    - Preserve document metadata and context from highest-scoring search
    - _Requirements: 2.5, 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.3 Add configuration for search strategy parameters
    - Add AI_ASK_MAX_KEYWORDS environment variable (default: 5)
    - Add AI_ASK_RESULTS_PER_KEYWORD environment variable (default: 10)
    - Add AI_ASK_MIN_TOTAL_RESULTS environment variable (default: 5)
    - Add AI_ASK_PARALLEL_SEARCH_LIMIT environment variable (default: 5)
    - Document configuration options
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [ ] 3. Add new SSE event types for search progress
  - [x] 3.1 Define new SSE event type interfaces
    - Add search_strategy event type with keywords array
    - Add search_progress event type with keyword, resultCount, status
    - Add search_complete event type with totalDocuments, uniqueDocuments
    - Update TypeScript types for all event types
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 3.2 Emit search progress events in ai.ask endpoint
    - Emit search_strategy event immediately after keyword extraction
    - Emit search_progress event for each keyword search completion
    - Emit search_complete event after result merging
    - Ensure events are emitted in correct order
    - Add logging for event emission
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 4. Update ai.ask endpoint to use new search strategy
  - [x] 4.1 Integrate individual keyword extraction
    - Replace single extractKeywords call with extractIndividualKeywords
    - Handle array of keywords instead of single query string
    - Emit search_strategy SSE event with extracted keywords
    - Log keyword extraction results
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 4.2 Replace single search with parallel multi-keyword search
    - Replace SearchHelper.searchForUser call with searchWithMultipleKeywords
    - Pass progress callback to emit search_progress events
    - Handle merged results instead of single search results
    - Emit search_complete event with result counts
    - Maintain existing permission filtering through SearchHelper.searchForUser
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 10.1, 10.2_

  - [x] 4.3 Update document fetching to work with merged results
    - Extract document IDs from merged results
    - Maintain existing Document.withMembershipScope permission filtering
    - Map merged results to documents preserving relevance scores
    - Log permission filtering results
    - _Requirements: 3.1, 3.2, 3.3, 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 5. Enhance frontend AIAskStore for search progress
  - [x] 5.1 Add observable properties for search progress
    - Add searchStrategy observable (keywords array and timestamp)
    - Add searchProgress observable (Map of keyword to progress info)
    - Add computed property for search completion status
    - Update ConversationTurn interface to include search metadata
    - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2_

  - [x] 5.2 Handle new SSE event types in handleStreamEvent
    - Add case for search_strategy event to update searchStrategy observable
    - Add case for search_progress event to update searchProgress Map
    - Add case for search_complete event to mark search as complete
    - Ensure reactive updates trigger UI re-renders
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.3 Clear search progress state between queries
    - Reset searchStrategy to null on new question submission
    - Clear searchProgress Map on new question submission
    - Maintain search history in completed conversation turns
    - _Requirements: 5.1, 5.2_

- [ ] 6. Create AIAskSearchProgress component
  - [x] 6.1 Build search progress visualization component
    - Create component at app/scenes/AIAsk/components/SearchProgress.tsx
    - Display "Search Strategy" section with extracted keywords as chips
    - Show result count badge on each keyword chip
    - Display progress list showing each keyword search status
    - Show completion message with total document count
    - Add loading animations for in-progress searches
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.2 Style search progress component
    - Design keyword chips with result badges
    - Add progress icons (searching spinner, complete checkmark)
    - Style completion message with success indicator
    - Ensure responsive design for mobile
    - Add smooth animations for progress updates
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 7. Implement immediate results page navigation
  - [x] 7.1 Modify AIAskScene to navigate immediately on submit
    - Change handleQuestionSubmit to set showResults=true immediately
    - Display results page with loading state before answer arrives
    - Show user question at top of results page
    - Keep query input visible for follow-up questions
    - Scroll to top of page on navigation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.2 Integrate SearchProgress component into results view
    - Add SearchProgress component above answer section
    - Pass searchStrategy and searchProgress from store
    - Show progress during search phase
    - Hide or collapse progress after answer generation starts
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 8. Add error handling for new search strategy
  - [x] 8.1 Handle no keywords extracted scenario
    - Detect when keyword extraction returns empty array
    - Fallback to using original query as single keyword
    - Log warning for monitoring
    - Display appropriate message to user
    - _Requirements: 8.4_

  - [x] 8.2 Handle all searches returning zero results
    - Detect when all keyword searches return empty results
    - Display "No documents found for any search terms" message
    - Suggest alternative questions or broader terms
    - Log for analysis
    - _Requirements: 8.2, 8.3, 8.4_

  - [x] 8.3 Handle partial search failures
    - Continue with successful keyword searches if some fail
    - Log failed keywords for debugging
    - Don't block answer generation if some searches succeed
    - Display warning if multiple searches fail
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 9. Add logging and monitoring
  - [x] 9.1 Log keyword extraction metrics
    - Log original query and extracted keywords
    - Log keyword count and extraction time
    - Log extraction failures and fallbacks
    - _Requirements: 9.5_

  - [x] 9.2 Log search execution metrics
    - Log each keyword search with result count
    - Log parallel search execution time
    - Log result merging time and final document count
    - Log documents matching multiple keywords
    - _Requirements: 9.5_

  - [x] 9.3 Log permission filtering results
    - Log requested vs authorized document counts per keyword
    - Log any permission filtering that occurs
    - Maintain existing permission audit trail
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ]* 10. Write tests for new search strategy
  - Write unit tests for extractIndividualKeywords with various query types
  - Write unit tests for searchWithMultipleKeywords result merging
  - Write integration test for full parallel search flow
  - Test permission filtering with multiple keyword searches
  - Test error scenarios (no keywords, no results, partial failures)
  - Test SSE event emission order and content
  - _Requirements: All requirements_

- [ ]* 11. Performance optimization
  - Implement caching for keyword extraction (1 hour TTL)
  - Implement caching for individual keyword searches (5 minute TTL)
  - Add early termination if first keywords return sufficient results
  - Optimize result merging algorithm for large result sets
  - _Requirements: 2.1, 2.2, 9.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for MVP
- The implementation maintains backward compatibility with existing ai.search endpoint
- All existing permission filtering and security measures are preserved
- Focus on core functionality first: individual keywords, parallel search, progress display
- Performance optimizations can be added after initial rollout based on metrics
