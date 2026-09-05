# Import worker

The import worker owns offline Telegram and media ingestion. It is a NestJS
standalone application context and does not expose an HTTP endpoint.

## Vocabulary pilot

The first approved pilot reads one local Telegram HTML export, resolves one PDF
message without allowing path traversal, extracts embedded PDF text with
Mozilla PDF.js, and normalizes a related Telegram vocabulary message into a
review-only JSON draft.

Without `--actor-id`, the command remains extraction-only. With an approved
active Teacher or Admin actor, it uploads the original file to private object
storage and writes a review-only source document and vocabulary draft to
PostgreSQL. Redis is not used by this synchronous pilot. Original files stay
outside the repository, and generated pilot results belong under an ignored
`.tmp` directory.

Example from the repository root:

```powershell
corepack yarn workspace @best/import-worker pilot:vocabulary `
  --export "D:\data\messages.html" `
  --media-message 261 `
  --content-message 264 `
  --channel teacher_javlon `
  --actor-id "<active-teacher-or-admin-uuid>" `
  --output "D:\projects\best\best-server\.tmp\import-pilot\unit-1-family.json"
```

The JSON result contains:

- a stable source checksum and idempotency key;
- PDF page and extracted-character counts;
- `EMBEDDED_TEXT` or `OCR_REQUIRED` routing;
- structured vocabulary entries and preserved unparsed lines;
- detected third-party brand names and mandatory `REVIEW_REQUIRED` status.

The command creates a new result file and refuses to overwrite an existing
one. Repeating the same channel/message import returns the original database
records rather than uploading or inserting duplicates. Imported media remains
`VERIFYING + PENDING` until malware scanning is completed, and the draft never
becomes publishable automatically.

## Next reviewed boundary

The approved persistence design is recorded in
`packages/database/docs/VOCABULARY_IMPORT_PILOT_DATA_DESIGN.md`. The next
separate boundary is malware-scan completion and an authenticated Admin review
workflow. Only an approved draft may later be transformed into BEST-owned
publication content; third-party material is never automatically rebranded or
published.
