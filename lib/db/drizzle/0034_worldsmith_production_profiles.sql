CREATE TABLE IF NOT EXISTS "ws_punch_templates" (
  "id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "code" text NOT NULL,
  "binding_type" text DEFAULT 'disc_bound' NOT NULL, "status" text DEFAULT 'draft' NOT NULL,
  "disc_count" integer, "reference_page_height" real, "units" text DEFAULT 'inches' NOT NULL,
  "punch_center_spacing" real, "edge_offset" real, "mushroom_head_diameter" real,
  "stem_width" real, "stem_depth" real, "top_offset" real, "bottom_offset" real,
  "manufacturing_tolerance" real, "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ws_punch_templates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ws_production_profiles" (
  "id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "code" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL, "output_medium" text NOT NULL,
  "finished_width" real, "finished_height" real, "units" text DEFAULT 'inches' NOT NULL,
  "orientation_behavior" text NOT NULL, "bleed" real DEFAULT 0 NOT NULL,
  "outer_safe_margin" real DEFAULT 0 NOT NULL, "binding_type" text DEFAULT 'none' NOT NULL,
  "binding_safe_zone" real DEFAULT 0 NOT NULL, "binding_edge_behavior" text DEFAULT 'none' NOT NULL,
  "punch_template_id" text REFERENCES "ws_punch_templates"("id") ON DELETE SET NULL,
  "punch_template_version" integer,
  "punch_template_snapshot" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ws_production_profiles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "ws_component_specs" ADD COLUMN IF NOT EXISTS "production_profile_id" text REFERENCES "ws_production_profiles"("id") ON DELETE SET NULL;