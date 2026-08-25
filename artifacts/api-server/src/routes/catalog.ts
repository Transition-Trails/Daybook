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
  widgetsTable,
  editionsTable,
  themePalettesTable,
  themeBackgroundsTable,
  themePacksTable,
  themeInsertsTable,
  themeWidgetsTable,
  themeCoversTable,
  themeHardwareTable,
  themeAccessoriesTable,
  themeFontsTable,
  hardwareTable,
  accessoriesTable,
  fontsTable,
} from "@workspace/db";
import { eq, ne, and, inArray, asc, sql } from "drizzle-orm";
import { requireSuperAdmin, requireStoreAccess, resolveStoreActorOptional } from "../middleware/requireRole";
import { type ActorContext } from "../lib/roles";
import type { User } from "@workspace/db";
import { writeAudit } from "../lib/audit";
import { callAi, generateImage } from "../lib/ai-proxy";
import { KNOWN_TEXTURE_SLUGS } from "../lib/texture-registry";
import { isPurchasableCatalogItem } from "../lib/catalog-commerce";

const router: IRouter = Router();
router.use(resolveStoreActorOptional);

// ── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Catalog visibility policy:
 *   - unauthenticated callers and authenticated end users see live rows only
 *   - staff and owner admins see draft and live rows, but never deleted rows
 *   - platform super admins see draft and live rows, but never deleted rows
 *
 * Writes remain restricted to platform super admins below.
 */
