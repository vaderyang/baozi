# Design Review: Contacts/Organization and Meeting Transcription

Owner: Agent Mode
Date: 2025-10-10
Scope: Review of the following proposals under todo/
- README.md (overview)
- contacts-organization-feature-proposal.md
- meeting-transcription-feature-proposal.md
- architecture-integration.md

Executive Summary
- Overall: Strong architectural alignment with Outline’s stack and conventions; thoughtful reuse of Mention, Attachment, queues (Bull), Redis, Postgres, ProseMirror, and WebSockets.
- Readiness: MVP for both features is feasible with low-to-moderate risk if we tighten data modeling, API contracts, and operational safeguards (quotas, retention, idempotency).
- Top improvements:
  1) Solidify DB schema with constraints and indexes; formalize PII handling and retention.
  2) Standardize API pagination, search, presenters, and rate limits.
  3) Add queue idempotency/backoff/DLQ; add cancel/retry APIs for transcription.
  4) Define feature flags and backward-compat fallbacks precisely (editor nodes and mentions).
  5) Establish metrics, alerts, and runbooks before enabling in production.

Scorecards (1–10)
- Contacts & Organization
  - Architectural fit: 8.5 — Cleanly extends Mention/search; low-touch UI integration (settings/search/sidebar) matches project ethos.
  - Data model & migrations: 8 — Good start; add uniqueness, CITEXT for emails, tsvector/trigram indexes, soft-delete strategy, and normalization rules.
  - API design: 7.5 — Add cursor pagination, consistent presenters, input validation, rate limits, and bulk import constraints.
  - Editor integration: 8 — Mention extension is natural; define fallback rendering for old clients and consistent attrs (id vs modelId).
  - Performance & scalability: 8 — Indexes and caching called out; watch N+1 in sidebar and search.
  - Cost control: 9 — Minimal incremental infra cost.
  - Security/privacy/compliance: 7.5 — PII classification, masking/redaction, and retention policies need definition.
  - Maintainability/extensibility: 8.5 — Feature flags; modular stores/routes/policies align with project.
  - Backward compatibility: 9 — Mentions degrade to text; does not alter core entities.

- Meeting Transcription
  - Architectural fit: 8.5 — Plugin + queue + Attachment reuse is spot on.
  - Data model & migrations: 8 — Consider splitting large speakers/segments data; avoid unbounded JSON growth; enforce statuses.
  - API design: 7.5 — Add cancel, retry, delete; idempotency keys; job info endpoints; progress events.
  - Editor integration: 8 — Placeholder node and later insertion are sound; define deterministic replacement logic.
  - Performance & scalability: 7.5 — Address file size constraints, chunking, concurrency/backpressure, and re-tries.
  - Cost control: 7 — Quotas, per-team budgets, and guardrails need concrete enforcement.
  - Security/privacy/compliance: 7.5 — Audio/transcripts contain PII; define retention, encryption, and provider DPAs; offer on-prem path.
  - Maintainability/extensibility: 8.5 — Provider factory is good; keep boundaries and tests.
  - Backward compatibility: 9 — Feature flag off by default; no core change when disabled.

Architecture Integration Review
- Positives
  - Clear data flows from audio upload → queue → provider → WebSocket → editor insertion.
  - ERD captures team boundaries; leverages Attachment for storage.
  - Events and WebSockets align with existing real-time infra.
- Gaps & suggestions
  - Event naming: unify snake vs dot (recommend dot notation like transcriptions.progress/completed).
  - Presenters: ensure all new routes return presenter-shaped JSON with policy filtering.
  - Team scoping: verify every read/write joins teamId; double-check contacts.org/user links.
  - Web/service split: ensure processing only in worker service; web nodes should not process.
  - Editor fallback: define explicit downgrade (unknown node → neutral div) and Mention plain-text fallback.

Concrete Improvements
1) Database schema and indexes
- Organizations
  - Unique per team on (teamId, name); optional slug/shortName uniqueness per team.
  - Parent FK ON DELETE SET NULL; ensure acyclic structure via app-level validation.
- Contacts
  - Use CITEXT for email; add partial unique index on (teamId, email) WHERE email IS NOT NULL.
  - Trigram index on name/email for fuzzy search; tsvector GIN for name/title/email.
  - Consider normalized phone (E.164) and uniqueness per team where appropriate.
- document_contacts
  - Enforce exactly one of (contactId, organizationId) NOT NULL via CHECK; add composite indexes on (documentId, contactId) and (documentId, organizationId).
- transcriptions
  - Constrain status with CHECK; index (teamId, status, createdAt) for admin views; consider moving segments into a separate table if growth is high.

Example indexes
```sql path=null start=null
-- Emails case-insensitive
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE contacts ALTER COLUMN email TYPE citext;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_contacts_team_email
  ON contacts(teamId, email) WHERE email IS NOT NULL;

-- Fuzzy search (pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON contacts USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin (name gin_trgm_ops);

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_contacts_search ON contacts
  USING gin(to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(email,'') || ' ' || coalesce(title,'')));
```

