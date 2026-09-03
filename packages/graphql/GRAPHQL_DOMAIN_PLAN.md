# BEST GraphQL domain plan

Status: approved on 2026-09-01. The first backend Student test contract and
step 7D Library/media contract are implemented; later operation groups remain
separately gated. Telegram import was removed from the plan on 2026-09-03.

## Purpose

This plan defines the public product API boundary between `best-server` and the
separate `best-react` repository. It fixes ownership, naming, authorization,
pagination, errors, generated artifacts, and the order in which operations may
be implemented.

The plan follows the approved database and identity decisions. A Prisma model
does not automatically become a GraphQL type, and database fields are exposed
only when a product use case and authorization rule require them.

## Transport and ownership

- The product API has one endpoint: `/graphql`. Production product operations
  use `POST`; development tooling may use `GET` on the same path.
- NestJS uses Apollo and code-first schema classes. Handwritten SDL is not a
  second source of truth.
- Operational HTTP endpoints and `POST /internal/auth/exchange` remain outside
  the product schema.
- `apps/api/src/schemas/<domain>` owns approved GraphQL object, input, enum,
  connection, and payload classes.
- `apps/api/src/components/<domain>` owns thin resolvers and domain services.
- Persistence remains behind focused domain providers using `@best/database`.
- `packages/graphql/schema.graphql` will be the sorted generated contract
  artifact. It contains no business logic.
- `best-react` will author named operations and generate operation-specific
  TypeScript types with GraphQL Code Generator's `client` preset during the
  later frontend integration. It must not import API resolver classes or
  Prisma types.

The GraphQL runtime foundation will be isolated under `apps/api/src/graphql`.
Its module will configure Apollo, the `/graphql` path, the generated schema
artifact, request context, and production exposure policy. `AppModule` will
import that infrastructure module; product domains remain composed only by
`ComponentsModule`.

## Schema conventions

- Operations use explicit domain names, not generic `get`, `list`, `create`, or
  `update` names.
- GraphQL IDs are opaque `ID` values. Clients must not infer type or ownership
  from their content.
- Timestamps use an ISO-8601 `DateTime` scalar and are always UTC.
- Uzbek, Russian, and English are represented by the database-owned `Language`
  enum. The service validates that a requested translation exists.
- UZS values are returned as decimal strings inside a money object so they are
  never truncated by GraphQL's 32-bit `Int` or JavaScript number precision.
- Output fields are non-null unless absence is a valid domain state. Inputs do
  not use `null` and omission interchangeably.
- Mutations accept one named input and return a focused payload containing the
  changed domain object. They never return a placeholder boolean.
- Database column names, Prisma relation names, storage bucket names, object
  keys, provider account data, and internal audit payloads are not public API
  names.

## Request context and authorization

Every request context contains the HTTP request, server-generated request ID,
and request-scoped DataLoaders. `AuthGuard` resolves the bearer token and loads
the active database user on every authenticated request. `RolesGuard` may
narrow the allowed role, but ownership and membership checks remain in the
domain service.

Authorization is enforced at the top-level query or mutation and again in the
domain service. Field resolvers must not be the only security boundary.

| Domain             | Student                                         | Teacher                                                             | Admin                                                  |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| Viewer/user        | Own safe profile                                | Own profile and students in owned groups                            | Operational user list and status                       |
| Groups/memberships | Current and historical own membership           | Owned groups and their members                                      | All operational groups and memberships                 |
| Tests              | Published tests for active own group            | Draft/publish/archive tests in owned groups                         | Aggregate oversight only                               |
| Attempts/results   | Own attempts and summary; never correct answers | All attempts, selected answers, and correct answers in owned groups | Scores and aggregates, but no selected/correct answers |
| Library            | Active items visible to own group               | Manage own items and group visibility                               | Operational metadata only                              |
| Finance            | Own balance and payment history                 | Students in owned groups                                            | All students                                           |
| Audit              | No access                                       | No general audit feed                                               | Redacted operational audit feed                        |

Inactive users are rejected before domain authorization. A client-supplied
role, user ID, group ID, Student ID, or Teacher ID is never proof of access.

## Domain boundary map

The existing Nest modules remain the composition boundaries. Only domains with
an approved operation expose schema fields.