function isPublicCaller(req: Request): boolean {
  const storeRole = req.actor?.storeRole;
  const hasCatalogPreviewAccess =
    storeRole === "store_owner" ||
    storeRole === "store_staff" ||
    storeRole === "support";
  return !req.actor?.isSuperAdmin && !hasCatalogPreviewAccess;
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
      value:    r.background.assetRef,
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

// ── New slot load helpers ─────────────────────────────────────────────────────

type RichSlotItem = { id: string; name: string; position: number };

async function loadInserts(themeIds: string[]): Promise<Record<string, RichSlotItem[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({ themeId: themeInsertsTable.themeId, position: themeInsertsTable.position, item: insertsTable })
    .from(themeInsertsTable)
    .innerJoin(insertsTable, eq(themeInsertsTable.insertId, insertsTable.id))
    .where(inArray(themeInsertsTable.themeId, themeIds))
    .orderBy(themeInsertsTable.themeId, asc(themeInsertsTable.position));
  const out: Record<string, RichSlotItem[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({ id: r.item.id, name: r.item.name, position: r.position });
  }
  return out;
}

async function loadWidgets(themeIds: string[]): Promise<Record<string, RichSlotItem[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({ themeId: themeWidgetsTable.themeId, position: themeWidgetsTable.position, item: widgetsTable })
    .from(themeWidgetsTable)
    .innerJoin(widgetsTable, eq(themeWidgetsTable.widgetId, widgetsTable.id))
    .where(inArray(themeWidgetsTable.themeId, themeIds))
    .orderBy(themeWidgetsTable.themeId, asc(themeWidgetsTable.position));
  const out: Record<string, RichSlotItem[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({ id: r.item.id, name: r.item.name, position: r.position });
  }
  return out;
}

async function loadCovers(themeIds: string[]): Promise<Record<string, RichSlotItem[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({ themeId: themeCoversTable.themeId, position: themeCoversTable.position, item: insertsTable })
    .from(themeCoversTable)
    .innerJoin(insertsTable, eq(themeCoversTable.insertId, insertsTable.id))
    .where(inArray(themeCoversTable.themeId, themeIds))
    .orderBy(themeCoversTable.themeId, asc(themeCoversTable.position));
  const out: Record<string, RichSlotItem[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({ id: r.item.id, name: r.item.name, position: r.position });
  }
  return out;
}

async function loadHardware(themeIds: string[]): Promise<Record<string, RichSlotItem[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({ themeId: themeHardwareTable.themeId, position: themeHardwareTable.position, item: hardwareTable })
    .from(themeHardwareTable)
    .innerJoin(hardwareTable, eq(themeHardwareTable.hardwareId, hardwareTable.id))
    .where(inArray(themeHardwareTable.themeId, themeIds))
    .orderBy(themeHardwareTable.themeId, asc(themeHardwareTable.position));
  const out: Record<string, RichSlotItem[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({ id: r.item.id, name: r.item.name, position: r.position });
  }
  return out;
}

async function loadAccessories(themeIds: string[]): Promise<Record<string, RichSlotItem[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({ themeId: themeAccessoriesTable.themeId, position: themeAccessoriesTable.position, item: accessoriesTable })
    .from(themeAccessoriesTable)
    .innerJoin(accessoriesTable, eq(themeAccessoriesTable.accessoryId, accessoriesTable.id))
    .where(inArray(themeAccessoriesTable.themeId, themeIds))
    .orderBy(themeAccessoriesTable.themeId, asc(themeAccessoriesTable.position));
  const out: Record<string, RichSlotItem[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({ id: r.item.id, name: r.item.name, position: r.position });
  }
  return out;
}

async function loadFonts(themeIds: string[]): Promise<Record<string, RichSlotItem[]>> {
  if (!themeIds.length) return {};
  const rows = await db
    .select({ themeId: themeFontsTable.themeId, position: themeFontsTable.position, item: fontsTable })
    .from(themeFontsTable)
    .innerJoin(fontsTable, eq(themeFontsTable.fontId, fontsTable.id))
    .where(inArray(themeFontsTable.themeId, themeIds))
    .orderBy(themeFontsTable.themeId, asc(themeFontsTable.position));
  const out: Record<string, RichSlotItem[]> = {};
  for (const r of rows) {
    if (!out[r.themeId]) out[r.themeId] = [];
    out[r.themeId].push({ id: r.item.id, name: r.item.familyName, position: r.position });
  }
  return out;
}

function enrichThemes(
  themes: (typeof themesTable.$inferSelect)[],
  palettesMap:     Record<string, RichPalette[]>,
  backgroundsMap:  Record<string, RichBackground[]>,
  packsMap:        Record<string, RichPack[]>,
  insertsMap:      Record<string, RichSlotItem[]>,
  widgetsMap:      Record<string, RichSlotItem[]>,
  coversMap:       Record<string, RichSlotItem[]>,
  hardwareMap:     Record<string, RichSlotItem[]>,
  accessoriesMap:  Record<string, RichSlotItem[]>,
  fontsMap:        Record<string, RichSlotItem[]>,
) {
  return themes.map(t => ({
    ...t,
    palettes:    palettesMap[t.id]    ?? [],
    backgrounds: backgroundsMap[t.id] ?? [],
    packs:       packsMap[t.id]       ?? [],
    inserts:     insertsMap[t.id]     ?? [],
    widgets:     widgetsMap[t.id]     ?? [],
    covers:      coversMap[t.id]      ?? [],
    hardware:    hardwareMap[t.id]    ?? [],
    accessories: accessoriesMap[t.id] ?? [],
    fonts:       fontsMap[t.id]       ?? [],
  }));
}

// ── Enriched GET /themes (overrides buildCatalogRoutes list for themes) ────

router.get("/themes", async (req: Request, res: Response): Promise<void> => {
  const themes = isPublicCaller(req)
    ? await db.select().from(themesTable).where(eq(themesTable.status, "live")).orderBy(themesTable.createdAt)
    : await db.select().from(themesTable).where(ne(themesTable.status, "deleted")).orderBy(themesTable.createdAt);

  const ids = themes.map(t => t.id);
  const [palettesMap, backgroundsMap, packsMap, insertsMap, widgetsMap, coversMap, hardwareMap, accessoriesMap, fontsMap] = await Promise.all([
    loadPalettes(ids),
    loadBackgrounds(ids),
    loadPacks(ids),
    loadInserts(ids),
    loadWidgets(ids),
    loadCovers(ids),
    loadHardware(ids),
    loadAccessories(ids),
    loadFonts(ids),
  ]);
  res.json(enrichThemes(themes, palettesMap, backgroundsMap, packsMap, insertsMap, widgetsMap, coversMap, hardwareMap, accessoriesMap, fontsMap));
});

// ── Enriched GET /themes/:id (overrides buildCatalogRoutes detail) ─────────

router.get("/themes/:id", async (req: Request, res: Response): Promise<void> => {
  const id = req.params.id as string;
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
  const [palettesMap, backgroundsMap, packsMap, insertsMap, widgetsMap, coversMap, hardwareMap, accessoriesMap, fontsMap] = await Promise.all([
    loadPalettes([id]),
    loadBackgrounds([id]),
    loadPacks([id]),
    loadInserts([id]),
    loadWidgets([id]),
    loadCovers([id]),
    loadHardware([id]),
    loadAccessories([id]),
    loadFonts([id]),
  ]);
  res.json(enrichThemes([theme], palettesMap, backgroundsMap, packsMap, insertsMap, widgetsMap, coversMap, hardwareMap, accessoriesMap, fontsMap)[0]);
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
  options: { dedupByName?: boolean; itemType?: string } = {},
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
    res.json(options.itemType
      ? rows.map((row) => ({ ...row, purchasable: isPurchasableCatalogItem(options.itemType!, row) }))
      : rows);
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
    res.json(options.itemType
      ? { ...row, purchasable: isPurchasableCatalogItem(options.itemType, row) }
      : row);
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

buildCatalogRoutes(router, "/themes",      themesTable,          "Theme", { itemType: "theme" });
buildCatalogRoutes(router, "/palettes",   palettesTable,        "Palette");
buildCatalogRoutes(router, "/backgrounds",backgroundsTable,     "Background");
buildCatalogRoutes(router, "/packs",      stickerPacksTable,    "StickerPack", { itemType: "pack" });
buildCatalogRoutes(router, "/inserts",    insertsTable,         "Insert", { dedupByName: true, itemType: "insert" });
// /products — legacy read-only view of notebook/journal/memory-keeping editions.
// Writes go through /editions. /related-products is the old URL; both 301-redirect
// to the same data so existing bookmarks and API clients keep working.
router.get("/products", async (req: Request, res: Response): Promise<void> => {
  const rows = await db.select().from(editionsTable).where(
    and(
      ne(editionsTable.status, "deleted"),
      inArray(editionsTable.productType, ["notebook", "journal", "memory-keeping"]),
    ),
  );
  res.json(rows.map((row) => ({ ...row, purchasable: isPurchasableCatalogItem("edition", row) })));
});
router.get("/products/:id", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db.select().from(editionsTable).where(
    and(
      eq(editionsTable.id, req.params.id as string),
      inArray(editionsTable.productType, ["notebook", "journal", "memory-keeping"]),
    ),
  );
  if (!row || row.status === "deleted") { res.status(404).json({ error: "Product not found" }); return; }
  res.json({ ...row, purchasable: isPurchasableCatalogItem("edition", row) });
});
router.get("/related-products",     (_req: Request, res: Response) => res.redirect(301, "/products"));
router.get("/related-products/:id", (req: Request,  res: Response) => res.redirect(301, `/products/${req.params.id as string}`));

// ── Hardware routes ──────────────────────────────────────────────────────────
// GET list/detail use standard visibility; POST auto-generates id (form never sends one).

router.get("/hardware", async (req: Request, res: Response): Promise<void> => {
  const rows = isPublicCaller(req)
    ? await db.select().from(hardwareTable).where(eq(hardwareTable.status, "live")).orderBy(hardwareTable.createdAt)
    : await db.select().from(hardwareTable).where(ne(hardwareTable.status, "deleted")).orderBy(hardwareTable.createdAt);
  res.json(rows.map((row) => ({ ...row, purchasable: isPurchasableCatalogItem("hardware", row) })));
});

router.get("/hardware/:id", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db.select().from(hardwareTable).where(eq(hardwareTable.id, req.params.id as string)) as (typeof hardwareTable.$inferSelect | undefined)[];
  if (!row || row.status === "deleted") { res.status(404).json({ error: "Hardware not found" }); return; }
  if (isPublicCaller(req) && row.status !== "live") { res.status(404).json({ error: "Hardware not found" }); return; }
  res.json({ ...row, purchasable: isPurchasableCatalogItem("hardware", row) });
});

router.post("/hardware", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  if (!body.name) { res.status(400).json({ error: "name is required" }); return; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.insert(hardwareTable).values({ id: String(body.id ?? crypto.randomUUID()), ...body as any, status: (body.status as string) ?? "draft" }).returning();
    res.status(201).json(row);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) { res.status(409).json({ error: "Hardware with that id already exists" }); }
    else { req.log.error({ err }, "Hardware create failed"); res.status(500).json({ error: "Create failed" }); }
  }
});

