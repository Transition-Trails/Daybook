/**
 * Platform catalog promotion / demotion routes.
 *
 * Only content authored by the house store (HOUSE_STORE_ID) can be promoted
 * into the platform catalog. Customer store content is theirs alone — a super
 * admin cannot pull it into the platform catalog.
 *
 * POST /api/platform/catalog/promote
 *   { itemType, itemId, targetOrigin: "starter" | "licensed" }
 *   Moves a house-store-owned item to the platform catalog.
 *   Sets origin = targetOrigin, globalAvailable = true.
 *
 * POST /api/platform/catalog/demote
 *   { itemType, itemId }
 *   Returns a promoted item to owned status.
 *   BLOCKED if any non-house store has adopted the item via store_catalog.
 *
 * GET  /api/platform/catalog/house-owned
 *   Lists all items authored by the house store (any origin).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  themesTable,
  stickerPacksTable,
  insertsTable,
  editionsTable,
  palettesTable,
  backgroundsTable,
  widgetsTable,
  hardwareTable,
  accessoriesTable,
  storeCatalogTable,
  storesTable,
} from "@workspace/db";
import { eq, and, ne, count, inArray } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware/requireRole";
import { writeAudit } from "../lib/audit";

export const HOUSE_STORE_ID = "store-house";

const router: IRouter = Router();

// ── Catalog item types ────────────────────────────────────────────────────────

export type CatalogItemType =
  | "theme" | "pack" | "insert" | "edition"
  | "palette" | "background" | "widget" | "hardware" | "accessory";

const VALID_ITEM_TYPES = new Set<CatalogItemType>([
  "theme", "pack", "insert", "edition",
  "palette", "background", "widget", "hardware", "accessory",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveTable(itemType: CatalogItemType): any {
  switch (itemType) {
    case "theme":      return themesTable;
    case "pack":       return stickerPacksTable;
    case "insert":     return insertsTable;
    case "edition":    return editionsTable;
    case "palette":    return palettesTable;
    case "background": return backgroundsTable;
    case "widget":     return widgetsTable;
    case "hardware":   return hardwareTable;
    case "accessory":  return accessoriesTable;
  }
}

/**
 * Returns the store_catalog itemType strings used for this catalog type.
 * Editions are stored as both "edition" and "product" (notebook/journal rows).
 * Returns [] for types not tracked in store_catalog.
 */
function storeCatalogTypes(itemType: CatalogItemType): string[] {
  switch (itemType) {
    case "theme":   return ["theme"];
    case "pack":    return ["pack"];
    case "insert":  return ["insert"];
    case "edition": return ["edition", "product"];
    default:        return [];
  }
}

// ── GET /api/platform/catalog/house-owned ────────────────────────────────────

router.get(
  "/platform/catalog/house-owned",
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    const types: CatalogItemType[] = [
      "theme", "pack", "insert", "edition",
      "palette", "background", "widget", "hardware", "accessory",
    ];

    const results: Array<{
      id: string;
      name: string;
      itemType: CatalogItemType;
      origin: string;
      status: string;
      authoredByStoreId: string | null;
    }> = [];

    for (const itemType of types) {
      const table = resolveTable(itemType);
      const rows = await db
        .select({
          id: table.id,
          name: table.name,
          origin: table.origin,
          status: table.status,
          authoredByStoreId: table.authoredByStoreId,
        })
        .from(table)
        .where(eq(table.authoredByStoreId, HOUSE_STORE_ID));
      for (const row of rows) {
        results.push({ ...row, itemType });
      }
    }

    res.json(results);
  },
);

// ── POST /api/platform/catalog/promote ───────────────────────────────────────

