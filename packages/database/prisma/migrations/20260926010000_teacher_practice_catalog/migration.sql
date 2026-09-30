-- Stable, group-scoped Teacher practice numbering for the paginated catalog.

ALTER TABLE "test_papers"
  ADD COLUMN "practice_number" INTEGER;

WITH "ranked_papers" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "group_id"
      ORDER BY "academic_year" ASC, "created_at" ASC, "id" ASC
    ) AS "practice_number"
  FROM "test_papers"
)
UPDATE "test_papers" AS "paper"
SET "practice_number" = "ranked_papers"."practice_number"
FROM "ranked_papers"
WHERE "paper"."id" = "ranked_papers"."id";

ALTER TABLE "test_papers"
  ALTER COLUMN "practice_number" SET NOT NULL,
  ADD CONSTRAINT "test_papers_practice_number_check"
    CHECK ("practice_number" > 0);

CREATE UNIQUE INDEX "test_papers_group_id_practice_number_key"
  ON "test_papers"("group_id", "practice_number");
