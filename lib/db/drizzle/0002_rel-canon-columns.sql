ALTER TABLE "ws_canon_records" ADD COLUMN IF NOT EXISTS "from_entity_id" text;--> statement-breakpoint
ALTER TABLE "ws_canon_records" ADD COLUMN IF NOT EXISTS "to_entity_id" text;--> statement-breakpoint
ALTER TABLE "ws_canon_records" ADD COLUMN IF NOT EXISTS "emotional_valence" text;
