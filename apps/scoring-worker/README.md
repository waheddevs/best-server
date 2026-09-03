# Scoring worker

The scoring worker is a NestJS standalone application context with no HTTP
listener. It owns three runtime boundaries:

- `outbox/expired-attempt-submitter.service.ts` atomically submits attempts whose
  server deadline has passed;
- `outbox/scoring-outbox-relay.service.ts` publishes pending PostgreSQL events
  to the Redis-backed `test-scoring` BullMQ queue using the outbox UUID as the
  idempotent job ID;
- `scoring/scoring.processor.ts` validates the versioned job and delegates to
  `scoring/scoring.service.ts`, which invokes `@best/scoring` and persists the
  result exactly once.

Jobs retry five times with exponential backoff. Completed and failed jobs are
retained with bounded counts for operations. Event and job logs contain IDs and
safe error names, never answers or correct-answer data.

The integration test creates a disposable PostgreSQL database, uses the local
Redis service, verifies normal and expired attempt scoring, removes its queue
jobs, and drops the disposable database.
