CREATE TABLE IF NOT EXISTS "ai_call_reservations" (
  "id" serial PRIMARY KEY NOT NULL,
  "dedupe_key" text NOT NULL UNIQUE,
  "config_id" integer REFERENCES "ai_provider_configs"("id") ON DELETE SET NULL,
  "scope_store_id" text REFERENCES "stores"("id") ON DELETE SET NULL,
  "funding_source" text NOT NULL,
  "estimated_reserved_cents" integer DEFAULT 0 NOT NULL,
  "status" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "ai_call_reservations_expiry_idx"
  ON "ai_call_reservations" ("status", "expires_at");