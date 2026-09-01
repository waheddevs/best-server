# BEST Server

Independent NestJS backend monorepo for BEST LC. The repository contains the
deployable application foundation, typed local infrastructure configuration,
the approved PostgreSQL/Prisma domain schema, and the Nest CLI-generated API
domain boundaries. Product GraphQL operations, queue processors, and external
integrations are not implemented yet.

## Workspace

```text
apps/
  api/                  GraphQL API domain scaffold
  import-worker/        Future Telegram/media worker
  scoring-worker/       Future deterministic scoring worker
packages/
  database/             Prisma schema, migrations, and database client
  graphql/              Future schema and contract tooling
  scoring/              Future pure scoring rules
  auth/                 Future authentication contracts
  config/               Typed environment configuration
  logger/               Future structured logging
  testing/              Future test fixtures and helpers
infrastructure/
  docker/               Local PostgreSQL and Redis definitions
  scripts/              Future safe operational helpers
```

The Student, Teacher, and operational Admin clients will share `apps/api`.
Workers are separate runtime processes so background workloads can be deployed
and scaled independently.

API domains contain Nest modules, empty services, and empty code-first
resolvers under `apps/api/src/components`. API-local shared declarations live
under `apps/api/src/libs`. Code-first object, input, and enum classes will live
under `apps/api/src/schemas` once their contracts are approved; the scaffold
exposes no product query or mutation yet.

`ComponentsModule` composes all API domains. The root `AppModule` imports only
that aggregate and the global `DatabaseModule`, which connects and disconnects
the shared Prisma client through the Nest application lifecycle.
`DatabaseHealthService` owns the PostgreSQL readiness probe so future health
transports remain thin.

The API has a bearer access-token foundation with typed issuer, audience,
secret, and TTL configuration. Guards validate bearer credentials through
`AuthService`, which reloads the active user role from PostgreSQL. No login or
refresh-token GraphQL operation is exposed yet.

Server-generated request IDs and a global exception filter provide stable error
codes for GraphQL and operational HTTP responses while masking unknown and
database-internal details.

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

The current local stack contains PostgreSQL and Redis. See
`infrastructure/docker/README.md` for operational details and the pending object
storage decision.

See `AGENTS.md` for repository boundaries and the approved implementation
sequence.
