DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ws_canon_record_relations_from_record_id_ws_canon_records_id_fk'
  ) THEN
    ALTER TABLE "ws_canon_record_relations"
      ADD CONSTRAINT "ws_canon_record_relations_from_record_id_ws_canon_records_id_fk"
      FOREIGN KEY ("from_record_id") REFERENCES "public"."ws_canon_records"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ws_canon_record_relations_to_record_id_ws_canon_records_id_fk'
  ) THEN
    ALTER TABLE "ws_canon_record_relations"
      ADD CONSTRAINT "ws_canon_record_relations_to_record_id_ws_canon_records_id_fk"
      FOREIGN KEY ("to_record_id") REFERENCES "public"."ws_canon_records"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "fonts" ADD COLUMN IF NOT EXISTS "authored_by_store_id" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fonts_authored_by_store_id_stores_id_fk'
  ) THEN
    ALTER TABLE "fonts"
      ADD CONSTRAINT "fonts_authored_by_store_id_stores_id_fk"
      FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;