| GraphQL domain               | Owning component        | Initial responsibility                                 |
| ---------------------------- | ----------------------- | ------------------------------------------------------ |
| Viewer and users             | `auth`, `users`         | Current user and role-safe profile views               |
| Groups and memberships       | `groups`, `memberships` | Group ownership and active/historical membership       |
| Test catalogue and authoring | `tests`                 | Published Student metadata and later Teacher authoring |
| Attempt session              | `attempts`              | Start/resume, autosave, submit, and status             |
| Results/progress             | `results`               | Student history and later authorized reports           |
| Library                      | `library`               | Authorized catalogue; object URLs remain storage-owned |
| Finance                      | `finance`               | UZS balance, ledger views, and authorized corrections  |
| Audit                        | `audit`                 | Redacted operational history                           |

`courses`, `events`, `lessons`, `materials`, `assignments`, and `notifications`
have no approved database-backed contract in the first vertical slice. Their
placeholder modules stay empty and do not appear in the generated schema.

## First vertical Student test contract

Milestone 6 may implement only this initial product slice after separate
confirmation:

### Queries

- `viewer`: returns the authenticated user's safe identity and authoritative
  role.
- `studentAvailableTests(first, after)`: returns published and currently
  available tests for the Student's active group.
- `studentTest(testId, language)`: returns authorized test metadata and the
  available translation, but not correct answers.
- `studentAttempt(attemptId, language)`: returns only the authenticated
  Student's attempt, visible questions/options, saved selections, server time,
  deadline, and status.
- `studentResults(first, after)`: returns the authenticated Student's scored
  attempt summaries and highest result per test.

### Mutations

- `startTestAttempt(input)`: transactionally starts or resumes the one active
  attempt allowed by availability, membership, duration, attempt limit, and
  grants.
- `saveAttemptAnswer(input)`: idempotently upserts one selection only while the
  authenticated Student's attempt is active and unexpired.
- `submitTestAttempt(input)`: atomically locks the attempt, records the final
  submission reason, and schedules deterministic scoring exactly once.

Starting an attempt is the boundary that delivers question content. Student
types never include `isCorrect`, a correct option ID, scoring internals, or a
Teacher-only review field. Submitting returns the authoritative attempt status;
the first release polls `studentAttempt` or `studentResults` until scoring is
complete. Subscriptions remain deferred until a Redis-backed multi-instance
transport is designed and tested.

## Step 7C private media contract

The first media slice exposes three explicit mutations to authenticated
Teachers and Admins:

- `createMediaUploadIntent(input)` returns an exact-size, conditional private
  `PUT` URL and its required headers.
- `confirmMediaUpload(input)` verifies the creator-owned object and moves it to
  `READY` or `REJECTED`.
- `createMediaDownloadIntent(input)` returns a short-lived URL only for a ready
  object owned by the caller.

The client never selects a storage key, media type, owner, status, visibility,
or checksum. The service derives the media type from an allowlisted MIME and
matching filename extension. Confirmation verifies object metadata, ETag-bound
bytes, magic-byte signature, and SHA-256 before PostgreSQL records readiness.
Library/group authorization and Student media delivery remain deferred to the
Library slice.

## Later operation groups

These names reserve direction, not permission to implement them in milestone
6:

- Teacher test authoring: categories, drafts, translations, questions,
  publishing, archiving, restoration, and per-Student attempt grants.
- Group management: owned groups, membership changes, archive, and restore.
- Library: categories, item metadata, translations, group visibility, media
  attachment/publication confirmation, archive, and restore.
- Results/progress: Teacher group reports and Admin aggregate academic views.
- Finance: tuition configuration, charges, payments, allocation, reversal, and
  adjustment operations with mandatory audit reasons.
- Audit: filtered, cursor-paginated Admin operations with sensitive-value
  redaction.

Each later group requires its milestone's explicit field list, authorization
tests, and migration review before resolver implementation.

## Pagination and loading

- Every growing list uses Relay-style connections with `edges`, opaque
  `cursor`, and `pageInfo`.
- Forward pagination is the first supported direction: `first` defaults to 20
  and cannot exceed 100; `after` is optional.
- Cursors encode a stable ordered tuple such as `(createdAt, id)` and are
  treated as opaque by clients.
- Ordering always includes a unique tie-breaker so pages do not duplicate or
  skip equal timestamps.
