# Step 7D Library and malware-scan plan

## Approved scope

Step 7D turns the existing Library tables into the first production API slice.
Teachers own categories and Library items; Students receive localized active
items through current group membership. Admin content management, permanent
deletion, frontend wiring, and public media URLs are deferred. Telegram import
was removed from the backend plan after 7D approval.

## Media safety boundary

- The browser uploads directly through the exact-size, single-write private S3
  intent established in 7C.
- Confirmation validates stored size, MIME metadata, file signature, stable
  ETag, and SHA-256 before it accepts the object.
- The API streams the validated bytes to ClamAV over the private local network.
- `PENDING` may transition once to `CLEAN` or `INFECTED`; verdict metadata is
  immutable. Infected objects become `REJECTED` with `MALWARE_DETECTED`.
- Existing ready rows fail closed with `PENDING` until explicitly rescanned.
- PostgreSQL triggers allow Library/payment attachment only for `READY + CLEAN`
  objects. Redis and object storage are not authorization sources.

The scanner stores engine, engine version, signature version, scan timestamp,
and a bounded threat name. Client responses expose state and scan time but not
the detected threat or internal scanner details.

## Teacher writes

- Categories have a trimmed 1–120 character name unique per Teacher.
- An item has exactly one active owned category, one primary language, one to
  three unique UZ/RU/EN translations, and one to ten ordered attachments.
- The primary-language translation is mandatory. Titles are 1–240 characters
  and descriptions are bounded to 10,000 characters.
- `ALL_GROUPS` accepts no selected group IDs. `SELECTED_GROUPS` requires at
  least one active group owned by the Teacher.
- Every attachment must be owned by the Teacher and currently `READY + CLEAN`.
- Create/update executes relational replacements and media visibility changes
  in one PostgreSQL transaction.
- Items and categories are archived/restored; no API permanently deletes
  content or storage objects. A category with active items cannot be archived.

## Student authorization

For each request the API reloads active group memberships from PostgreSQL.
`ALL_GROUPS` is visible only when the Student currently belongs to a group
owned by that item’s Teacher. `SELECTED_GROUPS` additionally requires a matching
selected group. Item, category, attachment, and media status are checked again
when issuing a signed download URL. An unauthorized or missing resource returns
the same not-found contract.

Growing Teacher and Student item lists use bounded opaque cursor pagination.
Student responses select one requested translation and never expose storage
keys, scanner threat names, provider credentials, or authorization metadata.
