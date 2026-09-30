# IELTS test authoring data design

Status: approved for Phase 0 implementation on 2026-09-28. This phase completes
deterministic Teacher authoring; it does not add an AI worker, provider
credentials, or PDF import jobs.

## Purpose and boundaries

The existing academic-test schema already owns papers, skill tests, immutable
versions, sections, typed questions, answer options, accepted answers, evidence,
attempts, and private media. This change extends those records so a Teacher can
author the same dynamic Listening, Reading, Writing, and Speaking structures
that the Student runners render. It does not introduce a parallel test model.

`best-server` remains authoritative for Teacher role and ownership, draft
mutability, kind-specific validation, correct-answer secrecy, and publication.
The browser may mirror validation for fast feedback, but it cannot authorize a
publish transition.

## Current gaps

- GraphQL authoring inputs create only translations and answer options; they do
  not accept `sectionId`, `kind`, `answerLimit`, `maxSelections`, or accepted
  short-text answers.
- There are no section create/update/delete/reorder authoring mutations.
- One `TestSection.content` string plus one `mediaObjectId` cannot represent an
  ordered passage containing headings, multiple images, tables, audio, and
  question groups.
- Writing word/time guidance and Speaking preparation/response timing are
  currently derived by clients instead of versioned test data.
- Teacher authoring objects omit question kind and limits even though Student
  attempt objects expose the safe rendering fields.

## Additive relational changes

### `TestSection`

Add nullable versioned metadata for skill-specific layout:

- `suggestedMinutes Int?`
- `minimumWords Int?`
- `preparationSeconds Int?`
- `responseSeconds Int?`

Checks require positive values when present. Existing rows remain valid. The
legacy `mediaObjectId` and translation `content` fields remain readable during
the compatibility period and are not destructively migrated in this phase.

### Ordered section blocks

Add `TestSectionBlock`:

- `id UUID` primary key;
- `testSectionId UUID` foreign key with cascade delete;
- `position Int` unique within the section;
- `kind TestSectionBlockKind`;
- `mediaObjectId UUID?` restricted foreign key to `MediaObject`;
- `headingLevel Int?`;
- `tablePayload Json?` for a validated rectangular table structure only;
- timestamps.

`TestSectionBlockKind` is additive:

```text
HEADING
RICH_TEXT
IMAGE
TABLE
AUDIO
QUESTION_GROUP
```

Add `TestSectionBlockTranslation` with unique `(testSectionBlockId, language)`
and nullable `text`, `altText`, and `caption` fields. Service validation requires
the appropriate primary-language field for each block kind. Text is plain or
allow-listed rich text; executable HTML is rejected.

Add `TestSectionBlockQuestion` with `(testSectionBlockId, questionId)` identity
and a position unique within the block. The service verifies that both records
belong to the same draft version and section. A published question appears in
at most one question-group block. Questions not yet assigned to a block remain
visible in the Teacher draft as validation findings but block publication.

`tablePayload` is the narrow exception for a variable rectangular cell matrix.
It has a versioned runtime schema containing header rows and body rows only; it
must not contain markup, media keys, answers, or arbitrary provider output.

### Question authoring fields

The existing `Question` columns remain the source of truth. Extend draft inputs
and service logic to write:

- `sectionId`
- `kind`
- `answerLimit`
- `maxSelections`
- ordered answer options
- ordered `QuestionAcceptedAnswer` values for objective short-text questions

Add nullable `rationale` to `QuestionTranslation`. It is Teacher-only and may be
shown after result release only through a separately reviewed output field. It
must never be selected by an active Student attempt operation.

### Media technical metadata

Add nullable `widthPixels`, `heightPixels`, and `durationSeconds` fields to
`MediaObject`. Verification/media processing populates them when applicable.
Legacy objects remain valid, but publication requires dimensions for image
blocks and duration for audio blocks. Storage keys stay private and unchanged.

## Draft and publication invariants

All authoring mutations reject a published version. Publishing runs one backend
validator inside the existing ownership/transaction boundary and rejects:

- missing or duplicate section/question/block positions;
- missing primary-language test, section, block, question, or option content;
- question/block references outside the current draft and section;
- kind-specific invalid options, correct-option counts, answer limits,
  selection limits, or accepted answers;
- ungrouped questions when ordered blocks are in use;
- Listening without verified clean authorized audio;
- Reading sections without readable content;
- a full Writing paper without Task 1 and Task 2, one `LONG_TEXT` response per
  task, and explicit word/time metadata;