- Request-scoped DataLoaders batch relation reads. Loaders never cache across
  users or requests and their batch key includes authorization scope when
  necessary.
- Unbounded nested collections are not exposed. A relationship that can grow
  receives its own connection or top-level query.

## Errors and input validation

- Expected failures use the existing `ApplicationError` and stable `ErrorCode`
  contract.
- GraphQL errors expose only `extensions.code`, `extensions.status`, and
  `extensions.requestId` plus a safe message.
- Prisma codes, SQL, stack traces, tokens, internal IDs, and sensitive payloads
  remain masked.
- Inputs are allow-listed, length-bounded, and validated before a domain
  service runs. Unknown fields are rejected by GraphQL validation.
- Authorization failures do not reveal whether an inaccessible object exists.
- Mutation conflicts use stable codes for expired attempts, invalid state,
  attempt-limit exhaustion, unavailable tests, and stale writes rather than
  parsing human messages in the frontend.

## Contract generation and compatibility

1. The API builds the code-first schema with deterministic lexical ordering.
2. The generated `packages/graphql/schema.graphql` artifact is reviewed and
   committed; generated Prisma Client remains uncommitted.
3. CI regenerates the schema and fails on an uncommitted difference.
4. CI compares the schema with the accepted contract and rejects accidental
   breaking changes.
5. `best-react` consumes the accepted artifact and generates types only for its
   named operations.
6. Deprecated fields receive a reason and migration window before removal.

The frontend transport wiring and the mechanism used to deliver the contract
artifact across repositories are intentionally deferred until the repositories
are connected. A live production endpoint is not the frontend's only codegen
source.

## Production controls

- GraphiQL and introspection are enabled only for approved development/test
  environments and disabled by default in production.
- Production requests are authenticated or explicitly marked public; no
  resolver is accidentally public by omission.
- Request body size, operation depth, aliases, root fields, complexity,
  execution time, and per-user/IP rate are bounded before production.
- Only named operations are accepted in production. Persisted-operation
  safelisting remains a hardening option once frontend operations stabilize.
- CORS accepts only approved web origins and bearer headers.
- Logs contain operation name, duration, result class, request ID, and
  authenticated user ID when available; they never contain variables, tokens,
  answers, correct answers, or complete response bodies.

## Verification gates

Before the first operation is accepted:

- generated schema snapshot and breaking-change checks pass;
- GraphQL context propagates the request ID and authenticated member;
- anonymous, Student, Teacher, Admin, inactive-user, ownership, and membership
  tests cover every operation;
- validation and safe error-extension contract tests pass;
- list operations prove bounded pagination and avoid N+1 reads;
- Student schema and responses prove that correct answers and provider data are
  absent;
- end-to-end start, save, resume, submit, repeated-submit, expiry, and scoring
  journeys pass against PostgreSQL and Redis;
- formatting, lint, strict typecheck, unit tests, integration tests, schema
  checks, and production builds pass from the repository root.

## Completed database prerequisites for milestone 6

The additive `20260901020000_scoring_outbox` migration is reviewed, applied to
local PostgreSQL, and covered by integration tests. Submission and its versioned
`ATTEMPT_SUBMITTED` event commit atomically; the relay publishes with the
outbox UUID as the BullMQ job ID and the consumer scores idempotently.

The deployed initial migration already enforces one active attempt per
Student/test version and rejects an answer option from another question or test
version. Milestone 6 integration tests must exercise those constraints in
addition to the service checks; they must not reimplement or weaken them.

The migration does not alter existing attempt identities or published content.

## Completed step 7D Library contract

Teacher-only operations manage categories and fully translated Library items:
`teacherLibraryCategories`, `teacherLibraryItems`, `createLibraryCategory`,
`updateLibraryCategory`, `setLibraryCategoryArchived`, `createLibraryItem`,
`updateLibraryItem`, and `setLibraryItemArchived`. Item writes replace their
ordered attachment, translation, and selected-group sets atomically.

Student-only `studentLibraryItems` and `studentLibraryItem` return localized
active content only when current group membership satisfies `ALL_GROUPS` or
`SELECTED_GROUPS`. `createStudentLibraryDownloadIntent` rechecks item,
membership, attachment, and `READY + CLEAN` media state before issuing a
short-lived private URL. Inaccessible objects use the same not-found response
and do not disclose existence.

