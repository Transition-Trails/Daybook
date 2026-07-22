/**
 * Catalog routes — themes, packs, inserts, products, editions
 * Per spec/API-CONTRACT.md:
 *   - Public reads: status=live only
 *   - Admin (staff/owner): sees all statuses
 *   - Writes: staff/owner only
 *   - PATCH handles publish: { status: "live" }
 *   - Edition PATCH also handles attach/detach via themes|packs|inserts|products arrays
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
import { requireStaff, isAdmin } from "../lib/auth-middleware";
import type { User } from "@workspace/db";

const router: IRouter = Router();

// ── Shared helpers ─────────────────────────────────────────────────────────

/** Visibility filter: admins see all; public sees only live */
function visibleOnly(req: Request): boolean {
  return !isAdmin(req);
}

// ── Generic CRUD factory ─────────────────────────────────────────────────────

type AnyTable =
  | typeof themesTable
  | typeof stickerPacksTable
  | typeof insertsTable
  | typeof relatedProductsTable
  | typeof editionsTable;

function buildCatalogRoutes(
  router: IRouter,
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  entityLabel: string,
) {
  // GET /{entity}
  router.get(path, async (req: Request, res: Response): Promise<void> => {
    const publicOnly = visibleOnly(req);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rows: any[];
    if (publicOnly) {
      // Public: only live
      rows = await db.select().from(table).where(eq(table.status, "live")).orderBy(table.createdAt) as any[];
    } else {
      // Admin: all statuses except soft-deleted
      rows = await db.select().from(table).where(ne(table.status, "deleted")).orderBy(table.createdAt) as any[];
    }
    res.json(rows);
  });

  // GET /{entity}/:id
  router.get(`${path}/:id`, async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.select().from(table).where(eq(table.id, id)) as any[];
    if (!row || row.status === "deleted") { res.status(404).json({ error: `${entityLabel} not found` }); return; }
    if (visibleOnly(req) && row.status !== "live") {
      res.status(404).json({ error: `${entityLabel} not found` });
      return;
    }
    res.json(row);
  });

  // POST /{entity} — admin only
  router.post(path, requireStaff, async (req: Request, res: Response): Promise<void> => {
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

  // PATCH /{entity}/:id — admin only (handles publish: {status:'live'}, and field updates)
  router.patch(`${path}/:id`, requireStaff, async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    delete body.id; // never allow overwriting the PK
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.update(table).set(body).where(eq(table.id, id)).returning() as any[];
    if (!row) { res.status(404).json({ error: `${entityLabel} not found` }); return; }
    res.json(row);
  });

  // DELETE /{entity}/:id — admin only (soft-delete: status="deleted"; row is never destroyed)
  router.delete(`${path}/:id`, requireStaff, async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await db.update(table).set({ status: "deleted" }).where(eq(table.id, id)).returning() as any[];
    if (!row) { res.status(404).json({ error: `${entityLabel} not found` }); return; }
    res.sendStatus(204);
  });
}

// ── Register all catalog entities ─────────────────────────────────────────────

buildCatalogRoutes(router, "/themes", themesTable, "Theme");
buildCatalogRoutes(router, "/packs", stickerPacksTable, "StickerPack");
buildCatalogRoutes(router, "/inserts", insertsTable, "Insert");
buildCatalogRoutes(router, "/products", relatedProductsTable, "RelatedProduct");
buildCatalogRoutes(router, "/editions", editionsTable, "Edition");

export default router;
