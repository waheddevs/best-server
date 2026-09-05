# Steps 8 and 9 delivery plan

Status: Step 8A through 8K were implemented on 2026-09-04. Step 9 remains a
planning record and requires a separate review. Payment/finance and AI
evaluation remain separately approved step 10 tracks.

## Scope boundary

Step 8 completes the current BEST product API surface visible in the public,
Student, Teacher, and operational Admin applications. "All APIs" means the
domain operations listed in this document, not speculative integrations or a
generic CRUD endpoint for every database table.

The following remain excluded from steps 8 and 9:

- payment collection, payment methods, tuition, balances, debt, receipts,
  allocations, reversals, finance adjustments, and external payment providers;
- AI grading, transcription, model calls, and AI workers;
- Telegram/TDLib import, which the user postponed for a revised import design;
- backend OAuth provider callbacks, which remain owned by Auth.js in the web
  application;
- permanent deletion, `SUPER_ADMIN`, and unreviewed account anonymization;
- frontend GraphQL wiring and code generation, which happen after the backend
  contract is accepted.

Existing PostgreSQL finance tables are not exposed or expanded before step 10.
Before group creation is implemented, step 8E must review how the currently
required `Group.paymentDeadlineDay` column is decoupled from the non-payment
group contract. Any change must be additive and migration-reviewed.

## Rules for every step 8 subphase

Each subphase must be completed vertically rather than creating all schemas
first and filling behavior later:

1. Document and approve data ownership, lifecycle, invariants, and access.
2. Review the existing Prisma schema and create only necessary additive
   migrations.
3. Add domain-owned code-first GraphQL objects and inputs under
   `apps/api/src/schemas/<domain>`.
4. Keep resolvers thin, rules in services, and persistence in focused domain
   providers or repositories.
5. Enforce Student ownership, Teacher group ownership, Admin scope, inactive
   user rejection, bounded inputs, and non-disclosing `NOT_FOUND` behavior.
6. Use cursor pagination for growing lists and transactions for multi-row
   writes.
7. Add audit records for privileged and lifecycle-changing mutations.
8. Add unit and PostgreSQL-backed GraphQL integration tests, regenerate the
   sorted schema, and run all repository checks.
9. Review the subphase report before starting the next subphase.

No generic `createItem`, `updateData`, or table-shaped administration API is
allowed. Operation names must describe the domain action.

## Step 8 — product API completion

### 8A — Student Progress (complete)

- `studentProgress`
- Current-group assignment completion and best-per-test score aggregates
- Student-only authorization and historical membership isolation

### 8B — Teacher Results (complete)

- `teacherGroupProgress`
- `teacherGroupStudents`
- `teacherStudentTests`
- `teacherStudentAttempts`
- `teacherAttemptReview`

### 8C — Admin academic monitoring (complete)

- `adminAcademicOverview`
- `adminGroupProgresses`
- `adminStudents`
- `adminStudentResults`

Admin result views remain aggregate/history views and never expose selected or
correct answers.

### 8D — identity, profiles, and operational users

Purpose: replace remaining profile preview data and give Admins safe account
lifecycle controls without moving Auth.js provider callbacks into NestJS.

Planned queries:

- `myProfile`
- `adminUsers(first, after, role, status, search)`
- `adminUser(userId)`

Planned mutations:

- `updateMyProfile(input)` for explicitly approved editable profile fields
- `adminSetUserStatus(input)` to activate or deactivate an account with a
  mandatory reason
- `adminSetUserRole(input)` only after role-transition invariants and audit
  effects are reviewed

Data review must decide phone, avatar media, preferred language, Teacher
subject/branch metadata, and safe provisioning. Password changes, provider
token management, browser session lists, refresh tokens, and account deletion
are not silently implied by profile screens.

### 8E — groups, memberships, and transfers

Purpose: replace Teacher group/roster previews and provide complete
ownership-safe membership lifecycle behavior.

Planned queries:

- `teacherGroups(first, after, status, search)`
- `teacherGroup(groupId)`
- `teacherGroupRoster(groupId, first, after, status, search)`
- `studentCurrentGroup`
- `adminGroups(first, after, status, teacherId, search)`
- `adminGroup(groupId)`
- `teacherTransferRequests(first, after, status)`

Planned mutations:

- `createTeacherGroup(input)`
- `updateTeacherGroup(input)`
- `setTeacherGroupArchived(input)`
- `addStudentToGroup(input)`
- `endGroupMembership(input)`
- `requestStudentTransfer(input)`
- `reviewStudentTransfer(input)`

The data review must define group schedule/room fields, one-current-membership
rules, transfer approval ownership, concurrent transfer protection, history
retention, and the temporary removal of payment configuration from group
creation. Membership and transfer writes must be transactional and audited.

### 8F — Teacher test authoring and attempt grants

Purpose: complete the authoring side of the already implemented Student test
runner.

Planned queries:

- `teacherTestCategories`
- `teacherTests(groupId, first, after, status, search)`
- `teacherTestDraft(testId)`
- `teacherTestVersion(testVersionId)`
- `teacherAttemptGrants(testId, first, after)`

