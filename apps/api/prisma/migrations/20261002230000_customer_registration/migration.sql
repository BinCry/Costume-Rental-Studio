-- Additive migration: no changes to existing business records or initial migration.
CREATE TABLE "password_credentials" (
    "user_id" UUID NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "verified_phone" VARCHAR(30) NOT NULL,
    "phone_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "password_credentials_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "ck_password_credentials_hash" CHECK ("password_hash" LIKE '$argon2id$%'),
    CONSTRAINT "ck_password_credentials_phone" CHECK ("verified_phone" ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE "phone_otp_challenges" (
    "id" UUID NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "phone_otp_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_phone_otp_attempts" CHECK ("attempt_count" BETWEEN 0 AND 5),
    CONSTRAINT "ck_phone_otp_expiry" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "ck_phone_otp_phone" CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT "ck_phone_otp_hash" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ck_phone_otp_consumed" CHECK ("consumed_at" IS NULL OR "sent_at" IS NOT NULL)
);
CREATE UNIQUE INDEX "phone_otp_challenges_phone_key" ON "phone_otp_challenges"("phone");
ALTER TABLE "password_credentials" ADD CONSTRAINT "password_credentials_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
