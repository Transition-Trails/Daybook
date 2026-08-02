import { pgTable, text, boolean, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";

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

// Inline type used in jsonb columns (not a table row type)
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
