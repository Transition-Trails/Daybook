import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  auditLogTable, db, pool, usersTable, worldsmithWorldsTable, wsCanonRecordsTable,
  wsCanonRecordStoryLinksTable, wsStoriesTable, wsStoryActsTable,
} from "@workspace/db";
import { z } from "zod";
import { CanonToolError } from "./mcp-canon.js";

const schemas = {
  search_story_maps: {
    type: "object", properties: {
      world_id: { type: "string", minLength: 1 },
      query: { type: "string", minLength: 1, maxLength: 500 },
      after_id: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    }, required: ["world_id"], additionalProperties: false,
  },
  get_story_map: {
    type: "object", properties: { map_id: { type: "string", minLength: 1 } },
    required: ["map_id"], additionalProperties: false,
  },
  update_story_map: {
    type: "object", properties: {
      map_id: { type: "string", minLength: 1 },
      expected_revision: { type: "string", minLength: 1 },
      story_order: { type: "array", minItems: 1, maxItems: 500, items: {
        type: "object", properties: { story_id: { type: "string", minLength: 1 }, order: { type: "integer", minimum: 1 } },
        required: ["story_id", "order"], additionalProperties: false,
      } },
      add_links: { type: "array", maxItems: 160, items: {
        type: "object", properties: {
          canon_record_id: { type: "string", minLength: 1 }, story_id: { type: "string", minLength: 1 },
          act_id: { type: ["string", "null"] },
        }, required: ["canon_record_id", "story_id"], additionalProperties: false,
      } },
      remove_link_ids: { type: "array", maxItems: 160, items: { type: "string", minLength: 1 } },
    }, required: ["map_id", "expected_revision"], additionalProperties: false,
  },
  search_sequences: {
    type: "object", properties: {
      world_id: { type: "string", minLength: 1 },
      query: { type: "string", minLength: 1, maxLength: 500 },
      after_id: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    }, required: ["world_id"], additionalProperties: false,
  },
  get_sequence: {
    type: "object", properties: {
      world_id: { type: "string", minLength: 1 },
      sequence_id: { type: "string", minLength: 1, description: "A current sequence ID, or the world ID as a stable anchor when no ordered groups remain." },
    },
    required: ["world_id", "sequence_id"], additionalProperties: false,
  },
  update_sequence: {
    type: "object", properties: {
      world_id: { type: "string", minLength: 1 },
      sequence_id: { type: "string", minLength: 1, description: "A current sequence ID, or the world ID as a stable anchor when no ordered groups remain." },
      expected_revision: { type: "string", minLength: 1 },
      groups: { type: "array", maxItems: 500, items: { type: "array", minItems: 1, maxItems: 500, items: { type: "string", minLength: 1 } } },
      references: { type: "array", maxItems: 500, description: "Complete reference lane. Requires separate reference-lane write consent; omit to leave references unchanged.", items: { type: "string", minLength: 1 } },
    }, required: ["world_id", "sequence_id", "expected_revision", "groups"], additionalProperties: false,
  },
} as const;

export const VIEW_TOOLS = [
  { name: "search_story_maps", description: "Search world-level Story Map views.", inputSchema: schemas.search_story_maps },
  { name: "get_story_map", description: "Read a complete Story Map graph of storylines, movements, and canon links.", inputSchema: schemas.get_story_map },
  { name: "update_story_map", description: "Partially update Story Map storyline order and canon links; does not edit canon records.", inputSchema: schemas.update_story_map },
  { name: "search_sequences", description: "Search storyline chronology groups and cross-era reference stories by title or summary, not scenes. Results may be filtered or paginated; use get_sequence with the world ID for a complete layout before writing.", inputSchema: schemas.search_sequences },
  { name: "get_sequence", description: "Read a current virtual chronology group within its world, or use the world ID as a stable anchor to read the complete chronology and reference lane. Always supply world_id.", inputSchema: schemas.get_sequence },
  { name: "update_sequence", description: "Save the complete world chronology atomically. Supply references to move stories into or out of the reference lane (requires reference-lane write consent); omit references for ordered-group-only edits.", inputSchema: schemas.update_sequence },
];

