ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "stripe_subscription_id" text;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" text;