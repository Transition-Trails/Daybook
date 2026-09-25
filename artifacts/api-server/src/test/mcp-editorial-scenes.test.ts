import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  auditLogTable,
  db,
  usersTable,
  worldsmithWorldsTable,
  wsCanonRecordsTable,
  wsScenesTable,
  wsSceneCanonLinksTable,
  wsStoryActsTable,
  wsStoriesTable,
  wsStorySceneDetailsTable,
} from "@workspace/db";
import { CanonToolError } from "../lib/worldsmith/mcp-canon";
import { executeSceneTool } from "../lib/worldsmith/mcp-editorial-scenes";

describe("editorial scene MCP tools", () => {
  it("searches, reads and safely partially updates a scene with same-world Canon links", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const suffix = randomUUID();
    const worldId = `mcp-scene-world-${suffix}`;
    const otherWorldId = `mcp-scene-other-world-${suffix}`;
    const storyId = `mcp-scene-story-${suffix}`;
    const movementId = `mcp-scene-movement-${suffix}`;
    const sceneId = `mcp-scene-${suffix}`;
    const legacySceneId = `mcp-scene-legacy-${suffix}`;
    const characterId = `mcp-scene-character-${suffix}`;
    const locationId = `mcp-scene-location-${suffix}`;
    const foreignCanonId = `mcp-scene-foreign-${suffix}`;

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Disposable scene world", code: `S${suffix.slice(0, 8)}` });
      await db.insert(worldsmithWorldsTable).values({ id: otherWorldId, name: "Disposable other world", code: `O${suffix.slice(0, 8)}` });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Disposable scene story", status: "draft" });
      await db.insert(wsStoryActsTable).values({
        id: movementId, worldId, storyId, actNumber: 1, title: "Opening movement",
      });
      await db.insert(wsCanonRecordsTable).values([
        { id: characterId, worldId, name: "Proposed character", canonType: "character", status: "proposed" },
        { id: locationId, worldId, name: "Proposed location", canonType: "location", status: "proposed" },
        { id: foreignCanonId, worldId: otherWorldId, name: "Foreign proposed character", canonType: "character", status: "proposed" },
      ]);
      await db.insert(wsScenesTable).values({
        id: sceneId, worldId, storyId, actId: movementId, sceneNumber: 1,
        title: "First scene", body: "<p>Opening</p>", attributes: { mood: "quiet" }, createdBy: user.id,
        primaryImageUrl: "https://images.example.test/original.png",
        primaryImagePrompt: "Original prompt",
        primaryImageMetadata: { source: "existing" },
      });
      await db.insert(wsScenesTable).values({
        id: legacySceneId, worldId, storyId, actId: movementId, sceneNumber: 2,
        title: "Legacy scene without canon links", body: "<p>Legacy</p>", createdBy: user.id,
      });
      await db.insert(wsSceneCanonLinksTable).values([
        { sceneId, canonRecordId: characterId, role: "character", sortOrder: 0 },
      ]);

      const search = await executeSceneTool(user.id, "search_scenes", { world_id: worldId, query: "First" }, "https://example.test");
      expect(search).toMatchObject({ scenes: [{ id: sceneId, storyline_id: storyId, movement_id: movementId }] });
      expect((search as { scenes: unknown[] }).scenes).toHaveLength(1);

      const initial = await executeSceneTool(user.id, "get_scene", { scene_id: sceneId }, "https://example.test") as {
        record: typeof wsScenesTable.$inferSelect;
        scene_details: unknown;
        canon_records: Array<{ id: string; status: string; canonType: string | null }>;
        canon_links: Array<{ canon_record_id: string; role: string; sort_order: number }>;
        editor_url: string;
        parent: { storyline: { id: string }; movement: { id: string } };
        revision: string;
      };
      expect(initial.record.title).toBe("First scene");
      expect(initial.scene_details).toBeNull();
      expect(initial.canon_records).toEqual([
        expect.objectContaining({ id: characterId, status: "proposed", canonType: "character" }),
      ]);
      expect(initial.canon_links).toEqual([{ canon_record_id: characterId, role: "character", sort_order: 0, canon_record: expect.any(Object) }]);
      expect(initial.parent).toMatchObject({ storyline: { id: storyId }, movement: { id: movementId } });
      expect(new URL(initial.editor_url).searchParams.get("scene_id")).toBe(sceneId);
      expect(initial.record.primaryImageUrl).toBe("https://images.example.test/original.png");

      const legacyRead = await executeSceneTool(user.id, "get_scene", { scene_id: legacySceneId }, "https://example.test") as {
        canon_links: unknown[];
      };
      expect(legacyRead.canon_links).toEqual([]);
      const firstPage = await executeSceneTool(user.id, "search_scenes", {
        world_id: worldId, limit: 1,
      }, "https://example.test") as {
        scenes: Array<{ id: string }>; total: number; has_more: boolean; next_cursor: string | null;
      };
      expect(firstPage.scenes).toHaveLength(1);
      expect(firstPage.total).toBe(2);
      expect(firstPage.has_more).toBe(true);
      expect(firstPage.next_cursor).toBe(firstPage.scenes[0].id);
      const secondPage = await executeSceneTool(user.id, "search_scenes", {
        world_id: worldId, limit: 1, after_id: firstPage.next_cursor!,
      }, "https://example.test") as typeof firstPage;
      expect(secondPage.scenes).toHaveLength(1);
      expect(secondPage.total).toBe(2);
      expect(secondPage.has_more).toBe(false);
      expect(secondPage.scenes[0].id).not.toBe(firstPage.scenes[0].id);

      const edited = await executeSceneTool(user.id, "update_scene", {
        scene_id: sceneId,
        expected_revision: initial.revision,
        changes: {
          title: "Revised scene",
          body: "<p>Revised<script>alert(1)</script> prose</p>",
          purpose: "Establish the setting",
          details: { time_of_day: "dawn", immediate_goal: "Find the station" },
          canon_record_ids: [characterId, locationId],
        },
      }, "https://example.test") as {
        record: typeof wsScenesTable.$inferSelect;
        scene_details: typeof wsStorySceneDetailsTable.$inferSelect;
        canon_records: Array<{ id: string; status: string }>;
        revision: string;
      };
      expect(edited.record.title).toBe("Revised scene");
      expect(edited.record.body).toBe("<p>Revised prose</p>");
      expect(edited.record.primaryImageUrl).toBe("https://images.example.test/original.png");
      expect(edited.record.primaryImagePrompt).toBe("Original prompt");
      expect(edited.record.primaryImageMetadata).toEqual({ source: "existing" });
      expect(edited.scene_details).toMatchObject({
        purpose: "Establish the setting",
        details: { time_of_day: "dawn", immediate_goal: "Find the station" },
      });
      expect(edited.canon_records.map(record => record.id)).toEqual([characterId, locationId]);
      expect(edited.canon_records.every(record => record.status === "proposed")).toBe(true);
      expect(edited.revision).not.toBe(initial.revision);

      const imageEdited = await executeSceneTool(user.id, "update_scene", {
        scene_id: sceneId,
        expected_revision: edited.revision,
        changes: {
          primary_image_url: "https://images.example.test/updated.png",
          primary_image_prompt: "A safe revised image direction",
          primary_image_metadata: { source: "editor", approved: true },
        },
      }, "https://example.test") as { record: typeof wsScenesTable.$inferSelect; revision: string };
      expect(imageEdited.record.primaryImageUrl).toBe("https://images.example.test/updated.png");
      expect(imageEdited.record.primaryImagePrompt).toBe("A safe revised image direction");
      expect(imageEdited.record.primaryImageMetadata).toEqual({ source: "editor", approved: true });
      await expect(executeSceneTool(user.id, "update_scene", {
        scene_id: sceneId, expected_revision: imageEdited.revision,
        changes: { primary_image_url: "javascript:alert(1)" },
      }, "https://example.test")).rejects.toMatchObject({ status: 400, code: "INVALID_ARGUMENTS" });

      const persistedLinks = await db.select().from(wsSceneCanonLinksTable)
        .where(eq(wsSceneCanonLinksTable.sceneId, sceneId));
      expect(persistedLinks.map(link => link.canonRecordId).sort()).toEqual([characterId, locationId].sort());
      const stale = await executeSceneTool(user.id, "update_scene", {
        scene_id: sceneId, expected_revision: initial.revision, changes: { title: "Lost update" },
      }, "https://example.test").catch(error => error);
      expect(stale).toBeInstanceOf(CanonToolError);
      expect(stale).toMatchObject({ status: 409, code: "REVISION_CONFLICT" });

      const [sceneAfterConflict] = await db.select().from(wsScenesTable).where(eq(wsScenesTable.id, sceneId));
      expect(sceneAfterConflict.title).toBe("Revised scene");
      const audits = await db.select().from(auditLogTable).where(eq(auditLogTable.targetId, sceneId));
      expect(audits).toHaveLength(2);
      expect(audits.some(audit => {
        const metadata = audit.metadata as { actor_user_id?: string; before_after?: Record<string, unknown> };
        return metadata.actor_user_id === user.id
          && (metadata.before_after?.title as { before?: string; after?: string } | undefined)?.before === "First scene"
          && (metadata.before_after?.title as { before?: string; after?: string } | undefined)?.after === "Revised scene";
      })).toBe(true);

      await expect(executeSceneTool(user.id, "update_scene", {
        scene_id: sceneId, expected_revision: imageEdited.revision, changes: { canon_record_ids: [locationId] },
      }, "https://example.test")).rejects.toMatchObject({ status: 400, code: "INVALID_CANON_LINK" });
      await expect(executeSceneTool(user.id, "update_scene", {
        scene_id: sceneId, expected_revision: imageEdited.revision, changes: { canon_record_ids: [`missing-${suffix}`] },
      }, "https://example.test")).rejects.toMatchObject({ status: 400, code: "INVALID_CANON_LINK" });
      await expect(executeSceneTool(user.id, "update_scene", {
        scene_id: sceneId, expected_revision: imageEdited.revision,
        changes: { canon_record_ids: [characterId, foreignCanonId] },
      }, "https://example.test")).rejects.toMatchObject({ status: 400, code: "INVALID_CANON_LINK" });
    } finally {
      await db.delete(auditLogTable).where(eq(auditLogTable.targetId, sceneId));
      await db.delete(wsSceneCanonLinksTable).where(eq(wsSceneCanonLinksTable.sceneId, sceneId));
      await db.delete(wsStorySceneDetailsTable).where(eq(wsStorySceneDetailsTable.sceneId, sceneId));
      await db.delete(wsScenesTable).where(eq(wsScenesTable.id, sceneId));
      await db.delete(wsScenesTable).where(eq(wsScenesTable.id, legacySceneId));
      await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.id, movementId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, [characterId, locationId, foreignCanonId]));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, otherWorldId));
    }
  });

  it("requires a current super-admin for every tool call", async () => {
    await expect(executeSceneTool("__missing__", "search_scenes", { world_id: "none" }, "https://example.test"))
      .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });
});