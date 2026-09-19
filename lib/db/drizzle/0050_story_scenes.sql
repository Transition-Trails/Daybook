CREATE TABLE IF NOT EXISTS "ws_scenes" (
  "id" text PRIMARY KEY NOT NULL,
  "act_id" text NOT NULL,
  "story_id" text NOT NULL,
  "world_id" text NOT NULL,
  "scene_number" integer DEFAULT 1 NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT '' NOT NULL,
  "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "primary_image_url" text,
  "primary_image_prompt" text,
  "primary_image_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ws_scenes_act_id_ws_story_acts_id_fk" FOREIGN KEY ("act_id") REFERENCES "public"."ws_story_acts"("id") ON DELETE CASCADE,
  CONSTRAINT "ws_scenes_story_id_ws_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."ws_stories"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ws_scenes_act_idx" ON "ws_scenes" USING btree ("act_id");
CREATE INDEX IF NOT EXISTS "ws_scenes_story_idx" ON "ws_scenes" USING btree ("story_id");
CREATE INDEX IF NOT EXISTS "ws_scenes_world_idx" ON "ws_scenes" USING btree ("world_id");

CREATE TABLE IF NOT EXISTS "ws_scene_canon_links" (
  "scene_id" text NOT NULL,
  "canon_record_id" text NOT NULL,
  "role" text DEFAULT 'featured' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ws_scene_canon_links_scene_id_canon_record_id_pk" PRIMARY KEY ("scene_id", "canon_record_id"),
  CONSTRAINT "ws_scene_canon_links_scene_id_ws_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."ws_scenes"("id") ON DELETE CASCADE,
  CONSTRAINT "ws_scene_canon_links_canon_record_id_ws_canon_records_id_fk" FOREIGN KEY ("canon_record_id") REFERENCES "public"."ws_canon_records"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ws_scene_canon_scene_idx" ON "ws_scene_canon_links" USING btree ("scene_id");
CREATE INDEX IF NOT EXISTS "ws_scene_canon_record_idx" ON "ws_scene_canon_links" USING btree ("canon_record_id");