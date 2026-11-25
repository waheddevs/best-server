# BEST Server

Independent NestJS backend for BEST LC, deployed separately from the sibling
`best-react` frontend. The API serves the localized public website and approved
Student, Teacher, and operational Admin workspaces. PostgreSQL owns business
data, authorization, attempts, results, finance records, and audit history.

The repository uses Yarn 4 workspaces, NestJS, strict TypeScript, Prisma,
PostgreSQL, Redis/BullMQ, provider-neutral S3 storage, and deterministic scoring.
Teacher AI text assistance has a separate API/worker contract and remains
disabled until its configured provider, privacy, budget, and pilot gates pass.

## Workspace

```text
apps/
  api/                  Public, Student, Teacher, and operational Admin GraphQL API
  scoring-worker/       Outbox relay and deterministic scoring consumer
  assistant-worker/     Gated Teacher AI outbox relay and chat consumer
packages/
  database/             Prisma schema, migrations, and database client
  graphql/              GraphQL plan and generated schema contract
  scoring/              Pure versioned objective scoring and answer normalization
  storage/              Provider-neutral private S3 signing and object probes
  ai-chat/              Teacher chat policy and versioned job contracts
  config/               Typed environment configuration
  logger/               Shared structured logging and redaction
infrastructure/
  docker/               Local PostgreSQL, Redis, SeaweedFS, and ClamAV
  production/           Deployment, proxy, and certificate operations
```

The public, Student, Teacher, and operational Admin clients share `apps/api`.
Workers are separate runtime processes so background workloads can be deployed
and scaled independently.

API domains live under `apps/api/src/components`, API-local cross-domain
contracts under `apps/api/src/libs`, and approved code-first types under
`apps/api/src/schemas`. The first contract exposes authenticated Student test
listing, attempt start/resume, answer autosave, submit, status, result history,
current-group progress, Teacher-owned group/Student progress, attempt history,
detailed Teacher answer review, approved operational Admin projections, and `viewer` operations.

`ComponentsModule` composes all API domains. The root `AppModule` imports only
that aggregate and the global `DatabaseModule`, which connects and disconnects
the shared Prisma client through the Nest application lifecycle.
`DatabaseHealthService` owns the PostgreSQL readiness probe so future health
transports remain thin.

The API has Admin-provisioned Argon2id credentials and password-only GraphQL
login through `credentialLogin`. It returns an audited credential session with
short-lived access tokens and rotating, hashed refresh tokens. Guards delegate
JWT validation to `tokens/auth.service.ts`, which reloads active status and role
from PostgreSQL. Public signup, email-code login and social exchange are unavailable.
Login throttling uses `AUTH_LOGIN_HASH_SECRET`, independent of the JWT signing
key. Deployments must rename the previous OTP-named key while preserving its value.

Server-generated request IDs and a global exception filter provide stable error
codes for GraphQL and operational HTTP responses while masking unknown and
database-internal details.

The generated product contract is
[`packages/graphql/schema.graphql`](packages/graphql/schema.graphql).
API code-first types and resolvers define its operations; domain services and
guards enforce authorization, pagination, and error behavior.

Attempt submission and scoring use a PostgreSQL transactional outbox and the
Redis-backed `test-scoring` BullMQ queue. The independently deployable scoring
worker submits expired attempts, publishes idempotent versioned jobs, invokes
the versioned deterministic scoring rules, and persists each result once.

Answer and section-note saves lock the owned attempt row before checking its
status and deadline. Manual submission and discard take the same lock; automatic
expiry updates serialize on that row as well. Once submission wins the lock,
later saves are rejected. If saving wins, its committed answer is visible to
submission and scoring. Deadlines are checked after any lock wait.

Autosave mutations retain the `StudentAttempt` GraphQL contract, but load only
saved answers, notes and status when that is all the client requests. Selections
of other fields, including through aliases and fragments, use the full read.
Raw text is limited to 1,000 UTF-16 code units for short answers, 20,000 for long
answers, and 4,000 for section notes, before trimming. Question-specific short
answer word limits still apply; oversized input is rejected without truncation.

