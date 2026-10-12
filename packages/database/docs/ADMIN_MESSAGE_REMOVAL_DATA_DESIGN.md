# Admin Message removal

Approved scope: the owner requested a Delete action in the Admin Messages table on 2026-10-12. Follow the existing Admin Requests soft-delete convention.

Add nullable contact_requests.deleted_at (timestamptz(3)); existing rows remain visible. Retain message content, review note, intake status, and consent. No hard deletes or public intake changes.

The Admin-only adminRemoveMessage mutation validates the message UUID and atomically marks deleted_at and appends a CONTACT_MESSAGE_REMOVED audit event. Repeated or concurrent deletion is idempotent. Missing ids fail. Contact lists and pending-intake counts exclude deleted records; status updates cannot restore a deleted message.

Migration is additive, without a backfill or destructive change. Roll back application readers/writers first and retain the nullable column to preserve removal markers; do not drop data as an automatic rollback. Verify using isolated PostgreSQL integration tests, including role rejection, persistence, list/count exclusion, and audit idempotency.
