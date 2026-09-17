CREATE TYPE "GroupCategory" AS ENUM ('IELTS', 'CEFR', 'GENERAL_ENGLISH');

ALTER TABLE "groups" ADD COLUMN "category" "GroupCategory";
