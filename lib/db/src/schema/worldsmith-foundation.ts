import { boolean, integer, jsonb, pgTable, text, timestamp, index, primaryKey, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const audit = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

export const wsVocabulariesTable = pgTable("ws_vocabularies", {
  id: text("id").primaryKey(), key: text("key").notNull(), label: text("label").notNull(),
  description: text("description").notNull().default(""), version: integer("version").notNull().default(1),
  scope: text("scope").notNull().default("global"), worldId: text("world_id"), active: boolean("active").notNull().default(true),
  ...audit,
}, t => [index("ws_vocabularies_scope_idx").on(t.scope, t.worldId), uniqueIndex("ws_vocabularies_key_scope_unique").on(t.key, t.scope, t.worldId)]);
export const wsVocabularyOptionsTable = pgTable("ws_vocabulary_options", {
  id: text("id").primaryKey(), vocabularyId: text("vocabulary_id").notNull(), key: text("key").notNull(),
  label: text("label").notNull(), description: text("description").notNull().default(""), displayOrder: integer("display_order").notNull().default(0),
  active: boolean("active").notNull().default(true), version: integer("version").notNull().default(1), worldId: text("world_id"), ...audit,
}, t => [index("ws_vocab_options_vocab_idx").on(t.vocabularyId), index("ws_vocab_options_world_idx").on(t.worldId), uniqueIndex("ws_vocab_options_key_scope_unique").on(t.vocabularyId, t.key, t.worldId)]);
export const wsRecordVocabularyValuesTable = pgTable("ws_record_vocabulary_values", {
  recordId: text("record_id").notNull(), vocabularyId: text("vocabulary_id").notNull(), optionKey: text("option_key").notNull(),
  customValue: text("custom_value"), ...audit,
}, t => [primaryKey({ columns: [t.recordId, t.vocabularyId, t.optionKey] })]);

export const wsCanonAliasesTable = pgTable("ws_canon_record_aliases", {
  id: text("id").primaryKey(), recordId: text("record_id").notNull(), alias: text("alias").notNull(), kind: text("kind").notNull().default("alternate"), ...audit,
}, t => [index("ws_canon_aliases_record_idx").on(t.recordId)]);
export const wsCanonFactsTable = pgTable("ws_canon_facts", {
  id: text("id").primaryKey(), recordId: text("record_id").notNull(), subject: text("subject").notNull(),
  predicate: text("predicate").notNull(), value: text("value").notNull(), status: text("status").notNull().default("proposed"),
  confidence: text("confidence"), visibility: text("visibility"), sourceCitationIds: jsonb("source_citation_ids").$type<string[]>().notNull().default([]), ...audit,
}, t => [index("ws_canon_facts_record_idx").on(t.recordId)]);
export const wsSourceCitationsTable = pgTable("ws_source_citations", {
  id: text("id").primaryKey(), worldId: text("world_id").notNull(), title: text("title").notNull(), citation: text("citation").notNull(),
  sourceType: text("source_type"), url: text("url"), notes: text("notes").notNull().default(""), ...audit,
}, t => [index("ws_source_citations_world_idx").on(t.worldId)]);
export const wsEditorialFlagsTable = pgTable("ws_editorial_flags", {
  id: text("id").primaryKey(), worldId: text("world_id").notNull(), recordId: text("record_id"), severity: text("severity").notNull().default("warning"),
  code: text("code").notNull(), message: text("message").notNull(), status: text("status").notNull().default("open"), rationale: text("rationale"), ...audit,
}, t => [index("ws_editorial_flags_world_idx").on(t.worldId), index("ws_editorial_flags_record_idx").on(t.recordId)]);

// Profiles deliberately use versioned, validated JSON: this permits progressive disclosure
// while keeping each profile separate from the legacy canon record and its prose.
export const wsCharacterProfilesTable = pgTable("ws_character_profiles", { recordId: text("record_id").primaryKey(), schemaVersion: integer("schema_version").notNull().default(1), profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}), ...audit });
export const wsLocationProfilesTable = pgTable("ws_location_profiles", { recordId: text("record_id").primaryKey(), schemaVersion: integer("schema_version").notNull().default(1), profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}), ...audit });
export const wsObjectProfilesTable = pgTable("ws_object_profiles", { recordId: text("record_id").primaryKey(), schemaVersion: integer("schema_version").notNull().default(1), profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}), ...audit });
export const wsEventProfilesTable = pgTable("ws_event_profiles", { recordId: text("record_id").primaryKey(), schemaVersion: integer("schema_version").notNull().default(1), profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}), ...audit });
export const wsLoreProfilesTable = pgTable("ws_lore_profiles", { recordId: text("record_id").primaryKey(), schemaVersion: integer("schema_version").notNull().default(1), profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}), ...audit });
export const wsAtmosphereProfilesTable = pgTable("ws_atmosphere_profiles", { recordId: text("record_id").primaryKey(), schemaVersion: integer("schema_version").notNull().default(1), profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}), ...audit });
export const wsMotifProfilesTable = pgTable("ws_motif_profiles", { recordId: text("record_id").primaryKey(), schemaVersion: integer("schema_version").notNull().default(1), profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}), ...audit });
export const wsCharacterVariantsTable = pgTable("ws_character_life_stage_variants", { id: text("id").primaryKey(), recordId: text("record_id").notNull(), variantName: text("variant_name").notNull(), lifeStage: text("life_stage").notNull(), profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}), active: boolean("active").notNull().default(true), isDefault: boolean("is_default").notNull().default(false), ...audit }, t => [index("ws_character_variants_record_idx").on(t.recordId)]);
export const wsIdentityLocksTable = pgTable("ws_visual_identity_locks", { id: text("id").primaryKey(), recordId: text("record_id").notNull(), variantId: text("variant_id"), category: text("category").notNull(), value: text("value").notNull(), strength: text("strength").notNull().default("preferred"), appliesToLifeStages: jsonb("applies_to_life_stages").$type<string[]>().notNull().default([]), positivePrompt: text("positive_prompt"), negativePrompt: text("negative_prompt"), explanation: text("explanation"), ...audit }, t => [index("ws_identity_locks_record_idx").on(t.recordId)]);
export const wsKnowledgeEntriesTable = pgTable("ws_knowledge_entries", { id: text("id").primaryKey(), recordId: text("record_id").notNull(), topicRecordId: text("topic_record_id"), knowledgeState: text("knowledge_state").notNull(), confidence: text("confidence"), source: text("source"), disclosure: text("disclosure"), access: text("access"), applicableLifeStage: text("applicable_life_stage"), applicableEra: text("applicable_era"), belief: text("belief"), objectiveTruth: text("objective_truth"), consequence: text("consequence"), ...audit }, t => [index("ws_knowledge_record_idx").on(t.recordId)]);