2) API contracts and behaviors
- Pagination: adopt cursor-based pagination (limit + nextCursor) across list/search endpoints.
- Input validation: use shared validators for email/phone/urls; cap CSV import batch sizes.
- Naming: follow existing Outline naming (contacts.create/list/info/update/delete/search; transcriptions.create/status/mapSpeakers/delete/list).
- Rate limiting: per-IP and per-user for create/search; separate burst vs sustained limits.
- Idempotency: transcriptions.create should accept an idempotencyKey to avoid duplicate jobs.
- Cancel/retry: add transcriptions.cancel and admin retry controls.
- Presenters: add present(contact), present(organization), present(transcription) with policy-driven fields.

3) Queue, retries, idempotency
- Use jobId derived from transcriptionId; set attempts with exponential backoff; timeouts per file duration.
- Dead-letter queue (DLQ) or failure topic for triage; periodic sweep to requeue stale jobs.
- Dedup: do not enqueue if job with same transcriptionId is active or delayed.

4) WebSocket events
- Use progress events (transcriptions.progress) with percentage and phase; completion event with payload sufficient to update editor and stores.
- Correlate events with transcriptionId and documentId; include a requestId/correlationId for tracing.

5) Editor integration
- Mention attrs: normalize attrs to { type, id, label, modelId } consistently; ensure fallback renderers.
- AudioTranscription node: define stable replacement (by transcriptionId) and transactional insertion to avoid duplication on reconnect.
- Suggestions ranking: prefer team members and frequently referenced contacts first.

6) Security, privacy, compliance
- PII classification: contacts (names/emails/phones), audio, transcripts. Add a PII flag in presenters for downstream masking.
- Retention: default audio expiry (e.g., 30 days) via Attachment.expiresAt; configurable per team.
- Encryption: enforce server-side encryption at rest (SSE-S3/SSE-KMS); TLS everywhere.
- Secrets: manage provider keys via env/secret manager; never log.
- DPA: document processors (OpenAI/Azure/Google) with DPAs and data residency guidance; provide on-prem provider option.
- Access logs and audit: record create/update/delete of contacts/orgs and transcription events.

7) Performance and cost controls
- Limits: TRANSCRIPTION_MAX_FILE_SIZE, MAX_DURATION, MAX_SPEAKERS; reject large uploads early.
- Quotas: per-team monthly minute quota; hard/soft limits with admin overrides.
- Caching: cache recent contacts/orgs and search results (Redis) with eviction.
- Priorities: short jobs get higher queue priority; backpressure metrics to auto-tune concurrency.

8) Observability and ops
- Metrics: job latencies, success/failure rates, minutes transcribed, storage usage, API RPS/latency, search hit rates.
- Tracing: add correlationId through API → queue → provider → WS; span links for provider calls.
- Runbooks: requeue stuck jobs, purge expired audio, repair orphaned document_contacts, rebuild FTS indexes.

Open Questions
- PII policy: Do we need redaction (names/emails) in transcripts? Team-configurable?
- Audio retention: Default duration and legal requirements by region?
- Provider selection: Per-team configurable provider and region? On-prem fallback tier?
- Language support: Auto-detect vs user-selected; target locales; mixed-language handling.
- CSV import: Required/optional fields; de-duplication strategy; dry-run mode; per-batch size limits.
- Organization hierarchy depth: Any max depth or cycles prevention rules?
- Contact ↔ User link: Who can set internal contacts, and can it be auto-synced?
- Visibility: Are contacts/orgs always team-visible, or can visibility be restricted?
- Quotas: Default monthly minutes and notifications when nearing limits.

Phased Roadmap
- MVP (Feature flags off by default; enable per team)
  - Contacts/Orgs: CRUD, search, mentions, sidebar, presenters, indexes, policies, CSV import (optional minimal), metrics.
  - Transcription: Upload via Attachment, single provider (Whisper), queue processing, progress/completion events, editor insertion, retention policy, metrics, basic retries.
- Phase 2
  - Contacts/Orgs: Hierarchy tree UI, improved search (trigram + FTS), import validations, external sync scaffolding.
  - Transcription: Diarization provider (Azure/Google), speaker mapping UI, cancel/retry, cost quotas, admin views, idempotency keys, DLQ.
- Phase 3
  - Multi-provider selection, real-time transcription, AI summaries/action items, timestamp navigation, on-prem provider, advanced auditing.

Acceptance Criteria (MVP)
- Contacts & Organization
  - Endpoints: create/list/info/update/delete/search implemented with cursor pagination and presenters.
  - Mentions: Contact/Organization mentions render and save; degrade to text on old clients.
  - Data: Unique constraints/indexes in place; policies enforce team scoping; basic CSV import (if in scope) validates and rate-limits.
  - UX: Settings management and document sidebar surfaces related contacts/orgs; global search includes contacts/orgs.
  - Observability: Metrics, structured logs, basic alerts.
- Meeting Transcription
  - Endpoints: create/status/list/delete with idempotency; progress and completed events over WS.
  - Queue: Jobs idempotent, with backoff/timeouts; failures observable; no duplicate enqueues per transcriptionId.
  - Editor: Placeholder node inserted and replaced deterministically after completion.
  - Storage: Audio retained per policy and auto-expired; transcripts stored and inserted into doc.
  - Cost: Enforced max file size/duration; per-team monthly quota.

Recommended Next Steps
1) Approve schema/index refinements and implement migrations.
2) Lock API contracts (DTOs, pagination, errors) and presenters.
3) Implement feature flags and policy checks; wire stores/components incrementally behind flags.
4) Add queue policies (idempotency/backoff/DLQ) and WS progress events.
5) Add metrics/alerts and runbooks.
