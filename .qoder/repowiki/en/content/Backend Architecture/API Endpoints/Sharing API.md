# Sharing API

<cite>
**Referenced Files in This Document**   
- [Share.ts](file://app/models/Share.ts)
- [Share.ts](file://server/models/Share.ts)
- [shareLoader.ts](file://server/commands/shareLoader.ts)
- [share.ts](file://server/policies/share.ts)
- [schema.ts](file://server/routes/api/shares/schema.ts)
- [app.ts](file://server/routes/app.ts)
- [routeHelpers.ts](file://app/utils/routeHelpers.ts)
- [PublicBreadcrumb.tsx](file://app/scenes/Document/components/PublicBreadcrumb.tsx)
- [Shares.tsx](file://app/scenes/Settings/Shares.tsx)
- [index.tsx](file://plugins/googleanalytics/client/index.tsx)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Share Link Structure](#share-link-structure)
3. [API Endpoints](#api-endpoints)
4. [Request Validation and Zod Schemas](#request-validation-and-zod-schemas)
5. [Authentication and Authorization](#authentication-and-authorization)
6. [ShareLoader Command Implementation](#shareloader-command-implementation)
7. [URL Routing and Server-Side Rendering](#url-routing-and-server-side-rendering)
8. [Analytics Integration](#analytics-integration)
9. [Embedded View and SEO Options](#embedded-view-and-seo-options)
10. [Troubleshooting Guide](#troubleshooting-guide)

## Introduction
The Sharing API in the baozi application enables document and collection sharing through public links with configurable permissions, expiration, and access controls. This documentation details the implementation of sharing functionality, including public link creation, permission management, authentication bypass mechanisms, and integration with analytics. The system supports both UUID-based and custom URL slug-based share links, with comprehensive policy enforcement and tracking capabilities.

## Share Link Structure
The sharing system supports two types of share identifiers: UUIDs and custom URL slugs. The canonical URL structure follows the pattern `/s/{identifier}`, where the identifier can be either a UUID or a custom slug. When a custom slug is configured, requests to the UUID-based URL are redirected to the slug-based URL with a 307 temporary redirect to maintain SEO integrity while allowing slug modifications.

Custom domains can be assigned to shares, enabling branded sharing through vanity URLs. The domain field in the Share model must be globally unique and validated as a fully qualified domain name (FQDN). When a custom domain is used, the canonical URL reflects the domain instead of the default application URL.

**Section sources**
- [Share.ts](file://server/models/Share.ts#L187-L196)
- [app.ts](file://server/routes/app.ts#L169-L175)

## API Endpoints
The Sharing API provides RESTful endpoints for managing share links through standard HTTP methods. All endpoints are accessible under the `/api/shares` route prefix.

### Create Share
- **HTTP Method**: POST
- **URL Pattern**: `/api/shares.create`
- **Description**: Creates a new share link for a document or collection. Requires either `documentId` or `collectionId` in the request body.
- **Request Schema**: `SharesCreateSchema`
- **Response**: Returns the created share object with canonical URL and access configuration.

### List Shares
- **HTTP Method**: POST
- **URL Pattern**: `/api/shares.list`
- **Description**: Retrieves a list of active share links for a team. Supports sorting and filtering.
- **Request Schema**: `SharesListSchema`
- **Response**: Returns paginated list of share objects with metadata.

### Update Share
- **HTTP Method**: POST
- **URL Pattern**: `/api/shares.update`
- **Description**: Modifies share configuration including permissions, visibility, and URL slug.
- **Request Schema**: `SharesUpdateSchema`
- **Response**: Returns updated share object.

### Revoke Share
- **HTTP Method**: POST
- **URL Pattern**: `/api/shares.revoke`
- **Description**: Invalidates a share link by setting the `revokedAt` timestamp.
- **Request Schema**: `SharesRevokeSchema`
- **Response**: Returns success status.

### Share Information
- **HTTP Method**: POST
- **URL Pattern**: `/api/shares.info`
- **Description**: Retrieves information about a specific share link using its ID, collection ID, or document ID.
- **Request Schema**: `SharesInfoSchema`
- **Response**: Returns share details including associated document or collection.

**Section sources**
- [schema.ts](file://server/routes/api/shares/schema.ts#L1-L108)

## Request Validation and Zod Schemas
The Sharing API uses Zod for request validation, ensuring data integrity and security. The validation schemas are defined in `schema.ts` and enforce strict type checking and business rules.

### SharesCreateSchema
Validates share creation requests with the following rules:
- Either `documentId` or `collectionId` is required
- `published` defaults to false
- `includeChildDocuments` defaults to false
- `urlId` must match the SHARE_URL_SLUG_REGEX pattern (alphanumeric and dashes only)
- `allowIndexing`, `showLastUpdated`, and `showTOC` are optional boolean flags

### SharesUpdateSchema
Validates share update requests with the following rules:
- `id` must be a valid UUID
- `urlId` must match the SHARE_URL_SLUG_REGEX pattern or be null
- All boolean options (`published`, `allowIndexing`, `showLastUpdated`, `showTOC`, `includeChildDocuments`) are optional

### SharesRevokeSchema
Validates share revocation requests:
- `id` must be a valid UUID

### SharesListSchema
Validates share listing requests:
- `sort` parameter must correspond to a valid Share model attribute
- `direction` defaults to "DESC" if not specified

**Section sources**
- [schema.ts](file://server/routes/api/shares/schema.ts#L1-L108)

## Authentication and Authorization
The sharing system implements a comprehensive authorization model through the `share.ts` policy file. Access control is enforced using a cancan-style permission system that evaluates user roles and resource ownership.

### Policy Rules
- **Create Share**: Team members with mutable access who are not guests
- **List Shares**: Team members who are not guests
- **Read Share**: Team members who are not guests
- **Update Share**: Team members who are not guests or viewers, and have share permissions on the associated collection or document
- **Revoke Share**: Team administrators or the share owner

The authorization logic is implemented in the `shareLoader` command, which validates share accessibility based on team, collection, and document states. The system checks for suspended teams, archived collections, and revoked shares, throwing appropriate errors when access is denied.

**Section sources**
- [share.ts](file://server/policies/share.ts#L1-L50)
- [shareLoader.ts](file://server/commands/shareLoader.ts#L69-L87)

## ShareLoader Command Implementation
The `shareLoader` command is responsible for loading and validating share objects for public access. It implements the core logic for share resolution, access control, and content retrieval.

### loadPublicShare Function
This function loads a share for public access with the following parameters:
- `id`: Share identifier (UUID or URL slug)
- `collectionId`: Optional collection ID for context
- `documentId`: Optional document ID for context
- `teamId`: Required when using URL slug identifiers

The function performs the following operations:
1. Validates the identifier type and requires teamId for URL slugs
2. Queries the Share model with filters for non-revoked and published shares
3. Includes associated document and collection data with appropriate scopes
4. Validates team, collection, and document states (not suspended or archived)
5. Checks sharing permissions at both team and collection levels
6. Builds the shared content tree for navigation
7. Validates document access within the shared context
8. Returns the share object with associated content

### loadShareWithParent Function
This function loads a share with its parent context for authenticated users. It:
1. Finds the share based on collectionId or documentId
2. Authorizes read access to the share
3. Loads parent shares for navigation context
4. Returns both the share and its parent share when applicable

The function implements hierarchical access control, ensuring users can only access shares through valid parent-child relationships.

**Section sources**
- [shareLoader.ts](file://server/commands/shareLoader.ts#L21-L231)

## URL Routing and Server-Side Rendering
The sharing system implements sophisticated URL routing and server-side rendering (SSR) to optimize user experience and SEO.

### Route Patterns
The system supports multiple URL patterns:
- `/s/:shareId` - Direct share access
- `/s/:shareId/doc/:documentSlug` - Access to specific document within shared content
- `/share/:shareId` - Legacy route that redirects to `/s/:shareId`

The routing is implemented in `app.ts` with middleware that handles the legacy share routes and redirects them to the canonical `/s/` prefix.

### Server-Side Rendering
The `renderShare` function in `app.ts` handles SSR for shared content with the following features:
- Retrieves share information to populate document title in HTML
- Integrates with analytics systems when available
- Updates share statistics (views and lastAccessedAt) on non-bot access
- Controls embedding via X-Frame-Options header based on team preferences
- Manages SEO indexing through robots meta tags based on the allowIndexing flag
- Generates canonical URLs for proper search engine indexing

The SSR process injects share-specific metadata into the HTML response, ensuring proper unfurling in social media and messaging platforms.

**Section sources**
- [app.ts](file://server/routes/app.ts#L146-L254)
- [routeHelpers.ts](file://app/utils/routeHelpers.ts#L1-L64)

## Analytics Integration
The sharing system integrates with analytics platforms to track engagement and usage patterns. The integration is implemented through the Google Analytics plugin and server-side tracking.

### Client-Side Integration
The Google Analytics plugin registers as a settings integration and provides configuration options for GA4 tracking. When enabled, it sends view and event analytics to the configured GA4 dashboard.

### Server-Side Tracking
The system automatically tracks share usage through:
- View counting: Incremented on each non-bot access
- Last accessed timestamp: Updated on each access
- Referrer tracking: Captured through standard HTTP headers
- Bot detection: Excluded from view counting to prevent inflation

Analytics data is associated with the team's integrations, allowing multiple analytics providers to be configured simultaneously. The tracking respects team preferences for data collection and privacy.

**Section sources**
- [index.tsx](file://plugins/googleanalytics/client/index.tsx#L1-L19)
- [app.ts](file://server/routes/app.ts#L177-L194)

## Embedded View and SEO Options
The sharing system provides configurable options for embedded views and SEO optimization through share parameters.

### Embedded View Configuration
- **Prevent Embedding**: Controlled by team preference `PreventDocumentEmbedding`
- When disabled, the X-Frame-Options header is removed, allowing shares to be embedded in iframes on other websites
- The embedding behavior respects team-level security policies

### SEO Optimization
- **Indexing Control**: The `allowIndexing` flag determines whether search engines can index the shared content
- When disabled, a `noindex, nofollow` robots meta tag is injected into the HTML
- Canonical URLs are generated to prevent duplicate content issues
- Sitemap generation is supported through the `/api/shares.sitemap` endpoint
- Open Graph and Twitter Card metadata is populated from document content for rich unfurls

### Display Options
- **Show Last Updated**: When enabled, displays the last updated timestamp on the shared content
- **Show Table of Contents**: When enabled, displays the document's table of contents for navigation
- **Custom Branding**: Public branding options (team name and avatar) can be displayed on shared content based on team preferences

These options provide content creators with fine-grained control over how their shared content appears in search results and when embedded on other sites.

**Section sources**
- [Share.ts](file://app/models/Share.ts#L70-L80)
- [app.ts](file://server/routes/app.ts#L200-L216)

## Troubleshooting Guide
This section addresses common issues encountered with the sharing functionality and provides resolution steps.

### Broken Links
**Symptoms**: Share links return 404 errors
**Possible Causes**:
- Share has been revoked
- Associated team is suspended
- Collection or document has been archived
- Using UUID when a custom slug is configured (results in redirect)

**Resolution**:
1. Verify the share status in the database (revokedAt timestamp)
2. Check team, collection, and document states
3. Ensure the correct URL format is used (slug vs UUID)
4. Verify the share is published (published flag)

### Permission Errors
**Symptoms**: Access denied despite valid share link
**Possible Causes**:
- Team sharing is disabled
- Collection sharing is disabled
- User is accessing through a restricted context
- Child document access when includeChildDocuments is false

**Resolution**:
1. Verify team and collection sharing settings
2. Check the includeChildDocuments flag for document shares
3. Ensure the requesting context has proper permissions
4. Validate the share's published status

### SEO Indexing Issues
**Symptoms**: Shared content not appearing in search results
**Possible Causes**:
- allowIndexing flag is set to false
- Missing or incorrect canonical URL
- Robots.txt blocking access
- Content not properly unfurled by search engines

**Resolution**:
1. Verify allowIndexing is enabled for the share
2. Check canonical URL generation in the HTML response
3. Ensure proper Open Graph and Twitter Card metadata
4. Validate sitemap inclusion through `/api/shares.sitemap`
5. Test unfurling with social media debugger tools

### Analytics Tracking Issues
**Symptoms**: Share views not being recorded
**Possible Causes**:
- Bot traffic filtering
- Analytics integration not configured
- Tracking code blocked by ad blockers
- Server-side tracking disabled

**Resolution**:
1. Verify analytics integration is enabled for the team
2. Check that view counting is working in server logs
3. Test with non-bot user agents
4. Validate integration settings and credentials

**Section sources**
- [shareLoader.ts](file://server/commands/shareLoader.ts#L69-L87)
- [app.ts](file://server/routes/app.ts#L184-L194)
- [Share.ts](file://app/models/Share.ts#L70-L80)