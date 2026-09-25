import { and, asc, count, eq, gt, ilike, or } from "drizzle-orm";
import {
  auditLogTable,
  db,
  usersTable,
  worldsmithWorldsTable,
  wsStoriesTable,
  wsStoryActsTable,
  wsStoryBeatsTable,
  wsRevealThreadsTable,
  wsScenesTable,
} from "@workspace/db";
import { z } from "zod";
import { CanonToolError } from "./mcp-canon";
import { resolveTypographyChoices, TypographyValidationError } from "./typography";
import { revisionFor } from "./editorial-revision";
import { worldEditorialFieldSchemas } from "./world-editorial-fields";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema).max(500),
  z.record(z.string().max(200), jsonValueSchema),
]));
const jsonObjectSchema = z.record(z.string().max(200), jsonValueSchema);
const jsonArraySchema = z.array(jsonValueSchema).max(500);
const typographySchema = z.array(z.object({
  fontId: z.string().min(1).max(200),
}).strict()).max(100);
const EDITORIAL_CHILD_LIMIT = 100;
const textField = (maxLength: number, minLength?: number) => ({
  type: "string",
  ...(minLength ? { minLength } : {}),
  maxLength,
});
const nullableTextField = (maxLength: number) => ({ anyOf: [textField(maxLength), { type: "null" }] });
const worldEditorialPatchSchemas = Object.fromEntries(
  Object.entries(worldEditorialFieldSchemas).map(([field, fieldSchema]) => [field, fieldSchema.optional()]),
);
const worldEditorialInputProperties: Record<string, unknown> = {
  worldPremise: nullableTextField(10_000), foundationalHistory: nullableTextField(30_000),
  centralDramaticQuestion: nullableTextField(5_000),
  coreThemes: { type: "array", maxItems: 50, items: textField(500) },
  narrativePillars: { type: "array", maxItems: 100, items: { type: "object", properties: {
    id: textField(200, 1), name: textField(500), description: textField(10_000),
  }, required: ["id", "name", "description"], additionalProperties: false } },
  historicalEras: { type: "array", maxItems: 100, items: { type: "object", properties: {
    id: textField(200, 1), name: textField(500), order: { type: "integer", minimum: 0, maximum: 100_000 },
    summary: textField(10_000), narrativeCondition: textField(10_000),
    approximatePeriod: { anyOf: [textField(500), { type: "null" }] }, notes: { anyOf: [textField(10_000), { type: "null" }] },
  }, required: ["id", "name", "order", "summary"], additionalProperties: false } },
  institutions: { type: "array", maxItems: 100, items: { type: "object", properties: {
    id: textField(200, 1), name: textField(500), type: textField(200), description: textField(10_000),
    roleInWorld: textField(10_000), notes: textField(10_000),
  }, required: ["id", "name", "description"], additionalProperties: false } },
  economyAndResources: nullableTextField(20_000), knowledgeAndAuthority: nullableTextField(20_000),
  currentWorldState: nullableTextField(20_000), narrativeGravity: nullableTextField(10_000),
  conflictGrammar: nullableTextField(10_000), discoveryRules: nullableTextField(10_000),
  storyGuardrails: { type: "array", maxItems: 100, items: textField(5_000) },
  continuityAnchors: { type: "array", maxItems: 100, items: { type: "object", properties: {
    id: textField(200, 1), label: textField(500), statement: textField(10_000),
    severity: { type: "string", enum: ["advisory", "important", "critical"] },
  }, required: ["id", "label", "statement"], additionalProperties: false } },
  openQuestions: { type: "array", maxItems: 100, items: { type: "object", properties: {
    id: textField(200, 1), question: textField(5_000), notes: textField(10_000),
    status: { type: "string", enum: ["open", "developing", "deferred"] },
  }, required: ["id", "question"], additionalProperties: false } },
  visualGuardrails: { type: "array", maxItems: 100, items: textField(5_000) },
  imageDirection: nullableTextField(10_000),
};

