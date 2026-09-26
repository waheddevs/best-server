-- Original BEST LC Academic Test paper, skill, response, review, and released-evidence support.

CREATE TYPE "TestSkill" AS ENUM ('LISTENING', 'READING', 'WRITING', 'SPEAKING');
CREATE TYPE "QuestionKind" AS ENUM (
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'SHORT_TEXT',
  'TRUE_FALSE_NOT_GIVEN',
  'YES_NO_NOT_GIVEN',
  'MATCHING',
  'LONG_TEXT',
  'AUDIO_RESPONSE'
);

CREATE TABLE "test_papers" (
  "id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "academic_year" INTEGER NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "source_label" TEXT NOT NULL,
  "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "test_papers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "test_papers_year_check" CHECK ("academic_year" BETWEEN 2000 AND 2200),
  CONSTRAINT "test_papers_archive_state_check" CHECK (
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL) OR
    ("status" <> 'ARCHIVED' AND "archived_at" IS NULL)
  )
);

ALTER TABLE "tests"
  ADD COLUMN "paper_id" UUID,
  ADD COLUMN "skill" "TestSkill",
  ADD CONSTRAINT "tests_paper_skill_pair_check" CHECK (
    ("paper_id" IS NULL AND "skill" IS NULL) OR
    ("paper_id" IS NOT NULL AND "skill" IS NOT NULL)
  );

CREATE TABLE "test_sections" (
  "id" UUID NOT NULL,
  "test_version_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "media_object_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "test_sections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "test_sections_position_check" CHECK ("position" > 0)
);

CREATE TABLE "test_section_translations" (
  "id" UUID NOT NULL,
  "test_section_id" UUID NOT NULL,
  "language" "Language" NOT NULL,
  "title" VARCHAR(240) NOT NULL,
  "instructions" TEXT NOT NULL,
  "content" TEXT,
  CONSTRAINT "test_section_translations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "questions"
  ADD COLUMN "section_id" UUID,
  ADD COLUMN "kind" "QuestionKind" NOT NULL DEFAULT 'SINGLE_CHOICE',
  ADD COLUMN "answer_limit" INTEGER,
  ADD COLUMN "max_selections" INTEGER,
  ADD CONSTRAINT "questions_answer_limit_check" CHECK ("answer_limit" IS NULL OR "answer_limit" > 0),
  ADD CONSTRAINT "questions_max_selections_check" CHECK ("max_selections" IS NULL OR "max_selections" > 0);

CREATE TABLE "question_accepted_answers" (
  "id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "normalized_value" VARCHAR(500) NOT NULL,
  CONSTRAINT "question_accepted_answers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_accepted_answers_position_check" CHECK ("position" > 0),
  CONSTRAINT "question_accepted_answers_value_check" CHECK (length(btrim("normalized_value")) > 0)
);

CREATE TABLE "question_evidence" (
  "id" UUID NOT NULL,
  "question_id" UUID NOT NULL,
  "section_id" UUID NOT NULL,
  "start_offset" INTEGER NOT NULL,
  "end_offset" INTEGER NOT NULL,
  CONSTRAINT "question_evidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_evidence_offsets_check" CHECK (
    "start_offset" >= 0 AND "end_offset" > "start_offset"
  )
);

ALTER TABLE "attempt_answers"
  ALTER COLUMN "selected_option_id" DROP NOT NULL,
  ADD COLUMN "text_value" TEXT,
  ADD COLUMN "response_media_object_id" UUID,
  ADD CONSTRAINT "attempt_answers_response_shape_check" CHECK (
    num_nonnulls("selected_option_id", "text_value", "response_media_object_id") <= 1
  );

CREATE TABLE "attempt_answer_selections" (
  "attempt_answer_id" UUID NOT NULL,
  "answer_option_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "attempt_answer_selections_pkey" PRIMARY KEY ("attempt_answer_id", "answer_option_id"),
  CONSTRAINT "attempt_answer_selections_position_check" CHECK ("position" > 0)
);

CREATE TABLE "attempt_reviews" (
  "id" UUID NOT NULL,
  "attempt_id" UUID NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "rubric_version" VARCHAR(80) NOT NULL,
  "rubric_scores" JSONB NOT NULL,
  "practice_band" DECIMAL(2,1) NOT NULL,
  "feedback" TEXT,
  "reviewed_at" TIMESTAMPTZ(3) NOT NULL,
  "released_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "attempt_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attempt_reviews_band_check" CHECK (
    "practice_band" BETWEEN 0 AND 9 AND ("practice_band" * 2) = trunc("practice_band" * 2)
  ),
  CONSTRAINT "attempt_reviews_release_check" CHECK (
    "released_at" IS NULL OR "released_at" >= "reviewed_at"
  )
);

