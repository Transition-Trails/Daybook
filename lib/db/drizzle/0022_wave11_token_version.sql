/*
 * Fences stale Google refresh responses from a newer OAuth consent callback.
 * A refresh write and a terminal invalid_grant disconnect only apply when this
 * version still matches the connection they read.
 */
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "google_token_version" integer NOT NULL DEFAULT 0;