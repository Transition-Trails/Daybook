CREATE TABLE IF NOT EXISTS "ws_context_snapshots" (
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "world_id" text,
  "github_path" text NOT NULL,
  "github_commit_sha" text,
  "status" text DEFAULT 'not_generated' NOT NULL,
  "content_hash" text,
  "record_updated_at" timestamptz,
  "last_snapshot_at" timestamptz,
  "last_error" text,
  "auto_sync" boolean DEFAULT false NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "ws_context_snapshots_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_context_snapshots_world_idx" ON "ws_context_snapshots" USING btree ("world_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_context_snapshots_status_idx" ON "ws_context_snapshots" USING btree ("status");