import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { themesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireStaff } from "../lib/auth-middleware";
import {
  ListThemesQueryParams,
  CreateThemeBody,
  UpdateThemeBody,
  GetThemeParams,
  UpdateThemeParams,
  DeleteThemeParams,
  PublishThemeParams,
  UnpublishThemeParams,
  AiDraftThemeBody,
} from "@workspace/api-zod";
import { toSlug } from "../lib/slug";
import { aiDraftTheme } from "../lib/ai-proxy";

const router: IRouter = Router();

router.get("/themes", async (req, res): Promise<void> => {
  const params = ListThemesQueryParams.safeParse(req.query);
  const status = params.success ? params.data.status : undefined;

  let themes;
  if (!status || status === "all") {
    themes = await db.select().from(themesTable).orderBy(themesTable.createdAt);
  } else {
    themes = await db
      .select()
      .from(themesTable)
      .where(eq(themesTable.status, status))
      .orderBy(themesTable.createdAt);
  }
  res.json(themes);
});

router.post("/themes", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateThemeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const slug = data.slug ?? toSlug(data.name);
  const [theme] = await db
    .insert(themesTable)
    .values({ ...data, slug, status: "draft" })
    .returning();
  res.status(201).json(theme);
});

router.get("/themes/ai-draft", requireStaff, async (req, res): Promise<void> => {
  res.status(405).json({ error: "Use POST" });
});

router.post("/themes/ai-draft", requireStaff, async (req, res): Promise<void> => {
  const parsed = AiDraftThemeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await aiDraftTheme(
      parsed.data.concept,
      parsed.data.season,
      parsed.data.audience,
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "AI theme draft failed");
    res.status(502).json({ error: "AI provider error" });
  }
});

router.get("/themes/:id", async (req, res): Promise<void> => {
  const params = GetThemeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [theme] = await db
    .select()
    .from(themesTable)
    .where(eq(themesTable.id, params.data.id));
  if (!theme) {
    res.status(404).json({ error: "Theme not found" });
    return;
  }
  res.json(theme);
});

router.patch("/themes/:id", requireStaff, async (req, res): Promise<void> => {
  const params = UpdateThemeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateThemeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [theme] = await db
    .update(themesTable)
    .set(parsed.data)
    .where(eq(themesTable.id, params.data.id))
    .returning();
  if (!theme) {
    res.status(404).json({ error: "Theme not found" });
    return;
  }
  res.json(theme);
});

router.delete("/themes/:id", requireStaff, async (req, res): Promise<void> => {
  const params = DeleteThemeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [theme] = await db
    .delete(themesTable)
    .where(eq(themesTable.id, params.data.id))
    .returning();
  if (!theme) {
    res.status(404).json({ error: "Theme not found" });
    return;
  }
  res.sendStatus(204);
});

router.post(
  "/themes/:id/publish",
  requireStaff,
  async (req, res): Promise<void> => {
    const params = PublishThemeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [theme] = await db
      .update(themesTable)
      .set({ status: "live" })
      .where(eq(themesTable.id, params.data.id))
      .returning();
    if (!theme) {
      res.status(404).json({ error: "Theme not found" });
      return;
    }
    res.json(theme);
  },
);

router.post(
  "/themes/:id/unpublish",
  requireStaff,
  async (req, res): Promise<void> => {
    const params = UnpublishThemeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [theme] = await db
      .update(themesTable)
      .set({ status: "draft" })
      .where(eq(themesTable.id, params.data.id))
      .returning();
    if (!theme) {
      res.status(404).json({ error: "Theme not found" });
      return;
    }
    res.json(theme);
  },
);

export default router;
