CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "device_id" VARCHAR(100),
    "device_name" VARCHAR(255),
    "user_agent" VARCHAR(500),
    "last_ip" VARCHAR(45),
    "family_created_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_refresh_session_hash" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ck_refresh_session_expiry" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "ck_refresh_session_used" CHECK ("used_at" IS NULL OR "used_at" >= "created_at"),
    CONSTRAINT "ck_refresh_session_revoked" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at")
);
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");
CREATE INDEX "refresh_sessions_family_id_idx" ON "refresh_sessions"("family_id");
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");
CREATE UNIQUE INDEX "refresh_sessions_one_active_token_per_family_idx"
ON "refresh_sessions"("family_id")
WHERE "used_at" IS NULL AND "revoked_at" IS NULL;
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
