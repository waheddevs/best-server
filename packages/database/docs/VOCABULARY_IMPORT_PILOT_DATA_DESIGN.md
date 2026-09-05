# Vocabulary import pilot data design

Status: approved on 2026-09-04; additive migration implemented.

The extraction-only pilot is working. This document defines the smallest
persistence boundary required for the next approval. No table or production
GraphQL contract is created by this proposal.

## Ownership and storage

- SeaweedFS stores the original PDF or image privately. The object remains
  unavailable to domain content while its malware verdict is pending.
- `media_objects` remains the authoritative object metadata record.
- PostgreSQL stores source identity, extraction state, review state and the
  normalized draft vocabulary rows.
- Redis may later schedule extraction jobs but is never the source of truth.
- Original third-party content is never published automatically.
- `ImportSourceDocument -> MediaObject` is operational review metadata, not a
  public Library attachment; Library attachment still requires `READY + CLEAN`.

## Proposed records

### `import_source_documents`

One immutable identity for each imported Telegram file.

- `id` UUID primary key
- `channel_id` varchar(120)
- `message_id` bigint
- `content_message_id` bigint, nullable
- `media_object_id` UUID foreign key to `media_objects`
- `checksum_sha256` char(64)
- `original_name` varchar(255)
- `source_published_at` timestamptz
- `extraction_method` enum: `EMBEDDED_TEXT`, `OCR`
- `extraction_status` enum: `PENDING`, `COMPLETED`, `FAILED`
- `rights_status` enum: `REVIEW_REQUIRED`, `APPROVED`, `REJECTED`
- `detected_brands` jsonb
- timestamps

Constraints:

- unique `(channel_id, message_id)` prevents repeated Telegram imports;
- unique `media_object_id` gives one authoritative source document per object;
- checksum index supports duplicate-file review across different messages.

### `vocabulary_drafts`

One reviewable unit extracted from a source document.

- `id` UUID primary key
- `source_document_id` UUID foreign key
- `title` varchar(240)
- `parser_version` integer
- `status` enum: `DRAFT`, `IN_REVIEW`, `APPROVED`, `REJECTED`
- `unparsed_lines` jsonb
- timestamps

The source document may have multiple parser versions, but only one draft per
`(source_document_id, parser_version)`.

### `vocabulary_draft_entries`

Ordered structured vocabulary retained for human correction.

- `id` UUID primary key
- `draft_id` UUID foreign key
- `position` integer
- `section` varchar(160)
- `term` varchar(240)
- `pronunciation` varchar(240), nullable
- `translation` text

Constraints:

- unique `(draft_id, position)` preserves stable ordering;
- normalized-term indexes support duplicate review but do not silently merge
  words with different meanings.

## Review and publication boundary

An Admin must be able to correct entries, review ignored lines, verify usage
rights, and approve or reject the draft. Approval does not rewrite the original
file and does not claim third-party ownership. A later, separately reviewed
publication transform creates BEST-authored Library content while retaining
source traceability.

## Explicitly outside this migration

- frontend review screens;
- automatic publication;
- AI rewriting or evaluation;
- scanned-image OCR provider selection;
- bulk Telegram synchronization;
- deleting or replacing original source files.
