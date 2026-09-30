# Teacher practice catalog data design

Status: approved for implementation on 2026-09-26.

## Scope

The Teacher group Practices tab lists active `TestPaper` records as a paged
catalog. The backend owns ordering, page boundaries, total counts, ownership,
and the stable number displayed on each card. The initial development fixture
contains 48 fictional practices so the frontend can review three pages of 16.

The existing `BEST LC Academic Test 1` paper remains the only paper populated
with all four skills. Every catalog paper owns a published Speaking version so
the Teacher Speaking simulator reads its prompt set and publication metadata
from PostgreSQL instead of a frontend runtime array. Practices 2 through 48 do
not fabricate Listening, Reading, Writing, answer keys, attempts, or results.

Speaking fixture versions contain three ordered sections matching the IELTS
Speaking structure: four short Part 1 questions, one Part 2 cue card, and four
Part 3 discussion questions. Every question keeps its section relationship so
the frontend does not infer parts from array offsets. The authenticated Teacher
reads the owned published version through `teacherTestVersion`; the frontend
does not receive correct answers, Student responses, scoring rules beyond
selected metadata, or private media.

Published versions are immutable. When an existing fixture has the legacy
one-question-per-part shape, re-running the seed creates and publishes the next
version on the same `Test` instead of changing or deleting the earlier version.
The seed creates only missing Speaking skills or missing compliant versions and
is idempotent after the 4/1/4 shape exists.

## Stable practice identity

`TestPaper.id` remains the UUID primary key used by routes and relationships.
The new `practiceNumber` column is a positive integer unique within a group and
is the only value presented as the human-readable practice number. UI code must
not derive it from array position, offset, creation time, slug parsing, or the
UUID.

The additive migration backfills existing papers deterministically within each
group by academic year, creation time, and UUID. A database check enforces a
positive value, and a unique constraint on `(group_id, practice_number)` keeps
the number stable and collision-free.

## Pagination and authorization

`teacherTestPapers(groupId, page)` returns a numeric page with a fixed server-
owned size of 16. Its `pageInfo` includes the current page, fixed page size,
total item count, total page count, and previous/next flags. Page numbers start
at one. Non-positive pages are rejected as invalid input; pages beyond the last
page return an empty item list with truthful totals.

The resolver remains protected by the authenticated `TEACHER` role. The service
first resolves an active group owned by the authenticated Teacher. Missing,
deleted, or foreign groups return the same not-found response so ownership
cannot be enumerated. Only active papers are counted and returned. Ordering is
ascending by `practiceNumber`, then UUID as a deterministic tie-breaker.

Teacher catalog results include paper and skill metadata only. Correct answers,
accepted alternatives, evidence, transcripts, Student responses, and scoring
rules are not selected or exposed.

## Teacher-created empty practices

`createTeacherPracticeTest(input: { groupId })` creates one empty Academic
IELTS `TestPaper` for an active IELTS group owned by the authenticated Teacher.
The server, not the client, fixes `ieltsModule` to `ACADEMIC`, calculates the
next group-scoped `practiceNumber`, persists the exact title
`Practice test N`, and returns the paper for immediate navigation. It creates no
`Test`, skill, version, section, question, or answer rows; those remain explicit
Teacher authoring actions.

Number allocation holds a PostgreSQL transaction-scoped advisory lock keyed by
the group before reading the maximum. The maximum includes active, archived,
deleted, imported, and other-module historical papers so a number is never
reused. The existing unique constraint on `(group_id, practice_number)` remains
the database backstop. The create and audit rows commit atomically. Foreign,
deleted, non-IELTS, or missing groups return the same not-found response.

The Teacher and Student practice catalogs, Student paper detail, and Student
delivery of paper-bound tests expose only active Academic papers. Standalone
tests without a paper preserve their existing availability behavior. Historical
General Training papers remain in PostgreSQL and retain their enum values,
relationships, and provenance; this UI scope does not delete or rewrite them.
No schema migration is required for this operation.

`teacherTestPaper(groupId, practiceNumber)` resolves one active Academic paper
inside the same Teacher-owned group boundary. It does not derive a page number,
so historical numbering gaps cannot route a newly created paper to the wrong
record. Missing and foreign papers share the normal not-found response.

## Teacher soft deletion

`deleteTeacherPracticeTest(testPaperId)` soft-deletes one active Academic paper
owned through the authenticated Teacher's active group. The paper row and every
related `Test` row remain in PostgreSQL, but their `ContentStatus` becomes
`DELETED` and `archivedAt` records the same deletion instant. Test versions,
questions, attempts, answers, results, bookmarks, and immutable publication
history are retained without modification.

The paper and all of its skill tests change state in one transaction with a
`TEACHER_PRACTICE_TEST_DELETED` audit event. Ownership mismatches, previously
deleted papers, and missing papers return the same not-found response. Active
Teacher and Student paper queries already require active paper/test rows, so a
successful deletion removes the card and prevents new delivery while preserving
historical attempts and results.

The lifecycle constraints for `tests` and `test_papers` require `archivedAt` for
both `ARCHIVED` and `DELETED`, and require it to be null for `ACTIVE`. The
forward migration backfills any legacy deleted rows before replacing those
constraints. Practice numbers are never reused after deletion.

## Seed and rollout

The local academic-test seed is idempotent per Teacher-owned IELTS group. It
creates or updates the original fully populated practice 1 and creates only the
missing catalog-only records for practices 2 through 48. It never deletes or
renumbers existing papers.

Deploy the additive catalog migration before the API version that selects
`practiceNumber`, and deploy the later soft-delete lifecycle migration before
the delete mutation. Rollback means deploying the previous API first and
retaining the compatible lifecycle constraints. A deployed migration is never
edited; any future renumbering or constraint change requires a reviewed forward
migration and backup plan.
