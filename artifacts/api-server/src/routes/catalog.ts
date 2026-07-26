/**
 * Catalog routes — themes, packs, inserts, products, editions
 *
 * Visibility:
 *   - GET (list/detail): public sees status=live only; super_admin sees all.
 *   - POST / PATCH / DELETE: super_admin only (central catalog is platform-managed).
 *
 * Store-scoped catalog curation is handled in /stores/:storeId/catalog.
 *
 * Themes are returned ENRICHED with palettes[], backgrounds[], and packs[]
 * on both GET /themes and GET /themes/:id.
 *
 * Theme composer endpoints (requireSuperAdmin):
 *   PUT   /themes/:id/palettes      — replace palette set (body: {paletteId, isPrimary?, position?}[])
 *   PUT   /themes/:id/backgrounds   — replace background set (body: {backgroundId, position?}[])
 *   PUT   /themes/:id/packs         — replace pack set (body: {packId, position?}[])
 *   PATCH /themes/:id/font-pairing  — set font pairing object
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  themesTable,
  palettesTable,
  backgroundsTable,
  stickerPacksTable,
  insertsTable,
  relatedProductsTable,
  editionsTable,
  themePalettesTable,
  themeBackgroundsTable,
  themePacksTable,
} from "@workspace/db";
import { eq, ne, and, inArray, asc } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { isSuperAdmin } from "../lib/roles";
import { writeAudit } from "../lib/audit";
import type { User } from "@workspace/db";

const router: IRouter = Router();

// ── Shared helpers ─────────────────────────────────────────────────────────

/** True when the request comes from a non-admin caller (public visibility rules). */
function isPublicCaller(req: Request): boolean {
  if (!req.isAuthenticated()) return true;
  const user = req.user as User;
  return !isSuperAdmin(user) && user.role !== "staff";
}

// ── Theme enrichment helpers ───────────────────────────────────────────────

type RichPalette = { id: string; name: string; colors: string[]; isPrimary: boolean; position: number };
type RichBackground = { id: string; name: string; type: string; value: string | null; position: number };
type RichPack = { id: string; name: string; position: number };

async function loadPalettes(themeIds: string[]): Promise<Record<string, RichPalette[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({
      themeId:   themePalettesTable.themeId,
      isPrimary: themePalettesTable.isPrimary,
      position:  themePalettesTable.position,
      palette:   palettesTable,
    })
    .from(themePalettesTable)
    .innerJoin(palettesTable, eq(themePalettesTable.paletteId, palettesTable.id))
    .where(inArray(themePalettesTable.themeId, themeIds))
    .orderBy(themePalettesTable.themeId, asc(themePalettesTable.position));
  const out: Record<string, RichPalette[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({
      id:        r.palette.id,
      name:      r.palette.name,
      colors:    r.palette.colors as string[],
      isPrimary: r.isPrimary,
      position:  r.position,
    });
  }
  return out;
}

async function loadBackgrounds(themeIds: string[]): Promise<Record<string, RichBackground[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({
      themeId:    themeBackgroundsTable.themeId,
      position:   themeBackgroundsTable.position,
      background: backgroundsTable,
    })
    .from(themeBackgroundsTable)
    .innerJoin(backgroundsTable, eq(themeBackgroundsTable.backgroundId, backgroundsTable.id))
    .where(inArray(themeBackgroundsTable.themeId, themeIds))
    .orderBy(themeBackgroundsTable.themeId, asc(themeBackgroundsTable.position));
  const out: Record<string, RichBackground[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({
      id:       r.background.id,
      name:     r.background.name,
      type:     r.background.type,
      value:    (r.background as Record<string, unknown>).value as string | null,
      position: r.position,
    });
  }
  return out;
}

async function loadPacks(themeIds: string[]): Promise<Record<string, RichPack[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({
      themeId:  themePacksTable.themeId,
      position: themePacksTable.position,
      pack:     stickerPacksTable,
    })
    .from(themePacksTable)
    .innerJoin(stickerPacksTable, eq(themePacksTable.packId, stickerPacksTable.id))
    .where(inArray(themePacksTable.themeId, themeIds))
    .orderBy(themePacksTable.themeId, asc(themePacksTable.position));
  const out: Record<string, RichPack[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({ id: r.pack.id, name: r.pack.name, position: r.position });
  }
  return out;
}