export const VIEW_WRITE_TOOLS = new Set(["update_story_map", "update_sequence"]);

const argsSchemas = {
  search_story_maps: z.object({
    world_id: z.string().min(1), query: z.string().min(1).max(500).optional(),
    after_id: z.string().min(1).optional(), limit: z.number().int().min(1).max(100).optional(),
  }).strict(),
  get_story_map: z.object({ map_id: z.string().min(1) }).strict(),
  update_story_map: z.object({
    map_id: z.string().min(1), expected_revision: z.string().min(1),
    story_order: z.array(z.object({ story_id: z.string().min(1), order: z.number().int().positive() }).strict()).min(1).max(500).optional(),
    add_links: z.array(z.object({
      canon_record_id: z.string().min(1), story_id: z.string().min(1), act_id: z.string().min(1).nullable().optional(),
    }).strict()).max(160).optional(),
    remove_link_ids: z.array(z.string().min(1)).max(160).optional(),
  }).strict().refine(value => !!(value.story_order || value.add_links || value.remove_link_ids), "Provide at least one partial map operation"),
  search_sequences: z.object({
    world_id: z.string().min(1), query: z.string().min(1).max(500).optional(),
    after_id: z.string().min(1).optional(), limit: z.number().int().min(1).max(100).optional(),
  }).strict(),
  get_sequence: z.object({ world_id: z.string().min(1), sequence_id: z.string().min(1) }).strict(),
  update_sequence: z.object({
    world_id: z.string().min(1), sequence_id: z.string().min(1), expected_revision: z.string().min(1),
    groups: z.array(z.array(z.string().min(1)).min(1).max(500)).max(500),
    references: z.array(z.string().min(1)).max(500).optional(),
  }).strict(),
};

type StoryRow = typeof wsStoriesTable.$inferSelect;
type LinkRow = typeof wsCanonRecordStoryLinksTable.$inferSelect;
type AuditLinkRow = Pick<LinkRow, "id" | "canonRecordId" | "storyId" | "actId">;

function parse<T extends keyof typeof argsSchemas>(name: T, args: unknown): z.infer<(typeof argsSchemas)[T]> {
  const result = argsSchemas[name].safeParse(args);
  if (!result.success) throw new CanonToolError(`Invalid tool arguments: ${result.error.message}`, 400, "INVALID_ARGUMENTS");
  return result.data as z.infer<(typeof argsSchemas)[T]>;
}

function revision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function requireAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

type QueryExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function requireWorld(worldId: string, tx: QueryExecutor | typeof db = db): Promise<void> {
  const [world] = await tx.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, worldId)).limit(1);
  if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
}

function storyUrl(origin: string, storyId: string, worldId: string): string {
  const url = new URL(`/super/worldsmith/editorial/stories/${encodeURIComponent(storyId)}`, origin);
  url.searchParams.set("world_id", worldId);
  return url.toString();
}

function mapUrl(origin: string, worldId: string): string {
  const url = new URL("/super/worldsmith/editorial/connections", origin);
  url.searchParams.set("world_id", worldId);
  return url.toString();
}

function sequenceUrl(origin: string, worldId: string, sequenceId: string, storyId: string): string {
  const url = new URL("/super/worldsmith/editorial/stories", origin);
  url.searchParams.set("world_id", worldId);
  url.searchParams.set("view", "sequence");
  url.searchParams.set("sequence_id", sequenceId);
  url.searchParams.set("story_id", storyId);
  return url.toString();
}

