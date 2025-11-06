# Search API

<cite>
**Referenced Files in This Document**   
- [SearchHelper.ts](file://server/models/helpers/SearchHelper.ts)
- [searches.ts](file://server/routes/api/searches/searches.ts)
- [schema.ts](file://server/routes/api/searches/schema.ts)
- [SearchPopover.tsx](file://app/components/SearchPopover.tsx)
- [Search.tsx](file://app/scenes/Search/Search.tsx)
- [SearchQuery.ts](file://server/models/SearchQuery.ts)
- [ai.ts](file://server/routes/api/ai/ai.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Search Query Operations](#search-query-operations)
3. [Search Indexing Process](#search-indexing-process)
4. [Query Parsing and Result Ranking](#query-parsing-and-result-ranking)
5. [Zod Validation Rules](#zod-validation-rules)
6. [Search Results Structure](#search-results-structure)
7. [AI-Powered Search Answers](#ai-powered-search-answers)
8. [Background Jobs and Cache Invalidation](#background-jobs-and-cache-invalidation)
9. [Frontend Integration](#frontend-integration)
10. [Troubleshooting Guide](#troubleshooting-guide)

## Introduction
The Search API in the baozi application provides comprehensive search capabilities for documents, collections, and users. It supports full-text search, filtering by various criteria, and AI-powered search answers. The API is designed to be flexible and efficient, handling complex queries while maintaining high performance.

**Section sources**
- [SearchHelper.ts](file://server/models/helpers/SearchHelper.ts#L71-L804)
- [searches.ts](file://server/routes/api/searches/searches.ts#L1-L91)

## Search Query Operations
The Search API supports various operations for querying and managing search results. These operations include searching for documents, listing recent searches, updating search scores, and deleting search queries.

### HTTP Methods and URL Patterns
- **POST /api/searches.list**: Lists recent search queries
- **POST /api/searches.update**: Updates the score of a search query
- **POST /api/searches.delete**: Deletes a search query by ID or query string

### Request/Response Schemas
#### SearchesListSchema
```typescript
export const SearchesListSchema = BaseSchema.extend({
  body: z
    .object({
      source: z.string().optional(),
    })
    .optional(),
});
```

#### SearchesUpdateSchema
```typescript
export const SearchesUpdateSchema = BaseSchema.extend({
  body: z.object({
    id: z.string().uuid(),
    score: z.number().min(-1).max(1),
  }),
});
```

#### SearchesDeleteSchema
```typescript
export const SearchesDeleteSchema = BaseSchema.extend({
  body: z.object({
    id: z.string().uuid().optional(),
    query: z.string().optional(),
  }),
}).refine((req) => !(isEmpty(req.body.id) && isEmpty(req.body.query)), {
  message: "id or query is required",
});
```

**Section sources**
- [schema.ts](file://server/routes/api/searches/schema.ts#L1-L34)
- [searches.ts](file://server/routes/api/searches/searches.ts#L1-L91)

## Search Indexing Process
The search indexing process in the baozi application is designed to efficiently index and search through large volumes of documents. The process involves creating a search vector for each document, which is used to perform full-text searches.

### Indexing Workflow
1. **Document Creation/Update**: When a document is created or updated, a search vector is generated.
2. **Search Vector Generation**: The search vector is created using the document's title and content.
3. **Index Storage**: The search vector is stored in the database for quick retrieval.

### Background Job
The search indexing process is handled by a background job that runs periodically to ensure all documents are indexed. This job is responsible for:
- Processing new and updated documents
- Generating search vectors
- Updating the search index

**Section sources**
- [SearchHelper.ts](file://server/models/helpers/SearchHelper.ts#L71-L804)
- [searches.ts](file://server/routes/api/searches/searches.ts#L1-L91)

## Query Parsing and Result Ranking
The query parsing and result ranking process is a critical component of the Search API. It ensures that search queries are accurately parsed and results are ranked based on relevance.

### Query Parsing
The query parsing process involves:
- **Tokenization**: Breaking down the query into individual tokens.
- **Normalization**: Converting tokens to a standard form (e.g., lowercase).
- **Stop Word Removal**: Removing common words that do not contribute to the search.

### Result Ranking
Results are ranked using a combination of factors:
- **Relevance Score**: Calculated based on the frequency and position of search terms in the document.
- **Document Age**: Newer documents are given a higher rank.
- **User Preferences**: User-specific preferences and past interactions can influence ranking.

**Section sources**
- [SearchHelper.ts](file://server/models/helpers/SearchHelper.ts#L71-L804)
- [searches.ts](file://server/routes/api/searches/searches.ts#L1-L91)

## Zod Validation Rules
The Search API uses Zod for validating request and response schemas. Zod provides a robust and type-safe way to define and validate data structures.

### Validation Rules
- **SearchesListSchema**: Validates the optional `source` parameter.
- **SearchesUpdateSchema**: Validates the `id` (UUID) and `score` (number between -1 and 1).
- **SearchesDeleteSchema**: Validates either `id` (UUID) or `query` (string) is provided.

**Section sources**
- [schema.ts](file://server/routes/api/searches/schema.ts#L1-L34)

## Search Results Structure
The search results structure is designed to provide comprehensive information about each search result, including snippets and metadata.

### Response Structure
```typescript
type SearchResponse = {
  results: {
    ranking: number;
    context?: string;
    document: Document;
  }[];
  total: number;
};
```

### Metadata
- **Ranking**: The relevance score of the document.
- **Context**: A snippet of text around the search term.
- **Document**: The full document object.

**Section sources**
- [SearchHelper.ts](file://server/models/helpers/SearchHelper.ts#L71-L804)
- [searches.ts](file://server/routes/api/searches/searches.ts#L1-L91)

## AI-Powered Search Answers
The AI-powered search answers feature enhances the search experience by providing intelligent answers to user queries. This feature leverages machine learning models to generate answers based on the search results.

### AI Answer Workflow
1. **Query Submission**: The user submits a search query.
2. **Search Execution**: The search is executed, and results are retrieved.
3. **Answer Generation**: An AI model generates an answer based on the search results.
4. **Answer Display**: The answer is displayed to the user.

### Integration
The AI-powered search answers are integrated into the frontend via the `AISearchAnswer` component, which is part of the `Search` scene.

**Section sources**
- [ai.ts](file://server/routes/api/ai/ai.ts#L602-L603)
- [Search.tsx](file://app/scenes/Search/Search.tsx#L1-L425)

## Background Jobs and Cache Invalidation
The search indexing and caching processes are managed by background jobs to ensure optimal performance and up-to-date search results.

### Background Jobs
- **Indexing Job**: Periodically updates the search index with new and updated documents.
- **Cache Invalidation Job**: Invalidates the search cache when documents are updated or deleted.

### Cache Invalidation Strategy
- **Document Update**: When a document is updated, the corresponding search cache entry is invalidated.
- **Document Deletion**: When a document is deleted, the search cache entry is removed.

**Section sources**
- [SearchHelper.ts](file://server/models/helpers/SearchHelper.ts#L71-L804)
- [searches.ts](file://server/routes/api/searches/searches.ts#L1-L91)

## Frontend Integration
The Search API is integrated into the frontend through various components and scenes, providing a seamless user experience.

### SearchPopover Component
The `SearchPopover` component provides a dropdown for searching documents. It includes:
- **Search Input**: A text input for entering search queries.
- **Search Results**: A list of search results with snippets and metadata.
- **Recent Searches**: A list of recent search queries.

### Search Scene
The `Search` scene provides a comprehensive search interface with:
- **Search Input**: A form for entering search queries.
- **Filters**: Various filters for refining search results (e.g., collection, user, date).
- **AI Answer Toggle**: A switch to enable or disable AI-powered search answers.

**Section sources**
- [SearchPopover.tsx](file://app/components/SearchPopover.tsx#L1-L242)
- [Search.tsx](file://app/scenes/Search/Search.tsx#L1-L425)

## Troubleshooting Guide
This section provides guidance for troubleshooting common issues with the Search API.

### Missing Results
- **Check Indexing**: Ensure the search indexing job is running and up-to-date.
- **Verify Permissions**: Ensure the user has the necessary permissions to access the documents.
- **Review Filters**: Check if any filters are excluding relevant results.

### Slow Queries
- **Optimize Queries**: Use more specific search terms to reduce the number of results.
- **Check Performance**: Monitor the performance of the search indexing and caching processes.
- **Database Optimization**: Ensure the database is optimized for full-text search.

### Relevance Issues
- **Adjust Ranking**: Review and adjust the ranking algorithm to better reflect user needs.
- **Improve Query Parsing**: Enhance the query parsing process to better handle complex queries.
- **User Feedback**: Collect user feedback to identify and address relevance issues.

**Section sources**
- [SearchHelper.ts](file://server/models/helpers/SearchHelper.ts#L71-L804)
- [searches.ts](file://server/routes/api/searches/searches.ts#L1-L91)
- [SearchPopover.tsx](file://app/components/SearchPopover.tsx#L1-L242)
- [Search.tsx](file://app/scenes/Search/Search.tsx#L1-L425)