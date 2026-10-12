# Admin request removal

The owner requested a working Remove action in Requests on 2026-10-11.
Implementation uses nullable deletedAt timestamps on the existing CourseRegistration,
EventRegistration and ExamRegistration rows. No business data is physically deleted.
Admin-only removal validates kind/id and expectedUpdatedAt, locks the request, and
writes REQUEST_REMOVED in the same transaction. Repeated removal returns the same id.
Removed requests cannot be reviewed and are excluded from intake lists, pagination,
status metrics and overview queues. Contact messages are outside this change.
Existing registration receipts, unique phone constraints and seat reservations remain
intact: removing an administrative request is not a public reservation cancellation.
Additive nullable-column migration needs no backfill. Deploy it before the API/web.
Rollback keeps the columns and retained rows; an old API can show removed rows again.
Integration tests use isolated fictional fixtures and verify persistence and role checks.
