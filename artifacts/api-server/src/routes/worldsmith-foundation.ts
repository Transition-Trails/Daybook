import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import {
  db, wsAssetsTable, wsAssetLinksTable, wsSceneAnchorsTable, wsStoryBeatsTable,
  wsRevealThreadsTable, wsVocabulariesTable, wsVocabularyOptionsTable,
  wsCanonRecordsTable, wsCanonAliasesTable, wsCanonFactsTable, wsSourceCitationsTable,
  wsEditorialFlagsTable, wsCharacterVariantsTable, wsIdentityLocksTable,
  wsKnowledgeEntriesTable, wsRelationshipsTable, wsRecordVocabularyValuesTable,
  wsStorySceneDetailsTable, wsCharacterProfilesTable, wsLocationProfilesTable,
  wsObjectProfilesTable, wsEventProfilesTable, wsLoreProfilesTable,
  wsAtmosphereProfilesTable, wsMotifProfilesTable, wsStoriesTable,
  canonProfileSchemas, worldsmithWorldsTable, mcpCanonHistoryTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth-middleware";
import { requireSuperAdmin } from "../middleware/requireRole";
import { CanonToolError, updateCharacterProfile } from "../lib/worldsmith/mcp-canon";
import { revisionFor } from "../lib/worldsmith/editorial-revision";

const router = Router();
router.use(requireAuth, requireSuperAdmin);
const id = z.string().min(1).max(160);
const world = z.object({ world_id: id });
const text = z.string().max(10000);
const strings = z.array(z.string().min(1).max(160)).max(100);
const sceneDetails = z.object({
  purpose: z.string().max(120).optional(), viewpoint_distance: z.string().max(80).optional(),
  time_of_day: z.string().max(80).optional(), weather: z.string().max(120).optional(),
  season: z.string().max(80).optional(), participants: strings.optional(),
  entrance_state: text.optional(), exit_state: text.optional(), immediate_goal: text.optional(),
  conflict_source: text.optional(), turn_decision: text.optional(), outcome: text.optional(),
  new_information: text.optional(), emotional_valence: z.string().max(80).optional(),
  emotional_intensity: z.string().max(80).optional(), sensory_anchors: strings.optional(),
  required_objects: strings.optional(), visual_composition_notes: text.optional(),
  continuity_dependencies: strings.optional(), canon_guardrails: text.optional(),
}).strict();
const anchorDetails = z.object({
  character_variant_ids: strings.optional(), location_record_id: id.nullish(), season: z.string().optional(),
  time_of_day: z.string().optional(), weather: z.string().optional(), lighting: z.string().optional(),
  wardrobe_state: text.optional(), key_objects: strings.optional(), activity_or_pose: text.optional(),
  emotional_register: strings.optional(), relationship_state: text.optional(), composition: z.string().optional(),
  camera_viewpoint: z.string().optional(), visual_medium: z.string().optional(), aspect_ratio: z.string().optional(),
  required_details: strings.optional(), prohibited_details: strings.optional(), narrative_purpose: text.optional(),
  generation_notes: text.optional(),
}).strict();
const vocab = world.extend({ key: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), label: z.string().min(1).max(160), description: text.default(""), scope: z.enum(["global", "world"]).default("world"), version: z.number().int().positive().default(1), active: z.boolean().default(true) });
const option = z.object({ vocabulary_id: id, key: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), label: z.string().min(1).max(160), description: text.default(""), display_order: z.number().int().default(0), version: z.number().int().positive().default(1), active: z.boolean().default(true), world_id: id.nullish() });
const managedVocabularyCreate = z.object({
  world_id: id,
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  label: z.string().min(1).max(160),
  description: text.default(""),
}).strict();
const managedOptionCreate = z.object({
  world_id: id,
  vocabulary_id: id,
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/),
  label: z.string().min(1).max(160),
  description: text.default(""),
}).strict();
const managedVocabularyPatch = z.object({
  world_id: id,
  expected_version: z.number().int().positive(),
  label: z.string().min(1).max(160).optional(),
  description: text.optional(),
  active: z.boolean().optional(),
}).strict().refine(({ label, description, active }) =>
  label !== undefined || description !== undefined || active !== undefined,
  { message: "Provide at least one of label, description, or active" },
);
const recordRef = world.extend({ record_id: id });
const alias = recordRef.extend({ alias: z.string().min(1).max(240), kind: z.string().max(80).default("alternate") });
const fact = recordRef.extend({ subject: z.string().min(1).max(240), predicate: z.string().min(1).max(160), value: text, status: z.string().default("proposed"), confidence: z.string().nullish(), visibility: z.string().nullish(), source_citation_ids: strings.default([]) });
const citation = world.extend({ title: z.string().min(1).max(400), citation: text, source_type: z.string().nullish(), url: z.string().url().nullish(), notes: text.default("") });
const flag = world.extend({ record_id: id.nullish(), severity: z.string().default("warning"), code: z.string().min(1).max(100), message: text, status: z.string().default("open"), rationale: text.nullish() });
const variantProfile = z.object({ story_period_label: z.string().max(240).optional(), apparent_age_range: z.string().max(120).optional(), hair_changes: text.optional(), facial_hair_changes: text.optional(), health_mobility_changes: text.optional(), wardrobe_profile: text.optional(), occupation_status: text.optional(), emotional_baseline: text.optional(), reference_asset_ids: strings.default([]), allowed_deviations: text.optional(), visual_notes: text.optional() }).strict();
const variant = recordRef.extend({ variant_name: z.string().min(1).max(240), life_stage: z.string().min(1), profile: variantProfile.default({}), active: z.boolean().default(true), is_default: z.boolean().default(false) });
const variantBoundary = z.preprocess((input) => {
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  const profileValue = (value.profile && typeof value.profile === "object" ? value.profile : value) as Record<string, unknown>;
  const aliases: Record<string, string> = { variantName: "variant_name", lifeStage: "life_stage", isDefault: "is_default", storyPeriodLabel: "story_period_label", apparentAgeRange: "apparent_age_range", ageRange: "apparent_age_range", hairChanges: "hair_changes", facialHairChanges: "facial_hair_changes", healthMobilityChanges: "health_mobility_changes", wardrobeProfile: "wardrobe_profile", occupationStatus: "occupation_status", emotionalBaseline: "emotional_baseline", referenceAssetIds: "reference_asset_ids", allowedDeviations: "allowed_deviations", deviations: "allowed_deviations", visualNotes: "visual_notes" };
  const normalized = { ...value };
  for (const [camel, snake] of Object.entries(aliases)) if (normalized[snake] === undefined && value[camel] !== undefined) normalized[snake] = value[camel];
  if (value.changes !== undefined) {
    if (typeof value.changes === "string") normalized.hair_changes ??= value.changes;
    else if (value.changes && typeof value.changes === "object") {
      const changes = value.changes as Record<string, unknown>;
      if (normalized.hair_changes === undefined && changes.hair !== undefined) normalized.hair_changes = changes.hair;
      if (normalized.facial_hair_changes === undefined && changes.facialHair !== undefined) normalized.facial_hair_changes = changes.facialHair;
      if (normalized.health_mobility_changes === undefined && changes.healthMobility !== undefined) normalized.health_mobility_changes = changes.healthMobility;
    }
  }
  const normalizedProfile: Record<string, unknown> = {};
  for (const [camel, snake] of Object.entries(aliases)) {
    if (snake === "variant_name" || snake === "life_stage" || snake === "is_default") continue;
    const candidate = profileValue[snake] ?? profileValue[camel];
    if (candidate !== undefined) normalizedProfile[snake] = candidate;
  }
  if (profileValue.changes !== undefined) {
    const changes = profileValue.changes;
    if (typeof changes === "string") normalizedProfile.hair_changes ??= changes;
    else if (changes && typeof changes === "object") {
      const changeSet = changes as Record<string, unknown>;
      if (changeSet.hair !== undefined) normalizedProfile.hair_changes ??= changeSet.hair;
      if (changeSet.facialHair !== undefined) normalizedProfile.facial_hair_changes ??= changeSet.facialHair;
      if (changeSet.healthMobility !== undefined) normalizedProfile.health_mobility_changes ??= changeSet.healthMobility;
    }
  }
  normalized.profile = normalizedProfile;
  return normalized;
}, variant.omit({ world_id: true, record_id: true }));
const lock = recordRef.extend({ variant_id: id.nullish(), category: z.string().min(1), value: text, strength: z.string().default("preferred"), applies_to_life_stages: strings.default([]), positive_prompt: text.nullish(), negative_prompt: text.nullish(), explanation: text.nullish() });
const knowledge = recordRef.extend({ topic_record_id: id.nullish(), knowledge_state: z.string().min(1), confidence: z.string().nullish(), source: z.string().nullish(), disclosure: z.string().nullish(), access: z.string().nullish(), applicable_life_stage: z.string().nullish(), applicable_era: z.string().nullish(), belief: text.nullish(), objective_truth: text.nullish(), consequence: text.nullish() });
const relationship = world.extend({ from_record_id: id, to_record_id: id, relationship_type: strings.default([]), directionality: z.string().nullish(), phase: z.string().nullish(), emotional_valence: z.string().nullish(), trust: z.string().nullish(), power_balance: z.string().nullish(), public_visibility: z.string().nullish(), dependency: strings.default([]), primary_tension: strings.default([]), story_function: strings.default([]), details: text.default(""), unspoken_truth: text.nullish(), change_over_time: text.nullish(), boundaries: text.nullish(), key_scenes: text.nullish() });
const asset = recordRef.extend({ role: z.string().min(1), variant_id: id.nullish(), title: z.string().min(1).max(240), alt_text: text.default(""), object_path: text.nullish(), source: z.string().min(1), source_credit: text.nullish(), rights_status: text.nullish(), approval_status: z.string().default("draft"), canonical_strength: z.string().default("inspiration_only"), mime_type: z.string().nullish(), width: z.number().int().positive().nullish(), height: z.number().int().positive().nullish(), byte_size: z.number().int().nonnegative().nullish(), checksum: z.string().nullish(), generation_prompt: text.nullish(), generation_model: z.string().nullish(), positive_guidance: text.nullish(), negative_guidance: text.nullish() });
const storyRow = world.extend({ story_id: id });
const beat = storyRow.extend({ beat_type: z.string().min(1), title: z.string().min(1).max(240), summary: text.default(""), sort_order: z.number().int().default(0), details: z.object({ point_of_view_character_id: id.nullish(), location_record_id: id.nullish(), involved_character_ids: strings.default([]), affected_record_ids: strings.default([]), character_goal: text.optional(), obstacle: text.optional(), choice: text.optional(), outcome: text.optional(), cost: text.optional(), knowledge_change: text.optional(), relationship_change: text.optional(), emotional_movement: text.optional(), setup_payoff_links: strings.default([]), spoiler_level: z.string().optional() }).strict().default({}), status: z.string().default("draft") });
const reveal = storyRow.extend({ title: z.string().min(1), truth: text, audience_knowledge: z.string().nullish(), details: z.object({ who_knows_record_ids: strings.default([]), false_belief_record_ids: strings.default([]), first_clue: text.optional(), reinforcing_clues: strings.default([]), red_herrings: strings.default([]), partial_reveal: text.optional(), full_reveal: text.optional(), recontextualization: text.optional(), consequences: text.optional(), linked_scene_ids: strings.default([]), linked_record_ids: strings.default([]) }).strict().default({}) });
const anchor = world.extend({ name: z.string().min(1).max(240), details: anchorDetails.default({}) });
const scene = world.extend({ scene_id: id, story_id: id.nullish(), purpose: z.string().nullish(), viewpoint_distance: z.string().nullish(), details: sceneDetails.default({}) });
const sceneItem = scene.omit({ world_id: true });
const sceneBoundary = z.preprocess((input) => {
  if (!input || typeof input !== "object") return input;
  const value = input as Record<string, unknown>;
  const detailInput = (value.details && typeof value.details === "object" ? value.details : {}) as Record<string, unknown>;
  const aliases: Record<string, string> = { sceneId: "scene_id", storyId: "story_id", viewpointDistance: "viewpoint_distance" };
  const detailsAliases: Record<string, string> = { timeOfDay: "time_of_day", sensoryAnchors: "sensory_anchors", requiredObjects: "required_objects", visualCompositionNotes: "visual_composition_notes", continuityDependencies: "continuity_dependencies", canonGuardrails: "canon_guardrails", entranceState: "entrance_state", exitState: "exit_state", immediateGoal: "immediate_goal", conflictSource: "conflict_source", turnDecision: "turn_decision", newInformation: "new_information", emotionalValence: "emotional_valence", emotionalIntensity: "emotional_intensity" };
  const normalized: Record<string, unknown> = {};
  for (const key of ["world_id", "scene_id", "story_id", "purpose", "viewpoint_distance", "details"]) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "") normalized[key] = value[key];
  }
  for (const [camel, snake] of Object.entries(aliases)) if (normalized[snake] === undefined && value[camel] !== undefined) normalized[snake] = value[camel];
  const listFields = new Set(["participants", "sensory_anchors", "required_objects", "continuity_dependencies"]);
  const acceptedDetails = new Set(["purpose", "viewpoint_distance", "time_of_day", "weather", "season", "participants", "entrance_state", "exit_state", "immediate_goal", "conflict_source", "turn_decision", "outcome", "new_information", "emotional_valence", "emotional_intensity", "sensory_anchors", "required_objects", "visual_composition_notes", "continuity_dependencies", "canon_guardrails"]);
  const detailsNormalized: Record<string, unknown> = {};
  for (const [camel, snake] of Object.entries(detailsAliases)) if (detailsNormalized[snake] === undefined && detailInput[camel] !== undefined) detailsNormalized[snake] = detailInput[camel];
  for (const key of acceptedDetails) {
    let item = detailsNormalized[key] ?? detailInput[key];
    if (item === null || item === "") continue;
    if (listFields.has(key) && typeof item === "string") item = item.split(",").map((part) => part.trim()).filter(Boolean);
    if (item !== undefined) detailsNormalized[key] = item;
  }
  normalized.details = detailsNormalized;
  return normalized;
}, sceneItem);
const link = world.extend({ asset_id: id, record_id: id, role: z.string().default("reference"), variant_id: id.nullish() });

