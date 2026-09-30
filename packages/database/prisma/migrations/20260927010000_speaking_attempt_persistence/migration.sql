ALTER TYPE "AttemptStatus" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED';

CREATE TABLE "practice_bookmarks" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "test_paper_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practice_bookmarks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attempt_section_notes" (
  "id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "section_id" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "saved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attempt_section_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practice_bookmarks_user_id_test_paper_id_key"
  ON "practice_bookmarks"("user_id", "test_paper_id");
CREATE INDEX "practice_bookmarks_test_paper_id_idx"
  ON "practice_bookmarks"("test_paper_id");
CREATE UNIQUE INDEX "attempt_section_notes_attempt_id_section_id_key"
  ON "attempt_section_notes"("attempt_id", "section_id");
CREATE INDEX "attempt_section_notes_section_id_idx"
  ON "attempt_section_notes"("section_id");

ALTER TABLE "practice_bookmarks"
  ADD CONSTRAINT "practice_bookmarks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_bookmarks"
  ADD CONSTRAINT "practice_bookmarks_test_paper_id_fkey"
  FOREIGN KEY ("test_paper_id") REFERENCES "test_papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_section_notes"
  ADD CONSTRAINT "attempt_section_notes_attempt_id_fkey"
  FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_section_notes"
  ADD CONSTRAINT "attempt_section_notes_section_id_fkey"
  FOREIGN KEY ("section_id") REFERENCES "test_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
