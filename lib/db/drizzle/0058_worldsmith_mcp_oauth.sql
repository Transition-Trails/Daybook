ALTER TABLE "ws_canon_records"
  ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS "mcp_canon_history" (
  "id" text PRIMARY KEY NOT NULL,
  "record_id" text NOT NULL,
  "actor_user_id" text NOT NULL,
  "change_type" text NOT NULL,
  "before" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "after" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "diff" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "mcp_canon_history_record_idx"
  ON "mcp_canon_history" ("record_id", "created_at");

CREATE TABLE IF NOT EXISTS "mcp_oauth_clients" (
  "client_id" text PRIMARY KEY NOT NULL,
  "client_name" text NOT NULL,
  "redirect_uris" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "mcp_oauth_authorization_codes" (
  "code_hash" text PRIMARY KEY NOT NULL,
  "client_id" text NOT NULL REFERENCES "mcp_oauth_clients"("client_id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "redirect_uri" text NOT NULL,
  "resource" text NOT NULL,
  "scopes" jsonb NOT NULL,
  "code_challenge" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "mcp_oauth_codes_expiry_idx"
  ON "mcp_oauth_authorization_codes" ("expires_at");
CREATE INDEX IF NOT EXISTS "mcp_oauth_codes_user_idx"
  ON "mcp_oauth_authorization_codes" ("user_id");

CREATE TABLE IF NOT EXISTS "mcp_oauth_tokens" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL CHECK ("kind" IN ('access', 'refresh')),
  "family_id" text NOT NULL,
  "client_id" text NOT NULL REFERENCES "mcp_oauth_clients"("client_id") ON DELETE CASCADE,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "resource" text NOT NULL,
  "scopes" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "replaced_by_hash" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "mcp_oauth_tokens_family_idx"
  ON "mcp_oauth_tokens" ("family_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_tokens_user_idx"
  ON "mcp_oauth_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "mcp_oauth_tokens_expiry_idx"
  ON "mcp_oauth_tokens" ("expires_at");