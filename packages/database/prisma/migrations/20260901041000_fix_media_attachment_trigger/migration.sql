-- Forward-only fix: avoid a PL/pgSQL variable/column name collision in the
-- READY + CLEAN domain-attachment gate introduced by the preceding migration.
CREATE OR REPLACE FUNCTION "best_require_ready_media_object"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_media_object_id UUID;
  selected_media_status "MediaObjectStatus";
  selected_malware_status "MediaMalwareStatus";
BEGIN
  selected_media_object_id := (to_jsonb(NEW) ->> TG_ARGV[0])::UUID;

  IF selected_media_object_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT media."status", media."malware_status"
  INTO selected_media_status, selected_malware_status
  FROM "media_objects" AS media
  WHERE media."id" = selected_media_object_id;

  IF selected_media_status IS DISTINCT FROM 'READY'::"MediaObjectStatus" OR
     selected_malware_status IS DISTINCT FROM 'CLEAN'::"MediaMalwareStatus" THEN
    RAISE EXCEPTION 'media object must be READY and CLEAN before domain attachment';
  END IF;

  RETURN NEW;
END;
$$;
