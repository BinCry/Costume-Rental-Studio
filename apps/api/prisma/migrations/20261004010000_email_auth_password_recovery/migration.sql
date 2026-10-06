BEGIN;

-- Application inputs are normalized to lowercase. Fail the migration on ambiguous
-- case-only duplicates instead of silently linking an account to the wrong email.
UPDATE "users" SET "email" = lower("email") WHERE "email" IS NOT NULL;

ALTER TABLE "users"
    ADD COLUMN "email_verified_at" TIMESTAMPTZ(6),
    ADD CONSTRAINT "ck_users_email_verified"
    CHECK ("email_verified_at" IS NULL OR "email" IS NOT NULL),
    ADD CONSTRAINT "ck_users_email_normalized"
    CHECK ("email" IS NULL OR "email" = lower("email"));

-- Registration OTPs are short-lived and cannot be migrated from a phone identity to an email.
DROP TABLE "phone_otp_challenges";

CREATE TABLE "email_otp_challenges" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_otp_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_email_otp_attempts" CHECK ("attempt_count" BETWEEN 0 AND 5),
    CONSTRAINT "ck_email_otp_expiry" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "ck_email_otp_hash" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ck_email_otp_consumed" CHECK ("consumed_at" IS NULL OR "sent_at" IS NOT NULL)
);
CREATE UNIQUE INDEX "email_otp_challenges_email_key" ON "email_otp_challenges"("email");

CREATE TABLE "password_reset_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "reset_token_hash" VARCHAR(64),
    "reset_token_expires_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_password_reset_attempts" CHECK ("attempt_count" BETWEEN 0 AND 5),
    CONSTRAINT "ck_password_reset_expiry" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "ck_password_reset_hash" CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ck_password_reset_token_hash" CHECK (
        "reset_token_hash" IS NULL OR "reset_token_hash" ~ '^[0-9a-f]{64}$'
    ),
    CONSTRAINT "ck_password_reset_token_pair" CHECK (
        ("reset_token_hash" IS NULL) = ("reset_token_expires_at" IS NULL)
    ),
    CONSTRAINT "ck_password_reset_verified_token" CHECK (
        "reset_token_hash" IS NULL OR "verified_at" IS NOT NULL
    ),
    CONSTRAINT "ck_password_reset_consumed" CHECK (
        "consumed_at" IS NULL OR "verified_at" IS NOT NULL
    )
);
CREATE UNIQUE INDEX "password_reset_challenges_user_id_key"
    ON "password_reset_challenges"("user_id");
CREATE UNIQUE INDEX "password_reset_challenges_reset_token_hash_key"
    ON "password_reset_challenges"("reset_token_hash");
CREATE INDEX "password_reset_challenges_expires_at_idx"
    ON "password_reset_challenges"("expires_at");
ALTER TABLE "password_reset_challenges"
    ADD CONSTRAINT "password_reset_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
