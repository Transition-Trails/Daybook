CREATE UNIQUE INDEX IF NOT EXISTS "sticker_shape_recipe_starter_slug_uq"
ON "sticker_shape_recipes" ("slug")
WHERE "origin" = 'starter' AND "authored_by_store_id" IS NULL;