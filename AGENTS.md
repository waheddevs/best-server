# BEST Server — Backend Instructions

## Approved Admin operations expansion — 2026-10-11

The owner approved Admin Groups and Schedule management, ledger-backed Payments,
Salary statement creation/editing/finalization, and Settings. Salary statements
are administrative calculations only; payroll execution remains excluded.
New Admin contracts live in the existing groups, lessons, finance and users modules.
The additive salary design is recorded in packages/database/docs/ADMIN_SALARY_DATA_DESIGN.md.

## Current milestone

The user has approved connected Teacher group creation. An authenticated
Teacher may create a group they own with a required IELTS, CEFR, or General
English category, name, room, ISO lesson days, daily time range, and a monthly
tuition rate in whole UZS. Persist rates in the existing `GroupTuitionRate`
table, not a duplicate group column. Existing active local groups received an
idempotent 300,000 UZS backfill; deleted groups were excluded. The roster's
overdue balance and current-month paid amount remain derived from charge and
allocation records. A rate alone never creates a debt or marks payment. Preserve
the existing database-resolved Teacher role guard, ownership scoping, audit
transaction, GraphQL contract generation, and PostgreSQL integration test.
Existing groups without a verified category remain uncategorized until edited.
This authorization is limited to the group domain and does not grant unrelated
Teacher writes.
The approved Add student exception lets a verified Teacher create a Student
account and enroll it in their own active group atomically. The form collects
first name, last name, phone, email, and password. Hash the password; validate
the input, unique email, ownership, and 15-member cap; audit the transaction.
This is not permission to provision Teacher accounts or use unrelated Admin APIs.

The Transfer Requests product feature was removed on 2026-10-04. Do not expose
Teacher/Admin transfer navigation, routes, GraphQL operations, review actions,
or operational queue metrics. Preserve the historical Prisma model and applied
migration until a separately reviewed data-retention migration authorizes their
removal.

The Admin Attendance, Tests, Results, Locations, Library, Imports, Reports, and
Audit product surfaces were removed on 2026-10-11. Do not expose their Admin
routes or GraphQL read/write contracts. Shared Student and Teacher learning and
Library flows, schedule room fields, media processing, and internal append-only
audit writes remain active. Historical Admin plans for these eight surfaces are
superseded by this decision.

The Admin Messages surface is approved as a read projection of the existing
public Contact message flow. Reuse `ContactRequest` and the protected Admin
intake query; expose its subject and message without adding a duplicate model or
migration. Public submission remains consent-gated, and Admin reads remain
role-protected.

Each group has a fixed maximum of 15 active learners. Teacher roster additions
must reject a full group inside a transaction; all membership writers must
enforce the same cap under concurrent requests.
Seed fictional Teacher groups through the authenticated create-group GraphQL
mutation, without adding learners or altering existing groups.
An authenticated Teacher may soft-delete an owned group through GraphQL. The
database row remains with `ContentStatus.DELETED` and a `GROUP_DELETED` audit
event; Teacher lists and detail reads hide it. Reject deletion while active
memberships exist, and never turn a deleted group active via the archive API.
The additive enum migration and rollback decision are documented in
`packages/database/docs/TEACHER_GROUP_SOFT_DELETE_DATA_DESIGN.md`.

The public BEST LC website is now an approved active backend milestone. The
sibling `best-react` application reads localized public courses, events and
event details, About FAQ, exam offerings/MOCK sessions, and result-video
metadata through this repository's code-first GraphQL contract. PostgreSQL is
the source of truth; frontend runtime fixture arrays must not be recreated.
Course registration, event registration, exam registration, and Contact
messages are real anonymous intake mutations with explicit consent, input
validation, duplicate/capacity rules where relevant, and persisted receipt ids.
Each contract change must regenerate `packages/graphql/schema.graphql`, refresh
frontend GraphQL Code Generator output, and include an integration test that
uses fictional/reserved data and asserts database persistence. Data ownership,
localization, migration, seed, and rollback decisions are documented in
`packages/database/docs/PUBLIC_WEBSITE_DATA_DESIGN.md`.

The user has approved active Student Dashboard and operational Admin Dashboard
backend integration with the sibling `best-react` frontend. The architecture,
typed local infrastructure, reviewed PostgreSQL/Prisma domain schema, backend
identity contract, GraphQL domain plan, and first backend Student test slice are
complete. Step 7A through 7D are approved:
provider-neutral S3 object storage, a maintained local provider, the reviewed
media lifecycle, private media operations, malware scanning, and the first
Teacher/Student Library contract. SeaweedFS 4.45 is the
pinned Apache-2.0 local-development provider; application code uses only the
standard S3 contract through `@best/storage`. The additive lifecycle migration
is applied and enforces pending, verifying, ready, and rejected states. Use
stable Prisma migrations; do not adopt a release candidate migration format.

The approved 7D boundary adds ClamAV verification, Teacher-owned category and
Library item management, group-scoped Student reads, and authorized signed
downloads. The revised vocabulary pilot is approved for local Telegram HTML
exports, PDF text extraction, private SeaweedFS storage, PostgreSQL review
drafts, and idempotent source identity. Do not implement TDLib, queues,
credentials, bulk synchronization, automatic rights approval, or automatic
publication yet. Permanent media deletion and subscriptions remain outside the
current scope. Student/Admin frontend integration, protected role routes, and
the contracts required by sections 20B-20D of the frontend `AGENTS.md` are now
active scope.
The former Auth.js social-provider exchange is superseded. Authentication now
uses Admin-provisioned credentials followed by a single-use email code.