export const wsRelationshipsTable = pgTable("ws_canon_relationships", { id: text("id").primaryKey(), worldId: text("world_id").notNull(), fromRecordId: text("from_record_id").notNull(), toRecordId: text("to_record_id").notNull(), relationshipType: jsonb("relationship_type").$type<string[]>().notNull().default([]), directionality: text("directionality"), phase: text("phase"), emotionalValence: text("emotional_valence"), trust: text("trust"), powerBalance: text("power_balance"), publicVisibility: text("public_visibility"), dependency: jsonb("dependency").$type<string[]>().notNull().default([]), primaryTension: jsonb("primary_tension").$type<string[]>().notNull().default([]), storyFunction: jsonb("story_function").$type<string[]>().notNull().default([]), details: text("details").notNull().default(""), unspokenTruth: text("unspoken_truth"), changeOverTime: text("change_over_time"), boundaries: text("boundaries"), keyScenes: text("key_scenes"), ...audit }, t => [index("ws_relationships_world_idx").on(t.worldId)]);
export const wsAssetsTable = pgTable("ws_assets", { id: text("id").primaryKey(), worldId: text("world_id").notNull(), recordId: text("record_id").notNull(), role: text("role").notNull(), variantId: text("variant_id"), title: text("title").notNull(), altText: text("alt_text").notNull().default(""), objectPath: text("object_path"), source: text("source").notNull(), sourceCredit: text("source_credit"), rightsStatus: text("rights_status"), approvalStatus: text("approval_status").notNull().default("draft"), canonicalStrength: text("canonical_strength").notNull().default("inspiration_only"), mimeType: text("mime_type"), width: integer("width"), height: integer("height"), byteSize: integer("byte_size"), checksum: text("checksum"), generationPrompt: text("generation_prompt"), generationModel: text("generation_model"), positiveGuidance: text("positive_guidance"), negativeGuidance: text("negative_guidance"), ...audit }, t => [index("ws_assets_world_idx").on(t.worldId), index("ws_assets_record_idx").on(t.recordId)]);
export const wsAssetLinksTable = pgTable("ws_asset_links", { assetId: text("asset_id").notNull(), recordId: text("record_id").notNull(), role: text("role").notNull().default("reference"), variantId: text("variant_id"), ...audit }, t => [primaryKey({ columns: [t.assetId, t.recordId] })]);

