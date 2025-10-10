# Contacts & Organization – v2 Design (Minimal-Impact, High-Fit, High-Performance)

Goal
- Improve architectural fit, API design, and performance while preserving the minimum-impact principle and reusing existing Outline primitives.

Principles
- Minimal impact: no core rewrites; prefer extensions and feature flags.
- Strong fit: follow existing modules (models, presenters, policies, routes, queues, stores, editor mentions).
- Performance first: indexes, pagination, caching; avoid heavy writes in hot paths.

Scope
- Contacts and Organizations creation/lookup/mentioning and document associations.
- Does not introduce new top-level navigation; entry points are Settings, Global Search, Sidebar, and Mentions.

Architecture Fit Improvements
- Boundary placement
  - Keep models, routes, policies, presenters under server/ as standard modules; guard behind a feature flag (Team.preferences.features.contacts = true).
  - Reuse Mention node; do NOT introduce new editor node types.
  - Document-contact linking remains an implementation detail in the document update command path.
- Presenters and policies
  - Add present(contact) and present(organization); filter sensitive fields and normalize shapes.
  - Reuse cancan-style policies with team-scoped checks.
- Document mention linking (minimal-write strategy)
  - Replace full-delete-then-recreate with idempotent upserts:
    - Extract mentions for contact/organization.
    - Upsert document_contacts rows, ignoring duplicates via ON CONFLICT DO NOTHING.
    - Optionally soft-delete rows that are no longer referenced, but only if document revision increased to avoid thrashing.

Data Model Refinements (minimal changes)
- organizations
  - Add uniqueness per team: (teamId, name).
  - Keep parentOrganizationId nullable; validate acyclicity at app layer.
- contacts
  - Use citext for email to ensure case-insensitive match.
  - Partial unique index (teamId, email) WHERE email IS NOT NULL to prevent duplicates.
  - Keep phone and metadata flexible; defer custom field tables for later.
- document_contacts
  - Enforce exactly one target via CHECK(contactId IS NULL) XOR CHECK(organizationId IS NULL).
  - Composite indexes (documentId, contactId) and (documentId, organizationId) for efficient reverse lookups.

Example DDL/Indexes
```sql
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Organizations unique per team
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orgs_team_name ON organizations ("teamId", name);

-- Contacts email case-insensitive and unique per team when provided
ALTER TABLE contacts ALTER COLUMN email TYPE citext;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contacts_team_email
  ON contacts("teamId", email) WHERE email IS NOT NULL;

-- Fuzzy and full-text search
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts
  USING gin(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(title,'')));

-- Document link constraints
ALTER TABLE document_contacts
  ADD CONSTRAINT document_contacts_one_target
  CHECK (("contactId" IS NOT NULL AND "organizationId" IS NULL)
      OR ("contactId" IS NULL AND "organizationId" IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_doc_contacts_doc_contact ON document_contacts ("documentId", "contactId");
CREATE INDEX IF NOT EXISTS idx_doc_contacts_doc_org ON document_contacts ("documentId", "organizationId");
```

API Design (consistent, cursor-based, minimal surface)
- Endpoints
  - contacts.create, contacts.update, contacts.delete, contacts.info
  - contacts.list (cursor-based pagination), contacts.search
  - organizations.create, organizations.update, organizations.delete, organizations.info
  - organizations.list (cursor-based), organizations.search
- Cursor pagination
  - Request: { limit?: number (<= 50), cursor?: string, query?: string, filters? }
  - Response: { data: [...], nextCursor?: string }
- Search semantics
  - search endpoints support query with FTS + trigram; return small result sets (<= 20).
  - Global search integration optional; to minimize impact, start with dedicated contacts/organizations.search.
- Presenters
  - Ensure presenters hide internals; include organization summary within contact presenter when present.

Example Requests/Responses
```json
// POST /api/contacts.list
{
  "limit": 20,
  "cursor": "eyJpZCI6IjQy..."
}
```
```json
// 200 OK
{
  "data": [
    { "id": "c1", "name": "李四", "email": "lisi@example.com", "organization": { "id": "o1", "name": "ABC 公司" } }
  ],
  "nextCursor": "eyJpZCI6IjQz..." 
}
```

```json
// POST /api/contacts.search
{ "query": "李" }
```
```json
{
  "data": [ { "id": "c1", "name": "李四", "subtitle": "ABC 公司" } ]
}
```

Performance Plan (read/write hot paths)
- Read
  - Always paginate; use only required fields in SELECT lists to reduce row width.
  - Use indexes above; avoid LIKE leading wildcards by leveraging FTS/trgm.
  - Cache small, frequently accessed sets (e.g., recent contacts) in Redis with short TTL (e.g., 60–300s).
- Write
  - Document mention linking uses upsert with ON CONFLICT to minimize churn.
  - CSV import: cap batch size (e.g., <= 1000), stream parse, de-dup by (teamId, email) if provided.
- N+1 avoidance
  - Include organization on contact list via single JOIN when needed; avoid per-row lookups.

Feature Flags and Backward Compatibility
- Gate entire module behind contacts feature flag.
- Mentions degrade to plain text on old clients; presenters remain stable.

Security/Privacy (PII minimalism)
- Do not expose phone/email in list endpoints unless explicitly requested and authorized.
- Add server-side input validation for emails/URLs; normalize phone numbers where provided.

Metrics/Observability
- Emit counters for contacts/organizations CRUD, search QPS, cache hit rate, and document_contact link changes.
- Log de-dup events during import to surface data hygiene.

Migration Strategy (minimum impact)
- Add indexes and constraints first (non-blocking where possible).
- Backfill tsvector indexes concurrently.
- Enable feature flag for pilot teams; monitor metrics before broader rollout.
