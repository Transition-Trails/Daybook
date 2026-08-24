ALTER TABLE "worldsmith_runs"
  ADD COLUMN IF NOT EXISTS "generated_filename" text;
--> statement-breakpoint
ALTER TABLE "worldsmith_runs"
  ADD COLUMN IF NOT EXISTS "notion_upload_id" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "worldsmith_production_packages" (
  "id" text PRIMARY KEY NOT NULL,
  "production_spec_id" text NOT NULL,
  "prompt_hash" text NOT NULL,
  "provider" text NOT NULL,
  "model_name" text NOT NULL,
  "model_version" text DEFAULT '' NOT NULL,
  "effective_size" text NOT NULL,
  "quality" text NOT NULL,
  "filename" text NOT NULL,
  "visual_asset_notion_id" text,
  "notion_upload_id" text,
  "provider_request_id" text,
  "estimated_cost_usd" real,
  "actual_cost_usd" real,
  "status" text DEFAULT 'generating' NOT NULL,
  "production_art_status" text DEFAULT 'not_started' NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worldsmith_production_packages_identity_idx"
  ON "worldsmith_production_packages" (
    "production_spec_id",
    "prompt_hash",
    "provider",
    "model_name",
    "model_version",
    "effective_size",
    "quality"
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worldsmith_production_packages_spec_idx"
  ON "worldsmith_production_packages" ("production_spec_id");