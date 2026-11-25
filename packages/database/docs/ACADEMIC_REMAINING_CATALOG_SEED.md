# Academic practice catalog: Tests 17–48

Status: retired on 2026-11-26 at the owner's request. The Academic seed and
static remaining-content catalog were removed. Existing PostgreSQL records
remain the source of truth; this historical note does not verify that every
target paper was seeded. There is no replacement static seed command. New
environments need a database backup or authorized Teacher-authored content.

The original fixture catalog defined 48 papers per IELTS group. The retired
remaining-catalog seed targeted missing Listening, Reading, and Writing skills
for Tests 17–48 without resetting the database.

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

## Historical write boundary

The retired seed validated all 32 content sets and target papers before writes,
refused missing papers or existing incomplete skills, and committed each paper
atomically. Unique paper/skill constraints and rereads preserved existing
versions. These constraints remain in PostgreSQL; removing the seed performs
no database writes, media deletion, or schema migration.
