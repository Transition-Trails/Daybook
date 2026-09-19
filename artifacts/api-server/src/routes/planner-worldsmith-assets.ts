import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  plannerConfigsTable,
  plannerProjectAssetsTable,
  worldsmithAssetsTable,
  worldsmithProductionPackagesTable,
  worldsmithWorldsTable,
  wsProductionSpecsTable,
} from "@workspace/db";
import { requireStoreAccess } from "../middleware/requireRole";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";

const router = Router();
const storage = new ObjectStorageService();
const MAX_MANAGED_ASSET_BYTES = 50 * 1024 * 1024;
const USAGE_KINDS = new Set(["background", "artwork", "decorative", "journal-card", "ephemera", "strip", "divider", "cover", "end-paper", "library"]);

function params(req: Request) {
  return req.params as { storeId: string; id: string; assetId?: string };
}

function notFound(res: Response): void {
  res.status(404).json({ error: "Planner asset not found" });
}

function sourcePath(value: string | null): string | null {
  return value?.startsWith("/objects/") ? value : null;
}

async function planner(storeId: string, id: string) {
  const [row] = await db.select({ id: plannerConfigsTable.id })
    .from(plannerConfigsTable)
    .where(and(eq(plannerConfigsTable.id, id), eq(plannerConfigsTable.storeId, storeId)));
  return row ?? null;
}

async function sourceCandidates(storeId: string, query: Record<string, unknown>) {
  const filters = [
    eq(worldsmithWorldsTable.storeId, storeId),
    eq(worldsmithAssetsTable.readinessState, "Approved"),
    eq(worldsmithProductionPackagesTable.status, "success"),
  ];
  if (typeof query.worldId === "string" && query.worldId) filters.push(eq(worldsmithWorldsTable.id, query.worldId));
  if (typeof query.collectionId === "string" && query.collectionId) filters.push(eq(wsProductionSpecsTable.collectionId, query.collectionId));
  if (typeof query.volumeId === "string" && query.volumeId) filters.push(eq(wsProductionSpecsTable.volumeId, query.volumeId));
  if (typeof query.componentType === "string" && query.componentType) filters.push(eq(worldsmithAssetsTable.componentType, query.componentType));
  if (typeof query.status === "string" && query.status) filters.push(eq(worldsmithAssetsTable.readinessState, query.status));
  if (typeof query.search === "string" && query.search) filters.push(or(
    ilike(worldsmithAssetsTable.assetName, `%${query.search}%`),
    ilike(worldsmithAssetsTable.componentType, `%${query.search}%`),
  )!);
  return db.select({
    id: worldsmithAssetsTable.id,
    name: worldsmithAssetsTable.assetName,
    assetType: worldsmithAssetsTable.assetType,
    componentType: worldsmithAssetsTable.componentType,
    version: worldsmithAssetsTable.currentVersion,
    readinessState: worldsmithAssetsTable.readinessState,
    filename: worldsmithAssetsTable.filename,
    worldId: worldsmithWorldsTable.id,
    worldName: worldsmithWorldsTable.name,
    collectionId: wsProductionSpecsTable.collectionId,
    volumeId: wsProductionSpecsTable.volumeId,
    productionSpecId: wsProductionSpecsTable.id,
    productionItem: wsProductionSpecsTable.productionItem,
    payloadVersion: wsProductionSpecsTable.payloadVersion,
    orientation: wsProductionSpecsTable.orientation,
    componentSpecId: wsProductionSpecsTable.componentSpecId,
    canonDependency: wsProductionSpecsTable.canonDependency,
    packageId: worldsmithProductionPackagesTable.id,
    objectPath: worldsmithProductionPackagesTable.providerRequestId,
    productionMetadata: wsProductionSpecsTable.promptPayload,
  }).from(worldsmithAssetsTable)
    .innerJoin(worldsmithWorldsTable, or(
      eq(worldsmithAssetsTable.world, worldsmithWorldsTable.id),
      eq(worldsmithAssetsTable.world, worldsmithWorldsTable.code),
      eq(worldsmithAssetsTable.world, worldsmithWorldsTable.name),
    )!)
    .leftJoin(wsProductionSpecsTable, or(
      eq(wsProductionSpecsTable.id, worldsmithAssetsTable.productionSpecNotionId!),
      eq(wsProductionSpecsTable.notionPageId, worldsmithAssetsTable.productionSpecNotionId!),
    )!)
    .leftJoin(worldsmithProductionPackagesTable, or(
      eq(worldsmithProductionPackagesTable.productionSpecId, wsProductionSpecsTable.id),
      eq(worldsmithProductionPackagesTable.productionSpecId, worldsmithAssetsTable.productionSpecNotionId!),
    )!)
    .where(and(...filters))
    .orderBy(asc(worldsmithWorldsTable.name), asc(worldsmithAssetsTable.assetName), desc(worldsmithProductionPackagesTable.updatedAt));
}

