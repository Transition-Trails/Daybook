import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, wsStoriesTable, worldsmithWorldsTable, type User } from "@workspace/db";
import editorialRouter from "../routes/worldsmith-editorial.js";

const run = randomUUID().slice(0, 8);
const worldId = `story-sequence-${run}`;
const otherWorldId = `story-sequence-other-${run}`;
const ids = ["a", "b", "c"].map(suffix => `${worldId}-${suffix}`);
const otherId = `${otherWorldId}-a`;

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  // Match the request-session stub used by the other editorial route tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const testRequest = req as any;
  testRequest.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  testRequest.isAuthenticated = () => true;
  testRequest.user = { id: `sequence-admin-${run}`, platformRole: "super_admin" } as User;
  next();
});
app.use("/", editorialRouter);

beforeAll(async () => {
  await db.insert(worldsmithWorldsTable).values([
    { id: worldId, name: "Sequence World", code: `SQ${run}` },
    { id: otherWorldId, name: "Other World", code: `SO${run}` },
  ]);
  await db.insert(wsStoriesTable).values([
    ...ids.map((id, index) => ({ id, worldId, title: `Story ${index + 1}` })),
    { id: otherId, worldId: otherWorldId, title: "Other world story" },
  ]);
});

afterAll(async () => {
  await db.delete(wsStoriesTable).where(inArray(wsStoriesTable.id, [...ids, otherId]));
  await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [worldId, otherWorldId]));
});

describe("world-scoped storyline chronology", () => {
  const initial = () => ids.map(id => ({ id, sort_order: 0, sequence_role: "chronological" }));

  it("atomically groups simultaneous stories and reads them back in order", async () => {
    const response = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: worldId, groups: [[ids[1], ids[0]], [ids[2]]], references: [], expected: initial(), expected_revision: 0,
    });
    expect(response.status).toBe(200);
    expect(response.body.stories).toEqual([
      { id: ids[1], sortOrder: 1, sequenceRole: "chronological" },
      { id: ids[0], sortOrder: 1, sequenceRole: "chronological" },
      { id: ids[2], sortOrder: 2, sequenceRole: "chronological" },
    ]);
    const listing = await request(app).get("/v1/editorial/stories").query({ world_id: worldId });
    expect(listing.status).toBe(200);
    expect(listing.body.stories.map((story: { sortOrder: number }) => story.sortOrder)).toEqual([1, 1, 2]);
  });

  it("rejects stale, duplicate, and cross-world layouts without changing the sequence", async () => {
    const stale = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: worldId, groups: [[ids[2]], [ids[0]], [ids[1]]], references: [], expected: initial(), expected_revision: 0,
    });
    expect(stale.status).toBe(409);
    const duplicate = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: worldId, groups: [[ids[0], ids[0]], [ids[2]]], references: [], expected: initial(), expected_revision: 1,
    });
    expect(duplicate.status).toBe(400);
    const duplicateAcrossLanes = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: worldId, groups: [[ids[0]], [ids[1]], [ids[2]]], references: [ids[1]], expected: initial(), expected_revision: 1,
    });
    expect(duplicateAcrossLanes.status).toBe(400);
    const crossWorld = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: worldId, groups: [[ids[0]], [ids[1]], [otherId]], references: [], expected_revision: 1,
      expected: [{ id: ids[0], sort_order: 1, sequence_role: "chronological" }, { id: ids[1], sort_order: 1, sequence_role: "chronological" }, { id: otherId, sort_order: 0, sequence_role: "chronological" }],
    });
    expect(crossWorld.status).toBe(409);
    const rows = await db.select({ id: wsStoriesTable.id, sortOrder: wsStoriesTable.sortOrder })
      .from(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId));
    expect(new Map(rows.map(row => [row.id, row.sortOrder]))).toEqual(
      new Map([[ids[0], 1], [ids[1], 1], [ids[2], 2]]),
    );
  });

  it("moves a cross-era story into references without deleting it or its place history", async () => {
    const response = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: worldId, groups: [[ids[0]], [ids[2]]], references: [ids[1]], expected_revision: 1,
      expected: [
        { id: ids[0], sort_order: 1, sequence_role: "chronological" },
        { id: ids[1], sort_order: 1, sequence_role: "chronological" },
        { id: ids[2], sort_order: 2, sequence_role: "chronological" },
      ],
    });
    expect(response.status).toBe(200);
    expect(response.body.revision).toBe(2);
    expect(response.body.stories.find((story: { id: string }) => story.id === ids[1])).toMatchObject({
      sortOrder: 1, sequenceRole: "reference",
    });
    const listing = await request(app).get("/v1/editorial/stories").query({ world_id: worldId });
    expect(listing.body.stories.find((story: { id: string }) => story.id === ids[1])).toMatchObject({
      sortOrder: 1, sequenceRole: "reference",
    });
    const connections = await request(app).get("/v1/editorial/story-connections").query({ world_id: worldId });
    expect(connections.status).toBe(200);
    expect(connections.body.stories.find((story: { id: string }) => story.id === ids[1]))
      .toMatchObject({ sequenceRole: "reference" });
    expect(connections.body.stories.find((story: { id: string }) => story.id === ids[0]))
      .toMatchObject({ sequenceRole: "chronological" });
    expect(listing.body.sequenceRevision).toBe(2);
    const stale = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: worldId, groups: [[ids[0]], [ids[1]], [ids[2]]], references: [], expected_revision: 1,
      expected: response.body.stories.map((story: { id: string; sortOrder: number; sequenceRole: string }) =>
        ({ id: story.id, sort_order: story.sortOrder, sequence_role: story.sequenceRole })),
    });
    expect(stale.status).toBe(409);
    const wrongWorld = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: otherWorldId, groups: [], references: [ids[1]], expected_revision: 0,
      expected: [{ id: ids[1], sort_order: 1, sequence_role: "reference" }],
    });
    expect(wrongWorld.status).toBe(409);
    const emptyTimeline = await request(app).post("/v1/editorial/stories/sequence").send({
      world_id: worldId, groups: [], references: ids, expected_revision: 2,
      expected: listing.body.stories.map((story: { id: string; sortOrder: number; sequenceRole: string }) =>
        ({ id: story.id, sort_order: story.sortOrder, sequence_role: story.sequenceRole })),
    });
    expect(emptyTimeline.status).toBe(200);
  });

  it("appends newly created stories after the existing moments", async () => {
    const response = await request(app).post("/v1/editorial/stories").send({
      world_id: worldId, title: "New story",
    });
    expect(response.status).toBe(201);
    const story = response.body.story as { id: string; sortOrder: number };
    expect(story.sortOrder).toBe(3);
    await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, story.id));
  });
});