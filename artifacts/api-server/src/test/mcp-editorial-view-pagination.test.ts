import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, usersTable, worldsmithWorldsTable, wsStoriesTable } from "@workspace/db";
import { executeViewTool } from "../lib/worldsmith/mcp-editorial-views";

describe("editorial view search pagination", () => {
  it("paginates sequence groups by stable ID and reports complete result metadata", async () => {
    const [admin] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!admin) throw new Error("A seeded development super-admin is required");

    const worldId = `view-page-${randomUUID()}`;
    const worldCode = `VP${randomUUID().slice(0, 6)}`;
    const storyIds = [randomUUID(), randomUUID(), randomUUID()];
    try {
      await db.insert(worldsmithWorldsTable).values({
        id: worldId, name: "View pagination test world", code: worldCode,
      });
      await db.insert(wsStoriesTable).values(storyIds.map((id, index) => ({
        id, worldId, title: `Pagination story ${index + 1}`, status: "draft", sortOrder: index + 1,
      })));

      const allSequences = await executeViewTool(admin.id, "search_sequences", { world_id: worldId }, "https://example.test") as {
        sequences: Array<{ id: string }>; total: number; has_more: boolean; next_cursor: string | null;
      };
      expect(allSequences.sequences).toHaveLength(3);
      expect(allSequences.total).toBe(3);
      expect(allSequences.has_more).toBe(false);
      expect(allSequences.next_cursor).toBeNull();

      const firstPage = await executeViewTool(admin.id, "search_sequences", {
        world_id: worldId, limit: 2,
      }, "https://example.test") as typeof allSequences;
      const stableOrder = [...allSequences.sequences].map(sequence => sequence.id).sort();
      expect(firstPage.sequences.map(sequence => sequence.id)).toEqual(stableOrder.slice(0, 2));
      expect(firstPage.total).toBe(3);
      expect(firstPage.has_more).toBe(true);
      expect(firstPage.next_cursor).toBe(firstPage.sequences[1]!.id);

      const secondPage = await executeViewTool(admin.id, "search_sequences", {
        world_id: worldId, after_id: firstPage.next_cursor!, limit: 2,
      }, "https://example.test") as typeof allSequences;
      expect(secondPage.sequences.map(sequence => sequence.id)).toEqual(stableOrder.slice(2));
      expect(secondPage.total).toBe(3);
      expect(secondPage.has_more).toBe(false);
      expect(secondPage.next_cursor).toBeNull();

      const mapSearch = await executeViewTool(admin.id, "search_story_maps", {
        world_id: worldId, limit: 1,
      }, "https://example.test") as {
        maps: Array<{ id: string }>; total: number; has_more: boolean; next_cursor: string | null;
      };
      expect(mapSearch.maps.map(map => map.id)).toEqual([worldId]);
      expect(mapSearch.total).toBe(1);
      expect(mapSearch.has_more).toBe(false);
      expect(mapSearch.next_cursor).toBeNull();

      await expect(executeViewTool(admin.id, "search_sequences", {
        world_id: worldId, limit: 101,
      }, "https://example.test")).rejects.toThrow(/Invalid tool arguments/);
    } finally {
      await db.delete(wsStoriesTable).where(inArray(wsStoriesTable.id, storyIds));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
    }
  });
});