import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  db, mcpCanonHistoryTable, mcpOAuthClientsTable, mcpOAuthTokensTable, usersTable,
  worldsmithWorldsTable, wsCanonRecordsTable, wsCharacterVariantsTable,
  wsIdentityLocksTable, wsKnowledgeEntriesTable,
} from "@workspace/db";
import { getMcpResource } from "../lib/mcp-oauth";
import mcpRouter from "../routes/mcp";

describe("Character repeater MCP tools", () => {
  it("replaces and reads each collection with CAS, audit, workflow, validation, and scope enforcement", async () => {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable).limit(1);
    if (!user || !world) throw new Error("Integration test needs a seeded world and super-admin user");

    const suffix = randomUUID();
    const characterId = `mcp-repeater-character-${suffix}`;
    const locationId = `mcp-repeater-location-${suffix}`;
    const clientId = `mcp-repeater-client-${suffix}`;
    const restrictedToken = randomBytes(32).toString("base64url");
    const editorToken = randomBytes(32).toString("base64url");
    const app = express();
    app.use(express.json());
    app.use(mcpRouter);
    const rpc = (token: string, method: string, params: Record<string, unknown> = {}) =>
      request(app).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const call = (token: string, name: string, args: Record<string, unknown>) =>
      rpc(token, "tools/call", { name, arguments: args });

    try {
      await db.insert(wsCanonRecordsTable).values([
        { id: characterId, worldId: world.id, name: "Disposable Repeater Character", canonType: "character", status: "proposed" },
        { id: locationId, worldId: world.id, name: "Disposable Repeater Location", canonType: "location", status: "proposed" },
      ]);
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Disposable repeater integration test",
        redirectUris: ["https://example.com/callback"],
      });
      for (const [token, scopes] of [
        [restrictedToken, ["worldsmith:canon:read", "worldsmith:canon:write"]],
        [editorToken, ["worldsmith:canon:read", "worldsmith:canon:write", "worldsmith:canon:editorial:write"]],
      ] as const) {
        await db.insert(mcpOAuthTokensTable).values({
          tokenHash: createHash("sha256").update(token).digest("hex"), kind: "access",
          familyId: randomUUID(), clientId, userId: user.id, resource: getMcpResource(),
          scopes: [...scopes], expiresAt: new Date(Date.now() + 60_000),
        });
      }

      const initial = await call(editorToken, "get_canon_record", { record_id: characterId });
      expect(initial.body.result.structuredContent.character_repeaters).toEqual({
        knowledge: [], variants: [], identity_locks: [],
      });
      const options = await call(editorToken, "get_canon_field_options", {
        world_id: world.id, canon_type: "character",
      });
      expect(options.body.result.structuredContent.character_repeaters).toMatchObject({
        knowledge: { write_tool: "replace_character_knowledge" },
        variants: { write_tool: "replace_character_variants" },
        identity_locks: { write_tool: "replace_character_identity_locks" },
      });

      const restrictedTools = await rpc(restrictedToken, "tools/list");
      const restrictedNames = restrictedTools.body.result.tools.map((tool: { name: string }) => tool.name);
      expect(restrictedNames).not.toEqual(expect.arrayContaining([
        "replace_character_knowledge", "replace_character_variants", "replace_character_identity_locks",
      ]));
      const scopeDenied = await call(restrictedToken, "replace_character_knowledge", {
        record_id: characterId, expected_revision: initial.body.result.structuredContent.revision, knowledge: [],
      });
      expect(scopeDenied.status).toBe(403);

      const collectionCases = [
        {
          tool: "replace_character_knowledge",
          field: "knowledge",
          arg: "knowledge",
          rows: [{
            knowledge_state: "knows", confidence: "high", source: "witnessed",
            disclosure: "private", access: "regular", belief: "The archive is safe.",
          }],
        },
        {
          tool: "replace_character_variants",
          field: "variants",
          arg: "variants",
          rows: [{
            variant_name: "Adult", life_stage: "early_adult",
            profile: { apparent_age_range: "30s", visual_notes: "Silver-threaded coat." },
          }],
        },
        {
          tool: "replace_character_identity_locks",
          field: "identity_locks",
          arg: "locks",
          rows: [{
            category: "hair_family", value: "Dark curls", strength: "required",
            applies_to_life_stages: ["early_adult"],
          }],
        },
      ] as const;
      let revision = initial.body.result.structuredContent.revision as number;
      for (const item of collectionCases) {
        const saved = await call(editorToken, item.tool, {
          record_id: characterId, expected_revision: revision, [item.arg]: item.rows,
        });
        expect(saved.body.result.isError).toBeUndefined();
        const result = saved.body.result.structuredContent;
        expect(result.revision).toBe(revision + 1);
        expect(result.workflow_status).toBe("proposed");
        expect(result[item.field]).toMatchObject(item.rows);
        revision = result.revision;

        const readback = await call(editorToken, "get_canon_record", { record_id: characterId });
        expect(readback.body.result.structuredContent.character_repeaters[item.field]).toMatchObject(item.rows);
        expect(readback.body.result.structuredContent.workflow_status).toBe("proposed");
      }

      const stale = await call(editorToken, "replace_character_knowledge", {
        record_id: characterId, expected_revision: revision - 1, knowledge: [],
      });
      expect(stale.body.result.isError).toBe(true);
      expect(stale.body.result.content[0].text).toContain("VERSION_CONFLICT");

      const invalid = await call(editorToken, "replace_character_knowledge", {
        record_id: characterId, expected_revision: revision, knowledge: [{ knowledge_state: "not-a-state" }],
      });
      expect(invalid.body.result.isError).toBe(true);
      expect(invalid.body.result.content[0].text).toContain("INVALID_REPEATER_OPTION");
      const invalidLifeStage = await call(editorToken, "replace_character_variants", {
        record_id: characterId, expected_revision: revision,
        variants: [{ variant_name: "Unknown", life_stage: "not-a-life-stage" }],
      });
      expect(invalidLifeStage.body.result.isError).toBe(true);
      expect(invalidLifeStage.body.result.content[0].text).toContain("INVALID_REPEATER_OPTION");

      const wrongType = await call(editorToken, "replace_character_variants", {
        record_id: locationId, expected_revision: 1, variants: [],
      });
      expect(wrongType.body.result.isError).toBe(true);
      expect(wrongType.body.result.content[0].text).toContain("WRONG_CANON_TYPE");
      const invalidArguments = await call(editorToken, "replace_character_variants", {
        record_id: characterId, expected_revision: revision, variants: [{ variant_name: "", life_stage: "adult" }],
      });
      expect(invalidArguments.body.result.isError).toBe(true);
      expect(invalidArguments.body.result.content[0].text).toContain("INVALID_ARGUMENTS");

      for (const item of collectionCases) {
        const cleared = await call(editorToken, item.tool, {
          record_id: characterId, expected_revision: revision, [item.arg]: [],
        });
        expect(cleared.body.result.isError).toBeUndefined();
        expect(cleared.body.result.structuredContent[item.field]).toEqual([]);
        revision = cleared.body.result.structuredContent.revision;
      }
      const emptyRead = await call(editorToken, "get_canon_record", { record_id: characterId });
      expect(emptyRead.body.result.structuredContent.character_repeaters).toEqual({
        knowledge: [], variants: [], identity_locks: [],
      });
      expect(emptyRead.body.result.structuredContent.workflow_status).toBe("proposed");

      const history = await call(editorToken, "get_record_change_history", { record_id: characterId });
      const audited = history.body.result.structuredContent.history;
      expect(audited).toHaveLength(6);
      expect(audited.map((entry: { changeType: string }) => entry.changeType)).toEqual(expect.arrayContaining([
        "character_knowledge_replacement", "character_variants_replacement", "character_identity_locks_replacement",
      ]));
      expect(audited.every((entry: { actorUserId: string }) => entry.actorUserId === user.id)).toBe(true);
    } finally {
      await db.delete(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, characterId));
      await db.delete(wsKnowledgeEntriesTable).where(eq(wsKnowledgeEntriesTable.recordId, characterId));
      await db.delete(wsCharacterVariantsTable).where(eq(wsCharacterVariantsTable.recordId, characterId));
      await db.delete(wsIdentityLocksTable).where(eq(wsIdentityLocksTable.recordId, characterId));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, characterId));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, locationId));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
    }
  });
});