/**
 * Daybook Item-Level Entitlement Engine
 *
 * Single source of truth for origin-based access gating.
 * Used by catalog reads, storefront, store builder, and the generation path.
 *
 * Rules:
 *   starter  → always entitled (no subscription needed).
 *   licensed → entitled only while store.subscriptionActive === true.
 *   owned    → entitled only for the authoring store (+ super_admin management views).
 *
 * super_admin bypass: management/admin views pass isSuperAdmin=true to see everything.
 * The storefront and generation paths ALWAYS pass the store's real entitlement —
 * super_admin cannot bypass the store's subscription gate there.
 *
 * Offboarding guarantee: entitlement gates NEW generation only.
 * Already-generated planner PDFs and their Ink layers are never gated
 * (they live in the customer's Drive and are accessed via ink.ts / pdf-proxy directly).
 */

export type ItemOrigin       = "starter" | "licensed" | "owned";
export type EntitlementStatus =
  | "entitled"              // item is usable
  | "gated-license-lapsed"  // licensed item but store.subscriptionActive === false
  | "not-yours";            // owned item belonging to a different store

export interface EntitlementContext {
  storeId: string;
  subscriptionActive: boolean;
  /** Pass true for super_admin management views only (not for storefront/builder). */
  isSuperAdmin?: boolean;
}

/**
 * Resolve the entitlement status for a single catalog item.
 */
export function resolveEntitlement(
  origin: ItemOrigin,
  authoredByStoreId: string | null | undefined,
  ctx: EntitlementContext,
): EntitlementStatus {
  if (ctx.isSuperAdmin) return "entitled"; // management view bypass

  switch (origin) {
    case "starter":
      return "entitled";

    case "licensed":
      return ctx.subscriptionActive ? "entitled" : "gated-license-lapsed";

    case "owned":
      return authoredByStoreId === ctx.storeId ? "entitled" : "not-yours";
  }
}

/**
 * Annotate an array of catalog items with their entitlement status.
 * Items with origin / authoredByStoreId are expected; missing origin defaults to "licensed".
 */
export function annotateWithEntitlement<T extends {
  origin?: string | null;
  authoredByStoreId?: string | null;
}>(
  items: T[],
  ctx: EntitlementContext,
): (T & { origin: ItemOrigin; entitlementStatus: EntitlementStatus })[] {
  return items.map((item) => {
    const origin = (item.origin ?? "licensed") as ItemOrigin;
    const status = resolveEntitlement(origin, item.authoredByStoreId ?? null, ctx);
    return { ...item, origin, entitlementStatus: status };
  });
}

/**
 * Filter an annotated array to only entitled items.
 * Use for storefront responses — customers must never see gated/foreign items.
 */
export function filterEntitled<T extends {
  origin?: string | null;
  authoredByStoreId?: string | null;
}>(items: T[], ctx: EntitlementContext): T[] {
  return items.filter((item) => {
    const origin = (item.origin ?? "licensed") as ItemOrigin;
    return resolveEntitlement(origin, item.authoredByStoreId ?? null, ctx) === "entitled";
  });
}

export class EntitlementError extends Error {
  constructor(
    public readonly itemId: string,
    public readonly itemType: string,
    public readonly status: EntitlementStatus,
  ) {
    const reason =
      status === "gated-license-lapsed"
        ? `Your store's subscription is inactive — licensed content cannot be used to generate new planners. Reactivate your subscription to continue, or switch to starter/owned items only.`
        : `Item "${itemId}" (${itemType}) is owned by another store and cannot be used here.`;
    super(reason);
    this.name = "EntitlementError";
  }
}

/**
 * Assert that a specific catalog item is entitled for the given store context.
 * Throws EntitlementError with a human-readable message if not.
 * Use at the TOP of the generation / publish path (never in serving existing artifacts).
 */
export function assertEntitled(
  itemId: string,
  itemType: string,
  origin: ItemOrigin,
  authoredByStoreId: string | null | undefined,
  ctx: EntitlementContext,
): void {
  const status = resolveEntitlement(origin, authoredByStoreId, ctx);
  if (status !== "entitled") {
    throw new EntitlementError(itemId, itemType, status);
  }
}

/**
 * Human-readable badge label for UI display.
 */
export function originBadge(origin: ItemOrigin): string {
  switch (origin) {
    case "starter":  return "Starter";
    case "licensed": return "Licensed";
    case "owned":    return "Yours";
  }
}
