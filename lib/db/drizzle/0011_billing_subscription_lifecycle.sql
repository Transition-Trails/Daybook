ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "plan_current_period_end" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "plan_status" text;