CREATE TABLE IF NOT EXISTS "user_invitations" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "role" text NOT NULL,
  "store_id" text,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_invitations_role_store_ck" CHECK (
    ("role" = 'super_admin' AND "store_id" IS NULL) OR
    ("role" IN ('store_owner', 'store_staff', 'support') AND "store_id" IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS "user_invitations_email_idx" ON "user_invitations" ("email");
CREATE INDEX IF NOT EXISTS "user_invitations_expires_at_idx" ON "user_invitations" ("expires_at");