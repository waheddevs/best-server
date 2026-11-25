# BEST AI integration plan — Teacher chat through OpenRouter

Status: revised proposal reflecting the owner's selected first feature: a
Teacher-only AI chat in a global right-side panel and a dedicated sidebar page.
OpenRouter is the preferred gateway. Student and Admin follow later. This
supersedes the earlier recommendation to start with Writing evaluation.

This document does not implement a provider call, runtime feature or migration.
Model, budget, retention and persisted data design remain to be finalized.

## 1. First-release scope

- One AI assistant across authenticated Teacher routes.
- Right-side panel for quick conversation without leaving the current page.
- An **AI Assistant** sidebar entry for a wider workspace.
- Both views share conversation history, active request and composer draft.
- Teacher light/dark themes and Uzbek/Russian/English localization.
- No Student, Admin, public or anonymous access in this phase.

Proposed initial behavior: text assistance for English explanations, lesson
preparation, exercise ideas and teaching-material drafts. These are suggestions,
not automatic edits to tests, grades, accounts, groups or financial records.
Human-to-human messaging is not part of this AI chat feature.

## 2. Repository findings

| Existing area  | Finding and decision                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Teacher layout | `src/app/[locale]/(teacher)/layout.tsx` checks Teacher access and wraps routes in `TeacherWorkspaceShell`; mount the panel once inside this shell.     |
| Shell          | `TeacherWorkspaceShell.tsx` already composes sidebar, mobile Drawer, topbar and content; add one shared chat state owner here.                         |
| Navigation     | `src/config/TeacherNavigation.ts` drives sidebar and active titles; add `aiAssistant`, its icon, translated labels and route.                          |
| Styling        | Teacher shell has shared light/dark tokens and a two-column grid; extend it for a right panel without breaking tables/editors.                         |
| Client         | Apollo and GraphQL Codegen already exist; use generated operations rather than handwritten response types.                                             |
| API            | Nest code-first GraphQL, DB-resolved roles and ComponentsModule support a focused `ai-assistant` domain.                                               |
| Jobs           | PostgreSQL outbox and Redis/BullMQ exist; use an isolated AI queue and worker, keeping scoring capacity independent.                                   |
| Persistence    | There is no active conversation/message model. Old Gemini generation tables were dropped by an applied migration; do not revive historical migrations. |

Preserve existing backend integration-test/schema changes and frontend untracked
logo assets. The two repositories remain separate.

## 3. Panel and expanded workspace

### Right-side panel

Add a consistent accessible launcher to `TeacherTopbar`. The panel starts closed.
Target desktop width is approximately 380–440 px. Reserve a third column on wide
screens; use an overlay when shrinking the page would make its tables unusable.

The panel contains a header with New chat, Expand and Close, scrolling messages,
a persistent composer, and genuine queued/generating/error states. Enter sends,
Shift+Enter inserts a newline, and IME composition must not submit accidentally.
Closing it or navigating Teacher routes preserves the draft and accepted request.

On mobile use a full-height drawer/dialog with focus trapping, focus return,
Escape/back handling, safe areas and keyboard-safe composer placement. Coordinate
it with the existing navigation drawer and other dialogs.

### Expanded workspace

Routes:

- `/[locale]/teacher/ai-assistant`
- `/[locale]/teacher/ai-assistant/[conversationId]`

The sidebar opens this workspace. Expanding the panel opens the same conversation
with its draft and request state intact. The full view includes a paginated
conversation-history column, wide message area and composer. Hide the compact
panel on these routes so there are never two active composers for one thread.

Include New chat, deterministic initial titles, rename, archive and history
pagination. Derive titles from the first message instead of an extra paid call.
Permanent deletion follows the reviewed retention/erasure design.

Use `TeacherAiProvider` for active conversation, per-thread in-memory drafts and
visibility, with Apollo owning server data. Reuse `TeacherAiConversation` for
both views; only one owner performs send/retry effects. On full-page routes the
URL selects the conversation. Refresh restores persisted messages and run state;
unsent drafts need only survive navigation/view switching in the MVP, not refresh.
Do not silently place sensitive chat text in localStorage. Clear state/cache on
logout or account change.

Autoscroll only near the bottom; otherwise offer a new-message indicator. Preserve
the viewport when loading older messages. Required states include empty, loading,
submitting, queued, generating, completed, failed, quota reached, cancelled,
unavailable, expired session and inaccessible conversation. Render safe Markdown
without raw HTML, automatic external resource loading or executable content.

## 4. Context and authorization boundary

The MVP sends the Teacher's messages and bounded conversation history. Opening
the panel does not automatically send the page, roster or database contents.
State clearly that private project data is not automatically available.

Later, an explicit Add context action may attach selected Teacher-owned material.
Each resource type requires a preview, server ownership check, size limit and
privacy policy. Recheck access at dispatch. Never fetch arbitrary client URLs or
accept storage keys as authority. Defer attachments, audio, web search, tool
execution, database writes, grading and retrieval to their own slices.

