ALTER TABLE "users"
  ADD COLUMN "first_name" VARCHAR(80),
  ADD COLUMN "last_name" VARCHAR(80),
  ADD CONSTRAINT "users_first_name_check"
    CHECK ("first_name" IS NULL OR (
      "first_name" = btrim("first_name") AND length("first_name") > 0
    )),
  ADD CONSTRAINT "users_last_name_check"
    CHECK ("last_name" IS NULL OR (
      "last_name" = btrim("last_name") AND length("last_name") > 0
      AND "first_name" IS NOT NULL
    ));

-- Preserve the source display_name. Do not invent surnames or guess the
-- boundaries of names containing more than two whitespace-separated parts.
WITH normalized_names AS (
  SELECT "id",
    btrim(regexp_replace("display_name", '[[:space:]]+', ' ', 'g')) AS name
  FROM "users"
), name_parts AS (
  SELECT "id", string_to_array(name, ' ') AS parts
  FROM normalized_names
  WHERE name <> ''
)
UPDATE "users" AS target
SET "first_name" = parts[1], "last_name" = parts[2]
FROM name_parts
WHERE target."id" = name_parts."id"
  AND cardinality(parts) BETWEEN 1 AND 2
  AND char_length(parts[1]) <= 80
  AND (parts[2] IS NULL OR char_length(parts[2]) <= 80);
