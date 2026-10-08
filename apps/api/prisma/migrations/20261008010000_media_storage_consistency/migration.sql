-- A storage object may back only one catalog media record.
CREATE UNIQUE INDEX "costume_media_object_key_key" ON "costume_media"("object_key");

-- External object deletion must be coordinated by the application/outbox.
-- Restrict parent deletion so a database cascade cannot silently orphan storage objects.
ALTER TABLE "costume_media" DROP CONSTRAINT "costume_media_model_id_fkey";
ALTER TABLE "costume_media" DROP CONSTRAINT "costume_media_variant_id_fkey";

ALTER TABLE "costume_media"
  ADD CONSTRAINT "costume_media_model_id_fkey"
  FOREIGN KEY ("model_id") REFERENCES "costume_models"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "costume_media"
  ADD CONSTRAINT "costume_media_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "costume_variants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
