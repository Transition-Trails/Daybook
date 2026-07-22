import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  editionsTable,
  editionStickerPacksTable,
  editionInsertsTable,
  editionProductsTable,
  editionPlansTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireStaff } from "../lib/auth-middleware";
import {
  ListEditionsQueryParams,
  CreateEditionBody,
  UpdateEditionBody,
  GetEditionParams,
  UpdateEditionParams,
  DeleteEditionParams,
  PublishEditionParams,
  UnpublishEditionParams,
  AiDraftEditionBody,
  UpdateEditionArtBody,
  GetEditionArtParams,
} from "@workspace/api-zod";
import { toSlug } from "../lib/slug";
import { aiDraftEdition } from "../lib/ai-proxy";

const router: IRouter = Router();

async function getEditionWithRelations(id: number) {
  const [edition] = await db
    .select()
    .from(editionsTable)
    .where(eq(editionsTable.id, id));
  if (!edition) return null;

  const [packs, inserts, products, plans] = await Promise.all([
    db.select().from(editionStickerPacksTable).where(eq(editionStickerPacksTable.editionId, id)),
    db.select().from(editionInsertsTable).where(eq(editionInsertsTable.editionId, id)),
    db.select().from(editionProductsTable).where(eq(editionProductsTable.editionId, id)),
    db.select().from(editionPlansTable).where(eq(editionPlansTable.editionId, id)),
  ]);

  return {
    ...edition,
    stickerPackIds: packs.map((r) => r.stickerPackId),
    insertIds: inserts.map((r) => r.insertId),
    productIds: products.map((r) => r.productId),
    planIds: plans.map((r) => r.planId),
  };
}

async function syncJunctions(
  editionId: number,
  stickerPackIds?: number[],
  insertIds?: number[],
  productIds?: number[],
  planIds?: number[],
) {
  if (stickerPackIds !== undefined) {
    await db.delete(editionStickerPacksTable).where(eq(editionStickerPacksTable.editionId, editionId));
    if (stickerPackIds.length > 0) {
      await db.insert(editionStickerPacksTable).values(stickerPackIds.map((id) => ({ editionId, stickerPackId: id })));
    }
  }
  if (insertIds !== undefined) {
    await db.delete(editionInsertsTable).where(eq(editionInsertsTable.editionId, editionId));
    if (insertIds.length > 0) {
      await db.insert(editionInsertsTable).values(insertIds.map((id) => ({ editionId, insertId: id })));
    }
  }
  if (productIds !== undefined) {
    await db.delete(editionProductsTable).where(eq(editionProductsTable.editionId, editionId));
    if (productIds.length > 0) {
      await db.insert(editionProductsTable).values(productIds.map((id) => ({ editionId, productId: id })));
    }
  }
  if (planIds !== undefined) {
    await db.delete(editionPlansTable).where(eq(editionPlansTable.editionId, editionId));
    if (planIds.length > 0) {
      await db.insert(editionPlansTable).values(planIds.map((id) => ({ editionId, planId: id })));
    }
  }
}

router.get("/editions", async (req, res): Promise<void> => {
  const params = ListEditionsQueryParams.safeParse(req.query);
  const status = params.success ? params.data.status : undefined;
  let editions;
  if (!status || status === "all") {
    editions = await db.select().from(editionsTable).orderBy(editionsTable.createdAt);
  } else {
    editions = await db.select().from(editionsTable).where(eq(editionsTable.status, status)).orderBy(editionsTable.createdAt);
  }
  const enriched = await Promise.all(editions.map((e) => getEditionWithRelations(e.id)));
  res.json(enriched.filter(Boolean));
});

router.post("/editions", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateEditionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { stickerPackIds, insertIds, productIds, planIds, slug: rawSlug, ...rest } = parsed.data;
  const slug = rawSlug ?? toSlug(rest.name);
  const [edition] = await db.insert(editionsTable).values({ ...rest, slug, status: "draft" }).returning();
  await syncJunctions(edition.id, stickerPackIds ?? [], insertIds ?? [], productIds ?? [], planIds ?? []);
  const enriched = await getEditionWithRelations(edition.id);
  res.status(201).json(enriched);
});

router.post("/editions/ai-draft", requireStaff, async (req, res): Promise<void> => {
  const parsed = AiDraftEditionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const result = await aiDraftEdition(parsed.data.concept, parsed.data.audience, parsed.data.tier);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "AI edition draft failed");
    res.status(502).json({ error: "AI provider error" });
  }
});

router.get("/editions/:id", async (req, res): Promise<void> => {
  const params = GetEditionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const edition = await getEditionWithRelations(params.data.id);
  if (!edition) { res.status(404).json({ error: "Edition not found" }); return; }
  res.json(edition);
});

router.patch("/editions/:id", requireStaff, async (req, res): Promise<void> => {
  const params = UpdateEditionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateEditionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { stickerPackIds, insertIds, productIds, planIds, ...rest } = parsed.data;
  if (Object.keys(rest).length > 0) {
    await db.update(editionsTable).set(rest).where(eq(editionsTable.id, params.data.id));
  }
  await syncJunctions(params.data.id, stickerPackIds, insertIds, productIds, planIds);
  const edition = await getEditionWithRelations(params.data.id);
  if (!edition) { res.status(404).json({ error: "Edition not found" }); return; }
  res.json(edition);
});

router.delete("/editions/:id", requireStaff, async (req, res): Promise<void> => {
  const params = DeleteEditionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  await syncJunctions(params.data.id, [], [], [], []);
  const [edition] = await db.delete(editionsTable).where(eq(editionsTable.id, params.data.id)).returning();
  if (!edition) { res.status(404).json({ error: "Edition not found" }); return; }
  res.sendStatus(204);
});

router.post("/editions/:id/publish", requireStaff, async (req, res): Promise<void> => {
  const params = PublishEditionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [edition] = await db.update(editionsTable).set({ status: "live" }).where(eq(editionsTable.id, params.data.id)).returning();
  if (!edition) { res.status(404).json({ error: "Edition not found" }); return; }
  res.json(await getEditionWithRelations(edition.id));
});

router.post("/editions/:id/unpublish", requireStaff, async (req, res): Promise<void> => {
  const params = UnpublishEditionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [edition] = await db.update(editionsTable).set({ status: "draft" }).where(eq(editionsTable.id, params.data.id)).returning();
  if (!edition) { res.status(404).json({ error: "Edition not found" }); return; }
  res.json(await getEditionWithRelations(edition.id));
});

// Art files
router.get("/editions/:id/art", requireStaff, async (req, res): Promise<void> => {
  const params = GetEditionArtParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [edition] = await db.select().from(editionsTable).where(eq(editionsTable.id, params.data.id));
  if (!edition) { res.status(404).json({ error: "Edition not found" }); return; }
  const artFiles = (edition.perPageArtFileIds as Record<string, string> | null) ?? {};
  res.json(Object.entries(artFiles).map(([pageId, driveFileId]) => ({ pageId, driveFileId })));
});

router.put("/editions/:id/art", requireStaff, async (req, res): Promise<void> => {
  const params = GetEditionArtParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateEditionArtBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const artMap: Record<string, string> = {};
  for (const f of parsed.data.artFiles) artMap[f.pageId] = f.driveFileId;
  const [edition] = await db.update(editionsTable).set({ perPageArtFileIds: artMap }).where(eq(editionsTable.id, params.data.id)).returning();
  if (!edition) { res.status(404).json({ error: "Edition not found" }); return; }
  res.json(Object.entries(artMap).map(([pageId, driveFileId]) => ({ pageId, driveFileId })));
});

export default router;
