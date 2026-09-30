# Teacher finance snapshot data design

Status: approved for implementation on 2026-09-29.

## Scope

The Teacher Finance page and the finance card on the Teacher Dashboard read the
same monthly, read-only aggregate. The aggregate contains collected and expected
tuition, operational expenses, penalties, active learner/group counts, and the
attendance rate for one Teacher and calendar month.

This model does not create or execute payments. Student charges, payments,
allocations, and adjustments remain authoritative ledger records. The snapshot
is a reporting projection for values that the current ledger cannot represent,
including expenses and the historical attendance percentage.

## Ownership and invariants

- `TeacherFinanceSnapshot.teacherId` owns the record and references `User`.
- `(teacherId, year, month)` is unique.
- Years start at 2018, months are 1 through 12, money and counts are non-negative,
  and attendance is between 0 and 100.
- Money uses whole UZS `BIGINT`; GraphQL exposes money as strings to avoid the
  32-bit GraphQL `Int` limit.
- Payment rate and debt are derived when reading: `income / expected` and
  `max(expected - income, 0)`. They are not stored twice.
- The GraphQL query resolves the Teacher from the authenticated request. It
  accepts only a year, never a client-supplied Teacher id.

## Seed and rollout

`seed:teacher-finance` copies the approved fictional June-August 2026 preview
values into PostgreSQL for the configured local Teacher. It is idempotent and
refuses non-loopback databases and production.

Deploy the additive migration before the API exposing `teacherFinanceSnapshots`.
Rollback deploys the previous API first and leaves the unused reporting table in
place. Removing it would require a separately reviewed forward migration.
