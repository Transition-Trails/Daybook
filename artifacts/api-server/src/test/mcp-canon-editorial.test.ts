import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
  auditLogTable, db, mcpCanonHistoryTable, usersTable, worldsmithWorldsTable, wsCanonRecordsTable,
} from "@workspace/db";
import {
  CANON_EDITORIAL_TOOLS,
  CANON_EDITORIAL_WRITE_TOOLS,
  executeCanonEditorialTool,
  validateCanonEditorialChanges,
} from "../lib/worldsmith/mcp-canon-editorial";
import { executeCanonTool } from "../lib/worldsmith/mcp-canon";

describe("generic Canon editorial MCP writes", () => {
  const createdIds: string[] = [];
  const createdWorldIds: string[] = [];
  const actorIds = new Set<string>();

  afterAll(async () => {
    for (const id of createdIds) {
      await db.delete(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, id));
      await db.delete(auditLogTable).where(and(
        eq(auditLogTable.targetId, id),
        eq(auditLogTable.action, "worldsmith.editorial.canon.update"),
      ));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, id));
    }
    for (const id of createdWorldIds) {
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, id));
    }
    for (const actorId of actorIds) {
      await db.delete(auditLogTable).where(and(
        eq(auditLogTable.actorUserId, actorId),
        eq(auditLogTable.action, "worldsmith.editorial.canon.update"),
      ));
    }
  });

  it("publishes a strict generic update tool and rejects workflow or arbitrary fields", () => {
    expect(CANON_EDITORIAL_TOOLS.map(tool => tool.name)).toEqual(["update_canon_editorial_fields"]);
    expect(CANON_EDITORIAL_WRITE_TOOLS.has("update_canon_editorial_fields")).toBe(true);
    expect(() => validateCanonEditorialChanges({ status: "accepted" })).toThrow();
    expect(validateCanonEditorialChanges({ name: "  Renamed record  " })).toEqual({ name: "Renamed record" });
    expect(() => validateCanonEditorialChanges({ name: "   " })).toThrow();
    expect(() => validateCanonEditorialChanges({ made_up_column: "anything" })).toThrow();
    expect(() => validateCanonEditorialChanges({ narrative_visibility: "secret" })).toThrow();
    expect(() => validateCanonEditorialChanges({ global_metadata: { importance: "central" } }))
      .toThrowError(/update_canon_metadata/);
    expect(() => validateCanonEditorialChanges({ structured_profile: { locationScale: "city" } }))
      .toThrowError(/update_canon_metadata/);
    expect(() => validateCanonEditorialChanges({ notes: "<script>alert(1)</script>" })).not.toThrow();
  });

  it("enumerates all disposable proposed Canon rows over stable id-cursor pages", async () => {
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable).limit(1);
    if (!user || !world) throw new Error("Integration test needs a seeded world and super-admin user");

    const nonce = randomUUID();
    const ids = ["a", "b", "c"].map(suffix => `mcp-page-${nonce}-${suffix}`);
    createdIds.push(...ids);
    await db.insert(wsCanonRecordsTable).values(ids.map((id, index) => ({
      id,
      worldId: world.id,
      name: `Pagination disposable ${nonce} ${index}`,
      canonType: "motif",
      status: "proposed",
    })));

    const unfiltered = await executeCanonTool(user.id, "search_canon_records", {
      world_id: world.id, limit: 1,
    }, "https://editor.example") as { total: number; records: Array<{ id: string }> };
    expect(unfiltered.total).toBeGreaterThanOrEqual(3);
    expect(unfiltered.records).toHaveLength(1);

    const first = await executeCanonTool(user.id, "search_canon_records", {
      world_id: world.id, query: `Pagination disposable ${nonce}`, canon_type: "motif", limit: 2,
    }, "https://editor.example") as {
      records: Array<{ id: string; status: string; revision: number; editor_url: string }>;
      total: number; has_more: boolean; next_cursor: string | null;
    };
    expect(first.total).toBe(3);
    expect(first.has_more).toBe(true);
    expect(first.records.map(row => row.id)).toEqual(ids.slice(0, 2));
    expect(first.records.every(row => row.status === "proposed" && row.revision === 1 && row.editor_url)).toBe(true);
    expect(first.next_cursor).toBe(ids[1]);

    const second = await executeCanonTool(user.id, "search_canon_records", {
      world_id: world.id, query: `Pagination disposable ${nonce}`, canon_type: "motif",
      after_id: first.next_cursor!, limit: 2,
    }, "https://editor.example") as typeof first;
    expect(second.total).toBe(3);
    expect(second.has_more).toBe(false);
    expect(second.next_cursor).toBeNull();
    expect(second.records.map(row => row.id)).toEqual([ids[2]]);
  });

  it("updates a disposable proposed non-Character record with CAS and a transactional audit", async () => {
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable).limit(1);
    if (!user || !world) throw new Error("Integration test needs a seeded world and super-admin user");

    const recordId = `mcp-editorial-${randomUUID()}`;
    const relationshipId = `mcp-editorial-relationship-${randomUUID()}`;
    const foreignWorldId = `mcp-editorial-world-${randomUUID()}`;
    const foreignRecordId = `mcp-editorial-foreign-${randomUUID()}`;
    createdIds.push(recordId, relationshipId, foreignRecordId);
    createdWorldIds.push(foreignWorldId);
    actorIds.add(user.id);
    await db.insert(worldsmithWorldsTable).values({
      id: foreignWorldId,
      name: "Disposable MCP editorial test world",
      code: `T${randomUUID().slice(0, 2)}`,
    });
    await db.insert(wsCanonRecordsTable).values({
      id: recordId,
      worldId: world.id,
      name: "Disposable proposed location",
      canonType: "location",
      status: "proposed",
    });
    await db.insert(wsCanonRecordsTable).values({
      id: relationshipId,
      worldId: world.id,
      name: "Disposable proposed relationship",
      canonType: "relationship",
      status: "proposed",
    });
    await db.insert(wsCanonRecordsTable).values({
      id: foreignRecordId,
      worldId: foreignWorldId,
      name: "Disposable foreign endpoint",
      canonType: "motif",
      status: "proposed",
    });

    await expect(executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: recordId, expected_version: 1,
      changes: { global_metadata: { importance: "central" } },
    }, "https://editor.example")).rejects.toMatchObject({ code: "USE_FIELD_LEVEL_METADATA_TOOL" });

    const saved = await executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: recordId,
      expected_version: 1,
      changes: {
        name: "  Updated proposed location  ",
        narrative_details: "<p>A recurring image</p><script>bad()</script>",
        narrative_visibility: "hinted",
        portrait_url: "/objects/canon-test-image.png",
      },
    }, "https://editor.example") as { record: { name: string; version: number; status: string; narrativeDetails: string }; diff: Record<string, unknown> };

    expect(saved.record).toMatchObject({
      name: "Updated proposed location",
      version: 2,
      status: "proposed",
      narrativeDetails: "<p>A recurring image</p>",
      portraitUrl: "/objects/canon-test-image.png",
      imageUrls: ["/objects/canon-test-image.png"],
      imageGallery: [{ url: "/objects/canon-test-image.png", role: "primary" }],
    });
    expect(saved.diff).toHaveProperty("name");
    expect(saved.diff).toHaveProperty("narrativeDetails");

    await expect(executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: recordId, expected_version: 2, changes: { from_entity_id: recordId },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_RELATIONSHIP_ENDPOINT" });
    await expect(executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: recordId,
      expected_version: 2,
      changes: { portrait_url: "/objects/other-image.png", image_urls: ["/objects/canon-test-image.png"] },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INCONSISTENT_IMAGE_FIELDS" });
    await expect(executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: relationshipId, expected_version: 1, changes: { from_entity_id: recordId },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INCOMPLETE_RELATIONSHIP" });
    const relationship = await executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: relationshipId,
      expected_version: 1,
      changes: { from_entity_id: recordId, to_entity_id: recordId },
    }, "https://editor.example") as { record: { fromEntityId: string; toEntityId: string; status: string } };
    expect(relationship.record).toMatchObject({
      fromEntityId: recordId, toEntityId: recordId, status: "proposed",
    });
    await expect(executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: relationshipId,
      expected_version: 2,
      changes: { to_entity_id: "missing-canon-record" },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_RELATED_RECORD" });
    await expect(executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: relationshipId,
      expected_version: 2,
      changes: { to_entity_id: foreignRecordId },
    }, "https://editor.example")).rejects.toMatchObject({ code: "INVALID_RELATED_RECORD" });
    await expect(executeCanonEditorialTool(user.id, "update_canon_editorial_fields", {
      record_id: recordId, expected_version: 1, changes: { notes: "stale" },
    }, "https://editor.example")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });

    const histories = await db.select().from(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, recordId));
    const audits = await db.select().from(auditLogTable).where(and(
      eq(auditLogTable.targetId, recordId),
      eq(auditLogTable.action, "worldsmith.editorial.canon.update"),
    ));
    expect(histories).toHaveLength(1);
    expect(histories[0]).toMatchObject({ actorUserId: user.id, changeType: "canon_editorial_mcp" });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorUserId: user.id, targetId: recordId });
    expect(audits[0].metadata).toMatchObject({ actor_user_id: user.id, before_after: expect.any(Object) });
  });
});