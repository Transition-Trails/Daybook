ALTER TABLE "ws_production_specs"
  ALTER COLUMN "production_item" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "ws_production_specs"
  ALTER COLUMN "component_type" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "ws_production_specs"
  ADD COLUMN IF NOT EXISTS "wizard_step" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "ws_production_specs"
  ADD COLUMN IF NOT EXISTS "wizard_complete" boolean NOT NULL DEFAULT true;