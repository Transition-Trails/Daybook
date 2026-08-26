CREATE TABLE IF NOT EXISTS "spine_styles" (
  "id" text PRIMARY KEY NOT NULL,
  "origin" text NOT NULL,
  "authored_by_store_id" text,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "asset_ref" text NOT NULL,
  "unit_aspect" real NOT NULL,
  "gap_ratio" real DEFAULT 0 NOT NULL,
  "orientation" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "spine_styles_authored_by_store_id_stores_id_fk"
    FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id")
    ON DELETE set null ON UPDATE no action,
  CONSTRAINT "spine_styles_origin_check" CHECK ("origin" IN ('starter', 'owned')),
  CONSTRAINT "spine_styles_status_check" CHECK ("status" IN ('draft', 'live')),
  CONSTRAINT "spine_styles_orientation_check" CHECK ("orientation" IN ('vertical', 'horizontal')),
  CONSTRAINT "spine_styles_aspect_check" CHECK ("unit_aspect" > 0),
  CONSTRAINT "spine_styles_gap_check" CHECK ("gap_ratio" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spine_style_scope_slug_uq"
  ON "spine_styles" USING btree ("origin", "authored_by_store_id", "slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spine_style_starter_slug_uq"
  ON "spine_styles" USING btree ("slug")
  WHERE "origin" = 'starter' AND "authored_by_store_id" IS NULL;