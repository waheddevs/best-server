# Teacher student soft deletion

## Decision

Add `DELETED` to the existing `UserStatus` enum. A Teacher may soft-delete a
Student only when the Student has a current membership in one of that Teacher's
active groups. The transaction changes the Student's status to `DELETED`, ends
any current membership, and writes an audit event. It never removes the User,
membership, charge, payment, attempt, or audit rows. Existing Student sessions
become unauthorized through the established active-account checks.

Teacher roster queries and summaries omit deleted Students, including ended
memberships. Group capacity and active learner counts no longer include the
ended membership. Admin audit and explicitly filtered account reads retain the
record. The generic Admin status mutation cannot set or restore `DELETED`;
restoration needs a separately reviewed workflow. An unknown, other-owned, or
already-deleted Student is not exposed to the Teacher.

## Migration and rollback

Apply an additive PostgreSQL enum migration before deploying code that writes
`DELETED`. Existing rows remain unchanged, so no backfill is needed. PostgreSQL
enum removal is not a safe simple rollback: roll back application code if
needed, retain the unused enum value, and use a reviewed forward migration for
any later status-model change. No hard-delete SQL is introduced.
