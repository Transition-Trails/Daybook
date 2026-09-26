import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import sharp from "sharp";
import { eq, inArray } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  db,
  pool,
  wsCanonRecordsTable,
  wsAssetsTable,
  mcpCanonHistoryTable,
  wsCollectionsTable,
  wsComponentSpecsTable,
  wsContextSnapshotsTable,
  wsProductionProfilesTable,
  wsProductionSpecsTable,
  wsPromptModulesTable,
  wsPunchTemplatesTable,
  wsStyleGuidesTable,
  wsStoriesTable,
  wsStoryActsTable,
  wsScenesTable,
  wsSceneCanonLinksTable,
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
      publishFiles = mockPublish;
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
  archiveSuccess: `snapshot-archive-success-${run}`,
  archiveFailure: `snapshot-archive-failure-${run}`,
  versionedPatch: `snapshot-versioned-patch-${run}`,
  imageRoles: `snapshot-image-roles-${run}`,
  interrupted: `snapshot-interrupted-${run}`,
};
const allRecordIds = Object.values(recordIds);

function expectedAsset(path: string, approval = "approved") {
  return {
    object_path: path, role: "primary", title: "Primary", alt_text: "",
    source: "upload", source_credit: null, rights_status: "unknown",
    approval_status: approval, canonical_strength: "canonical",
    generation_prompt: null, generation_model: null, positive_guidance: null,
    negative_guidance: null, width: null, height: null, byte_size: null, checksum: null,
  };
}

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
    { id: recordIds.archiveSuccess, worldId, name: "Archive Success", status: "accepted", canonType: "location" },
    { id: recordIds.archiveFailure, worldId, name: "Archive Failure", status: "accepted", canonType: "character" },
    { id: recordIds.versionedPatch, worldId, name: "Versioned Patch", status: "accepted", canonType: "character" },
    { id: recordIds.imageRoles, worldId, name: "Image Roles", status: "under_review", canonType: "location" },
    { id: recordIds.interrupted, worldId, name: "Interrupted", status: "accepted", canonType: "location" },
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
  await db.delete(wsAssetsTable).where(eq(wsAssetsTable.recordId, recordIds.imageRoles));
  await db.delete(mcpCanonHistoryTable).where(inArray(mcpCanonHistoryTable.recordId, allRecordIds));
  await db.delete(wsContextSnapshotsTable).where(inArray(wsContextSnapshotsTable.entityId, allRecordIds));
  await db.delete(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, allRecordIds));
  await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
});

beforeEach(() => {
  mockPublish.mockReset();
  mockPublish.mockImplementation(async (path: string) => ({ path, commitSha: `commit-${randomUUID()}` }));
});

