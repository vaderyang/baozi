# Implementation Plan

## Overview
This implementation plan builds upon the existing AI search infrastructure (`AISearchAnswer` component and `/api/ai.search` endpoint) to create a full-featured AI Ask experience with conversational capabilities, document sidebar, and follow-up suggestions.

**Current State:**
- ✅ Basic AI search endpoint exists at `/api/ai.search` with SSE streaming
- ✅ `AISearchAnswer` component displays AI-generated answers with sources
- ✅ Search scene integrates AI answer as a toggle option
- ❌ No dedicated AI Ask scene or conversational interface
- ❌ No document sidebar for source exploration
- ❌ No follow-up question suggestions
- ❌ No multi-turn conversation support
- ❌ No session management

## Tasks

- [ ] 1. Enhance backend API for conversational AI Ask
  - Create new `/api/ai.ask` endpoint that extends `/api/ai.search` with conversation context support
  - Add session management to track conversation history (last 10 Q&A pairs)
  - Implement follow-up question generation in AIService
  - Add SSE event type for `followups` in addition to existing `sources`, `content`, `done`, `error`
  - _Requirements: 2.1, 2.2, 2.3, 5.1, 5.2, 5.4, 6.4_

- [ ] 2. Create AIAskStore for state management
  - [x] 2.1 Implement MobX store with conversation state management
    - Create `AIAskStore` class extending `BaseStore`
    - Add observable properties: `conversation`, `activeDocumentId`, `sessionId`
    - Implement `submitQuestion` action to handle SSE streaming
    - Implement `handleStreamEvent` action to process stream events
    - Implement `setActiveDocument` and `clearConversation` actions
    - Add computed property `currentTurn` for latest conversation turn
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.2 Integrate AIAskStore into RootStore
    - Add AIAskStore to RootStore initialization
    - Export store type for TypeScript support
    - _Requirements: 6.1_

- [ ] 3. Build AIAsk scene and core components
  - [x] 3.1 Create AIAskScene with Google-like landing page
    - Create `app/scenes/AIAsk/AIAsk.tsx` scene component
    - Implement landing page view with centered query input
    - Implement conversation view that displays Q&A history
    - Add route configuration in `app/routes/authenticated.tsx`
    - Add navigation helper in route helpers
    - _Requirements: 1.1, 1.2, 1.5, 6.2_

  - [x] 3.2 Create AIAskQueryInput component
    - Build specialized input component at `app/scenes/AIAsk/components/QueryInput.tsx`
    - Implement 500 character limit with counter
    - Add placeholder with example questions
    - Support Enter to submit, Shift+Enter for multi-line
    - Add clear button and auto-focus
    - _Requirements: 1.3, 1.4, 6.1_

  - [x] 3.3 Create AIAskConversation component
    - Build conversation display at `app/scenes/AIAsk/components/Conversation.tsx`
    - Display chronological Q&A pairs
    - Implement streaming answer animation
    - Add clickable citation numbers
    - Auto-scroll to latest answer
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 6.2, 6.3_

  - [x] 3.4 Enhance AIAskAnswer component from existing AISearchAnswer
    - Create `app/scenes/AIAsk/components/Answer.tsx` based on `AISearchAnswer`
    - Add markdown rendering with syntax highlighting
    - Implement superscript citation links
    - Add streaming text animation support
    - Add copy answer button
    - Support expand/collapse for long answers
    - _Requirements: 3.3, 3.4, 4.1_

- [ ] 4. Implement document sidebar for source exploration
  - [x] 4.1 Create AIAskDocumentSidebar component
    - Build sidebar at `app/scenes/AIAsk/components/DocumentSidebar.tsx`
    - Display list of referenced documents with metadata
    - Show document title, collection, and summary
    - Display relevant excerpt with highlighting
    - Add "Open document" link
    - Implement collapsible/expandable behavior
    - Highlight active document when citation clicked
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 Wire citation clicks to sidebar
    - Connect citation click handlers to `setActiveDocument` action
    - Implement sidebar open/close logic
    - Add smooth scroll to active document in sidebar
    - _Requirements: 4.1, 4.2_

- [ ] 5. Add follow-up suggestions feature
  - [x] 5.1 Create AIAskFollowups component
    - Build component at `app/scenes/AIAsk/components/Followups.tsx`
    - Display 3-5 follow-up suggestions as chips
    - Implement horizontal scrollable layout
    - Add click handler to submit as new question
    - Add fade-in animation when loaded
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.2 Integrate follow-up generation in backend
    - Implement `generateFollowups` method in AIService
    - Add LLM prompt template for follow-up generation
    - Emit `followups` SSE event after answer completion
    - _Requirements: 5.1, 5.4, 5.5_

- [ ] 6. Implement error handling and edge cases
  - [x] 6.1 Add comprehensive error states
    - Implement network error handling with retry button
    - Add no results found state with alternative suggestions
    - Handle permission errors with helpful messaging
    - Add LLM error handling with fallback to search results
    - Implement timeout handling (>30 seconds) with cancel option
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 9.4_

  - [x] 6.2 Add loading indicators and progress states
    - Implement loading indicator on question submission
    - Add progress messages during search and generation phases
    - Show estimated time remaining when processing exceeds 5 seconds
    - Add cancel button for in-progress queries
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 7. Ensure permission and security compliance
  - [ ] 7.1 Verify permission filtering in AI Ask endpoint
    - Ensure document search filters by user permissions
    - Verify only authorized documents included in LLM context
    - Test that sidebar only shows accessible documents
    - Add logging for permission-related access attempts
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [-] 8. Add configuration and settings support
  - [ ] 8.1 Implement environment variable configuration
    - Add `AI_ASK_ENABLED` feature flag
    - Add `AI_ASK_MAX_DOCUMENTS` configuration
    - Add `AI_ASK_MAX_CONVERSATION_TURNS` setting
    - Add `AI_ASK_SESSION_TIMEOUT_MS` configuration
    - Document all configuration options
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 8.2 Add rate limiting for AI Ask
    - Implement per-user rate limiting
    - Implement per-team rate limiting
    - Add graceful degradation when limits reached
    - Log rate limit violations
    - _Requirements: 10.5_

- [ ] 9. Polish UI/UX and accessibility
  - [ ] 9.1 Add responsive design for mobile
    - Ensure query input works on mobile devices
    - Make document sidebar responsive (drawer on mobile)
    - Test conversation view on various screen sizes
    - Optimize touch interactions
    - _Requirements: 1.1, 1.2_

  - [ ] 9.2 Implement keyboard navigation
    - Add Tab navigation through interface elements
    - Support Enter to submit questions
    - Add Escape to close sidebar/cancel operations
    - Implement arrow key navigation for follow-ups
    - _Requirements: 1.1, 6.1_

  - [ ]* 9.3 Add accessibility features
    - Add ARIA labels for screen readers
    - Ensure proper heading hierarchy
    - Add focus management for modal/sidebar
    - Test with screen reader
    - _Requirements: 1.1_

- [ ]* 10. Write integration tests
  - Write end-to-end test for question submission and answer display
  - Test multi-turn conversation with context preservation
  - Test citation links and document sidebar interaction
  - Test follow-up suggestion generation and submission
  - Test error scenarios (no results, timeout, permission denied)
  - Test session management and cleanup
  - _Requirements: All requirements_

## Notes

- Tasks marked with `*` are optional and can be skipped for MVP
- The implementation builds incrementally on existing infrastructure
- Each task references specific requirements from requirements.md
- Focus on core functionality first, then polish and optimization
- Session management is in-memory only for MVP (no database persistence)