Step 8 is complete. It includes profiles/Admin users, groups/memberships/
transfers, Teacher test authoring, lessons/attendance, materials/assignments,
public courses/events/intake, dashboard/tasks/notifications, and operational
Admin Library/media/audit views in addition to progress/results. Ownership
mismatches return `NOT_FOUND`; correct answers remain unavailable to Students
and Admins. Extend these existing domains instead of recreating them. Production
hardening required by the active Student/Admin slices is in scope; unrelated
platform-wide Step 9 expansion still requires separate review.

The project owner cancelled provider-backed AI generation on 2026-09-28. Keep
test authoring, import, validation, publication, delivery, scoring, and review
fully deterministic. Do not add an AI provider SDK, credential, generation
operation, assistant, evaluation, or background AI worker without a new
explicit scope change and reviewed data design.

Do not add product models or migrations until their data-design decisions have
been documented and approved. Do not replace the selected SeaweedFS local
provider, add an archived MinIO Community image, or accept a new provider
license on the user's behalf without a new review.

Do not extend the vocabulary pilot, implement subscriptions, or reintroduce
social-provider callbacks or public account creation. Student/Admin education and
operations APIs are approved only within the route/feature inventory in the
frontend sections 20B-20D. Payments are limited to authorized invoice/ledger
status and administrative reconciliation records; do not implement checkout,
card/bank collection, provider capture, refunds, payouts, or payroll execution.

### Active Student/Admin integration rules

- Audit current Prisma models, modules, resolvers, schema, and tests before
  adding a domain. Extend existing `users`, `groups`, `courses`, `events`,
  `lessons`, `assignments`, `tests`, `attempts`, `results`, `library`, `assets`,
  `memberships`, `notifications`, `finance`, and `audit` ownership in place.
- Add only genuinely missing operational contracts required for the approved
  Student/Admin routes, such as locations, schedule projections, attendance,
  intake/transfer review, reports, and ledger views. Follow the documented data-
  design and additive-migration process before new persisted models.
- Deliver each vertical slice with server-loaded authorization, validation,
  pagination, concurrency/idempotency rules, audit behavior, generated schema,
  frontend operation compatibility, and proportional tests.
- Seed and test only fictional/reserved data. Never import identities or values
  from reference media or expose production records during development.
- Keep Parent/Guardian, Super Admin, chat, public signup/password reset,
  certificates, AI grading, payment-provider execution, and unrestricted CMS or
  infrastructure controls out of scope.
- Preserve `best-react` and `best-server` as sibling repositories. Do not create
  a combined monorepo or move frontend source into this backend.

Existing placeholder controllers or generated example endpoints are not product
contracts and must not be extended.

## Mission

`best-server` is the independently deployed backend repository for BEST LC. It
serves the Next.js frontend in the sibling `best-react` repository through a
versioned GraphQL contract and owns PostgreSQL data, background processing,
object-storage metadata, authorization, and audit behavior after those phases
are approved.

## Approved architecture direction

- NestJS modular backend with a code-first GraphQL API using Apollo.
- PostgreSQL as the primary transactional database and Prisma for schema,
  migrations, database access, and transactions.
- Redis and BullMQ for persistent distributed background jobs.
- S3-compatible object storage for PDF, image, audio, and video objects;
  SeaweedFS 4.45 is the pinned local provider while runtime code remains
  provider-neutral.
- Deterministic test scoring in a dedicated scoring worker.
- GraphQL Code Generator provides operation-specific frontend types from the
  backend schema; never duplicate handwritten request/response types between
  repositories.
- AI evaluation is a future milestone. Do not scaffold an AI worker now.

## Repository topology

```text
apps/
  api/                  NestJS GraphQL application
  import-worker/        Approved local vocabulary import pilot
  scoring-worker/       Deterministic scoring worker
packages/
  database/             Prisma schema, migrations, generated client, and DB API
  graphql/              Schema artifacts and contract tooling
  scoring/              Pure versioned scoring rules
  auth/                 Shared authentication contracts
  config/               Typed environment configuration
  logger/               Structured logging
  testing/              Fixtures and integration helpers
infrastructure/
  docker/               Local infrastructure definitions
  scripts/              Safe operational helpers
```

Every app must remain independently buildable and deployable. Student, Teacher,
and operational Admin share one API; do not create a backend server per
dashboard. Split high-load workloads, not presentation areas.

## Package and tooling rules

- Package manager: Yarn 4 with the committed Yarn lockfile. Do not introduce an
  npm, pnpm, or Bun lockfile.
- Use Yarn Workspaces for package ownership and Turborepo only for task
  orchestration and caching.
- Use the active Node.js LTS line selected for the repository and record it in a
  root version file.
- TypeScript strict mode is mandatory. Never use `any`, unsafe type assertions,
  or suppressed compiler/ESLint errors to pass checks.
- Use application `.ts` files only. Tool-required `.mjs`, JSON, YAML, Prisma,
  GraphQL schema artifacts, and configuration formats are allowed.
- Keep dependencies minimal and add them only when their owning milestone needs
  them. Architecture-only scaffolding must not preinstall database, GraphQL,
  storage, or AI packages before implementation begins.
- Follow current stable official NestJS, GraphQL, Prisma, BullMQ, PostgreSQL,
  Redis, and object-storage documentation at implementation time.

## Source and naming conventions

