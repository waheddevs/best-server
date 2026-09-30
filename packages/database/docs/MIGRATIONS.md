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

## Teacher practice catalog migration

`20260926010000_teacher_practice_catalog` adds the positive, group-scoped
`practice_number` identity used by the Teacher Practices card catalog. Existing
papers are backfilled deterministically by academic year, creation time, and
UUID before the column becomes required. A unique index prevents two papers in
the same group from receiving the same display number.

Apply this additive migration before the API version that selects or orders by
`practiceNumber`. Rollback deploys the previous API first and retains the
unused column and constraints. See
`TEACHER_PRACTICE_CATALOG_DATA_DESIGN.md` for pagination, ownership, fixture,
and forward-migration decisions.

`20260929010000_teacher_practice_soft_delete` replaces the legacy archive-state
checks for `tests` and `test_papers` so `DELETED` rows, like `ARCHIVED` rows,
must retain a non-null lifecycle timestamp. It backfills legacy deleted rows
before adding the stricter constraints. Deploy it before enabling
`deleteTeacherPracticeTest`; rollback deploys the prior API first and retains
the stricter, backward-compatible constraints. See
`TEACHER_PRACTICE_CATALOG_DATA_DESIGN.md` for ownership, cascade scope, retained
history, and audit behavior.

## IELTS Teacher authoring blocks migration

`20260928010000_ielts_test_authoring_blocks` extends the existing immutable test
version domain with ordered section blocks, localized block content, explicit
question-group membership, skill-specific section timing/word metadata,
Teacher-only question rationales, and intrinsic media dimensions/duration.
Every change is additive; existing section content and media relations remain
readable during the compatibility period.

Deploy the migration before enabling the expanded Teacher authoring GraphQL
contract. The API must keep published versions immutable, validate block shapes
and same-section question membership, and exclude correct answers, rationales,
and draft metadata from active Student operations. Rollback deploys the prior
API/web first and retains the unused additive schema. See
`IELTS_TEST_AUTHORING_DATA_DESIGN.md` for the full invariants and rollout order.

`20260928020000_ielts_blocks_publish_immutability` is the forward-only follow-up
that attaches the existing published-version immutability boundary to section
blocks, block translations, and question-group membership. It is intentionally
separate because the additive block migration had already been applied locally;
applied migration history is never rewritten.

`20260930010000_accepted_answer_display_value` adds the case-preserving
`display_value` used by Teacher authoring surfaces while retaining
`normalized_value` as the authoritative scoring key. Existing values are
backfilled from matching primary-language evidence text when possible, with the
normalized value as a safe fallback. Deploy this additive migration before the
API version that selects `displayValue`; rollback deploys the previous API and
retains the unused column.

`20260930011000_accepted_answer_display_value_version_backfill` fills remaining
fallback display values from a matching question position and normalized answer
in another version of the same test, preferring published and newer versions.
This keeps cloned drafts visually consistent even when their evidence offsets
were not retained. Rollback leaves the corrected display values in place.

## Teacher finance snapshot migration

`20260929020000_teacher_finance_snapshots` adds a Teacher-owned, monthly
read-only reporting projection used by both Teacher finance surfaces. Whole-UZS
amounts, counts, year/month, and attendance are database-constrained; payment
rate and debt remain derived by the API. The migration does not alter tuition
charges, payments, allocations, or adjustments. See
`TEACHER_FINANCE_SNAPSHOT_DATA_DESIGN.md` for ownership, seed, and rollback.

## easyIELTS test import migration

`20260928030000_easyielts_test_import` adds the required `IeltsModule` paper
classification, backfills existing papers as `ACADEMIC`, and creates immutable
group-scoped `test_import_sources` provenance. General Training imports use
deterministic paper/test/version/section/question identities and never rewrite
existing published Academic content. Apply this migration before running
`import:easyielts-tests` or deploying API fields that select `ieltsModule`.

Rollback deploys the previous API/importer first and retains the additive enum,
column, and provenance table. See `EASYIELTS_TEST_IMPORT_DATA_DESIGN.md`.

## Removed provider-backed generation lifecycle

The historical `20260928040000_gemini_test_generation` and
`20260928050000_gemini_single_skill_generation` migrations must remain in the
immutable Prisma migration chain because they were applied before the feature
was cancelled. `20260928060000_remove_ai_test_generation` drops the isolated
request table and status enum. It does not remove ordinary Teacher-authored or
imported drafts.

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
