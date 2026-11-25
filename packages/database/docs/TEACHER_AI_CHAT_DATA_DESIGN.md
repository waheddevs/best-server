# Teacher AI chat data design

Initial design recorded 2026-11-06 before schema changes; implementation approved
by the owner on 2026-11-07. The initial proposal below is retained for design
history and is superseded by the final implementation decision at the end.
Prisma models and the additive migration now exist and have been tested on
disposable PostgreSQL databases. After validation, the single pending additive
migration was applied to local 127.0.0.1:5432/best; no production DB was changed.

## Scope and policy decisions

- Teacher-owned text conversations only. Resolve active TEACHER status from the
  database on each operation and immediately before provider dispatch.
- No automatic page, roster, student, grade, account or financial context.
- No tools, attachments, grading, public/Student/Admin access or publication.
- A pinned `:free` model only. No `openrouter/auto`, free router, fallback list,
  paid variant, web plugin or client-supplied provider parameters.
- Validate fresh model-catalog evidence: all listed prices must be zero. Set
  prompt/completion/request maximum prices to zero; disable provider fallback.
  Missing, stale, unknown or nonzero pricing makes the service unavailable.
- Keep data collection denied and ZDR requested. Account ZDR-only settings and
  downstream eligibility need review; do not relax privacy to obtain free access.
- Proposed conservative limits: 40 dispatch attempts per UTC day globally,
  10 per Teacher per UTC day, 10 per minute and concurrency 1. Provider failures
  consume dispatch quota. These are application caps, not guaranteed capacity.
- Retention has no default. Candidate: seven days for a small pilot, subject to
  owner confirmation. Pilot allowlist starts empty. Feature starts disabled.

## Proposed relational records

Use UUID identifiers and timestamptz timestamps consistent with existing models.
Relations below must be represented as FKs, not unchecked string associations.

| Record              | Fields and constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AiConversation      | id; ownerId -> User RESTRICT; title varchar(80); createdAt, updatedAt, archivedAt, expiresAt; nextSequence bigint; version int. Index (ownerId, archivedAt, updatedAt DESC, id DESC), index expiresAt. Unique (id, ownerId).                                                                                                                                                                                                                                                                         |
| AiMessage           | id; conversationId -> AiConversation CASCADE; sequence bigint; kind USER/ASSISTANT; content text; createdAt; runId nullable. Unique (conversationId, sequence); one assistant message per run using a partial unique index. CHECK nonempty bounded content.                                                                                                                                                                                                                                          |
| AiChatRun           | id; conversationId and requesterId composite FK -> conversation (id, ownerId); triggerMessageId -> AiMessage; idempotencyKey UUID; frozenThroughSequence; promptPolicyVersion; model/provider requested; status; safeErrorCode; createdAt/completedAt; leaseOwner, leaseExpiresAt, leaseGeneration; reservedUsd/actualUsd numeric(20,9), initially zero. Unique (requesterId, idempotencyKey); partial UNIQUE (conversationId) WHERE status IN ('QUEUED','RUNNING'). Index (status, leaseExpiresAt). |
| AiProviderCall      | id; runId -> AiChatRun CASCADE; ordinal; dispatchId UUID UNIQUE; providerRequestId nullable; requested/reported model/provider; state PREPARED/DISPATCHED/COMPLETED/REJECTED/AMBIGUOUS; usage counts; actualUsd numeric(20,9); startedAt/completedAt. Unique (runId, ordinal); index (state, startedAt). No raw request/response bodies or credentials.                                                                                                                                              |
| AiProcessingConsent | id; ownerId -> User RESTRICT; noticeVersion; acceptedAt; revokedAt. Notice version binds the reviewed provider/privacy and local retention policy. No consent inferred from opening the panel.                                                                                                                                                                                                                                                                                                       |
| AiQuotaBucket       | scope GLOBAL/TEACHER; scopeKey; windowStart; windowSeconds; reservedCount; dispatchedCount; activeCount. Composite unique (scope, scopeKey, windowStart, windowSeconds); nonnegative checks. Global scope uses a constant key, Teacher scope the UUID.                                                                                                                                                                                                                                               |

Cross-message and run relations must enforce same-conversation consistency with
composite FKs. The user-message/run relation is created in one transaction; choose
nullable message.runId and assign after both rows exist to avoid cyclic insertion.
No duplicate activeRunId is needed: the partial unique index is authoritative.

