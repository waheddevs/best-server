ALTER TABLE "users"
  ADD COLUMN "phone" VARCHAR(32),
  ADD COLUMN "preferred_language" "Language" NOT NULL DEFAULT 'UZ',
  ADD COLUMN "teacher_subject" VARCHAR(160),
  ADD COLUMN "branch_name" VARCHAR(160),
  ADD COLUMN "avatar_media_object_id" UUID;

CREATE UNIQUE INDEX "users_avatar_media_object_id_key"
  ON "users"("avatar_media_object_id");

ALTER TABLE "users"
  ADD CONSTRAINT "users_avatar_media_object_id_fkey"
  FOREIGN KEY ("avatar_media_object_id") REFERENCES "media_objects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_check"
  CHECK ("phone" IS NULL OR length(btrim("phone")) BETWEEN 7 AND 32),
  ADD CONSTRAINT "users_teacher_profile_check"
  CHECK (
    "role" = 'TEACHER'
    OR ("teacher_subject" IS NULL AND "branch_name" IS NULL)
  );
