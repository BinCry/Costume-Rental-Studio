CREATE TYPE "rental_evidence_phase" AS ENUM ('PICKUP', 'RETURN');

CREATE TABLE "rental_item_evidence" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "phase" "rental_evidence_phase" NOT NULL,
    "object_key" VARCHAR(500) NOT NULL,
    "source_upload_key" VARCHAR(500),
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "captured_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rental_item_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rental_order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "from_status" "order_status",
    "to_status" "order_status",
    "actor_user_id" UUID,
    "metadata_json" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rental_order_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rental_item_evidence_object_key_key" ON "rental_item_evidence"("object_key");
CREATE UNIQUE INDEX "rental_item_evidence_source_upload_key_key" ON "rental_item_evidence"("source_upload_key");
CREATE INDEX "rental_item_evidence_order_item_id_phase_created_at_idx" ON "rental_item_evidence"("order_item_id", "phase", "created_at");
CREATE INDEX "rental_order_events_order_id_occurred_at_idx" ON "rental_order_events"("order_id", "occurred_at");
CREATE INDEX "rental_order_items_unit_id_occupied_from_occupied_until_allocation_status_idx" ON "rental_order_items"("unit_id", "occupied_from", "occupied_until", "allocation_status");

ALTER TABLE "rental_item_evidence" ADD CONSTRAINT "rental_item_evidence_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "rental_order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_item_evidence" ADD CONSTRAINT "rental_item_evidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rental_order_events" ADD CONSTRAINT "rental_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_order_events" ADD CONSTRAINT "rental_order_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "module", "action", "scope", "description") VALUES
  ('00000000-0000-4000-8000-000000000897', 'rentals.read.own', 'rentals', 'read', 'OWN', 'Read own rental orders'),
  ('00000000-0000-4000-8000-000000000898', 'rentals.manage.own', 'rentals', 'manage', 'OWN', 'Create and manage own pending rental orders'),
  ('00000000-0000-4000-8000-000000000899', 'rentals.read.branch', 'rentals', 'read', 'BRANCH', 'Read rental orders at assigned branches'),
  ('00000000-0000-4000-8000-000000000900', 'rentals.manage.branch', 'rentals', 'manage', 'BRANCH', 'Manage rental orders at assigned branches'),
  ('00000000-0000-4000-8000-000000000901', 'rentals.read.all', 'rentals', 'read', 'ALL', 'Read rental orders across all branches'),
  ('00000000-0000-4000-8000-000000000902', 'rentals.manage.all', 'rentals', 'manage', 'ALL', 'Manage rental orders across all branches')
ON CONFLICT ("code") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "scope" = EXCLUDED."scope", "description" = EXCLUDED."description";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON
  (r."role_code" = 'ADMIN' AND p."code" IN ('rentals.read.all', 'rentals.manage.all')) OR
  (r."role_code" = 'SALES_STAFF' AND p."code" IN ('rentals.read.branch', 'rentals.manage.branch')) OR
  (r."role_code" = 'INVENTORY_STAFF' AND p."code" = 'rentals.read.branch') OR
  (r."role_code" = 'CUSTOMER' AND p."code" IN ('rentals.read.own', 'rentals.manage.own'))
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
