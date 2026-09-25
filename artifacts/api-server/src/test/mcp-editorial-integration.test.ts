import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { and, eq, inArray } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  db, usersTable, worldsmithWorldsTable, wsStoriesTable, wsStoryActsTable,
  wsCanonRecordsTable, wsCanonRecordStoryLinksTable, auditLogTable,
  mcpOAuthClientsTable, mcpOAuthTokensTable,
} from "@workspace/db";
import { getMcpResource } from "../lib/mcp-oauth";
import mcpRouter from "../routes/mcp";

describe("authenticated editorial MCP tools", () => {
  it("discovers the hierarchy, validates and audits reversible edits on disposable records", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const worldId = `mcp-world-${randomUUID()}`;
    const storyId = `mcp-story-${randomUUID()}`;
    const secondStoryId = `mcp-story-${randomUUID()}`;
    const movementId = `mcp-movement-${randomUUID()}`;
    const canonId = `mcp-canon-${randomUUID()}`;
    const clientId = `mcp-client-${randomUUID()}`;
    const readToken = randomBytes(32).toString("base64url");
    const writeToken = randomBytes(32).toString("base64url");
    const canonOnlyToken = randomBytes(32).toString("base64url");
    const editorialOnlyToken = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const rpc = (token: string, method: string, params: Record<string, unknown> = {}) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const call = (token: string, name: string, args: Record<string, unknown>) =>
      rpc(token, "tools/call", { name, arguments: args });
    const result = async (name: string, args: Record<string, unknown>) =>
      (await call(writeToken, name, args)).body.result.structuredContent;

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "MCP Test World", code: "MTW" });
      await db.insert(wsStoriesTable).values([
        { id: storyId, worldId, title: "Test Story One", sortOrder: 1, status: "draft" },
        { id: secondStoryId, worldId, title: "Test Story Two", sortOrder: 2, status: "draft" },
      ]);
      await db.insert(wsStoryActsTable).values({
        id: movementId, worldId, storyId, title: "Test Movement", actNumber: 1,
      });
      await db.insert(wsCanonRecordsTable).values({
        id: canonId, worldId, name: "Disposable proposed character", canonType: "character", status: "proposed",
      });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Disposable editorial MCP test", redirectUris: ["https://example.com/cb"],
      });
      for (const [token, scopes] of [
        [readToken, ["worldsmith:canon:read", "worldsmith:editorial:read"]],
        [writeToken, ["worldsmith:canon:read", "worldsmith:canon:write", "worldsmith:editorial:read", "worldsmith:editorial:write"]],
        [canonOnlyToken, ["worldsmith:canon:read", "worldsmith:canon:write"]],
        [editorialOnlyToken, ["worldsmith:editorial:read"]],
      ] as const) {
        await db.insert(mcpOAuthTokensTable).values({
          tokenHash: createHash("sha256").update(token).digest("hex"),
          kind: "access", familyId: randomUUID(), clientId, userId: user.id,
          resource: getMcpResource(), scopes: [...scopes], expiresAt: new Date(Date.now() + 60_000),
        });
      }

      const discovery = await rpc(readToken, "tools/list");
      expect(discovery.status).toBe(200);
      const names = discovery.body.result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toEqual(expect.arrayContaining([
        "search_canon_records", "get_canon_record", "get_canon_field_options", "update_canon_record", "get_record_change_history",
        "search_worlds", "get_world", "update_world",
        "search_story_maps", "get_story_map", "update_story_map",
        "search_storylines", "get_storyline", "update_storyline",
        "search_movements", "get_movement", "update_movement",
        "search_sequences", "get_sequence", "update_sequence",
      ]));
      const canonOnly = await rpc(canonOnlyToken, "tools/list");
      expect(canonOnly.body.result.tools.map((tool: { name: string }) => tool.name)).toHaveLength(5);
      expect((await call(canonOnlyToken, "get_world", { world_id: worldId })).status).toBe(403);
      const editorialOnly = await rpc(editorialOnlyToken, "tools/list");
      expect(editorialOnly.body.result.tools.map((tool: { name: string }) => tool.name))
        .not.toContain("get_canon_record");
      expect((await call(editorialOnlyToken, "get_canon_record", { record_id: canonId })).status).toBe(403);
      expect((await call(editorialOnlyToken, "get_world", { world_id: worldId })).status).toBe(200);
      const worlds = await result("search_worlds", { query: "MCP Test World" });
      expect(worlds.worlds).toEqual(expect.arrayContaining([expect.objectContaining({
        id: worldId, name: "MCP Test World", editor_url: expect.stringContaining("/editorial/bible"),
      })]));
      const world = await result("get_world", { world_id: worldId });
      expect(world.record.id).toBe(worldId);
      expect(typeof world.revision).toBe("string");
      const denied = await call(readToken, "update_world", {
        world_id: worldId, expected_revision: world.revision, changes: { description: "temporary" },
      });
      expect(denied.status).toBe(403);
      const editedWorld = await result("update_world", {
        world_id: worldId, expected_revision: world.revision, changes: { description: "temporary" },
      });
      expect(editedWorld.record.description).toBe("temporary");
      expect(editedWorld.record.status).toBe("in_setup");
      const stale = await call(writeToken, "update_world", {
        world_id: worldId, expected_revision: world.revision, changes: { description: "overwritten" },
      });
      expect(stale.body.result.isError).toBe(true);
      expect(stale.body.result.content[0].text).toContain("REVISION_CONFLICT");
      const invalid = await call(writeToken, "update_world", {
        world_id: worldId, expected_revision: editedWorld.revision, changes: { status: "active" },
      });
      expect(invalid.body.result.isError).toBe(true);
      expect(invalid.body.result.content[0].text).toContain("INVALID_ARGUMENTS");

      const maps = await result("search_story_maps", { world_id: worldId });
      expect(maps.maps[0]).toEqual(expect.objectContaining({
        id: worldId, editor_url: expect.stringContaining("/editorial/connections"),
      }));
      const map = await result("get_story_map", { map_id: worldId });
      expect(map.stories).toHaveLength(2);
      const storylines = await result("search_storylines", { world_id: worldId, query: "Story One" });
      expect(storylines.storylines[0]).toEqual(expect.objectContaining({ id: storyId, world_id: worldId }));
      const storyline = await result("get_storyline", { storyline_id: storyId });
      expect(storyline.movements).toEqual(expect.arrayContaining([expect.objectContaining({ id: movementId })]));
      expect(storyline.story_beats).toEqual([]);
      expect(storyline.reveal_threads).toEqual([]);
      const editedStory = await result("update_storyline", {
        storyline_id: storyId, expected_revision: storyline.revision, changes: { summary: "Temporary summary" },
      });
      expect(editedStory.record.summary).toBe("Temporary summary");
      expect(editedStory.record.status).toBe("draft");
      const movements = await result("search_movements", { storyline_id: storyId });
      expect(movements.movements[0]).toEqual(expect.objectContaining({
        id: movementId, storyline_id: storyId, world_id: worldId,
      }));
      const movement = await result("get_movement", { movement_id: movementId });
      expect(movement.scenes).toEqual([]);
      const editedMovement = await result("update_movement", {
        movement_id: movementId, expected_revision: movement.revision, changes: { tagline: "Temporary purpose" },
      });
      expect(editedMovement.record.tagline).toBe("Temporary purpose");
      expect(editedMovement.record.storyId).toBe(storyId);

      const currentMap = await result("get_story_map", { map_id: worldId });
      const wrongParent = await call(writeToken, "update_story_map", {
        map_id: worldId, expected_revision: currentMap.revision,
        add_links: [{ canon_record_id: canonId, story_id: secondStoryId, act_id: movementId }],
      });
      expect(wrongParent.body.result.isError).toBe(true);
      expect(wrongParent.body.result.content[0].text).toContain("INVALID_MOVEMENT");
      const linkedMap = await result("update_story_map", {
        map_id: worldId, expected_revision: currentMap.revision,
        add_links: [{ canon_record_id: canonId, story_id: storyId, act_id: movementId }],
      });
      expect(linkedMap.links).toEqual(expect.arrayContaining([expect.objectContaining({
        canonRecordId: canonId, storyId, actId: movementId,
      })]));

      const sequences = await result("search_sequences", { world_id: worldId });
      expect(sequences.sequences).toHaveLength(2);
      expect(sequences.sequences[0]).toEqual(expect.objectContaining({
        world_id: worldId, story_map_id: worldId,
        name: expect.any(String), editor_url: expect.stringContaining("story_id="),
      }));
      const selectedId = sequences.sequences[0].id;
      const sequence = await result("get_sequence", { sequence_id: selectedId });
      expect(sequence.sequence.id).toBe(selectedId);
      const reordered = await result("update_sequence", {
        world_id: worldId, sequence_id: selectedId, expected_revision: sequences.revision,
        groups: [[secondStoryId], [storyId]],
      });
      expect(reordered.sequences[0].story_ids).toEqual([secondStoryId]);
      const sequenceStale = await call(writeToken, "update_sequence", {
        world_id: worldId, sequence_id: selectedId, expected_revision: sequences.revision,
        groups: [[storyId], [secondStoryId]],
      });
      expect(sequenceStale.body.result.isError).toBe(true);
      expect(sequenceStale.body.result.content[0].text).toContain("REVISION_CONFLICT");
      const audits = await db.select().from(auditLogTable)
        .where(and(eq(auditLogTable.actorUserId, user.id),
          inArray(auditLogTable.targetId, [worldId, storyId, movementId])));
      expect(audits.filter(entry => entry.action.startsWith("worldsmith."))).toHaveLength(5);
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [worldId, storyId, movementId]));
      await db.delete(wsCanonRecordStoryLinksTable).where(eq(wsCanonRecordStoryLinksTable.canonRecordId, canonId));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, canonId));
      await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.id, movementId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });
});