CREATE TABLE IF NOT EXISTS "ws_session_reports" (
  "id" text PRIMARY KEY NOT NULL,
  "author_user_id" text NOT NULL,
  "client_id" text NOT NULL,
  "session_key" text NOT NULL,
  "world_id" text,
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "work_done" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "next_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ws_session_reports_session_unique" ON "ws_session_reports" ("author_user_id", "client_id", "session_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_session_reports_created_idx" ON "ws_session_reports" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ws_session_reports_world_idx" ON "ws_session_reports" ("world_id");