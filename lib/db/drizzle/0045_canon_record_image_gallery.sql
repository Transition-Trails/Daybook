ALTER TABLE "ws_canon_records"
  ADD COLUMN IF NOT EXISTS "image_urls" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "ws_canon_records"
SET "image_urls" = jsonb_build_array("portrait_url")
WHERE "portrait_url" IS NOT NULL
  AND "portrait_url" <> ''
  AND "image_urls" = '[]'::jsonb;