const argsSchemas = {
  search_worlds: z.object({
    query: z.string().max(500).optional(),
    after_id: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }).strict(),
  get_world: z.object({ world_id: z.string().min(1).max(200) }).strict(),
  get_world_creative_context: z.object({ world_id: z.string().min(1).max(200) }).strict(),
  update_world: z.object({
    world_id: z.string().min(1).max(200),
    expected_revision: z.string().min(1).max(100),
    changes: z.object({
      name: z.string().min(1).max(500).optional(),
      description: z.string().max(20_000).optional(),
      coverColor: z.string().max(500).optional(),
      coverAccent: z.string().max(200).optional(),
      tags: z.array(z.string().max(200)).max(100).optional(),
      worldRules: z.array(z.string().max(20_000)).max(500).optional(),
      visualPalette: z.string().max(20_000).nullable().optional(),
      proseVoice: z.string().max(20_000).nullable().optional(),
      atmosphericNotes: z.string().max(20_000).nullable().optional(),
      materialWorld: z.string().max(20_000).nullable().optional(),
      typography: typographySchema.optional(),
      ...worldEditorialPatchSchemas,
    }).strict().refine(value => Object.keys(value).length > 0, "changes must include at least one editorial field"),
  }).strict(),
  search_storylines: z.object({
    world_id: z.string().min(1).max(200),
    query: z.string().max(500).optional(),
    after_id: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }).strict(),
  get_storyline: z.object({ storyline_id: z.string().min(1).max(200) }).strict(),
  update_storyline: z.object({
    storyline_id: z.string().min(1).max(200),
    expected_revision: z.string().min(1).max(100),
    changes: z.object({
      title: z.string().min(1).max(500).optional(),
      summary: z.string().max(20_000).optional(),
      globalMetadata: jsonObjectSchema.optional(),
      storySpine: jsonArraySchema.optional(),
      revealArchitecture: jsonArraySchema.optional(),
    }).strict().refine(value => Object.keys(value).length > 0, "changes must include at least one editorial field"),
  }).strict(),
  get_story_beat: z.object({ storyline_id: z.string().min(1).max(200), beat_id: z.string().min(1).max(200) }).strict(),
  update_story_beat: z.object({
    storyline_id: z.string().min(1).max(200),
    beat_id: z.string().min(1).max(200),
    expected_revision: z.string().min(1).max(100),
    changes: z.object({
      beatType: z.string().min(1).max(200).optional(),
      title: z.string().min(1).max(500).optional(),
      summary: z.string().max(20_000).optional(),
      sortOrder: z.number().int().min(0).max(100_000).optional(),
      details: jsonObjectSchema.optional(),
    }).strict().refine(value => Object.keys(value).length > 0, "changes must include an editorial field"),
  }).strict(),
  get_reveal_thread: z.object({ storyline_id: z.string().min(1).max(200), reveal_id: z.string().min(1).max(200) }).strict(),
  update_reveal_thread: z.object({
    storyline_id: z.string().min(1).max(200),
    reveal_id: z.string().min(1).max(200),
    expected_revision: z.string().min(1).max(100),
    changes: z.object({
      title: z.string().min(1).max(500).optional(),
      truth: z.string().max(20_000).optional(),
      audienceKnowledge: z.string().max(20_000).nullable().optional(),
      details: jsonObjectSchema.optional(),
    }).strict().refine(value => Object.keys(value).length > 0, "changes must include an editorial field"),
  }).strict(),
  search_movements: z.object({
    storyline_id: z.string().min(1).max(200),
    query: z.string().max(500).optional(),
    after_id: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }).strict(),
  get_movement: z.object({ movement_id: z.string().min(1).max(200) }).strict(),
  update_movement: z.object({
    movement_id: z.string().min(1).max(200),
    expected_revision: z.string().min(1).max(100),
    changes: z.object({
      title: z.string().min(1).max(500).optional(),
      tagline: z.string().max(20_000).optional(),
      narrative: z.string().max(50_000).optional(),
    }).strict().refine(value => Object.keys(value).length > 0, "changes must include at least one editorial field"),
  }).strict(),
} as const;

