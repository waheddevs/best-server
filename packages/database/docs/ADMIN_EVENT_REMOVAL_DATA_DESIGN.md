# Admin event removal and cover editing
The owner requested Events to match Courses/Exams, including delete and creation inputs.
Use nullable deleted_at on public_events, retaining the record, translations, programme,
FAQ, cover relation, slug and all registrations. Admin-only removal validates updatedAt
under the existing per-event advisory transaction lock and audits CONTENT_DELETED once.
Repeat removal is idempotent. All lists, details, cover reads and dashboard upcoming
events exclude removed rows. Save, legacy update, status and registration writers share
the lock and reject removed records. Historical intake keeps its event relation/title.
The additive nullable column needs no backfill. Deploy before API. Rollback keeps the
column and markers; never drop markers or automatically restore hidden events.
Cover editing reuses existing cover_media_id and verified Admin-owned IMAGE uploads.
Unchanged attachments remain editable by other Admins. Public signed cover URLs require
published nondeleted events and READY/CLEAN media; no new media storage mechanism.
Verify authorization, stale revision, concurrent removal, retention, cover visibility,
and rejection of new registrations using reserved integration fixtures.
