ALTER TABLE "ai_usage_records"
  ADD COLUMN IF NOT EXISTS "cost_unavailable_reason" text;