type ToolName = keyof typeof argsSchemas;
type EditorialToolDescriptor = {
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

const jsonObjectField = { type: "object", additionalProperties: true };
const jsonArrayField = { type: "array", items: {} };
const schema = (properties: Record<string, unknown>, required: string[] = [], minProperties?: number) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  ...(minProperties ? { minProperties } : {}),
  additionalProperties: false,
});

export const RECORD_TOOLS: EditorialToolDescriptor[] = [
  { name: "search_worlds", description: "Search editorial worlds by optional name query; use after_id and limit to discover every result in stable ID order.", inputSchema: schema({
    query: textField(500), after_id: textField(200, 1), limit: { type: "integer", minimum: 1, maximum: 100 },
  }) },
  { name: "get_world", description: "Read a complete editorial world and its current content revision.", inputSchema: schema({ world_id: textField(200, 1) }, ["world_id"]) },
  { name: "get_world_creative_context", description: "Read the compact Creative Director context package for a world before writing downstream story content.", inputSchema: schema({ world_id: textField(200, 1) }, ["world_id"]) },
  { name: "update_world", description: "Update whitelisted World Bible editorial fields at the expected content revision.", inputSchema: schema({
    world_id: textField(200, 1), expected_revision: textField(100, 1),
    changes: schema({
      name: textField(500, 1), description: textField(20_000), coverColor: textField(500), coverAccent: textField(200),
      tags: { type: "array", items: textField(200), maxItems: 100 },
      worldRules: { type: "array", items: textField(20_000), maxItems: 500 },
      visualPalette: { anyOf: [textField(20_000), { type: "null" }] },
      proseVoice: { anyOf: [textField(20_000), { type: "null" }] },
      atmosphericNotes: { anyOf: [textField(20_000), { type: "null" }] },
      materialWorld: { anyOf: [textField(20_000), { type: "null" }] },
      typography: { type: "array", maxItems: 100, items: {
        type: "object",
        properties: { fontId: textField(200, 1) },
        required: ["fontId"],
        additionalProperties: false,
      } },
      ...worldEditorialInputProperties,
    }, [], 1),
  }, ["world_id", "expected_revision", "changes"]) },
  { name: "search_storylines", description: "Search storylines in a world by optional title or summary query; use after_id and limit to discover every result in stable ID order.", inputSchema: schema({
    world_id: textField(200, 1), query: textField(500), after_id: textField(200, 1),
    limit: { type: "integer", minimum: 1, maximum: 100 },
  }, ["world_id"]) },
  { name: "get_storyline", description: "Read a complete storyline and its current content revision.", inputSchema: schema({ storyline_id: textField(200, 1) }, ["storyline_id"]) },
  { name: "update_storyline", description: "Update whitelisted storyline editorial fields at the expected content revision.", inputSchema: schema({
    storyline_id: textField(200, 1), expected_revision: textField(100, 1),
    changes: schema({
      title: textField(500, 1), summary: textField(20_000),
      globalMetadata: jsonObjectField, storySpine: jsonArrayField, revealArchitecture: jsonArrayField,
    }, [], 1),
  }, ["storyline_id", "expected_revision", "changes"]) },
  { name: "get_story_beat", description: "Read a beat and its current revision within a storyline.", inputSchema: schema({ storyline_id: textField(200, 1), beat_id: textField(200, 1) }, ["storyline_id", "beat_id"]) },
  { name: "update_story_beat", description: "Edit beat prose and ordering at its own expected revision; cannot change status or Canon records.", inputSchema: schema({
    storyline_id: textField(200, 1), beat_id: textField(200, 1), expected_revision: textField(100, 1),
    changes: schema({ beatType: textField(200, 1), title: textField(500, 1), summary: textField(20_000),
      sortOrder: { type: "integer", minimum: 0, maximum: 100_000 }, details: jsonObjectField }, [], 1),
  }, ["storyline_id", "beat_id", "expected_revision", "changes"]) },
  { name: "get_reveal_thread", description: "Read a reveal thread and its current revision within a storyline.", inputSchema: schema({ storyline_id: textField(200, 1), reveal_id: textField(200, 1) }, ["storyline_id", "reveal_id"]) },
  { name: "update_reveal_thread", description: "Edit reveal-thread prose at its own expected revision; cannot change Canon records.", inputSchema: schema({
    storyline_id: textField(200, 1), reveal_id: textField(200, 1), expected_revision: textField(100, 1),
    changes: schema({ title: textField(500, 1), truth: textField(20_000),
      audienceKnowledge: { anyOf: [textField(20_000), { type: "null" }] }, details: jsonObjectField }, [], 1),
  }, ["storyline_id", "reveal_id", "expected_revision", "changes"]) },
  { name: "search_movements", description: "Search movements within a storyline by optional title, tagline, or narrative query; use after_id and limit to discover every result in stable ID order.", inputSchema: schema({
    storyline_id: textField(200, 1), query: textField(500), after_id: textField(200, 1),
    limit: { type: "integer", minimum: 1, maximum: 100 },
  }, ["storyline_id"]) },
  { name: "get_movement", description: "Read a complete movement and its current content revision.", inputSchema: schema({ movement_id: textField(200, 1) }, ["movement_id"]) },
  { name: "update_movement", description: "Update whitelisted movement editorial fields at the expected content revision; ordering is managed separately.", inputSchema: schema({
    movement_id: textField(200, 1), expected_revision: textField(100, 1),
    changes: schema({ title: textField(500, 1), tagline: textField(20_000), narrative: textField(50_000) }, [], 1),
  }, ["movement_id", "expected_revision", "changes"]) },
];

