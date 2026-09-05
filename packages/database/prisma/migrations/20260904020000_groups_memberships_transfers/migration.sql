CREATE TYPE "TransferRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'DECLINED',
  'CANCELLED'
);

ALTER TABLE "groups"
  ALTER COLUMN "payment_deadline_day" DROP NOT NULL,
  ADD COLUMN "slug" VARCHAR(160),
  ADD COLUMN "room" VARCHAR(80),
  ADD COLUMN "schedule_days" SMALLINT[] NOT NULL DEFAULT ARRAY[]::SMALLINT[],
  ADD COLUMN "starts_at_minutes" SMALLINT,
  ADD COLUMN "ends_at_minutes" SMALLINT,
  ADD COLUMN "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tashkent';

UPDATE "groups"
SET "slug" = lower(regexp_replace(btrim("name"), '[^a-zA-Z0-9]+', '-', 'g'))
  || '-' || left("id"::text, 8)
WHERE "slug" IS NULL;

ALTER TABLE "groups" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "groups_slug_key" ON "groups"("slug");

ALTER TABLE "groups"
  ADD CONSTRAINT "groups_schedule_days_check"
  CHECK (
    "schedule_days" <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
    AND cardinality("schedule_days") <= 7
  ),
  ADD CONSTRAINT "groups_schedule_time_check"
  CHECK (
    ("starts_at_minutes" IS NULL AND "ends_at_minutes" IS NULL)
    OR (
      "starts_at_minutes" BETWEEN 0 AND 1439
      AND "ends_at_minutes" BETWEEN 1 AND 1440
      AND "starts_at_minutes" < "ends_at_minutes"
    )
  ),
  ADD CONSTRAINT "groups_room_check"
  CHECK ("room" IS NULL OR length(btrim("room")) BETWEEN 1 AND 80),
  ADD CONSTRAINT "groups_time_zone_check"
  CHECK (length(btrim("time_zone")) BETWEEN 1 AND 64);

CREATE TABLE "group_transfer_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "from_group_id" UUID NOT NULL,
  "to_group_id" UUID NOT NULL,
  "requested_by_id" UUID NOT NULL,
  "reviewed_by_id" UUID,
  "status" "TransferRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "review_note" TEXT,
  "reviewed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_transfer_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "group_transfer_requests_requested_by_id_status_created_at_idx"
  ON "group_transfer_requests"("requested_by_id", "status", "created_at");
CREATE INDEX "group_transfer_requests_to_group_id_status_created_at_idx"
  ON "group_transfer_requests"("to_group_id", "status", "created_at");
CREATE INDEX "group_transfer_requests_student_id_created_at_idx"
  ON "group_transfer_requests"("student_id", "created_at");
CREATE UNIQUE INDEX "group_transfer_requests_one_pending_per_student_idx"
  ON "group_transfer_requests"("student_id") WHERE "status" = 'PENDING';

ALTER TABLE "group_transfer_requests"
  ADD CONSTRAINT "group_transfer_requests_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_transfer_requests_from_group_id_fkey"
  FOREIGN KEY ("from_group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_transfer_requests_to_group_id_fkey"
  FOREIGN KEY ("to_group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_transfer_requests_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_transfer_requests_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_transfer_requests_groups_differ_check"
  CHECK ("from_group_id" <> "to_group_id"),
  ADD CONSTRAINT "group_transfer_requests_reason_check"
  CHECK (length(btrim("reason")) BETWEEN 10 AND 1000),
  ADD CONSTRAINT "group_transfer_requests_review_check"
  CHECK (
    ("status" = 'PENDING' AND "reviewed_by_id" IS NULL AND "reviewed_at" IS NULL)
    OR
    ("status" <> 'PENDING' AND "reviewed_by_id" IS NOT NULL AND "reviewed_at" IS NOT NULL)
  );
