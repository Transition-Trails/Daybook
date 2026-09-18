CREATE TABLE IF NOT EXISTS "ws_suggestion_refreshes" (
  "world_id" text NOT NULL,
  "suggestion_kind" text NOT NULL,
  "suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ws_suggestion_refreshes_world_id_suggestion_kind_pk"
    PRIMARY KEY ("world_id", "suggestion_kind")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_suggestion_refreshes_generated_idx"
  ON "ws_suggestion_refreshes" USING btree ("generated_at");