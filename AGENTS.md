# BEST Server — Backend Instructions

## Current milestone

Build only the backend repository architecture and engineering standards in this
milestone. Do not implement GraphQL queries, mutations, subscriptions,
resolvers, database models, migrations, Telegram synchronization, scoring
logic, authentication, or business APIs until the user supplies and approves
their separate API plan.

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
- S3-compatible object storage for PDF, image, audio, and video objects; MinIO
  is the planned local provider.
- Read-only TDLib ingestion in a dedicated import worker.
- Deterministic test scoring in a dedicated scoring worker.
- GraphQL Code Generator provides operation-specific frontend types from the
  backend schema; never duplicate handwritten request/response types between
  repositories.
- AI evaluation is a future milestone. Do not scaffold an AI worker now.

## Repository topology

```text
apps/
  api/                  NestJS GraphQL application
  import-worker/        Telegram and media-processing worker
  scoring-worker/       Deterministic scoring worker
packages/
  database/             Prisma schema, migrations, and database client
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
  storage, Telegram, or AI packages before implementation begins.
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
- Keep bootstrap files thin. A module wires providers; it does not contain
  business rules.
- Keep resolvers thin when the API phase begins. Authorization and business
  rules belong in domain services, and persistence belongs in focused data
  providers/repositories.
- Do not create barrel files when direct imports make ownership clearer.
- Keep event callback and job handler names explicit, such as
  `handleAttemptSubmitted` or `processTelegramBatch`.
- No dead code, commented experiments, console logging, fake integrations, or
  placeholder success responses.

## Application boundaries

### API

The API app will eventually own the GraphQL transport, request context,
authorization guards, validation, DataLoader lifecycle, and domain-module
composition. During the current architecture milestone it may contain only a
minimal NestJS bootstrap and empty root module. Do not add controllers,
resolvers, schema fields, or product endpoints.

### Import worker

The import worker is a NestJS standalone application context, not an HTTP
server. It will eventually consume Telegram and media queues. During this
milestone it contains only an empty bootstrap/module boundary and no processors.

### Scoring worker

The scoring worker is a NestJS standalone application context, not an HTTP
server. It will eventually consume immutable attempt-submission events and call
pure rules from `packages/scoring`. During this milestone it contains only an
empty bootstrap/module boundary and no processors.

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
- Use JSONB only for genuinely variable raw Telegram payloads, source metadata,
  and future structured evaluation output.
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
  URLs, provider secrets, Telegram credentials, TDLib sessions, JWT/session
  secrets, storage keys, or tokens.
- Validate required environment variables at process startup when the config
  milestone begins.
- Use secure HttpOnly sessions, server-owned roles, strict origin policy, input
  validation, rate limiting, signed media URLs, audit logs, and sensitive-data
  redaction.
- Never trust a client-selected role, query parameter, GraphQL input, Teacher
  ID, or Admin ID as authorization evidence.
- Keep private media private and issue short-lived authorized URLs.
- Never log passwords, provider tokens, private student answers, correct
  answers, or unredacted Telegram session material.

## Observability

Propagate a correlation ID through future GraphQL requests, database actions,
outbox events, queue jobs, and worker logs. Use structured logging; `console.*`
is not an application logging strategy.

Plan metrics for API/resolver latency, authorization failures, database health,
queue depth/age/retries, scoring latency, Telegram import progress, object
processing failures, and worker health. Do not add an observability vendor until
the deployment plan selects one.

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
- Treat lockfiles, migrations, generated schema, and generated clients as
  reviewed artifacts. Explain material generated changes.
- Keep structural changes isolated from later API/domain implementation so the
  architecture can be reviewed independently.

## Planned implementation sequence

1. Architecture-only repository foundation.
2. Local infrastructure and typed configuration.
3. PostgreSQL/Prisma database design and ERD.
4. Auth.js/NestJS identity and authorization contract.
5. Approved GraphQL domain plan.
6. First vertical Student test slice.
7. Object storage, Library, and Telegram import.
8. Results, Progress, and authorized Teacher/Admin integration.
9. Production hardening.
10. Separately approved AI evaluation.

Only step 1 is authorized in the current milestone.
