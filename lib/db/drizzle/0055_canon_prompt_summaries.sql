ALTER TABLE "ws_canon_records"
  ADD COLUMN IF NOT EXISTS "prompt_summary" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "prompt_summary_source_hash" text,
  ADD COLUMN IF NOT EXISTS "prompt_summary_generated_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "identity_summary" text DEFAULT '' NOT NULL,
  ADD COLUMN IF NOT EXISTS "identity_summary_source_hash" text,
  ADD COLUMN IF NOT EXISTS "identity_summary_generated_at" timestamp with time zone;