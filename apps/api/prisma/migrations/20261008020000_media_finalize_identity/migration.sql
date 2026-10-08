-- Existing media have no recorded staging identity; nullable preserves those rows.
ALTER TABLE "costume_media" ADD COLUMN "source_upload_key" VARCHAR(500);
-- Integrity constraint: one staging upload can create at most one media record.
CREATE UNIQUE INDEX "costume_media_source_upload_key_key" ON "costume_media"("source_upload_key");
