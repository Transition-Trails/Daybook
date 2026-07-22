import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { stickerPacksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "../lib/auth-middleware";
import {
  ListStickerPacksQueryParams,
  CreateStickerPackBody,
  UpdateStickerPackBody,
  GetStickerPackParams,
  UpdateStickerPackParams,
  DeleteStickerPackParams,
  PublishStickerPackParams,
  UnpublishStickerPackParams,
  AiDraftStickerPackBody,
} from "@workspace/api-zod";
import { toSlug } from "../lib/slug";
import { aiDraftStickerPack } from "../lib/ai-proxy";

const router: IRouter = Router();

router.get("/sticker-packs", async (req, res): Promise<void> => {
  const params = ListStickerPacksQueryParams.safeParse(req.query);
  const status = params.success ? params.data.status : undefined;
  let packs;
  if (!status || status === "all") {
    packs = await db.select().from(stickerPacksTable).orderBy(stickerPacksTable.createdAt);
  } else {
    packs = await db.select().from(stickerPacksTable).where(eq(stickerPacksTable.status, status)).orderBy(stickerPacksTable.createdAt);
  }
  res.json(packs);
});

router.post("/sticker-packs", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateStickerPackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const slug = parsed.data.slug ?? toSlug(parsed.data.name);
  const [pack] = await db.insert(stickerPacksTable).values({ ...parsed.data, slug, status: "draft" }).returning();
  res.status(201).json(pack);
});

router.post("/sticker-packs/ai-draft", requireStaff, async (req, res): Promise<void> => {
  const parsed = AiDraftStickerPackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const result = await aiDraftStickerPack(parsed.data.concept, parsed.data.style, parsed.data.audience);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "AI pack draft failed");
    res.status(502).json({ error: "AI provider error" });
  }
});

router.get("/sticker-packs/:id", async (req, res): Promise<void> => {
  const params = GetStickerPackParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [pack] = await db.select().from(stickerPacksTable).where(eq(stickerPacksTable.id, params.data.id));
  if (!pack) { res.status(404).json({ error: "Sticker pack not found" }); return; }
  res.json(pack);
});

router.patch("/sticker-packs/:id", requireStaff, async (req, res): Promise<void> => {
  const params = UpdateStickerPackParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateStickerPackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [pack] = await db.update(stickerPacksTable).set(parsed.data).where(eq(stickerPacksTable.id, params.data.id)).returning();
  if (!pack) { res.status(404).json({ error: "Sticker pack not found" }); return; }
  res.json(pack);
});

router.delete("/sticker-packs/:id", requireStaff, async (req, res): Promise<void> => {
  const params = DeleteStickerPackParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [pack] = await db.delete(stickerPacksTable).where(eq(stickerPacksTable.id, params.data.id)).returning();
  if (!pack) { res.status(404).json({ error: "Sticker pack not found" }); return; }
  res.sendStatus(204);
});

router.post("/sticker-packs/:id/publish", requireStaff, async (req, res): Promise<void> => {
  const params = PublishStickerPackParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [pack] = await db.update(stickerPacksTable).set({ status: "live" }).where(eq(stickerPacksTable.id, params.data.id)).returning();
  if (!pack) { res.status(404).json({ error: "Sticker pack not found" }); return; }
  res.json(pack);
});

router.post("/sticker-packs/:id/unpublish", requireStaff, async (req, res): Promise<void> => {
  const params = UnpublishStickerPackParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [pack] = await db.update(stickerPacksTable).set({ status: "draft" }).where(eq(stickerPacksTable.id, params.data.id)).returning();
  if (!pack) { res.status(404).json({ error: "Sticker pack not found" }); return; }
  res.json(pack);
});

export default router;
