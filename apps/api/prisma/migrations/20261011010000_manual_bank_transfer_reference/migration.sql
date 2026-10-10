ALTER TABLE "payments"
ADD COLUMN "transaction_reference" VARCHAR(255);

-- Existing BANK_TRANSFER rows predate manual transfer references (for example,
-- seeded historical receipts). Preserve them with a deterministic legacy
-- reference before enforcing the invariant for new records.
UPDATE "payments"
SET "transaction_reference" = 'LEGACY-BANK-' || "id"
WHERE "method" = 'BANK_TRANSFER' AND "transaction_reference" IS NULL;

ALTER TABLE "payments"
ADD CONSTRAINT "ck_payment_bank_transfer_reference"
CHECK (method <> 'BANK_TRANSFER' OR transaction_reference IS NOT NULL);

CREATE UNIQUE INDEX "payments_bank_transfer_reference_key"
ON "payments"("transaction_reference")
WHERE method = 'BANK_TRANSFER' AND transaction_reference IS NOT NULL;
