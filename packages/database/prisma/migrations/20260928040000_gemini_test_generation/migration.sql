-- Backend-only Gemini Teacher test generation request lifecycle.

CREATE TYPE "TestGenerationRequestStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "test_generation_requests" (
  "id" UUID NOT NULL,
  "actor_id" UUID NOT NULL,
  "group_id" UUID NOT NULL,
  "test_paper_id" UUID,
  "idempotency_key" UUID NOT NULL,
  "topic" VARCHAR(240) NOT NULL,
  "ielts_module" "IeltsModule" NOT NULL,
  "provider" VARCHAR(40) NOT NULL,
  "model" VARCHAR(120) NOT NULL,
  "prompt_version" VARCHAR(40) NOT NULL,
  "schema_version" VARCHAR(40) NOT NULL,
  "status" "TestGenerationRequestStatus" NOT NULL DEFAULT 'RUNNING',
  "failure_code" VARCHAR(80),
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "test_generation_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "test_generation_requests_topic_check"
    CHECK (length(btrim("topic")) BETWEEN 1 AND 240),
  CONSTRAINT "test_generation_requests_provider_check"
    CHECK (length(btrim("provider")) > 0),
  CONSTRAINT "test_generation_requests_model_check"
    CHECK (length(btrim("model")) > 0),
  CONSTRAINT "test_generation_requests_prompt_version_check"
    CHECK (length(btrim("prompt_version")) > 0),
  CONSTRAINT "test_generation_requests_schema_version_check"
    CHECK (length(btrim("schema_version")) > 0),
  CONSTRAINT "test_generation_requests_token_counts_check"
    CHECK (
      ("input_tokens" IS NULL OR "input_tokens" >= 0) AND
      ("output_tokens" IS NULL OR "output_tokens" >= 0)
    ),
  CONSTRAINT "test_generation_requests_expiry_check"
    CHECK ("expires_at" > "created_at"),
  CONSTRAINT "test_generation_requests_lifecycle_check" CHECK (
    (
      "status" = 'RUNNING' AND
      "test_paper_id" IS NULL AND
      "failure_code" IS NULL AND
      "completed_at" IS NULL
    ) OR
    (
      "status" = 'COMPLETED' AND
      "test_paper_id" IS NOT NULL AND
      "failure_code" IS NULL AND
      "completed_at" IS NOT NULL
    ) OR
    (
      "status" = 'FAILED' AND
      "test_paper_id" IS NULL AND
      "failure_code" IS NOT NULL AND
      "completed_at" IS NOT NULL
    )
  ),
  CONSTRAINT "test_generation_requests_failure_code_check"
    CHECK ("failure_code" IS NULL OR "failure_code" ~ '^[A-Z][A-Z0-9_]{1,79}$')
);

CREATE UNIQUE INDEX "test_generation_requests_test_paper_id_key"
  ON "test_generation_requests"("test_paper_id");
CREATE UNIQUE INDEX "test_generation_requests_actor_id_idempotency_key_key"
  ON "test_generation_requests"("actor_id", "idempotency_key");
CREATE INDEX "test_generation_requests_actor_id_created_at_idx"
  ON "test_generation_requests"("actor_id", "created_at");
CREATE INDEX "test_generation_requests_status_expires_at_idx"
  ON "test_generation_requests"("status", "expires_at");
CREATE INDEX "test_generation_requests_group_id_created_at_idx"
  ON "test_generation_requests"("group_id", "created_at");

ALTER TABLE "test_generation_requests"
  ADD CONSTRAINT "test_generation_requests_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_generation_requests"
  ADD CONSTRAINT "test_generation_requests_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "test_generation_requests"
  ADD CONSTRAINT "test_generation_requests_test_paper_id_fkey"
  FOREIGN KEY ("test_paper_id") REFERENCES "test_papers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
