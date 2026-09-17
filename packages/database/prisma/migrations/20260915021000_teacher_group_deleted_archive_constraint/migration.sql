ALTER TABLE "groups" DROP CONSTRAINT "groups_archive_state_check";

ALTER TABLE "groups"
  ADD CONSTRAINT "groups_archive_state_check" CHECK (
    ("status" = 'ACTIVE' AND "archived_at" IS NULL) OR
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL) OR
    ("status" = 'DELETED')
  );