function serializeSource(row: Awaited<ReturnType<typeof sourceCandidates>>[number], storeId?: string, plannerId?: string) {
  return {
    id: row.id, name: row.name, assetType: row.assetType, componentType: row.componentType,
    version: row.version, status: row.readinessState, filename: row.filename,
    world: { id: row.worldId, name: row.worldName },
    collectionId: row.collectionId, volumeId: row.volumeId,
    productionSpecId: row.productionSpecId, productionItem: row.productionItem,
    packageId: row.packageId,
    available: Boolean(sourcePath(row.objectPath)),
    sourceRenderUrl: storeId && plannerId
      ? `/stores/${storeId}/planners/${plannerId}/worldsmith-assets/source/${encodeURIComponent(row.id)}/render`
      : undefined,
    productionMetadata: {
      promptPayload: row.productionMetadata,
      payloadVersion: row.payloadVersion,
      orientation: row.orientation,
      componentSpecId: row.componentSpecId,
      canonDependency: row.canonDependency,
    },
  };
}

async function copySource(source: Awaited<ReturnType<typeof sourceCandidates>>[number], plannerId: string) {
  const objectPath = sourcePath(source.objectPath);
  if (!objectPath) throw new Error("Approved final artwork is not available");
  const file = await storage.getObjectEntityFile(objectPath);
  const [bytes] = await file.download();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_MANAGED_ASSET_BYTES) {
    throw new Error("Final artwork exceeds the 50 MiB managed asset limit");
  }
  const [metadata] = await file.getMetadata();
  const privateDir = storage.getPrivateObjectDir().replace(/\/$/, "");
  const entity = `daybook/planner-assets/${plannerId}/${randomUUID()}`;
  const fullPath = `${privateDir}/${entity}`;
  const pathParts = fullPath.replace(/^\/+/, "").split("/");
  const bucket = pathParts.shift();
  if (!bucket) throw new Error("Private object storage is not configured");
  await objectStorageClient.bucket(bucket).file(pathParts.join("/")).save(bytes, {
    resumable: false,
    metadata: { contentType: metadata.contentType ?? "application/octet-stream" },
  });
  return {
    path: `/objects/${entity}`,
    bytes: String(bytes.byteLength),
    contentType: metadata.contentType ?? "application/octet-stream",
    width: metadata.metadata?.width as string | undefined,
    height: metadata.metadata?.height as string | undefined,
  };
}

router.get("/stores/:storeId/planners/:id/worldsmith-assets", requireStoreAccess("store_staff"), async (req, res) => {
  const { storeId, id } = params(req);
  if (!await planner(storeId, id)) { notFound(res); return; }
  const rows = await sourceCandidates(storeId, req.query as Record<string, unknown>);
  const unique = [...new Map(rows.filter((row) => Boolean(sourcePath(row.objectPath))).map((row) => [row.id, row])).values()];
  res.json({ assets: unique.map((row) => serializeSource(row, storeId, id)) });
});

router.get("/stores/:storeId/planners/:id/worldsmith-assets/source/:assetId/render", requireStoreAccess("store_staff"), async (req, res) => {
  const { storeId, id, assetId } = params(req);
  if (!await planner(storeId, id)) { notFound(res); return; }
  const source = [...new Map((await sourceCandidates(storeId, {})).map((row) => [row.id, row])).values()]
    .find((row) => row.id === assetId);
  const objectPath = source ? sourcePath(source.objectPath) : null;
  if (!source || !objectPath) { notFound(res); return; }
  try {
    const file = await storage.getObjectEntityFile(objectPath);
    const response = await storage.downloadObject(file, 300);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.status(200).send(Buffer.from(await response.arrayBuffer()));
  } catch { notFound(res); }
});

router.get("/stores/:storeId/planners/:id/worldsmith-assets/library", requireStoreAccess("store_staff"), async (req, res) => {
  const { storeId, id } = params(req);
  if (!await planner(storeId, id)) { notFound(res); return; }
  const rows = await db.select().from(plannerProjectAssetsTable)
    .where(and(eq(plannerProjectAssetsTable.storeId, storeId), eq(plannerProjectAssetsTable.plannerConfigId, id)));
  res.json({ assets: rows });
});

