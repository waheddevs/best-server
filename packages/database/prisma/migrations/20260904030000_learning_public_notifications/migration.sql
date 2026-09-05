-- CreateEnum
CREATE TYPE "LessonStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'REVIEWED', 'RETURNED');

-- CreateEnum
CREATE TYPE "PublicContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TeacherTaskStatus" AS ENUM ('OPEN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TeacherTaskKind" AS ENUM ('FOLLOW_UP', 'PREPARATION', 'ADMINISTRATIVE');

-- CreateTable
CREATE TABLE "lessons" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "room" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_translations" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "summary" TEXT,

    CONSTRAINT "lesson_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_attendance" (
    "id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "group_membership_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" VARCHAR(500),
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_materials" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "lesson_id" UUID,
    "library_item_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lesson_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "lesson_id" UUID,
    "created_by_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "due_at" TIMESTAMPTZ(3),
    "allow_late" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_translations" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "instructions" TEXT,

    CONSTRAINT "assignment_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "media_object_id" UUID,
    "text" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(3),
    "score" INTEGER,
    "feedback" TEXT,

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_courses" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "status" "PublicContentStatus" NOT NULL DEFAULT 'DRAFT',
    "cover_media_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "public_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_course_translations" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "public_course_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_events" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "status" "PublicContentStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "location" VARCHAR(240),
    "capacity" INTEGER,
    "cover_media_id" UUID,
    "published_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "public_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_event_translations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "language" "Language" NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "public_event_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_requests" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "message" TEXT NOT NULL,
    "consent" BOOLEAN NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'NEW',
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contact_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_registrations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(32) NOT NULL,
    "course_slug" VARCHAR(160),
    "consent" BOOLEAN NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'NEW',
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exam_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(32) NOT NULL,
    "consent" BOOLEAN NOT NULL,
    "status" "IntakeStatus" NOT NULL DEFAULT 'NEW',
    "review_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_tasks" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "group_id" UUID,
    "kind" "TeacherTaskKind" NOT NULL,
    "status" "TeacherTaskStatus" NOT NULL DEFAULT 'OPEN',
    "title" VARCHAR(240) NOT NULL,
    "due_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "event_key" VARCHAR(180) NOT NULL,
    "kind" VARCHAR(80) NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "body" TEXT,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lessons_group_id_starts_at_idx" ON "lessons"("group_id", "starts_at");

-- CreateIndex
CREATE INDEX "lessons_created_by_id_starts_at_idx" ON "lessons"("created_by_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_translations_lesson_id_language_key" ON "lesson_translations"("lesson_id", "language");

-- CreateIndex
CREATE INDEX "lesson_attendance_group_membership_id_lesson_id_idx" ON "lesson_attendance"("group_membership_id", "lesson_id");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_attendance_lesson_id_student_id_key" ON "lesson_attendance"("lesson_id", "student_id");

-- CreateIndex
CREATE INDEX "lesson_materials_lesson_id_position_idx" ON "lesson_materials"("lesson_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "lesson_materials_group_id_library_item_id_key" ON "lesson_materials"("group_id", "library_item_id");

-- CreateIndex
CREATE INDEX "assignments_group_id_status_due_at_idx" ON "assignments"("group_id", "status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_translations_assignment_id_language_key" ON "assignment_translations"("assignment_id", "language");

-- CreateIndex
CREATE INDEX "assignment_submissions_assignment_id_status_submitted_at_idx" ON "assignment_submissions"("assignment_id", "status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignment_id_student_id_key" ON "assignment_submissions"("assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "public_courses_slug_key" ON "public_courses"("slug");

-- CreateIndex
CREATE INDEX "public_courses_status_published_at_idx" ON "public_courses"("status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "public_course_translations_course_id_language_key" ON "public_course_translations"("course_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "public_events_slug_key" ON "public_events"("slug");

-- CreateIndex
CREATE INDEX "public_events_status_starts_at_idx" ON "public_events"("status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "public_event_translations_event_id_language_key" ON "public_event_translations"("event_id", "language");

-- CreateIndex
CREATE INDEX "contact_requests_status_created_at_idx" ON "contact_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "exam_registrations_status_created_at_idx" ON "exam_registrations"("status", "created_at");

-- CreateIndex
CREATE INDEX "event_registrations_status_created_at_idx" ON "event_registrations"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_event_id_phone_key" ON "event_registrations"("event_id", "phone");

-- CreateIndex
CREATE INDEX "teacher_tasks_teacher_id_status_due_at_idx" ON "teacher_tasks"("teacher_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_recipient_id_event_key_key" ON "notifications"("recipient_id", "event_key");

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_translations" ADD CONSTRAINT "lesson_translations_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_group_membership_id_fkey" FOREIGN KEY ("group_membership_id") REFERENCES "group_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_attendance" ADD CONSTRAINT "lesson_attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "library_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_materials" ADD CONSTRAINT "lesson_materials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_translations" ADD CONSTRAINT "assignment_translations_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_media_object_id_fkey" FOREIGN KEY ("media_object_id") REFERENCES "media_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_courses" ADD CONSTRAINT "public_courses_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_course_translations" ADD CONSTRAINT "public_course_translations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_events" ADD CONSTRAINT "public_events_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_event_translations" ADD CONSTRAINT "public_event_translations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_tasks" ADD CONSTRAINT "teacher_tasks_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_tasks" ADD CONSTRAINT "teacher_tasks_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_time_order_check" CHECK ("ends_at" > "starts_at");
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_content_check" CHECK ("text" IS NOT NULL OR "media_object_id" IS NOT NULL);
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100));
ALTER TABLE "public_events" ADD CONSTRAINT "public_events_time_order_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at");
ALTER TABLE "public_events" ADD CONSTRAINT "public_events_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_payload_version_check" CHECK ("payload_version" > 0);
