# Generate Text Mention Feature

## Overview

This feature adds the ability to mention pages (documents) in the "Generate Text" AI prompt using the `@` symbol. When a user mentions a page, its content is automatically included in the system prompt sent to the LLM API, providing context for better AI-generated responses.

## How It Works

### User Experience

1. User triggers "Generate Text" from the block menu (type `/` and select "Generate Text")
2. In the AI prompt input field, user can type `@` to trigger the mention dropdown
3. The dropdown shows available documents that can be mentioned
4. User selects a document from the dropdown
5. The document name is inserted into the prompt as `@DocumentName`
6. User can mention multiple documents in the same prompt
7. When the prompt is submitted, the mentioned documents' content is sent to the LLM as context

### Technical Implementation

#### Frontend Changes

1. **New Component: `AiPromptInput.tsx`**
   - Custom input component that handles mention detection and selection
   - Tracks mentioned documents and their IDs
   - Uses a lightweight inline dropdown (not the complex `MentionMenu` component)
   - Supports keyboard navigation:
     - `Enter` to submit prompt (or select document when dropdown is open)
     - `Escape` to close mention dropdown
     - `Arrow Up/Down` to navigate through document suggestions
   - Fetches documents via `/suggestions.mention` API endpoint
   - Dropdown appears below the input field and doesn't interfere with the input visibility

2. **Modified: `SuggestionsMenu.tsx`**
   - Replaced simple prompt input with `AiPromptInput` component
   - Updated `generateAiText` function to accept `mentionedDocumentIds` parameter
   - Modified `handlePromptSubmit` to pass mentioned document IDs to the API

#### Backend Changes

1. **Modified: `server/routes/api/ai/schema.ts`**
   - Added `mentionedDocumentIds` field to the `AiGenerateSchema`
   - Type: `z.array(z.string()).optional()`

2. **Modified: `server/routes/api/ai/ai.ts`**
   - Extracts `mentionedDocumentIds` from request body
   - Fetches mentioned documents from the database (filtered by team)
   - Converts documents to Markdown using `DocumentHelper.toMarkdown()`
   - Appends mentioned documents' content to the system prompt
   - Format: Each document is prefixed with `## Referenced Document: {title}`

## API Changes

### Request Schema

```typescript
{
  prompt: string;
  context?: string;
  mentionedDocumentIds?: string[];
}
```

### System Prompt Enhancement

When documents are mentioned, the system prompt is enhanced with:

```
The user has mentioned the following documents for reference:

## Referenced Document: {Document Title 1}

{Document 1 Content in Markdown}

---

## Referenced Document: {Document Title 2}

{Document 2 Content in Markdown}
```

## Security Considerations

- Only documents from the user's team can be mentioned (enforced by `teamId` filter)
- User must have access to the document to mention it
- Document IDs are validated on the server side

## Future Enhancements

Potential improvements for future iterations:

1. Support mentioning collections, not just documents
2. Add visual indicators in the prompt input showing which documents are mentioned
3. Allow removing mentions from the prompt
4. Show a preview of mentioned documents
5. Limit the number of documents that can be mentioned
6. Truncate very long documents to avoid token limits
7. Add mention support for other AI features (AI Edit, Continue Writing)

## Known Issues & Solutions

### Issue: Dropdown clipped by parent container
**Solution**: The dropdown uses a Portal to render outside the constrained SuggestionsMenu wrapper and uses `position: fixed` with calculated coordinates.

### Issue: Prompt input disappears when selecting a mention
**Solution**: Added `e.stopPropagation()` on the dropdown's `onMouseDown` and menu item's `onClick` events to prevent the parent SuggestionsMenu's click-outside handler from closing the menu.

### Issue: "Loading" flashing repeatedly
**Solution**: Removed the `loading` state from the useEffect dependency array, so it only fetches when `mentionSearch` changes.

## Testing

To test the feature:

1. Ensure LLM API is configured (environment variables)
2. Create a few test documents with content
3. Open a document and trigger "Generate Text" (`/` menu)
4. Type `@` in the prompt input
5. A dropdown should appear below the input showing available documents
6. Use arrow keys to navigate or hover with mouse
7. Select a document by clicking or pressing Enter
8. The document name should be inserted into the prompt as `@DocumentName`
9. Enter a prompt like "Summarize the mentioned document"
10. Submit and verify the AI response uses the mentioned document's content

## Dependencies

- Existing `MentionMenu` component
- `DocumentHelper.toMarkdown()` for document content conversion
- Document model and database access
