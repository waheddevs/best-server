# BEST data model approval plan

Status: approved through the step-by-step product review on 2026-09-01 and
implemented in the logical ERD and initial Prisma schema. Telegram import was
removed from the backend plan on 2026-09-03. Its already-deployed tables remain
legacy metadata until a separate cleanup migration is reviewed and approved.

This document separates confirmed storage invariants from product decisions that
must be approved before the first Prisma model or migration is created.

## Confirmed invariants

- PostgreSQL is the transactional source of truth.
- Foreign keys, unique constraints, checks, and indexes enforce relational
  invariants in the database.
- Redis is queue/cache infrastructure and never stores authoritative users,
  answers, attempts, or results.
- Published tests are immutable versions; every attempt references exactly one
  version.
- Uzbek, Russian, and English publication content uses translation tables.
- Media binaries stay in S3-compatible object storage; PostgreSQL stores stable
  keys, metadata, ownership, and visibility state.
- JSONB is limited to variable source payloads and structured provider output.
- Changes that must enqueue work reliably use a transactional outbox.
- Audit and correlation context must survive request, transaction, and job
  boundaries.

## Decisions required for the first ERD

1. Identity: Auth.js account/session ownership and one-person/multiple-identity
   behavior.
2. Organization: learning-center, branch, cohort/group, enrollment, and
   Teacher-to-Student membership rules.
3. Test authoring: test categories, supported question types, reusable question
   banks, translations, and publication/version workflow.
4. Attempts: start/submit/expire lifecycle, retry policy, answer revision,
   timing, and immutable submission snapshot rules.
5. Scoring: per-question score representation, partial credit, pass rules, and
   score versioning inputs.
6. Library/media: content taxonomy, visibility, ownership, translation, and
   attachment relationships.
7. Results/progress: aggregation boundaries, historical recomputation, and
   Teacher/Admin visibility.
8. Finance: Student charges, payments, balances, periods, adjustments, and
   Admin visibility.
9. Audit/retention: events that require audit records, retention periods,
   deletion/anonymization, and operational access.

## Approved product decisions

### Identity and roles

- Each user has exactly one assigned role: `STUDENT`, `TEACHER`, or `ADMIN`.
- Roles are server-owned and cannot be selected by the client.
- The approved milestone 4 provider-account and session ownership decisions are
  recorded in `AUTH_IDENTITY_PLAN.md`.
- PostgreSQL identity is backend-owned. Auth.js remains in the web application,
  which never connects directly to this database.
- Google, Facebook, and Apple identities use a unique provider/account tuple;
  provider tokens are not stored and matching email never links accounts
  automatically.
- Social provisioning creates only a `STUDENT`. Teacher and Admin verification
  remains deferred.
- A future test-only access mechanism may allow the owner's account to exercise
  all three access levels. Its authorization and audit design is deferred to the
  auth milestone; it does not make ordinary users multi-role.
- The current `ADMIN` role primarily manages users, Teachers, Students, groups,
  and finance data.
- A future `SUPER_ADMIN` role will control every user type; it is deferred and
  is not part of the first schema.

### Organization

- The current product serves one BEST learning center.
- The first schema does not include a `Branch` model or branch membership.
- Multi-branch support is deferred until there is a confirmed product need.
- A Teacher may be assigned to multiple groups.
- A Student belongs to exactly one active group at a time.
- Group membership history is retained when a Student changes groups.
- The first release operates with one real Teacher account; no fake Teacher or
  seed data is added.
- The Teacher may create and own any number of groups.
- Each group has exactly one owning Teacher in the first schema.
- The real Teacher and group records will be added separately after the schema
  is approved.
- Groups are archived instead of hard-deleted so membership and learning
  history remain intact.
- The owning Teacher may restore an archived group.

### Test authoring

