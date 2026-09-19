ALTER TABLE "ai_provider_configs"
  ALTER COLUMN "encrypted_credential" DROP NOT NULL,
  ALTER COLUMN "credential_iv" DROP NOT NULL,
  ALTER COLUMN "credential_tag" DROP NOT NULL;

ALTER TABLE "ai_call_reservations"
  DROP CONSTRAINT IF EXISTS "ai_call_reservations_dedupe_key_key";
DROP INDEX IF EXISTS "ai_call_reservations_dedupe_key_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ai_call_reservations_pending_dedupe_uq"
  ON "ai_call_reservations" ("dedupe_key") WHERE "status" = 'pending';