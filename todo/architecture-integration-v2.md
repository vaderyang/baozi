# Contacts + Transcription Integration – v2 (Minimal-Impact Alignment)

What changed vs v1
- Event naming unified to dot notation.
- Document mention linking refactored to upsert-only (minimize churn).
- API surface standardized (cursor pagination, presenters, idempotency/cancel).
- Performance plan tightened (indexes, caching, de-dup, backpressure).

System Boundaries (aligned to Outline)
- Web service
  - Hosts REST APIs for contacts/orgs/transcriptions; uses presenters and policies.
  - Enqueues transcription jobs; never processes them.
- Worker service
  - Owns transcription processing and provider calls.
  - Emits events via the existing event bus for WebSockets to pick up.
- WebSockets/collaboration
  - Relays transcriptions.progress/completed/failed/canceled to clients.
- Storage
  - S3-compatible for audio via Attachment; lifecycle rules for retention.
  - PostgreSQL for models and associations; Redis for queues and small caches.

Data Flows (v2)
1) Mention-based association (document → contacts/orgs)
   - On document save/update, extract mentions.
   - Upsert document_contacts rows; soft-delete stale rows only when document revision increases.
   - No heavy delete/insert cycles; avoids row churn.
2) Transcription processing
   - Client uploads audio → Attachment.
   - Client creates transcription with optional idempotencyKey.
   - Web enqueues job (jobId = transcriptionId).
   - Worker pulls job, calls provider, formats result, updates record.
   - WebSockets push progress/completed events; editor replaces placeholder deterministically.

API Snapshot (v2)
- Contacts/Organizations
  - *.list (cursor), *.search (FTS/trgm), *.create/update/delete/info
- Transcriptions
  - transcriptions.create/status/list/delete
  - transcriptions.mapSpeakers, transcriptions.cancel

Event Names (v2)
- transcriptions.progress
- transcriptions.completed
- transcriptions.failed
- transcriptions.canceled

Indexes and Caching (v2)
- Contacts
  - citext email, unique (teamId, email) where email IS NOT NULL.
  - trgm on name, tsvector on (name, email, title).
  - Cache recent contacts list per team (TTL 60–300s).
- Document links
  - Composite indexes on (documentId, contactId) and (documentId, organizationId).
- Transcriptions
  - Index (teamId, status, createdAt) for admin views.
  - Queue concurrency tuned; small jobs prioritized.

Backwards Compatibility
- Feature flags gate modules; older clients see mention fallbacks as plain text.
- No changes to core document schema; Audio stored via Attachment as before.

Rollout
- Phase-in by team; monitor metrics (latency, failure, minutes, cache hit).
- Adjust limits and concurrency based on backpressure metrics.