export const wsStoryBeatsTable = pgTable("ws_story_beats", { id: text("id").primaryKey(), storyId: text("story_id").notNull(), worldId: text("world_id").notNull(), sortOrder: integer("sort_order").notNull().default(0), beatType: text("beat_type").notNull(), title: text("title").notNull(), summary: text("summary").notNull().default(""), details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), status: text("status").notNull().default("draft"), ...audit }, t => [index("ws_story_beats_story_idx").on(t.storyId)]);
export const wsStorySceneDetailsTable = pgTable("ws_story_scene_details", { sceneId: text("scene_id").primaryKey(), storyId: text("story_id"), worldId: text("world_id").notNull(), purpose: text("purpose"), viewpointDistance: text("viewpoint_distance"), details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), ...audit }, t => [index("ws_scene_details_world_idx").on(t.worldId), index("ws_scene_details_story_idx").on(t.storyId)]);
export const wsRevealThreadsTable = pgTable("ws_reveal_threads", { id: text("id").primaryKey(), storyId: text("story_id").notNull(), worldId: text("world_id").notNull(), title: text("title").notNull(), truth: text("truth").notNull(), audienceKnowledge: text("audience_knowledge"), details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), ...audit }, t => [index("ws_reveal_threads_story_idx").on(t.storyId)]);
export const wsSceneAnchorsTable = pgTable("ws_scene_anchors", { id: text("id").primaryKey(), worldId: text("world_id").notNull(), name: text("name").notNull(), details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), ...audit }, t => [index("ws_scene_anchors_world_idx").on(t.worldId)]);

