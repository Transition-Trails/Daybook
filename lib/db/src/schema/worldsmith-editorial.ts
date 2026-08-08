import {
  pgTable, text, boolean, integer, real, timestamp, jsonb, index, primaryKey,
} from "drizzle-orm/pg-core";

// ── WorldSmith Editorial Suite ────────────────────────────────────────────────
// Local-first creative authoring tables. Every record has a nullable
// notion_page_id + synced_at so the Notion publish adapter can track sync state.

// ── Collections ───────────────────────────────────────────────────────────────

export const wsCollectionsTable = pgTable("ws_collections", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  season: text("season"),
  year: integer("year"),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("draft"), // draft | active | archived
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [index("ws_collections_world_idx").on(t.worldId)]);

export type WsCollection = typeof wsCollectionsTable.$inferSelect;
export type InsertWsCollection = typeof wsCollectionsTable.$inferInsert;

// ── Volumes ───────────────────────────────────────────────────────────────────

export const wsVolumesTable = pgTable("ws_volumes", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  collectionId: text("collection_id"),
  name: text("name").notNull(),
  code: text("code"), // e.g. "V01"
  status: text("status").notNull().default("draft"),
  description: text("description").notNull().default(""),
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [index("ws_volumes_world_idx").on(t.worldId)]);

export type WsVolume = typeof wsVolumesTable.$inferSelect;
export type InsertWsVolume = typeof wsVolumesTable.$inferInsert;

// ── Canon Records ─────────────────────────────────────────────────────────────

export const wsCanonRecordsTable = pgTable("ws_canon_records", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  // proposed | under_review | accepted | superseded | rejected
  status: text("status").notNull().default("proposed"),
  // character | location | object | event | lore | atmosphere | material
  canonType: text("canon_type"),
  narrativeDetails: text("narrative_details").notNull().default(""),
  historicalContext: text("historical_context").notNull().default(""),
  visualNotes: text("visual_notes").notNull().default(""),
  // Worldsmith Canon Records UI — three new fields (Step 1)
  // Withholding | Intimate | Guarded | Trespass | Absence | Confidence
  emotionalRegister: text("emotional_register"),
  // Multi-line material/light detail; compiled verbatim into prompt
  sensoryClauses: text("sensory_clauses").notNull().default(""),
  // Stops transitive cascade overwriting this record's register
  registerLocked: boolean("register_locked").notNull().default(false),
  // How many production specs reference this record (denormalised for the Canon Board)
  specRefCount: integer("spec_ref_count").notNull().default(0),
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("ws_canon_records_world_idx").on(t.worldId),
  index("ws_canon_records_status_idx").on(t.status),
]);

export type WsCanonRecord = typeof wsCanonRecordsTable.$inferSelect;
export type InsertWsCanonRecord = typeof wsCanonRecordsTable.$inferInsert;

// ── Canon Record Relations ────────────────────────────────────────────────────
// Stores record-to-record links locally for transitive register cascade BFS.
// Populated by the Notion sync (from "Related Canon" relation property).

