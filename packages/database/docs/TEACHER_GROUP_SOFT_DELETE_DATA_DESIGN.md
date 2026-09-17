# Teacher group soft deletion

## Decision

Add `DELETED` to the existing PostgreSQL/Prisma `ContentStatus` enum and extend
the groups archive-state check to accept that status with either archived-at
value. A Teacher
delete operation changes only the owned group's status; it never removes the
row or its audit and related records. Existing `ACTIVE` and `ARCHIVED` groups
keep their current values. No new column or backfill is needed.

The mutation is limited to the authenticated owner. It rejects a group with
active memberships, rejects unknown or other-owned group ids, writes a
`GROUP_DELETED` audit event in the same transaction, and is idempotent when the
owner repeats the request. A deleted group cannot be edited or restored through
the existing archive mutation. Teacher active-group queries and detail routes
exclude it; Admin audit reads may still access the retained row.

## Migration and rollback

Apply the additive enum migration and then the archive-state check migration
before deploying API code that writes `DELETED`. PostgreSQL does not support a simple safe enum-value removal; roll
back the application code if needed, retain the unused enum value, and use a
reviewed forward migration for any later status-model change. Existing data is
untouched. No destructive SQL or group hard-delete operation is introduced.
