-- easyIELTS General Training module ownership and immutable import provenance.

CREATE TYPE "IeltsModule" AS ENUM ('ACADEMIC', 'GENERAL_TRAINING');

ALTER TABLE "test_papers"
  ADD COLUMN "ielts_module" "IeltsModule" NOT NULL DEFAULT 'ACADEMIC';

CREATE TABLE "test_import_sources" (
  "id" UUID NOT NULL,
  "source_system" VARCHAR(80) NOT NULL,
  "external_id" VARCHAR(240) NOT NULL,
  "source_path" TEXT NOT NULL,
  "source_sha256" CHAR(64) NOT NULL,
  "target_group_id" UUID NOT NULL,
  "test_version_id" UUID NOT NULL,
  "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "test_import_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "test_import_sources_source_system_check"
    CHECK (length(btrim("source_system")) > 0),
  CONSTRAINT "test_import_sources_external_id_check"
    CHECK (length(btrim("external_id")) > 0),
  CONSTRAINT "test_import_sources_source_path_check"
    CHECK (length(btrim("source_path")) > 0),
  CONSTRAINT "test_import_sources_source_sha256_check"
    CHECK ("source_sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "test_import_sources_test_version_id_key"
  ON "test_import_sources"("test_version_id");
CREATE UNIQUE INDEX "test_import_sources_source_system_external_id_target_group_id_key"
  ON "test_import_sources"("source_system", "external_id", "target_group_id");
CREATE INDEX "test_import_sources_target_group_id_imported_at_idx"
  ON "test_import_sources"("target_group_id", "imported_at");

ALTER TABLE "test_import_sources"
  ADD CONSTRAINT "test_import_sources_target_group_id_fkey"
  FOREIGN KEY ("target_group_id") REFERENCES "groups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "test_import_sources"
  ADD CONSTRAINT "test_import_sources_test_version_id_fkey"
  FOREIGN KEY ("test_version_id") REFERENCES "test_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