Use existing transactional outbox with unique (eventType, aggregateId), event
`TEACHER_AI_CHAT_REQUESTED_V1`, aggregateId = run ID. Payload contains version and
runId only. Correlation/audit context is persisted and reloaded by run ID.

## Transactions and idempotency

1. Resolve actor, role, allowlist, consent, owner, archive/expiry and text bounds.
2. Lock conversation and quota buckets in deterministic order. Use current UTC
   windows; account for other application dispatches sharing the provider key.
3. Look up requester/idempotency key before quota or active-run rejection. Return
   existing message/run for an identical payload; reject changed conversation or
   text under the same key as CONFLICT. Never create a second message on retry.
4. Reserve global and Teacher daily/minute capacity and concurrency, allocate
   sequence, insert user message/run/outbox and metadata-only audit atomically.
5. Worker claims using compare-and-swap lease generation and bounded expiry.
   Reload authorization, consent, archive/expiry, feature flag, current quotas,
   model eligibility and token-bounded history ending at frozenThroughSequence.
6. Persist dispatch identity before network activity. Consume dispatch quota
   before sending. Never refund a dispatched or ambiguous attempt's daily count.
   Reserve in the current UTC window again if a queued job crossed a boundary;
   release the old unused reservation in the same transaction.
7. Completion locks the run and conversation, requires the same lease generation
   and RUNNING status, and inserts one assistant message plus terminal state,
   usage and audit. Account deactivation/consent revocation/archive/cancellation
   suppresses reply publication even if a provider returns later.

No text in queue jobs, URLs, logs, audit metadata, metric labels or browser storage.
Hash an idempotency payload fingerprint if useful; never log the original text.

## State transitions and recovery

- QUEUED -> RUNNING, CANCELLED or FAILED.
- RUNNING -> SUCCEEDED, FAILED or CANCELLED.
- Terminal runs do not transition on redelivery or late responses.
- Explicit retry creates a new run referring to the original user message and
  frozen boundary, with a fresh idempotency key; only when the failure is known
  safe, no successor messages exist and no active run exists. Successful runs
  cannot regenerate. Ambiguous calls block retry pending reconciliation.
- Archive atomically marks the conversation and cancels its active run. A late
  completion may record usage but cannot add a visible reply or unarchive.
- Expired lease with no dispatch may be reclaimed. Once DISPATCHED, a timeout,
  network loss or 5xx is ambiguous: do not invoke the provider again on queue
  redelivery. Reconcile by provider request ID if possible; otherwise require a
  metadata-only operator recovery decision. Never assume exactly-once inference.
- Outbox publication has five total attempts with bounded exponential backoff;
  exhaustion marks delivery failure and releases only unused reservations.
- 429 stops provider dispatch; show quota/unavailable state and respect provider
  reset information. No automatic provider retries in the free pilot.

## History, retention and consent

History cursors are opaque (updatedAt,id) for conversations and sequence/id for
messages. Enforce ownership before reading cursors; cap page size at 50. Read
archived history only through an explicit owner-scoped filter. Expired content is
unreadable immediately, independent of purge scheduling.

Recommended expiry is a fixed duration from conversation creation, not a sliding
extension on each message. Exact days require owner selection. Archive does not
mean erasure. Retention purge cancels pending runs, erases content and derived
titles, then removes dependent rows in FK-safe order. Keep only reviewed minimal
non-content reconciliation evidence until ambiguous calls are settled. Exact
operational evidence and backup retention durations must be agreed before rollout;
never promise instant removal from backups or downstream providers.

Before first send, show localized notice: text and a bounded recent conversation
window go to OpenRouter and the selected provider, project records are not added
automatically, AI suggestions need Teacher review, and the chosen local retention
period applies. Record notice version and acceptance. A changed provider/privacy
policy requires renewed consent. Final Uzbek/Russian/English wording is pending.

## Migration, rollout and acceptance gate

No migration until this design and the outstanding policy choices are reviewed.
Then generate an additive Prisma migration and inspect SQL for composite FKs,
partial indexes, checks and enum transitions. Never revive dropped Gemini tables.
Generate the Nest code-first domain with CLI dry-run first under ComponentsModule;
generate SDL and frontend operations together. Deploy disabled before pilot.