function enrichThemes(
  themes: (typeof themesTable.$inferSelect)[],
  palettesMap: Record<string, RichPalette[]>,
  backgroundsMap: Record<string, RichBackground[]>,
  packsMap: Record<string, RichPack[]>,
) {
  return themes.map(t => ({
    ...t,
    palettes:    palettesMap[t.id]    ?? [],
    backgrounds: backgroundsMap[t.id] ?? [],
    packs:       packsMap[t.id]       ?? [],
  }));
}

// ── Enriched GET /themes (overrides buildCatalogRoutes list for themes) ────

router.get("/themes", async (req: Request, res: Response): Promise<void> => {
  const themes = isPublicCaller(req)
    ? await db.select().from(themesTable).where(eq(themesTable.status, "live")).orderBy(themesTable.createdAt)
    : await db.select().from(themesTable).where(ne(themesTable.status, "deleted")).orderBy(themesTable.createdAt);

  const ids = themes.map(t => t.id);
  const [palettesMap, backgroundsMap, packsMap] = await Promise.all([
    loadPalettes(ids),
    loadBackgrounds(ids),
    loadPacks(ids),
  ]);
  res.json(enrichThemes(themes, palettesMap, backgroundsMap, packsMap));
});

// ── Enriched GET /themes/:id (overrides buildCatalogRoutes detail) ─────────

router.get("/themes/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [theme] = await db.select().from(themesTable).where(eq(themesTable.id, id)) as any[];
  if (!theme || theme.status === "deleted") {
    res.status(404).json({ error: "Theme not found" });
    return;
  }
  if (isPublicCaller(req) && theme.status !== "live") {
    res.status(404).json({ error: "Theme not found" });
    return;
  }
  const [palettesMap, backgroundsMap, packsMap] = await Promise.all([
    loadPalettes([id]),
    loadBackgrounds([id]),
    loadPacks([id]),
  ]);
  res.json(enrichThemes([theme], palettesMap, backgroundsMap, packsMap)[0]);
});

// ── Generic CRUD factory ─────────────────────────────────────────────────────

function normalizeName(n: string): string {
  return String(n).trim().toLowerCase().replace(/\s+/g, " ");
}