- Follow NestJS suffix-based kebab-case filenames: `users.module.ts`,
  `users.service.ts`, `user.resolver.ts`, and `create-user.input.ts`.
- Use PascalCase for classes, GraphQL object/input types, enums, and exported
  TypeScript types. Use camelCase for functions, methods, variables, and
  properties. Use SCREAMING_SNAKE_CASE only for true constants.
- Use domain-first folders. Do not group unrelated modules into generic
  `helpers`, `utils`, `common`, or `shared` dumping grounds.
- Keep domain-owned DTOs, enums, and types inside their owning domain. An app
  may use `src/libs/dto`, `src/libs/enums`, and `src/libs/types` only for
  focused app-local contracts used by multiple domains; `libs` must not contain
  business rules or become a miscellaneous dumping ground.
- Contracts shared by multiple deployable applications belong in a focused
  workspace under `packages/`, not in copied app-local `libs` folders. Prisma
  model types and database enums are generated and owned by `@best/database`;
  never duplicate them by hand in API or worker sources.
- Keep generated Prisma code isolated in `packages/database/src/generated` and
  never mix handwritten database code into that directory. Schema and
  migrations live in `prisma`, design records live in `docs`, and Prisma Client
  is regenerated before lint, typecheck, or build.
- Do not pre-create empty Nest domain folders with `.gitkeep`. After a domain
  milestone is approved, use that app's official Nest CLI `generate` script so
  the CLI creates the folder, suffix-named files, and module wiring. The user
  has approved the tracked `apps/api/src/libs/{dto,enums,interceptor,types}`
  ownership structure; keep it focused on cross-domain API concerns.
  Run the generator with `--dry-run` first and keep the default non-flat domain
  layout. Generate API domains under `components/<domain>` with the
  `graphql-code-first` resource type so all domain modules live under
  `apps/api/src/components`; do not generate REST controllers for product
  operations.
- `ComponentsModule` is the API domain composition boundary. Every newly
  approved component module must be imported there; `AppModule` must not import
  individual domain modules directly. Use
  `yarn workspace @best/api generate resource components/<domain> --type graphql-code-first --no-flat --no-spec --crud false`;
  the Nest CLI will register the new module in `ComponentsModule`.
- Keep API code-first GraphQL classes under `apps/api/src/schemas`, grouped by
  their owning domain when concrete schema types are approved. Use suffixes
  such as `*.object.ts`, `*.input.ts`, and `*.enum.ts`. This is not a place for
  handwritten schema-first SDL; generated GraphQL schema artifacts belong in
  `packages/graphql`.
- Keep custom API guards under their owning domain, for example
  `apps/api/src/components/auth/guards`. Generate guards with the API Nest CLI
  and do not add empty or speculative authorization guards before their
  contract is approved.
- Auth decorators belong in `apps/api/src/components/auth/decorators` and auth
  guards belong in `apps/api/src/components/auth/guards`. Use the Nest CLI for
  both artifact types and keep suffix-based filenames without generated copy
  counters, such as `auth-member.decorator.ts` and `roles.guard.ts`.
- Preserve this approved auth structure:

  ```text
  apps/api/src/components/auth/
    decorators/
      auth-member.decorator.ts
      roles.decorator.ts
    guards/
      auth.guard.ts
      optional-auth.guard.ts
      roles.guard.ts
    auth.module.ts
    auth.service.ts
  ```

  `OptionalAuthGuard` is the project-safe equivalent of a reference
  `WithoutGuard`; do not introduce a second guard with that ambiguous name.
  Never create filename copies such as `(1)` or `(2)`.

- `AuthGuard` requires a server-resolved authenticated member, `RolesGuard`
  enforces metadata from the `Roles` decorator using the database-owned
  `UserRole`, and `OptionalAuthGuard` permits both anonymous and authenticated
  requests. Keep these guards registered and exported by `AuthModule`; do not
  register them globally without an approved public/private operation policy.
- All dashboard and future application clients use the versioned bearer
  access-token contract. `AuthService` owns access-token issuance and
  verification; guards extract credentials, delegate verification, and enforce
  operation policy. Access tokens are short-lived, contain only a user subject
  and token type, and never make their embedded role authoritative. Every
  authenticated request reloads the active user role from PostgreSQL.
- Accept exactly one `Authorization: Bearer <token>` value. Missing credentials
  are allowed only through `OptionalAuthGuard`; malformed or invalid supplied
  credentials always fail. Never store access tokens in browser local storage,
  log them, place them in URLs, or accept them through GraphQL arguments.
- Rotating refresh tokens require a separately reviewed hashed-token schema,
  reuse detection, revocation, and client-specific secure storage. Do not add a
  stateless or placeholder refresh token before that design is approved.
- Resolve GraphQL requests with `GqlExecutionContext` and HTTP requests with
  `switchToHttp`. Authentication state belongs on the trusted request context,
  never in `request.body`, and decorators must not parse authorization headers.
  Token validation belongs in the approved identity context/service,
  not duplicated across guards. Never copy `any`, permissive unknown-transport
  fallbacks, `console.*`, or client-supplied roles from reference projects.
- Before creating a framework artifact, explain its purpose, exact location,
  ownership, and generation approach to the user. After creation, explain its
  module wiring and whether it exposes runtime behavior.
- Keep bootstrap files thin. A module wires providers; it does not contain
  business rules.
- Keep resolvers thin when the API phase begins. Authorization and business
  rules belong in domain services, and persistence belongs in focused data
  providers/repositories.
