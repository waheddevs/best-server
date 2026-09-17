# Section 8 data design

Status: approved and implemented on 2026-09-04. The migrations are additive.
Payment/finance, Telegram import changes, AI evaluation, frontend wiring, and
production hardening are outside this section.

## Ownership and lifecycle decisions

- A User owns editable profile metadata. An avatar must be an owned
  `READY + CLEAN` image. Admin status/role changes require a reason and audit.
- A Group has one Teacher, a stable unique slug, room, IANA time zone, and ISO
  weekday/minute schedule. A Student has at most one active membership.
  Transfers are durable requests and only Admin approval moves membership.
- A Teacher owns tests through their Group. Only `DRAFT` versions are editable.
  Publishing checks translations, questions, options, exactly one correct
  option, settings, and scoring-rule version. Published versions stay immutable.
- A Lesson belongs to one Group and stores UTC start/end instants. Overlapping
  Teacher lessons are rejected by the service. Attendance references the
  historical membership and is unique per lesson/Student; corrections are
  reasoned and audited.
- A LessonMaterial references an existing authorized Library item instead of
  copying file metadata. An Assignment is draft, published, then closed. One
  Student submission is resubmittable while open; review stores score/feedback.
- Public courses/events use stable slugs and normalized translation rows.
  Public forms require consent and return a neutral receipt. PII and review
  notes are Admin-only. Duplicate event registration is blocked per phone.
- Teacher dashboard numbers are derived from authoritative rows. Manual tasks
  are durable. Notifications are idempotent by recipient/event key and polling
  is the required delivery fallback.
- Operational Admin lists are bounded and cursor-paginated. Audit output omits
  raw JSON values. Audit rows remain append-only.

## Teacher group category extension (2026-09-15)

Teacher-created groups have one of `IELTS`, `CEFR`, or `GENERAL_ENGLISH` as a
persisted category. The teacher may create and update only groups they own;
existing role and ownership guards remain authoritative. Existing groups are
left with a null category rather than assigned a potentially incorrect one.
New group creation requires a category, while an older group's category can be
set when it is edited. The category is included in read results and audit
values. This is an additive nullable enum column; rollback can drop the column
and enum after first exporting its values. No existing rows are removed.
The migration is `20260915010000_teacher_group_category` and has no data
backfill. Apply it before deploying API code that selects the category column.

## Database enforcement

`20260904010000_user_profiles` adds profile metadata and avatar ownership.
`20260904020000_groups_memberships_transfers` adds group scheduling and the
transfer workflow. `20260904030000_learning_public_notifications` adds lessons,
attendance, materials, assignments/submissions, public content/intake, tasks,
and notifications, with foreign keys, unique indexes, time/content/score checks.

Media binaries remain outside PostgreSQL. Existing finance and legacy import
tables are not exposed by Section 8 and are not destructively removed.