async function ownsRecord(recordId: string, worldId: string) {
  const [r] = await db.select({ id: wsCanonRecordsTable.id }).from(wsCanonRecordsTable).where(and(eq(wsCanonRecordsTable.id, recordId), eq(wsCanonRecordsTable.worldId, worldId))).limit(1);
  return !!r;
}
async function ownsStory(storyId: string, worldId: string) {
  const [s] = await db.select({ id: wsStoriesTable.id }).from(wsStoriesTable).where(and(eq(wsStoriesTable.id, storyId), eq(wsStoriesTable.worldId, worldId))).limit(1);
  return !!s;
}
async function ownsAsset(assetId: string, worldId: string) {
  const [asset] = await db.select({ id: wsAssetsTable.id }).from(wsAssetsTable)
    .where(and(eq(wsAssetsTable.id, assetId), eq(wsAssetsTable.worldId, worldId))).limit(1);
  return !!asset;
}
async function ownsVariant(variantId: string, recordId: string) {
  const [variantRow] = await db.select({ id: wsCharacterVariantsTable.id })
    .from(wsCharacterVariantsTable)
    .where(and(eq(wsCharacterVariantsTable.id, variantId), eq(wsCharacterVariantsTable.recordId, recordId)))
    .limit(1);
  return !!variantRow;
}
async function ownsLinkReferences(assetId: string, recordId: string, worldId: string) {
  return (await ownsAsset(assetId, worldId)) && (await ownsRecord(recordId, worldId));
}
function bad(res: Response, parsed: z.SafeParseError<unknown>): Response {
  return res.status(400).json({ error: parsed.error.message });
}