router.patch("/hardware/:id", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>; delete body.id;
  const [row] = await db.update(hardwareTable).set(body as Partial<typeof hardwareTable.$inferInsert>).where(eq(hardwareTable.id, req.params.id as string)).returning();
  if (!row) { res.status(404).json({ error: "Hardware not found" }); return; }
  res.json(row);
});

router.delete("/hardware/:id", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const [row] = await db.update(hardwareTable).set({ status: "deleted" }).where(eq(hardwareTable.id, req.params.id as string)).returning();
  if (!row) { res.status(404).json({ error: "Hardware not found" }); return; }
  res.sendStatus(204);
});

// ── Accessories routes ────────────────────────────────────────────────────────

router.get("/accessories", async (req: Request, res: Response): Promise<void> => {
  const rows = isPublicCaller(req)
    ? await db.select().from(accessoriesTable).where(eq(accessoriesTable.status, "live")).orderBy(accessoriesTable.createdAt)
    : await db.select().from(accessoriesTable).where(ne(accessoriesTable.status, "deleted")).orderBy(accessoriesTable.createdAt);
  res.json(rows.map((row) => ({ ...row, purchasable: isPurchasableCatalogItem("accessory", row) })));
});

router.get("/accessories/:id", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db.select().from(accessoriesTable).where(eq(accessoriesTable.id, req.params.id as string)) as (typeof accessoriesTable.$inferSelect | undefined)[];
  if (!row || row.status === "deleted") { res.status(404).json({ error: "Accessory not found" }); return; }
  if (isPublicCaller(req) && row.status !== "live") { res.status(404).json({ error: "Accessory not found" }); return; }
  res.json(row);
});

router.post("/accessories", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  if (!body.name) { res.status(400).json({ error: "name is required" }); return; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.insert(accessoriesTable).values({ id: String(body.id ?? crypto.randomUUID()), ...body as any, status: (body.status as string) ?? "draft" }).returning();
    res.status(201).json(row);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) { res.status(409).json({ error: "Accessory with that id already exists" }); }
    else { req.log.error({ err }, "Accessory create failed"); res.status(500).json({ error: "Create failed" }); }
  }
});

router.patch("/accessories/:id", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>; delete body.id;
  const [row] = await db.update(accessoriesTable).set(body as Partial<typeof accessoriesTable.$inferInsert>).where(eq(accessoriesTable.id, req.params.id as string)).returning();
  if (!row) { res.status(404).json({ error: "Accessory not found" }); return; }
  res.json(row);
});

router.delete("/accessories/:id", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const [row] = await db.update(accessoriesTable).set({ status: "deleted" }).where(eq(accessoriesTable.id, req.params.id as string)).returning();
  if (!row) { res.status(404).json({ error: "Accessory not found" }); return; }
  res.sendStatus(204);
});

