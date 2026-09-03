-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE', 'FACEBOOK', 'APPLE');

-- AlterTable
ALTER TABLE "users"
  ADD COLUMN "email" VARCHAR(320),
  ADD COLUMN "email_verified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "auth_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "provider_account_id" VARCHAR(255) NOT NULL,
    "provider_email" VARCHAR(320),
    "provider_email_verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_authenticated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_provider_provider_account_id_key"
  ON "auth_accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_accounts_user_id_provider_key"
  ON "auth_accounts"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "auth_accounts"
  ADD CONSTRAINT "auth_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reviewed identity checks that Prisma Schema Language cannot fully represent.
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_normalized_check" CHECK (
    "email" IS NULL OR (
      length("email") > 0 AND
      "email" = btrim("email") AND
      "email" = lower("email")
    )
  ),
  ADD CONSTRAINT "users_email_verification_check" CHECK (
    "email_verified_at" IS NULL OR "email" IS NOT NULL
  );

ALTER TABLE "auth_accounts"
  ADD CONSTRAINT "auth_accounts_provider_account_id_check" CHECK (
    length(btrim("provider_account_id")) > 0 AND
    "provider_account_id" = btrim("provider_account_id")
  ),
  ADD CONSTRAINT "auth_accounts_provider_email_normalized_check" CHECK (
    "provider_email" IS NULL OR (
      length("provider_email") > 0 AND
      "provider_email" = btrim("provider_email") AND
      "provider_email" = lower("provider_email")
    )
  ),
  ADD CONSTRAINT "auth_accounts_provider_email_verification_check" CHECK (
    "provider_email_verified_at" IS NULL OR "provider_email" IS NOT NULL
  );