- The first release supports single-choice questions only.
- Each question has exactly one correct answer option.
- Multiple-choice and free-text question types are deferred.
- Every test has one required primary language.
- Uzbek, Russian, and English translations are optional.
- Students may select only a translation that exists for that test.
- New tests start in `DRAFT` state and remain editable by their Teacher.
- Publishing creates an immutable `PUBLISHED` version.
- Editing published content creates a new version instead of changing historical
  content.
- Tests are archived instead of hard-deleted.
- Every test belongs to exactly one group.
- A test is visible only to Students who are active members of that group.
- The same test is not shared across multiple groups; another group receives its
  own test.
- A Teacher may set optional availability start and end times.
- Without a start time, a published test is available immediately.
- Without an end time, it remains available until archived.
- Questions belong to one test version and are not shared through a common
  question bank in the first release.
- Reuse is performed by copying a question or test into a new draft.
- The initial test categories are `Grammar`, `Vocabulary`, and `Reading`.
- A Teacher may create additional categories.
- Each test has one category.

### Attempts

- Each Student receives one attempt by default.
- A Teacher may configure a higher attempt limit for a test.
- A Teacher may grant an additional attempt to one specific Student without
  changing the test-wide limit.
- A test may have an optional duration limit.
- The duration countdown starts when the Student starts an attempt.
- When time expires, the latest saved answers are submitted automatically.
- A Student may revise answers until final submission.
- Each answer selection is saved as the attempt progresses.
- Submitted answers and their test-version snapshot are immutable.
- An in-progress attempt can be resumed after a browser close or connection
  interruption.
- Its duration countdown continues while the Student is disconnected.
- Resuming the same active attempt does not consume another attempt.
- When the test availability end time arrives, every active attempt is submitted
  automatically even if its individual duration has not expired.

### Scoring

- Each correct answer earns one point.
- An incorrect or unanswered question earns zero points.
- Questions do not have different weights in the first release.
- Results store and display the correct-answer count, total-question count, and
  percentage.
- The default passing threshold is 60 percent.
- A Teacher may configure a different passing threshold per test.
- Each submitted attempt is classified as `PASSED` or `FAILED` using the
  threshold stored with that test version.
- All submitted attempts remain in history.
- A Student's highest percentage is the primary result for a test.
- A Teacher may inspect every individual attempt.
- After submission, a Student immediately sees points, percentage, and
  `PASSED`/`FAILED` status.
- Correct answers and detailed answer review remain Teacher-only.
- The scoring-rule version and scoring inputs are stored with the immutable test
  version so later rule changes do not alter historical results.

### Library and media

- The first release supports PDF, image, audio, and video library objects.
- A library object may be shared with multiple groups and is not duplicated for
  each group.
- `ALL_GROUPS` visibility includes every current and future group.
- `SELECTED_GROUPS` visibility includes only groups selected by the Teacher.
- A Teacher may create library categories.
- Every library object belongs to exactly one category.
- Every library object has one required primary language.
- Uzbek, Russian, and English title and description translations are optional.
- Library objects are archived instead of immediately deleted and become hidden
  from Students.
- A Teacher may restore an archived library object.
- The underlying storage object is retained until a separately authorized
  permanent-deletion policy removes it.
- One library object may contain multiple ordered file attachments of the
  supported media types.
- New attachments accept only owner-matched media with both `READY` lifecycle
  state and a terminal `CLEAN` malware verdict.
- Scanner engine/version/signature metadata is retained for auditability;
  infected media is rejected and never exposed through Library reads.

### Retired Telegram import design

The earlier one-time Telegram import decision is canceled. No TDLib client,
Telegram credential/session handling, queue, worker processor, or API will be
implemented. `TelegramImportRun` and `TelegramImportRecord` remain unused
legacy tables because removing deployed schema requires a separately reviewed
destructive migration. New application code must not depend on them.

### Results and progress

- A Student sees only their own test results and progress.
- The Student dashboard shows each test result, highest score, all attempt
  history, `PASSED`/`FAILED` status, and overall test-completion percentage.
