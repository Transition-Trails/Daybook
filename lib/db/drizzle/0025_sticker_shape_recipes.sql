CREATE TABLE IF NOT EXISTS "sticker_shape_recipes" (
  "id" text PRIMARY KEY NOT NULL,
  "origin" text NOT NULL,
  "authored_by_store_id" text REFERENCES "stores"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "function_type" text NOT NULL,
  "svg_template" text NOT NULL,
  "aspect_ratio" real NOT NULL,
  "default_size_mm" real NOT NULL,
  "takes_label" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'draft',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sticker_shape_recipe_scope_slug_uq"
    UNIQUE ("origin", "authored_by_store_id", "slug")
);

ALTER TABLE "stickers_library"
  ADD COLUMN IF NOT EXISTS "recipe_id" text
  REFERENCES "sticker_shape_recipes"("id") ON DELETE SET NULL;