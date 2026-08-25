/*
 * Wave 11: Google lifecycle audit metadata and database-enforced per-store
 * catalog naming. Normalized names are maintained in PostgreSQL so concurrent
 * web workers cannot bypass the application-level friendly duplicate check.
 */
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "google_disconnected_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "google_disconnect_reason" text,
  ADD COLUMN IF NOT EXISTS "google_drive_folder_id" text;
--> statement-breakpoint

ALTER TABLE "themes" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE "sticker_packs" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE "editions" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE "palettes" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE "backgrounds" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE "stickers_library" ADD COLUMN IF NOT EXISTS "normalized_name" text;
ALTER TABLE "planner_interiors" ADD COLUMN IF NOT EXISTS "normalized_name" text;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION "daybook_set_normalized_name"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."normalized_name" := NULLIF(regexp_replace(lower(btrim(NEW."name")), '\s+', ' ', 'g'), '');
  RETURN NEW;
END;
$$;
--> statement-breakpoint

UPDATE "themes" SET "normalized_name" = NULLIF(regexp_replace(lower(btrim("name")), '\s+', ' ', 'g'), '');
UPDATE "sticker_packs" SET "normalized_name" = NULLIF(regexp_replace(lower(btrim("name")), '\s+', ' ', 'g'), '');
UPDATE "editions" SET "normalized_name" = NULLIF(regexp_replace(lower(btrim("name")), '\s+', ' ', 'g'), '');
UPDATE "palettes" SET "normalized_name" = NULLIF(regexp_replace(lower(btrim("name")), '\s+', ' ', 'g'), '');
UPDATE "backgrounds" SET "normalized_name" = NULLIF(regexp_replace(lower(btrim("name")), '\s+', ' ', 'g'), '');
UPDATE "stickers_library" SET "normalized_name" = NULLIF(regexp_replace(lower(btrim("name")), '\s+', ' ', 'g'), '');
UPDATE "planner_interiors" SET "normalized_name" = NULLIF(regexp_replace(lower(btrim("name")), '\s+', ' ', 'g'), '');
--> statement-breakpoint

/*
 * Preserve all historical rows while allowing a unique index to be added.
 * The oldest matching row becomes the canonical normalized value; legacy
 * duplicates keep their original display name but a null canonical key.
 * New writes are always normalized by the trigger and therefore constrained.
 */
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "authored_by_store_id", "normalized_name" ORDER BY "created_at", "id"
  ) AS row_number
  FROM "themes"
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL
)
UPDATE "themes" AS target SET "normalized_name" = NULL
FROM ranked WHERE target."id" = ranked."id" AND ranked.row_number > 1;
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "authored_by_store_id", "normalized_name" ORDER BY "created_at", "id"
  ) AS row_number
  FROM "sticker_packs"
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL
)
UPDATE "sticker_packs" AS target SET "normalized_name" = NULL
FROM ranked WHERE target."id" = ranked."id" AND ranked.row_number > 1;
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "authored_by_store_id", "normalized_name" ORDER BY "created_at", "id"
  ) AS row_number
  FROM "editions"
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL
)
UPDATE "editions" AS target SET "normalized_name" = NULL
FROM ranked WHERE target."id" = ranked."id" AND ranked.row_number > 1;
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "authored_by_store_id", "normalized_name" ORDER BY "created_at", "id"
  ) AS row_number
  FROM "palettes"
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL
)
UPDATE "palettes" AS target SET "normalized_name" = NULL
FROM ranked WHERE target."id" = ranked."id" AND ranked.row_number > 1;
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "authored_by_store_id", "normalized_name" ORDER BY "created_at", "id"
  ) AS row_number
  FROM "backgrounds"
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL
)
UPDATE "backgrounds" AS target SET "normalized_name" = NULL
FROM ranked WHERE target."id" = ranked."id" AND ranked.row_number > 1;
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "authored_by_store_id", "normalized_name" ORDER BY "created_at", "id"
  ) AS row_number
  FROM "stickers_library"
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL
)
UPDATE "stickers_library" AS target SET "normalized_name" = NULL
FROM ranked WHERE target."id" = ranked."id" AND ranked.row_number > 1;
WITH ranked AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "store_id", "normalized_name" ORDER BY "created_at", "id"
  ) AS row_number
  FROM "planner_interiors"
  WHERE "normalized_name" IS NOT NULL
)
UPDATE "planner_interiors" AS target SET "normalized_name" = NULL
FROM ranked WHERE target."id" = ranked."id" AND ranked.row_number > 1;
--> statement-breakpoint

DROP TRIGGER IF EXISTS "themes_set_normalized_name" ON "themes";
CREATE TRIGGER "themes_set_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "themes"
FOR EACH ROW EXECUTE FUNCTION "daybook_set_normalized_name"();
DROP TRIGGER IF EXISTS "sticker_packs_set_normalized_name" ON "sticker_packs";
CREATE TRIGGER "sticker_packs_set_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "sticker_packs"
FOR EACH ROW EXECUTE FUNCTION "daybook_set_normalized_name"();
DROP TRIGGER IF EXISTS "editions_set_normalized_name" ON "editions";
CREATE TRIGGER "editions_set_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "editions"
FOR EACH ROW EXECUTE FUNCTION "daybook_set_normalized_name"();
DROP TRIGGER IF EXISTS "palettes_set_normalized_name" ON "palettes";
CREATE TRIGGER "palettes_set_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "palettes"
FOR EACH ROW EXECUTE FUNCTION "daybook_set_normalized_name"();
DROP TRIGGER IF EXISTS "backgrounds_set_normalized_name" ON "backgrounds";
CREATE TRIGGER "backgrounds_set_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "backgrounds"
FOR EACH ROW EXECUTE FUNCTION "daybook_set_normalized_name"();
DROP TRIGGER IF EXISTS "stickers_library_set_normalized_name" ON "stickers_library";
CREATE TRIGGER "stickers_library_set_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "stickers_library"
FOR EACH ROW EXECUTE FUNCTION "daybook_set_normalized_name"();
DROP TRIGGER IF EXISTS "planner_interiors_set_normalized_name" ON "planner_interiors";
CREATE TRIGGER "planner_interiors_set_normalized_name" BEFORE INSERT OR UPDATE OF "name" ON "planner_interiors"
FOR EACH ROW EXECUTE FUNCTION "daybook_set_normalized_name"();
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "themes_owned_normalized_name_uq"
  ON "themes" ("authored_by_store_id", "normalized_name")
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "sticker_packs_owned_normalized_name_uq"
  ON "sticker_packs" ("authored_by_store_id", "normalized_name")
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "editions_owned_normalized_name_uq"
  ON "editions" ("authored_by_store_id", "normalized_name")
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "palettes_owned_normalized_name_uq"
  ON "palettes" ("authored_by_store_id", "normalized_name")
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "backgrounds_owned_normalized_name_uq"
  ON "backgrounds" ("authored_by_store_id", "normalized_name")
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "stickers_library_owned_normalized_name_uq"
  ON "stickers_library" ("authored_by_store_id", "normalized_name")
  WHERE "origin" = 'owned' AND "status" <> 'deleted' AND "normalized_name" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "planner_interiors_store_normalized_name_uq"
  ON "planner_interiors" ("store_id", "normalized_name")
  WHERE "normalized_name" IS NOT NULL;