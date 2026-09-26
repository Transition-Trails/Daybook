import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type NextFunction, type Request, type Response } from "express";
import { db, pool } from "@workspace/db";
import {
  wsCanonRecordsTable,
  wsCanonRecordRelationsTable,
  wsCanonRecordStoryLinksTable,
  wsStoriesTable,
  wsStoryActsTable,
  worldsmithWorldsTable,
  type User,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const { callAi } = vi.hoisted(() => ({ callAi: vi.fn() }));
vi.mock("../lib/ai-proxy.js", () => ({ callAi }));

import editorialRouter from "../routes/worldsmith-editorial.js";

const ADMIN = {
  id: "u-relation-suggestions-test",
  provider: "google",
  email: "relation-suggestions-test@daybook.app",
  name: "Relation Suggestions Test",
  platformRole: "super_admin",
  owned: [],
} as unknown as User;
const app = express();
app.use(express.json());
app.use((_req: Request, _res: Response, next: NextFunction) => {
  (_req as any).log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
  next();
});
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).isAuthenticated = () => true;
  req.user = ADMIN;
  next();
});
app.use("/", editorialRouter);

const RUN = Math.random().toString(36).slice(2, 10);
const WORLD = `rel-suggest-world-${RUN}`;
const STORY = `rel-suggest-story-${RUN}`;
const SOURCE = `rel-suggest-source-${RUN}`;
const CANDIDATE = `rel-suggest-candidate-${RUN}`;
const EMPTY_CANDIDATE = `rel-suggest-empty-candidate-${RUN}`;
const LINKED_EXISTING = `rel-suggest-existing-${RUN}`;
const ids = [SOURCE, CANDIDATE, EMPTY_CANDIDATE, LINKED_EXISTING];
const linkedCandidateIds = [CANDIDATE, EMPTY_CANDIDATE, LINKED_EXISTING];
const linkIds = [
  ...linkedCandidateIds.map((_, index) => `rel-suggest-link-${RUN}-${index}`),
  `rel-suggest-source-link-${RUN}`,
];

beforeAll(async () => {
  await db.insert(worldsmithWorldsTable).values({
    id: WORLD, name: `Relation Suggestion Test ${RUN}`, code: `RS${RUN.slice(0, 4)}`, status: "active",
  }).onConflictDoNothing();
  await db.insert(wsCanonRecordsTable).values(ids.map((id, index) => ({
    id,
    worldId: WORLD,
    name: ["Source Record", "Authentic Candidate", "Empty Candidate", "Already Related"][index],
    status: "proposed",
    canonType: index === 1 || index === 2 ? "character" : "lore",
    narrativeDetails: index === 0
      ? "The keeper guards the sealed archive."
      : index === 1
        ? "The archivist receives the iron archive key from the keeper before the winter siege."
        : "",
    sensoryClauses: "",
    registerLocked: false,
    specRefCount: 0,
  }))).onConflictDoNothing();
  await db.insert(wsStoriesTable).values({
    id: STORY, worldId: WORLD, title: "The Archive's Last Watch",
    summary: "The keeper and the archivist defend the sealed archive.", status: "active",
  }).onConflictDoNothing();
  await db.insert(wsStoryActsTable).values({
    id: `rel-suggest-act-${RUN}`, storyId: STORY, worldId: WORLD, actNumber: 1,
    title: "The Night Watch", narrative: "The keeper entrusts the archive key to the archivist.",
  }).onConflictDoNothing();
  await db.insert(wsCanonRecordStoryLinksTable).values(linkedCandidateIds.map((canonRecordId, index) => ({
    id: linkIds[index], canonRecordId, storyId: STORY, actId: `rel-suggest-act-${RUN}`,
  }))).onConflictDoNothing();
  await db.insert(wsCanonRecordRelationsTable).values({
    fromRecordId: LINKED_EXISTING, toRecordId: SOURCE, relationType: "related",
  }).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(wsCanonRecordRelationsTable)
    .where(inArray(wsCanonRecordRelationsTable.fromRecordId, ids)).catch(() => {});
  await db.delete(wsCanonRecordRelationsTable)
    .where(inArray(wsCanonRecordRelationsTable.toRecordId, ids)).catch(() => {});
  await db.delete(wsCanonRecordStoryLinksTable).where(inArray(wsCanonRecordStoryLinksTable.id, linkIds)).catch(() => {});
  await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.storyId, STORY)).catch(() => {});
  await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, STORY)).catch(() => {});
  await db.delete(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, ids)).catch(() => {});
  await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, WORLD)).catch(() => {});
  await pool.end().catch(() => {});
});

