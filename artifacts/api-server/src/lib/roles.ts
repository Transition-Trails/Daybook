/**
 * Role definitions and helpers for the multi-tenant platform.
 *
 * Platform roles (attached to the user record):
 *   super_admin — full platform access, bypasses all store scoping
 *   null        — no platform privilege; access via store memberships only
 *
 * Store-scoped roles (per store_members row):
 *   store_owner  — full admin of one store + planner builds
 *   store_staff  — manage catalog selection; cannot touch billing or store settings
 *   support      — read-only + view customers/help; cannot edit
 *   customer     — end user; cannot reach admin routes
 */
import type { User } from "@workspace/db";

// ── Platform role ─────────────────────────────────────────────────────────────

export type PlatformRole = "super_admin" | null;

/** Returns true if the user has super_admin platform access. */
export function isSuperAdmin(user: User): boolean {
  return user.platformRole === "super_admin";
}

// ── Store-scoped roles ────────────────────────────────────────────────────────

export const STORE_ROLES = [
  "store_owner",
  "store_staff",
  "support",
  "customer",
] as const;

export type StoreRole = (typeof STORE_ROLES)[number];

/** Numeric rank — lower = more privilege. */
export const STORE_ROLE_RANK: Record<StoreRole, number> = {
  store_owner: 0,
  store_staff: 1,
  support:     2,
  customer:    3,
};

/** Returns true if `actual` meets or exceeds the `required` minimum privilege level. */
export function hasStoreRole(actual: StoreRole, required: StoreRole): boolean {
  return STORE_ROLE_RANK[actual] <= STORE_ROLE_RANK[required];
}

// ── Actor context ─────────────────────────────────────────────────────────────

/** Resolved per-request context attached as req.actor by resolveStoreActor middleware. */
export interface ActorContext {
  userId: string;
  platformRole: PlatformRole;
  isSuperAdmin: boolean;
  /** The store context from req.params.storeId or x-store-id header, if any. */
  storeId: string | null;
  /** The actor's role in the store context, or null if not a member. */
  storeRole: StoreRole | null;
  /** Effective actor label used for audit entries. */
  effectiveRole: string;
}

// Extend Express.Request so routes can access req.actor.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: ActorContext;
    }
  }
}
