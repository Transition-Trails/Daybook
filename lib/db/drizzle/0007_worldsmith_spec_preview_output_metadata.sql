ALTER TABLE "worldsmith_spec_previews"
  ADD COLUMN IF NOT EXISTS "preview_object_path" text;
--> statement-breakpoint
ALTER TABLE "worldsmith_spec_previews"
  ADD COLUMN IF NOT EXISTS "output_metadata" jsonb;