export const insertWsVocabularySchema = createInsertSchema(wsVocabulariesTable);
export const insertWsVocabularyOptionSchema = createInsertSchema(wsVocabularyOptionsTable);
export const profileSchema = z.object({}).catchall(z.unknown());
export const controlledValueSchema = z.object({
  key: z.string().min(1).max(80),
  custom: z.string().max(240).optional(),
}).refine(v => v.key !== "custom" || !!v.custom, { message: "custom values require custom text" });
const many = (max: number) => z.array(z.union([z.string().min(1).max(80), controlledValueSchema])).max(max);
const semantic = z.enum(["unknown", "unresolved", "not_applicable", "withheld", "custom"]);
export const globalCanonMetadataSchema = z.object({
  oneLineDefinition: z.string().max(500).optional(),
  workflowStatus: z.string().optional(), canonStability: z.string().optional(), narrativeVisibility: z.string().optional(),
  temporalScope: z.string().optional(), importance: z.string().optional(), spoilerLevel: z.string().optional(),
  evidenceConfidence: z.string().optional(), sourceType: many(20).optional(), semanticState: semantic.optional(), tags: many(30).optional(),
}).strict();
export const characterProfileSchema = z.object({
  pronouns: z.string().optional(), lifeStage: z.string().optional(), occupation: many(10).optional(),
  socialPosition: z.string().optional(), familyPosition: z.string().optional(), maritalState: z.string().optional(),
  education: many(20).optional(), financialSecurity: z.string().optional(), publicReputation: many(20).optional(),
  apparentLifeStage: z.string().optional(), height: z.string().optional(), build: many(2).optional(), faceShape: z.string().optional(),
  complexionDepth: z.string().optional(), skinUndertone: z.string().optional(), eyeColor: z.string().optional(),
  eyeCharacter: many(3).optional(), hairColor: z.string().optional(), hairTexture: z.string().optional(), hairLength: z.string().optional(),
  hairArrangement: many(20).optional(), facialHair: z.string().optional(), distinguishingFeatures: many(20).optional(),
  posture: many(3).optional(), movement: many(3).optional(), wardrobeFormality: z.string().optional(), garmentCondition: z.string().optional(),
  palette: many(20).optional(), textilePreference: many(20).optional(), pattern: many(10).optional(), accessories: many(20).optional(),
  grooming: z.string().optional(), narrativeRole: many(20).optional(), arcType: z.string().optional(), startingCondition: many(20).optional(),
  coreDesire: z.string().optional(), coreNeed: z.string().optional(), coreFear: z.string().optional(), misconception: z.string().optional(),
  resistedChange: many(20).optional(), endingCondition: many(20).optional(), speechRegister: z.string().optional(),
  sentenceRhythm: many(10).optional(), directness: z.string().optional(), emotionalOpenness: z.string().optional(),
  humor: many(10).optional(), conflictStyle: many(20).optional(), affectionStyle: many(20).optional(), vocabularyTendencies: many(20).optional(),
  performanceEnergy: z.string().optional(), audienceAlignment: z.string().optional(), moralFraming: z.string().optional(),
  portrayalCautions: many(20).optional(),
}).strict();
export const locationProfileSchema = z.object({ locationScale: z.string().optional(), primaryFunction: many(20).optional(), ownership: z.string().optional(), condition: z.string().optional(), access: z.string().optional(), populationDensity: z.string().optional(), settingCharacter: many(20).optional(), dominantMaterials: many(20).optional(), naturalLight: z.string().optional(), artificialLight: many(20).optional(), weatherExposure: z.string().optional(), seasonalBehavior: many(20).optional(), sensorySound: many(20).optional(), sensoryScent: many(20).optional(), sensoryTactile: many(20).optional(), sensoryAtmosphere: many(20).optional() }).strict();
export const objectProfileSchema = z.object({ objectClass: z.string().optional(), scale: z.string().optional(), material: many(20).optional(), condition: z.string().optional(), craftLevel: z.string().optional(), authenticity: z.string().optional(), rarity: z.string().optional(), custody: z.string().optional(), storyFunction: many(20).optional() }).strict();
export const eventProfileSchema = z.object({ eventType: many(30).optional(), temporalPrecision: z.string().optional(), eventStatus: z.string().optional(), certainty: z.string().optional(), narrativeFunction: many(20).optional(), consequenceScale: z.string().optional(), visibility: z.string().optional(), participants: many(100).optional(), witnesses: many(100).optional(), causes: many(100).optional(), immediateConsequences: many(100).optional(), longTermConsequences: many(100).optional(), evidence: many(100).optional(), affectedCanonRecords: many(100).optional() }).strict();
export const loreProfileSchema = z.object({ loreType: many(20).optional(), origin: z.string().optional(), acceptance: z.string().optional(), truthStatus: z.string().optional(), enforcement: z.string().optional(), flexibility: z.string().optional(), transmission: many(20).optional(), storyUse: many(20).optional() }).strict();
export const atmosphereProfileSchema = z.object({ emotionalRegister: many(20).optional(), intensity: z.string().optional(), sensoryEmphasis: many(20).optional(), narrativeVisibility: z.string().optional(), duration: z.string().optional() }).strict();
export const motifProfileSchema = z.object({ motifClass: many(20).optional(), function: many(20).optional(), recurrence: z.string().optional(), evolution: z.string().optional() }).strict();
export const canonProfileSchemas = { character: characterProfileSchema, location: locationProfileSchema, object: objectProfileSchema, material: objectProfileSchema, event: eventProfileSchema, lore: loreProfileSchema, atmosphere: atmosphereProfileSchema, motif: motifProfileSchema, relationship: profileSchema };
export type WsVocabulary = typeof wsVocabulariesTable.$inferSelect;
export type WsVocabularyOption = typeof wsVocabularyOptionsTable.$inferSelect;
export type WsAsset = typeof wsAssetsTable.$inferSelect;