import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLogTable,
  db,
  usersTable,
  worldsmithWorldsTable,
  wsCanonRecordsTable,
  wsReadinessAssignmentsTable,
  wsStoriesTable,
  wsStoryBeatsTable,
  type User,
} from "@workspace/db";
import editorialRouter from "../routes/worldsmith-editorial.js";
import { executeReadinessPlanningTool, READINESS_PLANNING_TOOLS } from "../lib/worldsmith/mcp-readiness-planning.js";
import { hasWriteWithoutRead, parseMcpScopes } from "../lib/mcp-oauth.js";

const suffix = randomUUID();
const worldId = `readiness-${suffix}`;
const otherWorldId = `readiness-other-${suffix}`;
const emptyWorldId = `readiness-empty-${suffix}`;
const actorId = `readiness-admin-${suffix}`;
const nonAdminId = `readiness-non-admin-${suffix}`;
const ids = {
  record: `readiness-record-${suffix}`,
  story: `readiness-story-${suffix}`,
  beat: `readiness-beat-${suffix}`,
  otherStory: `readiness-other-story-${suffix}`,
};

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authRequest = req as any;
  authRequest.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  authRequest.isAuthenticated = () => true;
  authRequest.user = { id: actorId, platformRole: "super_admin" } as User;
  next();
});
app.use("/", editorialRouter);

beforeAll(async () => {
  await db.insert(usersTable).values({ id: actorId, email: `${actorId}@example.test`, name: "Readiness Admin", platformRole: "super_admin" });
  await db.insert(usersTable).values({ id: nonAdminId, email: `${nonAdminId}@example.test`, name: "Readiness Non-admin", platformRole: null });
  await db.insert(worldsmithWorldsTable).values([
    { id: worldId, name: "Readiness World", code: `R${suffix.slice(0, 8)}` },
    { id: otherWorldId, name: "Other Readiness World", code: `O${suffix.slice(0, 8)}` },
    { id: emptyWorldId, name: "Empty Readiness World", code: `E${suffix.slice(0, 8)}` },
  ]);
  await db.insert(wsCanonRecordsTable).values({ id: ids.record, worldId, name: "A Canon Record" });
  await db.insert(wsStoriesTable).values([
    { id: ids.story, worldId, title: "A Storyline", summary: "Story subtitle" },
    { id: ids.otherStory, worldId: otherWorldId, title: "Other Storyline" },
  ]);
  await db.insert(wsStoryBeatsTable).values({
    id: ids.beat, storyId: ids.story, worldId, beatType: "turn", title: "A Beat", summary: "Beat subtitle",
  });
});

afterAll(async () => {
  await db.delete(auditLogTable).where(inArray(auditLogTable.targetId, [ids.beat, ids.record, ids.story]));
  await db.delete(wsReadinessAssignmentsTable).where(inArray(wsReadinessAssignmentsTable.entityId, [ids.record, ids.story, ids.beat]));
  await db.delete(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, ids.beat));
  await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, ids.record));
  await db.delete(wsStoriesTable).where(inArray(wsStoriesTable.id, [ids.story, ids.otherStory]));
  await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [worldId, otherWorldId, emptyWorldId]));
  await db.delete(usersTable).where(eq(usersTable.id, actorId));
  await db.delete(usersTable).where(eq(usersTable.id, nonAdminId));
});

