ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "password_credential_version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_auth_tokens"
  ADD COLUMN IF NOT EXISTS "credential_hash" text;