async function readMap(worldId: string, origin: string, tx: QueryExecutor | typeof db = db) {
  const [world] = await tx.select({ id: worldsmithWorldsTable.id, name: worldsmithWorldsTable.name })
    .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId)).limit(1);
  if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
  const stories = await tx.select().from(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId))
    .orderBy(asc(wsStoriesTable.sortOrder), asc(wsStoriesTable.title), asc(wsStoriesTable.id));
  const storyIds = stories.map(story => story.id);
  const [acts, links] = storyIds.length ? await Promise.all([
    tx.select().from(wsStoryActsTable).where(and(eq(wsStoryActsTable.worldId, worldId), inArray(wsStoryActsTable.storyId, storyIds)))
      .orderBy(asc(wsStoryActsTable.actNumber), asc(wsStoryActsTable.title), asc(wsStoryActsTable.id)),
    tx.select().from(wsCanonRecordStoryLinksTable).where(inArray(wsCanonRecordStoryLinksTable.storyId, storyIds)),
  ]) : [[], []] as [typeof wsStoryActsTable.$inferSelect[], LinkRow[]];
  const canonIds = [...new Set(links.map(link => link.canonRecordId))];
  const records = canonIds.length
    ? await tx.select().from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, canonIds))
    : [];
  const recordsById = new Map(records.map(record => [record.id, record]));
  const actsByStory = new Map<string, typeof acts>();
  for (const act of acts) actsByStory.set(act.storyId, [...(actsByStory.get(act.storyId) ?? []), act]);
  const graph = {
    world_id: worldId,
    world_name: world.name,
    name: world.name,
    editor_url: mapUrl(origin, worldId),
    stories: stories.map(story => ({
      ...story,
      sequence_role: story.sequenceRole,
      sequence_label: story.sequenceRole === "reference" ? "Reference · outside chronology" : "Chronological",
      editor_url: storyUrl(origin, story.id, worldId),
      movements: (actsByStory.get(story.id) ?? []).map(act => ({ ...act })),
    })),
    links: links.map(link => ({
      ...link,
      parent: { story_id: link.storyId, movement_id: link.actId },
      canon_record: recordsById.get(link.canonRecordId) ?? null,
      canon_record_editor_url: recordsById.has(link.canonRecordId)
        ? new URL(`/super/worldsmith/editorial/canon/${encodeURIComponent(link.canonRecordId)}`, origin).toString()
        : null,
    }))
      .sort((a, b) => a.storyId.localeCompare(b.storyId) || a.canonRecordId.localeCompare(b.canonRecordId) || (a.actId ?? "").localeCompare(b.actId ?? "")),
  };
  return {
    ...graph,
    revision: revision({
      world,
      stories,
      acts: [...acts].sort((a, b) => a.id.localeCompare(b.id)),
      links: [...links].sort((a, b) => a.id.localeCompare(b.id)),
      records: [...records].sort((a, b) => a.id.localeCompare(b.id)),
    }),
  };
}

function chronologyGroups(stories: StoryRow[]) {
  const grouped: Array<{ order: number; members: StoryRow[] }> = [];
  for (const story of stories) {
    if (story.sequenceRole === "reference") continue;
    const previous = grouped[grouped.length - 1];
    if (story.sortOrder > 0 && previous?.order === story.sortOrder) {
      previous.members.push(story);
    } else {
      grouped.push({ order: story.sortOrder, members: [story] });
    }
  }
  return grouped.map(({ order, members }) => {
    const sortedIds = members.map(story => story.id).sort();
    return {
      id: `sequence_${createHash("sha256").update(sortedIds.join("\n")).digest("hex").slice(0, 24)}`,
      order,
      story_ids: sortedIds,
      members: members.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
    };
  });
}

export function sequenceRevisionQuery(worldId: string, tx: QueryExecutor | typeof db = db) {
  // Hash every stored field, not just the fields used to render the page. A
  // search result must remain a valid expected_revision for update_sequence.
  return tx.select({
    value: sql<string>`md5(coalesce(jsonb_agg(to_jsonb(${wsStoriesTable}) order by ${wsStoriesTable.sortOrder}, ${wsStoriesTable.title}, ${wsStoriesTable.id})::text, '[]'))`,
  }).from(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId));
}

async function sequenceRevision(worldId: string, tx: QueryExecutor | typeof db = db): Promise<string> {
  const [row] = await sequenceRevisionQuery(worldId, tx);
  return row!.value;
}

