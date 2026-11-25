-- CreateEnum
CREATE TYPE "AiChatRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AiMessageKind" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AiProviderCallStatus" AS ENUM ('DISPATCHED', 'COMPLETED', 'REJECTED', 'AMBIGUOUS');

-- AlterEnum
ALTER TYPE "OutboxEventType" ADD VALUE 'TEACHER_AI_CHAT_REQUESTED_V1';

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" VARCHAR(80) NOT NULL DEFAULT 'New conversation',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "notice_version" VARCHAR(80) NOT NULL,
    "consent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_sequence" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "AiMessageKind" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "response_run_id" UUID,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_runs" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "trigger_message_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "frozen_through_sequence" INTEGER NOT NULL,
    "prompt_policy_version" VARCHAR(80) NOT NULL DEFAULT 'teacher-text-v1',
    "model" VARCHAR(160) NOT NULL,
    "provider_endpoint" VARCHAR(160) NOT NULL,
    "status" "AiChatRunStatus" NOT NULL DEFAULT 'QUEUED',
    "safe_error_code" VARCHAR(80),
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_chat_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_calls" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "provider_request_id" VARCHAR(160),
    "reported_model" VARCHAR(160),
    "reported_provider" VARCHAR(160),
    "status" "AiProviderCallStatus" NOT NULL DEFAULT 'DISPATCHED',
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "actual_usd" DECIMAL(20,9),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_provider_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_owner_id_archived_at_created_at_id_idx" ON "ai_conversations"("owner_id", "archived_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "ai_conversations_expires_at_idx" ON "ai_conversations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_conversations_id_owner_id_key" ON "ai_conversations"("id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_response_run_id_key" ON "ai_messages"("response_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_response_run_id_conversation_id_key" ON "ai_messages"("response_run_id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_conversation_id_sequence_key" ON "ai_messages"("conversation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_id_conversation_id_key" ON "ai_messages"("id", "conversation_id");

-- CreateIndex
CREATE INDEX "ai_chat_runs_status_lease_expires_at_idx" ON "ai_chat_runs"("status", "lease_expires_at");

-- CreateIndex
CREATE INDEX "ai_chat_runs_requester_id_created_at_idx" ON "ai_chat_runs"("requester_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_chat_runs_created_at_idx" ON "ai_chat_runs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chat_runs_requester_id_idempotency_key_key" ON "ai_chat_runs"("requester_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chat_runs_id_conversation_id_key" ON "ai_chat_runs"("id", "conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_calls_run_id_key" ON "ai_provider_calls"("run_id");

-- CreateIndex
CREATE INDEX "ai_provider_calls_started_at_idx" ON "ai_provider_calls"("started_at");

-- CreateIndex
CREATE INDEX "ai_provider_calls_status_started_at_idx" ON "ai_provider_calls"("status", "started_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_response_run_id_conversation_id_fkey" FOREIGN KEY ("response_run_id", "conversation_id") REFERENCES "ai_chat_runs"("id", "conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_runs" ADD CONSTRAINT "ai_chat_runs_conversation_id_requester_id_fkey" FOREIGN KEY ("conversation_id", "requester_id") REFERENCES "ai_conversations"("id", "owner_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_runs" ADD CONSTRAINT "ai_chat_runs_trigger_message_id_conversation_id_fkey" FOREIGN KEY ("trigger_message_id", "conversation_id") REFERENCES "ai_messages"("id", "conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_provider_calls" ADD CONSTRAINT "ai_provider_calls_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_chat_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Runtime uses a transaction advisory lock; these indexes defend invariants
-- against accidental writers outside that lock as well.
CREATE UNIQUE INDEX "ai_one_active_run_per_conversation" ON "ai_chat_runs" ("conversation_id") WHERE "status" IN ('QUEUED', 'RUNNING');
CREATE UNIQUE INDEX "ai_one_active_run_per_teacher" ON "ai_chat_runs" ("requester_id") WHERE "status" IN ('QUEUED', 'RUNNING');
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_message_content_bounds" CHECK (length("content") BETWEEN 1 AND 32000);
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_message_sequence_positive" CHECK ("sequence" > 0);
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_response_kind" CHECK (("kind" = 'USER' AND "response_run_id" IS NULL) OR ("kind" = 'ASSISTANT' AND "response_run_id" IS NOT NULL));
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversation_sequence_positive" CHECK ("next_sequence" > 0);
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversation_retention_bounds" CHECK ("expires_at" > "created_at");
ALTER TABLE "ai_chat_runs" ADD CONSTRAINT "ai_run_sequence_positive" CHECK ("frozen_through_sequence" > 0);
ALTER TABLE "ai_provider_calls" ADD CONSTRAINT "ai_usage_nonnegative" CHECK (("actual_usd" IS NULL OR "actual_usd" >= 0) AND ("input_tokens" IS NULL OR "input_tokens" >= 0) AND ("output_tokens" IS NULL OR "output_tokens" >= 0));
