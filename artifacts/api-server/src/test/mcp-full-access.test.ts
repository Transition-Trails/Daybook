import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  auditLogTable, db, mcpCanonHistoryTable, mcpOAuthClientsTable, mcpOAuthTokensTable,
  usersTable, worldsmithWorldsTable, wsCanonRecordsTable, wsSceneCanonLinksTable,
  wsScenesTable, wsStoriesTable, wsStoryActsTable,
} from "@workspace/db";
import { getMcpResource } from "../lib/mcp-oauth";
import mcpRouter from "../routes/mcp";

describe("full editorial MCP grant and discovery", () => {
  it("lists and uses all tools with explicit scopes while old grants stay Canon-only", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const suffix = randomUUID();
    const worldId = `mcp-full-world-${suffix}`;
    const storyId = `mcp-full-story-${suffix}`;
    const movementId = `mcp-full-movement-${suffix}`;
    const sceneId = `mcp-full-scene-${suffix}`;
    const characterId = `mcp-full-character-${suffix}`;
    const locationId = `mcp-full-location-${suffix}`;
    const clientId = `mcp-full-client-${suffix}`;
    const fullToken = randomBytes(32).toString("base64url");
    const oldToken = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const rpc = (token: string, method: string, params: Record<string, unknown> = {}) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const call = (token: string, name: string, args: Record<string, unknown>) =>
      rpc(token, "tools/call", { name, arguments: args });

    try {
      await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "MCP Full Access World", code: "MFA" });
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Full Access Storyline", status: "draft" });
      await db.insert(wsStoryActsTable).values({
        id: movementId, worldId, storyId, title: "Full Access Movement", actNumber: 1,
      });
      await db.insert(wsCanonRecordsTable).values([
        { id: characterId, worldId, name: "Disposable Character", canonType: "character", status: "proposed" },
        { id: locationId, worldId, name: "Disposable Location", canonType: "location", status: "proposed" },
      ]);
      await db.insert(wsScenesTable).values({
        id: sceneId, worldId, storyId, actId: movementId, sceneNumber: 1,
        title: "Full Access Scene", body: "Before", createdBy: user.id,
      });
      await db.insert(wsSceneCanonLinksTable).values({
        sceneId, canonRecordId: characterId, role: "character", sortOrder: 0,
      });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Disposable full access test", redirectUris: ["https://example.com/callback"],
      });
      for (const [token, scopes] of [
        [oldToken, ["worldsmith:canon:read", "worldsmith:canon:write"]],
        [fullToken, [
          "worldsmith:canon:read", "worldsmith:canon:write",
          "worldsmith:canon:editorial:write", "worldsmith:editorial:read",
          "worldsmith:editorial:write", "worldsmith:editorial:story-details:write",
          "worldsmith:editorial:scenes:read", "worldsmith:editorial:scenes:write",
        ]],
      ] as const) {
        await db.insert(mcpOAuthTokensTable).values({
          tokenHash: createHash("sha256").update(token).digest("hex"), kind: "access",
          familyId: randomUUID(), clientId, userId: user.id, resource: getMcpResource(),
          scopes: [...scopes], expiresAt: new Date(Date.now() + 60_000),
        });
      }

      const oldList = await rpc(oldToken, "tools/list");
      expect(oldList.status).toBe(200);
      expect(oldList.body.result.tools.map((tool: { name: string }) => tool.name)).toHaveLength(5);
      expect((await call(oldToken, "get_scene", { scene_id: sceneId })).status).toBe(403);
      expect((await call(oldToken, "update_canon_editorial_fields", {
        record_id: locationId, expected_version: 1, changes: { notes: "Cannot write" },
      })).status).toBe(403);

      const fullList = await rpc(fullToken, "tools/list");
      expect(fullList.status).toBe(200);
      const names = fullList.body.result.tools.map((tool: { name: string }) => tool.name);
      expect(names).toHaveLength(33);
      expect(new Set(names).size).toBe(names.length);
      expect(names).toEqual(expect.arrayContaining([
        "search_canon_records", "get_canon_record", "get_canon_field_options", "update_canon_record", "update_canon_editorial_fields",
        "replace_character_knowledge", "replace_character_variants", "replace_character_identity_locks",
        "search_worlds", "get_world", "get_world_creative_context", "update_world",
        "search_story_maps", "get_story_map", "update_story_map",
        "search_storylines", "get_storyline", "update_storyline",
        "search_movements", "get_movement", "update_movement",
        "search_sequences", "get_sequence", "update_sequence",
        "get_story_beat", "update_story_beat", "get_reveal_thread", "update_reveal_thread",
        "search_scenes", "get_scene", "update_scene",
      ]));
      const worlds = await call(fullToken, "search_worlds", { query: "MCP Full Access" });
      expect(worlds.body.result.structuredContent.worlds[0].id).toBe(worldId);
      const creativeBefore = await call(fullToken, "get_world_creative_context", { world_id: worldId });
      const creativeContextKeys = [
        "world_id", "name", "worldPremise", "centralDramaticQuestion", "coreThemes",
        "narrativePillars", "historicalEras", "currentWorldState", "narrativeGravity",
        "conflictGrammar", "discoveryRules", "storyGuardrails", "continuityAnchors",
        "openQuestions", "worldRules", "proseVoice", "visualPalette", "atmosphericNotes",
        "materialWorld", "imageDirection", "visualGuardrails", "revision",
      ];
      expect(Object.keys(creativeBefore.body.result.structuredContent).sort())
        .toEqual([...creativeContextKeys].sort());
      expect(creativeBefore.body.result.structuredContent).toMatchObject({
        coreThemes: [], narrativePillars: [], historicalEras: [], storyGuardrails: [],
        continuityAnchors: [], openQuestions: [], visualGuardrails: [],
      });
      const forbiddenStatusEdit = await call(fullToken, "update_world", {
        world_id: worldId,
        expected_revision: creativeBefore.body.result.structuredContent.revision,
        changes: { status: "archived" },
      });
      expect(forbiddenStatusEdit.body.result.isError).toBe(true);
      expect(forbiddenStatusEdit.body.result.content[0].text).toContain("INVALID_ARGUMENTS");
      const pillars = [
        { id: "pillar-preservation", name: "Preservation", description: "Use keeps things meaningful." },
        { id: "pillar-memory", name: "Memory", description: "Remembered evidence shapes the present." },
      ];
      const eras = [
        { id: "era-later", name: "Later", order: 2, summary: "A later period." },
        { id: "era-earlier", name: "Earlier", order: 1, summary: "An earlier period." },
      ];
      const worldEdit = await call(fullToken, "update_world", {
        world_id: worldId,
        expected_revision: creativeBefore.body.result.structuredContent.revision,
        changes: {
          worldPremise: "A world defined by careful stewardship.",
          narrativePillars: pillars,
          historicalEras: eras,
          coreThemes: ["Stewardship", "Memory"],
          currentWorldState: "The archive remains in active use.",
        },
      });
      expect(worldEdit.body.result.isError).toBeUndefined();
      expect(worldEdit.body.result.structuredContent.record).toMatchObject({
        worldPremise: "A world defined by careful stewardship.",
        narrativePillars: pillars,
        historicalEras: eras,
        coreThemes: ["Stewardship", "Memory"],
      });
      const rereadWorld = await call(fullToken, "get_world", { world_id: worldId });
      expect(rereadWorld.body.result.structuredContent.record.historicalEras).toEqual(eras);
      const creativeAfter = await call(fullToken, "get_world_creative_context", { world_id: worldId });
      expect(creativeAfter.body.result.structuredContent.narrativePillars).toEqual(pillars);
      expect(creativeAfter.body.result.structuredContent.revision)
        .toBe(worldEdit.body.result.structuredContent.revision);
      const staleWorldEdit = await call(fullToken, "update_world", {
        world_id: worldId,
        expected_revision: creativeBefore.body.result.structuredContent.revision,
        changes: { worldPremise: "Stale overwrite" },
      });
      expect(staleWorldEdit.body.result.isError).toBe(true);
      expect(staleWorldEdit.body.result.content[0].text).toContain("REVISION_CONFLICT");
      const maps = await call(fullToken, "get_story_map", { map_id: worldId });
      expect(maps.body.result.structuredContent.world_id).toBe(worldId);
      const storylines = await call(fullToken, "get_storyline", { storyline_id: storyId });
      expect(storylines.body.result.structuredContent.record.id).toBe(storyId);
      const canon = await call(fullToken, "get_canon_record", { record_id: locationId });
      expect(canon.body.result.structuredContent.record.id).toBe(locationId);
      const scene = await call(fullToken, "get_scene", { scene_id: sceneId });
      expect(scene.body.result.structuredContent.record.id).toBe(sceneId);

      const editedCanon = await call(fullToken, "update_canon_editorial_fields", {
        record_id: locationId, expected_version: canon.body.result.structuredContent.revision,
        changes: { notes: "Temporary proposed-location edit" },
      });
      expect(editedCanon.body.result.isError).toBeUndefined();
      expect(editedCanon.body.result.structuredContent.record.status).toBe("proposed");
      const editedScene = await call(fullToken, "update_scene", {
        scene_id: sceneId, expected_revision: scene.body.result.structuredContent.revision,
        changes: { body: "Temporary scene edit" },
      });
      expect(editedScene.body.result.isError).toBeUndefined();
      expect(editedScene.body.result.structuredContent.record.body).toContain("Temporary scene edit");
    } finally {
      await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [worldId, storyId, movementId, sceneId, characterId, locationId]));
      await db.delete(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, locationId));
      await db.delete(wsSceneCanonLinksTable).where(eq(wsSceneCanonLinksTable.sceneId, sceneId));
      await db.delete(wsScenesTable).where(eq(wsScenesTable.id, sceneId));
      await db.delete(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, [characterId, locationId]));
      await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.id, movementId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });
});