/*
 * Wave 8: direct seller checkout through Stripe Connect.
 *
 * Seller payments are direct charges on the connected account, so their
 * payment ledger rows do not require a platform subscription user or plan.
 * The platform's own subscription seller is kept separate from the house shop.
 */
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "stripe_account_id" text;
--> statement-breakpoint
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "stripe_charges_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "payments"
  ALTER COLUMN "user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments"
  ALTER COLUMN "plan_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" text;
--> statement-breakpoint
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "stripe_connected_account_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_stripe_checkout_session_id_uq"
  ON "payments" ("stripe_checkout_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_connected_account_id_idx"
  ON "payments" ("stripe_connected_account_id");
--> statement-breakpoint
INSERT INTO "users" (
  "id", "provider", "email", "name", "role", "owned", "ai_enabled",
  "ai_provider", "connections"
)
VALUES (
  'user-platform-system', 'system', 'platform-system@daybook.invalid',
  'Daybook Platform', 'owner', '[]'::jsonb, false, 'claude',
  '{"googleDrive":false,"googleCalendar":false,"googleTasks":false,"googleDocs":false,"notion":false}'::jsonb
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- 0018 creates store-house with the old platform slug. Rename it before
-- inserting store-platform, because stores.slug is unique on migrated DBs.
UPDATE "stores"
SET
  "name" = 'Pixel Perfect Plans',
  "slug" = 'pixel-perfect-plans'
WHERE "id" = 'store-house';
--> statement-breakpoint
UPDATE "stores"
SET "owner_user_id" = 'user-platform-system'
WHERE "id" = 'store-house' AND "owner_user_id" IS NULL;
--> statement-breakpoint
INSERT INTO "stores" (
  "id", "name", "slug", "owner_user_id", "plan", "status",
  "default_mode", "subscription_active"
)
VALUES (
  'store-platform', 'Daybook Platform', 'daybook-platform',
  'user-platform-system', 'pro', 'active', 'curated', true
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "slug" = EXCLUDED."slug",
  "owner_user_id" = EXCLUDED."owner_user_id";
--> statement-breakpoint
UPDATE "orders"
SET "store_id" = 'store-platform'
WHERE "id" LIKE 'ord_billing_%';