router.post("/stores/:storeId/planners/:id/worldsmith-assets/import", requireStoreAccess("store_owner"), async (req, res) => {
  const { storeId, id } = params(req);
  if (!await planner(storeId, id)) { notFound(res); return; }
  const ids = Array.isArray(req.body?.assetIds)
    ? [...new Set(req.body.assetIds.filter((value: unknown): value is string => typeof value === "string" && value.length <= 200))]
    : [];
  if (!ids.length) { res.status(400).json({ error: "assetIds must contain at least one asset id" }); return; }
  if (ids.length > 100) { res.status(400).json({ error: "A maximum of 100 assets may be imported at once" }); return; }
  const usageKind = typeof req.body?.usageKind === "string" && USAGE_KINDS.has(req.body.usageKind)
    ? req.body.usageKind
    : "artwork";
  const candidates = [...new Map((await sourceCandidates(storeId, {})).map((row) => [row.id, row])).values()];
  const selected = candidates.filter((candidate) => ids.includes(candidate.id) && sourcePath(candidate.objectPath));
  if (selected.length !== ids.length) { res.status(404).json({ error: "One or more approved final artwork assets were not found" }); return; }
  const imported = [];
  for (const source of selected) {
    const existing = await db.select().from(plannerProjectAssetsTable).where(and(
      eq(plannerProjectAssetsTable.plannerConfigId, id),
      eq(plannerProjectAssetsTable.sourceAssetId, source.id),
      eq(plannerProjectAssetsTable.sourceAssetVersion, source.version),
    ));
    if (existing[0]) { imported.push(existing[0]); continue; }
    const copy = await copySource(source, id);
    try {
      const [row] = await db.insert(plannerProjectAssetsTable).values({
        id: randomUUID(), storeId, plannerConfigId: id, managedObjectPath: copy.path,
        displayName: source.name, contentType: copy.contentType, byteSize: copy.bytes,
        width: copy.width, height: copy.height, usageKind, sourceAssetId: source.id,
        sourceAssetVersion: source.version, worldId: source.worldId, collectionId: source.collectionId,
        volumeId: source.volumeId, productionSpecId: source.productionSpecId,
        componentType: source.componentType,
        productionMetadata: {
          productionItem: source.productionItem, packageId: source.packageId,
          payloadVersion: source.payloadVersion, orientation: source.orientation,
          componentSpecId: source.componentSpecId, canonDependency: source.canonDependency,
        },
      }).returning();
      imported.push(row);
    } catch (error) {
      await storage.deleteObjectEntity(copy.path).catch(() => undefined);
      throw error;
    }
  }
  res.status(201).json({ assets: imported });
});

router.get("/stores/:storeId/planners/:id/worldsmith-assets/:assetId/render", requireStoreAccess("store_staff"), async (req, res) => {
  const { storeId, id, assetId } = params(req);
  const [asset] = await db.select().from(plannerProjectAssetsTable).where(and(
    eq(plannerProjectAssetsTable.id, assetId!), eq(plannerProjectAssetsTable.storeId, storeId), eq(plannerProjectAssetsTable.plannerConfigId, id),
  ));
  if (!asset) { notFound(res); return; }
  try {
    const file = await storage.getObjectEntityFile(asset.managedObjectPath);
    const response = await storage.downloadObject(file, 3600);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.status(200).send(Buffer.from(await response.arrayBuffer()));
  } catch { notFound(res); }
});

router.get("/stores/:storeId/planners/:id/worldsmith-assets/:assetId/update-check", requireStoreAccess("store_staff"), async (req, res) => {
  const { storeId, id, assetId } = params(req);
  const [asset] = await db.select().from(plannerProjectAssetsTable).where(and(eq(plannerProjectAssetsTable.id, assetId!), eq(plannerProjectAssetsTable.storeId, storeId), eq(plannerProjectAssetsTable.plannerConfigId, id)));
  if (!asset) { notFound(res); return; }
  const rows = [...new Map((await sourceCandidates(storeId, {})).map((row) => [row.id, row])).values()];
  const current = rows.find((row) => row.id === asset.sourceAssetId);
  res.json({ updateAvailable: Boolean(current && current.version !== asset.sourceAssetVersion), currentVersion: asset.sourceAssetVersion, latestVersion: current?.version ?? null });
});

router.post("/stores/:storeId/planners/:id/worldsmith-assets/:assetId/replace", requireStoreAccess("store_owner"), async (req, res) => {
  const { storeId, id, assetId } = params(req);
  const [asset] = await db.select().from(plannerProjectAssetsTable).where(and(eq(plannerProjectAssetsTable.id, assetId!), eq(plannerProjectAssetsTable.storeId, storeId), eq(plannerProjectAssetsTable.plannerConfigId, id)));
  if (!asset) { notFound(res); return; }
  if (asset.modified) { res.status(409).json({ error: "This asset was modified in Daybook; review it before replacing.", code: "ASSET_MODIFIED" }); return; }
  if (req.body?.confirm !== true) { res.status(400).json({ error: "Explicit confirmation is required to replace this asset.", code: "CONFIRMATION_REQUIRED" }); return; }
  const source = [...new Map((await sourceCandidates(storeId, {})).map((row) => [row.id, row])).values()].find((row) => row.id === asset.sourceAssetId);
  if (!source || !sourcePath(source.objectPath)) { notFound(res); return; }
  const copy = await copySource(source, id);
  try {
    const [updated] = await db.update(plannerProjectAssetsTable).set({
      managedObjectPath: copy.path, sourceAssetVersion: source.version, importedAt: new Date(),
      contentType: copy.contentType, byteSize: copy.bytes, width: copy.width, height: copy.height,
      updatedAt: new Date(),
    }).where(and(eq(plannerProjectAssetsTable.id, asset.id), eq(plannerProjectAssetsTable.storeId, storeId))).returning();
    if (!updated) {
      await storage.deleteObjectEntity(copy.path).catch(() => undefined);
      notFound(res);
      return;
    }
    await storage.deleteObjectEntity(asset.managedObjectPath).catch(() => undefined);
    res.json({ asset: updated, replaced: true });
  } catch (error) {
    await storage.deleteObjectEntity(copy.path).catch(() => undefined);
    throw error;
  }
});

export default router;