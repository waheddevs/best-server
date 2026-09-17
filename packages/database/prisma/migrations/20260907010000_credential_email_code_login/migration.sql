-- Add credential ownership to BEST users. Existing provider-only accounts are
-- intentionally left without a password and cannot use credential login.
ALTER TABLE "users"
  ADD COLUMN "credential_password_hash" VARCHAR(255);

CREATE TABLE "credential_login_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "resend_available_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "credential_login_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credential_login_challenges_attempts_check"
      CHECK ("attempts" BETWEEN 0 AND 5),
    CONSTRAINT "credential_login_challenges_expiry_check"
      CHECK ("expires_at" > "created_at")
);

CREATE INDEX "credential_login_challenges_user_id_used_at_expires_at_idx"
  ON "credential_login_challenges"("user_id", "used_at", "expires_at");

ALTER TABLE "credential_login_challenges"
  ADD CONSTRAINT "credential_login_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "credential_login_throttles" (
    "key_hash" VARCHAR(64) NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_login_throttles_pkey" PRIMARY KEY ("key_hash"),
    CONSTRAINT "credential_login_throttles_failures_check"
      CHECK ("failures" BETWEEN 0 AND 5)
);
