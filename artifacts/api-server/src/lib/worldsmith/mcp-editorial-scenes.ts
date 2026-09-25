import { and, asc, count, eq, gt, ilike, inArray, or, sql } from "drizzle-orm";
import {
  auditLogTable,
  db,
  usersTable,
  worldsmithWorldsTable,
  wsCanonRecordsTable,
  wsScenesTable,
  wsSceneCanonLinksTable,
  wsNarrativeImagesTable,
  wsStoryActsTable,
  wsStoriesTable,
  wsStorySceneDetailsTable,
} from "@workspace/db";
import { z } from "zod";
import { CanonToolError } from "./mcp-canon";
import { revisionFor } from "./editorial-revision";
import { sanitizeEditorialRichText } from "./editorial-rich-text";

const id = z.string().min(1).max(160);
const text = z.string().max(10_000);
const stringList = z.array(z.string().min(1).max(160)).max(100);
const sceneDetailsSchema = z.object({
  purpose: z.string().max(120).optional(),
  viewpoint_distance: z.string().max(80).optional(),
  time_of_day: z.string().max(80).optional(),
  weather: z.string().max(120).optional(),
  season: z.string().max(80).optional(),
  participants: stringList.optional(),
  entrance_state: text.optional(),
  exit_state: text.optional(),
  immediate_goal: text.optional(),
  conflict_source: text.optional(),
  turn_decision: text.optional(),
  outcome: text.optional(),
  new_information: text.optional(),
  emotional_valence: z.string().max(80).optional(),
  emotional_intensity: z.string().max(80).optional(),
  sensory_anchors: stringList.optional(),
  required_objects: stringList.optional(),
  visual_composition_notes: text.optional(),
  continuity_dependencies: stringList.optional(),
  canon_guardrails: text.optional(),
}).strict();
const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string().max(20_000), z.number().finite(), z.boolean(), z.null(),
  z.array(jsonValueSchema).max(500),
  z.record(z.string().max(200), jsonValueSchema),
]));
const attributesSchema = z.record(z.string().max(200), jsonValueSchema);
const searchSchema = z.object({
  world_id: id,
  storyline_id: id.optional(),
  movement_id: id.optional(),
  query: z.string().max(500).optional(),
  after_id: id.optional(),
  limit: z.number().int().min(1).max(100).default(50),
}).strict();
const getSchema = z.object({ scene_id: id }).strict();
const updateSchema = z.object({
  scene_id: id,
  expected_revision: z.string().min(1).max(100),
  changes: z.object({
    title: z.string().min(1).max(500).refine(value => value.trim().length > 0, "A scene title is required").optional(),
    body: z.string().max(50_000).optional(),
    scene_number: z.number().int().positive().max(100_000).optional(),
    attributes: attributesSchema.optional(),
    primary_image_url: z.string().max(2_000).nullable().optional(),
    primary_image_prompt: z.string().max(20_000).nullable().optional(),
    primary_image_metadata: attributesSchema.optional(),
    purpose: z.string().max(120).nullable().optional(),
    viewpoint_distance: z.string().max(80).nullable().optional(),
    details: sceneDetailsSchema.optional(),
    canon_record_ids: z.array(id).max(100).optional(),
  }).strict().refine(value => Object.keys(value).length > 0, "changes must include at least one scene field"),
}).strict();

type SceneToolName = "search_scenes" | "get_scene" | "update_scene";
type ToolDescriptor = { name: SceneToolName; description: string; inputSchema: Record<string, unknown> };
const field = (maxLength: number, minLength?: number) => ({
  type: "string", ...(minLength ? { minLength } : {}), maxLength,
});
const objectSchema = (properties: Record<string, unknown>, required: string[] = [], minProperties?: number) => ({
  type: "object", properties, ...(required.length ? { required } : {}),
  ...(minProperties ? { minProperties } : {}), additionalProperties: false,
});
const stringArray = (maxItems = 100) => ({ type: "array", items: field(160, 1), maxItems });
const detailsProperties = {
  purpose: field(120), viewpoint_distance: field(80), time_of_day: field(80), weather: field(120),
  season: field(80), participants: stringArray(), entrance_state: field(10_000),
  exit_state: field(10_000), immediate_goal: field(10_000), conflict_source: field(10_000),
  turn_decision: field(10_000), outcome: field(10_000), new_information: field(10_000),
  emotional_valence: field(80), emotional_intensity: field(80), sensory_anchors: stringArray(),
  required_objects: stringArray(), visual_composition_notes: field(10_000),
  continuity_dependencies: stringArray(), canon_guardrails: field(10_000),
};