function mapFields(data: Record<string, unknown>, table: any): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  if ("id" in table) output.id = data.id || randomUUID();
  for (const [key, value] of Object.entries(data)) {
    const column = key === "world_id" ? "worldId" : key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (column in table) output[column] = value;
  }
  return output;
}

function crud(path: string, table: any, schema: z.ZodTypeAny, key: string, owner = "worldId", idField = "id"): void {
  router.get(path, async (req: Request, res: Response): Promise<void> => {
    const worldId = String(req.query.world_id || "");
    if (!worldId) { res.status(400).json({ error: "world_id is required" }); return; }
    let rows: any[];
    if (owner === "recordId") {
      const records = await db.select({ id: wsCanonRecordsTable.id }).from(wsCanonRecordsTable)
        .where(eq(wsCanonRecordsTable.worldId, worldId));
      rows = records.length
        ? await db.select().from(table).where(inArray(table.recordId, records.map((record) => record.id)))
            .orderBy(desc(table.updatedAt))
        : [];
    } else {
      rows = await db.select().from(table).where(eq(table[owner], worldId)).orderBy(desc(table.updatedAt));
    }
    res.json({ [key]: rows });
  });

  router.get(`${path}/:id`, async (req: Request, res: Response): Promise<void> => {
    const worldId = String(req.query.world_id || "");
    if (!worldId) { res.status(400).json({ error: "world_id is required" }); return; }
    const [row] = await db.select().from(table).where(eq(table[idField], String(req.params.id))).limit(1);
    const owned = row && (owner === "recordId"
      ? await ownsRecord(row.recordId, worldId)
      : row[owner] === worldId);
    if (!owned) { res.status(404).json({ error: "Resource not found in world" }); return; }
    res.json({ [key.slice(0, -1)]: row });
  });

  router.post(path, async (req: Request, res: Response): Promise<void> => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { bad(res, parsed); return; }
    const data = parsed.data as Record<string, any>;
    if (data.record_id && !(await ownsRecord(data.record_id, data.world_id))) {
      res.status(422).json({ error: "record_id must belong to world_id" }); return;
    }
    if (data.story_id && !(await ownsStory(data.story_id, data.world_id))) {
      res.status(422).json({ error: "story_id must belong to world_id" }); return;
    }
    if (data.from_record_id && (!(await ownsRecord(data.from_record_id, data.world_id)) ||
      !(await ownsRecord(data.to_record_id, data.world_id)))) {
      res.status(422).json({ error: "relationship records must belong to world_id" }); return;
    }
    if (data.asset_id && !(await ownsLinkReferences(data.asset_id, data.record_id, data.world_id))) {
      res.status(422).json({ error: "asset and record must belong to world_id" }); return;
    }
    if (data.variant_id && !(await ownsVariant(data.variant_id, data.record_id))) {
      res.status(422).json({ error: "variant_id must belong to record_id" }); return;
    }
    if (data.topic_record_id && !(await ownsRecord(data.topic_record_id, data.world_id))) {
      res.status(422).json({ error: "topic_record_id must belong to world_id" }); return;
    }
    try {
      const result = await db.insert(table).values(mapFields(data, table)).returning() as any[];
      res.status(201).json({ [key.slice(0, -1)]: result[0] });
    } catch {
      res.status(409).json({ error: "Resource already exists" });
    }
  });

  router.patch(`${path}/:id`, async (req: Request, res: Response): Promise<void> => {
    const parsed = (schema as z.AnyZodObject).partial().safeParse(req.body);
    if (!parsed.success) { bad(res, parsed); return; }
    const worldId = String((parsed.data as any).world_id || req.query.world_id || "");
    const [existing] = await db.select().from(table).where(eq(table[idField], String(req.params.id))).limit(1);
    const owned = existing && (owner === "recordId"
      ? await ownsRecord(existing.recordId, worldId)
      : existing[owner] === worldId);
    if (!owned) { res.status(404).json({ error: "Resource not found in world" }); return; }
    const data = parsed.data as Record<string, any>;
    if (data.from_record_id && (!(await ownsRecord(data.from_record_id, worldId)) ||
      !(await ownsRecord(data.to_record_id, worldId)))) {
      res.status(422).json({ error: "relationship records must belong to world_id" }); return;
    }
    if (data.asset_id && !(await ownsLinkReferences(data.asset_id, data.record_id, worldId))) {
      res.status(422).json({ error: "asset and record must belong to world_id" }); return;
    }
    if (data.variant_id && existing.recordId && !(await ownsVariant(data.variant_id, existing.recordId))) {
      res.status(422).json({ error: "variant_id must belong to record_id" }); return;
    }
    if (data.topic_record_id && !(await ownsRecord(data.topic_record_id, worldId))) {
      res.status(422).json({ error: "topic_record_id must belong to world_id" }); return;
    }
    if (data.story_id && !(await ownsStory(data.story_id, worldId))) {
      res.status(422).json({ error: "story_id must belong to world_id" }); return;
    }
    const [row] = await db.update(table)
      .set({ ...mapFields(parsed.data as Record<string, unknown>, table), updatedAt: new Date() })
      .where(eq(table[idField], existing[idField])).returning();
    res.json({ [key.slice(0, -1)]: row });
  });

  router.delete(`${path}/:id`, async (req: Request, res: Response): Promise<void> => {
    const worldId = String(req.query.world_id || "");
    if (!worldId) { res.status(400).json({ error: "world_id is required" }); return; }
    const [existing] = await db.select().from(table).where(eq(table[idField], String(req.params.id))).limit(1);
    const owned = existing && (owner === "recordId"
      ? await ownsRecord(existing.recordId, worldId)
      : existing[owner] === worldId);
    if (!owned) { res.status(404).json({ error: "Resource not found in world" }); return; }
    const result = await db.delete(table).where(eq(table[idField], existing[idField])).returning() as any[];
    const row = result[0];
    if (!row) { res.status(404).json({ error: "Resource not found in world" }); return; }
    res.sendStatus(204);
  });
}

