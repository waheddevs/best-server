-- Deterministic IELTS Teacher authoring blocks and versioned skill metadata.

CREATE TYPE "TestSectionBlockKind" AS ENUM (
  'HEADING',
  'RICH_TEXT',
  'IMAGE',
  'TABLE',
  'AUDIO',
  'QUESTION_GROUP'
);

ALTER TABLE "test_sections"
  ADD COLUMN "suggested_minutes" INTEGER,
  ADD COLUMN "minimum_words" INTEGER,
  ADD COLUMN "preparation_seconds" INTEGER,
  ADD COLUMN "response_seconds" INTEGER,
  ADD CONSTRAINT "test_sections_suggested_minutes_check"
    CHECK ("suggested_minutes" IS NULL OR "suggested_minutes" > 0),
  ADD CONSTRAINT "test_sections_minimum_words_check"
    CHECK ("minimum_words" IS NULL OR "minimum_words" > 0),
  ADD CONSTRAINT "test_sections_preparation_seconds_check"
    CHECK ("preparation_seconds" IS NULL OR "preparation_seconds" > 0),
  ADD CONSTRAINT "test_sections_response_seconds_check"
    CHECK ("response_seconds" IS NULL OR "response_seconds" > 0);

ALTER TABLE "question_translations"
  ADD COLUMN "rationale" TEXT;

ALTER TABLE "media_objects"
  ADD COLUMN "width_pixels" INTEGER,
  ADD COLUMN "height_pixels" INTEGER,
  ADD COLUMN "duration_seconds" INTEGER,
  ADD CONSTRAINT "media_objects_width_pixels_check"
    CHECK ("width_pixels" IS NULL OR "width_pixels" > 0),
  ADD CONSTRAINT "media_objects_height_pixels_check"
    CHECK ("height_pixels" IS NULL OR "height_pixels" > 0),
  ADD CONSTRAINT "media_objects_duration_seconds_check"
    CHECK ("duration_seconds" IS NULL OR "duration_seconds" > 0);

CREATE TABLE "test_section_blocks" (
  "id" UUID NOT NULL,
  "test_section_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "kind" "TestSectionBlockKind" NOT NULL,
  "media_object_id" UUID,
  "heading_level" INTEGER,
  "table_payload" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "test_section_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "test_section_blocks_position_check" CHECK ("position" > 0),
  CONSTRAINT "test_section_blocks_heading_level_check" CHECK (
    "heading_level" IS NULL OR "heading_level" BETWEEN 2 AND 4
  ),
  CONSTRAINT "test_section_blocks_shape_check" CHECK (
    ("kind" = 'HEADING' AND "heading_level" IS NOT NULL AND "media_object_id" IS NULL AND "table_payload" IS NULL) OR
    ("kind" = 'RICH_TEXT' AND "heading_level" IS NULL AND "media_object_id" IS NULL AND "table_payload" IS NULL) OR
    ("kind" = 'IMAGE' AND "heading_level" IS NULL AND "media_object_id" IS NOT NULL AND "table_payload" IS NULL) OR
    ("kind" = 'TABLE' AND "heading_level" IS NULL AND "media_object_id" IS NULL AND "table_payload" IS NOT NULL) OR
    ("kind" = 'AUDIO' AND "heading_level" IS NULL AND "media_object_id" IS NOT NULL AND "table_payload" IS NULL) OR
    ("kind" = 'QUESTION_GROUP' AND "heading_level" IS NULL AND "media_object_id" IS NULL AND "table_payload" IS NULL)
  )
);

CREATE TABLE "test_section_block_translations" (
  "id" UUID NOT NULL,
  "test_section_block_id" UUID NOT NULL,
  "language" "Language" NOT NULL,
  "text" TEXT,
  "alt_text" TEXT,
  "caption" TEXT,
  CONSTRAINT "test_section_block_translations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "test_section_block_translations_content_check" CHECK (
    NULLIF(btrim("text"), '') IS NOT NULL OR
    NULLIF(btrim("alt_text"), '') IS NOT NULL OR
    NULLIF(btrim("caption"), '') IS NOT NULL
  )
);

CREATE TABLE "test_section_block_questions" (
  "test_section_block_id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "test_section_block_questions_pkey" PRIMARY KEY ("test_section_block_id", "question_id"),
  CONSTRAINT "test_section_block_questions_position_check" CHECK ("position" > 0)
);

CREATE UNIQUE INDEX "test_section_blocks_test_section_id_position_key"
  ON "test_section_blocks"("test_section_id", "position");
CREATE INDEX "test_section_blocks_media_object_id_idx"
  ON "test_section_blocks"("media_object_id");
CREATE UNIQUE INDEX "test_section_block_translations_block_language_key"
  ON "test_section_block_translations"("test_section_block_id", "language");
CREATE UNIQUE INDEX "test_section_block_questions_block_position_key"
  ON "test_section_block_questions"("test_section_block_id", "position");
CREATE UNIQUE INDEX "test_section_block_questions_question_id_key"
  ON "test_section_block_questions"("question_id");

ALTER TABLE "test_section_blocks"
  ADD CONSTRAINT "test_section_blocks_test_section_id_fkey"
  FOREIGN KEY ("test_section_id") REFERENCES "test_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_section_blocks"
  ADD CONSTRAINT "test_section_blocks_media_object_id_fkey"
  FOREIGN KEY ("media_object_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_section_block_translations"
  ADD CONSTRAINT "test_section_block_translations_test_section_block_id_fkey"
  FOREIGN KEY ("test_section_block_id") REFERENCES "test_section_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_section_block_questions"
  ADD CONSTRAINT "test_section_block_questions_test_section_block_id_fkey"
  FOREIGN KEY ("test_section_block_id") REFERENCES "test_section_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_section_block_questions"
  ADD CONSTRAINT "test_section_block_questions_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
