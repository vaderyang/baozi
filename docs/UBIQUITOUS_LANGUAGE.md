# Ubiquitous Language

This document serves as the canonical glossary of domain terminology used throughout Outline, a collaborative knowledge base platform. It ensures consistent communication between developers, product managers, and stakeholders by defining key terms and their meanings within the Outline context.

## Table of Contents

- [Purpose and Scope](#purpose-and-scope)
- [Core Entities](#core-entities)
- [User Management & Permissions](#user-management--permissions)
- [Content Management](#content-management)
- [Collaboration Features](#collaboration-features)
- [System Operations](#system-operations)
- [Technical Concepts](#technical-concepts)
- [Naming Conventions](#naming-conventions)
- [Usage Examples](#usage-examples)

## Purpose and Scope

This ubiquitous language covers the domain model of Outline, including:
- Core business entities and their relationships
- User roles, permissions, and access control
- Content lifecycle and organization concepts
- Collaboration and sharing mechanisms
- System operations and integrations
- Technical implementation details

**Audience**: Developers, product managers, designers, and stakeholders working on Outline.

## Core Entities

### Document
A piece of content within Outline containing structured text and media. Documents are the primary content units that users create, edit, and share.

**Key States**: Draft (unpublished), Published, Archived, Deleted (soft-deleted)
**Relationships**: Belongs to a Collection; may have a parent Document; created and updated by Users
**Code Reference**: `server/models/Document.ts`

### Collection
An organizational container that groups related Documents. Collections define access permissions and provide navigation structure for content.

**Key Attributes**: Name, description, icon, color, sharing settings, permission level
**Relationships**: Contains Documents; belongs to a Team; has User and Group memberships
**Code Reference**: `server/models/Collection.ts`

### Team
The top-level organizational unit that represents a workspace or organization. All content and users belong to a team.

**Key Attributes**: Name, subdomain, domain, default permissions, preferences
**Relationships**: Contains Collections, Users, Groups; has authentication providers
**Code Reference**: `server/models/Team.ts`

### User
An individual person who interacts with Outline. Users have roles and permissions that determine their access to content and features.

**Key Attributes**: Name, email, role, preferences, authentication status
**Relationships**: Belongs to a Team; has memberships in Collections and Groups
**Code Reference**: `server/models/User.ts`

### Share
A public link that allows external access to a Document or Collection without requiring authentication.

**Key Attributes**: Public URL, domain settings, view count, revocation status
**Relationships**: Points to a Document or Collection; created by a User
**Code Reference**: `server/models/Share.ts`

### Group
A collection of Users within a Team, used to manage permissions at scale by granting access to multiple users simultaneously.

**Key Attributes**: Name, external ID (for SSO integration)
**Relationships**: Contains Users through GroupUser; has Collection memberships
**Code Reference**: `server/models/Group.ts`

### Revision
A saved version of a Document that captures its content at a specific point in time. Enables version history and document recovery.

**Key Attributes**: Title, content (ProseMirror data), creation timestamp
**Relationships**: Belongs to a Document; created by a User
**Code Reference**: `server/models/Revision.ts`

### Attachment
A file uploaded and associated with a Document, such as images, PDFs, or other media.

**Key Attributes**: Filename, content type, size, URL
**Relationships**: Belongs to a Team; may be referenced in Documents
**Code Reference**: `server/models/Attachment.ts`

### Event
A record of significant actions taken within Outline, used for audit trails and triggering notifications.

**Key Attributes**: Event type, actor (User), target resource, timestamp, metadata
**Relationships**: References Users and various target entities
**Code Reference**: `server/models/Event.ts`

### Notification
A message delivered to Users about relevant activities, such as document updates or comments.

**Key Attributes**: Event type, delivery channels (in-app, email), read status
**Relationships**: Belongs to a User; triggered by Events
**Code Reference**: `server/models/Notification.ts`

### Star
A bookmark that Users can add to Documents they want to easily find later.

**Relationships**: Links a User to a Document
**Code Reference**: `server/models/Star.ts`
**Synonym**: Favorite

### Pin
A way to highlight important Documents at the top of a Collection's navigation.

**Relationships**: Links a Document to a Collection with priority ordering
**Code Reference**: `server/models/Pin.ts`

## User Management & Permissions

### Roles
Define a User's level of access and capabilities within a Team:

- **Admin**: Full access to all content and team management functions
- **Member**: Can create and edit content, invite users (if team allows)  
- **Viewer**: Read-only access to content they have permissions for
- **Guest**: Limited access user, typically from external shares

**Code Reference**: `shared/types.ts` (UserRole enum)

### Permissions
Define the level of access to specific Collections or Documents:

- **Read**: View content only
- **ReadWrite**: View and edit content  
- **Admin**: Full control including sharing and deletion

**Code Reference**: `shared/types.ts` (CollectionPermission, DocumentPermission enums)

### Membership
The association between a User and a Collection that grants specific permissions.

**Types**:
- **UserMembership**: Direct user-to-collection permission
- **GroupMembership**: Permission granted through Group membership

**Code References**: `server/models/UserMembership.ts`, `server/models/GroupMembership.ts`

### Authentication Provider
External service integration for user authentication (Google, Slack, SAML, etc.).

**Key Attributes**: Provider type, configuration, enabled status
**Code Reference**: `server/models/AuthenticationProvider.ts`

### API Key
Token that allows programmatic access to Outline's API with specific scopes.

**Key Attributes**: Name, scopes, last used timestamp, expiration
**Scopes**: Read, Write, Create (defined in `shared/types.ts`)
**Code Reference**: `server/models/ApiKey.ts`

## Content Management

### Document States
The lifecycle status of a Document:

- **Draft**: Unpublished content, visible only to the author and those with direct access
- **Published**: Publicly available content within its Collection's permissions
- **Archived**: Hidden from normal navigation but still accessible via direct links
- **Template**: A special Document used as a starting point for creating new Documents

### Hierarchy
Documents can be organized in parent-child relationships within Collections, creating nested navigation structures.

**Key Concepts**:
- **Parent Document**: A Document that contains child Documents
- **Child Document**: A Document nested under a parent
- **Navigation Node**: Represents a Document or Collection in the navigation tree

### Slug
A URL-friendly identifier generated from a Document or Collection title, used in public URLs.

**Generation**: Automatic from title, with collision detection and uniqueness enforcement
**Code Reference**: `@shared/utils/slugify`

### Template
A Document marked as reusable for creating new Documents with pre-defined structure and content.

**Key Attributes**: Template flag, scope (team-wide or collection-specific)
**Operations**: Apply template to new Document, convert Document to template

## Collaboration Features

### Comment
User-generated discussion attached to specific content within a Document.

**Key Attributes**: Content, anchored position, resolution status, threading
**Relationships**: Belongs to Document; created by User; may have Reactions
**Code Reference**: `server/models/Comment.ts`

### Reaction
An emoji-based response to Documents or Comments, providing lightweight feedback.

**Key Attributes**: Emoji character, User association
**Code Reference**: `server/models/Reaction.ts`

### Mention
A reference to a User or Document within content, triggering notifications to mentioned parties.

**Types**: User mentions (@username), Document mentions (internal links)
**Code Reference**: `shared/types.ts` (MentionType enum)

### Subscription
A User's opt-in to receive notifications about changes to specific Documents or Collections.

**Key Attributes**: Target entity, notification preferences, subscription status
**Code Reference**: `server/models/Subscription.ts`

### Presence
Real-time indication of Users actively viewing or editing a Document.

**Implementation**: WebSocket-based with session tracking
**Scope**: Document-level presence information

## System Operations

### Import/Export
Bulk operations for moving content into and out of Outline.

**Supported Formats**:
- **MarkdownZip**: Outline's native format with attachments
- **HTMLZip**: Web-compatible export format  
- **PDF**: Read-only document export
- **Notion**: Import from Notion workspace

**Implementation**: Asynchronous job processing via FileOperation
**Code Reference**: `shared/types.ts` (FileOperationFormat enum)

### FileOperation
A background job that handles long-running file processing tasks like imports and exports.

**Key States**: Creating, Uploading, Complete, Error, Expired
**Code Reference**: `server/models/FileOperation.ts`

### Integration
External service connections that extend Outline's functionality.

**Types**:
- **Post**: Send updates to external systems (Slack, webhooks)
- **Command**: Receive commands from external systems  
- **Embed**: Display external content within Documents
- **Analytics**: Track usage metrics
- **Import**: Bring content from external sources

**Code Reference**: `shared/types.ts` (IntegrationType enum)

### Webhook
HTTP callbacks sent to external URLs when specific events occur in Outline.

**Key Concepts**: Event subscription, delivery retry logic, signature verification
**Code Reference**: `server/models/WebhookSubscription.ts`

### Search
Full-text search functionality with permissions-aware results and advanced filtering.

**Features**: Content indexing, backlink discovery, scoped search (Collection/User), relevance ranking

### Backlink
Automatic detection and indexing of Documents that reference other Documents, creating a knowledge graph.

**Implementation**: Generated from Document links and mentions during indexing

## Technical Concepts

### ProseMirror
The rich text editor framework powering Outline's document editing experience.

**Key Concepts**:
- **Schema**: Defines the allowed document structure and node types
- **Node**: A piece of document content (paragraph, heading, list, etc.)
- **Mark**: Text formatting (bold, italic, links, etc.)
- **Transaction**: A set of changes applied to a document
- **Plugin**: Extensions that add editing functionality
- **Command**: Functions that perform editing operations

**Code Reference**: `shared/editor/` directory

### Validation
Input validation and data integrity enforcement at both API and model levels.

**Implementation**: Zod schemas for API validation, Sequelize validators for models
**Code Reference**: API route schema files, model validator decorators

### Policy
Authorization rules that determine User access to resources.

**Implementation**: Cancan-based policy evaluation in `server/policies/`
**Evaluation**: Hierarchical permission checking with caching

### Scope
Permission boundaries for API access and resource visibility.

**Types**: 
- **API Scopes**: Read, Write, Create for API tokens
- **Search Scopes**: Team, Collection, Document-level result filtering
- **Webhook Scopes**: Event type subscriptions

## Naming Conventions

### Identifiers
- **UUIDs**: Primary identifiers for all major entities
- **Timestamps**: `createdAt`, `updatedAt`, `deletedAt` for lifecycle tracking
- **Soft Delete**: `deletedAt` timestamp instead of physical record removal

### Entity Naming
- **Singular Forms**: Model names use singular (Document, not Documents)
- **Pluralization**: API endpoints and collections use plural forms
- **Camel Case**: JavaScript/TypeScript properties use camelCase
- **Snake Case**: Database columns use snake_case

### State vs Status
- **Archive**: Hide from navigation but preserve access
- **Delete**: Soft-delete with `deletedAt` timestamp  
- **Published**: Visible according to Collection permissions
- **Draft**: Unpublished, limited visibility

## Usage Examples

### Example 1: Permission Resolution
When determining if a User can edit a Document:
1. Check Team membership and role
2. Evaluate Collection-level permissions (direct UserMembership or via GroupMembership)  
3. Apply Document-specific overrides if present
4. Consider Share-based access for public links

### Example 2: Navigation Structure
A Collection's navigation tree combines:
- Pinned Documents (high priority)
- Top-level Documents (parentDocumentId is null)
- Nested Documents (hierarchical by parentDocumentId)
- Archived Documents (excluded from normal navigation)

---

## Maintenance

This document should be updated when:
- New domain models are introduced
- Existing concepts change significantly  
- New user-facing features alter terminology

Contributors should reference this glossary when designing APIs, writing documentation, and discussing requirements to ensure consistent language across the platform.

For questions or suggestions about terminology, please create an issue or discuss in pull requests.