async function replaceRows(
  table: any,
  ownerColumn: string,
  ownerId: string,
  rows: Record<string, any>[],
  worldId: string,
  res: Response,
  key: string,
  expectedVersion?: number,
): Promise<void> {
  try {
    const result = await db.transaction(async (tx) => {
      let version: number | undefined;
      if (expectedVersion !== undefined) {
        const [updated] = await tx.update(wsCanonRecordsTable)
          .set({ version: sql`${wsCanonRecordsTable.version} + 1`, updatedAt: new Date() })
          .where(and(
            eq(wsCanonRecordsTable.id, ownerId),
            eq(wsCanonRecordsTable.worldId, worldId),
            eq(wsCanonRecordsTable.version, expectedVersion),
          )).returning({ version: wsCanonRecordsTable.version });
        if (!updated) throw new CollectionVersionConflict();
        version = updated.version;
      }
      await tx.delete(table).where(eq(table[ownerColumn], ownerId));
      const values = rows.map((row, index) => ({
        ...mapFields({ ...row, id: row.id || randomUUID() }, table),
        ...(table.sortOrder ? { sortOrder: row.sort_order ?? index } : {}),
        ...(table.worldId ? { worldId } : {}),
        ...(table.recordId ? { recordId: ownerId } : {}),
        ...(table.storyId ? { storyId: ownerId } : {}),
      }));
      const inserted = values.length ? await tx.insert(table).values(values as any).returning() as any[] : [];
      return { rows: inserted, version };
    });
    res.json({ [key]: result.rows, ...(result.version === undefined ? {} : { version: result.version }) });
  } catch (error) {
    if (error instanceof CollectionVersionConflict) {
      res.status(409).json({ error: "Version conflict: the Canon record changed while metadata was being saved", code: "VERSION_CONFLICT" });
      return;
    }
    res.status(409).json({ error: "Unable to replace repeater rows" });
  }
}