describe("governed Context Snapshot routes", () => {
  it("reports every world image blocker in status and batch results, then clears them when fixed", async () => {
    const first = "/objects/uploads/multiple-blockers-one";
    const second = "/objects/uploads/multiple-blockers-two";
    await db.update(wsCanonRecordsTable).set({
      imageGallery: [{ url: first, name: "First", description: "", role: "primary" }],
    }).where(eq(wsCanonRecordsTable.id, recordIds.imageRoles));
    await db.update(wsCanonRecordsTable).set({
      imageGallery: [{ url: second, name: "Second", description: "", role: "primary" }],
    }).where(eq(wsCanonRecordsTable.id, recordIds.bulkA));
    try {
      const status = await request(app).get(`/v1/editorial/canon-records/${recordIds.saveFailure}/context-snapshot`);
      expect(status.status).toBe(200);
      expect(status.body.snapshot.status).toBe("blocked");
      expect(status.body.snapshot.imageIssues).toEqual(expect.arrayContaining([
        expect.objectContaining({ recordId: recordIds.imageRoles, recordName: "Image Roles", message: expect.stringContaining("no approved asset metadata") }),
        expect.objectContaining({ recordId: recordIds.bulkA, recordName: "Bulk A", message: expect.stringContaining("no approved asset metadata") }),
      ]));
      expect(status.body.snapshot.imageIssues).toHaveLength(2);
      expect(status.body.snapshot.imageIssue).toEqual(status.body.snapshot.imageIssues[0]);

      // A no-op outdated batch still reports world-wide blockers without
      // publishing unrelated test fixtures or leaving failed snapshot rows.
      const future = new Date(Date.now() + 60_000);
      await db.update(wsContextSnapshotsTable).set({
        status: "current", recordUpdatedAt: future, lastSnapshotAt: future,
      }).where(inArray(wsContextSnapshotsTable.entityId, allRecordIds));
      const batch = await request(app).post(`/v1/editorial/worlds/${worldId}/context-snapshots`).send({ mode: "outdated" });
      expect(batch.status).toBe(202);
      expect(batch.body.imageIssues.map((issue: { recordId: string }) => issue.recordId).sort())
        .toEqual([recordIds.bulkA, recordIds.imageRoles].sort());
      const job = (await request(app).get(`/v1/editorial/context-snapshot-jobs/${batch.body.id}`)).body;
      expect(job.status).toBe("complete");
      expect(job.imageIssues).toHaveLength(2);

      await db.update(wsCanonRecordsTable).set({ imageGallery: [] })
        .where(inArray(wsCanonRecordsTable.id, [recordIds.imageRoles, recordIds.bulkA]));
      const fixed = await request(app).get(`/v1/editorial/canon-records/${recordIds.saveFailure}/context-snapshot`);
      expect(fixed.body.snapshot.imageIssues).toEqual([]);
      expect(fixed.body.snapshot.imageIssue).toBeNull();
    } finally {
      await db.update(wsContextSnapshotsTable).set({
        status: "not_generated", recordUpdatedAt: null, lastSnapshotAt: null, lastError: null,
      }).where(inArray(wsContextSnapshotsTable.entityId, allRecordIds));
      await db.update(wsCanonRecordsTable).set({ imageGallery: [] })
        .where(inArray(wsCanonRecordsTable.id, [recordIds.imageRoles, recordIds.bulkA]));
    }
  });

  it("loads status without downloading images, and gives review guidance for missing or draft primaries", async () => {
    const first = "/objects/uploads/snapshot-image-one";
    const second = "/objects/uploads/snapshot-image-two";
    await db.update(wsCanonRecordsTable).set({
      imageGallery: [
        { url: first, name: "First", description: "", role: "reference" },
        { url: second, name: "Second", description: "", role: "reference" },
      ],
      portraitUrl: first,
    }).where(eq(wsCanonRecordsTable.id, recordIds.imageRoles));
    await db.insert(wsAssetsTable).values([
      { id: `snapshot-asset-one-${run}`, worldId, recordId: recordIds.imageRoles, role: "reference", title: "First", objectPath: first, source: "upload", approvalStatus: "approved", canonicalStrength: "reference" },
      { id: `snapshot-asset-two-${run}`, worldId, recordId: recordIds.imageRoles, role: "reference", title: "Second", objectPath: second, source: "upload", approvalStatus: "approved", canonicalStrength: "reference" },
    ]);

    const missing = await request(app).get(`/v1/editorial/canon-records/${recordIds.imageRoles}/context-snapshot`);
    expect(missing.status).toBe(200);
    expect(missing.body.snapshot.status).toBe("blocked");
    expect(missing.body.snapshot.imageIssue).toMatchObject({ recordId: recordIds.imageRoles, message: expect.stringContaining("designated as primary") });
    expect(missing.body.snapshot.githubPath).toContain("image-roles");
    const invalidSave = await request(app)
      .patch(`/v1/editorial/canon-records/${recordIds.imageRoles}`)
      .send({ image_gallery: [
        { url: first, role: "reference" },
        { url: second, role: "reference" },
      ] });
    expect(invalidSave.status).toBe(400);

    await db.update(wsCanonRecordsTable).set({
      imageGallery: [
        { url: first, name: "First", description: "", role: "primary" },
        { url: second, name: "Second", description: "", role: "reference" },
      ],
    }).where(eq(wsCanonRecordsTable.id, recordIds.imageRoles));
    await db.update(wsAssetsTable).set({ role: "primary", approvalStatus: "draft" })
      .where(eq(wsAssetsTable.objectPath, first));
    const draft = await request(app).get(`/v1/editorial/canon-records/${recordIds.imageRoles}/context-snapshot`);
    expect(draft.body.snapshot.status).toBe("blocked");
    expect(draft.body.snapshot.imageIssue.message).toContain("not approved for export");

    await db.update(wsAssetsTable).set({ approvalStatus: "approved" }).where(eq(wsAssetsTable.objectPath, first));
    const valid = await request(app).get(`/v1/editorial/canon-records/${recordIds.imageRoles}/context-snapshot`);
    expect(valid.status).toBe(200);
    expect(valid.body.snapshot.status).toBe("not_generated");
    expect(valid.body.snapshot.imageIssue).toBeNull();
    await db.delete(wsAssetsTable).where(eq(wsAssetsTable.recordId, recordIds.imageRoles));
    await db.update(wsCanonRecordsTable).set({ imageGallery: [], portraitUrl: null })
      .where(eq(wsCanonRecordsTable.id, recordIds.imageRoles));
  });

  it("does not auto-publish an accepted record's newly uploaded primary before its draft asset is saved", async () => {
    const imagePath = "/objects/uploads/unsynced-primary";
    await db.update(wsCanonRecordsTable).set({ status: "accepted" })
      .where(eq(wsCanonRecordsTable.id, recordIds.imageRoles));
    try {
      const saved = await request(app)
        .patch(`/v1/editorial/canon-records/${recordIds.imageRoles}`)
        .send({ image_gallery: [{ url: imagePath, role: "primary" }], portrait_url: imagePath });
      expect(saved.status).toBe(200);
      expect(saved.body.context_snapshot_status).toBe("sync_failed");
      expect(mockPublish).not.toHaveBeenCalled();

      const status = await request(app).get(`/v1/editorial/canon-records/${recordIds.imageRoles}/context-snapshot`);
      expect(status.status).toBe(200);
      expect(status.body.snapshot.status).toBe("blocked");
      expect(status.body.snapshot.imageIssue).toMatchObject({
        recordId: recordIds.imageRoles,
        message: expect.stringContaining("no approved asset metadata"),
      });
      const manual = await request(app).post(`/v1/editorial/canon-records/${recordIds.imageRoles}/context-snapshot`);
      expect(manual.status).toBe(409);
      expect(manual.body.code).toBe("CANON_IMAGE_DESIGNATION_REQUIRED");
      expect(mockPublish).not.toHaveBeenCalled();
    } finally {
      await db.update(wsCanonRecordsTable).set({ status: "under_review", imageGallery: [], portraitUrl: null })
        .where(eq(wsCanonRecordsTable.id, recordIds.imageRoles));
    }
  });

  it("defers an accepted editor save until primary approval is persisted, without bypassing approval", async () => {
    const imagePath = "/objects/uploads/editor-approved-primary";
    const url = `/v1/editorial/canon-records/${recordIds.imageRoles}`;
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#553322" } }).png().toBuffer();
    const storage = vi.spyOn(ObjectStorageService.prototype, "getObjectEntityFile").mockResolvedValue({
      download: async () => [bytes],
      getMetadata: async () => [{ contentType: "image/png", updated: new Date().toISOString() }],
    } as never);
    await db.update(wsCanonRecordsTable).set({ status: "accepted" })
      .where(eq(wsCanonRecordsTable.id, recordIds.imageRoles));
    try {
      const saved = await request(app).patch(url).send({
        image_gallery: [{ url: imagePath, role: "primary" }],
        defer_auto_snapshot: true,
      });
      expect(saved.status).toBe(200);
      expect(saved.body.context_snapshot_status).toBeNull();
      expect(mockPublish).not.toHaveBeenCalled();

      const finish = () => request(app).post(`${url}/context-snapshot/auto-sync`)
        .send({ expected_version: saved.body.canon_record.version });
      const blocked = await finish();
      expect(blocked.status).toBe(200);
      expect(blocked.body.context_snapshot_status).toBe("sync_failed");
      expect(mockPublish).not.toHaveBeenCalled();

      await db.insert(wsAssetsTable).values({
        id: `snapshot-editor-approved-${run}`, worldId, recordId: recordIds.imageRoles,
        role: "primary", title: "Primary", objectPath: imagePath, source: "upload",
        approvalStatus: "approved", canonicalStrength: "canonical",
      });
      const published = await finish();
      expect(published.status).toBe(200);
      expect(published.body.context_snapshot_status).toBe("current");
      expect(mockPublish).toHaveBeenCalledOnce();
      const status = await request(app).get(`${url}/context-snapshot`);
      expect(status.body.snapshot.status).toBe("current");

      const stale = await request(app).post(`${url}/context-snapshot/auto-sync`)
        .send({ expected_version: saved.body.canon_record.version - 1 });
      expect(stale.status).toBe(409);
      expect(mockPublish).toHaveBeenCalledOnce();
    } finally {
      storage.mockRestore();
      await db.delete(wsAssetsTable).where(eq(wsAssetsTable.recordId, recordIds.imageRoles));
      await db.update(wsCanonRecordsTable).set({ status: "under_review", imageGallery: [], portraitUrl: null })
        .where(eq(wsCanonRecordsTable.id, recordIds.imageRoles));
    }
  });

  it("reconciles an interrupted image save only after assets are complete and approved", async () => {
    const url = `/v1/editorial/canon-records/${recordIds.interrupted}`;
    const imagePath = "/objects/uploads/interrupted-primary";
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#553322" } }).png().toBuffer();
    const storage = vi.spyOn(ObjectStorageService.prototype, "getObjectEntityFile").mockResolvedValue({
      download: async () => [bytes],
      getMetadata: async () => [{ contentType: "image/png", updated: new Date().toISOString() }],
    } as never);
    try {
      const saved = await request(app).patch(url).send({
        image_gallery: [{ url: imagePath, role: "primary" }],
        portrait_url: imagePath,
        defer_auto_snapshot: true,
        expected_snapshot_assets: [expectedAsset(imagePath, "draft")],
      });
      expect(saved.status).toBe(200);
      const version = saved.body.canon_record.version;
      const reconcile = () => request(app).post(`${url}/context-snapshot/reconcile`).send({ expected_version: version });
      expect((await request(app).get(`${url}/context-snapshot`)).body.snapshot.pendingReconciliation).toBe(true);
      expect((await reconcile()).body.pending).toBe(true); // still in the grace period
      await db.update(wsContextSnapshotsTable).set({ updatedAt: new Date(Date.now() - 90_000) })
        .where(eq(wsContextSnapshotsTable.entityId, recordIds.interrupted));
      expect((await reconcile()).body.pending).toBe(true); // missing asset metadata
      expect(mockPublish).not.toHaveBeenCalled();

      await db.insert(wsAssetsTable).values({
        id: `snapshot-interrupted-asset-${run}`, worldId, recordId: recordIds.interrupted,
        role: "primary", title: "Primary", objectPath: imagePath, source: "upload",
        approvalStatus: "draft", canonicalStrength: "canonical",
      });
      const draft = await reconcile();
      expect(draft.body.context_snapshot_status).toBe("sync_failed");
      expect(mockPublish).not.toHaveBeenCalled();

      await db.update(wsAssetsTable).set({ approvalStatus: "approved" })
        .where(eq(wsAssetsTable.recordId, recordIds.interrupted));
      // A review blocker requires a fresh eligible save (or a manual retry).
      const savedAgain = await request(app).patch(url).send({
        defer_auto_snapshot: true, expected_snapshot_assets: [expectedAsset(imagePath)],
      });
      expect(savedAgain.status).toBe(200);
      await db.update(wsContextSnapshotsTable).set({ updatedAt: new Date(Date.now() - 90_000) })
        .where(eq(wsContextSnapshotsTable.entityId, recordIds.interrupted));
      const recovered = await request(app).post(`${url}/context-snapshot/reconcile`)
        .send({ expected_version: savedAgain.body.canon_record.version });
      expect(recovered.body.context_snapshot_status).toBe("current");
      expect(mockPublish).toHaveBeenCalledOnce();
      expect((await request(app).get(`${url}/context-snapshot`)).body.snapshot.pendingReconciliation).toBe(false);
      expect((await reconcile()).status).toBe(409); // previous version cannot re-publish
    } finally {
      storage.mockRestore();
      await db.delete(wsAssetsTable).where(eq(wsAssetsTable.recordId, recordIds.interrupted));
      await db.update(wsCanonRecordsTable).set({ imageGallery: [], portraitUrl: null })
        .where(eq(wsCanonRecordsTable.id, recordIds.interrupted));
    }
  });

  it("does not publish an existing approved image when its pending editor save changes approval to draft", async () => {
    const url = `/v1/editorial/canon-records/${recordIds.interrupted}`;
    const path = "/objects/uploads/approval-interrupted";
    await db.update(wsCanonRecordsTable).set({
      imageGallery: [{ url: path, role: "primary", name: "Primary", description: "" }],
      portraitUrl: path,
    }).where(eq(wsCanonRecordsTable.id, recordIds.interrupted));
    await db.insert(wsAssetsTable).values({
      id: `snapshot-approval-interrupted-${run}`, worldId, recordId: recordIds.interrupted,
      role: "primary", title: "Primary", objectPath: path, source: "upload",
      approvalStatus: "approved", canonicalStrength: "canonical", rightsStatus: "unknown",
    });
    try {
      const saved = await request(app).patch(url).send({
        defer_auto_snapshot: true, image_gallery: [{ url: path, role: "primary" }],
        expected_snapshot_assets: [expectedAsset(path, "draft")],
      });
      expect(saved.status).toBe(200);
      await db.update(wsContextSnapshotsTable).set({ updatedAt: new Date(Date.now() - 90_000) })
        .where(eq(wsContextSnapshotsTable.entityId, recordIds.interrupted));
      const reconcile = () => request(app).post(`${url}/context-snapshot/reconcile`)
        .send({ expected_version: saved.body.canon_record.version });
      expect((await reconcile()).body.pending).toBe(true);
      expect(mockPublish).not.toHaveBeenCalled();
      await db.update(wsAssetsTable).set({ approvalStatus: "draft", role: "reference" })
        .where(eq(wsAssetsTable.recordId, recordIds.interrupted));
      expect((await reconcile()).body.pending).toBe(true); // role update still incomplete
      await db.update(wsAssetsTable).set({ role: "primary" })
        .where(eq(wsAssetsTable.recordId, recordIds.interrupted));
      expect((await reconcile()).body.context_snapshot_status).toBe("sync_failed");
      expect(mockPublish).not.toHaveBeenCalled();
    } finally {
      await db.delete(wsAssetsTable).where(eq(wsAssetsTable.recordId, recordIds.interrupted));
      await db.update(wsCanonRecordsTable).set({ imageGallery: [], portraitUrl: null })
        .where(eq(wsCanonRecordsTable.id, recordIds.interrupted));
    }
  });

  it("honors policy changes and does not reconcile an interrupted save when auto-sync is disabled", async () => {
    const url = `/v1/editorial/canon-records/${recordIds.interrupted}`;
    const saved = await request(app).patch(url).send({ name: "Interrupted policy save", defer_auto_snapshot: true });
    expect(saved.status).toBe(200);
    await request(app).patch(`${url}/context-snapshot`).send({ auto_sync: false }).expect(200);
    await db.update(wsContextSnapshotsTable).set({ updatedAt: new Date(Date.now() - 90_000) })
      .where(eq(wsContextSnapshotsTable.entityId, recordIds.interrupted));
    const result = await request(app).post(`${url}/context-snapshot/reconcile`)
      .send({ expected_version: saved.body.canon_record.version });
    expect(result.body.context_snapshot_status).toBeNull();
    expect(mockPublish).not.toHaveBeenCalled();
    expect((await request(app).get(`${url}/context-snapshot`)).body.snapshot.pendingReconciliation).toBe(false);
    await request(app).patch(`${url}/context-snapshot`).send({ auto_sync: true }).expect(200);
  });

  it("does not recover unaccepted Canon unless its explicit auto-sync policy allows it", async () => {
    const url = `/v1/editorial/canon-records/${recordIds.imageRoles}`;
    const first = await request(app).patch(url).send({ name: "Unaccepted pending", defer_auto_snapshot: true });
    expect(first.status).toBe(200);
    expect((await request(app).get(`${url}/context-snapshot`)).body.snapshot.pendingReconciliation).toBe(false);
    await request(app).patch(`${url}/context-snapshot`)
      .send({ auto_sync: true, auto_sync_unaccepted: true }).expect(200);
    try {
      const second = await request(app).patch(url).send({ defer_auto_snapshot: true, expected_snapshot_assets: [] });
      expect(second.status).toBe(200);
      expect((await request(app).get(`${url}/context-snapshot`)).body.snapshot.pendingReconciliation).toBe(true);
      await db.update(wsContextSnapshotsTable).set({ updatedAt: new Date(Date.now() - 90_000) })
        .where(eq(wsContextSnapshotsTable.entityId, recordIds.imageRoles));
      const recovered = await request(app).post(`${url}/context-snapshot/reconcile`)
        .send({ expected_version: second.body.canon_record.version });
      expect(recovered.body.context_snapshot_status).toBe("current");
      expect(mockPublish).toHaveBeenCalledOnce();
    } finally {
      await request(app).patch(`${url}/context-snapshot`)
        .send({ auto_sync: true, auto_sync_unaccepted: false }).expect(200);
    }
  });

  it("does not publish a deferred save when auto-sync policy is disabled", async () => {
    const url = `/v1/editorial/canon-records/${recordIds.saveFailure}`;
    await request(app).patch(`${url}/context-snapshot`).send({ auto_sync: false }).expect(200);
    try {
      const saved = await request(app).patch(url).send({ name: "Policy Disabled", defer_auto_snapshot: true });
      expect(saved.status).toBe(200);
      expect(saved.body.context_snapshot_status).toBeNull();
      const finished = await request(app).post(`${url}/context-snapshot/auto-sync`)
        .send({ expected_version: saved.body.canon_record.version });
      expect(finished.status).toBe(200);
      expect(finished.body.context_snapshot_status).toBeNull();
      expect(mockPublish).not.toHaveBeenCalled();
    } finally {
      await request(app).patch(`${url}/context-snapshot`).send({ auto_sync: true }).expect(200);
    }
  });

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

  it("bumps version and audits legacy canon PATCH writes atomically, rejecting stale versions", async () => {
    const [before] = await db.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordIds.versionedPatch));
    const response = await request(app)
      .patch(`/v1/editorial/canon-records/${recordIds.versionedPatch}`)
      .send({ name: "Versioned Patch Updated" });

    expect(response.status).toBe(200);
    expect(response.body.canon_record.version).toBe(before.version + 1);
    const history = await db.select().from(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, recordIds.versionedPatch));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      actorUserId: `snapshot-admin-${run}`,
      changeType: "canon_patch",
      diff: { name: { before: "Versioned Patch", after: "Versioned Patch Updated" } },
    });

    const stale = await request(app)
      .patch(`/v1/editorial/canon-records/${recordIds.versionedPatch}`)
      .send({ name: "Stale update", expected_version: before.version });
    expect(stale.status).toBe(409);
    const [after] = await db.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordIds.versionedPatch));
    expect(after.name).toBe("Versioned Patch Updated");
    expect(after.version).toBe(before.version + 1);
  });

  it("publishes after individual acceptance", async () => {
    const [before] = await db.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordIds.transition));
    const response = await request(app)
      .post(`/v1/editorial/canon-records/${recordIds.transition}/transition`)
      .send({ status: "accepted" });

    expect(response.status).toBe(200);
    expect(response.body.canon_record.version).toBe(before.version + 1);
    const history = await db.select().from(mcpCanonHistoryTable).where(eq(mcpCanonHistoryTable.recordId, recordIds.transition));
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      actorUserId: `snapshot-admin-${run}`,
      changeType: "status_transition",
      diff: { status: { before: "under_review", after: "accepted" } },
    });
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

  it("archives the GitHub snapshot before deleting a Canon record", async () => {
    mockPublish.mockResolvedValueOnce({ commitSha: "archive-commit", changed: true });

    const response = await request(app)
      .delete(`/v1/editorial/canon-records/${recordIds.archiveSuccess}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      deleted: true,
      archived: true,
      id: recordIds.archiveSuccess,
    });
    expect(response.body.archive_path).toContain("/context/archive/canon/locations/");
    expect(mockPublish).toHaveBeenCalledWith(
      [expect.objectContaining({
        path: expect.stringContaining("/context/archive/canon/locations/"),
        content: expect.stringContaining("Archived Canon record"),
      })],
      expect.stringContaining("context: archive removed Canon record Archive Success"),
      expect.arrayContaining([`worlds/${worldId}/context/canon/${recordIds.archiveSuccess}.md`]),
    );
    const [record] = await db.select().from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, recordIds.archiveSuccess));
    const [snapshot] = await db.select().from(wsContextSnapshotsTable)
      .where(eq(wsContextSnapshotsTable.entityId, recordIds.archiveSuccess));
    expect(record).toBeUndefined();
    expect(snapshot).toBeUndefined();
  });

  it("keeps the Canon record when GitHub archival fails", async () => {
    mockPublish.mockRejectedValueOnce(new Error("GitHub unavailable"));

    const response = await request(app)
      .delete(`/v1/editorial/canon-records/${recordIds.archiveFailure}`);

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("CANON_ARCHIVE_FAILED");
    const [record] = await db.select().from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, recordIds.archiveFailure));
    expect(record?.id).toBe(recordIds.archiveFailure);
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
  stories: `snapshot-story-${run}`,
  scenes: `snapshot-scene-${run}`,
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
    await db.insert(wsStoriesTable).values({ id: editorialIds.stories, worldId, title: "The Winter Crossing", status: "active" });
    await db.insert(wsStoryActsTable).values({ id: `snapshot-act-${run}`, storyId: editorialIds.stories, worldId, actNumber: 1, title: "Departure" });
    await db.insert(wsScenesTable).values({ id: editorialIds.scenes, storyId: editorialIds.stories, actId: `snapshot-act-${run}`, worldId, sceneNumber: 1, title: "At the frozen river" });
  });

  afterAll(async () => {
    await db.delete(wsContextSnapshotsTable).where(inArray(wsContextSnapshotsTable.entityId, Object.values(editorialIds)));
    await db.delete(wsProductionSpecsTable).where(eq(wsProductionSpecsTable.id, editorialIds["production-specs"]));
    await db.delete(wsSceneCanonLinksTable).where(eq(wsSceneCanonLinksTable.sceneId, editorialIds.scenes));
    await db.delete(wsScenesTable).where(eq(wsScenesTable.id, editorialIds.scenes));
    await db.delete(wsStoryActsTable).where(eq(wsStoryActsTable.id, `snapshot-act-${run}`));
    await db.delete(wsStoriesTable).where(eq(wsStoriesTable.id, editorialIds.stories));
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

  it("exports a storyline with its movements and scenes", async () => {
    mockPublish.mockResolvedValueOnce({
      path: `worlds/${worldId}/context/storylines/${editorialIds.stories}-the-winter-crossing.md`,
      commitSha: `story-sha-${run}`,
    });

    const response = await request(app)
      .post(`/worldsmith/editorial/context-snapshots/stories/${editorialIds.stories}/update`);

    expect(response.status).toBe(200);
    expect(mockPublish).toHaveBeenLastCalledWith(
      expect.stringContaining("/context/storylines/"),
      expect.stringMatching(/"title": "Departure"[\s\S]*"title": "At the frozen river"/),
      expect.stringContaining("update storyline"),
    );
  });

  it("exports a scene with its parent storyline and movement", async () => {
    mockPublish.mockResolvedValueOnce({
      path: `worlds/${worldId}/context/scenes/${editorialIds.scenes}-at-the-frozen-river.md`,
      commitSha: `scene-sha-${run}`,
    });

    const response = await request(app)
      .post(`/worldsmith/editorial/context-snapshots/scenes/${editorialIds.scenes}/update`);

    expect(response.status).toBe(200);
    const [path, markdown, message] = mockPublish.mock.calls.at(-1) ?? [];
    expect(path).toContain("/context/scenes/");
    expect(markdown).toContain("**Storyline:** The Winter Crossing");
    expect(markdown).toContain("**Movement:** Departure");
    expect(message).toContain("update scene for At the frozen river");
  });
});