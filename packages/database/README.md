# Database package

Owns the PostgreSQL Prisma schema, reviewed migrations, generated client, and
database connection factory for all deployable applications. Human-written
runtime code stays in `src`; Prisma writes reproducible client code to the
ignored `src/generated` build-artifact directory.

The first domain schema follows the approved decisions in
`docs/DATA_MODEL_PLAN.md` and `docs/ERD.md`. The additive auth identity migration
follows `docs/AUTH_IDENTITY_PLAN.md` and stores no provider tokens. Auth.js web
sessions and backend refresh tokens are not database-owned here. The milestone
6 scoring boundary follows `docs/SCORING_OUTBOX_PLAN.md`. No fake users, groups,
categories, tests, or finance records are seeded; integration fixtures live only
in disposable databases or rolled-back transactions.

The approved step 7B media lifecycle keeps binaries outside PostgreSQL and
tracks private object intent, verification, readiness, rejection, source,
authorization visibility, and immutable malware verdict metadata. Only
`READY + CLEAN` media may be attached to Library items or used as payment
receipts. The approved 7D Library contract is recorded in
`docs/LIBRARY_MEDIA_PLAN.md`.

## Commands

Run from the repository root:

```bash
corepack yarn database:generate
corepack yarn database:validate
corepack yarn build --filter=@best/database
```

After PostgreSQL is running and an untracked `.env` contains a valid
`DATABASE_URL`:

```bash
corepack yarn database:migrate:status
corepack yarn database:migrate:deploy
corepack yarn database:test:integration
```

Do not use `prisma db push` for this repository. Schema changes require a
reviewed SQL migration. Integration tests run inside transactions and roll back
their fixtures, so they do not leave test rows in the configured database. See
`docs/MIGRATIONS.md` for migration validation and local recovery guidance.