router.post(
  "/platform/catalog/promote",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { itemType, itemId, targetOrigin } = req.body as {
      itemType: CatalogItemType;
      itemId: string;
      targetOrigin: "starter" | "licensed";
    };

    if (!itemType || !itemId || !targetOrigin) {
      res.status(400).json({ error: "itemType, itemId, and targetOrigin are required" });
      return;
    }
    if (!VALID_ITEM_TYPES.has(itemType)) {
      res.status(400).json({ error: `Unknown itemType: ${itemType}` });
      return;
    }
    if (targetOrigin !== "starter" && targetOrigin !== "licensed") {
      res.status(400).json({ error: "targetOrigin must be 'starter' or 'licensed'" });
      return;
    }

    const table = resolveTable(itemType);
    const [item] = await db.select().from(table).where(eq(table.id, itemId));

    if (!item || item.status === "deleted") {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    if (item.origin !== "owned") {
      res.status(409).json({
        error: `Item is already '${item.origin}' — demote it first before re-promoting to a different tier.`,
        code: "ALREADY_PROMOTED",
      });
      return;
    }
    // Server-side guard: only house store content is promotable.
    if (item.authoredByStoreId !== HOUSE_STORE_ID) {
      res.status(403).json({
        error:
          "Only content authored by Pixel Perfect Plans (the house store) can be promoted to the platform catalog. Customer store content belongs to them.",
        code: "NOT_HOUSE_STORE_CONTENT",
      });
      return;
    }

    const [updated] = await db
      .update(table)
      .set({ origin: targetOrigin, globalAvailable: true })
      .where(eq(table.id, itemId))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "catalog.promote",
      targetType: itemType,
      targetId: itemId,
      metadata: { fromOrigin: "owned", toOrigin: targetOrigin, authoredByStoreId: HOUSE_STORE_ID },
    });

    res.json({ ...updated, itemType });
  },
);

// ── POST /api/platform/catalog/demote ────────────────────────────────────────

router.post(
  "/platform/catalog/demote",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { itemType, itemId } = req.body as {
      itemType: CatalogItemType;
      itemId: string;
    };

    if (!itemType || !itemId) {
      res.status(400).json({ error: "itemType and itemId are required" });
      return;
    }
    if (!VALID_ITEM_TYPES.has(itemType)) {
      res.status(400).json({ error: `Unknown itemType: ${itemType}` });
      return;
    }

    const table = resolveTable(itemType);
    const [item] = await db.select().from(table).where(eq(table.id, itemId));

    if (!item || item.status === "deleted") {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    if (item.origin === "owned") {
      res.status(409).json({ error: "Item is already 'owned' — nothing to demote.", code: "ALREADY_OWNED" });
      return;
    }
    if (item.authoredByStoreId !== HOUSE_STORE_ID) {
      res.status(403).json({
        error: "Only house store content can be demoted via this route.",
        code: "NOT_HOUSE_STORE_CONTENT",
      });
      return;
    }

    // Adoption check — block demotion if any other store has this item in their catalog.
    const catTypes = storeCatalogTypes(itemType);
    let adoptionCount = 0;
    let adopters: { storeId: string; name: string }[] = [];

    if (catTypes.length > 0) {
      const [{ count: cnt }] = await db
        .select({ count: count() })
        .from(storeCatalogTable)
        .where(
          and(
            eq(storeCatalogTable.itemId, itemId),
            inArray(storeCatalogTable.itemType, catTypes),
            ne(storeCatalogTable.storeId, HOUSE_STORE_ID),
          ),
        );
      adoptionCount = Number(cnt);

      if (adoptionCount > 0) {
        adopters = await db
          .select({ storeId: storeCatalogTable.storeId, name: storesTable.name })
          .from(storeCatalogTable)
          .innerJoin(storesTable, eq(storeCatalogTable.storeId, storesTable.id))
          .where(
            and(
              eq(storeCatalogTable.itemId, itemId),
              inArray(storeCatalogTable.itemType, catTypes),
              ne(storeCatalogTable.storeId, HOUSE_STORE_ID),
            ),
          )
          .limit(5);

        res.status(409).json({
          error: `Cannot demote: ${adoptionCount} store${adoptionCount !== 1 ? "s have" : " has"} added this item to their catalog. Removing it would break their offering — you cannot pull the rug out from under a store that built on it.`,
          code: "ADOPTION_BLOCK",
          adoptedByCount: adoptionCount,
          adopters: adopters.map((a) => ({ storeId: a.storeId, name: a.name })),
        });
        return;
      }
    }

    const fromOrigin = item.origin as string;

    const [updated] = await db
      .update(table)
      .set({ origin: "owned", globalAvailable: false })
      .where(eq(table.id, itemId))
      .returning();

    await writeAudit(db, {
      actorUserId: actor.userId,
      actorRole: actor.effectiveRole,
      scope: "platform",
      action: "catalog.demote",
      targetType: itemType,
      targetId: itemId,
      metadata: { fromOrigin, toOrigin: "owned", authoredByStoreId: HOUSE_STORE_ID },
    });

    res.json({ ...updated, itemType });
  },
);

export default router;
