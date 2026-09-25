import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db, worldsmithWorldsTable, wsStoriesTable, wsStoryBeatsTable, wsRevealThreadsTable, type User } from "@workspace/db";
import editorialRouter from "../routes/worldsmith-editorial.js";
import foundationRouter from "../routes/worldsmith-foundation.js";

const suffix = randomUUID().slice(0, 8);
const worldId = `child-world-${suffix}`;
const otherWorldId = `other-child-world-${suffix}`;
const storyId = `child-story-${suffix}`;
const otherStoryId = `other-child-story-${suffix}`;
const beatId = `child-beat-${suffix}`;
const revealId = `child-reveal-${suffix}`;
const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  const session = req as any;
  session.isAuthenticated = () => true;
  session.user = { id: `child-admin-${suffix}`, platformRole: "super_admin" } as User;
  next();
});
app.use(editorialRouter);
app.use(foundationRouter);

beforeAll(async () => {
  await db.insert(worldsmithWorldsTable).values([
    { id: worldId, name: "Child world", code: `CW${suffix}` },
    { id: otherWorldId, name: "Other child world", code: `OC${suffix}` },
  ]);
  await db.insert(wsStoriesTable).values([
    { id: storyId, worldId, title: "Story" },
    { id: otherStoryId, worldId: otherWorldId, title: "Other story" },
  ]);
  await db.insert(wsStoryBeatsTable).values({ id: beatId, storyId, worldId, title: "Beginning", beatType: "setup", status: "locked" });
  await db.insert(wsRevealThreadsTable).values({ id: revealId, storyId, worldId, title: "Hidden letter", truth: "A letter exists", details: { custom: "retain" } });
});
afterAll(async () => {
  await db.delete(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.storyId, storyId));
  await db.delete(wsRevealThreadsTable).where(eq(wsRevealThreadsTable.storyId, storyId));
  await db.delete(wsStoriesTable).where(inArray(wsStoriesTable.id, [storyId, otherStoryId]));
  await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [worldId, otherWorldId]));
});

describe("admin storyline children", () => {
  it("keeps identities and lifecycle status, creates new rows, and rejects stale revisions", async () => {
    const before = await request(app).get(`/v1/editorial/stories/${storyId}/beats`).query({ world_id: worldId });
    expect(before.status).toBe(200);
    const original = before.body.beats[0];
    const payload = { world_id: worldId, beats: [
      { id: beatId, revision: original.revision, beat_type: "setup", title: "Beginning revised", summary: "", sort_order: 0, details: {} },
      { beat_type: "climax", title: "Ending", summary: "", sort_order: 1, details: {} },
    ], deleted: [] };
    const saved = await request(app).put(`/v1/editorial/stories/${storyId}/beats`).send(payload);
    expect(saved.status).toBe(200);
    expect(saved.body.beats[0]).toMatchObject({ id: beatId, title: "Beginning revised", status: "locked" });
    expect(saved.body.beats[1].id).toBeTruthy();
    expect((await request(app).put(`/v1/editorial/stories/${storyId}/beats`).send(payload)).status).toBe(409);
    expect((await request(app).put(`/v1/editorial/stories/${otherStoryId}/beats`)
      .send({ ...payload, world_id: otherWorldId })).status).toBe(409);
    expect((await request(app).put(`/v1/editorial/stories/${storyId}/beats`)
      .send({ ...payload, world_id: otherWorldId })).status).toBe(404);
    expect((await request(app).put(`/v1/editorial/stories/${storyId}/beats`)
      .send({ ...payload, beats: [{ ...payload.beats[0], status: "draft" }] })).status).toBe(400);
  });

  it("updates reveal prose without dropping other details and removes only explicitly deleted rows", async () => {
    const before = await request(app).get(`/v1/editorial/stories/${storyId}/reveals`).query({ world_id: worldId });
    const original = before.body.reveals[0];
    const saved = await request(app).put(`/v1/editorial/stories/${storyId}/reveals`).send({
      world_id: worldId, reveals: [{ id: revealId, revision: original.revision, title: "Hidden letter", truth: "A different letter", audience_knowledge: null, details: original.details }],
      deleted: [],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.reveals[0]).toMatchObject({ id: revealId, truth: "A different letter", details: { custom: "retain" } });
    const removed = await request(app).put(`/v1/editorial/stories/${storyId}/reveals`).send({
      world_id: worldId, reveals: [], deleted: [{ id: revealId, revision: saved.body.reveals[0].revision }],
    });
    expect(removed.status).toBe(200);
    expect(removed.body.reveals).toEqual([]);
  });
});