describe("POST canon relation suggestions", () => {
  it("returns no suggestions without linked storylines and does not call AI", async () => {
    callAi.mockReset();
    const res = await request(app).post(`/v1/editorial/canon-records/${SOURCE}/relations/suggest`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ suggestions: [] });
    expect(callAi).not.toHaveBeenCalled();
  });

  it("uses linked evidence, validates IDs/types, and never creates a relation", async () => {
    // Relink the source after the no-storyline guard test.
    await db.insert(wsCanonRecordStoryLinksTable).values({
      id: `rel-suggest-source-link-${RUN}`, canonRecordId: SOURCE, storyId: STORY,
      actId: `rel-suggest-act-${RUN}`,
    }).onConflictDoNothing();
    callAi.mockReset().mockResolvedValue({
      content: JSON.stringify([
        {
          toRecordId: EMPTY_CANDIDATE,
          relationType: "related",
          sourceEvidence: "The keeper guards the sealed archive.",
          targetEvidence: "The keeper entrusts the archive key to the archivist.",
          details: "They are related.",
          rationale: "They share the story.",
          storyId: STORY,
        },
        {
          toRecordId: LINKED_EXISTING,
          targetName: "Model-invented label",
          targetCanonType: "object",
          relationType: "supports",
          sourceEvidence: "The keeper guards the sealed archive.",
          targetEvidence: "The archive's last watch",
          details: "A purported connection.",
          rationale: "A purported reason.",
          storyId: STORY,
        },
        {
          toRecordId: CANDIDATE,
          targetName: "Also fabricated",
          targetCanonType: "lore",
          relationType: "mentor",
          sourceEvidence: "The keeper guards the sealed archive.",
          targetEvidence: "The archivist receives the iron archive key from the keeper before the winter siege.",
          details: "The keeper entrusts the archive key to the archivist.",
          rationale: "They share a specific act in which the keeper passes on responsibility.",
          storyId: STORY,
        },
        {
          toRecordId: CANDIDATE,
          relationType: "not-a-relation",
          details: "Invalid type",
          rationale: "Invalid",
          storyId: STORY,
        },
      ]),
    });

    const before = await db.select().from(wsCanonRecordRelationsTable)
      .where(inArray(wsCanonRecordRelationsTable.toRecordId, ids));
    const res = await request(app).post(`/v1/editorial/canon-records/${SOURCE}/relations/suggest`);
    const after = await db.select().from(wsCanonRecordRelationsTable)
      .where(inArray(wsCanonRecordRelationsTable.toRecordId, ids));

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([{
      toRecordId: CANDIDATE,
      targetName: "Authentic Candidate",
      targetCanonType: "character",
      relationType: "mentor",
      details: "The keeper entrusts the archive key to the archivist.",
      rationale: "They share a specific act in which the keeper passes on responsibility.",
      storyTitle: "The Archive's Last Watch",
      sourceEvidence: "The keeper guards the sealed archive.",
      targetEvidence: "The archivist receives the iron archive key from the keeper before the winter siege.",
      sourceVersion: 1,
      targetVersion: 1,
      storyId: STORY,
    }]);
    expect(after).toHaveLength(before.length);
    expect(callAi).toHaveBeenCalledTimes(1);
  });

  it("enforces versions and current shared-story links for create-only suggested adds", async () => {
    const stale = await request(app)
      .post(`/v1/editorial/canon-records/${SOURCE}/relations`)
      .send({
        to_record_id: CANDIDATE,
        relation_type: "mentor",
        details: "Evidence-based relation.",
        create_only: true,
        expected_source_version: 0,
        expected_target_version: 1,
        story_id: STORY,
      });
    expect(stale.status).toBe(400);

    const versionConflict = await request(app)
      .post(`/v1/editorial/canon-records/${SOURCE}/relations`)
      .send({
        to_record_id: CANDIDATE,
        relation_type: "mentor",
        details: "Evidence-based relation.",
        create_only: true,
        expected_source_version: 2,
        expected_target_version: 1,
        story_id: STORY,
      });
    expect(versionConflict.status).toBe(409);

    const staleStory = await request(app)
      .post(`/v1/editorial/canon-records/${SOURCE}/relations`)
      .send({
        to_record_id: CANDIDATE,
        relation_type: "mentor",
        details: "Evidence-based relation.",
        create_only: true,
        expected_source_version: 1,
        expected_target_version: 1,
        story_id: "no-longer-linked-story",
      });
    expect(staleStory.status).toBe(409);

    const inverseConflict = await request(app)
      .post(`/v1/editorial/canon-records/${SOURCE}/relations`)
      .send({
        to_record_id: LINKED_EXISTING,
        relation_type: "related",
        details: "Must not duplicate inverse edge.",
        create_only: true,
        expected_source_version: 1,
        expected_target_version: 1,
        story_id: STORY,
      });
    expect(inverseConflict.status).toBe(409);

    const added = await request(app)
      .post(`/v1/editorial/canon-records/${SOURCE}/relations`)
      .send({
        to_record_id: CANDIDATE,
        relation_type: "mentor",
        details: "The keeper entrusts the archive key to the archivist.",
        create_only: true,
        expected_source_version: 1,
        expected_target_version: 1,
        story_id: STORY,
      });
    expect(added.status).toBe(201);

    const repeated = await request(app)
      .post(`/v1/editorial/canon-records/${SOURCE}/relations`)
      .send({
        to_record_id: CANDIDATE,
        relation_type: "supports",
        details: "Must not upsert.",
        create_only: true,
        expected_source_version: 1,
        expected_target_version: 1,
        story_id: STORY,
      });
    expect(repeated.status).toBe(409);
    const [relation] = await db.select().from(wsCanonRecordRelationsTable)
      .where(eq(wsCanonRecordRelationsTable.toRecordId, CANDIDATE));
    expect(relation.relationType).toBe("mentor");
    expect(relation.details).toBe("The keeper entrusts the archive key to the archivist.");
  });

  it("returns an explicit AI error for empty model output", async () => {
    callAi.mockReset().mockResolvedValue({ content: "  " });
    const res = await request(app).post(`/v1/editorial/canon-records/${SOURCE}/relations/suggest`);
    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ code: "AI_ERROR" });
  });
});