# Separate user name fields

Date: 2026-10-08

Status: Approved. The user explicitly requested adding two columns and filling
them from the existing database names, rather than waiting for profile edits.
The scope of this change is the database migration and Prisma fields; existing
login, GraphQL, and frontend contracts remain unchanged.

## Current behavior

- `users.display_name` is a required `varchar(160)` field. There are no persisted
  first-name or last-name columns.
- Teacher-owned Student provisioning already accepts separate first and last
  names, validates them, and combines them before saving `display_name`.
- Admin provisioning and profile updates currently accept `displayName`.
- Credential login accepts separate names but compares them with the combined
  stored display name. A documented legacy Teacher exception accepts a
  given-name-only profile until the surname is saved in Settings.

## Approved storage and backfill

- Add nullable `users.first_name` and `users.last_name`, each `varchar(80)`,
  mapped to Prisma `User.firstName` and `User.lastName`.
- Keep `display_name` unchanged so profile, roster, audit, session, and dashboard
  consumers remain compatible. Do not modify names, IDs, credentials, or roles.
- A read-only inspection of the local database found 189 users: 187 with two
  whitespace-separated name parts, two with a single part, and no names with
  more than two parts. Only aggregate counts were exposed.
- Normalize whitespace in the derived values only. For a two-part name, write
  the first part into `first_name` and the second into `last_name`.
- For a single-part name, set `first_name` and leave `last_name` null. Do not
  fabricate a missing surname.
- On other databases, leave empty, ambiguous (three or more parts), or overlong
  names unconverted rather than guessing boundaries or truncating data.
- Optional name fields must contain nonempty, trimmed values when set. A surname
  requires a first name. Single-name users remain valid.
- This is an additive snapshot backfill. Existing display-name-only application
  writers remain compatible; new rows can have null structured fields and later
  display-name edits are not synchronized by this migration. Do not switch login
  or other readers to these fields until the writer integration is delivered.

## Implementation scope

1. Add an additive migration and regenerate Prisma Client.
2. Backfill the existing names through the migration and verify aggregate
   counts, preserving the original display names.
3. Add PostgreSQL migration tests with fictional names for two-part, single-part,
   whitespace-normalized, ambiguous, and overlong cases, plus constraints.
4. Build and typecheck the generated database client and dependent workspaces.

Updating provisioning/settings contracts, synchronized name writes, and login
matching is a separate follow-up, not part of this explicitly database-only task.

## Migration and rollback

The migration adds columns, constraints, and a backfill of the new columns only;
it does not rewrite existing display names, delete records, or alter identities,
passwords, memberships, or roles.
Deploy the database addition before code using the new fields. Verify migration
status and the intended local database without exposing credentials or user data.

An application rollback leaves the additive columns in place. Do not drop
populated columns or run a destructive rollback. The original display names
remain the current application source of truth.

## Tooling

Use the repository's pinned Prisma 7 SQL migration workflow and
[`prisma migrate deploy`](https://www.prisma.io/docs/cli/v7/migrate/deploy).
Do not reset the database, use `db push`, edit applied migrations, or adopt a
different migration format. Inspect pending migrations before deployment.