class CollectionVersionConflict extends Error {}
const vocabularyManagementPath = "/v1/editorial/vocabulary-management";

async function worldExists(worldId: string): Promise<boolean> {
  const [row] = await db.select({ id: worldsmithWorldsTable.id })
    .from(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, worldId))
    .limit(1);
  return !!row;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

router.post(`${vocabularyManagementPath}/vocabularies`, async (req: Request, res: Response): Promise<void> => {
  const parsed = sceneBatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const { world_id, key, label, description } = parsed.data;
  if (!(await worldExists(world_id))) {
    res.status(404).json({ error: `World '${world_id}' does not exist`, code: "WORLD_NOT_FOUND" });
    return;
  }
  try {
  const [vocabulary] = await db.select().from(wsVocabulariesTable)
    .where(eq(wsVocabulariesTable.id, vocabulary_id)).limit(1);
    res.status(201).json({ vocabulary });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    res.status(409).json({ error: `Vocabulary key '${key}' already exists in world '${world_id}'`, code: "DUPLICATE_KEY" });
  }
});

router.post(`${vocabularyManagementPath}/options`, async (req: Request, res: Response): Promise<void> => {
  const parsed = sceneBatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const { world_id, vocabulary_id, key, label, description } = parsed.data;
  if (!(await worldExists(world_id))) {
    res.status(404).json({ error: `World '${world_id}' does not exist`, code: "WORLD_NOT_FOUND" });
    return;
  }
  const [vocabulary] = await db.select().from(wsVocabulariesTable)
    .where(eq(wsVocabulariesTable.id, vocabulary_id)).limit(1);
  if (!vocabulary) {
    res.status(404).json({ error: `Vocabulary '${vocabulary_id}' was not found`, code: "VOCABULARY_NOT_FOUND" });
    return;
  }
  if (vocabulary.scope !== "world") {
    res.status(409).json({
      error: "Options cannot be added to a global vocabulary through world-scoped vocabulary management",
      code: "IMMUTABLE_SCOPE",
    });
    return;
  }
  if (vocabulary.worldId !== world_id) {
    res.status(404).json({
      error: "Options can only be added to a world-scoped vocabulary in the requested world",
      code: "VOCABULARY_SCOPE_MISMATCH",
    });
    return;
  }
  try {
    const [optionRow] = await db.insert(wsVocabularyOptionsTable).values({
      id: randomUUID(), vocabularyId: vocabulary_id, worldId: world_id,
      key, label, description, displayOrder: 0, active: true, version: 1,
    }).returning();
    res.status(201).json({ option: optionRow });
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    res.status(409).json({
      error: `Option key '${key}' already exists for vocabulary '${vocabulary_id}' in world '${world_id}'`,
      code: "DUPLICATE_KEY",
    });
  }
});

async function patchManagedVocabulary(
  req: Request,
  res: Response,
  kind: "vocabulary" | "option",
): Promise<void> {
  const parsed = managedVocabularyPatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const { world_id, expected_version, ...changes } = parsed.data;
  const resourceId = String(req.params.id);

  if (!(await worldExists(world_id))) {
    res.status(404).json({ error: `World '${world_id}' does not exist`, code: "WORLD_NOT_FOUND" });
    return;
  }

  if (kind === "vocabulary") {
    const [existing] = await db.select().from(wsVocabulariesTable)
      .where(eq(wsVocabulariesTable.id, resourceId)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Vocabulary was not found", code: "NOT_FOUND" });
      return;
    }
    if (existing.scope !== "world" || existing.worldId == null) {
      res.status(409).json({
        error: "Global vocabularies cannot be edited through world-scoped vocabulary management",
        code: "IMMUTABLE_SCOPE",
      });
      return;
    }
    if (existing.worldId !== world_id) {
      res.status(404).json({ error: "Vocabulary was not found in the requested world", code: "NOT_FOUND" });
      return;
    }
    if (existing.version !== expected_version) {
      res.status(409).json({
        error: `Version conflict: expected version ${expected_version}, current version is ${existing.version}`,
        code: "VERSION_CONFLICT",
        current_version: existing.version,
      });
      return;
    }
    const [vocabulary] = await db.update(wsVocabulariesTable)
      .set({ ...changes, version: expected_version + 1, updatedAt: new Date() })
      .where(and(
        eq(wsVocabulariesTable.id, resourceId),
        eq(wsVocabulariesTable.worldId, world_id),
        eq(wsVocabulariesTable.scope, "world"),
        eq(wsVocabulariesTable.version, expected_version),
      )).returning();
    if (!vocabulary) {
      res.status(409).json({
        error: "Version conflict: the vocabulary changed while this update was being saved",
        code: "VERSION_CONFLICT",
      });
      return;
    }
    res.json({ vocabulary });
    return;
  }

  const [existing] = await db.select().from(wsVocabularyOptionsTable)
    .where(eq(wsVocabularyOptionsTable.id, resourceId)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Vocabulary option was not found", code: "NOT_FOUND" });
    return;
  }
  if (existing.worldId == null) {
    res.status(409).json({
      error: "Global vocabulary options cannot be edited through world-scoped vocabulary management",
      code: "IMMUTABLE_SCOPE",
    });
    return;
  }
  if (existing.worldId !== world_id) {
    res.status(404).json({ error: "Vocabulary option was not found in the requested world", code: "NOT_FOUND" });
    return;
  }
  const [parentVocabulary] = await db.select().from(wsVocabulariesTable)
    .where(eq(wsVocabulariesTable.id, existing.vocabularyId)).limit(1);
  if (!parentVocabulary || parentVocabulary.scope !== "world" || parentVocabulary.worldId !== world_id) {
    res.status(409).json({
      error: "Vocabulary options can only be managed under a world-scoped vocabulary in the same world",
      code: "VOCABULARY_SCOPE_MISMATCH",
    });
    return;
  }
  if (existing.version !== expected_version) {
    res.status(409).json({
      error: `Version conflict: expected version ${expected_version}, current version is ${existing.version}`,
      code: "VERSION_CONFLICT",
      current_version: existing.version,
    });
    return;
  }
  const [optionRow] = await db.update(wsVocabularyOptionsTable)
    .set({ ...changes, version: expected_version + 1, updatedAt: new Date() })
    .where(and(
      eq(wsVocabularyOptionsTable.id, resourceId),
      eq(wsVocabularyOptionsTable.worldId, world_id),
      eq(wsVocabularyOptionsTable.version, expected_version),
    )).returning();
  if (!optionRow) {
    res.status(409).json({
      error: "Version conflict: the vocabulary option changed while this update was being saved",
      code: "VERSION_CONFLICT",
    });
    return;
  }
  res.json({ option: optionRow });
}

