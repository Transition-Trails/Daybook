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
      FOREIGN KEY ("authored_by_store_id")
      REFERENCES "stores"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;