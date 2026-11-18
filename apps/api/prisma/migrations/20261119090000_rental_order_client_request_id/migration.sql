ALTER TABLE "rental_orders"
  ADD COLUMN "client_request_id" UUID,
  ADD COLUMN "request_fingerprint" VARCHAR(64);

CREATE UNIQUE INDEX "rental_orders_client_request_id_key"
  ON "rental_orders"("client_request_id");
