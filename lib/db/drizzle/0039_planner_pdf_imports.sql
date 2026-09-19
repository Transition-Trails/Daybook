CREATE TABLE IF NOT EXISTS "planner_pdf_imports" (
  "id" text PRIMARY KEY NOT NULL,
  "source_object_path" text NOT NULL,
  "original_file_name" text NOT NULL,
  "file_size" integer NOT NULL,
  "checksum_sha256" text NOT NULL,
  "page_count" integer NOT NULL,
  "status" text DEFAULT 'review' NOT NULL,
  "created_by_user_id" text NOT NULL,
  "planner_template_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planner_pdf_imports_source_path_idx" ON "planner_pdf_imports" ("source_object_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planner_pdf_imports_creator_idx" ON "planner_pdf_imports" ("created_by_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planner_pdf_import_pages" (
  "id" text PRIMARY KEY NOT NULL,
  "import_id" text NOT NULL,
  "source_page_number" integer NOT NULL,
  "width_points" integer NOT NULL,
  "height_points" integer NOT NULL,
  "section_type" text DEFAULT 'other' NOT NULL,
  "behavior" text DEFAULT 'unique' NOT NULL,
  "template_key" text,
  "label" text,
  "order_index" integer NOT NULL,
  "hidden" boolean DEFAULT false NOT NULL,
  "overlay" jsonb DEFAULT '{"elements":[]}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planner_pdf_import_pages_import_order_idx" ON "planner_pdf_import_pages" ("import_id", "order_index");
--> statement-breakpoint
ALTER TABLE "planner_pdf_imports" ADD CONSTRAINT "planner_pdf_imports_planner_template_id_fkey" FOREIGN KEY ("planner_template_id") REFERENCES "platform_planner_templates"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "planner_pdf_import_pages" ADD CONSTRAINT "planner_pdf_import_pages_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "planner_pdf_imports"("id") ON DELETE CASCADE;