- A Teacher sees per-group averages, per-Student progress, submitted and missing
  tests, every attempt and selected answer, and highest and lowest results.
- When a Student changes groups, historical results remain attached to the
  group membership and test context in which they were earned.
- Old results remain in the Student's personal history and the previous group's
  reports, but do not contribute to the new group's progress.
- An Admin may see aggregate academic statistics and Student scores for
  operational oversight.
- Selected answers, detailed answer review, and correct answers remain
  Teacher-only and are not visible to Admins.
- Current Student progress counts active group tests whose published
  availability has started. Submitted/scored tests are completed; score
  aggregates use the highest scored attempt per test and are derived rather
  than persisted in a duplicate summary table.
- Teacher group reports use current active memberships for current progress,
  while attempt history remains selected by the attempt's immutable
  `groupMembershipId`. This keeps a departed Student's results in the previous
  group without counting them in a new group's progress.
- Teacher aggregate averages, highest, and lowest values use one best scored
  attempt per Student/test assignment. Detailed selected/correct-answer review
  is authorized through the owning group and is never exposed to Student or
  Admin result contracts.
- Admin academic overview and group monitoring derive current assignments from
  active groups, active tests with started published versions, and active group
  memberships. The global overview is aggregated in PostgreSQL so its memory
  cost does not grow with attempt history.
- Admin Student monitoring may include inactive accounts and historical scored
  attempts for operational traceability. It exposes scores and original group
  context but never selected options, correct options, or question review.

### Finance

- Each group has a default monthly tuition amount.
- An Admin may set a Student-specific tuition amount that overrides the group
  default.
- Admins record received payments manually.
- The system derives outstanding debt or prepaid credit from immutable charges,
  payments, and adjustments.
- Finance uses only Uzbek soʻm (`UZS`) in the first release.
- Monetary amounts are stored as whole soʻm values without fractional units.
- A monthly tuition charge is generated for each active Student.
- Each group has a recurring day-of-month payment deadline.
- An unpaid balance after that deadline is marked overdue.
- Supported payment methods are `CASH` and `CARD` only.
- Each payment records its amount, payment date, optional note, and the Admin who
  entered it.
- A `CARD` payment may include an optional receipt image or transaction
  reference.
- Partial payments are allowed and leave the unpaid remainder as debt.
- Overpayments remain as Student credit and are applied to future charges.
- Charges and payments are not hard-deleted or silently edited.
- Corrections use a reasoned reversal or adjustment entry while preserving the
  original record for audit.
- A Student sees only their own balance, debt, credit, and payment history.
- An Admin sees and manages finance data for every Student.
- A Teacher has the same finance-management capabilities as an Admin, but only
  for Students in groups they own.
- Teacher finance capabilities include tuition configuration, payment entry,
  receipt attachment, balance review, reversals, and adjustments.

### Audit and retention

- Important role, group, test, result, library, and finance changes create an
  audit record.
- Audit records identify the actor, timestamp, action, old and new values, and
  any required correction or reversal reason.
- Departed Student and Teacher accounts become `INACTIVE` instead of being
  deleted.
- Inactive accounts cannot sign in, retain their academic, group, and finance
  history, and may be reactivated.
- Audit, academic-result, and finance history is not deleted automatically in
  the first release.
- Permanent deletion or anonymization is deferred to a separately approved,
  audited `SUPER_ADMIN` workflow.

## ERD deliverables after approval

- Domain-grouped logical ERD with cardinalities and ownership.
- PostgreSQL physical names, primary/foreign keys, checks, unique constraints,
  and indexes.
- Prisma schema using explicit relation names and database mappings.
- Reviewed initial migration with rollback and local reset guidance.
- Integration tests for constraints, transactions, and immutable test versions.

No product table should be inferred solely from a frontend shape or placeholder
endpoint. The approved decisions above are the contract for the first schema.
