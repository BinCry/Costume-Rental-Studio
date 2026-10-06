-- Forward-only change: preserve previously created/applied migration history.
-- Move existing credentials before removing their old table. No users or OTPs are deleted.
BEGIN;

ALTER TABLE "users"
    ADD COLUMN "password_hash" VARCHAR(255),
    ADD COLUMN "phone_verified_at" TIMESTAMPTZ(6);

UPDATE "users" AS u
SET "password_hash" = c."password_hash",
    "phone_verified_at" = CASE
        WHEN u."phone" = c."verified_phone" THEN c."phone_verified_at"
        ELSE NULL
    END
FROM "password_credentials" AS c
WHERE u."id" = c."user_id";

ALTER TABLE "users"
    ADD CONSTRAINT "ck_users_password_hash"
    CHECK ("password_hash" IS NULL OR "password_hash" LIKE '$argon2id$%'),
    ADD CONSTRAINT "ck_users_phone_verified"
    CHECK ("phone_verified_at" IS NULL OR "phone" IS NOT NULL);

DROP TABLE "password_credentials";

COMMIT;
