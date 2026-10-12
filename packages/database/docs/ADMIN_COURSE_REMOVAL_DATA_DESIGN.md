# Admin course soft deletion

Approved course-table Delete action, 2026-10-12. Add nullable deleted_at to
public_courses; existing records remain visible without a backfill. Retain
publication status, translations, tracks, registrations and unique slugs.
Admin-only adminRemoveCourse checks expectedUpdatedAt and takes the same
transaction advisory lock as editorial saves. Repeated removal is idempotent;
write one PUBLIC_COURSE / CONTENT_DELETED audit event. All course catalogs,
public and admin detail reads, registration and edit/status writers exclude
deleted records. Requests retain their historical course relationship.

Migration is additive and local development only. Rollback application code
without dropping the column or erasing deletion markers. Do not restore deleted
courses through publish/archive. No production deployment or hard deletion.
Integration tests cover authorization, stale versions, persistence, lists,
details, registrations, repeated removal and republishing protection.
