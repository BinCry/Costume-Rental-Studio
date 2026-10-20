CREATE INDEX "rental_orders_status_planned_start_at_id_idx"
ON "rental_orders"("status", "planned_start_at", "id");
