# Academic practice catalog: Tests 17–48

The original catalog creates 48 papers per fixture IELTS group, but its content
seed only filled Listening, Reading and Writing through Test 16. The remaining
catalog seed fills these missing skills without resetting the database.

## Scope and content

- Existing active `best-lc-academic-test-17` through `-48` papers with the original
  BEST LC source label in active IELTS groups only.
- Listening: four sections, 10 questions each, transcripts, form/table blocks,
  choice/speaker questions and server-side answers/evidence.
- Reading: three passages, 13/13/14 questions, mixed question types, completion
  tables and server-side answers/evidence.
- Writing: two tasks, comparative fictional data and a distinct essay topic.
- Content is original deterministic fictional practice material, using the
  same rendering/scoring templates as Tests 2–16, not official exam content.
- **Listening audio binaries are not included.** Attach audio through the
  existing authorized media workflow; do not bypass scanning or asset readiness.
- Speaking, attempts/results, Tests 1–16, imported General Training papers and
  existing authored versions/drafts are not modified. No schema migration.

## Run from the backend repository root

Requires the existing built database package and the normal local infrastructure.
The script reads `.env` without printing credentials, rejects production and
non-loopback PostgreSQL targets, and defaults to a read-only dry run.

```powershell
node --env-file=.env --experimental-strip-types packages/database/prisma/seed-best-lc-academic-test.ts --remaining-only
node --env-file=.env --experimental-strip-types packages/database/prisma/seed-best-lc-academic-test.ts --remaining-only --apply
```

All 32 content sets and all target papers are validated before writes. A missing
paper or an existing incomplete skill stops preflight instead of overwriting
custom work. Each paper is committed atomically. Unique paper/skill constraints
prevent duplicates; rerunning skips complete skills and safely resumes an
interrupted run. After applying, the seed rereads the database, checks each
skill's published section/question counts, and verifies existing versions were
preserved. A subsequent dry run must report zero missing skills.