// ── Fonts routes ──────────────────────────────────────────────────────────────
// Font rows use familyName (not name) and always auto-generate an id on create.

router.get("/fonts", async (req: Request, res: Response): Promise<void> => {
  const rows = isPublicCaller(req)
    ? await db.select().from(fontsTable).where(eq(fontsTable.status, "live")).orderBy(fontsTable.createdAt)
    : await db.select().from(fontsTable).where(ne(fontsTable.status, "deleted")).orderBy(fontsTable.createdAt);
  res.json(rows);
});

router.get("/fonts/:id", async (req: Request, res: Response): Promise<void> => {
  const [row] = await db.select().from(fontsTable).where(eq(fontsTable.id, req.params.id as string)) as (typeof fontsTable.$inferSelect | undefined)[];
  if (!row || row.status === "deleted") { res.status(404).json({ error: "Font not found" }); return; }
  if (isPublicCaller(req) && row.status !== "live") { res.status(404).json({ error: "Font not found" }); return; }
  res.json(row);
});

router.post("/fonts", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  if (!body.familyName) { res.status(400).json({ error: "familyName is required" }); return; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.insert(fontsTable).values({ id: String(body.id ?? crypto.randomUUID()), ...body as any, status: (body.status as string) ?? "draft" }).returning();
    res.status(201).json(row);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) { res.status(409).json({ error: "Font with that id already exists" }); }
    else { req.log.error({ err }, "Font create failed"); res.status(500).json({ error: "Create failed" }); }
  }
});

router.patch("/fonts/:id", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>; delete body.id;
  const [row] = await db.update(fontsTable).set(body as Partial<typeof fontsTable.$inferInsert>).where(eq(fontsTable.id, req.params.id as string)).returning();
  if (!row) { res.status(404).json({ error: "Font not found" }); return; }
  res.json(row);
});

router.delete("/fonts/:id", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const [row] = await db.update(fontsTable).set({ status: "deleted" }).where(eq(fontsTable.id, req.params.id as string)).returning();
  if (!row) { res.status(404).json({ error: "Font not found" }); return; }
  res.sendStatus(204);
});

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
        .select({ id: backgroundsTable.id, type: backgroundsTable.type, assetRef: backgroundsTable.assetRef })
        .from(backgroundsTable)
        .where(inArray(backgroundsTable.id, ids));
      const foundIds = new Set(found.map(r => r.id));
      const missing = ids.filter(i => !foundIds.has(i));
      if (missing.length) {
        res.status(422).json({ error: `Background IDs not found: ${missing.join(", ")}` });
        return;
      }
      // ── Texture slug guard ────────────────────────────────────────────────
      // Reject any texture background whose assetRef is not a known CSS slug.
      // An unrecognised slug produces a blank page in the PDF generator.
      const badTextures = found.filter(
        r => r.type === "texture" && r.assetRef != null && !KNOWN_TEXTURE_SLUGS.has(r.assetRef),
      );
      if (badTextures.length) {
        res.status(422).json({
          error: `Texture slug(s) not recognised: ${badTextures.map(r => r.assetRef).join(", ")}. ` +
                 `Known slugs: ${[...KNOWN_TEXTURE_SLUGS].join(", ")}`,
        });
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
  const worldCode   = req.query.world as string | undefined;
  const allowedTypes = ["planner", "notebook", "journal", "memory-keeping"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows: any[];
  if (isPublicCaller(req)) {
    let filter = eq(editionsTable.status, "live") as ReturnType<typeof and>;
    if (productType && allowedTypes.includes(productType))
      filter = and(filter, eq(editionsTable.productType, productType as "planner" | "notebook" | "journal" | "memory-keeping"))!;
    if (worldCode)
      filter = and(filter, sql`UPPER(${editionsTable.world}) = ${worldCode.toUpperCase()}`)!;
    rows = await db.select().from(editionsTable).where(filter).orderBy(editionsTable.createdAt);
  } else {
    let filter = ne(editionsTable.status, "deleted") as ReturnType<typeof and>;
    if (productType && allowedTypes.includes(productType))
      filter = and(filter, eq(editionsTable.productType, productType as "planner" | "notebook" | "journal" | "memory-keeping"))!;
    if (worldCode)
      filter = and(filter, sql`UPPER(${editionsTable.world}) = ${worldCode.toUpperCase()}`)!;
    rows = await db.select().from(editionsTable).where(filter).orderBy(editionsTable.createdAt);
  }
  res.json(rows.map((row) => ({ ...row, purchasable: isPurchasableCatalogItem("edition", row) })));
});

buildCatalogRoutes(router, "/editions",   editionsTable,        "Edition", { itemType: "edition" });

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
        digitalPriceCents: src.digitalPriceCents ?? null,
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

// ── New slot PUT routes ────────────────────────────────────────────────────────
// Each route replaces the full join-table for that slot (same pattern as palettes/backgrounds/packs).

async function requireThemeGuard(req: Request, res: Response): Promise<string | null> {
  const id = req.params.id as string;
  const [theme] = await db.select({ id: themesTable.id }).from(themesTable).where(eq(themesTable.id, id));
  if (!theme) { res.status(404).json({ error: "Theme not found" }); return null; }
  return id;
}

