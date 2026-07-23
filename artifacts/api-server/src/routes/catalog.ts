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
  stickerPacksTable,
  insertsTable,
  relatedProductsTable,
  editionsTable,
} from "@workspace/db";
import { eq, ne } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { isSuperAdmin } from "../lib/roles";
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

function buildCatalogRoutes(
  router: IRouter,
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  entityLabel: string,
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

buildCatalogRoutes(router, "/themes",   themesTable,          "Theme");
buildCatalogRoutes(router, "/packs",    stickerPacksTable,    "StickerPack");
buildCatalogRoutes(router, "/inserts",  insertsTable,         "Insert");
buildCatalogRoutes(router, "/products", relatedProductsTable, "RelatedProduct");
buildCatalogRoutes(router, "/editions", editionsTable,        "Edition");

export default router;
