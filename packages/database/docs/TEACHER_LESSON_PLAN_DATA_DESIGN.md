# Teacher lesson-plan data design

## Scope

This additive change supports the connected Teacher group workspace without
changing the Assignments UI. A lesson plan remains a `Lesson`; its uploaded
material and task files remain private `MediaObject` records exposed through
the existing Library authorization boundary and linked by `LessonMaterial`.

## Ownership and authorization

- Only the Teacher who owns the active group may list, create, edit, or archive
  its lesson plans.
- Uploaded media must already be `READY`, malware-clean, and owned by that
  Teacher before it can be attached.
- A linked Library item uses `GROUPS` visibility and one `LibraryGroupAccess`
  row for the owning group. Student downloads therefore keep the existing
  active-membership check and signed-download flow.
- Archive is soft deletion. `Lesson.archivedAt` is set and the record remains
  available for audit/history while normal Teacher lists omit it.

## Additive fields

- `Lesson.lessonNumber` is a positive, group-scoped stable sequence. Existing
  rows are backfilled by `startsAt`, then `id`. New numbers are allocated while
  holding a transaction-level advisory lock for the group. Archived lessons do
  not cause later lessons to be renumbered.
- `Lesson.archivedAt` records soft deletion.
- `LessonMaterial.kind` distinguishes `MATERIAL` from `TASK`. This lets the
  future Assignments session consume task resources without changing its UI in
  this phase.

## File storage

Binary files are not stored in PostgreSQL or a public web folder. The existing
provider-neutral private S3 flow creates the storage key, uploads by short-lived
signed URL, verifies the MIME signature and size, scans for malware, and stores
only object metadata/path in PostgreSQL. Accepted lesson-plan files are PDF,
JPG/JPEG, PNG, and ZIP. ZIP uses the general 50 MiB limit, requires a valid ZIP
file signature, and passes through the same malware scan before becoming
available to a lesson material or task.

## Compatibility and rollout

The lesson-plan migration only adds nullable columns first, backfills them, and
then adds the required constraints/default. Existing `LessonMaterial` rows
become `MATERIAL`. ZIP support adds the `ARCHIVE` value to the existing
`MediaType` PostgreSQL enum without changing existing media rows. Existing
lesson and material APIs remain compatible; new fields and the atomic
lesson-plan mutation are additive.

## Rollback

Application rollback is safe while the new columns remain present. A database
rollback may drop the unique/check constraints, the three columns, and the
`LessonMaterialKind` enum only after code no longer reads them. Media objects
and Library items are retained; permanent object deletion is out of scope.
PostgreSQL enum values do not have a safe simple removal path after deployment;
if ZIP support is rolled back, deploy application code that stops accepting ZIP
and retain the unused `ARCHIVE` value until a separately reviewed forward
migration can rebuild the enum safely.
