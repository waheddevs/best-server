# Database package

Owns the PostgreSQL Prisma schema, reviewed migrations, generated client, and
database connection factory for all deployable applications. Human-written
runtime code stays in `src`; Prisma writes reproducible client code to the
ignored `src/generated` build-artifact directory.

The first domain schema follows the approved decisions in
`docs/DATA_MODEL_PLAN.md` and `docs/ERD_DRAFT.md`. Auth.js account/session
tables remain deferred to milestone 4. No fake users, groups, categories, or
finance records are seeded.

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
```

Do not use `prisma db push` for this repository. Schema changes require a
reviewed SQL migration. See `docs/MIGRATIONS.md` for the initial migration
status and local recovery guidance.
