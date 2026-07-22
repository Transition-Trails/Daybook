import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { insertsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "../lib/auth-middleware";
import {
  ListInsertsQueryParams,
  CreateInsertBody,
  UpdateInsertBody,
  GetInsertParams,
  UpdateInsertParams,
  DeleteInsertParams,
  PublishInsertParams,
  UnpublishInsertParams,
} from "@workspace/api-zod";
import { toSlug } from "../lib/slug";

const router: IRouter = Router();

router.get("/inserts", async (req, res): Promise<void> => {
  const params = ListInsertsQueryParams.safeParse(req.query);
  const status = params.success ? params.data.status : undefined;
  const category = params.success ? params.data.category : undefined;

  let query = db.select().from(insertsTable).$dynamic();
  if (status && status !== "all") query = query.where(eq(insertsTable.status, status));
  else if (category) query = query.where(eq(insertsTable.category, category));
  const inserts = await query.orderBy(insertsTable.createdAt);
  res.json(inserts);
});

router.post("/inserts", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateInsertBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const slug = parsed.data.slug ?? toSlug(parsed.data.name);
  const [insert] = await db.insert(insertsTable).values({ ...parsed.data, slug, status: "draft" }).returning();
  res.status(201).json(insert);
});

router.get("/inserts/:id", async (req, res): Promise<void> => {
  const params = GetInsertParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [insert] = await db.select().from(insertsTable).where(eq(insertsTable.id, params.data.id));
  if (!insert) { res.status(404).json({ error: "Insert not found" }); return; }
  res.json(insert);
});

router.patch("/inserts/:id", requireStaff, async (req, res): Promise<void> => {
  const params = UpdateInsertParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateInsertBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [insert] = await db.update(insertsTable).set(parsed.data).where(eq(insertsTable.id, params.data.id)).returning();
  if (!insert) { res.status(404).json({ error: "Insert not found" }); return; }
  res.json(insert);
});

router.delete("/inserts/:id", requireStaff, async (req, res): Promise<void> => {
  const params = DeleteInsertParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [insert] = await db.delete(insertsTable).where(eq(insertsTable.id, params.data.id)).returning();
  if (!insert) { res.status(404).json({ error: "Insert not found" }); return; }
  res.sendStatus(204);
});

router.post("/inserts/:id/publish", requireStaff, async (req, res): Promise<void> => {
  const params = PublishInsertParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [insert] = await db.update(insertsTable).set({ status: "live" }).where(eq(insertsTable.id, params.data.id)).returning();
  if (!insert) { res.status(404).json({ error: "Insert not found" }); return; }
  res.json(insert);
});

router.post("/inserts/:id/unpublish", requireStaff, async (req, res): Promise<void> => {
  const params = UnpublishInsertParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [insert] = await db.update(insertsTable).set({ status: "draft" }).where(eq(insertsTable.id, params.data.id)).returning();
  if (!insert) { res.status(404).json({ error: "Insert not found" }); return; }
  res.json(insert);
});

export default router;