export const wsCanonRecordRelationsTable = pgTable("ws_canon_record_relations", {
  fromRecordId: text("from_record_id").notNull().references(() => wsCanonRecordsTable.id, { onDelete: "cascade" }),
  toRecordId: text("to_record_id").notNull().references(() => wsCanonRecordsTable.id, { onDelete: "cascade" }),
  relationType: text("relation_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.fromRecordId, t.toRecordId] }),
  index("ws_canon_rel_from_idx").on(t.fromRecordId),
  index("ws_canon_rel_to_idx").on(t.toRecordId),
]);

// ── Style Guides ──────────────────────────────────────────────────────────────

export const wsStyleGuidesTable = pgTable("ws_style_guides", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [index("ws_style_guides_world_idx").on(t.worldId)]);

export type WsStyleGuide = typeof wsStyleGuidesTable.$inferSelect;
export type InsertWsStyleGuide = typeof wsStyleGuidesTable.$inferInsert;

// ── Component Specs ───────────────────────────────────────────────────────────

export const wsComponentSpecsTable = pgTable("ws_component_specs", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  componentType: text("component_type").notNull(),
  content: text("content").notNull().default(""),
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [index("ws_component_specs_world_idx").on(t.worldId)]);

export type WsComponentSpec = typeof wsComponentSpecsTable.$inferSelect;
export type InsertWsComponentSpec = typeof wsComponentSpecsTable.$inferInsert;

// ── Prompt Modules ────────────────────────────────────────────────────────────

export const wsPromptModulesTable = pgTable("ws_prompt_modules", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  dependencyIds: jsonb("dependency_ids").$type<string[]>().notNull().default([]),
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [index("ws_prompt_modules_world_idx").on(t.worldId)]);

export type WsPromptModule = typeof wsPromptModulesTable.$inferSelect;
export type InsertWsPromptModule = typeof wsPromptModulesTable.$inferInsert;

// ── Production Specs ──────────────────────────────────────────────────────────

export const wsProductionSpecsTable = pgTable("ws_production_specs", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  collectionId: text("collection_id"),
  volumeId: text("volume_id"),

  // Identity
  productionItem: text("production_item").notNull(),
  specId: text("spec_id"), // e.g. "V01·HP·004"
  componentType: text("component_type").notNull(),
  componentSet: text("component_set"),
  heroFamily: text("hero_family"),
  currentVersion: text("current_version").notNull().default("1"),

  // Creative direction
  designIntent: text("design_intent").notNull().default(""),
  narrativePurpose: text("narrative_purpose").notNull().default(""),
  requiredContent: text("required_content").notNull().default(""),
  reviewCriteria: text("review_criteria").notNull().default(""),

  // Print spec
  writingSpacePercent: real("writing_space_percent"),
  orientation: text("orientation"),
  frontBackStyle: text("front_back_style"),

  // Canon governance
  // None | Supports Canon | Canon Reference | Canon Defining
  canonDependency: text("canon_dependency").notNull().default("None"),
  // Local ws_canon_records.id values
  canonRecordIds: jsonb("canon_record_ids").$type<string[]>().notNull().default([]),

  // Payload
  payloadVersion: text("payload_version"), // PP-1.0 | PP-2.0
  promptPayload: text("prompt_payload").notNull().default(""),

  // Related records (local IDs)
  styleGuideId: text("style_guide_id"),
  componentSpecId: text("component_spec_id"),
  promptModuleIds: jsonb("prompt_module_ids").$type<string[]>().notNull().default([]),

  // Pipeline workflow
  // draft | payload_ready | canon_clear | compiled | published | blocked
  status: text("status").notNull().default("draft"),
  compiledPromptStatus: text("compiled_prompt_status").notNull().default("Not Compiled"),
  // 0–100 — recomputed on every save via computeReadinessScore()
  readinessScore: integer("readiness_score").notNull().default(0),

  // Notion sync
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),

  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("ws_production_specs_world_idx").on(t.worldId),
  index("ws_production_specs_status_idx").on(t.status),
  index("ws_production_specs_collection_idx").on(t.collectionId),
]);

export type WsProductionSpec = typeof wsProductionSpecsTable.$inferSelect;
export type InsertWsProductionSpec = typeof wsProductionSpecsTable.$inferInsert;

// ── Prompt Payload Revisions ──────────────────────────────────────────────────

export const wsPromptPayloadsTable = pgTable("ws_prompt_payloads", {
  id: text("id").primaryKey(),
  specId: text("spec_id").notNull(),
  payloadVersion: text("payload_version").notNull(),
  rawPayload: text("raw_payload").notNull(),
  // PP-2.0 structured sections (parsed for display)
  sharedPrompt: text("shared_prompt"),
  frontPrompt: text("front_prompt"),
  backPrompt: text("back_prompt"),
  negativePrompt: text("negative_prompt"),
  isCurrent: boolean("is_current").notNull().default(true),
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("ws_prompt_payloads_spec_idx").on(t.specId)]);

export type WsPromptPayload = typeof wsPromptPayloadsTable.$inferSelect;
export type InsertWsPromptPayload = typeof wsPromptPayloadsTable.$inferInsert;
