-- Prisma owns @updatedAt values; remove the temporary backfill default.
ALTER TABLE "media_objects"
  ALTER COLUMN "updated_at" DROP DEFAULT;