/** Extract a flat string[] from a PUT body that is either string[] or object[]. */
function extractIds(body: unknown): string[] {
  const raw: unknown[] = Array.isArray(body) ? body : [];
  return raw.filter((x): x is string => typeof x === "string");
}

/**
 * Shared slot-type validator.
 *
 * Verifies that every supplied ID actually exists in the target entity table.
 * Returns true (caller may proceed) or false (response already sent with 422).
 *
 * Using a single helper rather than per-slot inline checks is how we avoid
 * repeating the mistake that left 7 of 9 slots unguarded.
 */
async function assertEntityIdsExist(
  slot: string,
  ids: string[],
  queryFn: (ids: string[]) => Promise<{ id: string }[]>,
  res: Response,
): Promise<boolean> {
  if (!ids.length) return true;
  const found = await queryFn(ids);
  const foundSet = new Set(found.map(r => r.id));
  const missing = ids.filter(i => !foundSet.has(i));
  if (missing.length) {
    res.status(422).json({
      error: `Slot '${slot}': IDs not found in the ${slot} catalog: ${missing.join(", ")}`,
    });
    return false;
  }
  return true;
}

router.put("/themes/:id/inserts", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  const ids = extractIds(req.body);
  // ── Slot-type guard: inserts slot must not contain Cover-art rows ─────────
  if (ids.length) {
    const rows = await db.select({ id: insertsTable.id, cat: insertsTable.cat }).from(insertsTable).where(inArray(insertsTable.id, ids));
    const missing = ids.filter(i => !rows.find(r => r.id === i));
    if (missing.length) { res.status(422).json({ error: `Insert IDs not found: ${missing.join(", ")}` }); return; }
    const coverRows = rows.filter(r => r.cat === "Cover art");
    if (coverRows.length) {
      res.status(422).json({ error: `Slot 'inserts' requires a non-cover asset; IDs ${coverRows.map(r => r.id).join(", ")} have cat='Cover art'. Use the 'covers' slot instead.` });
      return;
    }
  }
  await db.delete(themeInsertsTable).where(eq(themeInsertsTable.themeId, id));
  if (ids.length) await db.insert(themeInsertsTable).values(ids.map((insertId, position) => ({ themeId: id, insertId, position })));
  await writeAudit(db, { actorUserId: req.actor!.userId, actorRole: req.actor!.effectiveRole, scope: "platform", action: "catalog.theme.inserts.set", targetType: "theme", targetId: id, metadata: { count: ids.length } });
  res.json({ updated: ids.length });
});

router.put("/themes/:id/widgets", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  const ids = extractIds(req.body);
  const ok = await assertEntityIdsExist("widgets", ids, (ids) => db.select({ id: widgetsTable.id }).from(widgetsTable).where(inArray(widgetsTable.id, ids)), res);
  if (!ok) return;
  await db.delete(themeWidgetsTable).where(eq(themeWidgetsTable.themeId, id));
  if (ids.length) await db.insert(themeWidgetsTable).values(ids.map((widgetId, position) => ({ themeId: id, widgetId, position })));
  await writeAudit(db, { actorUserId: req.actor!.userId, actorRole: req.actor!.effectiveRole, scope: "platform", action: "catalog.theme.widgets.set", targetType: "theme", targetId: id, metadata: { count: ids.length } });
  res.json({ updated: ids.length });
});

router.put("/themes/:id/covers", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  const ids = extractIds(req.body);
  // ── Slot-type guard: covers slot must only contain cat='Cover art' rows ───
  if (ids.length) {
    const rows = await db.select({ id: insertsTable.id, cat: insertsTable.cat }).from(insertsTable).where(inArray(insertsTable.id, ids));
    const missing = ids.filter(i => !rows.find(r => r.id === i));
    if (missing.length) { res.status(422).json({ error: `Insert IDs not found: ${missing.join(", ")}` }); return; }
    const nonCoverRows = rows.filter(r => r.cat !== "Cover art");
    if (nonCoverRows.length) {
      res.status(422).json({ error: `Slot 'covers' requires a cover asset, not an insert. IDs ${nonCoverRows.map(r => r.id).join(", ")} have cat='${nonCoverRows[0].cat}'. Use the 'inserts' slot instead.` });
      return;
    }
  }
  await db.delete(themeCoversTable).where(eq(themeCoversTable.themeId, id));
  if (ids.length) await db.insert(themeCoversTable).values(ids.map((insertId, position) => ({ themeId: id, insertId, position })));
  await writeAudit(db, { actorUserId: req.actor!.userId, actorRole: req.actor!.effectiveRole, scope: "platform", action: "catalog.theme.covers.set", targetType: "theme", targetId: id, metadata: { count: ids.length } });
  res.json({ updated: ids.length });
});

