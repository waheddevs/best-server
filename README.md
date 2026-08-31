# BEST Server

Independent NestJS backend monorepo for BEST LC. The current milestone contains
only deployable application boundaries and engineering standards; product APIs,
GraphQL operations, database models, queues, and external integrations are not
implemented yet.

## Workspace

```text
apps/
  api/                  Future GraphQL API
  import-worker/        Future Telegram/media worker
  scoring-worker/       Future deterministic scoring worker
packages/
  database/             Future Prisma ownership
  graphql/              Future schema and contract tooling
  scoring/              Future pure scoring rules
  auth/                 Future authentication contracts
  config/               Future typed environment configuration
  logger/               Future structured logging
  testing/              Future test fixtures and helpers
infrastructure/
  docker/               Future local infrastructure definitions
  scripts/              Future safe operational helpers
```

The Student, Teacher, and operational Admin clients will share `apps/api`.
Workers are separate runtime processes so background workloads can be deployed
and scaled independently.

## Requirements

- Node.js 24
- Corepack
- Yarn 4.14.1

## Commands

```bash
corepack enable
yarn install
yarn format:check
yarn lint
yarn typecheck
yarn build
```

For a single runtime during architecture work:

```bash
yarn dev:api
yarn dev:import
yarn dev:scoring
```

See `AGENTS.md` for repository boundaries and the approved implementation
sequence.
