import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  auditLogTable, db, usersTable, worldsmithWorldsTable, wsStoriesTable, wsStoryActsTable,
  wsCanonRecordsTable, wsCanonRecordStoryLinksTable, mcpOAuthClientsTable, mcpOAuthTokensTable,
} from "@workspace/db";
import { getMcpResource } from "../lib/mcp-oauth";
import mcpRouter from "../routes/mcp";

describe("MCP storyline and movement creation", () => {
  it("requires separate consent and creates draft parents with same-world Canon links atomically", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("A seeded development super-admin is required");
    const suffix = randomUUID();
    const worldId = `creation-world-${suffix}`;
    const foreignWorldId = `creation-foreign-${suffix}`;
    const canonId = `creation-canon-${suffix}`;
    const foreignCanonId = `creation-foreign-canon-${suffix}`;
    const clientId = `creation-client-${suffix}`;
    const oldToken = randomBytes(32).toString("base64url");
    const createToken = randomBytes(32).toString("base64url");
    const storyIds: string[] = [];
    const movementIds: string[] = [];
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const rpc = (token: string, method: string, params: Record<string, unknown> = {}) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const call = (token: string, name: string, args: Record<string, unknown>) =>
      rpc(token, "tools/call", { name, arguments: args });
    const created = async (name: string, args: Record<string, unknown>) => {
      const response = await call(createToken, name, args);
      expect(response.status).toBe(200);
      expect(response.body.result.isError).not.toBe(true);
      return response.body.result.structuredContent;
    };
    try {
      await db.insert(worldsmithWorldsTable).values([
        { id: worldId, name: "Creation test world", code: `C${suffix.slice(0, 8)}` },
        { id: foreignWorldId, name: "Other creation world", code: `F${suffix.slice(0, 8)}` },
      ]);
      await db.insert(wsCanonRecordsTable).values([
        { id: canonId, worldId, name: "Story anchor", canonType: "character", status: "proposed" },
        { id: foreignCanonId, worldId: foreignWorldId, name: "Foreign anchor", canonType: "character", status: "proposed" },
      ]);
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Creation test client", redirectUris: ["https://example.test/cb"],
      });
      for (const [token, scopes] of [
        [oldToken, ["worldsmith:editorial:read", "worldsmith:editorial:write"]],
        [createToken, ["worldsmith:editorial:read", "worldsmith:editorial:write", "worldsmith:editorial:create"]],
      ] as const) {
        await db.insert(mcpOAuthTokensTable).values({
          tokenHash: createHash("sha256").update(token).digest("hex"), kind: "access",
          familyId: randomUUID(), clientId, userId: user.id, resource: getMcpResource(),
          scopes: [...scopes], expiresAt: new Date(Date.now() + 60_000),
        });
      }
      const oldNames = (await rpc(oldToken, "tools/list")).body.result.tools.map((tool: { name: string }) => tool.name);
      expect(oldNames).not.toContain("create_storyline");
      expect(oldNames).not.toContain("create_movement");
      expect((await call(oldToken, "create_storyline", { world_id: worldId, title: "Not created" })).status).toBe(403);
      const createNames = (await rpc(createToken, "tools/list")).body.result.tools.map((tool: { name: string }) => tool.name);
      expect(createNames).toEqual(expect.arrayContaining(["create_storyline", "create_movement"]));

      const rejected = await call(createToken, "create_storyline", {
        world_id: worldId, title: "Wrong anchor", canon_record_ids: [foreignCanonId],
      });
      expect(rejected.body.result.isError).toBe(true);
      expect(rejected.body.result.content[0].text).toContain("INVALID_CANON_LINK");
      expect(await db.select().from(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId))).toHaveLength(0);

      const storyline = await created("create_storyline", {
        world_id: worldId, title: "Survey", summary: "The first survey", canon_record_ids: [canonId],
      });
      storyIds.push(storyline.record.id);
      expect(storyline.record).toMatchObject({ worldId, title: "Survey", status: "draft", sortOrder: 1, createdBy: user.id });
      expect(storyline.revision).toBeTruthy();
      expect(storyline.canon_links).toMatchObject([{ canonRecordId: canonId, storyId: storyline.record.id, actId: null }]);
      const storyRead = await created("get_storyline", { storyline_id: storyline.record.id });
      expect(storyRead.movements).toHaveLength(0);

      const rejectedMovement = await call(createToken, "create_movement", {
        storyline_id: storyline.record.id, title: "Wrong anchor", canon_record_ids: [foreignCanonId],
      });
      expect(rejectedMovement.body.result.content[0].text).toContain("INVALID_CANON_LINK");
      expect(await db.select().from(wsStoryActsTable).where(eq(wsStoryActsTable.storyId, storyline.record.id))).toHaveLength(0);

      for (const [title, number] of [["Opening", 1], ["Follow-up", 2]] as const) {
        const movement = await created("create_movement", {
          storyline_id: storyline.record.id, title, canon_record_ids: [canonId],
        });
        movementIds.push(movement.record.id);
        expect(movement.record).toMatchObject({ worldId, storyId: storyline.record.id, actNumber: number, title });
        expect(movement.canon_links).toMatchObject([{
          canonRecordId: canonId, storyId: storyline.record.id, actId: movement.record.id,
        }]);
        expect((await created("get_movement", { movement_id: movement.record.id })).record.id).toBe(movement.record.id);
      }
      const map = await created("get_story_map", { map_id: worldId });
      expect(map.links).toHaveLength(3);
      expect(map.stories[0].movements).toHaveLength(2);
      const [world] = await db.select().from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      expect(world.storySequenceRevision).toBe(1);
      const audits = await db.select().from(auditLogTable).where(inArray(auditLogTable.targetId, [...storyIds, ...movementIds]));
      expect(audits.map(audit => audit.action).sort()).toEqual([
        "worldsmith.editorial.movement.create", "worldsmith.editorial.movement.create",
        "worldsmith.editorial.storyline.create",
      ]);
    } finally {
      if (storyIds.length || movementIds.length) {
        await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [...storyIds, ...movementIds]));
        await db.delete(wsCanonRecordStoryLinksTable).where(inArray(wsCanonRecordStoryLinksTable.storyId, storyIds));
        if (movementIds.length) await db.delete(wsStoryActsTable).where(inArray(wsStoryActsTable.id, movementIds));
        if (storyIds.length) await db.delete(wsStoriesTable).where(inArray(wsStoriesTable.id, storyIds));
      }
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
      await db.delete(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, [canonId, foreignCanonId]));
      await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [worldId, foreignWorldId]));
    }
  });
});