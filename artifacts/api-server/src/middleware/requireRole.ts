/**
 * Role-based access control middleware for the multi-tenant platform.
 *
 * Usage:
 *   router.get('/stores', requireSuperAdmin, handler)
 *   router.get('/stores/:storeId/catalog', requireStoreAccess('store_staff'), handler)
 *   router.get('/stores/:storeId', resolveStoreActor, handler) // attach actor, no guard
 */
import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { storeMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { User } from "@workspace/db";
import {
  isSuperAdmin,
  hasStoreRole,
  STORE_ROLE_RANK,
  type StoreRole,
  type ActorContext,
} from "../lib/roles";

// ── Internal helper ───────────────────────────────────────────────────────────

async function buildActor(req: Request): Promise<ActorContext | null> {
  if (!req.isAuthenticated()) return null;
  const user = req.user as User;
  const sa = isSuperAdmin(user);

  // Store context from route param or header
  const storeId =
    (req.params.storeId as string | undefined) ??
    (req.headers["x-store-id"] as string | undefined) ??
    null;

  let storeRole: StoreRole | null = null;

  if (storeId && !sa) {
    const rows = await db
      .select()
      .from(storeMembersTable)
      .where(
        and(
          eq(storeMembersTable.storeId, storeId),
          eq(storeMembersTable.userId, user.id),
        ),
      );
    if (rows[0]) storeRole = rows[0].role as StoreRole;
  }

  const effectiveRole = sa
    ? "super_admin"
    : storeRole
      ? `${storeId}:${storeRole}`
      : "user";

  return {
    userId: user.id,
    platformRole: sa ? "super_admin" : null,
    isSuperAdmin: sa,
    storeId,
    storeRole,
    effectiveRole,
  };
}

// ── Exported middleware ───────────────────────────────────────────────────────

/**
 * Resolves and caches req.actor. Does NOT enforce access — use the guards below.
 * Requires authentication; returns 401 if not logged in.
 * Useful on routes where access level determines which data is returned.
 */
export async function resolveStoreActor(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  req.actor = (await buildActor(req)) ?? undefined;
  next();
}

/**
 * Like resolveStoreActor but allows unauthenticated requests through.
 * req.actor will be undefined for unauthenticated callers.
 * Use on routes that serve different content based on auth level (e.g. public catalog).
 */
export async function resolveStoreActorOptional(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.isAuthenticated()) {
    req.actor = (await buildActor(req)) ?? undefined;
  }
  next();
}

/**
 * Requires the caller to be a platform-wide super_admin.
 * No store context needed.
 */
export async function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = req.user as User;
  if (!isSuperAdmin(user)) {
    res.status(403).json({ error: "Forbidden: super_admin required" });
    return;
  }
  if (!req.actor) {
    req.actor = (await buildActor(req)) ?? undefined;
  }
  next();
}

/**
 * Factory: require the caller to have at least `minRole` in the store given by
 * req.params.storeId (or x-store-id header). Super admins always pass.
 *
 * Example: requireStoreAccess('store_staff')
 */
export function requireStoreAccess(minRole: StoreRole) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const actor = await buildActor(req);
    if (!actor) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    req.actor = actor;

    if (actor.isSuperAdmin) {
      next();
      return;
    }

    if (!actor.storeId) {
      res.status(400).json({ error: "Store context required" });
      return;
    }

    if (!actor.storeRole) {
      res.status(403).json({ error: "Forbidden: no membership in this store" });
      return;
    }

    if (!hasStoreRole(actor.storeRole, minRole)) {
      res.status(403).json({
        error: `Forbidden: ${minRole} or higher required (you have ${actor.storeRole})`,
      });
      return;
    }

    // Block support and customer from any write (method-level guard)
    const isWrite = req.method !== "GET" && req.method !== "HEAD";
    if (
      isWrite &&
      (actor.storeRole === "support" || actor.storeRole === "customer")
    ) {
      res.status(403).json({ error: "Forbidden: read-only role" });
      return;
    }

    next();
  };
}

/**
 * Require the caller to be EITHER a super_admin OR to be a store_owner/staff of
 * the store in context. Used for store-owner self-service routes that super_admin
 * can also access.
 */
export function requireStoreOwnerOrSuperAdmin() {
  return requireStoreAccess("store_owner");
}

// Re-export rank map for use in route handlers
export { STORE_ROLE_RANK, isSuperAdmin, hasStoreRole };