Private media uses the S3 API through `@best/storage`. SeaweedFS 4.45 is pinned
only as the local Docker provider. Teacher/Admin mutations create exact-size,
single-write private upload URLs, verify stored MIME/signature/size and SHA-256,
and issue short-lived owner-only download URLs for ready objects. ClamAV scans
validated bytes before readiness; PostgreSQL permits domain attachment only
after a `READY + CLEAN` verdict. Stable object keys never contain user
filenames. Teachers manage translated, categorized, ordered Library materials;
Students read and download them only through current group membership.

Media confirmation shares in-flight work for the same owner and object, and
allows at most two active verifications per API process. Additional objects
receive a retryable `SERVICE_UNAVAILABLE` response before their bytes are read;
there is no waiting queue. These limits do not coordinate across API replicas.
Object reads enforce the byte limit while streaming and cancel oversized bodies.
ClamAV version lookup, connection, upload, and reply share one scan deadline.

## Requirements

- Node.js 24
- Corepack
- Yarn 4.14.1
- Docker with the Compose plugin for local infrastructure

## Commands

```bash
corepack enable
yarn install --immutable
yarn format:check
yarn lint
yarn typecheck
yarn build
yarn test
yarn database:validate
yarn database:test:integration
yarn api:test:integration
yarn scoring:test:integration
yarn assistant:test:integration
yarn schema:generate
yarn workspace @best/api bootstrap:admin
```

For a single runtime during architecture work:

```bash
yarn dev:api
yarn dev:scoring
yarn dev:assistant
```

## Local infrastructure

Copy `.env.example` to `.env`, replace the local PostgreSQL password, then run:

```bash
yarn infra:config
yarn infra:up
```

The current local stack contains PostgreSQL, Redis, SeaweedFS, ClamAV, and a
loopback-only Mailpit development inbox. Teacher Listening previews use the
API's in-process Kokoro model. See `infrastructure/docker/README.md` for
operational details.

## First local Admin and password login

After migrations are deployed, temporarily set `BOOTSTRAP_ADMIN_NAME`,
`BOOTSTRAP_ADMIN_EMAIL`, and a 16–128 character `BOOTSTRAP_ADMIN_PASSWORD` in
the ignored root `.env`, then run:

```bash
yarn workspace @best/api bootstrap:admin
```

Remove `BOOTSTRAP_ADMIN_PASSWORD` from `.env` immediately after the successful
command. The script creates the first Admin or rotates the credential only when
the exact existing Admin email is supplied; it never exposes a public endpoint.

Start the local stack and API, then use the login form with the provisioned
credentials. No email code or mail server is required.

See `AGENTS.md` for repository boundaries and the approved implementation
sequence.

## Source maintenance

Resolvers keep the existing domain service interfaces. Test authoring delegates
draft access, section/question editing, publication, and Listening audio to
focused providers in `components/tests`. Attempts delegate reads, media, and
lifecycle operations in `components/attempts`. Teacher results delegate review
and progress in `components/results`. Transaction boundaries and ownership
checks remain in the domain that performs the operation.

`@best/scoring` owns objective-answer normalization for authoring, answer/result
presentation, and scoring. Do not duplicate that rule in API services.

`yarn schema:generate` builds the API and generates the sorted GraphQL artifact
without starting the API transport or connecting its application providers.
Build workspace dependencies first with `yarn build`. Keep its resolver list
aligned with the registered modules, including Teacher AI. Review the schema
diff and regenerate the sibling frontend client only when contracts change.

Backend unit and integration tests remain part of verification. Integration
suites create isolated fictional test databases and require their documented
local PostgreSQL/Redis/storage prerequisites. Never point them at production.
Telegram import and the local vocabulary pilot were cancelled on 2026-11-25.
Their worker and CLI are removed; historical database records, Prisma models,
applied migrations, and database constraint tests remain for data retention.
Static easyIELTS import sources and Academic test seeds were retired on
2026-11-26. Existing test content is read from PostgreSQL; new environments need
a database backup or content created through the authorized authoring flow.
The unlinked original Listening WAV is retained under `packages/database/assets`.
The six local demo roster/payment/lesson/finance/notification scripts were also
retired on 2026-11-26. Notification integration tests create their own reserved
fixtures in disposable databases. The standalone group rate backfill was also
retired on 2026-11-26; existing rates remain managed by the authorized group
creation/editing flow. Historical migrations and the Kokoro worker remain active
inputs.
