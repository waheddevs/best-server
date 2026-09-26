CREATE TYPE "LessonMaterialKind" AS ENUM ('MATERIAL', 'TASK');

ALTER TABLE "lessons"
  ADD COLUMN "lesson_number" INTEGER,
  ADD COLUMN "archived_at" TIMESTAMPTZ(3);

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "group_id"
      ORDER BY "starts_at" ASC, "id" ASC
    )::INTEGER AS "lesson_number"
  FROM "lessons"
)
UPDATE "lessons" AS lesson
SET "lesson_number" = numbered."lesson_number"
FROM numbered
WHERE lesson."id" = numbered."id";

ALTER TABLE "lessons"
  ALTER COLUMN "lesson_number" SET NOT NULL;

ALTER TABLE "lesson_materials"
  ADD COLUMN "kind" "LessonMaterialKind" NOT NULL DEFAULT 'MATERIAL';

CREATE UNIQUE INDEX "lessons_group_id_lesson_number_key"
  ON "lessons"("group_id", "lesson_number");

ALTER TABLE "lessons"
  ADD CONSTRAINT "lessons_lesson_number_positive"
  CHECK ("lesson_number" > 0);

CREATE INDEX "lessons_group_id_archived_at_lesson_number_idx"
  ON "lessons"("group_id", "archived_at", "lesson_number");

CREATE INDEX "lesson_materials_lesson_id_kind_position_idx"
  ON "lesson_materials"("lesson_id", "kind", "position");
