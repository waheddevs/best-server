CREATE TABLE "credential_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "revoke_reason" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credential_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credential_sessions_expiry_check"
      CHECK ("expires_at" > "created_at"),
    CONSTRAINT "credential_sessions_idle_expiry_check"
      CHECK (
        "idle_expires_at" > "created_at"
        AND "idle_expires_at" <= "expires_at"
      ),
    CONSTRAINT "credential_sessions_last_used_check"
      CHECK ("last_used_at" >= "created_at"),
    CONSTRAINT "credential_sessions_revocation_check"
      CHECK (
        ("revoked_at" IS NULL AND "revoke_reason" IS NULL)
        OR ("revoked_at" IS NOT NULL AND "revoke_reason" IS NOT NULL)
      )
);

CREATE TABLE "credential_refresh_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credential_refresh_tokens_consumed_check"
      CHECK ("consumed_at" IS NULL OR "consumed_at" >= "created_at")
);

CREATE UNIQUE INDEX "credential_refresh_tokens_token_hash_key"
  ON "credential_refresh_tokens"("token_hash");

CREATE UNIQUE INDEX "credential_refresh_tokens_one_active_per_session_idx"
  ON "credential_refresh_tokens"("session_id")
  WHERE "consumed_at" IS NULL;

CREATE INDEX "credential_refresh_tokens_session_id_consumed_at_idx"
  ON "credential_refresh_tokens"("session_id", "consumed_at");

CREATE INDEX "credential_sessions_user_id_revoked_at_expires_at_idx"
  ON "credential_sessions"("user_id", "revoked_at", "expires_at");

CREATE INDEX "credential_sessions_idle_expires_at_revoked_at_idx"
  ON "credential_sessions"("idle_expires_at", "revoked_at");

ALTER TABLE "credential_sessions"
  ADD CONSTRAINT "credential_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credential_refresh_tokens"
  ADD CONSTRAINT "credential_refresh_tokens_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "credential_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
