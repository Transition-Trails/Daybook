CREATE TABLE IF NOT EXISTS "ai_provider_configs" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" text REFERENCES "stores"("id") ON DELETE CASCADE,
  "provider" text NOT NULL,
  "encrypted_credential" text NOT NULL,
  "credential_iv" text NOT NULL,
  "credential_tag" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "allow_platform_fallback" boolean DEFAULT true NOT NULL,
  "allowed_models" text[] DEFAULT '{}'::text[] NOT NULL,
  "requests_per_day" integer,
  "estimated_cents_per_month" integer,
  "created_by" text REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_provider_configs_scope_provider_uq"
  ON "ai_provider_configs" (COALESCE("store_id", '__platform__'), "provider");

CREATE TABLE IF NOT EXISTS "ai_pricing" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "input_cents_per_million" integer DEFAULT 0 NOT NULL,
  "output_cents_per_million" integer DEFAULT 0 NOT NULL,
  "image_cents" integer,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "metadata" jsonb,
  CONSTRAINT "ai_pricing_provider_model_version_uq" UNIQUE ("provider", "model", "version")
);

CREATE TABLE IF NOT EXISTS "ai_usage_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL UNIQUE,
  "store_id" text REFERENCES "stores"("id") ON DELETE SET NULL,
  "user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "feature" text DEFAULT 'unattributed' NOT NULL,
  "provider" text NOT NULL,
  "model" text,
  "prompt_hash" text NOT NULL,
  "status" text NOT NULL,
  "error_category" text,
  "provider_request_id" text,
  "input_tokens" integer,
  "output_tokens" integer,
  "estimated_cost_cents" integer,
  "funding_source" text DEFAULT 'platform' NOT NULL,
  "duration_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ai_usage_records_store_created_idx"
  ON "ai_usage_records" ("store_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_usage_records_provider_created_idx"
  ON "ai_usage_records" ("provider", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "ai_usage_records_feature_created_idx"
  ON "ai_usage_records" ("feature", "created_at" DESC);