- Do not create barrel files when direct imports make ownership clearer.
- Keep event callback and job handler names explicit, such as
  `handleAttemptSubmitted` or `processMediaBatch`.
- No dead code, commented experiments, console logging, fake integrations, or
  placeholder success responses.

## Application boundaries

### API

The API app will eventually own the GraphQL transport, request context,
authorization guards, validation, DataLoader lifecycle, and domain-module
composition. The approved structure-only scaffold may contain empty domain
modules, services, and resolvers. Until the GraphQL contract milestone, do not
add controllers, resolver methods, schema fields, or product endpoints.
Keep `AppModule` limited to infrastructure modules such as `DatabaseModule` and
the aggregate `ComponentsModule`. `DatabaseModule` owns the Nest lifecycle for
the `@best/database` client and exports it to domain modules.
Database availability and readiness logic belongs under `apps/api/src/database`
in `DatabaseHealthService`. Future operational health transports must delegate
to that service instead of embedding database probes in a controller or domain
component.
Global API error handling lives under `apps/api/src/libs/filters` and is
registered with `APP_FILTER` from `ComponentsModule`, keeping `AppModule`
limited to `DatabaseModule` and `ComponentsModule`. Expected shared errors use
`ApplicationError` and stable `ErrorCode` values; domain-specific errors remain
inside their owning component. Every response carries a server-generated
request ID. Unknown errors, stack traces, Prisma details, SQL, tokens, and
sensitive payloads must be masked from clients.

### Import worker

The import worker is a NestJS standalone application context, not an HTTP
server. Its approved synchronous pilot reads local Telegram HTML exports,
extracts embedded PDF text, uploads originals privately, and persists
review-only vocabulary drafts. Do not add Telegram network dependencies,
credentials, queue processors, bulk synchronization, or automatic publication.

### Scoring worker

The scoring worker is a NestJS standalone application context, not an HTTP
server. It will eventually consume immutable attempt-submission events and call
pure rules from `packages/scoring`. Until that milestone it contains only typed
startup configuration and an empty bootstrap/module boundary with no
processors.

## Future GraphQL rules

These rules become active only after the API plan is approved:

- Expose one product endpoint at `/graphql`; keep health, readiness, and metrics
  as operational endpoints outside the product schema.
- Use code-first schema generation and review the generated schema artifact in
  CI.
- Use explicit domain operation names, cursor pagination for growing lists, and
  request-scoped batching to prevent N+1 queries.
- Never expose correct test answers, internal storage keys, provider tokens,
  credential data, or raw authorization state in GraphQL.
- Enforce authentication, role, ownership, membership, and field-level
  permissions on the server.
- Add query depth, complexity, alias, payload-size, timeout, and rate limits
  before production.
- Do not add Federation until a measured need justifies extracting a domain.

## Future data rules

- Keep relational business data in PostgreSQL with foreign keys, unique
  constraints, checks, indexes, and transactions.
- Use JSONB only for genuinely variable source metadata and future structured
  evaluation output.
- Use translation tables for Uzbek, Russian, and English publication content.
- Store object metadata and stable keys in PostgreSQL; never store media binary
  data in the database.
- Published tests are immutable versions. Every attempt references exactly one
  version.
- Redis is queue/cache infrastructure, never the source of truth for users,
  answers, results, or imported content.
- Never edit a deployed migration in place or perform destructive production
  migration work without backup, review, and rollback planning.

## Future job rules

- Every queue job requires a versioned payload, idempotency key, retry/backoff
  policy, timeout, progress state, structured failure, and audit context.
- Use a transactional outbox when a database state change must reliably enqueue
  work.
- Repeated delivery must be safe. Never assume a job executes exactly once.
- Failed jobs require bounded retries and an operational dead-letter path.
- Queue consumers must be independently scalable and rate-limited per external
  dependency.

## Security and secrets

- Commit only `.env.example`; never commit real environment files, database
  URLs, provider secrets, JWT signing secrets, storage keys, or tokens.
- Validate required environment variables at process startup when the config
  milestone begins.
- Use short-lived signed bearer access tokens, server-owned roles, strict origin
  policy, input validation, rate limiting, signed media URLs, audit logs, and
  sensitive-data redaction.
- Never trust a client-selected role, query parameter, GraphQL input, Teacher
  ID, or Admin ID as authorization evidence.
- Keep private media private and issue short-lived authorized URLs.
- Never log passwords, provider tokens, private student answers, or correct
  answers.

## Observability

Propagate a correlation ID through future GraphQL requests, database actions,
outbox events, queue jobs, and worker logs. Use structured logging; `console.*`
is not an application logging strategy.

Plan metrics for API/resolver latency, authorization failures, database health,
queue depth/age/retries, scoring latency, object processing failures, and worker
health. Do not add an observability vendor until the deployment plan selects
one.

## Verification standards

The architecture milestone is complete only when all existing workspace checks
pass from the repository root:

- Formatting check
- ESLint with zero errors
- TypeScript strict typecheck
- Production build for every current app
- Unit tests for any non-trivial foundation logic

Future milestones additionally require PostgreSQL integration tests, GraphQL
contract tests, worker retry/idempotency tests, authorization tests, end-to-end
Student journeys, and load/recovery tests proportional to risk.

Do not weaken or disable a check to make the repository pass.

## Git and change safety

- Preserve user work and unrelated changes. Inspect repository status before
  editing.
