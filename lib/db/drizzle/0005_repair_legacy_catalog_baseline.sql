DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_recipes'
      AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "product_recipes"
      ALTER COLUMN "created_at" TYPE timestamp without time zone
      USING "created_at" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_recipes'
      AND column_name = 'updated_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "product_recipes"
      ALTER COLUMN "updated_at" TYPE timestamp without time zone
      USING "updated_at" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'releases'
      AND column_name = 'release_date'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "releases"
      ALTER COLUMN "release_date" TYPE timestamp without time zone
      USING "release_date" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'releases'
      AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "releases"
      ALTER COLUMN "created_at" TYPE timestamp without time zone
      USING "created_at" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'releases'
      AND column_name = 'updated_at'
      AND data_type = 'timestamp with time zone'
  ) THEN
    ALTER TABLE "releases"
      ALTER COLUMN "updated_at" TYPE timestamp without time zone
      USING "updated_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_replies_ticket_id_tickets_id_fk') THEN
    ALTER TABLE "ticket_replies"
      ADD CONSTRAINT "ticket_replies_ticket_id_tickets_id_fk"
      FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_replies_author_user_id_users_id_fk') THEN
    ALTER TABLE "ticket_replies"
      ADD CONSTRAINT "ticket_replies_author_user_id_users_id_fk"
      FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_reporter_user_id_users_id_fk') THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_reporter_user_id_users_id_fk"
      FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_log_store_id_stores_id_fk') THEN
    ALTER TABLE "email_log"
      ADD CONSTRAINT "email_log_store_id_stores_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_log_idempotency_key_unique') THEN
    ALTER TABLE "email_log"
      ADD CONSTRAINT "email_log_idempotency_key_unique"
      UNIQUE ("idempotency_key");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_email_config_store_id_stores_id_fk') THEN
    ALTER TABLE "store_email_config"
      ADD CONSTRAINT "store_email_config_store_id_stores_id_fk"
      FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_buyer_user_id_users_id_fk') THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_buyer_user_id_users_id_fk"
      FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'release_notes_release_id_releases_id_fk') THEN
    ALTER TABLE "release_notes"
      ADD CONSTRAINT "release_notes_release_id_releases_id_fk"
      FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'releases_version_unique') THEN
    ALTER TABLE "releases"
      ADD CONSTRAINT "releases_version_unique"
      UNIQUE ("version");
  END IF;
END $$;
--> statement-breakpoint
DO $$ DECLARE
  existing_primary_key text;
  primary_key_columns text[];
BEGIN
  SELECT con.conname,
    array_agg(att.attname ORDER BY key_columns.ordinality)
  INTO existing_primary_key, primary_key_columns
  FROM pg_constraint con
  JOIN unnest(con.conkey) WITH ORDINALITY AS key_columns(attnum, ordinality) ON true
  JOIN pg_attribute att
    ON att.attrelid = con.conrelid
    AND att.attnum = key_columns.attnum
  WHERE con.conrelid = 'public.ws_canon_record_relations'::regclass
    AND con.contype = 'p'
  GROUP BY con.conname;

  IF existing_primary_key IS NULL THEN
    ALTER TABLE "ws_canon_record_relations"
      ADD CONSTRAINT "ws_canon_record_relations_from_record_id_to_record_id_pk"
      PRIMARY KEY ("from_record_id", "to_record_id");
  ELSIF primary_key_columns <> ARRAY['from_record_id', 'to_record_id'] THEN
    RAISE EXCEPTION
      'Cannot repair ws_canon_record_relations primary key: expected (from_record_id, to_record_id), found %',
      primary_key_columns;
  ELSIF existing_primary_key <> 'ws_canon_record_relations_from_record_id_to_record_id_pk' THEN
    EXECUTE format(
      'ALTER TABLE "ws_canon_record_relations" RENAME CONSTRAINT %I TO "ws_canon_record_relations_from_record_id_to_record_id_pk"',
      existing_primary_key
    );
  END IF;
END $$;