Planned mutations:

- `createTestCategory(input)`
- `updateTestCategory(input)`
- `createTestDraft(input)`
- `updateTestDraftSettings(input)`
- `replaceTestDraftTranslations(input)`
- `createTestQuestion(input)`
- `updateTestQuestion(input)`
- `reorderTestQuestions(input)`
- `deleteTestDraftQuestion(input)`
- `publishTestVersion(input)`
- `createNextTestVersion(input)`
- `setTestArchived(input)`
- `grantAdditionalTestAttempt(input)`

Publishing must validate translations, question/option completeness, exactly
one correct option for the initial single-choice rule, availability, duration,
attempt limits, and scoring rule version in one transaction. A published
version is immutable; editing creates a new draft version. Student operations
must continue to omit correct-answer fields.

### 8G — lessons, schedule, and attendance

Purpose: support Teacher group lessons, lesson details, reception schedule,
attendance, and Student schedule views.

Planned queries:

- `teacherSchedule(from, to)`
- `teacherGroupLessons(groupId, first, after, status)`
- `teacherLesson(lessonId)`
- `studentSchedule(from, to)`
- `studentLesson(lessonId)`
- `teacherAttendance(lessonId)`

Planned mutations:

- `createLesson(input)`
- `updateLesson(input)`
- `setLessonStatus(input)`
- `recordLessonAttendance(input)`

Required data design includes lesson translations, start/end timestamps,
room, lifecycle, attendance status per membership, uniqueness, time-zone
handling, and conflict policy. Reception is a filtered schedule view, not a
duplicate source of truth. Completed attendance remains historical and
corrections require an audit reason.

### 8H — lesson materials, assignments, and submissions

Purpose: support the Teacher group workspace and the corresponding Student
learning flow.

Planned queries:

- `teacherGroupMaterials(groupId, first, after)`
- `teacherGroupAssignments(groupId, first, after, status)`
- `teacherAssignment(assignmentId)`
- `teacherAssignmentSubmissions(assignmentId, first, after, status)`
- `studentAssignments(first, after, status)`
- `studentAssignment(assignmentId)`

Planned mutations:

- `createLessonMaterial(input)`
- `updateLessonMaterial(input)`
- `setLessonMaterialArchived(input)`
- `createAssignment(input)`
- `updateAssignment(input)`
- `publishAssignment(input)`
- `closeAssignment(input)`
- `submitAssignment(input)`
- `reviewAssignmentSubmission(input)`

The data review must decide whether a lesson material references an existing
Library item or owns separate metadata, and must define assignment
translations, deadlines, publication, submission attempts, review state, and
late-submission policy. Files use the existing verified `READY + CLEAN` media
lifecycle; binaries never enter PostgreSQL.

### 8I — public courses, events, and intake forms

Purpose: replace static public content where it must be managed by the backend
and persist real visitor submissions.

Planned public queries:

- `publicCourses(first, after, language)`
- `publicCourse(slug, language)`
- `publicEvents(first, after, language)`
- `publicEvent(slug, language)`

Planned public mutations:

- `submitContactRequest(input)`
- `submitExamRegistration(input)`
- `registerForEvent(input)`

Planned Admin operations:

- course draft/create/update/publish/archive operations;
- event draft/create/update/publish/archive operations;
- cursor-paginated contact, exam-registration, and event-registration review;
- explicit status transitions for intake records.

Required data design includes translations, stable slugs, publication windows,
media references, consent, duplicate prevention, retention, anti-spam fields,
and PII access. Public response types must never reveal internal review notes
or whether a matching person already exists.

### 8J — tasks, transfers, notifications, and dashboard read models

Purpose: replace remaining Teacher dashboard preview data without creating a
second source of truth.

Planned queries:

- `teacherDashboard`
- `teacherTasks(first, after, status, kind)`
- `myNotifications(first, after, unreadOnly)`
- `myUnreadNotificationCount`

Planned mutations:

- `completeTeacherTask(input)` when the task is not purely derived
- `markNotificationRead(input)`
- `markAllNotificationsRead`

Schedule, result, membership, attendance, assignment, and Library metrics are
derived from authoritative domain rows. The data review must decide which
tasks are durable workflow records and which are computed warnings.
Notifications require versioned event payloads, idempotent delivery, bounded
retry/backoff, and a dead-letter path. Subscriptions remain optional; polling
is the required fallback.

### 8K — operational Admin, Library oversight, and audit

Purpose: complete the non-payment operational controls required to run the
platform.

Planned queries:

- `adminOperationalOverview`
- `adminLibraryItems(first, after, status, ownerId, search)`
- `adminMediaObjects(first, after, status, malwareStatus, ownerId)`
- `adminAuditLogs(first, after, actorId, action, targetType, from, to)`

Planned mutations:

- `adminSetLibraryItemArchived(input)` with a mandatory reason
- `adminRejectMediaObject(input)` with a mandatory reason
- narrowly scoped retry/recovery operations for approved failed media or
  notification jobs