All Library write inputs are bounded and ownership-checked. Categories with
active items cannot be archived, archived items are hidden immediately, and a
category must be active before an item can be restored. Permanent deletion,
frontend operations/codegen, and Admin content management are outside 7D.
Telegram import is retired rather than deferred.

## Step 8A Student Progress contract

`studentProgress` is a Student-only derived summary for the authenticated
Student's current active group. It uses active tests with at least one published
version whose availability has started. A submitted or scored test counts as
completed; an in-progress attempt does not. A submitted test awaiting the
worker's result is reported separately.

Score statistics use each test's highest scored percentage rather than
averaging every retry. Pass/fail follows the stored verdict attached to that
best result. Completion and averages are rounded to two decimal places. If the
Student has no active membership or no assigned test, the query returns a typed
zero summary rather than failing.

Attempts remain bound to their original `groupMembershipId`: personal result
history can include previous groups, but old-group attempts never contribute to
current-group progress. The summary is derived from authoritative rows and does
not introduce a cache or duplicate summary table.

## Step 8B Teacher Results contract

All 8B operations require the authenticated `TEACHER` role and resolve group
ownership from PostgreSQL. An unknown group and another Teacher's group produce
the same `NOT_FOUND` response, so object existence is not disclosed.

- `teacherGroupProgress(groupId)` returns active-Student count, assigned-test
  count, completed/remaining/awaiting/scored/pass/fail assignment totals, and
  average/highest/lowest best scores.
- `teacherGroupStudents(groupId, first, after)` returns paginated current
  members with the same per-Student progress calculation used by the Student
  dashboard.
- `teacherStudentTests(groupId, studentId, language, first, after)` lists every
  currently assigned test as `NOT_STARTED`, `IN_PROGRESS`, `AWAITING_SCORE`,
  `PASSED`, or `FAILED`. A future test is not assigned until availability
  starts.
- `teacherStudentAttempts(groupId, studentId, language, first, after)` returns
  every attempt attached to that group's membership history, including former
  memberships.
- `teacherAttemptReview(attemptId, language)` returns the selected and correct
  option for every question in one owned-group attempt.

Aggregates use the best scored attempt per Student/test assignment, and a
pending submitted retry remains visible as `AWAITING_SCORE`. Growing lists use
opaque cursor pagination. Queries are read-only and add no duplicate summary
table, cache, or migration. Students cannot call Teacher operations. Admin
aggregate access belongs to 8C and does not include selected or correct
answers.

## Step 8C Admin academic monitoring contract

All 8C operations require the authenticated `ADMIN` role and are read-only.
They support operational oversight across Teachers and groups without exposing
selected options, correct options, question review, provider identities, or
other Teacher-only detail.

- `adminAcademicOverview` returns active Teacher, Student, group, and assigned
  test counts plus global current-assignment completion and best-score
  statistics. PostgreSQL performs the aggregate so the API does not load every
  attempt into memory.
- `adminGroupProgresses(first, after)` returns cursor-paginated group summaries
  with owner identity, lifecycle status, active memberships, current assigned
  tests, completion, and best-score aggregates.
- `adminStudents(first, after)` returns cursor-paginated Student identities,
  lifecycle status, optional current group, scored-attempt count, and
  historical best-per-test score aggregates.
- `adminStudentResults(studentId, language, first, after)` returns one
  Student's cursor-paginated scored attempt history with its original group and
  localized test title. An unknown or non-Student identity returns `NOT_FOUND`.

Global and group current progress uses active groups/tests, published versions
whose availability has started, and active memberships. Student score history
remains historical across previous memberships. Students and Teachers cannot
call Admin operations. No 8C type contains answer-option or correct-answer
fields.

## Primary implementation references

- [NestJS GraphQL code-first setup](https://docs.nestjs.com/v11/graphql/quick-start)
- [NestJS GraphQL execution context and guards](https://docs.nestjs.com/v11/graphql/other-features)
- [GraphQL Code Generator client preset](https://the-guild.dev/graphql/codegen/plugins/presets/preset-client)
- [Apollo Server production hardening](https://www.apollographql.com/docs/apollo-server/security/hardening-for-production)
