-- Approved review-only vocabulary import persistence.

CREATE TYPE "ImportExtractionMethod" AS ENUM ('EMBEDDED_TEXT', 'OCR');
CREATE TYPE "ImportExtractionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "ImportRightsStatus" AS ENUM ('REVIEW_REQUIRED', 'APPROVED', 'REJECTED');
CREATE TYPE "VocabularyDraftStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "import_source_documents" (
    "id" UUID NOT NULL,
    "channel_id" VARCHAR(120) NOT NULL,
    "message_id" BIGINT NOT NULL,
    "content_message_id" BIGINT,
    "media_object_id" UUID NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "source_published_at" TIMESTAMPTZ(3) NOT NULL,
    "extraction_method" "ImportExtractionMethod" NOT NULL,
    "extraction_status" "ImportExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "rights_status" "ImportRightsStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "detected_brands" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_source_documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_source_documents_message_id_check" CHECK ("message_id" > 0),
    CONSTRAINT "import_source_documents_content_message_id_check" CHECK ("content_message_id" IS NULL OR "content_message_id" > 0),
    CONSTRAINT "import_source_documents_checksum_check" CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "import_source_documents_original_name_check" CHECK (length(btrim("original_name")) > 0),
    CONSTRAINT "import_source_documents_detected_brands_check" CHECK (jsonb_typeof("detected_brands") = 'array')
);

CREATE TABLE "vocabulary_drafts" (
    "id" UUID NOT NULL,
    "source_document_id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "parser_version" INTEGER NOT NULL,
    "status" "VocabularyDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "unparsed_lines" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vocabulary_drafts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vocabulary_drafts_title_check" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "vocabulary_drafts_parser_version_check" CHECK ("parser_version" > 0),
    CONSTRAINT "vocabulary_drafts_unparsed_lines_check" CHECK (jsonb_typeof("unparsed_lines") = 'array')
);

CREATE TABLE "vocabulary_draft_entries" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "section" VARCHAR(160) NOT NULL,
    "term" VARCHAR(240) NOT NULL,
    "pronunciation" VARCHAR(240),
    "translation" TEXT NOT NULL,

    CONSTRAINT "vocabulary_draft_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vocabulary_draft_entries_position_check" CHECK ("position" > 0),
    CONSTRAINT "vocabulary_draft_entries_section_check" CHECK (length(btrim("section")) > 0),
    CONSTRAINT "vocabulary_draft_entries_term_check" CHECK (length(btrim("term")) > 0),
    CONSTRAINT "vocabulary_draft_entries_pronunciation_check" CHECK ("pronunciation" IS NULL OR length(btrim("pronunciation")) > 0),
    CONSTRAINT "vocabulary_draft_entries_translation_check" CHECK (length(btrim("translation")) > 0)
);

CREATE UNIQUE INDEX "import_source_documents_channel_id_message_id_key"
  ON "import_source_documents"("channel_id", "message_id");
CREATE UNIQUE INDEX "import_source_documents_media_object_id_key"
  ON "import_source_documents"("media_object_id");
CREATE INDEX "import_source_documents_checksum_sha256_idx"
  ON "import_source_documents"("checksum_sha256");
CREATE INDEX "import_source_documents_rights_status_extraction_status_idx"
  ON "import_source_documents"("rights_status", "extraction_status");
CREATE UNIQUE INDEX "vocabulary_drafts_source_document_id_parser_version_key"
  ON "vocabulary_drafts"("source_document_id", "parser_version");
CREATE INDEX "vocabulary_drafts_status_created_at_idx"
  ON "vocabulary_drafts"("status", "created_at");
CREATE UNIQUE INDEX "vocabulary_draft_entries_draft_id_position_key"
  ON "vocabulary_draft_entries"("draft_id", "position");
CREATE INDEX "vocabulary_draft_entries_term_idx"
  ON "vocabulary_draft_entries"("term");

ALTER TABLE "import_source_documents"
  ADD CONSTRAINT "import_source_documents_media_object_id_fkey"
  FOREIGN KEY ("media_object_id") REFERENCES "media_objects"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vocabulary_drafts"
  ADD CONSTRAINT "vocabulary_drafts_source_document_id_fkey"
  FOREIGN KEY ("source_document_id") REFERENCES "import_source_documents"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "vocabulary_draft_entries"
  ADD CONSTRAINT "vocabulary_draft_entries_draft_id_fkey"
  FOREIGN KEY ("draft_id") REFERENCES "vocabulary_drafts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION protect_import_source_document_identity()
RETURNS trigger AS $$
BEGIN
  IF NEW."channel_id" IS DISTINCT FROM OLD."channel_id"
     OR NEW."message_id" IS DISTINCT FROM OLD."message_id"
     OR NEW."content_message_id" IS DISTINCT FROM OLD."content_message_id"
     OR NEW."media_object_id" IS DISTINCT FROM OLD."media_object_id"
     OR NEW."checksum_sha256" IS DISTINCT FROM OLD."checksum_sha256"
     OR NEW."original_name" IS DISTINCT FROM OLD."original_name"
     OR NEW."source_published_at" IS DISTINCT FROM OLD."source_published_at"
     OR NEW."extraction_method" IS DISTINCT FROM OLD."extraction_method"
  THEN
    RAISE EXCEPTION 'import source document identity is immutable';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "import_source_documents_protect_identity"
  BEFORE UPDATE ON "import_source_documents"
  FOR EACH ROW EXECUTE FUNCTION protect_import_source_document_identity();
