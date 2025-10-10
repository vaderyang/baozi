# Meeting Transcription – v2 Design (Minimal-Impact, High-Fit, High-Performance)

Goal
- Strengthen architectural fit, API contracts, and performance/cost controls while preserving the minimal-impact principle and reusing existing systems (Attachment, queues, WebSockets, presenters, policies).

Principles
- Minimal impact: keep as plugin; no changes to core Document semantics.
- Strong fit: web handles API; worker processes jobs; events via WebSockets; presenters filter outputs.
- Performance & cost: strict limits, idempotency, retries/backoff, dedup, retention.

Architecture Fit Improvements
- Plugin boundary
  - Keep provider implementations inside plugins/transcription; select via env TRANSCRIPTION_PROVIDER.
  - Web-only enqueues jobs; processing only in worker service (server/services/worker).
- Status machine
  - pending → processing → speaker_mapping? → completed | failed | canceled
  - Transition constraints enforced at service layer to avoid illegal jumps.
- Event naming (dot notation)
  - transcriptions.progress, transcriptions.completed, transcriptions.failed, transcriptions.canceled.
- Presenter and policy
  - present(transcription) exposes safe, minimal fields; policies reuse DocumentPolicy for read/update.

API Design (idempotent, cursor-based, minimal yet complete)
- transcriptions.create
  - Body: { attachmentId: string, documentId: string, idempotencyKey?: string }
  - Behavior: if idempotencyKey matches an in-flight/completed job for the same doc+attachment, return existing record.
- transcriptions.status
  - Body: { id: string }
- transcriptions.list
  - Body: { documentId?: string, limit?: number (<= 50), cursor?: string, status?: string }
  - Returns paginated list scoped to team.
- transcriptions.mapSpeakers
  - Body: { id: string, speakers: SpeakerMapping[] }
- transcriptions.cancel
  - Body: { id: string }
  - Marks job canceled if not yet completed/failed; attempts to remove from queue.
- transcriptions.delete
  - Body: { id: string }
  - Soft delete record and detach from editor; does not delete audio by default (respects retention policy).

Example Requests/Responses
```json
// POST /api/transcriptions.create
{ "attachmentId": "att_123", "documentId": "doc_456", "idempotencyKey": "req_abc" }
```
```json
// 200 OK
{ "data": { "id": "tr_789", "status": "pending", "documentId": "doc_456" } }
```

```json
// POST /api/transcriptions.list
{ "documentId": "doc_456", "limit": 20 }
```
```json
{
  "data": [ { "id": "tr_789", "status": "completed" } ],
  "nextCursor": "eyJpZCI6IjEyMyJ9"
}
```

Queueing, Idempotency, and Failure Handling
- Queue
  - Job id = transcriptionId; attempts: 5; exponential backoff (e.g., 2x, max 5m); timeout proportional to audio duration with upper bound (e.g., 5–10m).
- Idempotency
  - Use idempotencyKey + (documentId, attachmentId) as uniqueness guard at create time.
  - Deduplicate enqueues: do not enqueue if job exists in active/delayed state.
- Cancelation
  - If job still queued or active and cancel requested, mark canceled and try to remove from queue; emit transcriptions.canceled.
- Dead-letter strategy
  - On repeated failures, mark failed and emit transcriptions.failed; provide admin requeue tooling.

Performance and Cost Controls
- Limits (server-side validation)
  - TRANSCRIPTION_MAX_FILE_SIZE (e.g., 25MB default) and MAX_DURATION (e.g., 120m) enforced.
  - TRANSCRIPTION_MAX_SPEAKERS (e.g., 10) to prevent pathological diarization results.
- Concurrency and backpressure
  - TRANSCRIPTION_QUEUE_CONCURRENCY tuned per environment; prioritize shorter audio jobs.
  - Rate-limit create endpoint per user/team (burst + sustained) to control spend.
- Retention and storage
  - Use Attachment.expiresAt to auto-expire audio after N days (default 30); configurable per team.
  - Optionally delete original audio after successful transcription (team preference).
- Caching and reuse
  - Optional hash-based de-dup: if exact same audio content (hash) was processed recently by the same team, reuse prior transcript.

Data Model Notes (minimal changes)
- Keep JSONB fields (content, text, speakers, metadata) in transcriptions for MVP.
- If transcripts grow large: consider normalized transcript_segments table in later phase; not required for v2.
- Enforce CHECK constraint on status values.

WebSocket Events (payloads minimal but sufficient)
- transcriptions.progress
  - { id, documentId, percent, phase: "upload|queued|processing|formatting|waiting_mapping" }
- transcriptions.completed
  - { id, documentId, content, text, metadata }
- transcriptions.failed/canceled
  - { id, documentId, error? }

Editor Integration (deterministic replacement, no new core constructs)
- Use a stable placeholder keyed by transcriptionId; replace only if node transcriptionId matches event.id.
- De-duplicate insertions on reconnect by checking if final content already present.

Security/Privacy
- Do not log raw audio or transcript text.
- Mark transcripts as PII-bearing; presenters may omit raw text if team privacy setting demands.
- Provider DPAs documented; allow on-prem provider implementation.

Metrics/Observability
- Emit: job_latency, provider_latency, success/fail counts, minutes_transcribed, storage_used, create_rps, rate_limit_hits, cancel_count.
- Correlation IDs: propagate from HTTP request → queue job → provider call → WS event.

Rollout (minimum impact)
- Feature flag off by default (Team.preferences.features.transcription = false).
- Enable for pilot teams; track minutes used and error rates before broader rollout.
