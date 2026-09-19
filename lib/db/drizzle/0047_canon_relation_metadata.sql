ALTER TABLE "ws_canon_record_relations"
  ADD COLUMN IF NOT EXISTS "details" text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "scope" text NOT NULL DEFAULT 'world',
  ADD COLUMN IF NOT EXISTS "created_by" text,
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone NOT NULL DEFAULT now();