CREATE UNIQUE INDEX "test_papers_group_id_slug_key" ON "test_papers"("group_id", "slug");
CREATE INDEX "test_papers_group_id_academic_year_status_idx" ON "test_papers"("group_id", "academic_year", "status");
CREATE UNIQUE INDEX "tests_paper_id_skill_key" ON "tests"("paper_id", "skill");
CREATE INDEX "tests_paper_id_idx" ON "tests"("paper_id");
CREATE UNIQUE INDEX "test_sections_test_version_id_position_key" ON "test_sections"("test_version_id", "position");
CREATE INDEX "test_sections_media_object_id_idx" ON "test_sections"("media_object_id");
CREATE UNIQUE INDEX "test_section_translations_test_section_id_language_key" ON "test_section_translations"("test_section_id", "language");
CREATE INDEX "questions_section_id_position_idx" ON "questions"("section_id", "position");
CREATE UNIQUE INDEX "question_accepted_answers_question_id_position_key" ON "question_accepted_answers"("question_id", "position");
CREATE UNIQUE INDEX "question_accepted_answers_question_id_normalized_value_key" ON "question_accepted_answers"("question_id", "normalized_value");
CREATE UNIQUE INDEX "question_evidence_question_id_key" ON "question_evidence"("question_id");
CREATE INDEX "question_evidence_section_id_idx" ON "question_evidence"("section_id");
CREATE INDEX "attempt_answers_response_media_object_id_idx" ON "attempt_answers"("response_media_object_id");
CREATE UNIQUE INDEX "attempt_answer_selections_attempt_answer_id_position_key" ON "attempt_answer_selections"("attempt_answer_id", "position");
CREATE INDEX "attempt_answer_selections_answer_option_id_idx" ON "attempt_answer_selections"("answer_option_id");
CREATE UNIQUE INDEX "attempt_reviews_attempt_id_key" ON "attempt_reviews"("attempt_id");
CREATE INDEX "attempt_reviews_reviewer_id_released_at_reviewed_at_idx" ON "attempt_reviews"("reviewer_id", "released_at", "reviewed_at");

