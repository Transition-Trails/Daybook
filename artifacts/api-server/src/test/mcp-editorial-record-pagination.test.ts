import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  db, usersTable, worldsmithWorldsTable, wsStoriesTable, wsStoryActsTable,
} from "@workspace/db";
import { executeRecordTool } from "../lib/worldsmith/mcp-editorial-records.js";

const nonce = randomUUID();
const worldIds = Array.from({ length: 101 }, (_, index) =>
  `editorial-page-world-${nonce}-${String(index).padStart(3, "0")}`);
const storyIds = Array.from({ length: 101 }, (_, index) =>
  `editorial-page-story-${nonce}-${String(index).padStart(3, "0")}`);
const movementIds = Array.from({ length: 101 }, (_, index) =>
  `editorial-page-movement-${nonce}-${String(index).padStart(3, "0")}`);

let adminId: string;

beforeAll(async () => {
  const [admin] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.platformRole, "super_admin")).limit(1);
  if (!admin) throw new Error("Editorial pagination integration test needs a seeded super-admin user");
  adminId = admin.id;

  await db.insert(worldsmithWorldsTable).values(worldIds.map((id, index) => ({
    id,
    name: `Editorial pagination ${nonce} world ${index}`,
    code: `P${nonce.slice(0, 2)}${index}`,
  })));
  await db.insert(wsStoriesTable).values(storyIds.map((id, index) => ({
    id,
    worldId: worldIds[0],
    title: `Editorial pagination ${nonce} storyline ${index}`,
  })));
  await db.insert(wsStoryActsTable).values(movementIds.map((id, index) => ({
    id,
    storyId: storyIds[0],
    worldId: worldIds[0],
    title: `Editorial pagination ${nonce} movement ${index}`,
  })));
});

afterAll(async () => {
  await db.delete(wsStoryActsTable).where(inArray(wsStoryActsTable.id, movementIds));
  await db.delete(wsStoriesTable).where(inArray(wsStoriesTable.id, storyIds));
  await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, worldIds));
});

describe("editorial record search pagination", () => {
  it("provides complete stable ID-cursor discovery for worlds, storylines, and movements", async () => {
    const origin = "https://editor.example";
    const searches = [
      {
        tool: "search_worlds",
        baseArgs: { query: nonce },
        property: "worlds",
        ids: worldIds,
        expectedLegacy: { name: `Editorial pagination ${nonce} world 0` },
      },
      {
        tool: "search_storylines",
        baseArgs: { world_id: worldIds[0], query: nonce },
        property: "storylines",
        ids: storyIds,
        expectedLegacy: { name: `Editorial pagination ${nonce} storyline 0`, world_id: worldIds[0] },
      },
      {
        tool: "search_movements",
        baseArgs: { storyline_id: storyIds[0], query: nonce },
        property: "movements",
        ids: movementIds,
        expectedLegacy: { name: `Editorial pagination ${nonce} movement 0`, storyline_id: storyIds[0] },
      },
    ] as const;

    for (const search of searches) {
      const first = await executeRecordTool(adminId, search.tool, search.baseArgs, origin) as Record<string, any>;
      expect(first[search.property]).toHaveLength(100);
      expect(first[search.property][0]).toMatchObject({ id: search.ids[0], ...search.expectedLegacy });
      expect(first[search.property].every((row: { revision: string; editor_url: string }) =>
        Boolean(row.revision && row.editor_url))).toBe(true);
      expect(first.total).toBe(101);
      expect(first.has_more).toBe(true);
      expect(first.next_cursor).toBe(search.ids[99]);

      const second = await executeRecordTool(adminId, search.tool, {
        ...search.baseArgs, after_id: first.next_cursor,
      }, origin) as Record<string, any>;
      expect(second[search.property].map((row: { id: string }) => row.id)).toEqual([search.ids[100]]);
      expect(second.total).toBe(101);
      expect(second.has_more).toBe(false);
      expect(second.next_cursor).toBeNull();
    }
  });

  it("honors a bounded page size and rejects out-of-range limits", async () => {
    const first = await executeRecordTool(adminId, "search_worlds", {
      query: nonce, limit: 2,
    }, "https://editor.example") as { worlds: Array<{ id: string }>; total: number; has_more: boolean; next_cursor: string | null };
    expect(first.worlds.map(row => row.id)).toEqual(worldIds.slice(0, 2));
    expect(first.total).toBe(101);
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBe(worldIds[1]);

    await expect(executeRecordTool(adminId, "search_worlds", {
      query: nonce, limit: 0,
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
    await expect(executeRecordTool(adminId, "search_worlds", {
      query: nonce, limit: 101,
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_ARGUMENTS" });
  });
});