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

The API has a bearer access-token foundation with typed issuer, audience,
secret, and TTL configuration. Guards validate bearer credentials through
`AuthService`, which reloads the active user role from PostgreSQL. The trusted
Next.js server can exchange a short-lived signed Auth.js identity assertion at
`POST /internal/auth/exchange`; the browser does not receive the BEST access
token. No login or refresh-token GraphQL operation is exposed.

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

The current local stack contains PostgreSQL, Redis, and SeaweedFS. See
`infrastructure/docker/README.md` for operational details.

See `AGENTS.md` for repository boundaries and the approved implementation
sequence.
