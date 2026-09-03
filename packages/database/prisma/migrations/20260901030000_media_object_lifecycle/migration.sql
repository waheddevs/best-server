-- Additive lifecycle metadata for private S3 objects.
CREATE TYPE "MediaObjectStatus" AS ENUM (
  'PENDING_UPLOAD',
  'VERIFYING',
  'READY',
  'REJECTED'
);

CREATE TYPE "MediaObjectSource" AS ENUM (
  'USER_UPLOAD',
  'TELEGRAM_IMPORT',
  'SYSTEM_GENERATED'
);

CREATE TYPE "MediaVisibility" AS ENUM (
  'OWNER_ONLY',
  'DOMAIN_AUTHORIZED'
);

ALTER TABLE "media_objects"
  ADD COLUMN "status" "MediaObjectStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
  ADD COLUMN "source" "MediaObjectSource" NOT NULL DEFAULT 'USER_UPLOAD',
  ADD COLUMN "visibility" "MediaVisibility" NOT NULL DEFAULT 'OWNER_ONLY',
  ADD COLUMN "upload_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "rejected_at" TIMESTAMPTZ(3),
  ADD COLUMN "rejection_code" VARCHAR(80),
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "size_bytes" DROP NOT NULL,
  ALTER COLUMN "checksum_sha256" DROP NOT NULL;

-- Existing records already contain verified size and checksum metadata.
UPDATE "media_objects" AS media
SET
  "status" = 'READY',
  "visibility" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "library_attachments" AS attachment
      WHERE attachment."media_object_id" = media."id"
    ) THEN 'DOMAIN_AUTHORIZED'::"MediaVisibility"
    ELSE 'OWNER_ONLY'::"MediaVisibility"
  END,
  "verified_at" = media."created_at",
  "updated_at" = media."created_at";

CREATE INDEX "media_objects_status_upload_expires_at_idx"
  ON "media_objects"("status", "upload_expires_at");

ALTER TABLE "media_objects"
  ADD CONSTRAINT "media_objects_lifecycle_state_check" CHECK (
    (
      "status" = 'PENDING_UPLOAD' AND
      "upload_expires_at" IS NOT NULL AND
      "size_bytes" IS NULL AND
      "checksum_sha256" IS NULL AND
      "verified_at" IS NULL AND
      "rejected_at" IS NULL AND
      "rejection_code" IS NULL
    ) OR
    (
      "status" = 'VERIFYING' AND
      "upload_expires_at" IS NOT NULL AND
      "size_bytes" IS NULL AND
      "checksum_sha256" IS NULL AND
      "verified_at" IS NULL AND
      "rejected_at" IS NULL AND
      "rejection_code" IS NULL
    ) OR
    (
      "status" = 'READY' AND
      "size_bytes" IS NOT NULL AND
      "checksum_sha256" IS NOT NULL AND
      "verified_at" IS NOT NULL AND
      "rejected_at" IS NULL AND
      "rejection_code" IS NULL
    ) OR
    (
      "status" = 'REJECTED' AND
      "verified_at" IS NULL AND
      "rejected_at" IS NOT NULL AND
      "rejection_code" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "media_objects_lifecycle_time_check" CHECK (
    ("upload_expires_at" IS NULL OR "upload_expires_at" > "created_at") AND
    ("verified_at" IS NULL OR "verified_at" >= "created_at") AND
    ("rejected_at" IS NULL OR "rejected_at" >= "created_at")
  ),
  ADD CONSTRAINT "media_objects_rejection_code_check" CHECK (
    "rejection_code" IS NULL OR
    "rejection_code" ~ '^[A-Z][A-Z0-9_]{1,79}$'
  );

CREATE OR REPLACE FUNCTION "best_protect_media_object_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR
     NEW."created_by_id" IS DISTINCT FROM OLD."created_by_id" OR
     NEW."bucket" IS DISTINCT FROM OLD."bucket" OR
     NEW."object_key" IS DISTINCT FROM OLD."object_key" OR
     NEW."original_name" IS DISTINCT FROM OLD."original_name" OR
     NEW."source" IS DISTINCT FROM OLD."source" OR
     NEW."upload_expires_at" IS DISTINCT FROM OLD."upload_expires_at" OR
     NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'media object identity and upload intent are immutable';
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'PENDING_UPLOAD' AND NEW."status" IN ('VERIFYING', 'REJECTED')) OR
    (OLD."status" = 'VERIFYING' AND NEW."status" IN ('READY', 'REJECTED'))
  ) THEN
    RAISE EXCEPTION 'invalid media object status transition';
  END IF;

  IF OLD."status" IN ('READY', 'REJECTED') AND (
    NEW."media_type" IS DISTINCT FROM OLD."media_type" OR
    NEW."mime_type" IS DISTINCT FROM OLD."mime_type" OR
    NEW."size_bytes" IS DISTINCT FROM OLD."size_bytes" OR
    NEW."checksum_sha256" IS DISTINCT FROM OLD."checksum_sha256" OR
    NEW."verified_at" IS DISTINCT FROM OLD."verified_at" OR
    NEW."rejected_at" IS DISTINCT FROM OLD."rejected_at" OR
    NEW."rejection_code" IS DISTINCT FROM OLD."rejection_code"
  ) THEN
    RAISE EXCEPTION 'terminal media object metadata is immutable';
  END IF;

  NEW."updated_at" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "media_objects_protect_lifecycle"
BEFORE UPDATE ON "media_objects"
FOR EACH ROW
EXECUTE FUNCTION "best_protect_media_object_lifecycle"();

CREATE OR REPLACE FUNCTION "best_require_ready_media_object"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  media_object_id UUID;
  media_status "MediaObjectStatus";
BEGIN
  media_object_id := (to_jsonb(NEW) ->> TG_ARGV[0])::UUID;

  IF media_object_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "status"
  INTO media_status
  FROM "media_objects"
  WHERE "id" = media_object_id;

  IF media_status IS DISTINCT FROM 'READY'::"MediaObjectStatus" THEN
    RAISE EXCEPTION 'media object must be READY before domain attachment';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "library_attachments_require_ready_media"
BEFORE INSERT OR UPDATE OF "media_object_id" ON "library_attachments"
FOR EACH ROW
EXECUTE FUNCTION "best_require_ready_media_object"('media_object_id');

CREATE TRIGGER "payments_require_ready_media"
BEFORE INSERT OR UPDATE OF "receipt_media_id" ON "payments"
FOR EACH ROW
EXECUTE FUNCTION "best_require_ready_media_object"('receipt_media_id');
