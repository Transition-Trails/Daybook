CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"drive_file_id" text NOT NULL,
	"kind" text DEFAULT 'png' NOT NULL,
	"transparent" boolean DEFAULT true NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source" text DEFAULT 'upload' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"role" text DEFAULT 'user' NOT NULL,
	"plan" text,
	"owned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"ai_provider" text DEFAULT 'claude' NOT NULL,
	"connections" jsonb DEFAULT '{"googleDrive":false,"googleCalendar":false,"googleTasks":false,"googleDocs":false,"notion":false}'::jsonb NOT NULL,
	"google_id" text,
	"google_access_token" text,
	"google_refresh_token" text,
	"google_token_expiry" timestamp with time zone,
	"notion_token" text,
	"password_hash" text,
	"platform_role" text,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "accessories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"authored_by_store_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backgrounds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'color' NOT NULL,
	"asset_ref" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"authored_by_store_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fonts" (
	"id" text PRIMARY KEY NOT NULL,
	"family_name" text NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_url" text,
	"curated_pairings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardware" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"finish" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"authored_by_store_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inserts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cat" text NOT NULL,
	"collection" text,
	"asset_id" text,
	"planners" jsonb DEFAULT '["all"]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"authored_by_store_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pack_stickers" (
	"id" serial PRIMARY KEY NOT NULL,
	"pack_id" text NOT NULL,
	"sticker_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pack_sticker_uq" UNIQUE("pack_id","sticker_id")
);
--> statement-breakpoint
CREATE TABLE "palettes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"colors" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"authored_by_store_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sticker_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"price" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"cover_drive_file_id" text,
	"planners" jsonb DEFAULT '["all"]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"authored_by_store_id" text,
	"attestation" text,
	"attesting_tool" text,
	"instruction_sheet_file_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stickers_library" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"function_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"origin" text DEFAULT 'owned' NOT NULL,
	"authored_by_store_id" text,
	"border_style" text DEFAULT 'none' NOT NULL,
	"border_width" real,
	"border_color" text,
	"size_in_mm" real,
	"export_targets" jsonb DEFAULT '{"goodnotes":true,"ink":true,"cricut":false}'::jsonb NOT NULL,
	"generation_type" text,
	"source_type" text,
	"shadow_style" text,
	"shadow_lift_px" real,
	"edge_feather_px" real,
	"set_id" text,
	"set_label" text,
	"file_name_pattern" text,
	"processed_image_data" text,
	"cutline_svg" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stickers" (
	"id" text PRIMARY KEY NOT NULL,
	"pack_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"name" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_inserts" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"svg_data" text NOT NULL,
	"width_pt" real DEFAULT 420 NOT NULL,
	"height_pt" real DEFAULT 595 NOT NULL,
	"palette_slots" jsonb,
	"hotspot_map" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "style_presets" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"name" text NOT NULL,
	"border_style" text DEFAULT 'none' NOT NULL,
	"border_width" real,
	"border_color" text,
	"size_in_mm" real,
	"shadow_style" text,
	"shadow_lift_px" real,
	"export_targets" jsonb DEFAULT '{"goodnotes":true,"ink":true,"cricut":false}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "theme_accessories" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"accessory_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "theme_accessory_uq" UNIQUE("theme_id","accessory_id")
);
--> statement-breakpoint
CREATE TABLE "theme_backgrounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"background_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "theme_background_uq" UNIQUE("theme_id","background_id")
);
--> statement-breakpoint
CREATE TABLE "theme_covers" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"insert_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "theme_cover_uq" UNIQUE("theme_id","insert_id")
);
--> statement-breakpoint
CREATE TABLE "theme_fonts" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"font_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "theme_font_uq" UNIQUE("theme_id","font_id")
);
--> statement-breakpoint
CREATE TABLE "theme_hardware" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"hardware_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "theme_hardware_uq" UNIQUE("theme_id","hardware_id")
);
--> statement-breakpoint
CREATE TABLE "theme_inserts" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"insert_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "theme_insert_uq" UNIQUE("theme_id","insert_id")
);
--> statement-breakpoint
CREATE TABLE "theme_packs" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "theme_pack_uq" UNIQUE("theme_id","pack_id")
);
--> statement-breakpoint
CREATE TABLE "theme_palettes" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"palette_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "theme_palette_uq" UNIQUE("theme_id","palette_id")
);
--> statement-breakpoint
CREATE TABLE "theme_widgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"theme_id" text NOT NULL,
	"widget_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "theme_widget_uq" UNIQUE("theme_id","widget_id")
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"desc" text,
	"colors" jsonb NOT NULL,
	"price" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text DEFAULT 'admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"authored_by_store_id" text,
	"font_pairing" jsonb,
	"background_roles" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widgets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"store_id" text,
	"size_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"svg_data" text,
	"palette_slots" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"origin" text DEFAULT 'owned' NOT NULL,
	"authored_by_store_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"tier" text DEFAULT 'basic' NOT NULL,
	"sections" text[] DEFAULT '{}' NOT NULL,
	"price_low" real,
	"price_high" real,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"packs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"inserts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"products" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"art" jsonb DEFAULT '{"cover":null,"first":null,"divider":null,"weekly":null,"daily":null,"notes":null}'::jsonb NOT NULL,
	"global_available" boolean DEFAULT true NOT NULL,
	"origin" text DEFAULT 'licensed' NOT NULL,
	"authored_by_store_id" text,
	"revision_of" text,
	"year" integer,
	"product_type" text DEFAULT 'planner' NOT NULL,
	"binding" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"one_time_price" real,
	"yearly_price" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotation_layers" (
	"id" text PRIMARY KEY NOT NULL,
	"planner_id" text NOT NULL,
	"page_id" text NOT NULL,
	"user_id" text NOT NULL,
	"strokes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"objects" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "annotation_layers_planner_id_page_id_user_id_unique" UNIQUE("planner_id","page_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"planner_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planner_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"store_id" text,
	"edition_id" text,
	"year" integer,
	"product_type" text DEFAULT 'planner' NOT NULL,
	"setup" jsonb NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{"calMode":"none","eventMins":60,"aiInPdf":false}'::jsonb NOT NULL,
	"drive" jsonb DEFAULT '{"pdfFileId":null,"configFileId":null}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_planner_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"edition_id" text,
	"product_type" text DEFAULT 'planner' NOT NULL,
	"setup" jsonb DEFAULT '{"weekStart":"mon","orientation":"vertical","startMonth":0,"startYear":2027,"monthCount":12,"datingMode":"dated"}'::jsonb NOT NULL,
	"style" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb DEFAULT '{"calMode":"none","eventMins":60,"aiInPdf":false}'::jsonb NOT NULL,
	"drive" jsonb DEFAULT '{"pdfFileId":null,"configFileId":null}'::jsonb NOT NULL,
	"generated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_user_id" text,
	"actor_role" text NOT NULL,
	"scope" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "help_content" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text NOT NULL,
	"kind" text DEFAULT 'article' NOT NULL,
	"scope" text DEFAULT 'platform' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"asset_type" text NOT NULL,
	"title" text NOT NULL,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_edition_id" text,
	"source_pack_id" text,
	"channel_target" text,
	"voice_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_catalog_store_type_item_uq" UNIQUE("store_id","item_type","item_id")
);
--> statement-breakpoint
CREATE TABLE "store_flags" (
	"store_id" text PRIMARY KEY NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"custom_domain" boolean DEFAULT false NOT NULL,
	"editions_cap" integer DEFAULT 5 NOT NULL,
	"storage_quota" integer DEFAULT 1024 NOT NULL,
	"ink_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_members_store_user_uq" UNIQUE("store_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "store_profiles" (
	"store_id" text PRIMARY KEY NOT NULL,
	"facts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"voice" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"domain" text,
	"owner_user_id" text NOT NULL,
	"plan" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'trial' NOT NULL,
	"default_mode" text DEFAULT 'curated' NOT NULL,
	"subscription_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "calendar_push_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"planner_config_id" text NOT NULL,
	"local_block_key" text NOT NULL,
	"google_event_id" text NOT NULL,
	"google_calendar_id" text DEFAULT 'primary' NOT NULL,
	"event_title" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"pushed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_push_mappings_user_id_planner_config_id_local_block_key_unique" UNIQUE("user_id","planner_config_id","local_block_key")
);
--> statement-breakpoint
CREATE TABLE "google_doc_links" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"note_key" text NOT NULL,
	"title" text NOT NULL,
	"doc_id" text NOT NULL,
	"doc_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_doc_links_user_id_note_key_unique" UNIQUE("user_id","note_key")
);
--> statement-breakpoint
CREATE TABLE "google_task_sync" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"google_task_id" text NOT NULL,
	"google_task_list_id" text DEFAULT '@default' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"completed" boolean DEFAULT false NOT NULL,
	"due_date" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_task_sync_user_id_google_task_id_unique" UNIQUE("user_id","google_task_id")
);
--> statement-breakpoint
CREATE TABLE "planner_hotspots" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"template_key" text NOT NULL,
	"x" real NOT NULL,
	"y" real NOT NULL,
	"w" real NOT NULL,
	"h" real NOT NULL,
	"target_type" text NOT NULL,
	"target_ref" text,
	"confidence" real,
	"source" text DEFAULT 'manual' NOT NULL,
	"label" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"decision_card" jsonb,
	"parts" text[] DEFAULT '{}' NOT NULL,
	"physical_path" jsonb,
	"claude_brief" jsonb,
	"release" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"build_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"author_user_id" text,
	"author_role" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"reporter_user_id" text,
	"reporter_role" text DEFAULT 'buyer' NOT NULL,
	"recipient_scope" text NOT NULL,
	"store_id" text,
	"area" text NOT NULL,
	"symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body" text,
	"screenshot_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"build_ref" text,
	"close_reason" text,
	"close_note" text,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_auto_response_dedupe" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_ref" text NOT NULL,
	"sender_email" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"idempotency_key" text,
	"store_id" text,
	"recipient_email" text NOT NULL,
	"template" text NOT NULL,
	"tier" text DEFAULT 'platform' NOT NULL,
	"from_address" text NOT NULL,
	"subject" text NOT NULL,
	"provider_message_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"status_updated_at" timestamp with time zone,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "store_email_config" (
	"store_id" text PRIMARY KEY NOT NULL,
	"from_display_name" text,
	"from_domain" text,
	"from_local_part" text,
	"domain_status" text DEFAULT 'not_started' NOT NULL,
	"resend_domain_id" text,
	"dns_records" jsonb,
	"dkim_verified_at" timestamp with time zone,
	"spf_verified_at" timestamp with time zone,
	"last_verify_check_at" timestamp with time zone,
	"last_verify_error" text,
	"tier1_suspended" boolean DEFAULT false NOT NULL,
	"suspended_reason" text,
	"monthly_volume" integer DEFAULT 0 NOT NULL,
	"bounce_count" integer DEFAULT 0 NOT NULL,
	"complaint_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"buyer_user_id" text,
	"buyer_email" text NOT NULL,
	"buyer_name" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"download_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resend_token" text,
	"receipt_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worldsmith_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_name" text NOT NULL,
	"asset_type" text NOT NULL,
	"world" text NOT NULL,
	"volume" text,
	"component_type" text NOT NULL,
	"current_version" text DEFAULT 'v001' NOT NULL,
	"filename" text,
	"production_spec_notion_id" text,
	"visual_asset_notion_id" text,
	"drive_file_id" text,
	"drive_url" text,
	"prompt_hash" text,
	"generation_provider" text,
	"model_name" text,
	"provider_request_id" text,
	"readiness_state" text DEFAULT 'Under Review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worldsmith_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"production_spec_id" text NOT NULL,
	"operation" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"payload_version" text,
	"compiled_prompt" text,
	"prompt_hash" text,
	"compiled_prompt_status" text,
	"visual_asset_notion_id" text,
	"asset_id" text,
	"asset_version" text,
	"provider" text,
	"model_name" text,
	"model_version" text,
	"generation_settings" jsonb,
	"seed" text,
	"provider_request_id" text,
	"cost_usd" real,
	"drive_file_id" text,
	"drive_folder_id" text,
	"drive_url" text,
	"daybook_asset_id" text,
	"errors" jsonb,
	"warnings" jsonb,
	"failed_stage" text,
	"error_code" text,
	"resolved_source_ids" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"notion_retries" jsonb,
	"initiated_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "worldsmith_spec_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"spec_page_id" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"template_version" text DEFAULT 'v1' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"preview_filename" text,
	"provider" text,
	"model" text,
	"notion_upload_id" text,
	"production_item" text,
	"previous_status" text,
	"new_status" text,
	"notion_page_url" text,
	"error" text,
	"dry_run" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worldsmith_worlds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'in_setup' NOT NULL,
	"cover_color" text DEFAULT 'linear-gradient(135deg, #1B2A4A 0%, #2A4A6A 100%)' NOT NULL,
	"cover_accent" text DEFAULT '#C87560' NOT NULL,
	"current_collection" text,
	"current_volume" text,
	"owner" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notion_production_db_id" text,
	"notion_canon_db_id" text,
	"notion_style_guide_id" text,
	"notion_style_guides_db_id" text,
	"world_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style_guide_version" integer DEFAULT 1 NOT NULL,
	"drive_folder_id" text,
	"image_provider" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws_canon_record_relations" (
	"from_record_id" text NOT NULL,
	"to_record_id" text NOT NULL,
	"relation_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ws_canon_record_relations_from_record_id_to_record_id_pk" PRIMARY KEY("from_record_id","to_record_id")
);
--> statement-breakpoint
CREATE TABLE "ws_canon_records" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"canon_type" text,
	"narrative_details" text DEFAULT '' NOT NULL,
	"historical_context" text DEFAULT '' NOT NULL,
	"visual_notes" text DEFAULT '' NOT NULL,
	"emotional_register" text,
	"sensory_clauses" text DEFAULT '' NOT NULL,
	"register_locked" boolean DEFAULT false NOT NULL,
	"spec_ref_count" integer DEFAULT 0 NOT NULL,
	"notion_page_id" text,
	"synced_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"season" text,
	"year" integer,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notion_page_id" text,
	"synced_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws_component_specs" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"component_type" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"notion_page_id" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws_production_specs" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"collection_id" text,
	"volume_id" text,
	"production_item" text NOT NULL,
	"spec_id" text,
	"component_type" text NOT NULL,
	"component_set" text,
	"hero_family" text,
	"current_version" text DEFAULT '1' NOT NULL,
	"design_intent" text DEFAULT '' NOT NULL,
	"narrative_purpose" text DEFAULT '' NOT NULL,
	"required_content" text DEFAULT '' NOT NULL,
	"review_criteria" text DEFAULT '' NOT NULL,
	"writing_space_percent" real,
	"orientation" text,
	"front_back_style" text,
	"canon_dependency" text DEFAULT 'None' NOT NULL,
	"canon_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload_version" text,
	"prompt_payload" text DEFAULT '' NOT NULL,
	"style_guide_id" text,
	"component_spec_id" text,
	"prompt_module_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"compiled_prompt_status" text DEFAULT 'Not Compiled' NOT NULL,
	"readiness_score" integer DEFAULT 0 NOT NULL,
	"notion_page_id" text,
	"synced_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws_prompt_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"dependency_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notion_page_id" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws_prompt_payloads" (
	"id" text PRIMARY KEY NOT NULL,
	"spec_id" text NOT NULL,
	"payload_version" text NOT NULL,
	"raw_payload" text NOT NULL,
	"shared_prompt" text,
	"front_prompt" text,
	"back_prompt" text,
	"negative_prompt" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"notion_page_id" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws_style_guides" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"notion_page_id" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ws_volumes" (
	"id" text PRIMARY KEY NOT NULL,
	"world_id" text NOT NULL,
	"collection_id" text,
	"name" text NOT NULL,
	"code" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"notion_page_id" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"release_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" serial PRIMARY KEY NOT NULL,
	"version" text NOT NULL,
	"version_type" text NOT NULL,
	"title" text NOT NULL,
	"release_date" timestamp,
	"github_sha" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "releases_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "accessories" ADD CONSTRAINT "accessories_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backgrounds" ADD CONSTRAINT "backgrounds_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardware" ADD CONSTRAINT "hardware_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inserts" ADD CONSTRAINT "inserts_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inserts" ADD CONSTRAINT "inserts_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_stickers" ADD CONSTRAINT "pack_stickers_pack_id_sticker_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."sticker_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_stickers" ADD CONSTRAINT "pack_stickers_sticker_id_stickers_library_id_fk" FOREIGN KEY ("sticker_id") REFERENCES "public"."stickers_library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "palettes" ADD CONSTRAINT "palettes_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticker_packs" ADD CONSTRAINT "sticker_packs_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers_library" ADD CONSTRAINT "stickers_library_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_pack_id_sticker_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."sticker_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stickers" ADD CONSTRAINT "stickers_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_inserts" ADD CONSTRAINT "store_inserts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_presets" ADD CONSTRAINT "style_presets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_accessories" ADD CONSTRAINT "theme_accessories_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_accessories" ADD CONSTRAINT "theme_accessories_accessory_id_accessories_id_fk" FOREIGN KEY ("accessory_id") REFERENCES "public"."accessories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_backgrounds" ADD CONSTRAINT "theme_backgrounds_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_backgrounds" ADD CONSTRAINT "theme_backgrounds_background_id_backgrounds_id_fk" FOREIGN KEY ("background_id") REFERENCES "public"."backgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_covers" ADD CONSTRAINT "theme_covers_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_covers" ADD CONSTRAINT "theme_covers_insert_id_inserts_id_fk" FOREIGN KEY ("insert_id") REFERENCES "public"."inserts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_fonts" ADD CONSTRAINT "theme_fonts_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_fonts" ADD CONSTRAINT "theme_fonts_font_id_fonts_id_fk" FOREIGN KEY ("font_id") REFERENCES "public"."fonts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_hardware" ADD CONSTRAINT "theme_hardware_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_hardware" ADD CONSTRAINT "theme_hardware_hardware_id_hardware_id_fk" FOREIGN KEY ("hardware_id") REFERENCES "public"."hardware"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_inserts" ADD CONSTRAINT "theme_inserts_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_inserts" ADD CONSTRAINT "theme_inserts_insert_id_inserts_id_fk" FOREIGN KEY ("insert_id") REFERENCES "public"."inserts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_packs" ADD CONSTRAINT "theme_packs_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_packs" ADD CONSTRAINT "theme_packs_pack_id_sticker_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."sticker_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_palettes" ADD CONSTRAINT "theme_palettes_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_palettes" ADD CONSTRAINT "theme_palettes_palette_id_palettes_id_fk" FOREIGN KEY ("palette_id") REFERENCES "public"."palettes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_widgets" ADD CONSTRAINT "theme_widgets_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_widgets" ADD CONSTRAINT "theme_widgets_widget_id_widgets_id_fk" FOREIGN KEY ("widget_id") REFERENCES "public"."widgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widgets" ADD CONSTRAINT "widgets_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_authored_by_store_id_stores_id_fk" FOREIGN KEY ("authored_by_store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "help_content" ADD CONSTRAINT "help_content_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_assets" ADD CONSTRAINT "marketing_assets_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_catalog" ADD CONSTRAINT "store_catalog_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_flags" ADD CONSTRAINT "store_flags_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_profiles" ADD CONSTRAINT "store_profiles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_replies" ADD CONSTRAINT "ticket_replies_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_email_config" ADD CONSTRAINT "store_email_config_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ws_canon_rel_from_idx" ON "ws_canon_record_relations" USING btree ("from_record_id");--> statement-breakpoint
CREATE INDEX "ws_canon_rel_to_idx" ON "ws_canon_record_relations" USING btree ("to_record_id");--> statement-breakpoint
CREATE INDEX "ws_canon_records_world_idx" ON "ws_canon_records" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "ws_canon_records_status_idx" ON "ws_canon_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ws_collections_world_idx" ON "ws_collections" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "ws_component_specs_world_idx" ON "ws_component_specs" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "ws_production_specs_world_idx" ON "ws_production_specs" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "ws_production_specs_status_idx" ON "ws_production_specs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ws_production_specs_collection_idx" ON "ws_production_specs" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "ws_prompt_modules_world_idx" ON "ws_prompt_modules" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "ws_prompt_payloads_spec_idx" ON "ws_prompt_payloads" USING btree ("spec_id");--> statement-breakpoint
CREATE INDEX "ws_style_guides_world_idx" ON "ws_style_guides" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "ws_volumes_world_idx" ON "ws_volumes" USING btree ("world_id");