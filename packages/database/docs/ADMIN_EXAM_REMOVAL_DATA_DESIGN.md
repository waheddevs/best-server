# Admin exam removal

The owner requested Exams to match Courses, including its delete action (2026-10-12).
Use the same retained-record design: nullable deleted_at on public_exam_offerings.
An authenticated operational Admin confirms removal using the catalog revision.
Under the existing public-exam-write advisory transaction lock, validate revision,
set deleted_at and append EXAM_DELETED exactly once. Repeated removal is idempotent.
Retain offering status, translations, sessions and all registrations; reserve its key.
Exclude removed offerings from public and Admin catalogs, session directories,
session selectors and dashboard upcoming sessions. Block new registrations, edits,
publication and session writes. Historical intake still resolves the original title.
Registration and all exam writers share the lock, preventing racing new registrations.

Migration is additive, nullable, no backfill and no record deletion. Deploy before
API code. Rollback application while retaining the column and markers; do not drop
the column or restore removed content automatically. Verify with reserved-data
PostgreSQL integration tests for authorization, conflicts, retention and visibility.
