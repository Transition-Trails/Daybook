CREATE TABLE IF NOT EXISTS "planner_interiors" (
  "id" text PRIMARY KEY NOT NULL,
  "store_id" text NOT NULL,
  "name" text NOT NULL,
  "current_version_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "planner_interiors"
  ADD CONSTRAINT "planner_interiors_store_id_stores_id_fk"
  FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planner_interiors_store_id_idx" ON "planner_interiors" ("store_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planner_interior_versions" (
  "id" text PRIMARY KEY NOT NULL,
  "interior_id" text NOT NULL,
  "version" integer NOT NULL,
  "manifest" jsonb NOT NULL,
  "assets" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "planner_interior_versions"
  ADD CONSTRAINT "planner_interior_versions_interior_id_planner_interiors_id_fk"
  FOREIGN KEY ("interior_id") REFERENCES "public"."planner_interiors"("id")
  ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "planner_interior_versions_interior_version_uq"
  ON "planner_interior_versions" ("interior_id", "version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planner_interior_versions_interior_id_idx"
  ON "planner_interior_versions" ("interior_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "planner_interior_versions_immutable"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'planner interior versions are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "planner_interior_versions_immutable_trigger"
  BEFORE UPDATE OR DELETE ON "planner_interior_versions"
  FOR EACH ROW
  EXECUTE FUNCTION "planner_interior_versions_immutable"();
--> statement-breakpoint
ALTER TABLE "planner_interiors"
  ADD CONSTRAINT "planner_interiors_current_version_id_planner_interior_versions_id_fk"
  FOREIGN KEY ("current_version_id") REFERENCES "public"."planner_interior_versions"("id")
  ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "editions"
  ADD COLUMN IF NOT EXISTS "interior_version_id" text;
--> statement-breakpoint
ALTER TABLE "editions"
  ADD CONSTRAINT "editions_interior_version_id_planner_interior_versions_id_fk"
  FOREIGN KEY ("interior_version_id") REFERENCES "public"."planner_interior_versions"("id")
  ON DELETE SET NULL ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "editions_interior_version_id_idx" ON "editions" ("interior_version_id");