- Do not commit, push, rewrite history, change remotes, or delete branches unless
  the user explicitly requests it.
- Do not use destructive reset or checkout commands.
- Treat lockfiles, migrations, and generated GraphQL schema/contract artifacts
  as reviewed artifacts. Prisma Client is reproducible build output and is not
  committed; review its schema and migration inputs, regenerate it before
  checks, and explain material generation changes.
- Keep structural changes isolated from later API/domain implementation so the
  architecture can be reviewed independently.

## Planned implementation sequence

1. Architecture-only repository foundation.
2. Local infrastructure and typed configuration.
3. PostgreSQL/Prisma database design and ERD.
4. NestJS identity, credentials, email challenge, and authorization contract.
5. Approved GraphQL domain plan.
6. First vertical Student test slice.
7. Object storage and Library.
8. Results, Progress, and authorized Teacher/Admin integration.
9. Approved Student/Admin frontend integration and required production hardening.
10. Separately approved AI evaluation.

Steps 1 through 5 are complete. The backend scope of step 6 is implemented;
frontend integration remains deferred. Step 7A object-storage configuration,
local provider, signing primitives, and tests are implemented. Step 7B media
lifecycle migrations and database invariants are also implemented. Step 7C
private upload, confirmation, and owner-download mutations are implemented.
Step 7D malware scanning, Teacher Library management, Student authorization,
and signed delivery are implemented. Step 7 is complete. The limited revised
vocabulary import pilot is implemented. Step 8A through 8K are implemented;
The Student/Admin integration portion of Step 9 and hardening required by those
vertical slices are approved. Unrelated production-platform expansion still
requires separate review.

## BACKEND PLAN

This is the complete approved production architecture reference transferred
from the frontend planning document. The active milestone and implementation
boundaries at the top of this file take precedence when a later decision or
completed phase makes historical planning language stale. The frontend remains
in the sibling `best-react` repository; it is not moved into this backend repo.
Historical Telegram/TDLib synchronization language remains inactive. Only the
approved local-export vocabulary pilot may be implemented.

### Backend technology decisions

- Preserve Yarn 4 and use Yarn Workspaces with Turborepo for monorepo task
  orchestration and build caching.
- Keep the existing application as the single Next.js web frontend for the
  public website and Student, Teacher, and operational Admin workspaces.
- Build one modular NestJS backend that exposes product functionality through a
  code-first GraphQL API using the current stable official Apollo driver.
- Use PostgreSQL as the primary transactional database and Prisma for the
  schema, migrations, generated database client, and transactions.
- Use Redis and BullMQ for persistent distributed background jobs.
- Store PDF, image, audio, and video objects in S3-compatible object storage;
  select an actively maintained local provider during the approved
  object-storage milestone.
- Use GraphQL Code Generator to derive frontend operation result and variable
  types from the generated GraphQL schema and authored operations.
- Deploy the web, API, import worker, and scoring worker independently. Do not
  create one backend server per dashboard.
- Do not create an AI worker in the initial backend milestone. Define only the
  versioned contracts required for a separately approved AI milestone.

Use current stable official documentation at implementation time. In
particular, follow NestJS GraphQL and BullMQ integration guidance, Prisma
PostgreSQL migration/transaction guidance, and GraphQL Code Generator client
preset guidance rather than copying outdated setup patterns.

### Target monorepo structure

```text
apps/
  api/                  NestJS GraphQL API
  import-worker/        Local vocabulary import pilot
  scoring-worker/       Deterministic test-scoring consumer
packages/
  database/             Prisma schema, migrations, seeds, and client
  graphql/              Operations, fragments, and generated client types
  scoring/              Versioned deterministic scoring rules
  auth/                 Shared authentication contracts
  config/               Typed environment and application configuration
  logger/               Shared structured logging
  testing/              Fixtures, factories, and integration helpers
infrastructure/
  docker/               Local PostgreSQL, Redis, and object-storage definitions
  scripts/              Safe environment and deployment helpers
```

Every workspace must own a focused responsibility. Avoid generic shared
packages that merely hide imports, and do not place domain business logic in
`packages/config` or the frontend.

### Runtime and deployment topology

```text
Browser
  -> Next.js web
  -> NestJS GraphQL API
       -> PostgreSQL
       -> Redis/BullMQ
            -> scoring-worker
       -> S3-compatible object storage
```

- Build every app as an independent artifact and container.
- Keep the API stateless so multiple replicas can run behind a load balancer.
- Scale import and scoring workers by queue workload without scaling the web or
  API unnecessarily.
- Use one PostgreSQL primary and one Redis deployment initially. Introduce
  connection pooling, replicas, partitioning, or additional services only when
  measured load requires them.
- Place the GraphQL API behind the same public origin or an approved gateway;
  allow bearer authorization headers only from explicitly approved origins.
- Keep operational health, readiness, and metrics endpoints outside the product
  GraphQL schema. Product data and mutations remain GraphQL-first.

### GraphQL architecture

Expose one product endpoint at `/graphql` and organize the NestJS application
by domain modules:

```text
AuthModule
UsersModule
StudentsModule
TeachersModule
AdminModule
CoursesModule
GroupsModule
LessonsModule
LibraryModule
TestsModule
AttemptsModule
ResultsModule
ImportsModule
AssetsModule
AuditModule
```

- Use code-first GraphQL decorators and TypeScript classes as the backend schema
  source. Generate and commit or publish the resulting schema artifact for
  codegen, review, and compatibility checks.
