ALTER TABLE "refunds"
ADD COLUMN "idempotency_key" VARCHAR(255);

CREATE UNIQUE INDEX "refunds_idempotency_key_key" ON "refunds"("idempotency_key");

CREATE SEQUENCE "payment_provider_order_code_seq" START 1 MAXVALUE 999999999999;

ALTER TABLE "payments"
ADD COLUMN "provider_order_code" BIGINT,
ADD COLUMN "provider_status" VARCHAR(30),
ADD COLUMN "checkout_url" VARCHAR(1000),
ADD COLUMN "qr_code" TEXT,
ADD COLUMN "expires_at" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "payments_provider_provider_order_code_key"
ON "payments"("provider", "provider_order_code");

ALTER TABLE "payments" DROP CONSTRAINT "ck_payment_method_metadata";
ALTER TABLE "payments"
ADD CONSTRAINT "ck_payment_method_metadata"
CHECK (
  (
    method = 'PAYMENT_GATEWAY'
    AND provider IS NOT NULL
    AND (provider_order_code IS NOT NULL OR provider_payment_id IS NOT NULL)
  )
  OR
  (
    method IN ('CASH', 'BANK_TRANSFER')
    AND recorded_by IS NOT NULL
  )
);