Audit output must be redacted, cursor-paginated, and Admin-only. Audit rows are
append-only. Admins do not receive Student answer selections, correct answers,
provider credentials, raw authorization headers, or unrestricted JSON
payloads. Permanent deletion remains outside this step.

### Step 8 completion gate

Step 8 is complete only when:

- every 8D–8K data decision and migration has been reviewed;
- every listed operation has its role/ownership matrix and bounded input;
- all privileged mutations write an audit record in the same transaction;
- generated `schema.graphql` contains only accepted fields;
- unit, database integration, GraphQL integration, worker, and end-to-end
  backend journeys pass;
- placeholder services for implemented domains have been replaced, while
  payment/finance and AI remain intentionally dormant;
- the user reviews the final API and changed-file report before step 9 starts.

## Step 9 — production hardening

Step 9 adds no new product domain. It makes the accepted step 8 contract safe,
observable, recoverable, and deployable.

### 9A — API security controls

- Strict environment-specific CORS allowlist and security headers
- GraphQL body, depth, complexity, alias, root-field, and execution-time limits
- Per-IP and authenticated-user rate limits with stricter public-form limits
- Named-operation enforcement; persisted-operation safelisting evaluated after
  frontend operations stabilize
- Production GraphiQL/introspection disabled and error masking regression-tested
- Upload/download expiry, replay, ownership, MIME, checksum, and malware tests
- Threat-model tests for role escalation, ID enumeration, ownership bypass,
  query abuse, and correct-answer leakage

### 9B — authentication and secret operations

- Production secret-manager contract and documented key rotation
- Auth.js identity-exchange issuer/audience/algorithm/origin verification
- Access-token rotation/expiry operational procedure
- No browser token persistence and no token/credential logging
- Refresh-token/session persistence remains a separate design and is added only
  if the chosen frontend deployment proves it is required

### 9C — observability and operational endpoints

- Thin `/health/live` and `/health/ready` HTTP endpoints outside GraphQL
- Readiness checks for PostgreSQL, Redis, object storage, malware scanner, and
  required worker dependencies
- `/metrics` or an equivalent protected scrape endpoint selected during the
  deployment review
- Request ID propagation through GraphQL, Prisma transaction audit context,
  outbox events, BullMQ jobs, and worker logs
- Metrics for GraphQL latency/errors, authorization failures, database pool and
  slow queries, queue depth/age/retries, scoring latency, media failures, and
  worker health
- Alert thresholds and dashboards without committing to a vendor prematurely

### 9D — reliability and recovery

- Bounded BullMQ retries, exponential backoff, timeouts, idempotency, and
  dead-letter recovery for every active queue
- Outbox backlog recovery and duplicate-delivery tests
- Graceful API/worker shutdown and deploy-time drain behavior
- PostgreSQL backup automation, restore drill, retention, and evidence
- Reviewed migration deploy/rollback/run-forward procedures
- Object-storage durability, lifecycle, and recovery procedure

### 9E — performance and capacity

- Query-plan review and indexes for growing Student, Teacher, Admin, audit, and
  operational lists
- Request-scoped batching where relational field resolution can create N+1
  reads
- Load tests for concurrent login exchange, catalogue reads, autosave,
  submission, scoring bursts, reports, uploads, and public forms
- Explicit latency/error objectives and initial capacity limits
- Cache, replicas, pooling, partitioning, and CDN introduced only from measured
  evidence

### 9F — CI/CD and deployment

- Reproducible production images for API and scoring worker
- CI for format, lint, strict typecheck, schema generation/diff, unit tests,
  database/GraphQL/worker integration tests, migration validation, builds, and
  dependency/container scanning
- Separate typed local, test, staging, and production configuration
- Staging smoke/contract tests and production deployment order
- Backward-compatible migration-first rollout, feature flags where needed,
  rollback/run-forward decision points, and operational runbooks
- Software bill of materials and pinned/reviewed runtime images

### Step 9 completion gate

Step 9 is complete only when a staging-like environment demonstrates:

- all CI gates passing from a clean checkout;
- no known critical security finding;
- successful backup restore and queue/outbox recovery drills;
- accepted load-test targets without authorization or data-consistency failure;
- health, metrics, logs, alerts, deploy, rollback/run-forward, and incident
  runbooks working together;
- final user review before frontend connection or production release.

## Step 10 — separately approved future work

### 10A — payments and finance

All payment and finance behavior is deferred here: tuition rules, charges,
balances, debt/credit, payment-method policy, manual or provider-backed payment
entry, receipts, allocation, reconciliation, reversal, adjustment, refunds,
webhooks, idempotency, fraud controls, and finance reporting. Existing finance
tables are treated as unexposed design input, not a completed contract.

Before implementation, step 10A requires a fresh review of business ownership,
supported payment methods/providers, legal and accounting requirements,
security, audit, reconciliation, migration compatibility, and frontend flows.

### 10B — AI evaluation

AI grading and transcription remain separately gated. Requirements, privacy,
rubrics, model/provider, cost limits, confidence handling, human review,
teacher override, immutable evidence, and audit behavior must be approved
before any schema, queue, worker, or model integration is added.