- Do not share backend resolver models directly with the frontend. Frontend
  types must represent the fields selected by actual GraphQL operations.
- Keep resolvers thin. Place authorization and business rules in domain
  services, and data access in focused repositories/providers.
- Use DataLoader or equivalent request-scoped batching for relational fields to
  prevent N+1 queries.
- Use cursor pagination for growing lists such as resources, attempts, results,
  imports, learners, and audit records.
- Use explicit query, mutation, and subscription names. Avoid generic
  `createItem`, `updateData`, or unbounded nested queries.
- Use GraphQL subscriptions for result-ready events only when the Redis-backed
  multi-instance transport is available. Keep a polling fallback for connection
  loss and environments where subscriptions are disabled.
- Use generated client operations and fragments through GraphQL Code Generator.
  Never maintain duplicate handwritten request/response interfaces.
- Add production query depth, alias count, complexity, payload-size, timeout,
  and rate limits. Consider persisted operations before public production
  release to reduce arbitrary-query attack surface.
- Disable or restrict production schema exploration according to the final
  operational policy while keeping schema artifacts available to CI/codegen.
- Introduce GraphQL Federation only after a real domain is extracted into an
  independently owned service. Do not federate the initial modular monolith.

### Authentication and authorization

The approved credential flow supersedes the earlier social-auth preview.

- Only an authenticated operational Admin may provision Teacher credentials.
  Admin may provision Student credentials; the approved Teacher-owned group
  mutation may provision a Student only together with enrollment into that
  Teacher's group. Public signup, Google, Facebook, Apple, and password-reset flows
  are not product contracts and must not be reintroduced.
- Login accepts name, email, and password. Email is the unique credential
  identifier; name is profile matching only and never role or authorization
  evidence. Passwords use Argon2id and are never stored or logged in plaintext.
- On login failure, return distinct error codes for incorrect email, first name,
  surname, and password so the frontend can show localized errors at those fields.
  The combined `name` input remains for existing clients; the split login form
  also sends `firstName` and `lastName` for precise profile-name validation.
  Return a code-specific error for failed email-code verification. Keep role,
  account-status, and unexpected failures generic, and retain login throttling.
- A valid password creates a PostgreSQL-backed six-digit email-code challenge.
  Store only an HMAC digest; enforce five-minute expiry, single use, five code
  attempts, sixty-second resend cooldown, and bounded credential failures.
- Issue the existing short-lived bearer token only after the email code is
  verified. Student, Teacher, and existing operational Admin credentials use
  the same verification path; product provisioning cannot create Admins.
- Email delivery uses configured SMTP. Production must fail startup without a
  real SMTP configuration. Development/test may disable delivery, but login
  must then fail honestly instead of reporting a fake send.
- Local manual testing uses the pinned loopback-only Mailpit Compose service on
  SMTP port 1025 and UI port 8025. Production must never use Mailpit.
- Bootstrap the first operational Admin only through the explicit
  `bootstrap:admin` CLI with temporary environment credentials. It may create
  the first Admin or rotate the exact existing Admin account; never add a
  public bootstrap mutation or leave the bootstrap password configured.
- Use short-lived bearer access tokens for the shared web/API and future
  application contract. Add hashed rotating refresh-token records only after
  their data design is reviewed.
- Resolve the bearer token in the NestJS GraphQL context/guards and load status,
  roles, and permissions from the server. Never trust a token-embedded role,
  client role, role query parameter, Teacher ID, Admin ID, or GraphQL input as
  authorization evidence.
- Support Student, Teacher, and operational Admin. Do not add Super Admin without
  fresh approval.
- Enforce authentication, role, ownership, group membership, attempt ownership,
  and field-level permissions on the server.
- Protect Student and Teacher routes only after server-side identity and role
  validation exist. Do not protect the current Student Library preview early.
- Keep access tokens out of URLs, persistent browser storage, logs, and GraphQL
  arguments. Future web refresh credentials, if cookie-backed, must be secure,
  HttpOnly, SameSite, narrowly scoped, rotated, and CSRF-protected.
- Restrict origins and never expose credentials, password digests, raw email
  codes, or internal challenge digests through the browser or GraphQL schema.

### PostgreSQL and Prisma data domains

Plan the relational schema in these bounded domains.

Identity:

- `users`
- `accounts`
- `refresh_tokens` (after separate rotation/revocation design approval)
- `roles`
- `user_roles`
- `student_profiles`
- `teacher_profiles`

Education:

- `courses`
- `course_translations`
- `groups`
- `group_members`
- `lessons`
- `lesson_materials`

Library and assets:

- `resources`
- `resource_translations`
- `resource_categories`
- `assets`
- `resource_assets`

Tests and results:

- `tests`
- `test_versions`
- `test_sections`
- `questions`
- `question_translations`
- `choices`
- `correct_answers`
- `attempts`
- `student_answers`
- `results`
- `score_breakdowns`

Future evaluation:

- `rubrics`
- `rubric_versions`
- `evaluation_jobs`
- `evaluations`
- `teacher_reviews`

Platform operations:

- `audit_logs`
- `outbox_events`
- `notifications`

Schema rules:

- Use foreign keys, unique constraints, checks, indexes, and transactions to
  enforce domain invariants in addition to application validation.
- Use translation tables for product content that must be published in Uzbek,
  Russian, and English. Do not hide searchable production translations in an
  unstructured blob.