function presentSequenceGroup(
  group: ReturnType<typeof chronologyGroups>[number], index: number,
  worldId: string, origin: string, currentRevision: string,
) {
  return {
    ...group,
    name: `Sequence ${index + 1}: ${group.members.map(story => story.title).join(", ")}`,
    world_id: worldId,
    story_map_id: worldId,
    expected_revision: currentRevision,
    editor_url: sequenceUrl(origin, worldId, group.id, group.story_ids[0]!),
    parent: { world_id: worldId, editor_url: mapUrl(origin, worldId) },
    members: group.members.map(story => ({
      ...story, parent: { world_id: worldId, story_map_id: worldId }, editor_url: storyUrl(origin, story.id, worldId),
    })),
  };
}

async function readSequenceSet(worldId: string, origin: string, tx: QueryExecutor | typeof db = db) {
  await requireWorld(worldId, tx);
  const stories = await tx.select().from(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId))
    .orderBy(asc(wsStoriesTable.sortOrder), asc(wsStoriesTable.title), asc(wsStoriesTable.id));
  const currentRevision = await sequenceRevision(worldId, tx);
  const groups = chronologyGroups(stories).map((group, index) =>
    presentSequenceGroup(group, index, worldId, origin, currentRevision));
  const references = stories.filter(story => story.sequenceRole === "reference")
    .map(story => ({ ...story, editor_url: storyUrl(origin, story.id, worldId) }));
  return { world_id: worldId, sequences: groups, references, revision: currentRevision };
}

// Shared with the opt-in large-world benchmark so EXPLAIN measures the same
// grouping/counting SQL that serves search_sequences.
export const SEQUENCE_PAGE_SQL = `
    WITH members AS (
      SELECT s.*, CASE WHEN s.sort_order > 0 THEN s.sort_order::text ELSE 'story:' || s.id END AS group_key
      FROM ws_stories s WHERE s.world_id = $1 AND s.sequence_role <> 'reference'
    ), grouped AS (
      SELECT sort_order, group_key, min(title) AS first_title, min(id) AS first_id,
        array_agg(id ORDER BY id) AS story_ids,
        bool_or(strpos(lower(title || ' ' || coalesce(summary, '')), lower($2::text)) > 0) AS matches
      FROM members GROUP BY sort_order, group_key
    ), numbered AS (
      SELECT *, row_number() OVER (ORDER BY sort_order, first_title, first_id) AS position,
        'sequence_' || left(encode(sha256(convert_to(array_to_string(story_ids, E'\\n'), 'UTF8')), 'hex'), 24) AS id
      FROM grouped
    ), filtered AS (
      SELECT * FROM numbered WHERE $2::text IS NULL OR matches
    ), totals AS (
      SELECT count(*)::int AS total FROM filtered
    ), page AS (
      SELECT *, count(*) OVER () AS remaining FROM filtered
      WHERE $3::text IS NULL OR id > $3
      ORDER BY CASE WHEN $5::boolean THEN id END, CASE WHEN NOT $5::boolean THEN position END LIMIT $4
    )
    SELECT totals.total, page.id, page.position::int, page.story_ids,
      (SELECT count(*) FROM filtered WHERE ($3::text IS NULL OR id > $3)) > coalesce($4, totals.total) AS has_more
    FROM totals LEFT JOIN page ON true
`;

