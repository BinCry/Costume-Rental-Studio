BEGIN;

DROP INDEX "password_reset_challenges_expires_at_idx";

CREATE TABLE "email_change_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "new_email" VARCHAR(255) NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_change_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_email_change_email_normalized"
        CHECK ("new_email" = lower("new_email")),
    CONSTRAINT "ck_email_change_attempts"
        CHECK ("attempt_count" BETWEEN 0 AND 5),
    CONSTRAINT "ck_email_change_expiry"
        CHECK ("expires_at" > "created_at"),
    CONSTRAINT "ck_email_change_hash"
        CHECK ("code_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ck_email_change_consumed"
        CHECK ("consumed_at" IS NULL OR "sent_at" IS NOT NULL)
);

CREATE UNIQUE INDEX "email_change_challenges_user_id_key"
    ON "email_change_challenges"("user_id");

ALTER TABLE "email_change_challenges"
    ADD CONSTRAINT "email_change_challenges_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