describe("persisted editorial readiness planning", () => {
  it("lists all three world-owned entity types, defaults missing assignments, and supports empty worlds", async () => {
    const response = await request(app).get("/v1/editorial/readiness-planning").query({ world_id: worldId });
    expect(response.status).toBe(200);
    expect(response.body.boards.canon_records).toMatchObject([{ id: ids.record, lane: "backlog", revision: 0 }]);
    expect(response.body.boards.storylines).toMatchObject([{ id: ids.story, lane: "backlog", revision: 0 }]);
    expect(response.body.boards.beats).toMatchObject([{ id: ids.beat, title: "A Beat", parentTitle: "A Storyline", lane: "backlog", revision: 0 }]);
    expect(response.body.boards.storylines.some((card: { id: string }) => card.id === ids.otherStory)).toBe(false);
    const empty = await request(app).get("/v1/editorial/readiness-planning").query({ world_id: emptyWorldId });
    expect(empty.status).toBe(200);
    expect(empty.body.boards).toEqual({ canon_records: [], storylines: [], beats: [] });
    const missing = await request(app).get("/v1/editorial/readiness-planning").query({ world_id: `missing-${suffix}` });
    expect(missing.status).toBe(404);
  });

  it("moves lanes with optimistic revisions, audits changes, and rejects stale or cross-world requests", async () => {
    const moved = await request(app).patch(`/v1/editorial/readiness-planning/beats/${ids.beat}`).send({
      world_id: worldId, lane: "review", expected_revision: 0,
    });
    expect(moved.status).toBe(200);
    expect(moved.body.card).toMatchObject({ id: ids.beat, lane: "review", revision: 1, parentTitle: "A Storyline" });
    const stale = await request(app).patch(`/v1/editorial/readiness-planning/beats/${ids.beat}`).send({
      world_id: worldId, lane: "ready", expected_revision: 0,
    });
    expect(stale.status).toBe(409);
    const wrongWorld = await request(app).patch(`/v1/editorial/readiness-planning/beats/${ids.beat}`).send({
      world_id: otherWorldId, lane: "ready", expected_revision: 1,
    });
    expect(wrongWorld.status).toBe(400);
    const invalidLane = await request(app).patch(`/v1/editorial/readiness-planning/beats/${ids.beat}`).send({
      world_id: worldId, lane: "accepted", expected_revision: 1,
    });
    expect(invalidLane.status).toBe(400);
    const [audit] = await db.select().from(auditLogTable).where(and(
      eq(auditLogTable.action, "worldsmith.readiness_lane.move"),
      eq(auditLogTable.targetId, ids.beat),
    ));
    expect(audit?.metadata).toMatchObject({ after: { lane: "review", revision: 1 } });
  });

  it("exposes separately scoped MCP planning tools and applies identical world/revision checks", async () => {
    expect(READINESS_PLANNING_TOOLS.map(tool => tool.name)).toEqual(["list_readiness_cards", "move_readiness_card"]);
    const readinessScopes = "worldsmith:readiness:read worldsmith:readiness:write";
    expect(parseMcpScopes(readinessScopes)).toEqual(["worldsmith:readiness:read", "worldsmith:readiness:write"]);
    expect(hasWriteWithoutRead(["worldsmith:readiness:write"])).toBe(true);
    expect(hasWriteWithoutRead(["worldsmith:readiness:read", "worldsmith:readiness:write"])).toBe(false);
    const listed = await executeReadinessPlanningTool(actorId, "list_readiness_cards", { world_id: worldId }) as {
      boards: { canon_records: Array<{ id: string }>; storylines: Array<{ id: string }> };
    };
    expect(listed.boards.canon_records.map(card => card.id)).toContain(ids.record);
    expect(listed.boards.storylines.map(card => card.id)).not.toContain(ids.otherStory);
    await expect(executeReadinessPlanningTool(actorId, "list_readiness_cards", { world_id: `missing-${suffix}` }))
      .rejects.toMatchObject({ status: 404, code: "world_not_found" });
    await expect(executeReadinessPlanningTool(actorId, "move_readiness_card", {
      world_id: otherWorldId, entity_type: "storylines", id: ids.story, lane: "ready", expected_revision: 0,
    })).rejects.toMatchObject({ status: 400 });
    const moved = await executeReadinessPlanningTool(actorId, "move_readiness_card", {
      world_id: worldId, entity_type: "canon_records", id: ids.record, lane: "in_progress", expected_revision: 0,
    }) as { card: { lane: string; revision: number } };
    expect(moved.card).toMatchObject({ lane: "in_progress", revision: 1 });
    await expect(executeReadinessPlanningTool(actorId, "move_readiness_card", {
      world_id: worldId, entity_type: "canon_records", id: ids.record, lane: "ready", expected_revision: 0,
    })).rejects.toMatchObject({ status: 409 });
    await expect(executeReadinessPlanningTool(nonAdminId, "list_readiness_cards", { world_id: worldId }))
      .rejects.toMatchObject({ status: 403, code: "forbidden" });
    await expect(executeReadinessPlanningTool(nonAdminId, "move_readiness_card", {
      world_id: worldId, entity_type: "beats", id: ids.beat, lane: "ready", expected_revision: 0,
    })).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});