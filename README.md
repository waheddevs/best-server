# BEST Server

Independent NestJS backend monorepo for BEST LC. The repository contains the
deployable application foundation, typed local infrastructure configuration,
the approved PostgreSQL/Prisma domain schema, identity foundation, code-first
GraphQL contract, first Student test flow, Teacher group reporting, and
provider-neutral S3 storage with malware-scanned Library delivery. Steps 7 and
8 are complete; production hardening and frontend integration remain deferred.

## Workspace

```text
apps/
  api/                  GraphQL API and first Student test slice
  import-worker/        Dormant legacy scaffold with no processors
  scoring-worker/       Outbox relay and deterministic scoring consumer
packages/
  database/             Prisma schema, migrations, and database client
  graphql/              GraphQL plan and generated schema contract
  scoring/              Pure versioned single-choice scoring
  storage/              Provider-neutral private S3 signing and object probes
  auth/                 Future authentication contracts
  config/               Typed environment configuration
  logger/               Shared structured logging and redaction
  testing/              Future test fixtures and helpers
infrastructure/
  docker/               Local PostgreSQL, Redis, SeaweedFS, and ClamAV
  scripts/              Future safe operational helpers
```

The Student, Teacher, and operational Admin clients will share `apps/api`.
Workers are separate runtime processes so background workloads can be deployed
and scaled independently.

API domains live under `apps/api/src/components`, API-local cross-domain
contracts under `apps/api/src/libs`, and approved code-first types under
`apps/api/src/schemas`. The first contract exposes authenticated Student test
listing, attempt start/resume, answer autosave, submit, status, result history,
current-group progress, Teacher-owned group/Student progress, attempt history,
detailed Teacher answer review, Admin academic monitoring and score history,
and `viewer` operations.

`ComponentsModule` composes all API domains. The root `AppModule` imports only
that aggregate and the global `DatabaseModule`, which connects and disconnects
the shared Prisma client through the Nest application lifecycle.
`DatabaseHealthService` owns the PostgreSQL readiness probe so future health
transports remain thin.

The API has Admin-provisioned Argon2id credentials and a two-step GraphQL login.
`beginCredentialLogin` sends a six-digit code through SMTP;
`verifyCredentialLogin` consumes the single-use five-minute challenge before
returning a short-lived bearer token. Guards validate that token through
`AuthService`, which reloads active status and role from PostgreSQL. Public
signup, social identity exchange, and refresh tokens are not exposed.

Server-generated request IDs and a global exception filter provide stable error
codes for GraphQL and operational HTTP responses while masking unknown and
database-internal details.

The approved product operation, authorization, pagination, error, and codegen
contract is documented in
[`packages/graphql/GRAPHQL_DOMAIN_PLAN.md`](packages/graphql/GRAPHQL_DOMAIN_PLAN.md).
The generated review artifact is `packages/graphql/schema.graphql`.

Attempt submission and scoring use a PostgreSQL transactional outbox and the
Redis-backed `test-scoring` BullMQ queue. The independently deployable scoring
worker submits expired attempts, publishes idempotent versioned jobs, invokes
the pure `single-choice-v1` rule, and persists each result once.

Private media uses the S3 API through `@best/storage`. SeaweedFS 4.45 is pinned
only as the local Docker provider. Teacher/Admin mutations create exact-size,
single-write private upload URLs, verify stored MIME/signature/size and SHA-256,
and issue short-lived owner-only download URLs for ready objects. ClamAV scans
validated bytes before readiness; PostgreSQL permits domain attachment only
after a `READY + CLEAN` verdict. Stable object keys never contain user
filenames. Teachers manage translated, categorized, ordered Library materials;
Students read and download them only through current group membership.

## Requirements

- Node.js 24
- Corepack
- Yarn 4.14.1
- Docker with the Compose plugin for local infrastructure

## Commands

```bash
corepack enable
yarn install
yarn format:check
yarn lint
yarn typecheck
yarn build
yarn test
yarn database:validate
yarn database:test:integration
yarn api:test:integration
yarn scoring:test:integration
yarn workspace @best/api bootstrap:admin
```

For a single runtime during architecture work:

```bash
yarn dev:api
yarn dev:import
yarn dev:scoring
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

## First local Admin and email-code testing

After migrations are deployed, temporarily set `BOOTSTRAP_ADMIN_NAME`,
`BOOTSTRAP_ADMIN_EMAIL`, and a 16–128 character `BOOTSTRAP_ADMIN_PASSWORD` in
the ignored root `.env`, then run:

```bash
yarn workspace @best/api bootstrap:admin
```

Remove `BOOTSTRAP_ADMIN_PASSWORD` from `.env` immediately after the successful
command. The script creates the first Admin or rotates the credential only when
the exact existing Admin email is supplied; it never exposes a public endpoint.

Start the local stack and API, submit the login form, then open
`http://localhost:8025` to read the Mailpit message and enter its six-digit
code. Mailpit captures local mail only. Production must replace the SMTP values
with a real provider.

See `AGENTS.md` for repository boundaries and the approved implementation
sequence.
