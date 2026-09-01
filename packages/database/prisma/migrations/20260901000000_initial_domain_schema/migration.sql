-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'TEACHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TestVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('UZ', 'RU', 'EN');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'SCORED');

-- CreateEnum
CREATE TYPE "AttemptSubmissionReason" AS ENUM ('MANUAL', 'DURATION_EXPIRED', 'AVAILABILITY_ENDED');

-- CreateEnum
CREATE TYPE "LibraryVisibility" AS ENUM ('ALL_GROUPS', 'SELECTED_GROUPS');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('PDF', 'IMAGE', 'AUDIO', 'VIDEO');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD');

-- CreateEnum
CREATE TYPE "FinanceAdjustmentKind" AS ENUM ('CREDIT', 'DEBIT', 'REVERSAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "display_name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "payment_deadline_day" INTEGER NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_categories" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tests" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_versions" (
    "id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "TestVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "primary_language" "Language" NOT NULL,
    "availability_starts_at" TIMESTAMPTZ(3),
    "availability_ends_at" TIMESTAMPTZ(3),
    "duration_minutes" INTEGER,
    "attempt_limit" INTEGER NOT NULL DEFAULT 1,
    "passing_percentage" INTEGER NOT NULL DEFAULT 60,
    "scoring_rule_version" VARCHAR(80) NOT NULL DEFAULT 'single-choice-v1',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "test_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_translations" (
    "id" UUID NOT NULL,
    "test_version_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT,

    CONSTRAINT "test_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "test_version_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_translations" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "prompt" TEXT NOT NULL,

    CONSTRAINT "question_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "answer_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_option_translations" (
    "id" UUID NOT NULL,
    "answer_option_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "answer_option_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "test_version_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),
    "submitted_at" TIMESTAMPTZ(3),
    "submission_reason" "AttemptSubmissionReason",
    "correct_answer_count" INTEGER,
    "total_question_count" INTEGER,
    "percentage" DECIMAL(5,2),
    "passed" BOOLEAN,
    "passing_percentage" INTEGER,
    "scoring_rule_version" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "selected_option_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_grants" (
    "id" UUID NOT NULL,
    "test_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "additional_attempts" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_categories" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "library_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_items" (
    "id" UUID NOT NULL,
    "owner_teacher_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "primary_language" "Language" NOT NULL,
    "visibility" "LibraryVisibility" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_translations" (
    "id" UUID NOT NULL,
    "library_item_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT,

    CONSTRAINT "library_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_group_access" (
    "library_item_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,

    CONSTRAINT "library_group_access_pkey" PRIMARY KEY ("library_item_id","group_id")
);

-- CreateTable
CREATE TABLE "media_objects" (
    "id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "bucket" VARCHAR(120) NOT NULL,
    "object_key" VARCHAR(1024) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(160) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_attachments" (
    "id" UUID NOT NULL,
    "library_item_id" UUID NOT NULL,
    "media_object_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "library_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_import_runs" (
    "id" UUID NOT NULL,
    "channel_id" VARCHAR(120) NOT NULL,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "failure" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telegram_import_records" (
    "id" UUID NOT NULL,
    "import_run_id" UUID NOT NULL,
    "library_item_id" UUID NOT NULL,
    "channel_id" VARCHAR(120) NOT NULL,
    "message_id" BIGINT NOT NULL,
    "message_date" TIMESTAMPTZ(3) NOT NULL,
    "original_text" TEXT,
    "source_group_name" VARCHAR(240),
    "imported_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_import_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_tuition_rates" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "amount_uzs" BIGINT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_tuition_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_tuition_overrides" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "amount_uzs" BIGINT NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_tuition_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tuition_charges" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "billing_month" DATE NOT NULL,
    "amount_uzs" BIGINT NOT NULL,
    "due_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tuition_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "amount_uzs" BIGINT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_at" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "transaction_reference" VARCHAR(255),
    "receipt_media_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "amount_uzs" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_adjustments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "recorded_by_id" UUID NOT NULL,
    "payment_id" UUID,
    "charge_id" UUID,
    "kind" "FinanceAdjustmentKind" NOT NULL,
    "amount_uzs" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "target_type" VARCHAR(120) NOT NULL,
    "target_id" VARCHAR(160) NOT NULL,
    "correlation_id" VARCHAR(120),
    "reason" TEXT,
    "old_values" JSONB,
    "new_values" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "groups_status_idx" ON "groups"("status");

-- CreateIndex
CREATE UNIQUE INDEX "groups_teacher_id_name_key" ON "groups"("teacher_id", "name");

-- CreateIndex
CREATE INDEX "group_memberships_group_id_ended_at_idx" ON "group_memberships"("group_id", "ended_at");

-- CreateIndex
CREATE INDEX "group_memberships_student_id_started_at_idx" ON "group_memberships"("student_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_categories_teacher_id_name_key" ON "test_categories"("teacher_id", "name");

-- CreateIndex
CREATE INDEX "tests_group_id_status_idx" ON "tests"("group_id", "status");

-- CreateIndex
CREATE INDEX "tests_category_id_idx" ON "tests"("category_id");

-- CreateIndex
CREATE INDEX "test_versions_status_availability_starts_at_availability_en_idx" ON "test_versions"("status", "availability_starts_at", "availability_ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_versions_test_id_version_key" ON "test_versions"("test_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "test_translations_test_version_id_language_key" ON "test_translations"("test_version_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "questions_test_version_id_position_key" ON "questions"("test_version_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "question_translations_question_id_language_key" ON "question_translations"("question_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "answer_options_question_id_position_key" ON "answer_options"("question_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "answer_option_translations_answer_option_id_language_key" ON "answer_option_translations"("answer_option_id", "language");

-- CreateIndex
CREATE INDEX "attempts_test_version_id_status_idx" ON "attempts"("test_version_id", "status");

-- CreateIndex
CREATE INDEX "attempts_group_membership_id_submitted_at_idx" ON "attempts"("group_membership_id", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_student_id_test_version_id_attempt_number_key" ON "attempts"("student_id", "test_version_id", "attempt_number");

-- CreateIndex
CREATE INDEX "attempt_answers_selected_option_id_idx" ON "attempt_answers"("selected_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attempt_id_question_id_key" ON "attempt_answers"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "attempt_grants_student_id_test_id_idx" ON "attempt_grants"("student_id", "test_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_categories_teacher_id_name_key" ON "library_categories"("teacher_id", "name");

-- CreateIndex
CREATE INDEX "library_items_category_id_status_idx" ON "library_items"("category_id", "status");

-- CreateIndex
CREATE INDEX "library_items_owner_teacher_id_visibility_idx" ON "library_items"("owner_teacher_id", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "library_translations_library_item_id_language_key" ON "library_translations"("library_item_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "media_objects_object_key_key" ON "media_objects"("object_key");

-- CreateIndex
CREATE INDEX "media_objects_created_by_id_media_type_idx" ON "media_objects"("created_by_id", "media_type");

-- CreateIndex
CREATE UNIQUE INDEX "library_attachments_library_item_id_position_key" ON "library_attachments"("library_item_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "library_attachments_library_item_id_media_object_id_key" ON "library_attachments"("library_item_id", "media_object_id");

-- CreateIndex
CREATE INDEX "telegram_import_runs_channel_id_created_at_idx" ON "telegram_import_runs"("channel_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_import_records_library_item_id_key" ON "telegram_import_records"("library_item_id");

-- CreateIndex
CREATE INDEX "telegram_import_records_import_run_id_idx" ON "telegram_import_records"("import_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "telegram_import_records_channel_id_message_id_key" ON "telegram_import_records"("channel_id", "message_id");

-- CreateIndex
CREATE INDEX "group_tuition_rates_group_id_effective_from_idx" ON "group_tuition_rates"("group_id", "effective_from");

-- CreateIndex
CREATE INDEX "student_tuition_overrides_student_id_group_id_effective_fro_idx" ON "student_tuition_overrides"("student_id", "group_id", "effective_from");

-- CreateIndex
CREATE INDEX "tuition_charges_group_membership_id_due_date_idx" ON "tuition_charges"("group_membership_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "tuition_charges_student_id_billing_month_key" ON "tuition_charges"("student_id", "billing_month");

-- CreateIndex
CREATE INDEX "payments_student_id_paid_at_idx" ON "payments"("student_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_recorded_by_id_created_at_idx" ON "payments"("recorded_by_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_allocations_charge_id_idx" ON "payment_allocations"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_charge_id_key" ON "payment_allocations"("payment_id", "charge_id");

-- CreateIndex
CREATE INDEX "finance_adjustments_student_id_created_at_idx" ON "finance_adjustments"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "finance_adjustments_payment_id_idx" ON "finance_adjustments"("payment_id");

-- CreateIndex
CREATE INDEX "finance_adjustments_charge_id_idx" ON "finance_adjustments"("charge_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_created_at_idx" ON "audit_logs"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_correlation_id_idx" ON "audit_logs"("correlation_id");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_categories" ADD CONSTRAINT "test_categories_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tests" ADD CONSTRAINT "tests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "test_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_versions" ADD CONSTRAINT "test_versions_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_translations" ADD CONSTRAINT "test_translations_test_version_id_fkey" FOREIGN KEY ("test_version_id") REFERENCES "test_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_test_version_id_fkey" FOREIGN KEY ("test_version_id") REFERENCES "test_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_translations" ADD CONSTRAINT "question_translations_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_options" ADD CONSTRAINT "answer_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_option_translations" ADD CONSTRAINT "answer_option_translations_answer_option_id_fkey" FOREIGN KEY ("answer_option_id") REFERENCES "answer_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_test_version_id_fkey" FOREIGN KEY ("test_version_id") REFERENCES "test_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_group_membership_id_fkey" FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_selected_option_id_fkey" FOREIGN KEY ("selected_option_id") REFERENCES "answer_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_grants" ADD CONSTRAINT "attempt_grants_test_id_fkey" FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_grants" ADD CONSTRAINT "attempt_grants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_grants" ADD CONSTRAINT "attempt_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_categories" ADD CONSTRAINT "library_categories_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_owner_teacher_id_fkey" FOREIGN KEY ("owner_teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "library_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_translations" ADD CONSTRAINT "library_translations_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_group_access" ADD CONSTRAINT "library_group_access_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_group_access" ADD CONSTRAINT "library_group_access_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_objects" ADD CONSTRAINT "media_objects_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_attachments" ADD CONSTRAINT "library_attachments_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_attachments" ADD CONSTRAINT "library_attachments_media_object_id_fkey" FOREIGN KEY ("media_object_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_import_records" ADD CONSTRAINT "telegram_import_records_import_run_id_fkey" FOREIGN KEY ("import_run_id") REFERENCES "telegram_import_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telegram_import_records" ADD CONSTRAINT "telegram_import_records_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "library_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tuition_rates" ADD CONSTRAINT "group_tuition_rates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_tuition_rates" ADD CONSTRAINT "group_tuition_rates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_tuition_overrides" ADD CONSTRAINT "student_tuition_overrides_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_tuition_overrides" ADD CONSTRAINT "student_tuition_overrides_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_tuition_overrides" ADD CONSTRAINT "student_tuition_overrides_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tuition_charges" ADD CONSTRAINT "tuition_charges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tuition_charges" ADD CONSTRAINT "tuition_charges_group_membership_id_fkey" FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_media_id_fkey" FOREIGN KEY ("receipt_media_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "tuition_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_adjustments" ADD CONSTRAINT "finance_adjustments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_adjustments" ADD CONSTRAINT "finance_adjustments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_adjustments" ADD CONSTRAINT "finance_adjustments_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_adjustments" ADD CONSTRAINT "finance_adjustments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "tuition_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reviewed domain checks that Prisma Schema Language cannot fully represent.
ALTER TABLE "groups"
  ADD CONSTRAINT "groups_payment_deadline_day_check" CHECK ("payment_deadline_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "groups_archive_state_check" CHECK (
    ("status" = 'ACTIVE' AND "archived_at" IS NULL) OR
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
  );

ALTER TABLE "group_memberships"
  ADD CONSTRAINT "group_memberships_date_order_check" CHECK (
    "ended_at" IS NULL OR "ended_at" > "started_at"
  );

ALTER TABLE "tests"
  ADD CONSTRAINT "tests_archive_state_check" CHECK (
    ("status" = 'ACTIVE' AND "archived_at" IS NULL) OR
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
  );

ALTER TABLE "test_versions"
  ADD CONSTRAINT "test_versions_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "test_versions_availability_order_check" CHECK (
    "availability_ends_at" IS NULL OR
    "availability_starts_at" IS NULL OR
    "availability_ends_at" > "availability_starts_at"
  ),
  ADD CONSTRAINT "test_versions_duration_check" CHECK (
    "duration_minutes" IS NULL OR "duration_minutes" > 0
  ),
  ADD CONSTRAINT "test_versions_attempt_limit_check" CHECK ("attempt_limit" > 0),
  ADD CONSTRAINT "test_versions_passing_percentage_check" CHECK (
    "passing_percentage" BETWEEN 0 AND 100
  ),
  ADD CONSTRAINT "test_versions_publication_state_check" CHECK (
    ("status" = 'DRAFT' AND "published_at" IS NULL) OR
    ("status" = 'PUBLISHED' AND "published_at" IS NOT NULL)
  );

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_position_check" CHECK ("position" > 0);

ALTER TABLE "answer_options"
  ADD CONSTRAINT "answer_options_position_check" CHECK ("position" > 0);

ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_number_check" CHECK ("attempt_number" > 0),
  ADD CONSTRAINT "attempts_expiry_check" CHECK (
    "expires_at" IS NULL OR "expires_at" > "started_at"
  ),
  ADD CONSTRAINT "attempts_score_range_check" CHECK (
    ("percentage" IS NULL OR "percentage" BETWEEN 0 AND 100) AND
    ("passing_percentage" IS NULL OR "passing_percentage" BETWEEN 0 AND 100) AND
    ("correct_answer_count" IS NULL OR "correct_answer_count" >= 0) AND
    ("total_question_count" IS NULL OR "total_question_count" > 0) AND
    ("correct_answer_count" IS NULL OR "total_question_count" IS NULL OR
      "correct_answer_count" <= "total_question_count")
  ),
  ADD CONSTRAINT "attempts_lifecycle_check" CHECK (
    ("status" = 'IN_PROGRESS' AND
      "submitted_at" IS NULL AND
      "submission_reason" IS NULL AND
      "correct_answer_count" IS NULL AND
      "total_question_count" IS NULL AND
      "percentage" IS NULL AND
      "passed" IS NULL AND
      "passing_percentage" IS NULL AND
      "scoring_rule_version" IS NULL) OR
    ("status" = 'SUBMITTED' AND
      "submitted_at" IS NOT NULL AND
      "submission_reason" IS NOT NULL AND
      "correct_answer_count" IS NULL AND
      "total_question_count" IS NULL AND
      "percentage" IS NULL AND
      "passed" IS NULL AND
      "passing_percentage" IS NULL AND
      "scoring_rule_version" IS NULL) OR
    ("status" = 'SCORED' AND
      "submitted_at" IS NOT NULL AND
      "submission_reason" IS NOT NULL AND
      "correct_answer_count" IS NOT NULL AND
      "total_question_count" IS NOT NULL AND
      "percentage" IS NOT NULL AND
      "passed" IS NOT NULL AND
      "passing_percentage" IS NOT NULL AND
      "scoring_rule_version" IS NOT NULL)
  );

ALTER TABLE "attempt_grants"
  ADD CONSTRAINT "attempt_grants_count_check" CHECK ("additional_attempts" > 0);

ALTER TABLE "library_items"
  ADD CONSTRAINT "library_items_archive_state_check" CHECK (
    ("status" = 'ACTIVE' AND "archived_at" IS NULL) OR
    ("status" = 'ARCHIVED' AND "archived_at" IS NOT NULL)
  );

ALTER TABLE "library_attachments"
  ADD CONSTRAINT "library_attachments_position_check" CHECK ("position" > 0);

ALTER TABLE "media_objects"
  ADD CONSTRAINT "media_objects_size_check" CHECK ("size_bytes" > 0),
  ADD CONSTRAINT "media_objects_checksum_check" CHECK (
    "checksum_sha256" ~ '^[0-9A-Fa-f]{64}$'
  );

ALTER TABLE "telegram_import_runs"
  ADD CONSTRAINT "telegram_import_runs_time_order_check" CHECK (
    "completed_at" IS NULL OR
    ("started_at" IS NOT NULL AND "completed_at" >= "started_at")
  );

ALTER TABLE "group_tuition_rates"
  ADD CONSTRAINT "group_tuition_rates_amount_check" CHECK ("amount_uzs" > 0),
  ADD CONSTRAINT "group_tuition_rates_date_order_check" CHECK (
    "effective_to" IS NULL OR "effective_to" >= "effective_from"
  );

ALTER TABLE "student_tuition_overrides"
  ADD CONSTRAINT "student_tuition_overrides_amount_check" CHECK ("amount_uzs" > 0),
  ADD CONSTRAINT "student_tuition_overrides_date_order_check" CHECK (
    "effective_to" IS NULL OR "effective_to" >= "effective_from"
  );

ALTER TABLE "tuition_charges"
  ADD CONSTRAINT "tuition_charges_amount_check" CHECK ("amount_uzs" > 0),
  ADD CONSTRAINT "tuition_charges_billing_month_check" CHECK (
    "billing_month" = date_trunc('month', "billing_month")::date
  ),
  ADD CONSTRAINT "tuition_charges_due_date_check" CHECK (
    "due_date" >= "billing_month" AND
    "due_date" < ("billing_month" + INTERVAL '1 month')
  );

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount_uzs" > 0);

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_amount_check" CHECK ("amount_uzs" > 0);

ALTER TABLE "finance_adjustments"
  ADD CONSTRAINT "finance_adjustments_amount_check" CHECK ("amount_uzs" > 0),
  ADD CONSTRAINT "finance_adjustments_reason_check" CHECK (length(btrim("reason")) > 0),
  ADD CONSTRAINT "finance_adjustments_reversal_source_check" CHECK (
    "kind" <> 'REVERSAL' OR "payment_id" IS NOT NULL OR "charge_id" IS NOT NULL
  );

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_action_check" CHECK (length(btrim("action")) > 0),
  ADD CONSTRAINT "audit_logs_target_check" CHECK (
    length(btrim("target_type")) > 0 AND length(btrim("target_id")) > 0
  );

-- Partial unique indexes enforce active-record invariants.
CREATE UNIQUE INDEX "group_memberships_one_active_per_student_idx"
  ON "group_memberships" ("student_id")
  WHERE "ended_at" IS NULL;

CREATE UNIQUE INDEX "test_versions_one_draft_per_test_idx"
  ON "test_versions" ("test_id")
  WHERE "status" = 'DRAFT';

CREATE UNIQUE INDEX "answer_options_one_correct_per_question_idx"
  ON "answer_options" ("question_id")
  WHERE "is_correct" = true;

CREATE UNIQUE INDEX "attempts_one_active_per_student_version_idx"
  ON "attempts" ("student_id", "test_version_id")
  WHERE "status" = 'IN_PROGRESS';

CREATE UNIQUE INDEX "group_tuition_rates_one_current_per_group_idx"
  ON "group_tuition_rates" ("group_id")
  WHERE "effective_to" IS NULL;

CREATE UNIQUE INDEX "student_tuition_overrides_one_current_idx"
  ON "student_tuition_overrides" ("student_id", "group_id")
  WHERE "effective_to" IS NULL;

-- Published test content cannot be changed in place.
CREATE FUNCTION "protect_published_test_version"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."status" = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published test versions are immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW."status" = 'PUBLISHED' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM "test_translations" tt
      WHERE tt."test_version_id" = NEW."id"
        AND tt."language" = NEW."primary_language"
    ) THEN
      RAISE EXCEPTION 'primary-language test translation is required';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM "questions" q WHERE q."test_version_id" = NEW."id"
    ) THEN
      RAISE EXCEPTION 'a published test requires at least one question';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "questions" q
      WHERE q."test_version_id" = NEW."id"
        AND (
          (SELECT count(*) FROM "answer_options" ao WHERE ao."question_id" = q."id") < 2 OR
          (SELECT count(*) FROM "answer_options" ao WHERE ao."question_id" = q."id" AND ao."is_correct") <> 1 OR
          NOT EXISTS (
            SELECT 1
            FROM "question_translations" qt
            WHERE qt."question_id" = q."id"
              AND qt."language" = NEW."primary_language"
          ) OR
          EXISTS (
            SELECT 1
            FROM "answer_options" ao
            WHERE ao."question_id" = q."id"
              AND NOT EXISTS (
                SELECT 1
                FROM "answer_option_translations" aot
                WHERE aot."answer_option_id" = ao."id"
                  AND aot."language" = NEW."primary_language"
              )
          )
        )
    ) THEN
      RAISE EXCEPTION 'every published question requires primary-language content, two options, and one correct option';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "test_versions_protect_published"
  BEFORE UPDATE OR DELETE ON "test_versions"
  FOR EACH ROW EXECUTE FUNCTION "protect_published_test_version"();

CREATE FUNCTION "protect_direct_test_version_content"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status "TestVersionStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "status" INTO version_status
    FROM "test_versions"
    WHERE "id" = OLD."test_version_id";

    IF version_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published test content is immutable';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT "status" INTO version_status
    FROM "test_versions"
    WHERE "id" = NEW."test_version_id";

    IF version_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published test content is immutable';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "test_translations_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "test_translations"
  FOR EACH ROW EXECUTE FUNCTION "protect_direct_test_version_content"();

CREATE TRIGGER "questions_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "questions"
  FOR EACH ROW EXECUTE FUNCTION "protect_direct_test_version_content"();

CREATE FUNCTION "protect_question_content"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status "TestVersionStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT tv."status" INTO version_status
    FROM "questions" q
    JOIN "test_versions" tv ON tv."id" = q."test_version_id"
    WHERE q."id" = OLD."question_id";

    IF version_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published question content is immutable';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT tv."status" INTO version_status
    FROM "questions" q
    JOIN "test_versions" tv ON tv."id" = q."test_version_id"
    WHERE q."id" = NEW."question_id";

    IF version_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published question content is immutable';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "question_translations_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "question_translations"
  FOR EACH ROW EXECUTE FUNCTION "protect_question_content"();

CREATE TRIGGER "answer_options_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "answer_options"
  FOR EACH ROW EXECUTE FUNCTION "protect_question_content"();

CREATE FUNCTION "protect_answer_option_content"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status "TestVersionStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT tv."status" INTO version_status
    FROM "answer_options" ao
    JOIN "questions" q ON q."id" = ao."question_id"
    JOIN "test_versions" tv ON tv."id" = q."test_version_id"
    WHERE ao."id" = OLD."answer_option_id";

    IF version_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published answer-option content is immutable';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT tv."status" INTO version_status
    FROM "answer_options" ao
    JOIN "questions" q ON q."id" = ao."question_id"
    JOIN "test_versions" tv ON tv."id" = q."test_version_id"
    WHERE ao."id" = NEW."answer_option_id";

    IF version_status = 'PUBLISHED' THEN
      RAISE EXCEPTION 'published answer-option content is immutable';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "answer_option_translations_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "answer_option_translations"
  FOR EACH ROW EXECUTE FUNCTION "protect_answer_option_content"();

-- Answers can change only while an attempt remains in progress.
CREATE FUNCTION "protect_attempt_answers"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attempt_status "AttemptStatus";
  attempt_version_id uuid;
  question_version_id uuid;
  option_question_id uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT "status" INTO attempt_status
    FROM "attempts"
    WHERE "id" = OLD."attempt_id";

    IF attempt_status <> 'IN_PROGRESS' THEN
      RAISE EXCEPTION 'submitted attempt answers are immutable';
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    SELECT "status", "test_version_id" INTO attempt_status, attempt_version_id
    FROM "attempts"
    WHERE "id" = NEW."attempt_id";

    SELECT "test_version_id" INTO question_version_id
    FROM "questions"
    WHERE "id" = NEW."question_id";

    SELECT "question_id" INTO option_question_id
    FROM "answer_options"
    WHERE "id" = NEW."selected_option_id";

    IF attempt_status <> 'IN_PROGRESS' THEN
      RAISE EXCEPTION 'submitted attempt answers are immutable';
    END IF;

    IF attempt_version_id IS DISTINCT FROM question_version_id OR
      option_question_id IS DISTINCT FROM NEW."question_id" THEN
      RAISE EXCEPTION 'attempt answer must reference an option from its test question';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempt_answers_protect_submitted"
  BEFORE INSERT OR UPDATE OR DELETE ON "attempt_answers"
  FOR EACH ROW EXECUTE FUNCTION "protect_attempt_answers"();

CREATE FUNCTION "protect_attempt_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW."id" IS DISTINCT FROM OLD."id" OR
    NEW."test_version_id" IS DISTINCT FROM OLD."test_version_id" OR
    NEW."student_id" IS DISTINCT FROM OLD."student_id" OR
    NEW."group_membership_id" IS DISTINCT FROM OLD."group_membership_id" OR
    NEW."attempt_number" IS DISTINCT FROM OLD."attempt_number" OR
    NEW."started_at" IS DISTINCT FROM OLD."started_at"
  ) THEN
    RAISE EXCEPTION 'attempt identity is immutable';
  END IF;

  IF TG_OP = 'DELETE' AND OLD."status" <> 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'submitted attempts are immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'SCORED' THEN
    RAISE EXCEPTION 'scored attempts are immutable';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'SUBMITTED' THEN
    IF NEW."status" <> 'SCORED' OR
      NEW."test_version_id" IS DISTINCT FROM OLD."test_version_id" OR
      NEW."student_id" IS DISTINCT FROM OLD."student_id" OR
      NEW."group_membership_id" IS DISTINCT FROM OLD."group_membership_id" OR
      NEW."attempt_number" IS DISTINCT FROM OLD."attempt_number" OR
      NEW."started_at" IS DISTINCT FROM OLD."started_at" OR
      NEW."expires_at" IS DISTINCT FROM OLD."expires_at" OR
      NEW."submitted_at" IS DISTINCT FROM OLD."submitted_at" OR
      NEW."submission_reason" IS DISTINCT FROM OLD."submission_reason" THEN
      RAISE EXCEPTION 'submitted attempt inputs are immutable';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."status" = 'IN_PROGRESS' AND NEW."status" = 'SCORED' THEN
    RAISE EXCEPTION 'attempt must be submitted before scoring';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "attempts_protect_lifecycle"
  BEFORE UPDATE OR DELETE ON "attempts"
  FOR EACH ROW EXECUTE FUNCTION "protect_attempt_lifecycle"();

-- Ledger and audit source rows are append-only; corrections use adjustments.
CREATE FUNCTION "reject_append_only_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "tuition_charges_append_only"
  BEFORE UPDATE OR DELETE ON "tuition_charges"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();

CREATE TRIGGER "payments_append_only"
  BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();

CREATE TRIGGER "finance_adjustments_append_only"
  BEFORE UPDATE OR DELETE ON "finance_adjustments"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();

CREATE TRIGGER "telegram_import_records_append_only"
  BEFORE UPDATE OR DELETE ON "telegram_import_records"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();

CREATE TRIGGER "audit_logs_append_only"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "reject_append_only_mutation"();
