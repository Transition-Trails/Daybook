CREATE TABLE IF NOT EXISTS "planner_project_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "store_id" text NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "planner_config_id" text NOT NULL REFERENCES "planner_configs"("id") ON DELETE CASCADE,
  "managed_object_path" text NOT NULL,
  "display_name" text NOT NULL,
  "content_type" text DEFAULT 'image/png' NOT NULL,
  "byte_size" text,
  "width" text,
  "height" text,
  "usage_kind" text DEFAULT 'artwork' NOT NULL,
  "modified" boolean DEFAULT false NOT NULL,
  "source_system" text DEFAULT 'worldsmith' NOT NULL,
  "world_id" text,
  "collection_id" text,
  "volume_id" text,
  "production_spec_id" text,
  "component_type" text,
  "source_asset_id" text NOT NULL,
  "source_asset_version" text NOT NULL,
  "imported_at" timestamp with time zone DEFAULT now() NOT NULL,
  "production_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "planner_project_assets_identity_idx"
  ON "planner_project_assets" ("planner_config_id", "source_asset_id", "source_asset_version");
CREATE INDEX IF NOT EXISTS "planner_project_assets_planner_idx" ON "planner_project_assets" ("planner_config_id");
CREATE INDEX IF NOT EXISTS "planner_project_assets_store_idx" ON "planner_project_assets" ("store_id");