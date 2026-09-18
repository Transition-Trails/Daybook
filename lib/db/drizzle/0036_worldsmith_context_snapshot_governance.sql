ALTER TABLE "ws_context_snapshots"
  ADD COLUMN IF NOT EXISTS "auto_sync_unaccepted" boolean DEFAULT false NOT NULL;