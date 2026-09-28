import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  auditLogTable, db, mcpOAuthClientsTable, mcpOAuthTokensTable, usersTable,
  worldsmithWorldsTable, wsCanonRecordsTable, wsStoriesTable, wsStoryActsTable,
  wsScenesTable, wsSceneCanonLinksTable, wsStorySceneDetailsTable,
} from "@workspace/db";
import { getMcpResource } from "../lib/mcp-oauth";
import mcpRouter from "../routes/mcp";

describe("MCP scene creation within movements", () => {
  it("needs explicit creation consent and keeps numbering, parents, details and Canon links consistent", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const suffix = randomUUID();
    const worldId = `scene-create-world-${suffix}`;
    const foreignWorldId = `scene-create-foreign-world-${suffix}`;
    const storyId = `scene-create-story-${suffix}`;
    const movementId = `scene-create-movement-${suffix}`;
    const existingId = `scene-create-existing-${suffix}`;
    const charId = `scene-create-character-${suffix}`;
    const locationId = `scene-create-location-${suffix}`;
    const foreignId = `scene-create-foreign-${suffix}`;
    const clientId = `scene-create-client-${suffix}`;
    const oldToken = randomBytes(32).toString("base64url");
    const createToken = randomBytes(32).toString("base64url");
    const createdIds: string[] = [];
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const rpc = (token: string, method: string, params: Record<string, unknown> = {}) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const call = (token: string, name: string, args: Record<string, unknown>) =>
      rpc(token, "tools/call", { name, arguments: args });
    const base = { movement_id: movementId, title: "New scene", canon_record_ids: [charId, locationId] };
    try {
      await db.insert(worldsmithWorldsTable).values([
        { id: worldId, name: "Scene creation world", code: `SC${suffix.slice(0, 8)}` },
        { id: foreignWorldId, name: "Other world", code: `SF${suffix.slice(0, 8)}` },
      ]);
      await db.insert(wsStoriesTable).values({ id: storyId, worldId, title: "Existing storyline", status: "draft" });
      await db.insert(wsStoryActsTable).values({ id: movementId, worldId, storyId, actNumber: 1, title: "Existing movement" });
      await db.insert(wsScenesTable).values({
        id: existingId, worldId, storyId, actId: movementId, sceneNumber: 6, title: "Keep this scene",
      });
      await db.insert(wsCanonRecordsTable).values([
        { id: charId, worldId, name: "Character", canonType: "character", status: "proposed" },
        { id: locationId, worldId, name: "Location", canonType: "location", status: "proposed" },
        { id: foreignId, worldId: foreignWorldId, name: "Foreign", canonType: "character", status: "proposed" },
      ]);
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Scene creation test", redirectUris: ["https://example.test/cb"],
      });
      for (const [token, scopes] of [
        [oldToken, ["worldsmith:editorial:scenes:read", "worldsmith:editorial:scenes:write"]],
        [createToken, ["worldsmith:editorial:scenes:read", "worldsmith:editorial:scenes:write", "worldsmith:editorial:scenes:create"]],
      ] as const) {
        await db.insert(mcpOAuthTokensTable).values({
          tokenHash: createHash("sha256").update(token).digest("hex"), kind: "access",
          familyId: randomUUID(), clientId, userId: user.id, resource: getMcpResource(),
          scopes: [...scopes], expiresAt: new Date(Date.now() + 60_000),
        });
      }
      const oldNames = (await rpc(oldToken, "tools/list")).body.result.tools.map((tool: { name: string }) => tool.name);
      expect(oldNames).toContain("update_scene");
      expect(oldNames).not.toContain("create_scene");
      expect((await call(oldToken, "create_scene", base)).status).toBe(403);
      expect((await rpc(createToken, "tools/list")).body.result.tools.map((tool: { name: string }) => tool.name))
        .toContain("create_scene");

      for (const ids of [[locationId], [charId, foreignId], [charId, charId], [charId, "missing"]]) {
        const rejected = await call(createToken, "create_scene", { ...base, canon_record_ids: ids });
        expect(rejected.body.result.isError).toBe(true);
        expect(rejected.body.result.content[0].text).toContain("INVALID_CANON_LINK");
      }
      const missingParent = await call(createToken, "create_scene", { ...base, movement_id: "missing" });
      expect(missingParent.body.result.content[0].text).toContain("MOVEMENT_NOT_FOUND");
      expect(await db.select().from(wsScenesTable).where(eq(wsScenesTable.actId, movementId))).toHaveLength(1);

      const first = await call(createToken, "create_scene", {
        ...base, body: "<p>Opening<script>alert(1)</script> text</p>",
        attributes: { mood: "quiet" }, purpose: "Open the story",
        details: { time_of_day: "dawn" },
      });
      expect(first.body.result.isError).not.toBe(true);
      const scene = first.body.result.structuredContent;
      createdIds.push(scene.record.id);
      expect(scene.record).toMatchObject({
        worldId, storyId, actId: movementId, sceneNumber: 7, title: "New scene",
        body: "<p>Opening text</p>", attributes: { mood: "quiet" }, createdBy: user.id,
      });
      expect(scene.scene_details).toMatchObject({ storyId, worldId, purpose: "Open the story", details: { time_of_day: "dawn" } });
      expect(scene.canon_links).toMatchObject([
        { canonRecordId: charId, role: "character", sortOrder: 0 },
        { canonRecordId: locationId, role: "featured", sortOrder: 1 },
      ]);
      expect(scene.revision).toBeTruthy();
      expect((await call(createToken, "get_scene", { scene_id: scene.record.id })).body.result.structuredContent.parent)
        .toMatchObject({ storyline: { id: storyId }, movement: { id: movementId } });
      const second = await call(createToken, "create_scene", { ...base, title: "Following scene" });
      expect(second.body.result.isError).not.toBe(true);
      createdIds.push(second.body.result.structuredContent.record.id);
      expect(second.body.result.structuredContent.record.sceneNumber).toBe(8);
      expect((await db.select().from(wsScenesTable).where(eq(wsScenesTable.id, existingId)))[0].title)
        .toBe("Keep this scene");
      const audits = await db.select().from(auditLogTable).where(inArray(auditLogTable.targetId, createdIds));
      expect(audits.map(row => row.action)).toEqual([
        "worldsmith.editorial.scene.create", "worldsmith.editorial.scene.create",
      ]);
    } finally {
      if (createdIds.length) {
        await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, createdIds));
        await db.delete(wsSceneCanonLinksTable).where(inArray(wsSceneCanonLinksTable.sceneId, createdIds));
        await db.delete(wsStorySceneDetailsTable).where(inArray(wsStorySceneDetailsTable.sceneId, createdIds));
        await db.delete(wsScenesTable).where(inArray(wsScenesTable.id, createdIds));
      }
      await db.delete(wsScenesTable).where(eq(wsScenesTable.id, existingId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
      await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.id, movementId));
      await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId));
      await db.delete(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, [charId, locationId, foreignId]));
      await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [worldId, foreignWorldId]));
    }
  });
});