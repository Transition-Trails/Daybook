-- The consolidated 0000 baseline predates several additive WorldSmith
-- editorial features. Keep these repairs in the tracked ledger so fresh
-- deployments and legacy databases converge through `@workspace/db migrate`.

ALTER TABLE "store_flags"
  ADD COLUMN IF NOT EXISTS "worldsmith_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

ALTER TABLE "worldsmith_worlds"
  ADD COLUMN IF NOT EXISTS "store_id" text REFERENCES "stores"("id") ON DELETE cascade,
  ADD COLUMN IF NOT EXISTS "visual_palette" text,
  ADD COLUMN IF NOT EXISTS "prose_voice" text,
  ADD COLUMN IF NOT EXISTS "atmospheric_notes" text,
  ADD COLUMN IF NOT EXISTS "material_world" text,
  ADD COLUMN IF NOT EXISTS "typography" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "cover_image_url" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worldsmith_worlds_store_id_idx"
  ON "worldsmith_worlds" ("store_id");
--> statement-breakpoint

ALTER TABLE "worldsmith_runs"
  ADD COLUMN IF NOT EXISTS "compiled_sections" jsonb;
--> statement-breakpoint

ALTER TABLE "ws_canon_records"
  ADD COLUMN IF NOT EXISTS "typography" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "narrative_visibility" text,
  ADD COLUMN IF NOT EXISTS "temporal_scope" text,
  ADD COLUMN IF NOT EXISTS "canon_stability" text,
  ADD COLUMN IF NOT EXISTS "from_entity_id" text,
  ADD COLUMN IF NOT EXISTS "to_entity_id" text,
  ADD COLUMN IF NOT EXISTS "emotional_valence" text,
  ADD COLUMN IF NOT EXISTS "portrait_url" text,
  ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL;
--> statement-breakpoint

ALTER TABLE "ws_style_guides"
  ADD COLUMN IF NOT EXISTS "typography" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint

ALTER TABLE "ws_prompt_modules"
  ADD COLUMN IF NOT EXISTS "section" text DEFAULT 'general' NOT NULL
    CHECK ("section" IN ('world', 'style', 'general'));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ws_stories" (
  "id" text PRIMARY KEY NOT NULL,
  "world_id" text NOT NULL,
  "title" text NOT NULL,
  "summary" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_stories_world_idx" ON "ws_stories" ("world_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ws_story_acts" (
  "id" text PRIMARY KEY NOT NULL,
  "story_id" text NOT NULL REFERENCES "ws_stories"("id") ON DELETE cascade,
  "world_id" text NOT NULL,
  "act_number" integer DEFAULT 1 NOT NULL,
  "title" text NOT NULL,
  "tagline" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_story_acts_story_idx" ON "ws_story_acts" ("story_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_story_acts_world_idx" ON "ws_story_acts" ("world_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ws_encounters" (
  "id" text PRIMARY KEY NOT NULL,
  "act_id" text NOT NULL REFERENCES "ws_story_acts"("id") ON DELETE cascade,
  "location_record_id" text,
  "trigger_text" text DEFAULT '' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "roll_type" text,
  "outcome_text" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_encounters_act_idx" ON "ws_encounters" ("act_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ws_journal_prompts" (
  "id" text PRIMARY KEY NOT NULL,
  "record_id" text NOT NULL,
  "story_id" text REFERENCES "ws_stories"("id") ON DELETE SET NULL,
  "prompt_text" text NOT NULL,
  "hint_label" text DEFAULT '' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_journal_prompts_record_idx"
  ON "ws_journal_prompts" ("record_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_journal_prompts_story_idx"
  ON "ws_journal_prompts" ("story_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ws_canon_record_story_links" (
  "canon_record_id" text NOT NULL,
  "story_id" text NOT NULL REFERENCES "ws_stories"("id") ON DELETE cascade,
  "act_id" text REFERENCES "ws_story_acts"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ws_canon_record_story_links_canon_record_id_story_id_pk"
    PRIMARY KEY("canon_record_id", "story_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_crsl_record_idx"
  ON "ws_canon_record_story_links" ("canon_record_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_crsl_story_idx"
  ON "ws_canon_record_story_links" ("story_id");