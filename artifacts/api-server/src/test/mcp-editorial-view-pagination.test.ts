import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, usersTable, worldsmithWorldsTable, wsStoriesTable } from "@workspace/db";
import { executeViewTool } from "../lib/worldsmith/mcp-editorial-views";

describe("editorial view search pagination", () => {
  it("finds matching cross-era references without returning unrelated references, while preserving a complete write read", async () => {
    const [admin] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!admin) throw new Error("A seeded development super-admin is required");

    const worldId = `view-reference-${randomUUID()}`;
    const worldCode = `VR${randomUUID().slice(0, 6)}`;
    const storyIds = Array.from({ length: 5 }, () => randomUUID());
    const origin = "https://example.test";
    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Cross-era search world", code: worldCode });
      await db.insert(wsStoriesTable).values([
        { id: storyIds[0]!, worldId, title: "Wandering Lantern", status: "draft", sortOrder: 1 },
        { id: storyIds[1]!, worldId, title: "Unrelated chronology", status: "draft", sortOrder: 2 },
        { id: storyIds[2]!, worldId, title: "The LANTERN across eras", status: "draft", sortOrder: 3, sequenceRole: "reference" },
        { id: storyIds[3]!, worldId, title: "A distant echo", summary: "Tracks the lantern through time", status: "draft", sortOrder: 4, sequenceRole: "reference" },
        { id: storyIds[4]!, worldId, title: "Unrelated reference", status: "draft", sortOrder: 5, sequenceRole: "reference" },
      ]);

      const searched = await executeViewTool(admin.id, "search_sequences", {
        world_id: worldId, query: "LaNtErN", limit: 1,
      }, origin) as {
        sequences: Array<{ story_ids: string[] }>; references: Array<{ id: string }>;
        total: number; references_total: number; layout_complete: boolean; revision: string;
      };
      expect(searched.sequences.map(group => group.story_ids)).toEqual([[storyIds[0]]]);
      expect(searched.references.map(story => story.id)).toEqual([storyIds[2], storyIds[3]]);
      expect(searched.total).toBe(1);
      expect(searched.references_total).toBe(2);
      expect(searched.layout_complete).toBe(false);

      const referenceOnly = await executeViewTool(admin.id, "search_sequences", {
        world_id: worldId, query: "distant",
      }, origin) as typeof searched;
      expect(referenceOnly.sequences).toEqual([]);
      expect(referenceOnly.references.map(story => story.id)).toEqual([storyIds[3]]);
      expect(referenceOnly.total).toBe(0);
      expect(referenceOnly.references_total).toBe(1);

      const full = await executeViewTool(admin.id, "get_sequence", { world_id: worldId, sequence_id: worldId }, origin) as {
        sequences: Array<{ story_ids: string[] }>; references: Array<{ id: string }>; revision: string;
      };
      expect(full.sequences.flatMap(group => group.story_ids)).toEqual(storyIds.slice(0, 2));
      expect(full.references.map(story => story.id)).toEqual(storyIds.slice(2));
      expect(full.revision).toBe(searched.revision);

      const unfiltered = await executeViewTool(admin.id, "search_sequences", { world_id: worldId }, origin) as typeof searched;
      expect(unfiltered.references.map(story => story.id)).toEqual(storyIds.slice(2));
      expect(unfiltered.layout_complete).toBe(true);
    } finally {
      await db.delete(wsStoriesTable).where(inArray(wsStoriesTable.id, storyIds));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
    }
  });

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
        sequences: Array<{ id: string }>; total: number; has_more: boolean; next_cursor: string | null; revision: string;
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
        world_id: worldId, after_id: firstPage.next_cursor!, expected_revision: firstPage.revision, limit: 2,
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