# Database migration workflow

## Initial migration

`20260901000000_initial_domain_schema` was generated offline from the approved
Prisma schema and then reviewed with PostgreSQL-only constraints and
immutability triggers.

It creates:

- 29 domain tables and 12 enums;
- foreign keys, unique constraints, indexes, and numeric/date checks;
- one-active-membership, one-draft-version, one-correct-option, and
  one-active-attempt partial unique indexes;
- immutable published test content, submitted answers, scored attempts,
  finance source rows, Telegram provenance, and audit rows.

The migration has not been applied because PostgreSQL and Docker are not
available in the current environment. It must be exercised against a disposable
local PostgreSQL database before any shared or production deployment.

## Apply and inspect

With PostgreSQL running and `DATABASE_URL` set in the untracked root `.env`:

```bash
corepack yarn database:migrate:status
corepack yarn database:migrate:deploy
```

After deployment, run database integration tests for constraints, immutable
published versions, attempt lifecycle, finance append-only behavior, and safe
Telegram import retries.

## Recovery

There is no automatic down migration. Before a shared deployment, take a backup
and review a forward-fix plan. For a disposable local database only, recreate
the local database and rerun `database:migrate:deploy`; never use that recovery
method on shared or production data.

Never edit a migration after it has been deployed to a shared environment.
