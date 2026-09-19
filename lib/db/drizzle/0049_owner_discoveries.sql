CREATE TABLE IF NOT EXISTS "ws_owner_discoveries" (
  "id" text PRIMARY KEY NOT NULL,
  "world_id" text NOT NULL REFERENCES "worldsmith_worlds"("id") ON DELETE CASCADE,
  "store_id" text NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "owner_user_id" text NOT NULL REFERENCES "users"("id"),
  "source_canon_record_id" text REFERENCES "ws_canon_records"("id") ON DELETE SET NULL,
  "story_id" text REFERENCES "ws_stories"("id") ON DELETE SET NULL,
  "story_moment" text NOT NULL,
  "owner_context" text NOT NULL,
  "title" text NOT NULL,
  "proposed_canon_type" text,
  "submission_snapshot" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'submitted',
  "editorial_canon_record_id" text REFERENCES "ws_canon_records"("id") ON DELETE SET NULL,
  "decision_reason" text,
  "reviewed_by" text REFERENCES "users"("id") ON DELETE SET NULL,
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "reviewed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_owner_discoveries_world_idx" ON "ws_owner_discoveries" ("world_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_owner_discoveries_store_idx" ON "ws_owner_discoveries" ("store_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_owner_discoveries_status_idx" ON "ws_owner_discoveries" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ws_owner_discovery_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "discovery_id" text NOT NULL REFERENCES "ws_owner_discoveries"("id") ON DELETE CASCADE,
  "revision_number" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "revision_note" text,
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ws_owner_discovery_revisions_discovery_number_unique" UNIQUE("discovery_id", "revision_number")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_owner_discovery_revisions_discovery_idx"
  ON "ws_owner_discovery_revisions" ("discovery_id");