CREATE TABLE IF NOT EXISTS "worldsmith_image_targets" (
  "component_type" text PRIMARY KEY NOT NULL,
  "print_width_in" real NOT NULL,
  "print_height_in" real NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "worldsmith_image_targets" ("component_type", "print_width_in", "print_height_in")
VALUES
  ('Hero Paper', 12, 12),
  ('Decorative Paper', 12, 12),
  ('Coordinating Paper', 12, 12),
  ('Journal Card', 3, 4),
  ('Ephemera Sheet', 8.5, 11),
  ('Notepaper', 8.5, 11),
  ('Endpaper', 8.5, 11)
ON CONFLICT ("component_type") DO NOTHING;