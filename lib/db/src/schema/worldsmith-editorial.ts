import {
  pgTable, text, boolean, integer, real, timestamp, jsonb, index, primaryKey, unique, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
  // character | location | object | event | lore | atmosphere | material | relationship | motif
  canonType: text("canon_type"),
  narrativeDetails: text("narrative_details").notNull().default(""),
  historicalContext: text("historical_context").notNull().default(""),
  visualNotes: text("visual_notes").notNull().default(""),
  typography: jsonb("typography").$type<Array<{
    fontId: string;
    family: string;
    roles: Array<{ role: string; weight?: string }>;
  }>>().notNull().default([]),
  // Worldsmith Canon Records UI — three new fields (Step 1)
  // Withholding | Intimate | Guarded | Trespass | Absence | Confidence
  emotionalRegister: text("emotional_register"),
  // Multi-line material/light detail; compiled verbatim into prompt
  sensoryClauses: text("sensory_clauses").notNull().default(""),
  // Stops transitive cascade overwriting this record's register
  registerLocked: boolean("register_locked").notNull().default(false),
  // Authorial-metadata fields (Step 3)
  // background | hinted | explicit — how directly this fact surfaces in prose
  narrativeVisibility: text("narrative_visibility"),
  // Free-text era / phase tag, e.g. "Victorian era", "Volume I only", "Eternal"
  temporalScope: text("temporal_scope"),
  // low | medium | high — likelihood of this record being retconned
  canonStability: text("canon_stability"),
  // REL (Relationship) — explicit bond between two canon entities
  fromEntityId: text("from_entity_id"),
  toEntityId: text("to_entity_id"),
  // admiration | affection | rivalry | estrangement | dependency | betrayal | grief | obligation | ambivalence
  emotionalValence: text("emotional_valence"),
  // How many production specs reference this record (denormalised for the Canon Board)
  specRefCount: integer("spec_ref_count").notNull().default(0),
  // Portrait image — objectPath from object storage (e.g. /objects/uploads/uuid)
  portraitUrl: text("portrait_url"),
  // Rich editorial notes; markdown-formatted free text
  notes: text("notes").notNull().default(""),
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

// ── Context Snapshots ─────────────────────────────────────────────────────────

export const wsContextSnapshotsTable = pgTable("ws_context_snapshots", {
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  worldId: text("world_id"),
  githubPath: text("github_path").notNull(),
  githubCommitSha: text("github_commit_sha"),
  status: text("status").notNull().default("not_generated"),
  contentHash: text("content_hash"),
  recordUpdatedAt: timestamp("record_updated_at", { withTimezone: true }),
  lastSnapshotAt: timestamp("last_snapshot_at", { withTimezone: true }),
  lastError: text("last_error"),
  autoSync: boolean("auto_sync").notNull().default(false),
  autoSyncUnaccepted: boolean("auto_sync_unaccepted").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.entityType, t.entityId] }),
  index("ws_context_snapshots_world_idx").on(t.worldId),
  index("ws_context_snapshots_status_idx").on(t.status),
]);

