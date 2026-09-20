CREATE TABLE IF NOT EXISTS "ws_narrative_images" (
  "id" text PRIMARY KEY NOT NULL,
  "world_id" text NOT NULL,
  "story_id" text NOT NULL,
  "act_id" text,
  "scene_id" text,
  "title" text NOT NULL,
  "alt_text" text DEFAULT '' NOT NULL,
  "object_path" text NOT NULL,
  "mime_type" text,
  "byte_size" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ws_narrative_images_target_check" CHECK (
    ("act_id" IS NULL OR "scene_id" IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_narrative_images_story_idx" ON "ws_narrative_images" USING btree ("story_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_narrative_images_act_idx" ON "ws_narrative_images" USING btree ("act_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_narrative_images_scene_idx" ON "ws_narrative_images" USING btree ("scene_id");