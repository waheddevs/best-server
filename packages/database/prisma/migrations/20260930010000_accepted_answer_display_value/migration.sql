ALTER TABLE "question_accepted_answers"
  ADD COLUMN "display_value" VARCHAR(500);

ALTER TABLE "question_accepted_answers"
  DISABLE TRIGGER "question_accepted_answers_protect_published";

UPDATE "question_accepted_answers" AS accepted
SET "display_value" = COALESCE(
  (
    SELECT substring(
      translation."content"
      FROM evidence."start_offset" + 1
      FOR evidence."end_offset" - evidence."start_offset"
    )
    FROM "questions" AS question
    JOIN "test_versions" AS version
      ON version."id" = question."test_version_id"
    JOIN "question_evidence" AS evidence
      ON evidence."question_id" = question."id"
    JOIN "test_section_translations" AS translation
      ON translation."test_section_id" = evidence."section_id"
     AND translation."language" = version."primary_language"
    WHERE question."id" = accepted."question_id"
      AND lower(
        regexp_replace(
          btrim(
            substring(
              translation."content"
              FROM evidence."start_offset" + 1
              FOR evidence."end_offset" - evidence."start_offset"
            )
          ),
          E'\\s+',
          ' ',
          'g'
        )
      ) = accepted."normalized_value"
    LIMIT 1
  ),
  accepted."normalized_value"
);

ALTER TABLE "question_accepted_answers"
  ENABLE TRIGGER "question_accepted_answers_protect_published";

ALTER TABLE "question_accepted_answers"
  ALTER COLUMN "display_value" SET NOT NULL,
  ADD CONSTRAINT "question_accepted_answers_display_value_check"
    CHECK (length(btrim("display_value")) > 0);
