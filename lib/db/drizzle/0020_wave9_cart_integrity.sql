/*
 * Wave 9: persist resolved seller carts, make edition prices explicit, and
 * retire the store_catalog product spelling.
 */
ALTER TABLE "editions"
  ADD COLUMN IF NOT EXISTS "digital_price_cents" integer;
--> statement-breakpoint
UPDATE "editions"
SET "digital_price_cents" = ROUND("price_low" * 100)::integer
WHERE "digital_price_cents" IS NULL
  AND "price_low" IS NOT NULL
  AND "price_low" >= 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "checkout_intents" (
  "id" text PRIMARY KEY NOT NULL,
  "store_id" text NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "buyer_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "items" jsonb NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'usd',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "checkout_intents_expires_at_idx"
  ON "checkout_intents" ("expires_at");
--> statement-breakpoint
-- Remove collisions before changing the discriminator used by the unique key.
DELETE FROM "store_catalog" AS product_row
USING "store_catalog" AS edition_row
WHERE product_row."item_type" = 'product'
  AND edition_row."item_type" = 'edition'
  AND product_row."store_id" = edition_row."store_id"
  AND product_row."item_id" = edition_row."item_id";
--> statement-breakpoint
UPDATE "store_catalog"
SET "item_type" = 'edition'
WHERE "item_type" = 'product';
--> statement-breakpoint
-- Historical seller orders are normalized too, so no delivery path needs the
-- retired alias after this migration.
UPDATE "orders" AS order_row
SET "items" = COALESCE((
  SELECT jsonb_agg(
    CASE
      WHEN item->>'itemType' = 'product'
        THEN jsonb_set(item, '{itemType}', '"edition"'::jsonb)
      ELSE item
    END
  )
  FROM jsonb_array_elements(order_row."items") AS item
), '[]'::jsonb)
WHERE order_row."items" @> '[{"itemType":"product"}]'::jsonb;
--> statement-breakpoint
-- 0019 used a synthetic owner on some existing databases. Restore only that
-- known bad value, preferring the oldest account that can actually sign in.
WITH oldest_super_admin AS (
  SELECT "id"
  FROM "users"
  WHERE "platform_role" = 'super_admin'
  ORDER BY "created_at", "id"
  LIMIT 1
)
UPDATE "stores"
SET "owner_user_id" = (SELECT "id" FROM oldest_super_admin)
WHERE "id" = 'store-house'
  AND "owner_user_id" = 'user-platform-system'
  AND EXISTS (SELECT 1 FROM oldest_super_admin);