async function searchSequencePage(
  worldId: string, origin: string, query: string | undefined, afterId: string | undefined,
  limit: number | undefined, bounded: boolean,
) {
  await requireWorld(worldId);
  // Positive sort positions share a group; legacy zero/negative positions
  // remain separate. Number groups before filtering, as in readSequenceSet.
  const { rows } = await pool.query<{
    total: number; id: string | null; position: number | null; story_ids: string[] | null; has_more: boolean | null;
  }>(SEQUENCE_PAGE_SQL, [worldId, query ?? null, afterId ?? null, limit ?? null, bounded]);
  const total = rows[0]?.total ?? 0;
  const selected = rows.filter((row): row is typeof row & { id: string; position: number; story_ids: string[] } =>
    row.id !== null && row.position !== null && row.story_ids !== null);
  const ids = selected.flatMap(row => row.story_ids);
  const [stories, referenceRows, currentRevision] = await Promise.all([
    ids.length ? db.select().from(wsStoriesTable).where(and(eq(wsStoriesTable.worldId, worldId), inArray(wsStoriesTable.id, ids))) : Promise.resolve([] as StoryRow[]),
    db.select().from(wsStoriesTable).where(and(eq(wsStoriesTable.worldId, worldId), eq(wsStoriesTable.sequenceRole, "reference")))
      .orderBy(asc(wsStoriesTable.sortOrder), asc(wsStoriesTable.title), asc(wsStoriesTable.id)),
    sequenceRevision(worldId),
  ]);
  const byId = new Map(stories.map(story => [story.id, story]));
  const sequences = selected.map(row => {
    const members = row.story_ids.map(id => byId.get(id)!).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    return presentSequenceGroup({
      id: row.id, order: members[0]!.sortOrder, story_ids: row.story_ids, members,
    }, row.position - 1, worldId, origin, currentRevision);
  });
  const matches = (story: StoryRow) =>
    !query || `${story.title} ${story.summary ?? ""}`.toLowerCase().includes(query.toLowerCase());
  const references = referenceRows.filter(matches).map(story => ({
    ...story, editor_url: storyUrl(origin, story.id, worldId),
  }));
  const hasMore = rows[0]?.has_more ?? false;
  return {
    world_id: worldId, sequences, references, revision: currentRevision,
    total, references_total: references.length, layout_complete: false,
    has_more: hasMore, next_cursor: hasMore ? sequences[sequences.length - 1]!.id : null,
  };
}

function assertRevision(expected: string, current: string): void {
  if (expected !== current) throw new CanonToolError("Revision conflict: the view changed; fetch the latest revision and retry", 409, "REVISION_CONFLICT");
}

async function insertAudit(tx: QueryExecutor, userId: string, action: string, worldId: string, metadata: Record<string, unknown>) {
  await tx.insert(auditLogTable).values({
    actorUserId: userId, actorRole: "super_admin", scope: "platform", action,
    targetType: "worldsmith_world", targetId: worldId, metadata,
  });
}

async function lockWorldStories(tx: QueryExecutor, worldId: string): Promise<void> {
  await tx.select({ id: wsStoriesTable.id }).from(wsStoriesTable)
    .where(eq(wsStoriesTable.worldId, worldId)).for("update");
}

