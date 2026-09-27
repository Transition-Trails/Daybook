ALTER TABLE "ws_vocabularies" ADD COLUMN IF NOT EXISTS "record_type" text;
--> statement-breakpoint
DROP INDEX IF EXISTS "ws_vocabularies_key_scope_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "ws_vocabularies_key_scope_unique" ON "ws_vocabularies" USING btree ("key", "scope", "world_id") WHERE "record_type" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "ws_vocabularies_key_type_scope_unique" ON "ws_vocabularies" USING btree ("key", "scope", "world_id", "record_type") WHERE "record_type" IS NOT NULL;