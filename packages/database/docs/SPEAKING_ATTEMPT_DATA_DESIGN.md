# Speaking attempt persistence data design

Status: approved for implementation on 2026-09-27.

## Ownership and route modes

Official attempts belong to authenticated Students with an active membership in
the test's group. Teacher Speaking routes remain content previews and must not
create Student attempts. Teachers may bookmark owned practice papers and review
submitted Speaking attempts from their own groups. Students may bookmark only
practice papers visible through an active group membership.

## Reused records

- `Attempt` owns start, resume, server deadline, submission, and status.
- `AttemptAnswer.responseMediaObjectId` owns one verified private audio response
  per `AUDIO_RESPONSE` question.
- `MediaObject` owns the private object-storage lifecycle, checksum, MIME and
  malware verification.
- `AttemptReview` owns IELTS rubric scores, practice band, feedback, reviewer,
  and release time.

Audio upload is attempt-scoped. A Student cannot use the generic Teacher/Admin
asset mutation. The API validates Student ownership, an in-progress attempt,
the question's membership in the immutable test version, and the
`AUDIO_RESPONSE` kind before issuing or confirming an upload.

## New records

`PracticeBookmark` stores one saved practice paper per user. The unique key is
`(user_id, test_paper_id)`. The set mutation accepts an explicit boolean instead
of toggling so retries are idempotent.

`AttemptSectionNote` stores the Student's working note for one section of an
in-progress attempt. The unique key is `(attempt_id, section_id)`. Notes are
bounded text, autosaved idempotently, and become immutable when the attempt is
submitted.

## Speaking lifecycle

1. `startTestAttempt` creates or resumes the server-owned attempt.
2. The browser derives the display timer from `serverTime` and `expiresAt`.
3. Part 2 notes autosave to `AttemptSectionNote`.
4. Each answer recording is uploaded privately, verified, then linked through
   `saveAttemptAnswer`.
5. Submission freezes answers and notes and emits the existing outbox event.
6. The scoring worker moves `manual-rubric-v1` attempts from `SUBMITTED` to
   `REVIEW_REQUIRED`; it never fabricates an automatic score.
7. The owning Teacher saves the four IELTS criterion scores and overall
   practice band. Releasing the review moves the attempt to `SCORED` and makes
   the review visible to the Student.

The four criteria are fluency/coherence, lexical resource, grammatical range
and accuracy, and pronunciation. Scores and the overall practice band use IELTS
half-band increments from 0 through 9. AI evaluation remains out of scope.

## Security and retention

All bookmark, note, upload, review, and result operations resolve authorization
from PostgreSQL. Audio stays private and is exposed only through short-lived
signed download intents after attempt ownership or Teacher group ownership is
verified. Attempts retain their immutable `TestVersion`; newer published test
versions never rewrite an active or historical attempt.

## Migration and rollback

The forward migration adds `REVIEW_REQUIRED`, `practice_bookmarks`, and
`attempt_section_notes`. It does not rewrite existing attempts. Rollback is an
application rollback that leaves the additive enum value and unused tables in
place; deployed migrations are never edited or reversed destructively.