export const SCENE_TOOLS: ToolDescriptor[] = [
  {
    name: "search_scenes",
    description: "Search scenes in a world, optionally narrowed to a storyline or movement and text query.",
    inputSchema: objectSchema({
      world_id: field(160, 1), storyline_id: field(160, 1), movement_id: field(160, 1), query: field(500),
      after_id: field(160, 1), limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    }, ["world_id"]),
  },
  {
    name: "get_scene",
    description: "Read a complete scene, structured scene details, Canon links, and its revision.",
    inputSchema: objectSchema({ scene_id: field(160, 1) }, ["scene_id"]),
  },
  {
    name: "update_scene",
    description: "Partially edit scene prose/details and same-world Canon links at an expected revision.",
    inputSchema: objectSchema({
      scene_id: field(160, 1), expected_revision: field(100, 1),
      changes: objectSchema({
        title: field(500, 1), body: field(50_000),
        scene_number: { type: "integer", minimum: 1, maximum: 100_000 },
        attributes: { type: "object", additionalProperties: true },
        primary_image_url: { anyOf: [field(2_000), { type: "null" }] },
        primary_image_prompt: { anyOf: [field(20_000), { type: "null" }] },
        primary_image_metadata: { type: "object", additionalProperties: true },
        purpose: { anyOf: [field(120), { type: "null" }] },
        viewpoint_distance: { anyOf: [field(80), { type: "null" }] },
        details: objectSchema(detailsProperties),
        canon_record_ids: { type: "array", items: field(160, 1), maxItems: 100 },
      }, [], 1),
    }, ["scene_id", "expected_revision", "changes"]),
  },
];

export const SCENE_WRITE_TOOLS = new Set<string>(["update_scene"]);

function invalidArgs(error: z.ZodError): never {
  throw new CanonToolError(`Invalid tool arguments: ${error.message}`, 400, "INVALID_ARGUMENTS");
}

async function requireSuperAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function requireWorld(tx: Tx, worldId: string, lock = false): Promise<void> {
  let query = tx.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, worldId));
  const [world] = await (lock ? query.for("update") : query).limit(1);
  if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
}

function conflict(expected: string, row: Record<string, unknown>): never {
  throw new CanonToolError(`Revision conflict: expected ${expected}, current revision is ${revisionFor(row)}`, 409, "REVISION_CONFLICT");
}

function sceneSnapshot(
  scene: typeof wsScenesTable.$inferSelect,
  detail: typeof wsStorySceneDetailsTable.$inferSelect | undefined,
  canonLinks: Array<{ canonRecordId: string; role: string; sortOrder: number }>,
) {
  const structured = detail ? {
    purpose: detail.purpose, viewpointDistance: detail.viewpointDistance, details: detail.details,
  } : null;
  const links = canonLinks.map(link => ({
    canonRecordId: link.canonRecordId, role: link.role, sortOrder: link.sortOrder,
  }));
  return { scene, scene_details: structured, canon_links: links };
}

