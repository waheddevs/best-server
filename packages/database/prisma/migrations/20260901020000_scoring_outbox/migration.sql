-- CreateEnum
CREATE TYPE "OutboxEventType" AS ENUM ('ATTEMPT_SUBMITTED');

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "event_type" "OutboxEventType" NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "correlation_id" VARCHAR(120),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" VARCHAR(500),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "outbox_events_payload_version_check" CHECK ("payload_version" = 1),
    CONSTRAINT "outbox_events_payload_object_check" CHECK (jsonb_typeof("payload") = 'object'),
    CONSTRAINT "outbox_events_publish_attempts_check" CHECK ("publish_attempts" >= 0),
    CONSTRAINT "outbox_events_correlation_id_check" CHECK (
      "correlation_id" IS NULL OR btrim("correlation_id") <> ''
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_event_type_aggregate_id_key"
  ON "outbox_events"("event_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "outbox_events_pending_delivery_idx"
  ON "outbox_events"("next_attempt_at", "occurred_at")
  WHERE "published_at" IS NULL;

-- Preserve the event identity and payload while allowing bounded delivery metadata updates.
CREATE FUNCTION "protect_outbox_event"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'outbox event source rows are retained';
  END IF;

  IF NEW."event_type" IS DISTINCT FROM OLD."event_type" OR
     NEW."aggregate_id" IS DISTINCT FROM OLD."aggregate_id" OR
     NEW."payload_version" IS DISTINCT FROM OLD."payload_version" OR
     NEW."payload" IS DISTINCT FROM OLD."payload" OR
     NEW."correlation_id" IS DISTINCT FROM OLD."correlation_id" OR
     NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at" THEN
    RAISE EXCEPTION 'outbox event source data is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "outbox_events_protect_source"
  BEFORE UPDATE OR DELETE ON "outbox_events"
  FOR EACH ROW EXECUTE FUNCTION "protect_outbox_event"();