export const RECORD_WRITE_TOOLS = new Set<string>([
  "update_world", "update_storyline", "update_movement",
]);

function parseArgs<T extends ToolName>(name: T, args: unknown): z.infer<(typeof argsSchemas)[T]> {
  const parsed = argsSchemas[name].safeParse(args);
  if (!parsed.success) {
    throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  }
  return parsed.data as z.infer<(typeof argsSchemas)[T]>;
}

async function requireSuperAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

async function requireWorld(worldId: string): Promise<void> {
  const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, worldId)).limit(1);
  if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
}

async function requireWorldInTransaction(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  worldId: string,
): Promise<void> {
  const [world] = await tx.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, worldId)).limit(1);
  if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
}

function editorUrl(origin: string, type: "world" | "storyline" | "movement", rowId: string, worldId: string): string {
  const path = type === "world"
    ? "/super/worldsmith/editorial/bible"
    : `/super/worldsmith/editorial/stories/${encodeURIComponent(rowId)}`;
  const url = new URL(path, origin);
  url.searchParams.set("world_id", worldId);
  return url.toString();
}

function withRevision<T extends Record<string, unknown>>(row: T): T & { revision: string } {
  return { ...row, revision: revisionFor(row) };
}

function conflict(expected: string, row: Record<string, unknown>): never {
  throw new CanonToolError(`Revision conflict: expected ${expected}, current revision is ${revisionFor(row)}`, 409, "REVISION_CONFLICT");
}

async function insertAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  type: "world" | "storyline" | "movement" | "story_beat" | "reveal_thread",
  id: string,
  diff: Record<string, { before: unknown; after: unknown }>,
): Promise<void> {
  await tx.insert(auditLogTable).values({
    actorUserId: userId,
    actorRole: "super_admin",
    scope: "platform",
    action: `worldsmith.editorial.${type}.update`,
    targetType: `worldsmith_${type}`,
    targetId: id,
    metadata: { actor_user_id: userId, before_after: diff },
  });
}

function fieldDiff(before: Record<string, unknown>, changes: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(changes).map(([key, after]) => [
    key, { before: before[key] ?? null, after },
  ]));
}