Required integration checks: role/owner isolation, no-credit quotas under concurrent
transactions, duplicate sends, window rollover, dispatch lease crashes, archive/
cancel/consent races, ambiguous timeout redelivery, paging, erasure and outage.
Mock provider transport; never incur paid requests in tests. Existing auth and
deterministic scoring tests must continue passing. Rollback disables new dispatch
and retains additive data until a reviewed cleanup; normal Teacher work continues.

## Official references checked 2026-11-06

- [Free-model limits](https://openrouter.ai/collections/free-models/): free variants
  currently allow 50 requests/day without purchased credits and 20/minute; failed
  requests count. Configure conservative caps and still handle provider rejection.
- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection):
  `only`, `allow_fallbacks`, `data_collection` and `max_price`.
- [ZDR](https://openrouter.ai/docs/guides/features/zdr): request ZDR follows account
  Safety Retention settings; strict ZDR-only needs account/guardrail review.
- [BullMQ idempotence](https://docs.bullmq.io/patterns/idempotent-jobs): repeated
  delivery must preserve outcome; queue deduplication is not external billing proof.

## Implementation decision — 2026-11-07

The owner explicitly approved the complete Teacher backend/worker/DB integration.
Implement the following narrow refinements to the proposed design above:

- Seven-day fixed retention is the initial configurable policy. The UI discloses
  the configured duration before consent; no real conversations exist yet.
- Consent is per conversation (noticeVersion, consentAt); archive revokes further
  dispatch for that conversation. Each new thread requires explicit consent.
- Use a global transaction advisory lock for every chat write/dispatch decision,
  a partial unique active-conversation index and a partial active-Teacher index.
  The small free pilot is deliberately serialized; no high-throughput claim.
- Reserve quota with append-only AI_MESSAGE_ACCEPTED audit events, including cancelled/failed runs.
  Count daily/minute acceptance events and AI_PROVIDER_DISPATCHED audit events
  before dispatch. Erasing content never refunds same-day quota. This conservative policy never refunds failed attempts. It
  replaces AiQuotaBucket and monetary reservation tables for the $0 pilot.
- One dispatch record per run. A known-safe explicit retry creates a new run,
  reuses its user message and consumes new quota. Ambiguous runs are not retried.
- Mark expired content inaccessible immediately. Worker purge removes content,
  derived titles and runs/calls after expiry under the lock. Immutable outbox
  rows retain only opaque run IDs; pending expired events are marked handled.
  Late completions cannot repopulate deleted records. Keep content-free audit
  events under the existing audit policy. Infrastructure backups follow existing
  backup retention; seven days describes active chat storage, not backup erasure.
- An ambiguous dispatch closes the run as FAILED/AMBIGUOUS and requires manual
  review; no redispatch. A nonzero usage report blocks subsequent sends/dispatches
  using an append-only AI_COST_POLICY_VIOLATION audit event that survives
  transcript erasure. Recovery requires a separate reviewed change; never delete
  audit records to bypass the stop. Provider history is not automatically
  fetched, so recovery cannot trigger another completion.
- Safe SQL checks bound sequence/content; composite foreign keys enforce owner
  and conversation relationships. API titles/history use createdAt/id cursors
  to avoid reorder/skip during renames. UUID and cursor inputs are validated.

Migration is additive; deploy disabled first. Local integration tests use a
temporary database and fictional users; no production mutation or paid request.

Final model refinements: nextSequence/frozenThroughSequence are positive integers;
AiConversation has no extra version or active-run pointer. AiChatRun uses a random
leaseToken and leaseExpiresAt, without leaseGeneration or monetary reservation
columns. AiProviderCall has one unique runId; explicit retries use new runs. The
run trigger and assistant response both have composite conversation foreign keys.
History orders by createdAt/id, not mutable updatedAt. SQL checks bound content,
sequence, retention timestamps and nonnegative usage. Positive numeric costs
smaller than the stored decimal precision are rounded up conservatively so they
still activate the stop. Expired undispatched leases become retryable failures;
dispatched uncertainty is never automatically replayed.

The integration fixture may truncate audit solely in its asserted randomly named
disposable database between tests; runtime code never truncates/deletes audit.