async function readScene(tx: Tx, sceneId: string, lock = false) {
  let sceneQuery = tx.select().from(wsScenesTable).where(eq(wsScenesTable.id, sceneId));
  const [scene] = await (lock ? sceneQuery.for("update") : sceneQuery).limit(1);
  if (!scene) throw new CanonToolError("Scene not found", 404, "SCENE_NOT_FOUND");
  const [story] = await tx.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, scene.storyId)).limit(1);
  if (!story) throw new CanonToolError("Scene's storyline not found", 409, "INVALID_PARENT");
  const [movement] = await tx.select().from(wsStoryActsTable).where(eq(wsStoryActsTable.id, scene.actId)).limit(1);
  if (!movement) throw new CanonToolError("Scene's movement not found", 409, "INVALID_PARENT");
  if (
    story.worldId !== scene.worldId || movement.worldId !== scene.worldId
    || movement.storyId !== story.id
  ) {
    throw new CanonToolError("Scene, movement, storyline, and world hierarchy is inconsistent", 409, "INVALID_PARENT");
  }
  let detailQuery = tx.select().from(wsStorySceneDetailsTable)
    .where(eq(wsStorySceneDetailsTable.sceneId, scene.id));
  const [detail] = await (lock ? detailQuery.for("update") : detailQuery).limit(1);
  if (detail && (detail.worldId !== scene.worldId || detail.storyId !== scene.storyId)) {
    throw new CanonToolError("Scene details do not belong to the scene's storyline and world", 409, "INVALID_PARENT");
  }
  const links = await tx.select({
    canonRecordId: wsSceneCanonLinksTable.canonRecordId,
    role: wsSceneCanonLinksTable.role,
    sortOrder: wsSceneCanonLinksTable.sortOrder,
  }).from(wsSceneCanonLinksTable).where(eq(wsSceneCanonLinksTable.sceneId, scene.id))
    .orderBy(asc(wsSceneCanonLinksTable.sortOrder), asc(wsSceneCanonLinksTable.canonRecordId));
  const records = links.length ? await tx.select({
    id: wsCanonRecordsTable.id, name: wsCanonRecordsTable.name, canonType: wsCanonRecordsTable.canonType,
    status: wsCanonRecordsTable.status, narrativeDetails: wsCanonRecordsTable.narrativeDetails,
    historicalContext: wsCanonRecordsTable.historicalContext, visualNotes: wsCanonRecordsTable.visualNotes,
    canonGuardrails: wsCanonRecordsTable.canonGuardrails, relationshipDetails: wsCanonRecordsTable.relationshipDetails,
    characterDirection: wsCanonRecordsTable.characterDirection, confirmedCanon: wsCanonRecordsTable.confirmedCanon,
    worldId: wsCanonRecordsTable.worldId,
  }).from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, links.map(link => link.canonRecordId))) : [];
  if (records.length !== links.length || records.some(record => record.worldId !== scene.worldId)) {
    throw new CanonToolError("Scene Canon links must reference records in the same world", 409, "INVALID_CANON_LINK");
  }
  return { scene, story, movement, detail, links, records, snapshot: sceneSnapshot(scene, detail, links) };
}

function editorUrl(origin: string, storyId: string, worldId: string, sceneId: string): string {
  const url = new URL(`/super/worldsmith/editorial/stories/${encodeURIComponent(storyId)}`, origin);
  url.searchParams.set("world_id", worldId);
  url.searchParams.set("scene_id", sceneId);
  return url.toString();
}

function normalizedDetails(details: Record<string, unknown>): Record<string, unknown> {
  const result = { ...details };
  for (const [key, value] of Object.entries(result)) {
    if (value === null || value === "") delete result[key];
  }
  return result;
}

function sceneAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
  const parsed = attributesSchema.safeParse(attributes);
  if (!parsed.success) invalidArgs(parsed.error);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === null || value === "") continue;
    if (typeof value === "string" && value.length > 2_000) {
      throw new CanonToolError(`Scene attribute ${key} must be text under 2,000 characters.`, 400, "INVALID_ARGUMENTS");
    }
    output[key] = typeof value === "string" ? value.trim() : value;
  }
  return output;
}

async function audit(
  tx: Tx,
  userId: string,
  sceneId: string,
  diff: Record<string, { before: unknown; after: unknown }>,
): Promise<void> {
  await tx.insert(auditLogTable).values({
    actorUserId: userId, actorRole: "super_admin", scope: "platform",
    action: "worldsmith.editorial.scene.update", targetType: "worldsmith_scene", targetId: sceneId,
    metadata: { actor_user_id: userId, before_after: diff },
  });
}