router.patch(`${vocabularyManagementPath}/vocabularies/:id`, async (req: Request, res: Response): Promise<void> => {
  await patchManagedVocabulary(req, res, "vocabulary");
});
router.patch(`${vocabularyManagementPath}/options/:id`, async (req: Request, res: Response): Promise<void> => {
  await patchManagedVocabulary(req, res, "option");
});

router.get("/v1/editorial/vocabularies", async (req, res) => { const w = typeof req.query.world_id === "string" ? req.query.world_id : ""; const vocabularies = await db.select().from(wsVocabulariesTable).where(w ? or(eq(wsVocabulariesTable.scope, "global"), eq(wsVocabulariesTable.worldId, w)) : eq(wsVocabulariesTable.scope, "global")).orderBy(wsVocabulariesTable.key); const options = await db.select().from(wsVocabularyOptionsTable).where(w ? or(isNull(wsVocabularyOptionsTable.worldId), eq(wsVocabularyOptionsTable.worldId, w)) : isNull(wsVocabularyOptionsTable.worldId)).orderBy(wsVocabularyOptionsTable.displayOrder); res.json({ vocabularies, options }); });
router.get("/v1/editorial/vocabularies", async (req, res) => { const w = typeof req.query.world_id === "string" ? req.query.world_id : ""; const vocabularies = await db.select().from(wsVocabulariesTable).where(w ? or(eq(wsVocabulariesTable.scope, "global"), eq(wsVocabulariesTable.worldId, w)) : eq(wsVocabulariesTable.scope, "global")).orderBy(wsVocabulariesTable.key); const options = await db.select().from(wsVocabularyOptionsTable).where(w ? or(isNull(wsVocabularyOptionsTable.worldId), eq(wsVocabularyOptionsTable.worldId, w)) : isNull(wsVocabularyOptionsTable.worldId)).orderBy(wsVocabularyOptionsTable.displayOrder); res.json({ vocabularies, options }); });
router.get("/v1/editorial/vocabularies", async (req, res) => { const w = typeof req.query.world_id === "string" ? req.query.world_id : ""; const vocabularies = await db.select().from(wsVocabulariesTable).where(w ? or(eq(wsVocabulariesTable.scope, "global"), eq(wsVocabulariesTable.worldId, w)) : eq(wsVocabulariesTable.scope, "global")).orderBy(wsVocabulariesTable.key); const options = await db.select().from(wsVocabularyOptionsTable).where(w ? or(isNull(wsVocabularyOptionsTable.worldId), eq(wsVocabularyOptionsTable.worldId, w)) : isNull(wsVocabularyOptionsTable.worldId)).orderBy(wsVocabularyOptionsTable.displayOrder); res.json({ vocabularies, options }); });
router.post("/v1/editorial/vocabulary-options", async (req: Request, res: Response): Promise<void> => { const p = option.safeParse(req.body); if (!p.success) { bad(res, p); return; } try { const result = await db.insert(wsVocabularyOptionsTable).values(mapFields(p.data, wsVocabularyOptionsTable) as any).returning() as any[]; res.status(201).json({ option: result[0] }); } catch { res.status(409).json({ error: "Vocabulary option already exists" }); } });
        const result = await updateCharacterProfile(
          String((req.user as { id?: string } | undefined)?.id ?? ""),
          String(req.params.recordId),
          parsed.data,
          expectedVersion?.data,
          schemaVersion.data,
          true,
          requestId?.data,
        );
router.post("/v1/editorial/vocabulary-options", async (req: Request, res: Response): Promise<void> => { const p = option.safeParse(req.body); if (!p.success) { bad(res, p); return; } try { const result = await db.insert(wsVocabularyOptionsTable).values(mapFields(p.data, wsVocabularyOptionsTable) as any).returning() as any[]; res.status(201).json({ option: result[0] }); } catch { res.status(409).json({ error: "Vocabulary option already exists" }); } });
        const result = await updateCharacterProfile(
          String((req.user as { id?: string } | undefined)?.id ?? ""),
          String(req.params.recordId),
          parsed.data,
          expectedVersion?.data,
          schemaVersion.data,
          true,
          requestId?.data,
        );
crud("/v1/editorial/vocabularies", wsVocabulariesTable, vocab, "vocabularies");
crud("/v1/editorial/vocabulary-options", wsVocabularyOptionsTable, option, "options", "worldId");

crud("/v1/editorial/aliases", wsCanonAliasesTable, alias, "aliases", "recordId");
crud("/v1/editorial/facts", wsCanonFactsTable, fact, "facts", "recordId");
crud("/v1/editorial/citations", wsSourceCitationsTable, citation, "citations");
crud("/v1/editorial/flags", wsEditorialFlagsTable, flag, "flags");
crud("/v1/editorial/relationships", wsRelationshipsTable, relationship, "relationships");
crud("/v1/editorial/assets", wsAssetsTable, asset, "assets");
crud("/v1/editorial/scene-anchors", wsSceneAnchorsTable, anchor, "anchors");
crud("/v1/editorial/reveals", wsRevealThreadsTable, reveal, "reveals");
crud("/v1/editorial/story-beats", wsStoryBeatsTable, beat, "beats");
crud("/v1/editorial/scene-details", wsStorySceneDetailsTable, scene, "scenes", "worldId", "sceneId");

