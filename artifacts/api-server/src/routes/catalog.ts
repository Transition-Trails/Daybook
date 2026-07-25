/**
 * Catalog routes — themes, packs, inserts, products, editions
 *
 * Visibility:
 *   - GET (list/detail): public sees status=live only; super_admin sees all.
 *   - POST / PATCH / DELETE: super_admin only (central catalog is platform-managed).
 *
 * Store-scoped catalog curation is handled in /stores/:storeId/catalog.
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
} from "@workspace/db";
import { eq, ne } from "drizzle-orm";
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

  // GET /{entity}/:id
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
    // ─────────────────────────────────────────────────────────────────────

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
  // Also handles publish ({status:"live"}) and globalAvailable flag changes.
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

buildCatalogRoutes(router, "/themes",      themesTable,          "Theme");
buildCatalogRoutes(router, "/palettes",   palettesTable,        "Palette");
buildCatalogRoutes(router, "/backgrounds",backgroundsTable,     "Background");
buildCatalogRoutes(router, "/packs",      stickerPacksTable,    "StickerPack");
buildCatalogRoutes(router, "/inserts",    insertsTable,         "Insert",       { dedupByName: true });
buildCatalogRoutes(router, "/products",   relatedProductsTable, "RelatedProduct");
buildCatalogRoutes(router, "/editions",   editionsTable,        "Edition");

// ── Edition-specific: duplicate ───────────────────────────────────────────────
// POST /editions/:id/duplicate
// Creates a draft clone carrying over themes/packs/inserts/products,
// auto-advancing any 20XX year in the name by 1, and setting revisionOf.
// Never touches the source or anything generated from it.

function advanceYearsInName(name: string): string {
  // Bump every 4-digit year matching 20XX (e.g. 2026→2027, 2026–2027→2027–2028)
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
