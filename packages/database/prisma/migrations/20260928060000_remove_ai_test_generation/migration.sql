-- Provider-backed test generation was cancelled. Remove its isolated request
-- lifecycle storage while preserving ordinary Teacher-authored/imported drafts.

DROP TABLE "test_generation_requests";
DROP TYPE "TestGenerationRequestStatus";
