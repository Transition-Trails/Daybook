import { pgTable, text, boolean, integer, real, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";

// ── WorldSmith Run Repository ─────────────────────────────────────────────────
// Persists every compilation and generation run for audit and recovery.

export const worldsmithRunsTable = pgTable("worldsmith_runs", {
  id: text("id").primaryKey(),
  productionSpecId: text("production_spec_id").notNull(),
  operation: text("operation").notNull(), // validate_and_compile | compile_and_generate | preview
  status: text("status").notNull().default("pending"),
  // pending | compiling | compiled | validation_failed | requires_canon_review | generating | complete | failed
  dryRun: boolean("dry_run").notNull().default(false),
  payloadVersion: text("payload_version"),
  compiledPrompt: text("compiled_prompt"),
  promptHash: text("prompt_hash"),
  compiledPromptStatus: text("compiled_prompt_status"),
  // Notion Visual Asset page ID (created/updated during this run)
  visualAssetNotionId: text("visual_asset_notion_id"),
  // Stable logical Asset ID  WS-{WORLD}-{VOLUME}-{TYPE}{SEQ}-{ROLE}
  assetId: text("asset_id"),
  assetVersion: text("asset_version"),
  // Generation (populated after compile_and_generate)
  provider: text("provider"),
  modelName: text("model_name"),
  modelVersion: text("model_version"),
  generationSettings: jsonb("generation_settings").$type<Record<string, unknown>>(),
  seed: text("seed"),
  providerRequestId: text("provider_request_id"),
  costUsd: real("cost_usd"),
  // Drive (populated after successful upload)
  driveFileId: text("drive_file_id"),
  driveFolderId: text("drive_folder_id"),
  driveUrl: text("drive_url"),
  // Daybook registration
  daybookAssetId: text("daybook_asset_id"),
  // Validation results
  errors: jsonb("errors").$type<ValidationErrorRecord[]>(),
  warnings: jsonb("warnings").$type<ValidationErrorRecord[]>(),
  // Failure tracking
  failedStage: text("failed_stage"),
  errorCode: text("error_code"),
  // Audit — all resolved Notion page IDs keyed by role
  resolvedSourceIds: jsonb("resolved_source_ids").$type<Record<string, string | string[]>>(),
  retryCount: integer("retry_count").notNull().default(0),
  notionRetries: jsonb("notion_retries").$type<NotionRetryEvent[]>(),
  /** Structured per-section records produced by the compiler (PP-2.0+). Used to surface World Bible summary in run history. */
  compiledSections: jsonb("compiled_sections").$type<CompiledSectionRecord[]>(),
  initiatedBy: text("initiated_by"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type WorldsmithRun = typeof worldsmithRunsTable.$inferSelect;
export type InsertWorldsmithRun = typeof worldsmithRunsTable.$inferInsert;

// ── WorldSmith Asset Registry (Daybook adapter) ───────────────────────────────
// Stable asset identity — resolved by Asset ID, not filename.

export const worldsmithAssetsTable = pgTable("worldsmith_assets", {
  // Immutable logical key: WS-{WORLD}-{VOLUME}-{TYPE}{SEQ}-{ROLE}
  id: text("id").primaryKey(),
  assetName: text("asset_name").notNull(),
  assetType: text("asset_type").notNull(),
  world: text("world").notNull(),
  volume: text("volume"),
  componentType: text("component_type").notNull(),
  currentVersion: text("current_version").notNull().default("v001"),
  filename: text("filename"),
  // Notion links
  productionSpecNotionId: text("production_spec_notion_id"),
  visualAssetNotionId: text("visual_asset_notion_id"),
  // Drive
  driveFileId: text("drive_file_id"),
  driveUrl: text("drive_url"),
  // Provenance
  promptHash: text("prompt_hash"),
  generationProvider: text("generation_provider"),
  modelName: text("model_name"),
  providerRequestId: text("provider_request_id"),
  // Workflow
  readinessState: text("readiness_state").notNull().default("Under Review"),
  // Under Review | Approved | Rejected
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WorldsmithAsset = typeof worldsmithAssetsTable.$inferSelect;
export type InsertWorldsmithAsset = typeof worldsmithAssetsTable.$inferInsert;

// Inline types used in jsonb columns (not table row types)

/** A single labeled section in the structured compiled prompt (mirrored from worldsmith/types.ts). */
export interface CompiledSectionRecord {
  key: string;
  label: string;
  content: string;
  source: string;
}

export interface ValidationErrorRecord {
  code: string;
  field: string;
  governing_rule: string;
  message: string;
  recommended_action: string;
}

// Structured record of a single Notion API retry attempt
export interface NotionRetryEvent {
  attempt: number;      // 1-based retry number
  path: string;         // Notion API path, e.g. /pages/abc
  reason: "rate_limited" | "network_error";
  delay_ms: number;     // actual sleep duration in milliseconds
  at: string;           // ISO-8601 timestamp when the retry was initiated
}

// ── WorldSmith Spec Preview Audit Log ────────────────────────────────────────
// Tracks every spec-preview generation attempt for idempotency + audit.

export const worldsmithSpecPreviewsTable = pgTable("worldsmith_spec_previews", {
  id: text("id").primaryKey(),
  specPageId: text("spec_page_id").notNull(),
  promptHash: text("prompt_hash").notNull(),
  templateVersion: text("template_version").notNull().default("v1"),
  status: text("status").notNull().default("pending"),
  // pending | success | failed | upload_failed | status_update_failed
  previewFilename: text("preview_filename"),
  /** Durable App Storage path for a locally generated Editorial Suite board. */
  previewObjectPath: text("preview_object_path"),
  provider: text("provider"),
  model: text("model"),
  notionUploadId: text("notion_upload_id"),
  productionItem: text("production_item"),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  notionPageUrl: text("notion_page_url"),
  error: text("error"),
  dryRun: boolean("dry_run").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorldsmithSpecPreview = typeof worldsmithSpecPreviewsTable.$inferSelect;
export type InsertWorldsmithSpecPreview = typeof worldsmithSpecPreviewsTable.$inferInsert;

// ── WorldSmith Worlds Registry ────────────────────────────────────────────────
// Persistent registry of creative worlds managed by the WorldSmith system.

export const worldsmithWorldsTable = pgTable("worldsmith_worlds", {
  id: text("id").primaryKey(),              // slug, e.g. "wychcombe"
  // Every world belongs to one store. Platform admins may oversee all stores,
  // while store teams can only query their own worlds.
  storeId: text("store_id").references(() => storesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  code: text("code").notNull(),             // 3-letter code, e.g. "WYC"
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("in_setup"),
  // active | in_setup | archived
  coverColor: text("cover_color").notNull().default("linear-gradient(135deg, #1B2A4A 0%, #2A4A6A 100%)"),
  coverAccent: text("cover_accent").notNull().default("#C87560"),
  currentCollection: text("current_collection"),
  currentVolume: text("current_volume"),
  owner: text("owner").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  // Notion workspace IDs
  notionProductionDbId: text("notion_production_db_id"),
  notionCanonDbId: text("notion_canon_db_id"),
  notionStyleGuideId: text("notion_style_guide_id"),
  notionStyleGuidesDbId: text("notion_style_guides_db_id"),
  // Creative governance (Worldsmith Canon Records UI — Step 1)
  // Hard negatives that compile last onto every prompt; not overridable by a record
  worldRules: jsonb("world_rules").$type<string[]>().notNull().default([]),
  // World Bible — aesthetic identity fields injected into every generation prompt
  visualPalette:     text("visual_palette"),     // dominant hues, light quality, tonal range
  proseVoice:        text("prose_voice"),         // tense, person, sentence rhythm, register
  atmosphericNotes:  text("atmospheric_notes"),   // ambient mood, emotional texture
  materialWorld:     text("material_world"),      // textures, surfaces, physical substances
  // Catalog-backed selections only; compiled separately from editorial prose.
  typography: jsonb("typography").$type<Array<{
    fontId: string;
    family: string;
    roles: Array<{ role: string; weight?: string }>;
  }>>().notNull().default([]),
  // Bumped when a style rule changes; triggers re-flagging of all affected assets
  styleGuideVersion: integer("style_guide_version").notNull().default(1),
  // Google Drive folder
  driveFolderId: text("drive_folder_id"),
  // Image provider
  imageProvider: text("image_provider"),    // dalle3 | stability | none
  // Hero background image (object-storage path or URL)
  coverImageUrl: text("cover_image_url"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type WorldsmithWorld = typeof worldsmithWorldsTable.$inferSelect;
export type InsertWorldsmithWorld = typeof worldsmithWorldsTable.$inferInsert;
