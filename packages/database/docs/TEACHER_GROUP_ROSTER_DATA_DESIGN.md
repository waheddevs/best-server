# Teacher group roster lifecycle and summary

## Decision

Teacher group detail needs one authoritative roster projection for the Teacher
workspace. The existing `GroupMembership.endedAt` continues to own membership
history and transfer departure. A new additive `participation_status` column
stores only the state of a current membership:

- `ACTIVE`: the learner currently participates in lessons;
- `PAUSED`: the learner remains in the group and occupies one of the 15 places,
  but participation is temporarily paused.

`DEBTOR` and `DEPARTED` are projections, not mutable database states. A learner
is a debtor when a past-due tuition charge has a positive outstanding balance
after allocations and credit/debit adjustments. A learner is departed when the
membership has a non-null `endedAt`. Projection precedence is `DEPARTED`,
`PAUSED`, `DEBTOR`, then `ACTIVE`, so summary categories never overlap.

## Counts and capacity

- `currentTotal` counts memberships whose `endedAt` is null. It includes active,
  paused, and debtor learners and is the number used for the 15-learner cap.
- `historicalTotal` counts every membership record for the group.
- `departed` counts ended membership records and is not part of `currentTotal`.
- Approved transfer review atomically ends the source membership, creates the
  destination membership, updates the request, and writes one audit record.
  Therefore the source current total decreases immediately and the destination
  current total increases only after its capacity check succeeds.

The requested demonstration distribution has 12 historical learners: 8 active,
1 paused, 2 debtors, and 1 departed. Its current total is therefore 11. Reporting
12 as the current total would contradict the required departure behavior.

## GraphQL ownership

`teacherGroupRosterSummary(groupId)` and `teacherGroupOverview(groupId)` require
an authenticated Teacher and return `NOT_FOUND` unless that Teacher owns the
non-deleted group. `teacherGroupRoster` keeps the same ownership rule and adds a
derived `rosterStatus` plus the outstanding overdue balance. Account status is
retained separately for compatibility; it does not define participation.
`setGroupMembershipParticipationStatus` is the only mutable roster-status API;
it accepts `ACTIVE` or `PAUSED` for a current owned membership and writes an
audit record in the same transaction. `DEBTOR` and `DEPARTED` cannot be set by
this mutation because they remain finance and membership-history projections.

Overview values are derived from source tables on each request:

- published assignments;
- active tests with a published version;
- non-archived lesson materials;
- current memberships.

No duplicate summary counters are persisted.

## Migration and rollback

The migration creates the `GroupMembershipStatus` enum and adds the required
`participation_status` column with an `ACTIVE` default. Existing rows are safely
backfilled by PostgreSQL's additive default.

Rollback before application deployment may drop the column and enum. After the
application writes `PAUSED`, rollback must first decide how those memberships
should be represented because the old schema cannot preserve that distinction.
No membership, transfer, finance, or audit rows are deleted by this migration.

## Fictional development import

The idempotent Teacher roster import accepts an explicit target group id. It
upserts reserved `.example` Student identities, imports the reviewed status
distribution, creates overdue charges only for the two debtor fixtures, and
writes a `TEACHER_GROUP_ROSTER_IMPORTED` audit event. It never selects an
arbitrary group and cannot exceed the current group capacity.
