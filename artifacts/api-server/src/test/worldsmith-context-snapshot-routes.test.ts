import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  pool,
  wsCanonRecordsTable,
  wsCollectionsTable,
  wsComponentSpecsTable,
  wsContextSnapshotsTable,
  wsProductionProfilesTable,
  wsProductionSpecsTable,
  wsPromptModulesTable,
  wsPunchTemplatesTable,
  wsStyleGuidesTable,
  wsVolumesTable,
  worldsmithWorldsTable,
  type User,
} from "@workspace/db";

const { mockPublish } = vi.hoisted(() => ({ mockPublish: vi.fn() }));

vi.mock("../lib/worldsmith/context-snapshot.js", async importOriginal => {
  const actual = await importOriginal<typeof import("../lib/worldsmith/context-snapshot.js")>();
  return {
    ...actual,
    ContextSnapshotGitHubPublisher: class {
      publish = mockPublish;
    },
  };
});

import editorialRouter from "../routes/worldsmith-editorial.js";

const run = randomUUID().slice(0, 8);
const worldId = `snapshot-route-world-${run}`;
const recordIds = {
  saveFailure: `snapshot-save-failure-${run}`,
  transition: `snapshot-transition-${run}`,
  bulkA: `snapshot-bulk-a-${run}`,
  bulkB: `snapshot-bulk-b-${run}`,
};
const allRecordIds = Object.values(recordIds);

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testRequest = req as any;
    testRequest.log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    testRequest.isAuthenticated = () => true;
    testRequest.user = { id: `snapshot-admin-${run}`, platformRole: "super_admin" } as User;
    next();
  });
  app.use("/", editorialRouter);
  return app;
}

const app = makeApp();

beforeAll(async () => {
  await pool.query(
    `ALTER TABLE "ws_context_snapshots"
      ADD COLUMN IF NOT EXISTS "auto_sync_unaccepted" boolean DEFAULT false NOT NULL`,
  );
  await db.insert(worldsmithWorldsTable).values({ id: worldId, name: "Snapshot Route World", code: "SRT" });
  await db.insert(wsCanonRecordsTable).values([
    { id: recordIds.saveFailure, worldId, name: "Save Failure", status: "accepted", canonType: "location" },
    { id: recordIds.transition, worldId, name: "Transition", status: "under_review", canonType: "event" },
    { id: recordIds.bulkA, worldId, name: "Bulk A", status: "under_review", canonType: "object" },
    { id: recordIds.bulkB, worldId, name: "Bulk B", status: "under_review", canonType: "object" },
  ]);
  await db.insert(wsContextSnapshotsTable).values(allRecordIds.map(entityId => ({
    entityType: "canon_record",
    entityId,
    worldId,
    githubPath: `worlds/${worldId}/context/canon/${entityId}.md`,
    autoSync: true,
  })));
});

afterAll(async () => {
  await db.delete(wsContextSnapshotsTable).where(inArray(wsContextSnapshotsTable.entityId, allRecordIds));
  await db.delete(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, allRecordIds));
  await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
});

beforeEach(() => {
  mockPublish.mockReset();
  mockPublish.mockImplementation(async (path: string) => ({ path, commitSha: `commit-${randomUUID()}` }));
});

describe("governed Context Snapshot routes", () => {
  it("persists policy changes without publishing", async () => {
    const response = await request(app)
      .patch(`/v1/editorial/canon-records/${recordIds.transition}/context-snapshot`)
      .send({ auto_sync: false, auto_sync_unaccepted: false });

    expect(response.status).toBe(200);
    expect(response.body.snapshot.autoSync).toBe(false);
    expect(mockPublish).not.toHaveBeenCalled();

    await request(app)
      .patch(`/v1/editorial/canon-records/${recordIds.transition}/context-snapshot`)
      .send({ auto_sync: true, auto_sync_unaccepted: false })
      .expect(200);
  });

  it("keeps an accepted Daybook save successful and records Sync Failed when GitHub fails", async () => {
    mockPublish.mockRejectedValueOnce(new Error("GitHub unavailable"));
    const response = await request(app)
      .patch(`/v1/editorial/canon-records/${recordIds.saveFailure}`)
      .send({ name: "Save Failure Updated" });

    expect(response.status).toBe(200);
    expect(response.body.canon_record.name).toBe("Save Failure Updated");
    expect(response.body.context_snapshot_status).toBe("sync_failed");
    const [stored] = await db.select().from(wsContextSnapshotsTable).where(eq(
      wsContextSnapshotsTable.entityId,
      recordIds.saveFailure,
    ));
    expect(stored?.status).toBe("sync_failed");
  });

  it("publishes after individual acceptance", async () => {
    const response = await request(app)
      .post(`/v1/editorial/canon-records/${recordIds.transition}/transition`)
      .send({ status: "accepted" });

    expect(response.status).toBe(200);
    expect(response.body.context_snapshot_status).toBe("current");
    expect(mockPublish).toHaveBeenCalledOnce();
  });

  it("publishes every enabled record after bulk acceptance and reports per-record outcomes", async () => {
    mockPublish
      .mockImplementationOnce(async (path: string) => ({ path, commitSha: "bulk-success" }))
      .mockRejectedValueOnce(new Error("second snapshot failed"));
    const response = await request(app)
      .post("/v1/editorial/canon-records/bulk-transition")
      .send({ ids: [recordIds.bulkA, recordIds.bulkB], status: "accepted" });

    expect(response.status).toBe(200);
    expect(response.body.updated).toBe(2);
    expect(response.body.context_snapshots).toMatchObject({
      current: 1,
      sync_failed: 1,
      skipped: 0,
    });
    expect(response.body.context_snapshots.results).toHaveLength(2);
  });
});

