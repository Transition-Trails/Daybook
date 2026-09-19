ALTER TABLE "ws_canon_records"
  ADD COLUMN IF NOT EXISTS "canon_guardrails" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "relationship_details" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "character_direction" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "confirmed_canon" text NOT NULL DEFAULT '';