export type WsContextSnapshot = typeof wsContextSnapshotsTable.$inferSelect;
export type InsertWsContextSnapshot = typeof wsContextSnapshotsTable.$inferInsert;

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
  typography: jsonb("typography").$type<Array<{
    fontId: string;
    family: string;
    roles: Array<{ role: string; weight?: string }>;
  }>>().notNull().default([]),
  notionPageId: text("notion_page_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [index("ws_style_guides_world_idx").on(t.worldId)]);

export type WsStyleGuide = typeof wsStyleGuidesTable.$inferSelect;
export type InsertWsStyleGuide = typeof wsStyleGuidesTable.$inferInsert;

// ── Production Profiles & Punch Templates ─────────────────────────────────────
export const wsPunchTemplatesTable = pgTable("ws_punch_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  bindingType: text("binding_type").notNull().default("disc_bound"),
  status: text("status").notNull().default("draft"),
  discCount: integer("disc_count"),
  referencePageHeight: real("reference_page_height"),
  units: text("units").notNull().default("inches"),
  punchCenterSpacing: real("punch_center_spacing"),
  edgeOffset: real("edge_offset"),
  mushroomHeadDiameter: real("mushroom_head_diameter"),
  stemWidth: real("stem_width"),
  stemDepth: real("stem_depth"),
  topOffset: real("top_offset"),
  bottomOffset: real("bottom_offset"),
  manufacturingTolerance: real("manufacturing_tolerance"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique("ws_punch_templates_code_unique").on(t.code)]);
export type WsPunchTemplate = typeof wsPunchTemplatesTable.$inferSelect;
export type InsertWsPunchTemplate = typeof wsPunchTemplatesTable.$inferInsert;

export const wsProductionProfilesTable = pgTable("ws_production_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull(),
  status: text("status").notNull().default("draft"),
  outputMedium: text("output_medium").notNull(),
  finishedWidth: real("finished_width"),
  finishedHeight: real("finished_height"),
  units: text("units").notNull().default("inches"),
  orientationBehavior: text("orientation_behavior").notNull(),
  bleed: real("bleed").notNull().default(0),
  outerSafeMargin: real("outer_safe_margin").notNull().default(0),
  bindingType: text("binding_type").notNull().default("none"),
  bindingSafeZone: real("binding_safe_zone").notNull().default(0),
  bindingEdgeBehavior: text("binding_edge_behavior").notNull().default("none"),
  punchTemplateId: text("punch_template_id").references(() => wsPunchTemplatesTable.id, { onDelete: "set null" }),
  punchTemplateVersion: integer("punch_template_version"),
  punchTemplateSnapshot: jsonb("punch_template_snapshot").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [unique("ws_production_profiles_code_unique").on(t.code)]);
export type WsProductionProfile = typeof wsProductionProfilesTable.$inferSelect;
export type InsertWsProductionProfile = typeof wsProductionProfilesTable.$inferInsert;

// ── Component Specs ───────────────────────────────────────────────────────────

export const wsComponentSpecsTable = pgTable("ws_component_specs", {
  id: text("id").primaryKey(),
  worldId: text("world_id").notNull(),
  name: text("name").notNull(),
  componentType: text("component_type").notNull(),
  productionProfileId: text("production_profile_id").references(() => wsProductionProfilesTable.id, { onDelete: "set null" }),
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
  // world | style | general — compiler routing is explicit, never inferred from the display name.
  section: text("section").notNull().default("general"),
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
  // Drafts may be opened before the identity screen is complete.
  productionItem: text("production_item"),
  specId: text("spec_id"), // e.g. "V01·HP·004"
  componentType: text("component_type"),
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
  // Last screen reached in the progressive New Spec wizard (0–4).
  wizardStep: integer("wizard_step").notNull().default(0),
  // Existing records are complete; newly bootstrapped wizard drafts set false.
  wizardComplete: boolean("wizard_complete").notNull().default(true),

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

// ── WorldSmith Stories ────────────────────────────────────────────────────────

export const wsStoriesTable = pgTable("ws_stories", {
  id:        text("id").primaryKey(),
  worldId:   text("world_id").notNull(),
  title:     text("title").notNull(),
  summary:   text("summary").notNull().default(""),
  status:    text("status").notNull().default("draft"), // active | draft | planned | archived
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [index("ws_stories_world_idx").on(t.worldId)]);

export type WsStory = typeof wsStoriesTable.$inferSelect;
export type InsertWsStory = typeof wsStoriesTable.$inferInsert;

// ── Story Acts ────────────────────────────────────────────────────────────────

export const wsStoryActsTable = pgTable("ws_story_acts", {
  id:        text("id").primaryKey(),
  storyId:   text("story_id").notNull(),
  worldId:   text("world_id").notNull(),
  actNumber: integer("act_number").notNull().default(1),
  title:     text("title").notNull(),
  tagline:   text("tagline").notNull().default(""),
  narrative: text("narrative").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("ws_story_acts_story_idx").on(t.storyId),
  index("ws_story_acts_world_idx").on(t.worldId),
]);

export type WsStoryAct = typeof wsStoryActsTable.$inferSelect;
export type InsertWsStoryAct = typeof wsStoryActsTable.$inferInsert;

// ── Encounters ────────────────────────────────────────────────────────────────

export const wsEncountersTable = pgTable("ws_encounters", {
  id:               text("id").primaryKey(),
  actId:            text("act_id").notNull(),
  locationRecordId: text("location_record_id"),
  triggerText:      text("trigger_text").notNull().default(""),
  description:      text("description").notNull().default(""),
  rollType:         text("roll_type"),
  outcomeText:      text("outcome_text").notNull().default(""),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [index("ws_encounters_act_idx").on(t.actId)]);

export type WsEncounter = typeof wsEncountersTable.$inferSelect;
export type InsertWsEncounter = typeof wsEncountersTable.$inferInsert;

// ── Journal Prompts ───────────────────────────────────────────────────────────

export const wsJournalPromptsTable = pgTable("ws_journal_prompts", {
  id:         text("id").primaryKey(),
  recordId:   text("record_id").notNull(),
  storyId:    text("story_id"),
  promptText: text("prompt_text").notNull(),
  hintLabel:  text("hint_label").notNull().default(""),
  sortOrder:  integer("sort_order").notNull().default(0),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ws_journal_prompts_record_idx").on(t.recordId),
  index("ws_journal_prompts_story_idx").on(t.storyId),
]);

export type WsJournalPrompt = typeof wsJournalPromptsTable.$inferSelect;
export type InsertWsJournalPrompt = typeof wsJournalPromptsTable.$inferInsert;

// ── Canon Record → Story Links ────────────────────────────────────────────────

export const wsCanonRecordStoryLinksTable = pgTable("ws_canon_record_story_links", {
  id:            text("id").primaryKey(),
  canonRecordId: text("canon_record_id").notNull(),
  storyId:       text("story_id").notNull(),
  actId:         text("act_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ws_crsl_record_idx").on(t.canonRecordId),
  index("ws_crsl_story_idx").on(t.storyId),
  uniqueIndex("ws_crsl_story_level_unique").on(t.canonRecordId, t.storyId).where(sql`${t.actId} IS NULL`),
  uniqueIndex("ws_crsl_movement_unique").on(t.canonRecordId, t.storyId, t.actId).where(sql`${t.actId} IS NOT NULL`),
]);

export type WsCanonRecordStoryLink = typeof wsCanonRecordStoryLinksTable.$inferSelect;

export const wsSuggestionRefreshesTable = pgTable("ws_suggestion_refreshes", {
  worldId: text("world_id").notNull(),
  suggestionKind: text("suggestion_kind").notNull(),
  suggestions: jsonb("suggestions").$type<unknown[]>().notNull().default([]),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.worldId, t.suggestionKind] }),
  index("ws_suggestion_refreshes_generated_idx").on(t.generatedAt),
]);
