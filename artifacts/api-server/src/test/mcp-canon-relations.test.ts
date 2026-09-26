import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import {
  auditLogTable, db, usersTable, worldsmithWorldsTable, wsCanonRecordRelationsTable,
  wsCanonRecordStoryLinksTable, wsCanonRecordsTable, wsStoriesTable,
} from "@workspace/db";
import {
  executeRelationTool, RELATION_TOOLS, RELATION_WRITE_TOOLS,
} from "../lib/worldsmith/mcp-canon-relations";
import { CanonToolError } from "../lib/worldsmith/mcp-canon";
import editorialRouter from "../routes/worldsmith-editorial.js";

describe("Canon relation MCP tool", () => {
  const nonce = randomUUID();
  const worldId = `mcp-rel-world-${nonce}`;
  const otherWorldId = `mcp-rel-other-world-${nonce}`;
  const storyId = `mcp-rel-story-${nonce}`;
  const sourceId = `mcp-rel-source-${nonce}`;
  const targetId = `mcp-rel-target-${nonce}`;
  const extraTargetId = `mcp-rel-extra-${nonce}`;
  const crossWorldId = `mcp-rel-cross-${nonce}`;
  const unlinkedSourceId = `mcp-rel-unlinked-source-${nonce}`;
  const unlinkedTargetId = `mcp-rel-unlinked-target-${nonce}`;
  const raceSourceId = `mcp-rel-race-source-${nonce}`;
  const raceTargetId = `mcp-rel-race-target-${nonce}`;
  const upsertSourceId = `mcp-rel-upsert-source-${nonce}`;
  const upsertTargetId = `mcp-rel-upsert-target-${nonce}`;
  const recordIds = [
    sourceId, targetId, extraTargetId, crossWorldId, unlinkedSourceId, unlinkedTargetId,
    raceSourceId, raceTargetId, upsertSourceId, upsertTargetId,
  ];
  const linkIds = recordIds.slice(0, 3).map((_, index) => `mcp-rel-link-${nonce}-${index}`);
  let adminId = "";
  let app: ReturnType<typeof express> = express();

  beforeAll(async () => {
    const [admin] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!admin) throw new Error("Integration test requires a seeded super-admin user");
    adminId = admin.id;
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const requestContext = req as any;
      requestContext.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
      requestContext.isAuthenticated = () => true;
      requestContext.user = { id: adminId, platformRole: "super_admin" };
      next();
    });
    app.use("/", editorialRouter);
    await db.insert(worldsmithWorldsTable).values([
      { id: worldId, name: `MCP relation test ${nonce}`, code: `MR${nonce.slice(0, 6)}`, status: "active" },
      { id: otherWorldId, name: `MCP relation other ${nonce}`, code: `MO${nonce.slice(0, 6)}`, status: "active" },
    ]);
    await db.insert(wsCanonRecordsTable).values(recordIds.map((id, index) => ({
      id,
      worldId: index === 3 ? otherWorldId : worldId,
      name: `MCP relation test record ${index}`,
      canonType: index === 0 ? "character" : "lore",
      status: "proposed",
      version: 1,
    })));
    await db.insert(wsStoriesTable).values({
      id: storyId, worldId, title: `MCP relation test story ${nonce}`, status: "active",
    });
    await db.insert(wsCanonRecordStoryLinksTable).values(recordIds.slice(0, 3).map((canonRecordId, index) => ({
      id: linkIds[index]!, canonRecordId, storyId,
    })));
  });

  afterAll(async () => {
    if (adminId) {
      await db.delete(auditLogTable).where(and(
        eq(auditLogTable.actorUserId, adminId),
        eq(auditLogTable.action, "worldsmith.editorial.canon_relation.create"),
        inArray(auditLogTable.targetId, [
          `${sourceId}->${targetId}`, `${targetId}->${sourceId}`,
          `${unlinkedSourceId}->${unlinkedTargetId}`, `${unlinkedTargetId}->${unlinkedSourceId}`,
        ]),
      )).catch(() => {});
    }
    await db.delete(wsCanonRecordRelationsTable)
      .where(inArray(wsCanonRecordRelationsTable.fromRecordId, recordIds)).catch(() => {});
    await db.delete(wsCanonRecordRelationsTable)
      .where(inArray(wsCanonRecordRelationsTable.toRecordId, recordIds)).catch(() => {});
    await db.delete(wsCanonRecordStoryLinksTable).where(inArray(wsCanonRecordStoryLinksTable.id, linkIds)).catch(() => {});
    await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, storyId)).catch(() => {});
    await db.delete(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, recordIds)).catch(() => {});
    await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [worldId, otherWorldId])).catch(() => {});
  });

  const args = (overrides: Record<string, unknown> = {}) => ({
    from_record_id: sourceId,
    to_record_id: targetId,
    relation_type: "supports",
    details: "In the winter siege, Mara gives Iven the archive key before the defenders retreat.",
    story_id: storyId,
    expected_source_version: 1,
    expected_target_version: 1,
    ...overrides,
  });

  it("publishes a dedicated bounded create-edge tool", () => {
    expect(RELATION_TOOLS.map(tool => tool.name)).toEqual(["create_canon_relation"]);
    expect(RELATION_WRITE_TOOLS.has("create_canon_relation")).toBe(true);
    expect(RELATION_TOOLS[0]!.inputSchema.required).not.toContain("story_id");
    expect(RELATION_TOOLS[0]!.inputSchema.required).toContain("expected_source_version");
  });

  it("creates an explicit relation between unlinked records without inferring additional links", async () => {
    const noStoryArgs: Record<string, unknown> = {
      ...args({
        from_record_id: unlinkedSourceId,
        to_record_id: unlinkedTargetId,
      }),
    };
    delete noStoryArgs.story_id;
    const result = await executeRelationTool(adminId, "create_canon_relation", noStoryArgs) as {
      relation: {
        fromRecordId: string; toRecordId: string; relationType: string; details: string;
        source: string; createdBy: string; targetName: string; targetCanonType: string;
      };
    };
    expect(result.relation).toMatchObject({
      fromRecordId: unlinkedSourceId,
      toRecordId: unlinkedTargetId,
      relationType: "supports",
      details: "In the winter siege, Mara gives Iven the archive key before the defenders retreat.",
      source: "manual",
      createdBy: adminId,
      targetName: "MCP relation test record 5",
      targetCanonType: "lore",
    });
    const [audit] = await db.select().from(auditLogTable).where(and(
      eq(auditLogTable.actorUserId, adminId),
      eq(auditLogTable.action, "worldsmith.editorial.canon_relation.create"),
      eq(auditLogTable.targetId, `${unlinkedSourceId}->${unlinkedTargetId}`),
    ));
    expect(audit?.metadata).toMatchObject({ relation_type: "supports" });
    expect(audit?.metadata).not.toHaveProperty("story_id");
    const createdEdges = await db.select().from(wsCanonRecordRelationsTable)
      .where(or(
        inArray(wsCanonRecordRelationsTable.fromRecordId, recordIds),
        inArray(wsCanonRecordRelationsTable.toRecordId, recordIds),
      ));
    expect(createdEdges).toHaveLength(1);
  });

  it("accepts optional storyline evidence only when both records are linked", async () => {
    await expect(executeRelationTool(adminId, "create_canon_relation", args({
      story_id: storyId,
    }))).resolves.toMatchObject({
      relation: { fromRecordId: sourceId, toRecordId: targetId },
    });
  });

  it("rejects stale endpoint versions without writing", async () => {
    await db.update(wsCanonRecordsTable).set({ version: 2 }).where(eq(wsCanonRecordsTable.id, extraTargetId));
    await expect(executeRelationTool(adminId, "create_canon_relation", args({
      to_record_id: extraTargetId,
      expected_target_version: 1,
    }))).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
    const edges = await db.select().from(wsCanonRecordRelationsTable)
      .where(eq(wsCanonRecordRelationsTable.toRecordId, extraTargetId));
    expect(edges).toHaveLength(0);
  });

  it("rejects records from different worlds", async () => {
    await expect(executeRelationTool(adminId, "create_canon_relation", args({
      to_record_id: crossWorldId,
    }))).rejects.toMatchObject({ status: 400, code: "INVALID_RELATION" });
  });

  it("rejects an existing inverse edge rather than upserting", async () => {
    await db.insert(wsCanonRecordRelationsTable).values({
      fromRecordId: extraTargetId, toRecordId: sourceId, relationType: "related", details: "Existing inverse edge",
    });
    await expect(executeRelationTool(adminId, "create_canon_relation", args({
      to_record_id: extraTargetId,
      expected_target_version: 2,
    }))).rejects.toMatchObject({ status: 409, code: "RELATION_EXISTS" });
    const inverse = await db.select().from(wsCanonRecordRelationsTable)
      .where(eq(wsCanonRecordRelationsTable.fromRecordId, extraTargetId));
    expect(inverse).toHaveLength(1);
    await db.delete(wsCanonRecordRelationsTable).where(and(
      eq(wsCanonRecordRelationsTable.fromRecordId, extraTargetId),
      eq(wsCanonRecordRelationsTable.toRecordId, sourceId),
    ));
  });

  it("requires explicit details and rejects invalid supplied storyline evidence or relation types", async () => {
    await expect(executeRelationTool(adminId, "create_canon_relation", args({ details: "Too short" })))
      .rejects.toBeInstanceOf(CanonToolError);
    await expect(executeRelationTool(adminId, "create_canon_relation", args({ relation_type: "invented" })))
      .rejects.toMatchObject({ status: 400, code: "INVALID_ARGUMENTS" });
    await expect(executeRelationTool(adminId, "create_canon_relation", args({
      from_record_id: unlinkedSourceId,
      to_record_id: unlinkedTargetId,
      story_id: `missing-${nonce}`,
    })))
      .rejects.toMatchObject({ status: 409, code: "STORY_EVIDENCE_REQUIRED" });
  });

  it("serializes concurrent inverse MCP and manual creates so only one edge survives", async () => {
    const mcpWrite = executeRelationTool(adminId, "create_canon_relation", {
      from_record_id: raceSourceId,
      to_record_id: raceTargetId,
      relation_type: "supports",
      details: "MCP evidence: the sentry gives the signal before the bridge is raised.",
      expected_source_version: 1,
      expected_target_version: 1,
    });
    const manualWrite = request(app)
      .post(`/v1/editorial/canon-records/${raceTargetId}/relations`)
      .send({
        to_record_id: raceSourceId,
        relation_type: "ally",
        details: "Manual inverse edge.",
      });
    const [mcpResult, manualResult] = await Promise.allSettled([mcpWrite, manualWrite]);
    const manualStatus = manualResult.status === "fulfilled" ? manualResult.value.status : 500;
    const mcpStatus = mcpResult.status === "fulfilled" ? 201 : (mcpResult.reason as CanonToolError).status;
    expect([manualStatus, mcpStatus].sort()).toEqual([201, 409]);
    const edges = await db.select().from(wsCanonRecordRelationsTable).where(or(
      and(
        eq(wsCanonRecordRelationsTable.fromRecordId, raceSourceId),
        eq(wsCanonRecordRelationsTable.toRecordId, raceTargetId),
      ),
      and(
        eq(wsCanonRecordRelationsTable.fromRecordId, raceTargetId),
        eq(wsCanonRecordRelationsTable.toRecordId, raceSourceId),
      ),
    ));
    expect(edges).toHaveLength(1);
  });

  it("preserves same-direction manual upsert behavior", async () => {
    const route = `/v1/editorial/canon-records/${upsertSourceId}/relations`;
    const first = await request(app).post(route).send({
      to_record_id: upsertTargetId,
      relation_type: "related",
      details: "Initial manual edge.",
    });
    const updated = await request(app).post(route).send({
      to_record_id: upsertTargetId,
      relation_type: "supports",
      details: "Updated manual edge details.",
    });
    expect(first.status).toBe(201);
    expect(updated.status).toBe(201);
    expect(updated.body.relation).toMatchObject({
      fromRecordId: upsertSourceId,
      toRecordId: upsertTargetId,
      relationType: "supports",
      details: "Updated manual edge details.",
    });
    const rows = await db.select().from(wsCanonRecordRelationsTable).where(and(
      eq(wsCanonRecordRelationsTable.fromRecordId, upsertSourceId),
      eq(wsCanonRecordRelationsTable.toRecordId, upsertTargetId),
    ));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ relationType: "supports", details: "Updated manual edge details." });
  });
});