router.get("/v1/editorial/stories/:storyId/beats", async (req: Request, res: Response): Promise<void> => {
    const worldId = typeof req.body.world_id === "string" ? req.body.world_id : "";
  if (!(await ownsStory(String(req.params.storyId), worldId))) { res.status(404).json({ error: "Story not found in world" }); return; }
  const beats = await db.select().from(wsStoryBeatsTable)
    .where(and(eq(wsStoryBeatsTable.storyId, String(req.params.storyId)), eq(wsStoryBeatsTable.worldId, worldId)))
    .orderBy(wsStoryBeatsTable.sortOrder);
  res.json({ beats: beats.map(row => ({ ...row, revision: revisionFor(row) })) });
});
router.get("/v1/editorial/stories/:storyId/reveals", async (req: Request, res: Response): Promise<void> => {
    const worldId = typeof req.body.world_id === "string" ? req.body.world_id : "";
  if (!(await ownsStory(String(req.params.storyId), worldId))) { res.status(404).json({ error: "Story not found in world" }); return; }
  const reveals = await db.select().from(wsRevealThreadsTable)
    .where(and(eq(wsRevealThreadsTable.storyId, String(req.params.storyId)), eq(wsRevealThreadsTable.worldId, worldId)));
  res.json({ reveals: reveals.map(row => ({ ...row, revision: revisionFor(row) })) });
});

