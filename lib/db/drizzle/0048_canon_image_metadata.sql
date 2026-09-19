ALTER TABLE "ws_canon_records"
  ADD COLUMN IF NOT EXISTS "image_gallery" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "ws_canon_records"
SET "image_gallery" = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'url', image_url,
        'name', CASE WHEN ordinal = 1 THEN 'Primary Canon portrait' ELSE '' END,
        'description', ''
      )
      ORDER BY ordinal
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text("image_urls") WITH ORDINALITY AS images(image_url, ordinal)
)
WHERE "image_gallery" = '[]'::jsonb
  AND jsonb_array_length("image_urls") > 0;