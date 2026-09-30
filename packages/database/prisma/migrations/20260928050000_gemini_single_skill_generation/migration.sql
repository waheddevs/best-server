-- Bind new Gemini generation requests to the one IELTS skill requested by the
-- Teacher. Existing four-skill request history remains nullable rather than
-- being assigned misleading inferred metadata.

ALTER TABLE "test_generation_requests"
  ADD COLUMN "skill" "TestSkill";
