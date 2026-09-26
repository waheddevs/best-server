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
  finance source rows, legacy import provenance, and audit rows.

The migration has been applied to local PostgreSQL and its status has been
verified with Prisma. The integration suite additionally verifies the migration
record and reviewed constraints against the configured local database.

## Auth identity migration

`20260901010000_auth_identity_accounts` is an additive migration implementing
the approved milestone 4 identity plan. It adds optional normalized User email
fields, the `AuthProvider` enum, and the token-free `auth_accounts` mapping.

It has been applied successfully from zero in a disposable PostgreSQL database
and to the local `best` database. Provider tokens are deliberately absent, and
database checks enforce normalized email and provider-account identifiers.

## Scoring outbox migration

`20260901020000_scoring_outbox` is an additive milestone 6 migration. It adds a
versioned, immutable-source `outbox_events` record so attempt submission and the
intent to score are committed atomically. Delivery metadata supports bounded
retry, and the event type/aggregate pair prevents duplicate submission events.

See `SCORING_OUTBOX_PLAN.md` for the producer, relay, and idempotent consumer
contract.

## Media object lifecycle migrations

`20260901030000_media_object_lifecycle` is the approved additive step 7B
migration. It adds explicit source, visibility, and lifecycle state to private
object metadata. Pending uploads may omit size and checksum; only the reviewed
`PENDING_UPLOAD -> VERIFYING -> READY/REJECTED` transitions are legal. A ready
object requires verified size and SHA-256 metadata, terminal metadata is
immutable, and domain attachments reject non-ready objects.

Existing media rows are backfilled as ready because the original schema already
required size and checksum. Library-linked rows are backfilled with
`DOMAIN_AUTHORIZED` visibility; other rows remain `OWNER_ONLY`.

`20260901031000_media_object_updated_at_default` is a forward-only alignment
migration. It removes the temporary SQL backfill default from `updated_at` so
the deployed database exactly matches Prisma's `@updatedAt` ownership. No rows
or columns are removed.

`20260901040000_media_malware_scan` adds the `PENDING`, `CLEAN`, and `INFECTED`
malware verdict lifecycle plus scanner/version metadata. Existing ready rows
remain pending and therefore fail closed until explicitly rescanned. New ready
transitions and all domain attachments require a clean verdict; infected
objects become rejected with a bounded threat name.

`20260901041000_fix_media_attachment_trigger` is a forward-only correction for
the attachment trigger's PL/pgSQL variable/column name collision. It changes no
data or schema surface and keeps the `READY + CLEAN` policy intact. The already
applied preceding migration is intentionally not edited.

## Teacher roster participation migration

`20260916010000_group_membership_participation_status` is the additive Teacher
group roster migration. It adds the `GroupMembershipStatus` enum and the
`group_memberships.participation_status` column, backfilling existing rows as
`ACTIVE`. Current totals and capacity continue to use `ended_at IS NULL`; an
ended membership is departed history and never consumes capacity. See
`TEACHER_GROUP_ROSTER_DATA_DESIGN.md` for status precedence and rollback.

## Credential refresh session migration

`20260916020000_credential_refresh_sessions` adds revocable credential sessions
and single-use refresh-token digests. Access tokens remain short-lived; raw
refresh tokens are never persisted. A partial unique index permits one active
refresh token per session, while consumed token rows retain reuse-detection
history. See `CREDENTIAL_REFRESH_SESSION_DATA_DESIGN.md` for rotation,
concurrency, expiry, audit, and rollback decisions.

## Media archive type migration

`20260923030000_media_archive_type` adds `ARCHIVE` to the PostgreSQL
`MediaType` enum so malware-scanned ZIP files can be attached to Teacher lesson
materials and tasks. Existing media rows are unchanged. Rollback should disable
ZIP uploads in application code and retain the unused enum value; removing a
deployed PostgreSQL enum value requires a separately reviewed forward migration.

## BEST LC Academic Test migration

`20260923040000_best_lc_academic_tests` adds the approved paper/skill hierarchy,
version-owned sections, typed response shapes, Teacher review records, and
released Reading/Listening evidence offsets. Existing standalone tests and
single-choice answers remain unchanged. The only relaxed legacy constraint is
that `attempt_answers.selected_option_id` becomes nullable so text, selection,
and private audio responses can use the same versioned attempt lifecycle.

Apply this migration before deploying the expanded API or scoring worker. A
rollback deploys the prior application versions and retains the additive schema;
enum removal or response-data conversion requires a reviewed forward migration.
See `BEST_LC_ACADEMIC_TEST_DATA_DESIGN.md` for ownership, privacy, publication,
and result-release decisions.

`20260923041000_best_lc_academic_publish_rules` is the forward-only follow-up
that replaces the legacy single-choice-only publish check. It validates each
question kind against `objective-v2` or `manual-rubric-v1`, requires paper-owned
sections, and rejects released evidence offsets outside the immutable section
content. The already deployed preceding migration is intentionally unchanged.

## Apply and inspect

With PostgreSQL running and `DATABASE_URL` set in the untracked root `.env`:

```bash
corepack yarn database:migrate:status
corepack yarn database:migrate:deploy
corepack yarn database:test:integration
```

The integration suite covers the expected schema surface, active-membership
uniqueness, immutable published versions, attempt/answer lifecycle, append-only
finance rows, token-free provider identity, and the retained legacy import
constraints. It also covers media lifecycle transitions, terminal immutability, and
`READY + CLEAN` domain attachment. Every test uses a database transaction and
rolls it back, leaving no fixture rows behind.

## Recovery

There is no automatic down migration. Before a shared deployment, take a backup
and review a forward-fix plan. For a disposable local database only, recreate
the local database and rerun `database:migrate:deploy`; never use that recovery
method on shared or production data.

Never edit a migration after it has been deployed to a shared environment.
