ALTER TABLE "worldsmith_production_packages"
  ADD COLUMN IF NOT EXISTS "revision_prompt" text;
--> statement-breakpoint
ALTER TABLE "worldsmith_production_packages"
  ADD COLUMN IF NOT EXISTS "is_review_candidate" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
WITH "latest_success" AS (
  SELECT DISTINCT ON ("production_spec_id") "id"
  FROM "worldsmith_production_packages"
  WHERE "status" = 'success'
  ORDER BY "production_spec_id", "created_at" DESC
)
UPDATE "worldsmith_production_packages"
SET "is_review_candidate" = true
WHERE "id" IN (SELECT "id" FROM "latest_success")
  AND "is_review_candidate" = false;