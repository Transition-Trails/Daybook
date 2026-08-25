/*
 * Wave 7: make orders a trustworthy delivery record.
 *
 * Receipt capability tokens now expire and have persisted resend/attempt
 * state. Orders are tied to real stores; legacy billing rows use store-house,
 * the platform's seeded seller identity.
 */
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "resend_token_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "resend_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "resend_window_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "resend_window_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "receipt_attempts" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "receipt_last_error" text;
--> statement-breakpoint
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "receipt_last_attempt_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "orders"
  SET "resend_token_expires_at" = "created_at" + interval '48 hours'
  WHERE "resend_token_expires_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "orders"
  ALTER COLUMN "resend_token_expires_at"
  SET DEFAULT now() + interval '48 hours';
--> statement-breakpoint
ALTER TABLE "orders"
  ALTER COLUMN "resend_token_expires_at" SET NOT NULL;
--> statement-breakpoint
INSERT INTO "stores" (
  "id", "name", "slug", "owner_user_id", "plan", "status",
  "default_mode", "subscription_active"
)
SELECT
  'store-house', 'Daybook Platform', 'daybook-platform', "id", 'pro', 'active',
  'curated', true
FROM "users"
ORDER BY ("platform_role" = 'super_admin') DESC, "created_at" ASC
LIMIT 1
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
UPDATE "orders" SET "store_id" = 'store-house' WHERE "store_id" = 'platform';
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_store_id_stores_id_fk'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_store_id_stores_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
      ON DELETE restrict ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_receipt_pending_idx"
  ON "orders" ("store_id", "receipt_sent_at")
  WHERE "receipt_sent_at" IS NULL;