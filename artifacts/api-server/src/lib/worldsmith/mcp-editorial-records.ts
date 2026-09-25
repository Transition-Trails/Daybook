import { createHash } from "node:crypto";
import { and, asc, eq, ilike, or } from "drizzle-orm";
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

const argsSchemas = {
  search_worlds: z.object({ query: z.string().max(500).optional() }).strict(),
  get_world: z.object({ world_id: z.string().min(1).max(200) }).strict(),
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
    }).strict().refine(value => Object.keys(value).length > 0, "changes must include at least one editorial field"),
  }).strict(),
  search_storylines: z.object({
    world_id: z.string().min(1).max(200),
    query: z.string().max(500).optional(),
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
  search_movements: z.object({
    storyline_id: z.string().min(1).max(200),
    query: z.string().max(500).optional(),
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

const textField = (maxLength: number, minLength?: number) => ({
  type: "string",
  ...(minLength ? { minLength } : {}),
  maxLength,
});
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
  { name: "search_worlds", description: "Search editorial worlds by optional name query.", inputSchema: schema({ query: textField(500) }) },
  { name: "get_world", description: "Read a complete editorial world and its current content revision.", inputSchema: schema({ world_id: textField(200, 1) }, ["world_id"]) },
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
    }, [], 1),
  }, ["world_id", "expected_revision", "changes"]) },
  { name: "search_storylines", description: "Search storylines in a world by optional title or summary query.", inputSchema: schema({ world_id: textField(200, 1), query: textField(500) }, ["world_id"]) },
  { name: "get_storyline", description: "Read a complete storyline and its current content revision.", inputSchema: schema({ storyline_id: textField(200, 1) }, ["storyline_id"]) },
  { name: "update_storyline", description: "Update whitelisted storyline editorial fields at the expected content revision.", inputSchema: schema({
    storyline_id: textField(200, 1), expected_revision: textField(100, 1),
    changes: schema({
      title: textField(500, 1), summary: textField(20_000),
      globalMetadata: jsonObjectField, storySpine: jsonArrayField, revealArchitecture: jsonArrayField,
    }, [], 1),
  }, ["storyline_id", "expected_revision", "changes"]) },
  { name: "search_movements", description: "Search movements within a storyline by optional title, tagline, or narrative query.", inputSchema: schema({ storyline_id: textField(200, 1), query: textField(500) }, ["storyline_id"]) },
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

function stableValue(value: unknown, omitUpdatedAt = false): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(entry => stableValue(entry));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !omitUpdatedAt || key !== "updatedAt")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stableValue(entry)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function revisionFor(row: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableValue(row, true))).digest("hex")}`;
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
  type: "world" | "storyline" | "movement",
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
      const worlds = await db.select().from(worldsmithWorldsTable)
        .where(query ? ilike(worldsmithWorldsTable.name, `%${query}%`) : undefined)
        .orderBy(asc(worldsmithWorldsTable.name), asc(worldsmithWorldsTable.id)).limit(100);
      return { worlds: worlds.map(row => ({ ...withRevision(row), editor_url: editorUrl(origin, "world", row.id, row.id) })) };
    }
    case "get_world": {
      const { world_id } = parseArgs("get_world", args);
      const [row] = await db.select().from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, world_id)).limit(1);
      if (!row) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
      return { record: row, revision: revisionFor(row), editor_url: editorUrl(origin, "world", row.id, row.id) };
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
      const stories = await db.select().from(wsStoriesTable).where(and(...conditions))
        .orderBy(asc(wsStoriesTable.sortOrder), asc(wsStoriesTable.id)).limit(100);
      return { storylines: stories.map(row => ({
        id: row.id, name: row.title, title: row.title, world_id: row.worldId,
        story_map_id: row.worldId, status: row.status,
        revision: revisionFor(row), editor_url: editorUrl(origin, "storyline", row.id, row.worldId),
      })) };
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
        story_beats: beatRows.slice(0, EDITORIAL_CHILD_LIMIT),
        reveal_threads: revealRows.slice(0, EDITORIAL_CHILD_LIMIT),
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
      const movements = await db.select().from(wsStoryActsTable).where(and(...conditions))
        .orderBy(asc(wsStoryActsTable.actNumber), asc(wsStoryActsTable.id)).limit(100);
      return { movements: movements.map(row => ({
        id: row.id, name: row.title, title: row.title, storyline_id: row.storyId,
        world_id: row.worldId, story_map_id: row.worldId,
        revision: revisionFor(row), editor_url: editorUrl(origin, "movement", story.id, story.worldId),
      })) };
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