- Use PostgreSQL JSONB for future structured AI output and genuinely variable
  source metadata, while keeping queried relational fields in typed columns.
- Make published test versions immutable and bind every attempt to one exact
  version.
- Enforce one authoritative attempt identity, answer uniqueness per
  attempt/question, legal state transitions, and scoring/result consistency at
  the database and service layers.
- Use additive, reviewed migrations and safe backfills. Never edit a deployed
  migration in place or run destructive production migration commands without
  explicit review, backup, and rollback planning.

### Object-storage architecture

Do not store PDF, image, video, or audio binary data in PostgreSQL.

1. A GraphQL mutation creates an authorized upload intent and a short-lived
   signed URL.
2. The browser or worker uploads directly to object storage.
3. A confirmation mutation or worker verifies the object and marks the asset
   ready.
4. PostgreSQL stores the storage key, original name, MIME type, size, checksum,
   source, owner, visibility, processing status, and timestamps.

- Keep private resources in private buckets and issue short-lived signed
  download URLs after authorization.
- Validate MIME signature and extension, enforce size limits, calculate
  checksums, sanitize names and metadata, and add malware scanning before
  publication.
- Preserve source/license metadata and do not expose imported material until
  ownership and publication review succeed.
- Use stable storage keys rather than public vendor URLs in domain records.

### Redis and BullMQ job architecture

Plan named queues for:

```text
media-processing
test-scoring
notification-delivery
ai-evaluation          # disabled until separately approved
```

- Give every job an idempotency key, explicit payload version, retry policy,
  exponential backoff, timeout, progress state, structured error, and audit
  context.
- Configure failed/dead-letter handling and an operational retry path. Never
  create an infinite automatic retry loop.
- Use the transactional outbox pattern for database changes that must reliably
  enqueue work, especially final test submission.
- Treat Redis as queue/cache infrastructure, not the authoritative source for
  student answers, results, users, or imported content.
- Scale queue consumers independently and apply concurrency/rate limits per
  external provider and workload.

### Test-platform architecture

Test authoring and publication:

- Create tests as drafts with typed sections, questions, choices, assets,
  timing, navigation, review, and scoring rules.
- Validate completeness before publication.
- Create an immutable `test_version` when publishing. Editing a published test
  creates a new version rather than changing active attempts.
- Never include correct answers or private scoring rules in Student GraphQL
  payloads.

Student attempt flow:

1. Authorize the Student and test availability.
2. Create or resume one server-owned attempt for the permitted policy.
3. Deliver the exact published test version.
4. Autosave answers through idempotent mutations and durable database writes.
5. Enforce timer, expiry, navigation, and submission rules using server time.
6. Lock the attempt in a transaction and transition it to `SUBMITTED`.
7. Write a transactional outbox event for scoring.
8. Move the attempt through `SCORING` to `COMPLETED` or `REVIEW_REQUIRED`.
9. Persist result and criterion/section breakdown atomically.
10. Notify the client through a result-ready subscription with polling fallback.

Use explicit attempt states:

```text
CREATED
IN_PROGRESS
SUBMITTED
SCORING
COMPLETED
REVIEW_REQUIRED
EXPIRED
CANCELLED
```

- Keep deterministic scoring rules as pure, versioned TypeScript functions in
  `packages/scoring` so workers and tests use one implementation.
- Unit-test every scoring rule, rounding rule, partial-credit rule, and invalid
  state.
- Multiple-choice and deterministic tests may produce results immediately after
  background scoring completes.
- Writing and Speaking remain `REVIEW_REQUIRED` until teacher review or a
  separately approved AI-evaluation workflow completes.

### Student and Admin Dashboard integration order

The auth foundation exists. Integrate protected Student and operational Admin
routes as contract-complete vertical slices:

The authoritative route inventory is in frontend sections 20B-20D. It includes
the Student dashboard, courses, schedule, assignments, Library, tests, results,
progress, read-only tuition ledger, notifications, and settings, plus the
operational Admin dashboard, intake requests, users, groups, courses, events,
locations, schedule, attendance, read-only ledger, tests/results, Library,
imports, transfers, notifications, audit, reports, and settings. Keep the
route-to-operation map current in
`packages/graphql/DASHBOARD_CONTRACT_MATRIX.md`.

The first vertical slice remains the reference transaction:

```text
Auth -> Tests list -> Test Runner -> Submit -> Scoring -> Result
```

Continue every approved domain as a complete slice with its GraphQL contract,
database behavior, authorization, responsive frontend, loading/empty/error/
denied/retry states, and automated verification. Extend existing operations
before adding a parallel model or resolver.

### Future AI-evaluation boundary

Do not build or connect AI grading in the initial backend milestone. Prepare
versioned contracts for:

- Original Writing and Speaking submissions
- Speaking audio and transcription
- Rubric and rubric version
- Asynchronous evaluation job
- Criterion-level score and evidence
- Feedback and confidence
- Model and prompt version
- Teacher review and override
- Immutable audit history

Low-confidence, inconsistent, failed, or policy-sensitive evaluations must
route to human review. AI output must never overwrite the original submission
or silently replace a teacher-approved result.

### Scaling strategy

Initial deployment:

- One PostgreSQL primary with connection pooling
- One Redis deployment
- One S3-compatible object store
- One or more stateless API replicas
- An independently scalable scoring worker

Measured growth options:

- Add API replicas behind the load balancer.
- Scale consumers per queue depth and processing latency.
- Add PostgreSQL read replicas for proven read-heavy workloads.
- Partition attempts, answers, import logs, or audit records only after table
  growth and query plans justify it.
