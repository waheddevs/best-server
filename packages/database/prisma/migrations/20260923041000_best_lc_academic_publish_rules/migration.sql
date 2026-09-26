-- Publish validation for mixed IELTS-style question kinds and released evidence.
CREATE OR REPLACE FUNCTION "protect_published_test_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published test versions are immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."status" = 'PUBLISHED' THEN
    IF NOT EXISTS (
      SELECT 1 FROM "test_translations" tt
      WHERE tt."test_version_id" = NEW."id"
        AND tt."language" = NEW."primary_language"
    ) THEN
      RAISE EXCEPTION 'primary-language test translation is required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM "questions" q WHERE q."test_version_id" = NEW."id") THEN
      RAISE EXCEPTION 'a published test requires at least one question';
    END IF;

    IF NEW."scoring_rule_version" NOT IN ('single-choice-v1', 'objective-v2', 'manual-rubric-v1') THEN
      RAISE EXCEPTION 'the scoring rule version is not supported';
    END IF;

    IF EXISTS (
      SELECT 1 FROM "questions" q
      WHERE q."test_version_id" = NEW."id"
        AND NOT EXISTS (
          SELECT 1 FROM "question_translations" qt
          WHERE qt."question_id" = q."id"
            AND qt."language" = NEW."primary_language"
        )
    ) THEN
      RAISE EXCEPTION 'every published question requires primary-language content';
    END IF;

    IF NEW."scoring_rule_version" = 'single-choice-v1' AND EXISTS (
      SELECT 1 FROM "questions" q
      WHERE q."test_version_id" = NEW."id"
        AND (
          q."kind" <> 'SINGLE_CHOICE' OR
          (SELECT count(*) FROM "answer_options" ao WHERE ao."question_id" = q."id") < 2 OR
          (SELECT count(*) FROM "answer_options" ao WHERE ao."question_id" = q."id" AND ao."is_correct") <> 1
        )
    ) THEN
      RAISE EXCEPTION 'single-choice-v1 requires complete single-choice questions';
    END IF;

    IF NEW."scoring_rule_version" = 'objective-v2' AND EXISTS (
      SELECT 1 FROM "questions" q
      WHERE q."test_version_id" = NEW."id"
        AND (
          q."kind" IN ('LONG_TEXT', 'AUDIO_RESPONSE') OR
          (
            q."kind" IN ('SINGLE_CHOICE', 'TRUE_FALSE_NOT_GIVEN', 'YES_NO_NOT_GIVEN')
            AND (
              (SELECT count(*) FROM "answer_options" ao WHERE ao."question_id" = q."id") < 2 OR
              (SELECT count(*) FROM "answer_options" ao WHERE ao."question_id" = q."id" AND ao."is_correct") <> 1
            )
          ) OR
          (
            q."kind" IN ('MULTIPLE_CHOICE', 'MATCHING')
            AND (
              (SELECT count(*) FROM "answer_options" ao WHERE ao."question_id" = q."id") < 2 OR
              (SELECT count(*) FROM "answer_options" ao WHERE ao."question_id" = q."id" AND ao."is_correct") < 1
            )
          ) OR
          (
            q."kind" = 'SHORT_TEXT'
            AND NOT EXISTS (
              SELECT 1 FROM "question_accepted_answers" qaa
              WHERE qaa."question_id" = q."id"
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'objective-v2 contains incomplete or unsupported questions';
    END IF;

    IF NEW."scoring_rule_version" = 'manual-rubric-v1' AND EXISTS (
      SELECT 1 FROM "questions" q
      WHERE q."test_version_id" = NEW."id"
        AND q."kind" NOT IN ('LONG_TEXT', 'AUDIO_RESPONSE')
    ) THEN
      RAISE EXCEPTION 'manual-rubric-v1 accepts only long-text or audio-response questions';
    END IF;

    IF EXISTS (
      SELECT 1 FROM "answer_options" ao
      JOIN "questions" q ON q."id" = ao."question_id"
      WHERE q."test_version_id" = NEW."id"
        AND NOT EXISTS (
          SELECT 1 FROM "answer_option_translations" aot
          WHERE aot."answer_option_id" = ao."id"
            AND aot."language" = NEW."primary_language"
        )
    ) THEN
      RAISE EXCEPTION 'every published answer option requires primary-language content';
    END IF;

    IF EXISTS (
      SELECT 1 FROM "tests" t
      WHERE t."id" = NEW."test_id"
        AND t."paper_id" IS NOT NULL
        AND (
          NOT EXISTS (
            SELECT 1 FROM "test_sections" ts
            JOIN "test_section_translations" tst
              ON tst."test_section_id" = ts."id"
             AND tst."language" = NEW."primary_language"
            WHERE ts."test_version_id" = NEW."id"
          ) OR
          EXISTS (
            SELECT 1 FROM "questions" q
            LEFT JOIN "test_sections" ts ON ts."id" = q."section_id"
            WHERE q."test_version_id" = NEW."id"
              AND (ts."id" IS NULL OR ts."test_version_id" <> NEW."id")
          )
        )
    ) THEN
      RAISE EXCEPTION 'paper tests require translated sections and section-owned questions';
    END IF;

    IF EXISTS (
      SELECT 1 FROM "question_evidence" qe
      JOIN "questions" q ON q."id" = qe."question_id"
      JOIN "test_sections" ts ON ts."id" = qe."section_id"
      LEFT JOIN "test_section_translations" tst
        ON tst."test_section_id" = ts."id"
       AND tst."language" = NEW."primary_language"
      WHERE q."test_version_id" = NEW."id"
        AND (
          q."section_id" IS DISTINCT FROM qe."section_id" OR
          ts."test_version_id" <> NEW."id" OR
          tst."id" IS NULL OR
          qe."start_offset" < 0 OR
          qe."end_offset" <= qe."start_offset" OR
          qe."end_offset" > length(coalesce(tst."content", ''))
        )
    ) THEN
      RAISE EXCEPTION 'question evidence must reference a valid range in its own section';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