- Speaking without three ordered parts, exactly one Part 2 cue-card response,
  audio-response question kinds, and explicit Part 2 timing;
- image/audio blocks with missing, unready, rejected, infected, unauthorized,
  or technically incomplete media;
- unsupported table payload versions or executable markup.

Publication keeps the existing immutable version contract. Editing a published
test creates the next draft version and copies the normalized authored records;
it never updates rows used by attempts.

## GraphQL contract changes

Extend existing explicit Teacher operations rather than adding a generic JSON
mutation:

- paper skill bootstrap: `createTestPaperSkillDraft`, which creates one missing
  Listening, Reading, Writing, or Speaking draft inside an existing Teacher-owned
  active `TestPaper`; the `(paperId, skill)` uniqueness constraint makes the
  operation reject duplicate skill records and keeps the fixed practice-card
  catalog intact;
- section: `createTestSection`, `updateTestSection`, `deleteTestDraftSection`,
  `reorderTestSections`;
- block: `createTestSectionBlock`, `updateTestSectionBlock`,
  `deleteTestSectionBlock`, `reorderTestSectionBlocks`;
- question: extend `createTestQuestion` and `updateTestQuestion`, and add an
  explicit question-group assignment/reorder input;
- validation: `validateTeacherTestDraft(testVersionId)` returning stable issue
  codes, severity, path, and localized-message parameters;
- keep `publishTestVersion` as the sole explicit publication transition.

Teacher objects expose the complete draft fields including correct answers and
rationales only after role/ownership checks. Student paper and active-attempt
objects expose ordered safe content blocks, question kinds/limits, and signed
authorized media delivery, but never `isCorrect`, accepted answers, rationale,
evidence, validation internals, or draft/import metadata.

## Compatibility and rollout

1. Deploy additive enums, columns, tables, constraints, and indexes.
2. Regenerate Prisma Client and the committed GraphQL schema.
3. Add service adapters that read legacy section content/media when no blocks
   exist; new Teacher authoring writes normalized blocks.
4. Extend Teacher GraphQL operations and frontend codegen.
5. Add the Teacher authoring/review UI and dynamic preview.
6. Backfill normalized blocks only through an idempotent reviewed operation;
   do not rewrite existing published rows in place.
7. Remove compatibility reads only in a later reviewed forward migration after
   all relevant versions have normalized blocks.

Rollback deploys the previous API/web first and leaves unused additive schema
in place. No enum value, published content, or media relation is removed during
rollback.

## Verification gates

- Prisma validation, migration-from-zero, and upgrade-from-current tests;
- database uniqueness/check constraints for ordered sections/blocks/groups;
- Teacher role, ownership, cross-group, archived/deleted test, and published
  immutability tests for every mutation;
- kind-specific draft validator unit tests and GraphQL integration tests;
- correct-answer/rationale isolation in Student list, paper, attempt, autosave,
  submit, and result-before-release operations;
- media ownership/status/malware/dimension/duration checks;
- next-version copy fidelity and published-version immutability;
- generated schema and frontend codegen consistency;
- representative differently sized Listening, Reading, Writing, and Speaking
  authoring-to-attempt journeys on desktop and mobile.

Only after these gates pass may the separate PDF import/fake-provider phase add
import-job models. Provider-specific models, queues, and calls remain outside this
design record.

## Listening Part 1 form-table convention

Practice Test 1 Listening Part 1 uses the existing normalized block model; it
does not add a parallel test-content table. The form is stored in a `TABLE`
block whose second-column values may contain one question token such as
`{{1}}`. A companion `QUESTION_GROUP` block owns the ordered question
references. The section stores the localized title and instructions, while the
questions continue to own answer limits and accepted answers.

Student attempt responses may expose the safe table rows, caption, and question
references required to render the form. They must never expose accepted
answers, correctness flags, or Teacher-only rationale. Published versions stay
immutable: Teacher edits first clone the published version into the next draft,
then update that draft's section, table block, and answer-key questions.

Accepted short-text answers retain two representations. `display_value`
preserves the Teacher-authored spelling and capitalization used by authoring
and review surfaces, while `normalized_value` remains the lowercase,
whitespace-normalized scoring key. Student contracts expose neither value.
Existing answers are backfilled from matching primary-language evidence text
when available. Remaining cloned-draft answers inherit a matching display value
from another version of the same test; unmatched answers retain their normalized
value as a safe fallback.
