# Public website data design

## Scope

This design moves mutable public website content and the four approved public
submission flows into PostgreSQL. UI labels, validation copy, route definitions,
and visual tokens remain frontend-owned localized interface code.

## Content ownership

- `PublicCourse` owns catalogue/detail identity, presentation metadata,
  publication state, ordering, media paths, translations, ordered list content,
  and optional tracks.
- `PublicEvent` owns catalogue/detail identity, schedule/capacity, publication
  state, ordering, media paths, localized detail arrays, programme rows, and
  detail FAQ rows.
- `PublicFaq` owns the About FAQ catalogue and its three translations.
- `PublicExamOffering` and `PublicExamSession` own the public exam catalogue and
  bookable MOCK slots.
- `PublicResultVideo` owns public result media metadata, licensing provenance,
  ordering, and localized titles.

Published content must have Uzbek, Russian, and English translations. Ordered
content uses explicit positions. Media binaries stay outside PostgreSQL; public
asset paths and provenance are metadata only.

## Submission ownership

- `CourseRegistration` references one published public course.
- `EventRegistration` references one published event and records participant
  count.
- `ExamRegistration` references one published exam offering and, for MOCK,
  one active future session.
- `ContactRequest` records a contact-page message and subject.

All submissions require explicit consent, normalized contact data, server-side
validation, and return an opaque receipt id. Duplicate course/event/exam
requests are rejected by database constraints. Public form payloads are never
logged. Operational Admin may review status through the existing intake model;
public callers cannot read submitted records.

## Migration and rollback

The migration is additive: existing public tables and intake rows are retained,
new nullable columns are backfilled safely, and new constraints apply to new
domain rows. Rollback means deploying the previous API/web versions first and
then removing the additive objects in a separately reviewed migration; an
already deployed migration is never edited in place.
