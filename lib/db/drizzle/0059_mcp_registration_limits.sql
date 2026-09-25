CREATE TABLE IF NOT EXISTS "mcp_oauth_registration_limits" (
  "scope" text NOT NULL,
  "subject_key" text NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL,
  "attempts" integer NOT NULL CHECK ("attempts" > 0),
  PRIMARY KEY ("scope", "subject_key", "window_started_at")
);
CREATE INDEX IF NOT EXISTS "mcp_oauth_registration_limits_window_idx"
  ON "mcp_oauth_registration_limits" ("window_started_at");