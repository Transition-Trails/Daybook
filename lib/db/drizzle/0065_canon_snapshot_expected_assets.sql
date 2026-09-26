ALTER TABLE "ws_context_snapshots"
  ADD COLUMN IF NOT EXISTS "pending_expected_assets" jsonb;