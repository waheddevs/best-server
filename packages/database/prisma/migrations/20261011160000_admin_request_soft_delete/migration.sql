ALTER TABLE "course_registrations" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
ALTER TABLE "event_registrations" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
ALTER TABLE "exam_registrations" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);
