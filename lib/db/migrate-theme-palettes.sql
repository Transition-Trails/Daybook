-- ─── Palette / Background / Theme Bundle Migration ───────────────────────────
-- Run AFTER `drizzle-kit push` has created palettes, backgrounds,
-- theme_palettes, theme_backgrounds, theme_packs tables.
--
-- For each non-deleted theme: extract its colors array into a palette row
-- (deduplicating identical arrays by md5 fingerprint), then link via theme_palettes.
-- Existing themes.colors column is preserved untouched — old generation code
-- continues to work without modification.

-- Step 1: Insert one palette per distinct colors JSON (first theme wins for name/origin/status).
INSERT INTO palettes (id, name, colors, status, global_available, origin, authored_by_store_id, created_at, updated_at)
SELECT
  'pal_' || substr(md5(t.colors::text), 1, 12) AS id,
  t.name,
  t.colors,
  t.status,
  t.global_available,
  t.origin,
  t.authored_by_store_id,
  now(),
  now()
FROM (
  SELECT DISTINCT ON (md5(colors::text))
    name, colors, status, global_available, origin, authored_by_store_id
  FROM themes
  WHERE status != 'deleted'
  ORDER BY md5(colors::text), created_at ASC
) t
ON CONFLICT (id) DO NOTHING;

-- Step 2: Link every non-deleted theme to its corresponding palette.
INSERT INTO theme_palettes (theme_id, palette_id, position)
SELECT
  id AS theme_id,
  'pal_' || substr(md5(colors::text), 1, 12) AS palette_id,
  0 AS position
FROM themes
WHERE status != 'deleted'
ON CONFLICT ON CONSTRAINT theme_palette_uq DO NOTHING;