function buildCatalogRoutes(
  router: IRouter,
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  entityLabel: string,
  options: { dedupByName?: boolean } = {},
) {
  // GET /{entity} — public: live only; admin: all non-deleted
  // NOTE: for /themes this is shadowed by the enriched handler above.
  router.get(path, async (req: Request, res: Response): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: any[];
    if (isPublicCaller(req)) {
      rows = await db.select().from(table).where(eq(table.status, "live")).orderBy(table.createdAt);
    } else {
      rows = await db.select().from(table).where(ne(table.status, "deleted")).orderBy(table.createdAt);
    }
    res.json(rows);
  });

  // GET /{entity}/:id — NOTE: for /themes/:id shadowed by enriched handler above.
  router.get(`${path}/:id`, async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.select().from(table).where(eq(table.id, id)) as any[];
    if (!row || row.status === "deleted") {
      res.status(404).json({ error: `${entityLabel} not found` });
      return;
    }
    if (isPublicCaller(req) && row.status !== "live") {
      res.status(404).json({ error: `${entityLabel} not found` });
      return;
    }
    res.json(row);
  });

  // POST /{entity} — super_admin only
  router.post(path, requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;
    if (!body.id || !body.name) {
      res.status(400).json({ error: "id and name are required" });
      return;
    }

    // ── Name dedup guard (opt-in per entity) ─────────────────────────────
    if (options.dedupByName && body.name) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing: any[] = await db.select().from(table).where(ne(table.status, "deleted"));
      const norm = normalizeName(String(body.name));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dup: any = existing.find((r: any) => normalizeName(String(r.name)) === norm) ?? null;
      if (dup) {
        if (dup.status === "live") {
          res.status(409).json({
            error: `A live ${entityLabel.toLowerCase()} named "${body.name}" already exists — open it to edit instead.`,
            existingId: dup.id,
          });
          return;
        }
        // Draft — upsert in place.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [updated] = await db.update(table).set({ ...body, id: dup.id }).where(eq(table.id, dup.id)).returning() as any[];
        await writeAudit(db, {
          actorUserId: req.actor!.userId,
          actorRole: req.actor!.effectiveRole,
          scope: "platform",
          action: `catalog.${entityLabel.toLowerCase()}.upsert`,
          targetType: entityLabel.toLowerCase(),
          targetId: dup.id,
          metadata: { name: body.name, upserted: true },
        });
        res.json({ ...updated, upserted: true });
        return;
      }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [row] = await db.insert(table).values({ ...body, status: body.status ?? "draft" }).returning() as any[];
      res.status(201).json(row);
    } catch (err) {
      const msg = String(err);
      if (msg.includes("duplicate") || msg.includes("unique")) {
        res.status(409).json({ error: `${entityLabel} with that id already exists` });
      } else {
        req.log.error({ err }, `${entityLabel} create failed`);
        res.status(500).json({ error: "Create failed" });
      }
    }
  });

  // PATCH /{entity}/:id — super_admin only
  router.patch(`${path}/:id`, requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    delete body.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.update(table).set(body).where(eq(table.id, id)).returning() as any[];
    if (!row) { res.status(404).json({ error: `${entityLabel} not found` }); return; }
    res.json(row);
  });

  // DELETE /{entity}/:id — super_admin only (soft-delete)
  router.delete(`${path}/:id`, requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.update(table).set({ status: "deleted" }).where(eq(table.id, id)).returning() as any[];
    if (!row) { res.status(404).json({ error: `${entityLabel} not found` }); return; }
    res.sendStatus(204);
  });
}

// ── Register all catalog entities ────────────────────────────────────────────
// NOTE: The GET /themes and GET /themes/:id are already handled by the enriched
// routes above; these registrations add POST / PATCH / DELETE for themes.

buildCatalogRoutes(router, "/themes",      themesTable,          "Theme");
buildCatalogRoutes(router, "/palettes",   palettesTable,        "Palette");
buildCatalogRoutes(router, "/backgrounds",backgroundsTable,     "Background");
buildCatalogRoutes(router, "/packs",      stickerPacksTable,    "StickerPack");
buildCatalogRoutes(router, "/inserts",    insertsTable,         "Insert",       { dedupByName: true });
buildCatalogRoutes(router, "/products",   relatedProductsTable, "RelatedProduct");

// ── Theme composer routes ─────────────────────────────────────────────────────
// PUT   /themes/:id/palettes
// PUT   /themes/:id/backgrounds
// PUT   /themes/:id/packs
// PATCH /themes/:id/font-pairing

// Helper: resolve theme or 404
async function requireTheme(id: string, res: Response) {
  const [theme] = await db
    .select()
    .from(themesTable)
    .where(and(eq(themesTable.id, id), ne(themesTable.status, "deleted")));
  if (!theme) {
    res.status(404).json({ error: "Theme not found" });
    return null;
  }
  return theme;
}