export async function executeViewTool(userId: string, name: string, args: unknown, origin: string): Promise<unknown> {
  await requireAdmin(userId);
  switch (name) {
    case "search_story_maps": {
      const input = parse(name, args);
      await requireWorld(input.world_id);
      const [map] = await db.select({ id: worldsmithWorldsTable.id, name: worldsmithWorldsTable.name })
        .from(worldsmithWorldsTable).where(and(
          eq(worldsmithWorldsTable.id, input.world_id),
          ...(input.query ? [or(ilike(worldsmithWorldsTable.name, `%${input.query}%`), ilike(worldsmithWorldsTable.id, `%${input.query}%`))!] : []),
        )).limit(1);
      const matches = map ? [{ id: map.id, world_id: map.id, name: map.name, editor_url: mapUrl(origin, map.id), revision: (await readMap(map.id, origin)).revision }] : [];
      const bounded = input.after_id !== undefined || input.limit !== undefined;
      const ordered = bounded ? matches.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : matches;
      const remaining = input.after_id === undefined ? ordered : ordered.filter(item => item.id > input.after_id!);
      const page = remaining.slice(0, input.limit ?? remaining.length);
      return {
        maps: page,
        total: matches.length,
        has_more: remaining.length > page.length,
        next_cursor: remaining.length > page.length ? page[page.length - 1]!.id : null,
      };
    }
    case "get_story_map": {
      const { map_id } = parse(name, args);
      // A Story Map is the existing world-level view; its ID is its world ID.
      return readMap(map_id, origin);
    }
    case "update_story_map": {
      const input = parse(name, args);
      return db.transaction(async tx => {
        const [world] = await tx.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
          .where(eq(worldsmithWorldsTable.id, input.map_id)).for("update").limit(1);
        if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
        await lockWorldStories(tx, input.map_id);
        const before = await readMap(input.map_id, origin, tx);
        assertRevision(input.expected_revision, before.revision);
        const removeIds = input.remove_link_ids ?? [];
        const addLinks = input.add_links ?? [];
        if (removeIds.length + addLinks.length > 160) {
          throw new CanonToolError("A Story Map update may change at most 160 links at a time", 400, "TOO_MANY_LINK_CHANGES");
        }
        const storyIds = new Set(before.stories.map(story => story.id));
        const addedRows: AuditLinkRow[] = [];
        const removedRows: AuditLinkRow[] = [];
        const changedStoriesBefore = new Map<string, { id: string; sortOrder: number }>();
        const changedStoriesAfter = new Map<string, { id: string; sortOrder: number }>();
        if (input.story_order) {
          const chronologicalIds = new Set(before.stories.filter(story => story.sequenceRole !== "reference").map(story => story.id));
          const seen = new Set<string>();
          for (const item of input.story_order) {
            if (!chronologicalIds.has(item.story_id)) throw new CanonToolError("Reference stories cannot be assigned a chronology position", 400, "INVALID_STORY");
            if (seen.has(item.story_id)) throw new CanonToolError("Every world story must appear exactly once in story_order", 400, "INVALID_STORY_ORDER");
            seen.add(item.story_id);
          }
          if (seen.size !== chronologicalIds.size || [...chronologicalIds].some(id => !seen.has(id))) {
            throw new CanonToolError("Every chronological story must appear exactly once in story_order", 400, "INVALID_STORY_ORDER");
          }
          const orders = [...new Set(input.story_order.map(item => item.order))].sort((a, b) => a - b);
          if (orders.some((order, index) => order !== index + 1)) {
            throw new CanonToolError("Story order groups must use contiguous positive order values starting at 1", 400, "INVALID_STORY_ORDER");
          }
          for (const item of input.story_order) {
            const previous = before.stories.find(story => story.id === item.story_id)!;
            const [updated] = await tx.update(wsStoriesTable).set({ sortOrder: item.order, updatedAt: new Date() })
              .where(and(eq(wsStoriesTable.id, item.story_id), eq(wsStoriesTable.worldId, input.map_id)))
              .returning({ id: wsStoriesTable.id, sortOrder: wsStoriesTable.sortOrder });
            if (updated && updated.sortOrder !== previous.sortOrder) {
              changedStoriesBefore.set(item.story_id, { id: item.story_id, sortOrder: previous.sortOrder });
              changedStoriesAfter.set(item.story_id, { id: item.story_id, sortOrder: updated.sortOrder });
            }
          }
          if (changedStoriesAfter.size) await tx.update(worldsmithWorldsTable)
            .set({ storySequenceRevision: sql`${worldsmithWorldsTable.storySequenceRevision} + 1` })
            .where(eq(worldsmithWorldsTable.id, input.map_id));
        }
        if (new Set(removeIds).size !== removeIds.length) throw new CanonToolError("remove_link_ids must not contain duplicates", 400, "INVALID_LINKS");
        if (removeIds.length) {
          const targets = await tx.select({
            id: wsCanonRecordStoryLinksTable.id, recordId: wsCanonRecordStoryLinksTable.canonRecordId,
            storyId: wsCanonRecordStoryLinksTable.storyId, actId: wsCanonRecordStoryLinksTable.actId,
          })
            .from(wsCanonRecordStoryLinksTable).where(inArray(wsCanonRecordStoryLinksTable.id, removeIds));
          if (targets.length !== removeIds.length || targets.some(link => !before.links.some(existing => existing.id === link.id))) {
            throw new CanonToolError("Every removed link must belong to this world map", 400, "INVALID_LINK");
          }
          const records = await tx.select().from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, targets.map(target => target.recordId)));
          const recordsById = new Map(records.map(record => [record.id, record]));
          const storyMap = new Map(before.stories.map(story => [story.id, story]));
          if (targets.some(link => recordsById.get(link.recordId)?.worldId !== input.map_id) ||
            targets.some(link => !storyMap.get(link.storyId)?.movements.some(movement => movement.id === link.actId) && link.actId !== null)) {
            throw new CanonToolError("Removed links must have a canon record, story, and optional movement in this world", 400, "INVALID_LINK");
          }
          removedRows.push(...targets.map(link => ({
            id: link.id, canonRecordId: link.recordId, storyId: link.storyId, actId: link.actId,
          })));
          await tx.delete(wsCanonRecordStoryLinksTable).where(inArray(wsCanonRecordStoryLinksTable.id, removeIds));
        }
        for (const link of addLinks) {
          if (!storyIds.has(link.story_id)) throw new CanonToolError("Linked story must belong to this world", 400, "INVALID_STORY");
          const [record] = await tx.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, link.canon_record_id)).limit(1);
          if (!record || record.worldId !== input.map_id) throw new CanonToolError("Linked canon record must belong to this world", 400, "INVALID_CANON_RECORD");
          if (link.act_id) {
            const [act] = await tx.select().from(wsStoryActsTable).where(and(
              eq(wsStoryActsTable.id, link.act_id), eq(wsStoryActsTable.storyId, link.story_id), eq(wsStoryActsTable.worldId, input.map_id),
            )).limit(1);
            if (!act) throw new CanonToolError("Linked movement must belong to the selected story and world", 400, "INVALID_MOVEMENT");
          }
          const [inserted] = await tx.insert(wsCanonRecordStoryLinksTable).values({
            id: randomUUID(), canonRecordId: link.canon_record_id, storyId: link.story_id, actId: link.act_id ?? null,
          }).onConflictDoNothing().returning({
            id: wsCanonRecordStoryLinksTable.id,
            canonRecordId: wsCanonRecordStoryLinksTable.canonRecordId,
            storyId: wsCanonRecordStoryLinksTable.storyId,
            actId: wsCanonRecordStoryLinksTable.actId,
          });
          if (inserted) addedRows.push(inserted);
        }
        const after = await readMap(input.map_id, origin, tx);
        await insertAudit(tx, userId, "worldsmith.story_map.update", input.map_id, {
          before_revision: before.revision, after_revision: after.revision,
          before_rows: {
            stories: [...changedStoriesBefore.values()],
            links: removedRows,
          },
          after_rows: {
            stories: [...changedStoriesAfter.values()],
            links: addedRows,
          },
        });
        return after;
      });
    }
    case "search_sequences": {
      const input = parse(name, args);
      if (input.query !== undefined || input.limit !== undefined || input.after_id !== undefined) {
        return searchSequencePage(input.world_id, origin, input.query, input.after_id, input.limit,
          input.limit !== undefined || input.after_id !== undefined);
      }
      const result = await readSequenceSet(input.world_id, origin);
      return {
        ...result,
        total: result.sequences.length,
        references_total: result.references.length,
        layout_complete: true,
        has_more: false,
        next_cursor: null,
      };
    }
    case "get_sequence": {
      const input = parse(name, args);
      const result = await readSequenceSet(input.world_id, origin);
      // The stable world anchor remains readable even when every story is a reference.
      if (input.sequence_id === input.world_id) return result;
      const sequence = result.sequences.find(group => group.id === input.sequence_id);
      if (!sequence) throw new CanonToolError("Sequence not found in this world (the ID may be stale)", 404, "SEQUENCE_NOT_FOUND");
      return { ...result, sequence };
    }
    case "update_sequence": {
      const input = parse(name, args);
      return db.transaction(async tx => {
        const [world] = await tx.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
          .where(eq(worldsmithWorldsTable.id, input.world_id)).for("update").limit(1);
        if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
        await lockWorldStories(tx, input.world_id);
        const before = await readSequenceSet(input.world_id, origin, tx);
        assertRevision(input.expected_revision, before.revision);
        const existingStories = [...before.sequences.flatMap(group => group.members), ...before.references];
        if (existingStories.length > 500) {
          throw new CanonToolError("A chronology update may include at most 500 stories so its audit record remains bounded", 400, "TOO_MANY_STORIES");
        }
        if (input.sequence_id !== input.world_id && !before.sequences.some(group => group.id === input.sequence_id)) {
          throw new CanonToolError("Sequence ID is stale or does not belong to this world", 409, "SEQUENCE_CONFLICT");
        }
        const currentIds = new Set((input.references === undefined ? before.sequences.flatMap(group => group.members) : existingStories).map(story => story.id));
        const suppliedIds = [...input.groups.flat(), ...(input.references ?? [])];
        if (new Set(suppliedIds).size !== suppliedIds.length || suppliedIds.length !== currentIds.size ||
          suppliedIds.some(id => !currentIds.has(id)) || (input.groups.length === 0 && input.references === undefined)) {
          throw new CanonToolError("Chronology groups must include every world story exactly once", 400, "INVALID_GROUPING");
        }
        const beforeById = new Map(existingStories.map(story => [story.id, story]));
        const changed: Array<{ id: string; sortOrder: number; sequenceRole: string }> = [];
        for (const [index, group] of input.groups.entries()) {
          const order = index + 1;
          for (const id of group) {
            await tx.update(wsStoriesTable).set({ sortOrder: order, sequenceRole: "chronological", updatedAt: new Date() })
              .where(and(eq(wsStoriesTable.id, id), eq(wsStoriesTable.worldId, input.world_id)));
            changed.push({ id, sortOrder: order, sequenceRole: "chronological" });
          }
        }
        // Reference order is intentionally retained, as on the admin Sequence board.
        for (const id of input.references ?? []) {
          const prior = beforeById.get(id)!;
          await tx.update(wsStoriesTable).set({ sequenceRole: "reference", updatedAt: new Date() })
            .where(and(eq(wsStoriesTable.id, id), eq(wsStoriesTable.worldId, input.world_id)));
          changed.push({ id, sortOrder: prior.sortOrder, sequenceRole: "reference" });
        }
        await tx.update(worldsmithWorldsTable)
          .set({ storySequenceRevision: sql`${worldsmithWorldsTable.storySequenceRevision} + 1` })
          .where(eq(worldsmithWorldsTable.id, input.world_id));
        const after = await readSequenceSet(input.world_id, origin, tx);
        const afterStories = [...after.sequences.flatMap(group => group.members), ...after.references];
        const afterById = new Map(afterStories.map(story => [story.id, story]));
        const changedIds = existingStories
          .filter(story => afterById.get(story.id)?.sortOrder !== story.sortOrder
            || afterById.get(story.id)?.sequenceRole !== story.sequenceRole)
          .map(story => story.id);
        await insertAudit(tx, userId, "worldsmith.sequence.update", input.world_id, {
          before_revision: before.revision, after_revision: after.revision,
          before_rows: {
            stories: changedIds.map(id => ({ id, sortOrder: beforeById.get(id)!.sortOrder, sequenceRole: beforeById.get(id)!.sequenceRole })),
          },
          after_rows: {
            stories: changedIds.map(id => ({ id, sortOrder: afterById.get(id)!.sortOrder, sequenceRole: afterById.get(id)!.sequenceRole })),
          },
        });
        return {
          ...after,
          changes: "Sequence IDs are derived from sorted member story IDs; a sequence ID changes when its membership changes.",
          updated_stories: changed,
        };
      });
    }
    default:
      throw new CanonToolError(`Unknown view tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
}
