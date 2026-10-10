ALTER TABLE "outbox_events"
  ADD COLUMN "deduplication_key" VARCHAR(200);

CREATE UNIQUE INDEX "outbox_events_deduplication_key_key"
  ON "outbox_events"("deduplication_key");

CREATE INDEX "outbox_events_event_type_status_available_at_idx"
  ON "outbox_events"("event_type", "status", "available_at");
