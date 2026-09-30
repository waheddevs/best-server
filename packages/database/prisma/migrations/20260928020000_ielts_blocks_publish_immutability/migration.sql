-- Keep normalized IELTS section blocks immutable after their owning version is published.

CREATE TRIGGER "test_section_blocks_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "test_section_blocks"
  FOR EACH ROW EXECUTE FUNCTION "protect_test_section_content"();

CREATE FUNCTION "protect_test_section_block_content"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status "TestVersionStatus";
  block_id UUID;
BEGIN
  block_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD."test_section_block_id"
    ELSE NEW."test_section_block_id"
  END;

  SELECT tv."status" INTO version_status
  FROM "test_section_blocks" tsb
  JOIN "test_sections" ts ON ts."id" = tsb."test_section_id"
  JOIN "test_versions" tv ON tv."id" = ts."test_version_id"
  WHERE tsb."id" = block_id;

  IF version_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published test section block content is immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "test_section_block_translations_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "test_section_block_translations"
  FOR EACH ROW EXECUTE FUNCTION "protect_test_section_block_content"();

CREATE TRIGGER "test_section_block_questions_protect_published"
  BEFORE INSERT OR UPDATE OR DELETE ON "test_section_block_questions"
  FOR EACH ROW EXECUTE FUNCTION "protect_test_section_block_content"();