Every operation requires DB-resolved TEACHER role and conversation ownership;
return NOT_FOUND on ownership mismatch. Student/Admin calls fail even if made
manually. System instructions are server-owned; client messages cannot acquire
system/tool roles. Teacher content remains untrusted model input.

## 5. Durable backend design

```text
Teacher panel / expanded page
  -> authenticated GraphQL
  -> AI Assistant service: role, ownership, limits, idempotency
  -> PostgreSQL: user message + chat run + outbox event
  -> BullMQ ai-chat -> assistant-worker -> OpenRouter
  -> persisted assistant response + usage + terminal run state
  -> authenticated GraphQL polling -> shared UI
```

Return IDs promptly instead of keeping the browser request open for inference.
Initially show honest queued/generating states and deliver a complete response.
Do not simulate streaming. Poll only active runs with bounded frequency/backoff;
closing the UI does not cancel accepted work. Real incremental streaming is a
later transport decision; the MVP needs neither subscriptions nor a second
public product endpoint.

Prepare `packages/database/docs/TEACHER_AI_CHAT_DATA_DESIGN.md` before migrations:

| Proposed record  | Responsibility                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiConversation` | Teacher owner, title, archive state, timestamps, sequence/version and active-run reference.                                                                           |
| `AiMessage`      | Conversation, unique ordering, user/assistant kind, content, run relation and timestamps.                                                                             |
| `AiChatRun`      | Trigger message, idempotency key, requester, frozen input-message boundary, prompt/history policy, model/provider, lease, state, safe error and reserved/actual cost. |
| `AiProviderCall` | Individual dispatch identity, provider request ID where available, attempt, usage, cost and ambiguous completion state.                                               |

These are proposed records, not approved Prisma models. The data design must
specify foreign keys, unique constraints, indexes, transitions, retention/erasure,
external-processing notice/consent evidence, and durable budget reservation rules.
Keep credentials and raw provider payloads out of chat records and logs.

Run states: QUEUED, RUNNING, SUCCEEDED, FAILED, CANCELLED. Enforce one active run
per conversation transactionally to avoid incompatible history from multiple
tabs. Duplicate sends with the same idempotency key return the same message/run.
A failed-run retry preserves the original user message; successful network retries
do not regenerate answers. Branching/regeneration of completed history is deferred.

Outbox uniqueness is `(eventType, aggregateId)`; use the chat-run ID as aggregate.
Queue payloads contain IDs, not conversation text. Atomically claim jobs with a
recoverable lease and recheck account status, ownership, policy and quota before
dispatch. Cancellation/archive racing with completion must not resurrect a reply.

Use bounded retry/backoff for classified recoverable failures. The scoring relay
caps retry delay but not total publishing attempts; do not copy that behavior
unmodified. Provider completion after a timeout is ambiguous: reconcile its
request ID where possible rather than blindly paying again. Queue deduplication
cannot guarantee exactly-once external billing. Provide an operational recovery
path. [BullMQ idempotency](https://docs.bullmq.io/patterns/idempotent-jobs).

## 6. OpenRouter policy and costs

Implement a typed `OpenRouterChatGateway` in the assistant worker using native
fetch initially. Use non-streamed `/api/v1/chat/completions`, server-controlled
instructions and bounded messages. Ordinary chat returns text; grading-style
JSON output is not required. Keys never reach the browser or Next.js client.

Pin an evaluated model and allowed endpoint; disable automatic model/provider
fallback for the pilot. Clients cannot select arbitrary models. Model identity
does not guarantee deterministic answers. Record requested and reported identity
where available. [Routing](https://openrouter.ai/docs/guides/routing/provider-selection).

Apply `data_collection: "deny"` and the reviewed ZDR policy. If Safety Retention
is unacceptable, choose ZDR only in account settings: `zdr: true` alone does not
promise unconditional zero retention. Keep optional prompt/content-use logging
off, review downstream policies, and fail closed when no eligible endpoint is
available. [ZDR](https://openrouter.ai/docs/guides/features/zdr),
[data collection](https://openrouter.ai/docs/guides/privacy/data-collection).

Bound context by tokens as well as message/input lengths. Persist history under
the retention policy, but send only a defined recent window; do not promise
unlimited memory. Summarization is a later versioned feature with separate cost.

Enforce per-Teacher rate/concurrency limits and overall daily budget. Reserve
maximum estimated cost atomically, reconcile actual usage and retain ambiguous
reservations until resolved. Use precise monetary storage and a separate capped
runtime key, not a management key. [Key limits](https://openrouter.ai/docs/api/api-reference/api-keys/create-keys).

Suggested config: `TEACHER_AI_CHAT_ENABLED`, `OPENROUTER_API_KEY`, `AI_CHAT_MODEL`,
`AI_CHAT_PROVIDER_ENDPOINT`, `AI_CHAT_MAX_INPUT_CHARACTERS`,
`AI_CHAT_MAX_CONTEXT_TOKENS`, `AI_CHAT_MAX_OUTPUT_TOKENS`, `AI_CHAT_TIMEOUT_MS`,
`AI_CHAT_CONCURRENCY`, `AI_CHAT_DAILY_BUDGET_USD`. Disabled AI must not require a
provider credential for the existing API to start.

Benchmark eligible models on fictional Teacher tasks: English explanations,
lesson outlines, Uzbek/Russian interaction, malicious instructions, refusal/error
behavior, latency, length and measured cost. Model choice follows the benchmark
and privacy requirements, not an unverified cheapest-model assumption.

## 7. Contracts and file ownership

Proposed Teacher-only operations:

- `createTeacherAiConversation`, `teacherAiConversations(first, after)`.
- `teacherAiConversation(id, first, before)` for ordered message pagination.
- `sendTeacherAiMessage(conversationId, text, idempotencyKey)`.
- `teacherAiChatRun(id)` for status and completed response.
- `retryTeacherAiChatRun`, `cancelTeacherAiChatRun` with idempotent behavior.
- `renameTeacherAiConversation`, `archiveTeacherAiConversation`.

| Location                                                                  | Planned work                                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `best-react/src/features/teacher/layout/TeacherWorkspaceShell.tsx`        | Shared state owner, panel host and full-page mutual exclusion.                                                |
| `best-react/src/features/teacher/layout/TeacherTopbar.tsx`                | Accessible launcher.                                                                                          |
| `best-react/src/config/TeacherNavigation.ts`, Teacher types/icons/copy    | Sidebar destination, title and mobile drawer integration.                                                     |
| `best-react/src/features/teacher/ai/`                                     | Provider, panel, shared conversation, composer and history.                                                   |
| `best-react/src/hooks/teacher/ai/`                                        | Send, active-run polling and focused view behavior.                                                           |
| `best-react/src/app/[locale]/(teacher)/teacher/ai-assistant/`             | Index/conversation routes under the existing Teacher layout.                                                  |
| `best-react/src/dictionaries/teacher/TeacherAiAssistant.ts`, Teacher SCSS | Localized states, responsive design and theme reuse.                                                          |
| `best-react/src/graphql/TeacherAiAssistant.graphql`, `src/gql/`           | Operations and regenerated client.                                                                            |
| `best-server/apps/api/src/components/ai-assistant/`                       | Thin resolver, authorization/business service, focused repository.                                            |
| `best-server/apps/api/src/schemas/ai-assistant/`                          | Code-first contracts.                                                                                         |
| `best-server/apps/assistant-worker/`                                      | Standalone Nest relay/processor/OpenRouter gateway and recovery.                                              |
| `best-server/packages/ai-chat/`                                           | Only shared versioned job contracts and pure validation/policy types.                                         |
| Database/config/GraphQL/deployment packages                               | Reviewed migration, typed limits/secrets, regenerated schema and independent worker artifact/resource limits. |

Generate the approved API domain using the repository Nest CLI, with dry-run
first and graphql-code-first/non-flat settings. Register it in ComponentsModule,
not directly in AppModule. Regenerate backend SDL and frontend Codegen together.

## 8. Delivery and verification

1. Record the narrow Teacher AI chat exception in both AGENTS.md files while
   preserving cancellation history. Finalize data design, retention/erasure,
   processing notice, model policy and budget before implementation.
2. Deliver durable backend contracts, reviewed migration, OpenRouter gateway,
   isolated worker/outbox, quotas, ownership, audit and idempotency.
3. Connect the shared right panel with real messages and honest request states.
4. Add expanded page, sidebar/history, view continuity, mobile and localization.
5. Pilot with an explicit Teacher allowlist; evaluate quality, latency, costs
   and provider failures, then widen Teacher availability.
6. Design Student and Admin separately later. Reuse transport/persistence where
   appropriate but keep role-specific context, policies and authorization.

Acceptance includes panel/page continuity, no duplicate sends or lost in-session
drafts, refresh during a request, cancellation and archive races, multiple tabs,
logout/account switching, focus/keyboard/mobile behavior, all themes/locales,
owner/role isolation, safe Markdown, input limits, prompt injection, quotas,
worker recovery, queue redelivery, provider 429/5xx/timeout and ambiguous billing.

Run PostgreSQL/Redis integration, GraphQL contract and fictional Teacher E2E
checks, plus formatting, lint, strict typecheck and affected app builds. Preserve
existing auth and deterministic scoring behavior.

Deploy additive schema and compatible services with AI disabled, then enable the
pilot after smoke checks. Rollback blocks new dispatch, safely handles pending
runs and retains history/additive schema; normal Teacher work stays available.

## 9. Deferred scope and open decisions

Writing/Speaking evaluation, content publication, retrieval, files/audio, web
search, long-term memory and token streaming are separate extensions. Earlier
evaluation findings remain relevant later: manual attempts currently stay
SUBMITTED; Speaking needs review conflict protection; Writing Task 1 needs full
stimulus context. They are not prerequisites for Teacher text chat.

Still to finalize: model/provider endpoint, pilot Teacher list and budget,
conversation retention/erasure and processing notice. General teaching assistance
is the proposed first behavior; automatic database context is not implied by a
global panel. Student/Admin activation is explicitly deferred.