export async function executeRecordTool(
  userId: string,
  name: string,
  args: unknown,
  origin: string,
): Promise<unknown> {
  await requireSuperAdmin(userId);
  if (!Object.hasOwn(argsSchemas, name)) {
    throw new CanonToolError(`Unknown editorial record tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
  switch (name as ToolName) {
    case "search_worlds": {
      const input = parseArgs("search_worlds", args);
      const query = input.query?.trim();
      const conditions = query ? [ilike(worldsmithWorldsTable.name, `%${query}%`)] : [];
      const [totalRow] = await db.select({ total: count() }).from(worldsmithWorldsTable)
        .where(conditions.length ? and(...conditions) : undefined);
      const pageConditions = input.after_id
        ? [...conditions, gt(worldsmithWorldsTable.id, input.after_id)]
        : conditions;
      const pageSize = input.limit ?? 100;
      const rows = await db.select().from(worldsmithWorldsTable)
        .where(pageConditions.length ? and(...pageConditions) : undefined)
        .orderBy(asc(worldsmithWorldsTable.id)).limit(pageSize + 1);
      const hasMore = rows.length > pageSize;
      const page = rows.slice(0, pageSize);
      return {
        worlds: page.map(row => ({ ...withRevision(row), editor_url: editorUrl(origin, "world", row.id, row.id) })),
        total: totalRow?.total ?? 0,
        has_more: hasMore,
        next_cursor: hasMore ? page.at(-1)?.id ?? null : null,
      };
    }
    case "get_world": {
      const { world_id } = parseArgs("get_world", args);
      const [row] = await db.select().from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, world_id)).limit(1);
      if (!row) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
      return { record: row, revision: revisionFor(row), editor_url: editorUrl(origin, "world", row.id, row.id) };
    }
    case "get_world_creative_context": {
      const { world_id } = parseArgs("get_world_creative_context", args);
      const [row] = await db.select().from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, world_id)).limit(1);
      if (!row) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
      return {
        world_id: row.id,
        name: row.name,
        worldPremise: row.worldPremise ?? null,
        centralDramaticQuestion: row.centralDramaticQuestion ?? null,
        coreThemes: row.coreThemes ?? [],
        narrativePillars: row.narrativePillars ?? [],
        historicalEras: row.historicalEras ?? [],
        currentWorldState: row.currentWorldState ?? null,
        narrativeGravity: row.narrativeGravity ?? null,
        conflictGrammar: row.conflictGrammar ?? null,
        discoveryRules: row.discoveryRules ?? null,
        storyGuardrails: row.storyGuardrails ?? [],
        continuityAnchors: row.continuityAnchors ?? [],
        openQuestions: row.openQuestions ?? [],
        worldRules: row.worldRules ?? [],
        proseVoice: row.proseVoice ?? null,
        visualPalette: row.visualPalette ?? null,
        atmosphericNotes: row.atmosphericNotes ?? null,
        materialWorld: row.materialWorld ?? null,
        imageDirection: row.imageDirection ?? null,
        visualGuardrails: row.visualGuardrails ?? [],
        revision: revisionFor(row),
      };
    }
    case "update_world": {
      const input = parseArgs("update_world", args);
      return db.transaction(async tx => {
        const [row] = await tx.select().from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, input.world_id)).for("update").limit(1);
        if (!row) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
        if (revisionFor(row) !== input.expected_revision) conflict(input.expected_revision, row);
        const changes: Record<string, unknown> = { ...input.changes };
        if (input.changes.typography !== undefined) {
          try {
            changes.typography = await resolveTypographyChoices(input.changes.typography);
          } catch (error) {
            if (error instanceof TypographyValidationError) {
              throw new CanonToolError(error.message, 400, "INVALID_TYPOGRAPHY");
            }
            throw error;
          }
        }
        const diff = fieldDiff(row as unknown as Record<string, unknown>, changes);
        const [updated] = await tx.update(worldsmithWorldsTable).set({
          ...changes,
          updatedAt: new Date(),
        }).where(eq(worldsmithWorldsTable.id, row.id)).returning();
        await insertAudit(tx, userId, "world", row.id, diff);
        return { record: updated, revision: revisionFor(updated), diff };
      });
    }
    case "search_storylines": {
      const input = parseArgs("search_storylines", args);
      await requireWorld(input.world_id);
      const query = input.query?.trim();
      const conditions = [eq(wsStoriesTable.worldId, input.world_id)];
      if (query) {
        conditions.push(or(
          ilike(wsStoriesTable.title, `%${query}%`),
          ilike(wsStoriesTable.summary, `%${query}%`),
        )!);
      }
      const [totalRow] = await db.select({ total: count() }).from(wsStoriesTable).where(and(...conditions));
      const pageConditions = input.after_id
        ? [...conditions, gt(wsStoriesTable.id, input.after_id)]
        : conditions;
      const pageSize = input.limit ?? 100;
      const rows = await db.select().from(wsStoriesTable).where(and(...pageConditions))
        .orderBy(asc(wsStoriesTable.id)).limit(pageSize + 1);
      const hasMore = rows.length > pageSize;
      const page = rows.slice(0, pageSize);
      return {
        storylines: page.map(row => ({
        id: row.id, name: row.title, title: row.title, world_id: row.worldId,
        story_map_id: row.worldId, status: row.status,
        revision: revisionFor(row), editor_url: editorUrl(origin, "storyline", row.id, row.worldId),
        })),
        total: totalRow?.total ?? 0,
        has_more: hasMore,
        next_cursor: hasMore ? page.at(-1)?.id ?? null : null,
      };
    }
    case "get_storyline": {
      const { storyline_id } = parseArgs("get_storyline", args);
      const [row] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, storyline_id)).limit(1);
      if (!row) throw new CanonToolError("Storyline not found", 404, "STORYLINE_NOT_FOUND");
      await requireWorld(row.worldId);
      const [movementRows, beatRows, revealRows] = await Promise.all([
        db.select().from(wsStoryActsTable).where(eq(wsStoryActsTable.storyId, row.id))
          .orderBy(asc(wsStoryActsTable.actNumber), asc(wsStoryActsTable.id)).limit(EDITORIAL_CHILD_LIMIT + 1),
        db.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.storyId, row.id))
          .orderBy(asc(wsStoryBeatsTable.sortOrder), asc(wsStoryBeatsTable.id)).limit(EDITORIAL_CHILD_LIMIT + 1),
        db.select().from(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.storyId, row.id))
          .orderBy(asc(wsRevealThreadsTable.title), asc(wsRevealThreadsTable.id)).limit(EDITORIAL_CHILD_LIMIT + 1),
      ]);
      if (
        movementRows.some(child => child.storyId !== row.id || child.worldId !== row.worldId)
        || beatRows.some(child => child.storyId !== row.id || child.worldId !== row.worldId)
        || revealRows.some(child => child.storyId !== row.id || child.worldId !== row.worldId)
      ) {
        throw new CanonToolError("Storyline child records do not belong to the same world and storyline", 409, "INVALID_PARENT");
      }
      return {
        record: row,
        revision: revisionFor(row),
        editor_url: editorUrl(origin, "storyline", row.id, row.worldId),
        movements: movementRows.slice(0, EDITORIAL_CHILD_LIMIT),
        story_beats: beatRows.slice(0, EDITORIAL_CHILD_LIMIT).map(withRevision),
        reveal_threads: revealRows.slice(0, EDITORIAL_CHILD_LIMIT).map(withRevision),
        movements_truncated: movementRows.length > EDITORIAL_CHILD_LIMIT,
        story_beats_truncated: beatRows.length > EDITORIAL_CHILD_LIMIT,
        reveal_threads_truncated: revealRows.length > EDITORIAL_CHILD_LIMIT,
      };
    }
    case "update_storyline": {
      const input = parseArgs("update_storyline", args);
      return db.transaction(async tx => {
        const [row] = await tx.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, input.storyline_id)).for("update").limit(1);
        if (!row) throw new CanonToolError("Storyline not found", 404, "STORYLINE_NOT_FOUND");
        await requireWorldInTransaction(tx, row.worldId);
        if (revisionFor(row) !== input.expected_revision) conflict(input.expected_revision, row);
        const diff = fieldDiff(row as unknown as Record<string, unknown>, input.changes);
        const [updated] = await tx.update(wsStoriesTable).set({ ...input.changes, updatedAt: new Date() })
          .where(eq(wsStoriesTable.id, row.id)).returning();
        await insertAudit(tx, userId, "storyline", row.id, diff);
        return { record: updated, revision: revisionFor(updated), diff };
      });
    }
    case "get_story_beat":
    case "get_reveal_thread":
    case "update_story_beat":
    case "update_reveal_thread": {
      const isBeat = name === "get_story_beat" || name === "update_story_beat";
      const isWrite = name === "update_story_beat" || name === "update_reveal_thread";
      const input = isBeat
        ? (isWrite ? parseArgs("update_story_beat", args) : parseArgs("get_story_beat", args))
        : (isWrite ? parseArgs("update_reveal_thread", args) : parseArgs("get_reveal_thread", args));
      const childId = "beat_id" in input ? input.beat_id : input.reveal_id;
      const table = isBeat ? wsStoryBeatsTable : wsRevealThreadsTable;
      const notFound = isBeat ? "STORY_BEAT_NOT_FOUND" : "REVEAL_THREAD_NOT_FOUND";
      // Parent first, then child: all MCP writes acquire locks in this order.
      return db.transaction(async tx => {
        const [story] = await tx.select().from(wsStoriesTable)
          .where(eq(wsStoriesTable.id, input.storyline_id)).for("update").limit(1);
        if (!story) throw new CanonToolError("Storyline not found", 404, "STORYLINE_NOT_FOUND");
        await requireWorldInTransaction(tx, story.worldId);
        if (isBeat) {
          const [row] = await tx.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, childId)).for("update").limit(1);
          if (!row) throw new CanonToolError("Story beat not found", 404, notFound);
          if (row.storyId !== story.id || row.worldId !== story.worldId) throw new CanonToolError("Beat does not belong to this storyline and world", 409, "INVALID_PARENT");
          if (name !== "update_story_beat") return { record: row, revision: revisionFor(row), editor_url: editorUrl(origin, "storyline", story.id, story.worldId) };
          const edit = parseArgs("update_story_beat", args);
          if (revisionFor(row) !== edit.expected_revision) conflict(edit.expected_revision, row);
          const diff = fieldDiff(row, edit.changes);
          const [updated] = await tx.update(wsStoryBeatsTable).set({ ...edit.changes, updatedAt: new Date() }).where(eq(wsStoryBeatsTable.id, row.id)).returning();
          await insertAudit(tx, userId, "story_beat", row.id, diff);
          return { record: updated, revision: revisionFor(updated), diff };
        }
        const [row] = await tx.select().from(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.id, childId)).for("update").limit(1);
        if (!row) throw new CanonToolError("Reveal thread not found", 404, notFound);
        if (row.storyId !== story.id || row.worldId !== story.worldId) throw new CanonToolError("Reveal does not belong to this storyline and world", 409, "INVALID_PARENT");
        if (name !== "update_reveal_thread") return { record: row, revision: revisionFor(row), editor_url: editorUrl(origin, "storyline", story.id, story.worldId) };
        const edit = parseArgs("update_reveal_thread", args);
        if (revisionFor(row) !== edit.expected_revision) conflict(edit.expected_revision, row);
        const diff = fieldDiff(row, edit.changes);
        const [updated] = await tx.update(wsRevealThreadsTable).set({ ...edit.changes, updatedAt: new Date() }).where(eq(wsRevealThreadsTable.id, row.id)).returning();
        await insertAudit(tx, userId, "reveal_thread", row.id, diff);
        return { record: updated, revision: revisionFor(updated), diff };
      });
    }
    case "search_movements": {
      const input = parseArgs("search_movements", args);
      const [story] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, input.storyline_id)).limit(1);
      if (!story) throw new CanonToolError("Storyline not found", 404, "STORYLINE_NOT_FOUND");
      await requireWorld(story.worldId);
      const query = input.query?.trim();
      const conditions = [
        eq(wsStoryActsTable.storyId, story.id),
        eq(wsStoryActsTable.worldId, story.worldId),
      ];
      if (query) {
        conditions.push(or(
          ilike(wsStoryActsTable.title, `%${query}%`),
          ilike(wsStoryActsTable.tagline, `%${query}%`),
          ilike(wsStoryActsTable.narrative, `%${query}%`),
        )!);
      }
      const [totalRow] = await db.select({ total: count() }).from(wsStoryActsTable).where(and(...conditions));
      const pageConditions = input.after_id
        ? [...conditions, gt(wsStoryActsTable.id, input.after_id)]
        : conditions;
      const pageSize = input.limit ?? 100;
      const rows = await db.select().from(wsStoryActsTable).where(and(...pageConditions))
        .orderBy(asc(wsStoryActsTable.id)).limit(pageSize + 1);
      const hasMore = rows.length > pageSize;
      const page = rows.slice(0, pageSize);
      return {
        movements: page.map(row => ({
        id: row.id, name: row.title, title: row.title, storyline_id: row.storyId,
        world_id: row.worldId, story_map_id: row.worldId,
        revision: revisionFor(row), editor_url: editorUrl(origin, "movement", story.id, story.worldId),
        })),
        total: totalRow?.total ?? 0,
        has_more: hasMore,
        next_cursor: hasMore ? page.at(-1)?.id ?? null : null,
      };
    }
    case "get_movement": {
      const { movement_id } = parseArgs("get_movement", args);
      const [row] = await db.select().from(wsStoryActsTable).where(eq(wsStoryActsTable.id, movement_id)).limit(1);
      if (!row) throw new CanonToolError("Movement not found", 404, "MOVEMENT_NOT_FOUND");
      const [story] = await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, row.storyId)).limit(1);
      if (!story) throw new CanonToolError("Movement's storyline not found", 409, "INVALID_PARENT");
      if (story.worldId !== row.worldId) throw new CanonToolError("Movement and storyline belong to different worlds", 409, "INVALID_PARENT");
      await requireWorld(row.worldId);
      const sceneRows = await db.select().from(wsScenesTable).where(eq(wsScenesTable.actId, row.id))
        .orderBy(asc(wsScenesTable.sceneNumber), asc(wsScenesTable.id)).limit(EDITORIAL_CHILD_LIMIT + 1);
      if (sceneRows.some(scene => (
        scene.actId !== row.id || scene.storyId !== row.storyId || scene.worldId !== row.worldId
      ))) {
        throw new CanonToolError("Movement scenes do not belong to the same world, storyline, and movement", 409, "INVALID_PARENT");
      }
      return {
        record: row,
        revision: revisionFor(row),
        editor_url: editorUrl(origin, "movement", story.id, row.worldId),
        scenes: sceneRows.slice(0, EDITORIAL_CHILD_LIMIT),
        scenes_truncated: sceneRows.length > EDITORIAL_CHILD_LIMIT,
      };
    }
    case "update_movement": {
      const input = parseArgs("update_movement", args);
      return db.transaction(async tx => {
        const [row] = await tx.select().from(wsStoryActsTable).where(eq(wsStoryActsTable.id, input.movement_id)).for("update").limit(1);
        if (!row) throw new CanonToolError("Movement not found", 404, "MOVEMENT_NOT_FOUND");
        const [story] = await tx.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, row.storyId)).limit(1);
        if (!story) throw new CanonToolError("Movement's storyline not found", 409, "INVALID_PARENT");
        if (story.worldId !== row.worldId) throw new CanonToolError("Movement and storyline belong to different worlds", 409, "INVALID_PARENT");
        await requireWorldInTransaction(tx, row.worldId);
        if (revisionFor(row) !== input.expected_revision) conflict(input.expected_revision, row);
        const diff = fieldDiff(row as unknown as Record<string, unknown>, input.changes);
        const [updated] = await tx.update(wsStoryActsTable).set({ ...input.changes, updatedAt: new Date() })
          .where(eq(wsStoryActsTable.id, row.id)).returning();
        await insertAudit(tx, userId, "movement", row.id, diff);
        return { record: updated, revision: revisionFor(updated), diff };
      });
    }
    default:
      throw new CanonToolError(`Unknown editorial record tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
}