for (const [name, table] of [["character", wsCharacterProfilesTable], ["location", wsLocationProfilesTable], ["object", wsObjectProfilesTable], ["material", wsObjectProfilesTable], ["event", wsEventProfilesTable], ["lore", wsLoreProfilesTable], ["atmosphere", wsAtmosphereProfilesTable], ["motif", wsMotifProfilesTable]] as const) {
  const schema = canonProfileSchemas[name === "material" ? "object" : name];
  router.get(`/v1/editorial/profiles/${name}/:recordId`, async (req: Request, res: Response): Promise<void> => {
    const worldId = typeof req.body.world_id === "string" ? req.body.world_id : "";
    if (!(await ownsRecord(String(req.params.recordId), worldId))) {
      res.status(404).json({ error: "Record not found in world" }); return;
    }
    const [row] = await db.insert(table).values({ recordId: String(req.params.recordId), schemaVersion: schemaVersion.data, profile: parsed.data })
      .onConflictDoUpdate({ target: table.recordId, set: { schemaVersion: schemaVersion.data, profile: parsed.data, updatedAt: new Date() } }).returning();

const versionedCollection = world.extend({ expected_version: z.number().int().positive() });
    res.json({ profile: row || null });
  });
  router.put(`/v1/editorial/profiles/${name}/:recordId`, async (req: Request, res: Response): Promise<void> => {
    const worldId = typeof req.body.world_id === "string" ? req.body.world_id : "";
    const schemaVersion = z.number().int().positive().default(1).safeParse(req.body.schema_version);
    const expectedVersion = req.body.expected_version === undefined
      ? undefined
      : z.number().int().positive().safeParse(req.body.expected_version);
    if (expectedVersion && !expectedVersion.success) {
      res.status(400).json({ error: "expected_version must be a positive integer", code: "INVALID_VERSION" });
      return;
    }
    const requestId = req.body.request_id === undefined ? undefined : z.string().uuid().safeParse(req.body.request_id);
    if (requestId && (!requestId.success || name !== "character" || !expectedVersion?.success)) {
      res.status(400).json({ error: "request_id requires a Character profile and expected_version", code: "INVALID_REQUEST_ID" });
      return;
    }
  const parsed = sceneBatch.safeParse(req.body);
    if (!worldId || !schemaVersion.success || !parsed.success) {
      res.status(400).json({ error: "world_id, schema_version, and a valid typed profile are required" }); return;
    }
    const [record] = await db.select({ canonType: wsCanonRecordsTable.canonType }).from(wsCanonRecordsTable)
      .where(and(eq(wsCanonRecordsTable.id, String(req.params.recordId)), eq(wsCanonRecordsTable.worldId, worldId))).limit(1);
    if (!record) { res.status(422).json({ error: "record_id must belong to world_id" }); return; }
    if (record.canonType !== name && !(name === "material" && record.canonType === "object")) {
      res.status(422).json({ error: `profile type ${name} does not match canon type` }); return;
    }
    if (name === "character") {
      try {
        const result = await updateCharacterProfile(
          String((req.user as { id?: string } | undefined)?.id ?? ""),
          String(req.params.recordId),
          parsed.data,
          expectedVersion?.data,
          schemaVersion.data,
          true,
          requestId?.data,
        );
        res.json({
          profile: { recordId: String(req.params.recordId), schemaVersion: schemaVersion.data, profile: result.profile },
          schemaVersion: schemaVersion.data,
          version: result.version,
        });
      } catch (error) {
        if (error instanceof CanonToolError) {
          // A response can be lost after the transaction commits. Only acknowledge
          // the exact write identified by this request, at its resulting version.
          if (error.code === "VERSION_CONFLICT" && requestId?.success && expectedVersion?.success) {
            const reconciled = await db.transaction(async tx => {
              const [current] = await tx.select({ version: wsCanonRecordsTable.version }).from(wsCanonRecordsTable)
                .where(and(eq(wsCanonRecordsTable.id, String(req.params.recordId)), eq(wsCanonRecordsTable.worldId, worldId)))
                .for("update").limit(1);
              if (current?.version !== expectedVersion.data + 1) return null;
              const [history] = await tx.select().from(mcpCanonHistoryTable)
                .where(eq(mcpCanonHistoryTable.id, requestId.data)).limit(1);
              const [profile] = await tx.select().from(wsCharacterProfilesTable)
                .where(eq(wsCharacterProfilesTable.recordId, String(req.params.recordId))).limit(1);
              if (history?.recordId !== String(req.params.recordId)
                || history.actorUserId !== String((req.user as { id?: string } | undefined)?.id ?? "")
                || history.changeType !== "character_profile"
                || profile?.schemaVersion !== schemaVersion.data
                || !isDeepStrictEqual(history.after, profile.profile)
                || !isDeepStrictEqual(history.after, parsed.data)) return null;
              return { version: current.version, profile: profile.profile };
            });
            if (reconciled) {
              res.json({
                profile: { recordId: String(req.params.recordId), schemaVersion: schemaVersion.data, profile: reconciled.profile },
                schemaVersion: schemaVersion.data, version: reconciled.version, reconciled: true,
              });
              return;
            }
          }
          res.status(error.status).json({ error: error.message, code: error.code });
          return;
        }
        throw error;
      }
      return;
    }
    const [row] = await db.insert(table).values({ recordId: String(req.params.recordId), schemaVersion: schemaVersion.data, profile: parsed.data })
      .onConflictDoUpdate({ target: table.recordId, set: { schemaVersion: schemaVersion.data, profile: parsed.data, updatedAt: new Date() } }).returning();

const versionedCollection = world.extend({ expected_version: z.number().int().positive() });
const variantBatch = versionedCollection.extend({ variants: z.array(variantBoundary).max(200) });
const lockBatch = versionedCollection.extend({ locks: z.array(lock.omit({ world_id: true, record_id: true })).max(200) });
const knowledgeBatch = versionedCollection.extend({ knowledge: z.array(knowledge.omit({ world_id: true, record_id: true })).max(200) });
const beatBatch = world.extend({ beats: z.array(beat.omit({ world_id: true, story_id: true })).max(500) });
const revealBatch = world.extend({ reveals: z.array(reveal.omit({ world_id: true, story_id: true })).max(200) });
const sceneBatch = world.extend({ scenes: z.array(sceneBoundary).max(500) });

router.put("/v1/editorial/canon-records/:id/variants", async (req: Request, res: Response): Promise<void> => {
  const parsed = sceneBatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const recordId = String(req.params.id);
  if (!(await ownsRecord(recordId, parsed.data.world_id))) { res.status(422).json({ error: "record_id must belong to world_id" }); return; }
  await replaceRows(wsKnowledgeEntriesTable, "recordId", recordId, parsed.data.knowledge, parsed.data.world_id, res, "knowledge", parsed.data.expected_version);
});
router.put("/v1/editorial/stories/:id/beats", async (req: Request, res: Response): Promise<void> => {
  const parsed = sceneBatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const recordId = String(req.params.id);
  if (!(await ownsRecord(recordId, parsed.data.world_id))) { res.status(422).json({ error: "record_id must belong to world_id" }); return; }
  await replaceRows(wsKnowledgeEntriesTable, "recordId", recordId, parsed.data.knowledge, parsed.data.world_id, res, "knowledge", parsed.data.expected_version);
});
router.put("/v1/editorial/stories/:id/beats", async (req: Request, res: Response): Promise<void> => {
  const parsed = sceneBatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const recordId = String(req.params.id);
  if (!(await ownsRecord(recordId, parsed.data.world_id))) { res.status(422).json({ error: "record_id must belong to world_id" }); return; }
  await replaceRows(wsKnowledgeEntriesTable, "recordId", recordId, parsed.data.knowledge, parsed.data.world_id, res, "knowledge", parsed.data.expected_version);
});
router.put("/v1/editorial/stories/:id/beats", async (req: Request, res: Response): Promise<void> => {
  const parsed = sceneBatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const storyId = String(req.params.id);
  if (!(await ownsStory(storyId, parsed.data.world_id))) { res.status(422).json({ error: "story_id must belong to world_id" }); return; }
  await replaceRows(wsRevealThreadsTable, "storyId", storyId, parsed.data.reveals, parsed.data.world_id, res, "reveals");
});
router.put("/v1/editorial/stories/:id/scene-details", async (req: Request, res: Response): Promise<void> => {
  const parsed = sceneBatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const storyId = String(req.params.id);
  if (!(await ownsStory(storyId, parsed.data.world_id))) { res.status(422).json({ error: "story_id must belong to world_id" }); return; }
  await replaceRows(wsRevealThreadsTable, "storyId", storyId, parsed.data.reveals, parsed.data.world_id, res, "reveals");
});
router.put("/v1/editorial/stories/:id/scene-details", async (req: Request, res: Response): Promise<void> => {
  const parsed = sceneBatch.safeParse(req.body);
  if (!parsed.success) { bad(res, parsed); return; }
  const storyId = String(req.params.id);
  if (!(await ownsStory(storyId, parsed.data.world_id))) { res.status(422).json({ error: "story_id must belong to world_id" }); return; }
  try {
    const rows = await db.transaction(async (tx) => {
      await tx.delete(wsStorySceneDetailsTable).where(and(eq(wsStorySceneDetailsTable.storyId, storyId), eq(wsStorySceneDetailsTable.worldId, parsed.data.world_id)));
      if (!parsed.data.scenes.length) return [];
      return await tx.insert(wsStorySceneDetailsTable).values(parsed.data.scenes.map((item) => ({
        sceneId: item.scene_id, storyId, worldId: parsed.data.world_id, purpose: item.purpose ?? null,
        viewpointDistance: item.viewpoint_distance ?? null, details: item.details,
      })) as any).onConflictDoUpdate({ target: wsStorySceneDetailsTable.sceneId, set: { storyId, worldId: parsed.data.world_id, purpose: undefined, viewpointDistance: undefined, details: undefined, updatedAt: new Date() } }).returning();
    });
    res.json({ scenes: rows });
  } catch { res.status(409).json({ error: "Unable to replace scene details" }); }
});

export default router;
