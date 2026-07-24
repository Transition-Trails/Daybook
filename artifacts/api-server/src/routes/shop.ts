/**
 * Public storefront API — no auth required.
 *
 * GET /shop/:storeSlug
 *   Returns store info + its enabled, live catalog items.
 *   Suspended stores → 410. Unknown slug → 404.
 *
 * GET /shop/:storeSlug/editions/:editionId
 *   Returns a single edition's detail, filtered to the store's enabled
 *   themes / packs / inserts.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  storesTable,
  storeCatalogTable,
  editionsTable,
  themesTable,
  stickerPacksTable,
  insertsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

type EnabledMap = {
  edition: Set<string>;
  theme: Set<string>;
  pack: Set<string>;
  insert: Set<string>;
};

async function resolveStore(slug: string) {
  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.slug, slug));
  return store ?? null;
}

async function buildEnabledMap(storeId: string): Promise<EnabledMap> {
  const rows = await db
    .select()
    .from(storeCatalogTable)
    .where(eq(storeCatalogTable.storeId, storeId));

  const map: EnabledMap = {
    edition: new Set(),
    theme: new Set(),
    pack: new Set(),
    insert: new Set(),
  };
  for (const row of rows) {
    if (row.itemType === "edition") map.edition.add(row.itemId);
    else if (row.itemType === "theme") map.theme.add(row.itemId);
    else if (row.itemType === "pack") map.pack.add(row.itemId);
    else if (row.itemType === "insert") map.insert.add(row.itemId);
  }
  return map;
}

// ── GET /shop/:storeSlug ──────────────────────────────────────────────────────

router.get("/shop/:storeSlug", async (req: Request, res: Response): Promise<void> => {
  const { storeSlug } = req.params as { storeSlug: string };

  const store = await resolveStore(storeSlug);
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  if (store.status === "suspended") {
    res.status(410).json({ error: "This store is currently unavailable." });
    return;
  }

  const enabled = await buildEnabledMap(store.id);

  // Fetch live, globally-available items that are in the store's enabled set.
  // JS filter is fine — store catalog is small.
  const [allEditions, allThemes, allPacks, allInserts] = await Promise.all([
    db.select().from(editionsTable).where(
      and(eq(editionsTable.status, "live"), eq(editionsTable.globalAvailable, true))
    ),
    db.select().from(themesTable).where(
      and(eq(themesTable.status, "live"), eq(themesTable.globalAvailable, true))
    ),
    db.select().from(stickerPacksTable).where(
      and(eq(stickerPacksTable.status, "live"), eq(stickerPacksTable.globalAvailable, true))
    ),
    db.select().from(insertsTable).where(
      and(eq(insertsTable.status, "live"), eq(insertsTable.globalAvailable, true))
    ),
  ]);

  res.json({
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      plan: store.plan,
      status: store.status,
    },
    editions: allEditions.filter(e => enabled.edition.has(e.id)),
    themes:   allThemes.filter(t => enabled.theme.has(t.id)),
    packs:    allPacks.filter(p => enabled.pack.has(p.id)),
    inserts:  allInserts.filter(i => enabled.insert.has(i.id)),
  });
});

// ── GET /shop/:storeSlug/editions/:editionId ──────────────────────────────────

router.get("/shop/:storeSlug/editions/:editionId", async (req: Request, res: Response): Promise<void> => {
  const { storeSlug, editionId } = req.params as { storeSlug: string; editionId: string };

  const store = await resolveStore(storeSlug);
  if (!store) { res.status(404).json({ error: "Store not found" }); return; }
  if (store.status === "suspended") {
    res.status(410).json({ error: "This store is currently unavailable." });
    return;
  }

  const enabled = await buildEnabledMap(store.id);
  if (!enabled.edition.has(editionId)) {
    res.status(404).json({ error: "Edition not available in this store" });
    return;
  }

  const [edition] = await db
    .select()
    .from(editionsTable)
    .where(and(eq(editionsTable.id, editionId), eq(editionsTable.status, "live")));
  if (!edition) { res.status(404).json({ error: "Edition not found" }); return; }

  const [allThemes, allPacks, allInserts] = await Promise.all([
    db.select().from(themesTable).where(
      and(eq(themesTable.status, "live"), eq(themesTable.globalAvailable, true))
    ),
    db.select().from(stickerPacksTable).where(
      and(eq(stickerPacksTable.status, "live"), eq(stickerPacksTable.globalAvailable, true))
    ),
    db.select().from(insertsTable).where(
      and(eq(insertsTable.status, "live"), eq(insertsTable.globalAvailable, true))
    ),
  ]);

  const editionThemeIds = new Set(edition.themes as string[]);
  const editionPackIds  = new Set(
    allPacks
      .filter(p => {
        const pl = p.planners as string[];
        return pl.includes("all") || pl.includes(editionId);
      })
      .map(p => p.id)
  );
  const editionInsertIds = new Set(
    allInserts
      .filter(i => {
        const pl = i.planners as string[];
        return pl.includes("all") || pl.includes(editionId);
      })
      .map(i => i.id)
  );

  res.json({
    store: { id: store.id, name: store.name, slug: store.slug },
    edition,
    themes:  allThemes.filter(t => editionThemeIds.has(t.id) && enabled.theme.has(t.id)),
    packs:   allPacks.filter(p  => editionPackIds.has(p.id)   && enabled.pack.has(p.id)),
    inserts: allInserts.filter(i => editionInsertIds.has(i.id) && enabled.insert.has(i.id)),
  });
});

export default router;