- Add CDN delivery and controlled caching for public/authorized media.
- Extract Test Engine, Notifications, or future AI Evaluation into separate
  services only when ownership, deployment, reliability, or scaling evidence
  requires it.

Do not split Student, Teacher, and Admin into separate backend servers merely
because user counts grow. They share transactional domains; split independently
scalable workloads instead.

### Security requirements

- Server-side RBAC, ownership, and group-membership checks
- Short-lived bearer access tokens, validated issuer/audience/algorithm, and
  strict origin policy
- Rotating hashed refresh tokens with reuse detection when that later design is
  approved
- GraphQL input validation and output authorization
- Query depth, complexity, alias, payload, timeout, and rate limits
- Signed and expiring private-media access
- Secret manager and environment validation
- Sensitive-field and credential redaction in logs
- Audit events for privileged operations and result changes
- Database backup, restore drills, and reviewed migration rollback plans
- Correct-answer isolation from Student clients
- Dependency, container, and file-malware scanning

### Observability requirements

Propagate a correlation/request ID through GraphQL requests, database actions,
outbox events, queue jobs, and worker logs. Record only permitted identifiers
and never log credentials, raw passwords, provider tokens, private answers, or
unredacted sensitive payloads.

Monitor:

- GraphQL request and resolver latency/error rate
- Operation name, user/role context, and authorization failures
- Database connections, slow queries, locks, and migration status
- Queue depth, age, retries, dead-letter count, and processing duration
- Test autosave, submission, scoring, and result-ready latency
- Object-storage upload/processing failures
- API and worker health/readiness

### Test strategy

- Unit tests for scoring, validation, authorization decisions, state machines,
  classification, and storage-key generation.
- PostgreSQL integration tests for constraints, transactions, migrations,
  repositories, outbox delivery, and idempotency.
- GraphQL integration/contract tests for schema, operations, guards, pagination,
  error shapes, and generated client compatibility.
- Worker tests for retries, duplicate delivery, resume, concurrency, failure,
  and dead-letter handling.
- End-to-end Student journeys for auth, test start, autosave, resume, expiry,
  submission, scoring, live result, history, mobile, keyboard access, and
  recovery.
- Security tests for role escalation, ownership bypass, correct-answer leakage,
  malicious GraphQL queries, unsafe files, and signed-URL expiration.
- Load tests for concurrent autosave/submission and scoring queue bursts.

### CI/CD and environments

Maintain local, test, staging, and production environments with typed required
variables and no committed secrets.

Every pull request must run:

1. Formatting
2. Linting
3. TypeScript checks
4. GraphQL schema generation and diff review
5. GraphQL client codegen consistency
6. Unit tests
7. Database and GraphQL integration tests
8. Migration validation
9. Workspace builds
10. Security and dependency checks

Production deployment order:

1. Verify backup and migration plan.
2. Apply backward-compatible database migrations.
3. Deploy API.
4. Deploy workers.
5. Deploy web.
6. Run smoke and contract tests.
7. Enable feature flags gradually.
8. Monitor and retain a rollback path.

### Implementation phases

Phase 0 — approved baseline and protection:

- Preserve the existing frontend and backend worktrees and audit their current
  contracts before editing.
- Keep both repositories separate and update their active scope boundaries.
- Record data-design decisions before additive migrations.

Phase 1 — existing backend foundation:

- Preserve the existing Next.js project and its history in the sibling
  `best-react` repository.
- Configure Yarn Workspaces, Turborepo, shared configuration, and root scripts
  inside the independent `best-server` repository.
- Prove formatting, linting, typechecking, testing, development, and production
  workspace builds before adding backend logic.

Phase 2 — backend infrastructure:

- Create NestJS GraphQL API, PostgreSQL/Prisma package, Redis/BullMQ, an approved
  S3-compatible local provider, Docker local environment, configuration
  validation, logging, and health checks.

Phase 3 — identity and authorization:

- Add Admin-provisioned Argon2id credentials, SMTP email-code challenges,
  bearer token issuance, roles, NestJS GraphQL context, server guards, and
  protected Student/Teacher/Admin boundaries. Refresh rotation remains a
  separately reviewed extension.

Phase 4 — first test vertical slice:

- Implement test schema/versioning, attempts, answers, autosave, submission,
  outbox, scoring worker, result-ready notification, and Student UI integration.

Phase 5 — Library:

- Implement object storage, Library GraphQL API, media safety, localization
  readiness, and protected Student Library integration. This phase is complete;
  the limited local-export vocabulary pilot is implemented separately.

Phase 6 — Results and Progress:

- Add result history, breakdowns, progress calculations, and explicitly
  authorized Teacher visibility.

Phase 7 — production hardening:

- Complete rate limits, auditing, monitoring, backup/restore, load tests,
  deployment automation, feature flags, and operational runbooks.

Phase 8 — future AI evaluation:

- Begin only after separate requirements, privacy, rubric, model, cost, human
  review, and implementation approval.

## Approved Admin editorial expansion â€” 2026-10-11

The owner approved connected Overview, Requests (course/event/exam registrations), Notifications, Courses, public Exam offerings/sessions, and Events. Reuse existing persisted public content; Admin editing includes all translations and nested content. Contact submissions stay in Messages. Admin dropdowns and styles remain Admin-owned copies of the approved directory design. No public test-taking or payment execution is introduced.