ALTER TABLE "test_papers" ADD CONSTRAINT "test_papers_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_papers" ADD CONSTRAINT "test_papers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tests" ADD CONSTRAINT "tests_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "test_papers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_sections" ADD CONSTRAINT "test_sections_test_version_id_fkey" FOREIGN KEY ("test_version_id") REFERENCES "test_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "test_sections" ADD CONSTRAINT "test_sections_media_object_id_fkey" FOREIGN KEY ("media_object_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_section_translations" ADD CONSTRAINT "test_section_translations_test_section_id_fkey" FOREIGN KEY ("test_section_id") REFERENCES "test_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "test_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "question_accepted_answers" ADD CONSTRAINT "question_accepted_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_evidence" ADD CONSTRAINT "question_evidence_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "question_evidence" ADD CONSTRAINT "question_evidence_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "test_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_response_media_object_id_fkey" FOREIGN KEY ("response_media_object_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_answer_selections" ADD CONSTRAINT "attempt_answer_selections_attempt_answer_id_fkey" FOREIGN KEY ("attempt_answer_id") REFERENCES "attempt_answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_answer_selections" ADD CONSTRAINT "attempt_answer_selections_answer_option_id_fkey" FOREIGN KEY ("answer_option_id") REFERENCES "answer_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_reviews" ADD CONSTRAINT "attempt_reviews_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attempt_reviews" ADD CONSTRAINT "attempt_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New version-owned content receives the same immutability protection as existing questions.
CREATE TRIGGER "test_sections_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "test_sections"
  FOR EACH ROW EXECUTE FUNCTION "protect_direct_test_version_content"();

CREATE FUNCTION "protect_test_section_content"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status "TestVersionStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT tv."status" INTO version_status
    FROM "test_sections" ts
    JOIN "test_versions" tv ON tv."id" = ts."test_version_id"
    WHERE ts."id" = OLD."test_section_id";
    IF version_status = 'PUBLISHED' THEN RAISE EXCEPTION 'published test section content is immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT tv."status" INTO version_status
    FROM "test_sections" ts
    JOIN "test_versions" tv ON tv."id" = ts."test_version_id"
    WHERE ts."id" = NEW."test_section_id";
    IF version_status = 'PUBLISHED' THEN RAISE EXCEPTION 'published test section content is immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "test_section_translations_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "test_section_translations"
  FOR EACH ROW EXECUTE FUNCTION "protect_test_section_content"();

CREATE TRIGGER "question_accepted_answers_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "question_accepted_answers"
  FOR EACH ROW EXECUTE FUNCTION "protect_question_content"();

CREATE FUNCTION "protect_question_evidence_content"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status "TestVersionStatus";
  evidence_question_id UUID;
BEGIN
  evidence_question_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."question_id" ELSE NEW."question_id" END;
  SELECT tv."status" INTO version_status
  FROM "questions" q
  JOIN "test_versions" tv ON tv."id" = q."test_version_id"
  WHERE q."id" = evidence_question_id;
  IF version_status = 'PUBLISHED' THEN RAISE EXCEPTION 'published question evidence is immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_evidence_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "question_evidence"
  FOR EACH ROW EXECUTE FUNCTION "protect_question_evidence_content"();

-- Replace the legacy selected-option-only invariant with kind-aware response validation.
CREATE OR REPLACE FUNCTION "protect_attempt_answers"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_status "AttemptStatus";
  attempt_version_id UUID;
  question_version_id UUID;
  question_kind "QuestionKind";
  option_question_id UUID;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "status" INTO attempt_status FROM "attempts" WHERE "id" = OLD."attempt_id";
    IF attempt_status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'submitted attempt answers are immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "status", "test_version_id" INTO attempt_status, attempt_version_id FROM "attempts" WHERE "id" = NEW."attempt_id";
    SELECT "test_version_id", "kind" INTO question_version_id, question_kind FROM "questions" WHERE "id" = NEW."question_id";
    IF attempt_status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'submitted attempt answers are immutable'; END IF;
    IF attempt_version_id IS DISTINCT FROM question_version_id THEN RAISE EXCEPTION 'attempt answer must reference its test-version question'; END IF;
    IF NEW."selected_option_id" IS NOT NULL THEN
      SELECT "question_id" INTO option_question_id FROM "answer_options" WHERE "id" = NEW."selected_option_id";
      IF option_question_id IS DISTINCT FROM NEW."question_id" THEN RAISE EXCEPTION 'attempt answer option must belong to its question'; END IF;
    END IF;
    IF question_kind IN ('SINGLE_CHOICE', 'TRUE_FALSE_NOT_GIVEN', 'YES_NO_NOT_GIVEN') AND NEW."selected_option_id" IS NULL THEN
      RAISE EXCEPTION 'this question requires one selected option';
    ELSIF question_kind IN ('SHORT_TEXT', 'LONG_TEXT') AND (NEW."text_value" IS NULL OR length(btrim(NEW."text_value")) = 0) THEN
      RAISE EXCEPTION 'this question requires a text response';
    ELSIF question_kind = 'AUDIO_RESPONSE' AND NEW."response_media_object_id" IS NULL THEN
      RAISE EXCEPTION 'this question requires an audio response';
    ELSIF question_kind IN ('MULTIPLE_CHOICE', 'MATCHING') AND num_nonnulls(NEW."selected_option_id", NEW."text_value", NEW."response_media_object_id") <> 0 THEN
      RAISE EXCEPTION 'this question stores its response as selections';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "protect_attempt_answer_selections"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  answer_attempt_id UUID;
  answer_question_id UUID;
  attempt_status "AttemptStatus";
  question_kind "QuestionKind";
  option_question_id UUID;
BEGIN
  SELECT aa."attempt_id", aa."question_id" INTO answer_attempt_id, answer_question_id
  FROM "attempt_answers" aa
  WHERE aa."id" = CASE WHEN TG_OP = 'DELETE' THEN OLD."attempt_answer_id" ELSE NEW."attempt_answer_id" END;
  SELECT "status" INTO attempt_status FROM "attempts" WHERE "id" = answer_attempt_id;
  SELECT "kind" INTO question_kind FROM "questions" WHERE "id" = answer_question_id;
  IF attempt_status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'submitted attempt answer selections are immutable'; END IF;
  IF question_kind NOT IN ('MULTIPLE_CHOICE', 'MATCHING') THEN RAISE EXCEPTION 'this question does not accept multiple selections'; END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT "question_id" INTO option_question_id FROM "answer_options" WHERE "id" = NEW."answer_option_id";
    IF option_question_id IS DISTINCT FROM answer_question_id THEN RAISE EXCEPTION 'attempt answer selection must belong to its question'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempt_answer_selections_protect_submitted"
  BEFORE INSERT OR UPDATE OR DELETE ON "attempt_answer_selections"
  FOR EACH ROW EXECUTE FUNCTION "protect_attempt_answer_selections"();
