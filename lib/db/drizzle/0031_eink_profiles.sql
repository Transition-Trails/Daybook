CREATE TABLE IF NOT EXISTS "eink_device_presets" (
  "key" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "pixel_width" integer NOT NULL,
  "pixel_height" integer NOT NULL,
  "trim_width" real NOT NULL,
  "trim_height" real NOT NULL,
  "link_support" text NOT NULL DEFAULT 'full',
  "safe_inset" real NOT NULL DEFAULT 0,
  "sell_guidance" text NOT NULL,
  "caveat" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eink_enforcement_rules" (
  "key" text PRIMARY KEY NOT NULL,
  "label" text NOT NULL,
  "description" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "threshold" real,
  "unit" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "eink_device_presets"
  ("key", "name", "pixel_width", "pixel_height", "trim_width", "trim_height", "link_support", "safe_inset", "sell_guidance", "caveat")
VALUES
  ('remarkable', 'reMarkable 2 / Pro', 1404, 1872, 447, 597, 'full', 8,
   'The strongest fit. Internal PDF links work exactly as designed.', NULL),
  ('supernote', 'Supernote A5X / A6X', 1404, 1872, 447, 597, 'full', 10,
   'Handles links and heavy documents well.', NULL),
  ('boox', 'Boox Note / Tab', 1404, 1872, 447, 597, 'full', 12,
   'Android-based and capable; use the closest trim preset.', NULL),
  ('kindle_scribe', 'Kindle Scribe', 1860, 2480, 446, 595, 'poor', 14,
   'Sell it as a printable-style planner; sideloaded links are unreliable.',
   'Printable-style on Kindle Scribe — hyperlinks are supported on reMarkable, Supernote and Boox.')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "eink_enforcement_rules"
  ("key", "label", "description", "enabled", "threshold", "unit")
VALUES
  ('grayscale', 'Grayscale only', 'The ink-friendly B&W variant is the e-ink asset.', true, NULL, NULL),
  ('contrast_floor', 'Contrast floor', 'Fills lighter than about 15% grey cannot carry meaning.', true, 0.85, 'brightness'),
  ('line_weight', 'Line weight', 'Rules the buyer needs to see are at least 0.75 pt.', true, 0.75, 'pt'),
  ('file_weight', 'File weight', 'Vector-first exports avoid slow page turns and oversized files.', true, 10, 'MB'),
  ('toolbar_margin', 'Toolbar margin', 'Live content stays inside a safe inset from device overlays.', true, 40, 'pt')
ON CONFLICT ("key") DO NOTHING;