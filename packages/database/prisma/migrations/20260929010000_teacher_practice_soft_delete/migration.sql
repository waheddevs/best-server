-- Preserve Teacher-deleted practice papers and all skill tests as timestamped history.
UPDATE "tests"
SET "archived_at" = COALESCE("archived_at", "updated_at", CURRENT_TIMESTAMP)
WHERE "status" = 'DELETED' AND "archived_at" IS NULL;

UPDATE "test_papers"
SET "archived_at" = COALESCE("archived_at", "updated_at", CURRENT_TIMESTAMP)
WHERE "status" = 'DELETED' AND "archived_at" IS NULL;

ALTER TABLE "tests"
  DROP CONSTRAINT "tests_archive_state_check",
  ADD CONSTRAINT "tests_archive_state_check" CHECK (
    ("status" = 'ACTIVE' AND "archived_at" IS NULL) OR
    ("status" IN ('ARCHIVED', 'DELETED') AND "archived_at" IS NOT NULL)
  );

ALTER TABLE "test_papers"
  DROP CONSTRAINT "test_papers_archive_state_check",
  ADD CONSTRAINT "test_papers_archive_state_check" CHECK (
    ("status" = 'ACTIVE' AND "archived_at" IS NULL) OR
    ("status" IN ('ARCHIVED', 'DELETED') AND "archived_at" IS NOT NULL)
  );