export async function executeSceneTool(
  userId: string,
  name: string,
  args: unknown,
  origin: string,
): Promise<unknown> {
  await requireSuperAdmin(userId);
  if (name === "search_scenes") {
    const parsed = searchSchema.safeParse(args);
    if (!parsed.success) invalidArgs(parsed.error);
    const input = parsed.data;
    await requireWorld(db as unknown as Tx, input.world_id);
    let story: typeof wsStoriesTable.$inferSelect | undefined;
    if (input.storyline_id) {
      [story] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, input.storyline_id)).limit(1);
      if (!story) throw new CanonToolError("Storyline not found", 404, "STORYLINE_NOT_FOUND");
      if (story.worldId !== input.world_id) throw new CanonToolError("Storyline does not belong to this world", 409, "INVALID_PARENT");
    }
    let movement: typeof wsStoryActsTable.$inferSelect | undefined;
    if (input.movement_id) {
      [movement] = await db.select().from(wsStoryActsTable).where(eq(wsStoryActsTable.id, input.movement_id)).limit(1);
      if (!movement) throw new CanonToolError("Movement not found", 404, "MOVEMENT_NOT_FOUND");
      if (movement.worldId !== input.world_id || (story && movement.storyId !== story.id)) {
        throw new CanonToolError("Movement does not belong to the selected storyline and world", 409, "INVALID_PARENT");
      }
      if (!story) {
        [story] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, movement.storyId)).limit(1);
        if (!story || story.worldId !== input.world_id) throw new CanonToolError("Movement's storyline does not belong to this world", 409, "INVALID_PARENT");
      }
    }
    const conditions = [eq(wsScenesTable.worldId, input.world_id)];
    if (story) conditions.push(eq(wsScenesTable.storyId, story.id));
    if (movement) conditions.push(eq(wsScenesTable.actId, movement.id));
    const query = input.query?.trim();
    if (query) conditions.push(or(
      ilike(wsScenesTable.title, `%${query}%`), ilike(wsScenesTable.body, `%${query}%`),
    )!);
    const filter = and(...conditions);
    const [totalRow] = await db.select({ total: count() }).from(wsScenesTable).where(filter);
    const pageConditions = input.after_id
      ? [...conditions, gt(wsScenesTable.id, input.after_id)]
      : conditions;
    const scenes = await db.select().from(wsScenesTable).where(and(...pageConditions))
      .orderBy(asc(wsScenesTable.id)).limit(input.limit + 1);
    const hasMore = scenes.length > input.limit;
    const page = scenes.slice(0, input.limit);
    const results = [];
    for (const scene of page) {
      const data = await readScene(db as unknown as Tx, scene.id);
      results.push({
        id: scene.id, title: scene.title, scene_number: scene.sceneNumber,
        storyline_id: scene.storyId, movement_id: scene.actId, world_id: scene.worldId,
        revision: revisionFor(data.snapshot),
      });
    }
    return {
      scenes: results,
      total: totalRow.total,
      has_more: hasMore,
      next_cursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
  }

  if (name === "get_scene") {
    const parsed = getSchema.safeParse(args);
    if (!parsed.success) invalidArgs(parsed.error);
    const data = await readScene(db as unknown as Tx, parsed.data.scene_id);
    await requireWorld(db as unknown as Tx, data.scene.worldId);
    const narrativeImages = await db.select().from(wsNarrativeImagesTable)
      .where(and(
        eq(wsNarrativeImagesTable.sceneId, data.scene.id),
        eq(wsNarrativeImagesTable.worldId, data.scene.worldId),
        eq(wsNarrativeImagesTable.storyId, data.scene.storyId),
      )).orderBy(asc(wsNarrativeImagesTable.sortOrder), asc(wsNarrativeImagesTable.createdAt), asc(wsNarrativeImagesTable.id));
    return {
      record: data.scene,
      scene_details: data.detail ?? null,
      canon_records: data.records.map(({ worldId: _worldId, ...record }) => record),
      canon_links: data.links.map(link => ({
        canon_record_id: link.canonRecordId, role: link.role, sort_order: link.sortOrder,
        canon_record: data.records.find(record => record.id === link.canonRecordId),
      })),
      parent: { storyline: data.story, movement: data.movement },
      narrative_images: narrativeImages,
      revision: revisionFor(data.snapshot),
      editor_url: editorUrl(origin, data.story.id, data.scene.worldId, data.scene.id),
    };
  }

  if (name !== "update_scene") {
    throw new CanonToolError(`Unknown editorial scene tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
  const parsed = updateSchema.safeParse(args);
  if (!parsed.success) invalidArgs(parsed.error);
  const input = parsed.data;
  return db.transaction(async tx => {
    const initial = await readScene(tx, input.scene_id);
    // Parent locks precede the scene lock, matching the editorial hierarchy.
    await requireWorld(tx, initial.scene.worldId, true);
    const [story] = await tx.select().from(wsStoriesTable)
      .where(eq(wsStoriesTable.id, initial.story.id)).for("update").limit(1);
    if (!story) throw new CanonToolError("Storyline not found", 404, "STORYLINE_NOT_FOUND");
    const [movement] = await tx.select().from(wsStoryActsTable)
      .where(eq(wsStoryActsTable.id, initial.movement.id)).for("update").limit(1);
    if (!movement) throw new CanonToolError("Movement not found", 404, "MOVEMENT_NOT_FOUND");
    const current = await readScene(tx, input.scene_id, true);
    if (current.story.id !== story.id || current.movement.id !== movement.id) {
      throw new CanonToolError("Scene hierarchy changed during the update", 409, "INVALID_PARENT");
    }
    const actualRevision = revisionFor(current.snapshot);
    if (actualRevision !== input.expected_revision) conflict(input.expected_revision, current.snapshot);

    const change = input.changes;
    const sceneUpdate: Record<string, unknown> = { updatedAt: new Date() };
    if (change.title !== undefined) sceneUpdate.title = change.title.trim();
    if (change.body !== undefined) sceneUpdate.body = sanitizeEditorialRichText(change.body);
    if (change.scene_number !== undefined) sceneUpdate.sceneNumber = change.scene_number;
    if (change.attributes !== undefined) sceneUpdate.attributes = sceneAttributes(change.attributes);
    if (change.primary_image_url !== undefined) {
      const imageUrl = change.primary_image_url?.trim();
      if (imageUrl) {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(imageUrl);
        } catch {
          throw new CanonToolError("Primary image URL must be a safe HTTPS URL.", 400, "INVALID_ARGUMENTS");
        }
        if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) {
          throw new CanonToolError("Primary image URL must be a safe HTTPS URL without credentials.", 400, "INVALID_ARGUMENTS");
        }
        sceneUpdate.primaryImageUrl = parsedUrl.toString();
      } else {
        sceneUpdate.primaryImageUrl = null;
      }
    }
    if (change.primary_image_prompt !== undefined) {
      sceneUpdate.primaryImagePrompt = change.primary_image_prompt?.trim() || null;
    }
    if (change.primary_image_metadata !== undefined) {
      sceneUpdate.primaryImageMetadata = change.primary_image_metadata;
    }
    const detailsChange = change.purpose !== undefined || change.viewpoint_distance !== undefined || change.details !== undefined;
    const nextDetails = {
      ...(current.detail?.details ?? {}),
      ...(change.details ? normalizedDetails(change.details) : {}),
    };
    const beforeAfter: Record<string, { before: unknown; after: unknown }> = {};
    for (const [key, value] of Object.entries(sceneUpdate)) {
      if (key !== "updatedAt") {
        const diffKeys: Record<string, string> = {
          sceneNumber: "scene_number", primaryImageUrl: "primary_image_url",
          primaryImagePrompt: "primary_image_prompt", primaryImageMetadata: "primary_image_metadata",
        };
        const diffKey = diffKeys[key] ?? key;
        beforeAfter[diffKey] = {
          before: (current.scene as unknown as Record<string, unknown>)[key] ?? null, after: value,
        };
      }
    }
    if (detailsChange) {
      beforeAfter.scene_details = {
        before: current.detail ? {
          purpose: current.detail.purpose, viewpoint_distance: current.detail.viewpointDistance,
          details: current.detail.details,
        } : null,
        after: {
          purpose: change.purpose !== undefined ? change.purpose : current.detail?.purpose ?? null,
          viewpoint_distance: change.viewpoint_distance !== undefined
            ? change.viewpoint_distance : current.detail?.viewpointDistance ?? null,
          details: nextDetails,
        },
      };
    }

    let canonIds: string[] | undefined;
    if (change.canon_record_ids !== undefined) {
      canonIds = [...new Set(change.canon_record_ids)];
      const canonRecords = canonIds.length ? await tx.select({
        id: wsCanonRecordsTable.id, canonType: wsCanonRecordsTable.canonType, worldId: wsCanonRecordsTable.worldId,
      }).from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, canonIds)) : [];
      if (canonRecords.length !== canonIds.length || canonRecords.some(record => record.worldId !== current.scene.worldId)) {
        throw new CanonToolError("Every selected Canon record must belong to this world.", 400, "INVALID_CANON_LINK");
      }
      if (!canonRecords.some(record => record.canonType === "character")) {
        throw new CanonToolError("Every scene must contain at least one character.", 400, "INVALID_CANON_LINK");
      }
      beforeAfter.canon_record_ids = {
        before: current.links.map(link => link.canonRecordId),
        after: canonIds,
      };
    }

    // Compare the editable scene state in SQL as a CAS in addition to the held row locks.
    const [updated] = await tx.update(wsScenesTable).set(sceneUpdate)
      .where(and(
        eq(wsScenesTable.id, current.scene.id),
        eq(wsScenesTable.title, current.scene.title),
        eq(wsScenesTable.body, current.scene.body),
        eq(wsScenesTable.sceneNumber, current.scene.sceneNumber),
        sql`${wsScenesTable.attributes} = ${JSON.stringify(current.scene.attributes)}::jsonb`,
        sql`primary_image_url IS NOT DISTINCT FROM ${current.scene.primaryImageUrl}`,
        sql`primary_image_prompt IS NOT DISTINCT FROM ${current.scene.primaryImagePrompt}`,
        sql`primary_image_metadata = ${JSON.stringify(current.scene.primaryImageMetadata)}::jsonb`,
      )).returning();
    if (!updated) throw new CanonToolError("Scene changed during the update; retry with a fresh revision.", 409, "REVISION_CONFLICT");
    if (detailsChange) {
      const detailValues = {
        storyId: current.scene.storyId,
        worldId: current.scene.worldId,
        ...(change.purpose !== undefined ? { purpose: change.purpose } : {}),
        ...(change.viewpoint_distance !== undefined ? { viewpointDistance: change.viewpoint_distance } : {}),
        details: nextDetails,
        updatedAt: new Date(),
      };
      if (current.detail) {
        const [savedDetail] = await tx.update(wsStorySceneDetailsTable).set(detailValues)
          .where(eq(wsStorySceneDetailsTable.sceneId, current.scene.id)).returning();
        if (!savedDetail) throw new CanonToolError("Scene details changed during the update.", 409, "REVISION_CONFLICT");
      } else {
        await tx.insert(wsStorySceneDetailsTable).values({ sceneId: current.scene.id, ...detailValues });
      }
    }
    if (canonIds) {
      await tx.delete(wsSceneCanonLinksTable).where(eq(wsSceneCanonLinksTable.sceneId, current.scene.id));
      const canonTypes = new Map((await tx.select({
        id: wsCanonRecordsTable.id, canonType: wsCanonRecordsTable.canonType,
      }).from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, canonIds))).map(record => [record.id, record.canonType]));
      if (canonIds.length) await tx.insert(wsSceneCanonLinksTable).values(canonIds.map((canonRecordId, index) => ({
        sceneId: current.scene.id, canonRecordId,
        role: canonTypes.get(canonRecordId) === "character" ? "character" : "featured",
        sortOrder: index,
      })));
    }
    await audit(tx, userId, current.scene.id, beforeAfter);
    const saved = await readScene(tx, current.scene.id);
    return {
      record: saved.scene, scene_details: saved.detail ?? null,
      canon_records: saved.records.map(({ worldId: _worldId, ...record }) => record),
      revision: revisionFor(saved.snapshot), diff: beforeAfter,
    };
  });
}