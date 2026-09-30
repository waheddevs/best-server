# easyIELTS test import data design

Status: approved for the first import slice on 2026-09-28.

## Source and permission boundary

The user explicitly permitted importing test data and assets from the audited
easyIELTS clone. The importer reads only the reviewed static modules under
`content/tests/{listening,reading,writing,speaking}` and the referenced static
audio path under `public/audio`. It does not read or copy browser storage,
credentials, GitHub/Copilot configuration, provider-backed AI code or generated evaluations,
visit data, or any personal identity.

The audited source contains:

- 10 General Training Listening tests with 10 sections and 80 questions;
- 10 General Training Reading tests with 10 sections and 83 questions;
- 10 General Training Writing tests with 20 tasks;
- 9 standalone Speaking part prompts;
- one referenced WAV file, `/audio/listening/gt-community-hall-p1.wav`.

The committed import snapshot pins upstream commit
`7b39a29fc82304ff2c976495e0250232def1baf4` under
`packages/database/prisma/easyielts-source`. The CLI uses that snapshot by
default; `--source-dir` exists only for an explicit reviewed refresh audit.

All imported records remain `DRAFT`. easyIELTS items are short practice sets,
and its standalone Speaking prompts are not complete three-part BEST LC tests.
Teachers must review and complete them before the existing publication validator
can publish a version. The importer never weakens publication rules.

## IELTS module ownership

`TestPaper` gains the required `IeltsModule` value `ACADEMIC` or
`GENERAL_TRAINING`. Existing papers are backfilled as `ACADEMIC`; the original
BEST LC Academic Test 1 remains Academic. The importer creates only its own
deterministic `GENERAL_TRAINING` papers and refuses every pre-existing number,
slug, or id collision instead of relabeling or renumbering existing content.

The module is exposed on Teacher and Student paper objects so interfaces do not
infer it from a title or slug. UI labels remain localized by the frontend.

## Normalization mapping

Each source test becomes one existing `Test` and one draft `TestVersion` within
an explicitly configured Teacher-owned active IELTS group and category. Source
list position groups the same ordinal Listening, Reading, Writing, and, where
available, Speaking item under one General Training paper. The importer creates
10 deterministic papers beginning at `--start-practice-number` (default 1).
Any collision with a pre-existing paper number, slug, id, or occupied skill
fails closed. To preserve an existing Academic catalog, use a dedicated General
Training group or a reviewed non-conflicting starting number.

- Reading paragraphs become English section content and a `RICH_TEXT` block.
- Listening scripts become English section content. Active Student attempts
  already suppress Listening content; it is available only through the released
  objective-result contract.
- Choice, true/false/not-given, and yes/no/not-given questions become typed
  option questions with server-only correctness flags.
- Sentence-completion and short-answer questions become `SHORT_TEXT` with
  normalized accepted answers stored outside Student GraphQL types.
- Writing tasks become sections with one `LONG_TEXT` question and minimum-word
  metadata.
- Speaking prompts become one-part draft sections with one `AUDIO_RESPONSE`
  question and explicit timing metadata appropriate to the source part.
- Every question is assigned to an ordered `QUESTION_GROUP` block. Reading also
  receives heading and rich-text blocks. Listening receives an `AUDIO` block
  only when a verified media mapping is supplied.

The import does not expose accepted answers, correct option flags, Listening
scripts, rationales, evidence, or provenance through Student operations.

## Stable identity and provenance

Entity UUIDs are deterministic SHA-256-derived UUIDv5-compatible values from
the source system, target group, external test id, and external child id. A new
`TestImportSource` row records the source system, external id, audited relative
path, source payload SHA-256, target group, and exact test version.

`(source_system, external_id, target_group_id)` is unique and each version has
at most one provenance row. Re-running an unchanged source skips it. A changed
payload hash or a manually occupied paper skill fails closed; the importer never
rewrites a published version or silently overwrites Teacher-authored content.

## Media reuse

The importer never inserts a fake ready media row or writes directly to an
object-store bucket. Optional `--media-map` JSON maps an easyIELTS public path to
an existing BEST LC media UUID. The importer accepts the mapping only when the
object belongs to the target Teacher, is `AUDIO`, and is `READY + CLEAN`. The
normal upload-intent, object verification, signature, checksum, malware scan,
and confirmation flow therefore remains authoritative.

Students obtain a short-lived URL through
`studentAttemptMediaDownload(attemptId, mediaObjectId)`. The query requires the
authenticated Student to own the attempt and the media to belong to that exact
test version's section or content block, then reuses the existing signed media
delivery service. Arbitrary media UUIDs and other Students' attempts return
not-found.

## Migration and rollback

The additive migration creates `IeltsModule`, adds/backfills the paper module,
and creates `test_import_sources` with foreign keys and uniqueness constraints.
Deploy it before the importer or the API version selecting `ieltsModule`.

Rollback deploys the prior API/importer first and leaves the additive enum,
column, and provenance rows in place. Deleting imported drafts, renumbering
papers, or changing provenance requires a reviewed forward operation; deployed
migrations are never edited.
