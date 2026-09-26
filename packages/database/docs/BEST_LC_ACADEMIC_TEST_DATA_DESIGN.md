# BEST LC Academic Test data design

Status: approved for implementation on 2026-09-23.

## Scope and naming

The first connected paper is named `BEST LC Academic Test 1`. Product copy,
slugs, API fields, and persisted titles must not use the word `Mock`. The paper
contains four skill tests: Listening, Reading, Writing, and Speaking.

All passages, scripts, prompts, visuals, questions, and answer keys are original
BEST LC practice content. IELTS is referenced only to describe the public test
format. The active test API never exposes correct answers, evidence offsets, or
Listening transcripts.

## Ownership and compatibility

`TestPaper` groups four existing `Test` records and belongs to one Teacher-owned
group. This preserves the current authorization model: an active membership in
that group is required to discover or attempt the paper, and the group owner is
the only Teacher who may review its manual responses.

Existing standalone tests remain valid. Their nullable `paperId` and `skill`
fields stay null, their current single-choice scoring contract remains
unchanged, and their current GraphQL operations remain compatible.

## Paper and section hierarchy

- `TestPaper` owns the group, stable slug, academic year, title/source copy,
  lifecycle, and its four skill `Test` records.
- `Test.paperId` and `Test.skill` attach a test to the paper. A database unique
  constraint permits at most one test per skill in a paper.
- `TestSection` groups versioned questions into Listening parts, Reading
  passages, Writing tasks, or Speaking parts. It is immutable after its parent
  version is published.
- `TestSectionTranslation` stores English instructions and stimulus content.
  IELTS assessment content is not translated; application chrome remains
  localized independently.
- A section may reference a verified, clean, domain-authorized media object.
  Listening audio and Writing visuals use that existing media lifecycle.

## Questions and responses

`Question.kind` supports the initial paper through the following additive enum:

- `SINGLE_CHOICE`
- `MULTIPLE_CHOICE`
- `SHORT_TEXT`
- `TRUE_FALSE_NOT_GIVEN`
- `YES_NO_NOT_GIVEN`
- `MATCHING`
- `LONG_TEXT`
- `AUDIO_RESPONSE`

`Question.sectionId`, `answerLimit`, and `maxSelections` are nullable for
backward compatibility. Published IELTS-style versions require a section and
kind-specific limits at the service layer before publication.

The current `AttemptAnswer.selectedOptionId` becomes nullable. Text responses
use `textValue`; multi-select and matching responses use
`AttemptAnswerSelection`; Speaking uses a private `responseMediaObjectId`.
The service accepts exactly the response shape allowed by the question kind and
replaces the prior response transactionally. Submitted answers remain
immutable.

## Deterministic and manual scoring

Listening and Reading use versioned deterministic rules. Normalized short-text
answers are compared on the server; accepted alternatives belong to the
published version and are never returned by Student operations.

Writing and Speaking remain `SUBMITTED` until a Teacher review is completed.
`AttemptReview` stores a versioned rubric payload, calculated practice band,
feedback, reviewer, review time, and release time. Rubric input is validated by
the API; it is not produced by AI. A Student can see manual scores and feedback
only after `releasedAt` is set.

The product labels all reported bands as `BEST LC estimated practice band`.
Existing deterministic scores remain authoritative for the objective skills.

## Released answer evidence

Listening and Reading released results are answer-first:

1. show the numbered answer list with the Student answer, correct answer, and
   correctness state;
2. selecting an answer opens its source section;
3. `QuestionEvidence` character offsets highlight the exact location in the
   Reading passage or Listening transcript.

Evidence belongs to an immutable published question and section. Offsets are
validated against the English section content during publication. Listening
transcripts and all evidence are excluded from active-attempt GraphQL types and
are returned only by the released-result query after authorization.

## Attempt lifecycle and timing

Each skill keeps the existing versioned `Attempt` lifecycle. Listening,
Reading, and Writing are presented in sequence; Speaking may be completed
separately. The backend remains authoritative for expiration, attempt limits,
submission, scoring, and result release. Refreshing the browser reloads saved
answers and the server deadline.

## Media privacy

Speaking recording requires explicit browser permission and a confirmed private
media object. It is never sent to an AI provider. The initial retention policy
is deletion eligibility 30 days after result release; permanent object cleanup
must use the existing reviewed media lifecycle rather than deleting storage
objects from a resolver.

## Import and provenance

The first paper is loaded by an idempotent backend import package. It stores a
stable import key, refuses duplicate paper/skill/version creation, and uses only
fictional or original BEST LC content. Runtime frontend arrays are not a source
of truth. Audio may initially be explicitly labelled synthetic preview media;
production publication requires reviewed replacement audio.

## Migration and rollback

The migration is additive except for relaxing the existing
`selected_option_id` nullability. Existing rows remain non-null and unchanged.
New tables, columns, indexes, and enum values are deployed before API code reads
them. Published content and submitted responses keep the existing immutability
guarantees.

Rollback means deploying the previous API/worker/web versions first and leaving
the unused additive schema in place. A deployed migration is never edited.
Removing PostgreSQL enum values or new response data requires a separately
reviewed forward migration and backup plan.

## Verification gates

- database constraints and migration-from-zero tests;
- idempotent import and provenance assertions;
- Student membership and Teacher ownership tests;
- active-attempt correct-answer/transcript/evidence isolation;
- autosave replacement, concurrency, expiry, and submission tests;
- deterministic objective scoring and manual review/release tests;
- released Reading/Listening evidence offset validation;
- private Speaking media authorization and retention metadata tests;
- generated GraphQL schema and frontend client compatibility.
