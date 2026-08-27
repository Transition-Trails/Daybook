-- Persist whether a store belongs to platform fixtures rather than a customer.
-- The prefixes cover legacy CI fixtures; customer-created stores default false.
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "is_seed" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE "stores"
SET "is_seed" = true
WHERE "id" IN ('store-house', 'store-alpha', 'store-beta', 'store-gamma', 'store-delta')
   OR "id" LIKE 'test-store-%'
   OR "id" LIKE 'ci-store-%';