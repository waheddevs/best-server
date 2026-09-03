# Scoring outbox migration

Status: approved as a milestone 6 prerequisite on 2026-09-01.

`20260901020000_scoring_outbox` adds the transactional boundary between final
attempt submission and the Redis-backed scoring queue.

## Contract

- `submitTestAttempt` changes the attempt to `SUBMITTED` and inserts exactly one
  `ATTEMPT_SUBMITTED` outbox event in the same PostgreSQL transaction.
- The payload is explicitly versioned and contains only the attempt ID.
- The relay uses the outbox UUID as the BullMQ job ID. Re-publishing after a
  crash therefore does not create a second queue job.
- Publishing metadata has bounded retry state. Event identity, payload,
  correlation ID, and occurrence time are immutable.
- The scoring consumer is idempotent: only a `SUBMITTED` attempt can transition
  to `SCORED`; an already scored attempt is a successful no-op.

The migration is additive. It does not modify existing attempt rows or enums.
There is no destructive down migration; shared environments require a backup
and forward-fix review.
