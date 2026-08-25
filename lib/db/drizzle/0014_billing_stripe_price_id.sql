ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "stripe_price_id" text;