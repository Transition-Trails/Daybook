import { db } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";

type Duplicate = { id: string; name: string; status?: string };

/**
 * Finds a non-deleted item with the same normalized name in one store.
 * Catalog rows use authoredByStoreId while planner interiors use storeId.
 */
export function normalizeStoreName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// The Daybook catalog tables intentionally share these ownership/name columns,
// but Drizzle does not expose a useful common table type for them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function findSameStoreName(table: any, storeId: string, name: string): Promise<Duplicate | null> {
  const storeColumn = table.authoredByStoreId ?? table.storeId;
  if (!storeColumn || !table.id || !table.name) {
    throw new Error("Name dedup requires a store-owned table with id and name columns");
  }

  const conditions = [eq(storeColumn, storeId)];
  if (table.origin) conditions.push(eq(table.origin, "owned"));
  if (table.status) conditions.push(ne(table.status, "deleted"));

  const rows = table.status
    ? await db
      .select({ id: table.id, name: table.name, status: table.status })
      .from(table)
      .where(and(...conditions))
    : await db
      .select({ id: table.id, name: table.name })
      .from(table)
      .where(and(...conditions));

  const normalized = normalizeStoreName(name);
  return rows.find((row) => normalizeStoreName(row.name) === normalized) ?? null;
}