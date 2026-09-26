ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "users" SET "email_verified_at" = now()
WHERE ("google_id" IS NOT NULL OR "provider" = 'google') AND "email_verified_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_auth_tokens" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "store_id" text,
  "purpose" text NOT NULL,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_auth_tokens_purpose_ck" CHECK ("purpose" IN ('email_verification', 'password_reset'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_auth_tokens_user_purpose_idx"
  ON "user_auth_tokens" ("user_id", "purpose");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_auth_tokens_expires_at_idx"
  ON "user_auth_tokens" ("expires_at");