router.put("/themes/:id/hardware", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  const ids = extractIds(req.body);
  const ok = await assertEntityIdsExist("hardware", ids, (ids) => db.select({ id: hardwareTable.id }).from(hardwareTable).where(inArray(hardwareTable.id, ids)), res);
  if (!ok) return;
  await db.delete(themeHardwareTable).where(eq(themeHardwareTable.themeId, id));
  if (ids.length) await db.insert(themeHardwareTable).values(ids.map((hardwareId, position) => ({ themeId: id, hardwareId, position })));
  await writeAudit(db, { actorUserId: req.actor!.userId, actorRole: req.actor!.effectiveRole, scope: "platform", action: "catalog.theme.hardware.set", targetType: "theme", targetId: id, metadata: { count: ids.length } });
  res.json({ updated: ids.length });
});

router.put("/themes/:id/accessories", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  const ids = extractIds(req.body);
  const ok = await assertEntityIdsExist("accessories", ids, (ids) => db.select({ id: accessoriesTable.id }).from(accessoriesTable).where(inArray(accessoriesTable.id, ids)), res);
  if (!ok) return;
  await db.delete(themeAccessoriesTable).where(eq(themeAccessoriesTable.themeId, id));
  if (ids.length) await db.insert(themeAccessoriesTable).values(ids.map((accessoryId, position) => ({ themeId: id, accessoryId, position })));
  await writeAudit(db, { actorUserId: req.actor!.userId, actorRole: req.actor!.effectiveRole, scope: "platform", action: "catalog.theme.accessories.set", targetType: "theme", targetId: id, metadata: { count: ids.length } });
  res.json({ updated: ids.length });
});

router.put("/themes/:id/fonts", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  const ids = extractIds(req.body);
  const ok = await assertEntityIdsExist("fonts", ids, (ids) => db.select({ id: fontsTable.id }).from(fontsTable).where(inArray(fontsTable.id, ids)), res);
  if (!ok) return;
  await db.delete(themeFontsTable).where(eq(themeFontsTable.themeId, id));
  if (ids.length) await db.insert(themeFontsTable).values(ids.map((fontId, position) => ({ themeId: id, fontId, position })));
  await writeAudit(db, { actorUserId: req.actor!.userId, actorRole: req.actor!.effectiveRole, scope: "platform", action: "catalog.theme.fonts.set", targetType: "theme", targetId: id, metadata: { count: ids.length } });
  res.json({ updated: ids.length });
});

// ── CRUD for hardware, accessories, fonts ──────────────────────────────────────

buildCatalogRoutes(router, "/hardware",    hardwareTable,    "Hardware");
buildCatalogRoutes(router, "/accessories", accessoriesTable, "Accessory");
buildCatalogRoutes(router, "/fonts",       fontsTable,       "Font");

// ── Stage / commit bundle (ephemeral, in-memory) ──────────────────────────────

/**
 * Staged bundles keyed by themeId. Values are { [slot]: id[] } maps.
 * Cleared on server restart — this is intentional (session-scoped composition).
 */
const stagedBundles = new Map<string, Record<string, string[]>>();

router.post("/themes/:id/stage-bundle", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  const bundle = req.body?.bundle;
  if (!bundle || typeof bundle !== "object") { res.status(400).json({ error: "bundle object required" }); return; }
  stagedBundles.set(id, bundle as Record<string, string[]>);
  res.json({ themeId: id, staged: bundle });
});

router.get("/themes/:id/staged-bundle", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  res.json({ themeId: id, bundle: stagedBundles.get(id) ?? null });
});