/** PUT /themes/:id/palettes — replace palette set for a platform theme. */
router.put(
  "/themes/:id/palettes",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const theme = await requireTheme(id, res);
    if (!theme) return;

    const body = req.body as { paletteId: string; isPrimary?: boolean; position?: number }[];
    if (!Array.isArray(body)) {
      res.status(400).json({ error: "Body must be an array of palette link objects" });
      return;
    }

    // Validate all paletteIds exist
    if (body.length) {
      const ids = body.map(p => p.paletteId);
      const found = await db
        .select({ id: palettesTable.id })
        .from(palettesTable)
        .where(inArray(palettesTable.id, ids));
      const foundIds = new Set(found.map(r => r.id));
      const missing = ids.filter(i => !foundIds.has(i));
      if (missing.length) {
        res.status(422).json({ error: `Palette IDs not found: ${missing.join(", ")}` });
        return;
      }
    }

    await db.delete(themePalettesTable).where(eq(themePalettesTable.themeId, id));
    if (body.length) {
      await db.insert(themePalettesTable).values(
        body.map((p, i) => ({
          themeId:   id,
          paletteId: p.paletteId,
          position:  p.position ?? i,
          isPrimary: p.isPrimary ?? i === 0,
        })),
      );
    }

    await writeAudit(db, {
      actorUserId: req.actor!.userId,
      actorRole:   req.actor!.effectiveRole,
      scope:       "platform",
      action:      "catalog.theme.palettes.set",
      targetType:  "theme",
      targetId:    id,
      metadata:    { count: body.length },
    });

    const palettesMap = await loadPalettes([id]);
    res.json(palettesMap[id] ?? []);
  },
);

/** PUT /themes/:id/backgrounds — replace background set for a platform theme. */
router.put(
  "/themes/:id/backgrounds",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const theme = await requireTheme(id, res);
    if (!theme) return;

    const body = req.body as { backgroundId: string; position?: number }[];
    if (!Array.isArray(body)) {
      res.status(400).json({ error: "Body must be an array of background link objects" });
      return;
    }

    if (body.length) {
      const ids = body.map(b => b.backgroundId);
      const found = await db
        .select({ id: backgroundsTable.id })
        .from(backgroundsTable)
        .where(inArray(backgroundsTable.id, ids));
      const foundIds = new Set(found.map(r => r.id));
      const missing = ids.filter(i => !foundIds.has(i));
      if (missing.length) {
        res.status(422).json({ error: `Background IDs not found: ${missing.join(", ")}` });
        return;
      }
    }

    await db.delete(themeBackgroundsTable).where(eq(themeBackgroundsTable.themeId, id));
    if (body.length) {
      await db.insert(themeBackgroundsTable).values(
        body.map((b, i) => ({
          themeId:      id,
          backgroundId: b.backgroundId,
          position:     b.position ?? i,
        })),
      );
    }

    await writeAudit(db, {
      actorUserId: req.actor!.userId,
      actorRole:   req.actor!.effectiveRole,
      scope:       "platform",
      action:      "catalog.theme.backgrounds.set",
      targetType:  "theme",
      targetId:    id,
      metadata:    { count: body.length },
    });

    const backgroundsMap = await loadBackgrounds([id]);
    res.json(backgroundsMap[id] ?? []);
  },
);

/** PUT /themes/:id/packs — replace pack set for a platform theme. */
router.put(
  "/themes/:id/packs",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const theme = await requireTheme(id, res);
    if (!theme) return;

    const body = req.body as { packId: string; position?: number }[];
    if (!Array.isArray(body)) {
      res.status(400).json({ error: "Body must be an array of pack link objects" });
      return;
    }

    if (body.length) {
      const ids = body.map(p => p.packId);
      const found = await db
        .select({ id: stickerPacksTable.id })
        .from(stickerPacksTable)
        .where(inArray(stickerPacksTable.id, ids));
      const foundIds = new Set(found.map(r => r.id));
      const missing = ids.filter(i => !foundIds.has(i));
      if (missing.length) {
        res.status(422).json({ error: `Pack IDs not found: ${missing.join(", ")}` });
        return;
      }
    }

    await db.delete(themePacksTable).where(eq(themePacksTable.themeId, id));
    if (body.length) {
      await db.insert(themePacksTable).values(
        body.map((p, i) => ({
          themeId:  id,
          packId:   p.packId,
          position: p.position ?? i,
        })),
      );
    }

    await writeAudit(db, {
      actorUserId: req.actor!.userId,
      actorRole:   req.actor!.effectiveRole,
      scope:       "platform",
      action:      "catalog.theme.packs.set",
      targetType:  "theme",
      targetId:    id,
      metadata:    { count: body.length },
    });

    const packsMap = await loadPacks([id]);
    res.json(packsMap[id] ?? []);
  },
);

