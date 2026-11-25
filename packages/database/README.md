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

## Retired static test content

The easyIELTS importer/source snapshot and Academic test seed/catalog were
removed on 2026-11-26 at the owner's request. API test reads continue to use
PostgreSQL. Existing tests, import provenance, models, and migrations are
retained. Recreating a test catalog now requires a database backup or the
authorized Teacher authoring flow; the retired import/seed commands are absent.
The six local demo roster/payment/lesson/finance/notification scripts and their
commands were also removed on 2026-11-26. Existing database rows are retained;
notification integration tests create reserved data directly in their disposable
test database. The standalone group tuition-rate backfill was also retired on
2026-11-26. Existing rate/audit rows and the authorized group creation/editing
flow remain; this source cleanup does not update database records.

The original Listening WAV is retained at `assets/gt-community-hall-p1.wav`.
SHA-256: `3eec286acc4092861ba762f8b5048d29358beb840f9936d7315eb92c8a2c4ed2`.
It originated from the reviewed easyIELTS snapshot at upstream commit
`7b39a29fc82304ff2c976495e0250232def1baf4`. It is not served from the repository
or automatically attached to tests. Any later attachment must use the existing
authorized media upload, verification, scanning, and confirmation flow.

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