router.post("/themes/:id/commit-bundle", requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const id = await requireThemeGuard(req, res);
  if (!id) return;
  const accepted: Record<string, string[]> = req.body?.accepted ?? {};

  let updated = 0;
  for (const [slot, rawIds] of Object.entries(accepted)) {
    if (!Array.isArray(rawIds)) continue;
    const ids = rawIds.filter((x): x is string => typeof x === "string");
    switch (slot) {
      case "palettes": {
        const ok = await assertEntityIdsExist("palettes", ids, (ids) => db.select({ id: palettesTable.id }).from(palettesTable).where(inArray(palettesTable.id, ids)), res);
        if (!ok) return;
        await db.delete(themePalettesTable).where(eq(themePalettesTable.themeId, id));
        if (ids.length) await db.insert(themePalettesTable).values(ids.map((paletteId, i) => ({ themeId: id, paletteId, position: i, isPrimary: i === 0 })));
        break;
      }
      case "backgrounds": {
        const ok = await assertEntityIdsExist("backgrounds", ids, (ids) => db.select({ id: backgroundsTable.id }).from(backgroundsTable).where(inArray(backgroundsTable.id, ids)), res);
        if (!ok) return;
        await db.delete(themeBackgroundsTable).where(eq(themeBackgroundsTable.themeId, id));
        if (ids.length) await db.insert(themeBackgroundsTable).values(ids.map((backgroundId, position) => ({ themeId: id, backgroundId, position })));
        break;
      }
      case "packs": {
        const ok = await assertEntityIdsExist("packs", ids, (ids) => db.select({ id: stickerPacksTable.id }).from(stickerPacksTable).where(inArray(stickerPacksTable.id, ids)), res);
        if (!ok) return;
        await db.delete(themePacksTable).where(eq(themePacksTable.themeId, id));
        if (ids.length) await db.insert(themePacksTable).values(ids.map((packId, position) => ({ themeId: id, packId, position })));
        break;
      }
      case "inserts": {
        const rows = ids.length ? await db.select({ id: insertsTable.id, cat: insertsTable.cat }).from(insertsTable).where(inArray(insertsTable.id, ids)) : [];
        const missing = ids.filter(i => !rows.find(r => r.id === i));
        if (missing.length) { res.status(422).json({ error: `Slot 'inserts': IDs not found: ${missing.join(", ")}` }); return; }
        const coverRows = rows.filter(r => r.cat === "Cover art");
        if (coverRows.length) {
          res.status(422).json({ error: `Slot 'inserts' requires a non-cover asset; IDs ${coverRows.map(r => r.id).join(", ")} have cat='Cover art'. Use the 'covers' slot instead.` });
          return;
        }
        await db.delete(themeInsertsTable).where(eq(themeInsertsTable.themeId, id));
        if (ids.length) await db.insert(themeInsertsTable).values(ids.map((insertId, position) => ({ themeId: id, insertId, position })));
        break;
      }
      case "covers": {
        const rows = ids.length ? await db.select({ id: insertsTable.id, cat: insertsTable.cat }).from(insertsTable).where(inArray(insertsTable.id, ids)) : [];
        const missing = ids.filter(i => !rows.find(r => r.id === i));
        if (missing.length) { res.status(422).json({ error: `Slot 'covers': IDs not found: ${missing.join(", ")}` }); return; }
        const nonCoverRows = rows.filter(r => r.cat !== "Cover art");
        if (nonCoverRows.length) {
          res.status(422).json({ error: `Slot 'covers' requires a cover asset, not an insert. IDs ${nonCoverRows.map(r => r.id).join(", ")} have cat='${nonCoverRows[0].cat}'. Use the 'inserts' slot instead.` });
          return;
        }
        await db.delete(themeCoversTable).where(eq(themeCoversTable.themeId, id));
        if (ids.length) await db.insert(themeCoversTable).values(ids.map((insertId, position) => ({ themeId: id, insertId, position })));
        break;
      }
      case "widgets": {
        const ok = await assertEntityIdsExist("widgets", ids, (ids) => db.select({ id: widgetsTable.id }).from(widgetsTable).where(inArray(widgetsTable.id, ids)), res);
        if (!ok) return;
        await db.delete(themeWidgetsTable).where(eq(themeWidgetsTable.themeId, id));
        if (ids.length) await db.insert(themeWidgetsTable).values(ids.map((widgetId, position) => ({ themeId: id, widgetId, position })));
        break;
      }
      case "hardware": {
        const ok = await assertEntityIdsExist("hardware", ids, (ids) => db.select({ id: hardwareTable.id }).from(hardwareTable).where(inArray(hardwareTable.id, ids)), res);
        if (!ok) return;
        await db.delete(themeHardwareTable).where(eq(themeHardwareTable.themeId, id));
        if (ids.length) await db.insert(themeHardwareTable).values(ids.map((hardwareId, position) => ({ themeId: id, hardwareId, position })));
        break;
      }
      case "accessories": {
        const ok = await assertEntityIdsExist("accessories", ids, (ids) => db.select({ id: accessoriesTable.id }).from(accessoriesTable).where(inArray(accessoriesTable.id, ids)), res);
        if (!ok) return;
        await db.delete(themeAccessoriesTable).where(eq(themeAccessoriesTable.themeId, id));
        if (ids.length) await db.insert(themeAccessoriesTable).values(ids.map((accessoryId, position) => ({ themeId: id, accessoryId, position })));
        break;
      }
      case "fonts": {
        const ok = await assertEntityIdsExist("fonts", ids, (ids) => db.select({ id: fontsTable.id }).from(fontsTable).where(inArray(fontsTable.id, ids)), res);
        if (!ok) return;
        await db.delete(themeFontsTable).where(eq(themeFontsTable.themeId, id));
        if (ids.length) await db.insert(themeFontsTable).values(ids.map((fontId, position) => ({ themeId: id, fontId, position })));
        break;
      }
      default:
        continue;
    }
    updated += ids.length;
  }

  // Clear staged
  stagedBundles.delete(id);

  await writeAudit(db, {
    actorUserId: req.actor!.userId,
    actorRole:   req.actor!.effectiveRole,
    scope:       "platform",
    action:      "catalog.theme.bundle.commit",
    targetType:  "theme",
    targetId:    id,
    metadata:    { slots: Object.keys(accepted), totalItems: updated },
  });

  res.json({ themeId: id, updated });
});

// ── GET /catalog/asset-types — descriptor list for the asset-catalog mode ─────