/** PATCH /themes/:id/font-pairing — set or clear font pairing. */
router.patch(
  "/themes/:id/font-pairing",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const theme = await requireTheme(id, res);
    if (!theme) return;

    const body = req.body as { heading?: string; subheading?: string; body?: string; accent?: string } | null;
    const fontPairing = body && Object.keys(body).length ? body : null;

    const [updated] = await db
      .update(themesTable)
      .set({ fontPairing })
      .where(eq(themesTable.id, id))
      .returning();

    await writeAudit(db, {
      actorUserId: req.actor!.userId,
      actorRole:   req.actor!.effectiveRole,
      scope:       "platform",
      action:      "catalog.theme.font_pairing.set",
      targetType:  "theme",
      targetId:    id,
      metadata:    { fontPairing },
    });

    res.json(updated.fontPairing ?? null);
  },
);

// ── Editions — custom GET with optional ?productType= filter ─────────────────

router.get("/editions", async (req: Request, res: Response): Promise<void> => {
  const productType = req.query.productType as string | undefined;
  const allowedTypes = ["planner", "notebook", "journal", "memory-keeping"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[];
  if (isPublicCaller(req)) {
    const baseFilter = eq(editionsTable.status, "live");
    const filter =
      productType && allowedTypes.includes(productType)
        ? and(baseFilter, eq(editionsTable.productType, productType as "planner" | "notebook" | "journal" | "memory-keeping"))
        : baseFilter;
    rows = await db.select().from(editionsTable).where(filter).orderBy(editionsTable.createdAt);
  } else {
    const baseFilter = ne(editionsTable.status, "deleted");
    const filter =
      productType && allowedTypes.includes(productType)
        ? and(baseFilter, eq(editionsTable.productType, productType as "planner" | "notebook" | "journal" | "memory-keeping"))
        : baseFilter;
    rows = await db.select().from(editionsTable).where(filter).orderBy(editionsTable.createdAt);
  }
  res.json(rows);
});

buildCatalogRoutes(router, "/editions",   editionsTable,        "Edition");

// ── Edition-specific: duplicate ───────────────────────────────────────────────

function advanceYearsInName(name: string): string {
  return name.replace(/\b(20\d{2})\b/g, (_, y) => String(Number(y) + 1));
}

function makeEditionId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  return `ed-${slug}-${Date.now().toString(36)}`;
}

router.post(
  "/editions/:id/duplicate",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [src] = await db.select().from(editionsTable).where(eq(editionsTable.id, id)) as any[];
    if (!src || src.status === "deleted") {
      res.status(404).json({ error: "Edition not found" });
      return;
    }

    const newName = advanceYearsInName(src.name);
    const newId   = makeEditionId(newName);
    const newYear = src.year ? src.year + 1 : null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [row] = await db.insert(editionsTable).values({
        id:              newId,
        name:            newName,
        status:          "draft" as const,
        tier:            String(src.tier ?? "basic"),
        sections:        (src.sections ?? []) as string[],
        priceLow:        src.priceLow ?? null,
        priceHigh:       src.priceHigh ?? null,
        themes:          (src.themes ?? []) as string[],
        packs:           (src.packs ?? []) as string[],
        inserts:         (src.inserts ?? []) as string[],
        products:        (src.products ?? []) as string[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        art:             (src.art ?? { cover: null, first: null, divider: null, weekly: null, daily: null, notes: null }) as any,
        globalAvailable: Boolean(src.globalAvailable ?? true),
        origin:          "licensed" as const,
        authoredByStoreId: null,
        revisionOf:      id,
        year:            newYear,
      }).returning() as any[];

      await writeAudit(db, {
        actorUserId: req.actor!.userId,
        actorRole:   req.actor!.effectiveRole,
        scope:       "platform",
        action:      "catalog.edition.duplicate",
        targetType:  "edition",
        targetId:    newId,
        metadata:    { sourceId: id, sourceName: src.name, newName, autoAdvancedYear: true },
      });

      res.status(201).json(row);
    } catch (err) {
      req.log.error({ err }, "Edition duplicate failed");
      res.status(500).json({ error: "Duplicate failed" });
    }
  },
);

export default router;
