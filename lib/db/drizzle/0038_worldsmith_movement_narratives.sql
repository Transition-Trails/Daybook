ALTER TABLE "ws_story_acts"
  ADD COLUMN IF NOT EXISTS "narrative" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ws_canon_record_story_links"
  ADD COLUMN IF NOT EXISTS "id" text;
--> statement-breakpoint
UPDATE "ws_canon_record_story_links"
  SET "id" = md5("canon_record_id" || ':' || "story_id" || ':' || COALESCE("act_id", 'story'))
  WHERE "id" IS NULL;
--> statement-breakpoint
ALTER TABLE "ws_canon_record_story_links"
  ALTER COLUMN "id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ws_canon_record_story_links"
  DROP CONSTRAINT IF EXISTS "ws_canon_record_story_links_canon_record_id_story_id_pk";
--> statement-breakpoint
ALTER TABLE "ws_canon_record_story_links"
  DROP CONSTRAINT IF EXISTS "ws_canon_record_story_links_pkey";
--> statement-breakpoint
ALTER TABLE "ws_canon_record_story_links"
  DROP CONSTRAINT IF EXISTS "ws_canon_record_story_links_id_pk";
--> statement-breakpoint
ALTER TABLE "ws_canon_record_story_links"
  ADD CONSTRAINT "ws_canon_record_story_links_id_pk" PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "ws_canon_record_story_links"
  DROP CONSTRAINT IF EXISTS "ws_canon_record_story_links_act_id_fkey";
--> statement-breakpoint
ALTER TABLE "ws_canon_record_story_links"
  ADD CONSTRAINT "ws_canon_record_story_links_act_id_fkey"
  FOREIGN KEY ("act_id") REFERENCES "ws_story_acts"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ws_crsl_story_level_unique"
  ON "ws_canon_record_story_links" ("canon_record_id", "story_id")
  WHERE "act_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ws_crsl_movement_unique"
  ON "ws_canon_record_story_links" ("canon_record_id", "story_id", "act_id")
  WHERE "act_id" IS NOT NULL;