router.get("/catalog/asset-types", requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  const [
    paletteCount,
    backgroundCount,
    packCount,
    insertCount,
    widgetCount,
    hardwareCount,
    accessoryCount,
    fontCount,
  ] = await Promise.all([
    db.select({ id: palettesTable.id }).from(palettesTable).where(ne(palettesTable.status, "deleted")),
    db.select({ id: backgroundsTable.id }).from(backgroundsTable).where(ne(backgroundsTable.status, "deleted")),
    db.select({ id: stickerPacksTable.id }).from(stickerPacksTable).where(ne(stickerPacksTable.status, "deleted")),
    db.select({ id: insertsTable.id }).from(insertsTable).where(ne(insertsTable.status, "deleted")),
    db.select({ id: widgetsTable.id }).from(widgetsTable).where(ne(widgetsTable.status, "deleted")),
    db.select({ id: hardwareTable.id }).from(hardwareTable).where(ne(hardwareTable.status, "deleted")),
    db.select({ id: accessoriesTable.id }).from(accessoriesTable).where(ne(accessoriesTable.status, "deleted")),
    db.select({ id: fontsTable.id }).from(fontsTable).where(ne(fontsTable.status, "deleted")),
  ]);
  res.json([
    { slot: "palettes",    label: "Colour palettes",  glyph: "🎨", count: paletteCount.length,    studios: ["Theme Studio"] },
    { slot: "backgrounds", label: "Backgrounds",       glyph: "🖼️", count: backgroundCount.length,  studios: ["Theme Studio"] },
    { slot: "packs",       label: "Sticker packs",     glyph: "✦",  count: packCount.length,        studios: ["Theme Studio", "Sticker Studio"] },
    { slot: "inserts",     label: "Inserts",            glyph: "📄", count: insertCount.length,      studios: ["Theme Studio", "Planner Studio"] },
    { slot: "widgets",     label: "Widgets",            glyph: "⚙️", count: widgetCount.length,      studios: ["Theme Studio", "Planner Studio"] },
    { slot: "covers",      label: "Cover art",          glyph: "🎁", count: insertCount.length,      studios: ["Theme Studio"] },
    { slot: "hardware",    label: "Binding hardware",   glyph: "🔩", count: hardwareCount.length,    studios: ["Theme Studio"] },
    { slot: "accessories", label: "Accessories",        glyph: "📎", count: accessoryCount.length,   studios: ["Theme Studio"] },
    { slot: "fonts",       label: "Font pairings",      glyph: "Aa", count: fontCount.length,        studios: ["Theme Studio"] },
  ]);
});

// ── POST /stores/:storeId/backgrounds/generate ───────────────────────────────
// Store-staff route: Claude expands a brief → DALL-E 3 generates a background
// image → optionally saves to backgroundsTable (when saveToStore: true).
// Returns { expandedPrompt, assetRef, savedId }.

router.post(
  "/stores/:storeId/backgrounds/generate",
  requireStoreAccess("store_staff"),
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor as ActorContext;
    const storeId = req.params.storeId as string;

    // Cross-store guard: super_admin may access any store; others must match.
    if (actor.platformRole !== "super_admin" && actor.storeId !== storeId) {
      res.status(403).json({ error: "Access denied: store mismatch" });
      return;
    }

    const { brief, backgroundType, name, saveToStore } = req.body as {
      brief?: string;
      backgroundType?: string;
      name?: string;
      saveToStore?: boolean;
    };

    if (!brief?.trim()) {
      res.status(400).json({ error: "brief is required" });
      return;
    }
    if (!name?.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const type = backgroundType === "image" ? "image" : "texture";

    try {
      // Step 1: Claude expands the brief into a DALL-E 3 prompt
      const expansionResult = await callAi(
        [{
          role: "user",
          content: `Background brief: "${brief.trim()}".\nBackground type: ${type}.\n\nExpand this into a detailed DALL-E 3 prompt for a digital planner paper/background. Output ONLY the prompt — no JSON, no preamble.`,
        }],
        "claude",
        `You are an art director specialising in digital planner and journal aesthetics.
When given a background brief, write a precise, evocative DALL-E 3 prompt. Requirements:
- Beautiful, subtle ${type} texture suited for journaling and planning
- Seamlessly repeating pattern if possible, suitable as a PDF page background
- Muted, sophisticated colour palette — not overpowering the text on the page
- No text, no icons, no watermarks
- High resolution; photorealistic or fine-art quality
Respond with ONLY the prompt text — nothing else.`,
      );
      const expandedPrompt = expansionResult.content.trim().replace(/^["']|["']$/g, "");

      // Step 2: Generate the image with the shared GPT Image contract.
      const generatedImage = await generateImage(expandedPrompt, {
        size: "1024x1024",
        quality: "high",
      });
      const { dataUrl: imageDataUrl, ...generationMetadata } = generatedImage;

      let savedId: string | null = null;
      if (saveToStore) {
        savedId = `bg_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        await db.insert(backgroundsTable).values({
          id: savedId,
          name: name.trim(),
          type,
          assetRef: imageDataUrl,
          status: "draft",
          origin: "owned",
          authoredByStoreId: storeId,
          globalAvailable: false,
        });
      }

      const user = req.user as User;
      await writeAudit(db, {
        actorUserId: user.id,
        actorRole: actor.effectiveRole ?? "store_staff",
        scope: storeId,
        action: "backgrounds.generate",
        targetType: "background",
        targetId: savedId ?? undefined,
        metadata: { storeId, type, saveToStore: !!saveToStore, generation: generationMetadata },
      });

      res.json({ expandedPrompt, assetRef: imageDataUrl, savedId });
    } catch (err) {
      req.log?.error({ err }, "background generation failed");
      res.status(500).json({ error: "Background generation failed. Please try again." });
    }
  },
);

export default router;
