ALTER TABLE "question_accepted_answers"
  DISABLE TRIGGER "question_accepted_answers_protect_published";

WITH "display_value_replacements" AS (
  SELECT
    target_answer."id",
    (
      SELECT source_answer."display_value"
      FROM "questions" AS current_question
      JOIN "test_versions" AS current_version
        ON current_version."id" = current_question."test_version_id"
      JOIN "test_versions" AS source_version
        ON source_version."test_id" = current_version."test_id"
       AND source_version."id" <> current_version."id"
      JOIN "questions" AS source_question
        ON source_question."test_version_id" = source_version."id"
       AND source_question."position" = current_question."position"
      JOIN "question_accepted_answers" AS source_answer
        ON source_answer."question_id" = source_question."id"
       AND source_answer."normalized_value" = target_answer."normalized_value"
      WHERE current_question."id" = target_answer."question_id"
        AND source_answer."display_value" <> source_answer."normalized_value"
      ORDER BY
        CASE WHEN source_version."status" = 'PUBLISHED' THEN 0 ELSE 1 END,
        source_version."version" DESC,
        source_answer."position"
      LIMIT 1
    ) AS "display_value"
  FROM "question_accepted_answers" AS target_answer
  WHERE target_answer."display_value" = target_answer."normalized_value"
)
UPDATE "question_accepted_answers" AS target_answer
SET "display_value" = replacement."display_value"
FROM "display_value_replacements" AS replacement
WHERE target_answer."id" = replacement."id"
  AND replacement."display_value" IS NOT NULL;

ALTER TABLE "question_accepted_answers"
  ENABLE TRIGGER "question_accepted_answers_protect_published";
