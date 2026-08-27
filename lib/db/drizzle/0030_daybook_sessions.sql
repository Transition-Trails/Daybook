-- Shared PostgreSQL session storage for all API instances.
CREATE TABLE IF NOT EXISTS "daybook_sessions" (
  "sid" varchar NOT NULL COLLATE "default" PRIMARY KEY,
  "sess" json NOT NULL,
  "expire" timestamp(6) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_daybook_sessions_expire"
  ON "daybook_sessions" ("expire");