const editorialIds = {
  "production-specs": `snapshot-spec-${run}`,
  "component-specs": `snapshot-component-${run}`,
  "style-guides": `snapshot-style-${run}`,
  "prompt-modules": `snapshot-module-${run}`,
  collections: `snapshot-collection-${run}`,
  volumes: `snapshot-volume-${run}`,
  "production-profiles": `snapshot-profile-${run}`,
  "punch-templates": `snapshot-punch-${run}`,
};
const editorialResources = Object.keys(editorialIds) as Array<keyof typeof editorialIds>;

describe("editorial context snapshot compatibility routes", () => {
  beforeAll(async () => {
    await db.insert(wsCollectionsTable).values({ id: editorialIds.collections, worldId, name: "Collection", status: "draft" });
    await db.insert(wsVolumesTable).values({ id: editorialIds.volumes, worldId, collectionId: editorialIds.collections, name: "Volume", status: "draft" });
    await db.insert(wsStyleGuidesTable).values({ id: editorialIds["style-guides"], worldId, name: "Style", content: "" });
    await db.insert(wsComponentSpecsTable).values({ id: editorialIds["component-specs"], worldId, name: "Component", componentType: "cover", content: "" });
    await db.insert(wsPromptModulesTable).values({ id: editorialIds["prompt-modules"], worldId, name: "Module", content: "", dependencyIds: [] });
    await db.insert(wsPunchTemplatesTable).values({ id: editorialIds["punch-templates"], name: "Punch", code: `P${run}`, status: "draft" });
    await db.insert(wsProductionProfilesTable).values({ id: editorialIds["production-profiles"], name: "Profile", code: `PR${run}`, outputMedium: "print", orientationBehavior: "portrait" });
    await db.insert(wsProductionSpecsTable).values({ id: editorialIds["production-specs"], worldId, productionItem: "Spec", status: "draft", promptModuleIds: [], canonRecordIds: [] });
  });

  afterAll(async () => {
    await db.delete(wsContextSnapshotsTable).where(inArray(wsContextSnapshotsTable.entityId, Object.values(editorialIds)));
    await db.delete(wsProductionSpecsTable).where(eq(wsProductionSpecsTable.id, editorialIds["production-specs"]));
    await db.delete(wsComponentSpecsTable).where(eq(wsComponentSpecsTable.id, editorialIds["component-specs"]));
    await db.delete(wsStyleGuidesTable).where(eq(wsStyleGuidesTable.id, editorialIds["style-guides"]));
    await db.delete(wsPromptModulesTable).where(eq(wsPromptModulesTable.id, editorialIds["prompt-modules"]));
    await db.delete(wsVolumesTable).where(eq(wsVolumesTable.id, editorialIds.volumes));
    await db.delete(wsCollectionsTable).where(eq(wsCollectionsTable.id, editorialIds.collections));
    await db.delete(wsProductionProfilesTable).where(eq(wsProductionProfilesTable.id, editorialIds["production-profiles"]));
    await db.delete(wsPunchTemplatesTable).where(eq(wsPunchTemplatesTable.id, editorialIds["punch-templates"]));
  });

  it.each(editorialResources)("GET status and POST update work for %s", async (resource) => {
    const id = editorialIds[resource];
    const status = await request(app).get(`/worldsmith/editorial/context-snapshots/${resource}/${id}/status`);
    expect(status.status).toBe(200);
    expect(status.body.status).toMatchObject({
      status: "not_generated",
      githubPath: expect.stringContaining("context/"),
    });

    mockPublish.mockResolvedValueOnce({ path: status.body.status.githubPath, commitSha: `sha-${run}` });
    const update = await request(app).post(`/worldsmith/editorial/context-snapshots/${resource}/${id}/update`);
    expect(update.status).toBe(200);
    expect(update.body.status).toMatchObject({ status: "current", githubCommitSha: `sha-${run}` });
  });

  it("marks a volume snapshot out of date when its linked collection changes", async () => {
    await db.update(wsCollectionsTable)
      .set({ name: "Renamed Collection", updatedAt: new Date(Date.now() + 1_000) })
      .where(eq(wsCollectionsTable.id, editorialIds.collections));

    const status = await request(app)
      .get(`/worldsmith/editorial/context-snapshots/volumes/${editorialIds.volumes}/status`);

    expect(status.status).toBe(200);
    expect(status.body.status.status).toBe("out_of_date");
  });
});