import { randomBytes, randomUUID, createHash } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  db, usersTable, worldsmithWorldsTable, wsCanonRecordsTable,
  wsCharacterProfilesTable, mcpCanonHistoryTable, mcpOAuthClientsTable,
  mcpOAuthTokensTable,
} from "@workspace/db";
import { getMcpResource } from "../lib/mcp-oauth";
import mcpRouter from "../routes/mcp";
import foundationRouter from "../routes/worldsmith-foundation";

/** A real development-DB round trip, using only disposable records and grants. */
describe("Canon MCP / editorial save integration", () => {
  it("reads, partially updates without approval, rejects invalid choices and stale versions", async () => {
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable).limit(1);
    if (!user || !world) throw new Error("Integration test needs a seeded world and super-admin user");

    const recordId = `mcp-test-${randomUUID()}`;
    const clientId = `mcp-test-${randomUUID()}`;
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const api = express();
    api.use(express.json());
    api.use(mcpRouter);
    // Exercise the actual editorial route with the same session identity that
    // Passport supplies; no real credentials or shared admin tokens are used.
    api.use((req, _res, next) => {
      req.user = user;
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      next();
    });
    api.use("/api", foundationRouter);
    const rpc = (name: string, args: Record<string, unknown>) => request(api)
      .post("/mcp").set("Authorization", `Bearer ${token}`)
      .send({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

    try {
      await db.insert(wsCanonRecordsTable).values({
        id: recordId, worldId: world.id, name: "Temporary MCP Character",
        canonType: "character", status: "proposed",
      });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Disposable integration test",
        redirectUris: ["https://example.com/callback"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash, kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(),
        scopes: ["worldsmith:canon:read", "worldsmith:canon:write"],
        expiresAt: new Date(Date.now() + 60_000),
      });

      const before = await rpc("get_canon_record", { record_id: recordId });
      expect(before.status).toBe(200);
      expect(before.body.result.structuredContent.workflow_status).toBe("proposed");
      const version = before.body.result.structuredContent.revision as number;

      const valid = await rpc("update_canon_record", {
        record_id: recordId, expected_revision: version,
        changes: { pronouns: "she_her", coreDesire: "belonging" },
      });
      expect(valid.body.result.isError).toBeUndefined();
      expect(valid.body.result.structuredContent.revision).toBe(version + 1);
      expect(valid.body.result.structuredContent.record.id).toBe(recordId);
      expect(valid.body.result.structuredContent.record.status).toBe("proposed");

      const invalid = await rpc("update_canon_record", {
        record_id: recordId, expected_revision: version + 1,
        changes: { lifeStage: "not-a-real-life-stage" },
      });
      expect(invalid.body.result.isError).toBe(true);
      expect(invalid.body.result.content[0].text).toContain("INVALID_PICKLIST_VALUE");

      const stale = await rpc("update_canon_record", {
        record_id: recordId, expected_revision: version,
        changes: { pronouns: "he_him" },
      });
      expect(stale.body.result.isError).toBe(true);
      expect(stale.body.result.content[0].text).toContain("VERSION_CONFLICT");

      const staleEditor = await request(api)
        .put(`/api/v1/editorial/profiles/character/${recordId}`)
        .send({ world_id: world.id, schema_version: 1, expected_version: version, profile: {} });
      expect(staleEditor.status).toBe(409);

      const requestId = randomUUID();
      const profileWrite = { world_id: world.id, schema_version: 1, expected_version: version + 1, request_id: requestId, profile: {} };
      const replaced = await request(api)
        .put(`/api/v1/editorial/profiles/character/${recordId}`)
        .send(profileWrite);
      expect(replaced.status).toBe(200);
      // The client has no response and sends the same write again.
      const replay = await request(api)
        .put(`/api/v1/editorial/profiles/character/${recordId}`).send(profileWrite);
      expect(replay.status).toBe(200);
      expect(replay.body).toMatchObject({ version: version + 2, reconciled: true });
      const wrongRequest = await request(api)
        .put(`/api/v1/editorial/profiles/character/${recordId}`)
        .send({ ...profileWrite, request_id: randomUUID() });
      expect(wrongRequest.status).toBe(409);
      const wrongPayload = await request(api)
        .put(`/api/v1/editorial/profiles/character/${recordId}`)
        .send({ ...profileWrite, profile: { pronouns: "she/her" } });
      expect(wrongPayload.status).toBe(409);
      const after = await rpc("get_canon_record", { record_id: recordId });
      expect(after.body.result.structuredContent.version).toBe(version + 2);
      expect(after.body.result.structuredContent.workflow_status).toBe("proposed");
      expect(after.body.result.structuredContent.character_profile).toEqual({});

      const history = await rpc("get_record_change_history", { record_id: recordId });
      expect(history.body.result.structuredContent.history).toHaveLength(2);
      expect(history.body.result.structuredContent.history[0].actorUserId).toBe(user.id);

      const temporary = await rpc("update_canon_record", {
        record_id: recordId, expected_revision: version + 2,
        changes: { pronouns: "they_them" },
      });
      expect(temporary.body.result.structuredContent.character_profile).toEqual({ pronouns: "they_them" });
      const afterOtherEditor = await request(api)
        .put(`/api/v1/editorial/profiles/character/${recordId}`).send(profileWrite);
      expect(afterOtherEditor.status).toBe(409);
      const restored = await rpc("update_canon_record", {
        record_id: recordId, expected_revision: version + 3,
        changes: { pronouns: null },
      });
      expect(restored.body.result.isError).toBeUndefined();
      expect(restored.body.result.structuredContent.character_profile).toEqual({});
      const emptyAgain = await rpc("get_canon_record", { record_id: recordId });
      expect(emptyAgain.body.result.structuredContent.character_profile).toBeNull();
      expect(emptyAgain.body.result.structuredContent.workflow_status).toBe("proposed");
    } finally {
      await db.delete(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, recordId));
      await db.delete(wsCharacterProfilesTable).where(eq(wsCharacterProfilesTable.recordId, recordId));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });
});