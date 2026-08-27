import { type Request, type Response, type NextFunction } from "express";
import type { ActorContext } from "./roles";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

/**
 * Confirms that a route's URL store ID matches the authenticated actor's
 * resolved store membership. This closes the gap where sub-router middleware
 * may have resolved the actor from x-store-id before the URL params were
 * populated.
 */
export function assertStoreScope(
  actor: ActorContext,
  urlStoreId: string,
  res: Response,
): boolean {
  if (
    actor.impersonation &&
    actor.impersonation.storeId !== urlStoreId
  ) {
    res.status(403).json({
      error: "Forbidden: impersonation scope is limited to the entered store",
    });
    return false;
  }
  if (actor.platformRole === "super_admin") return true;

  if (actor.storeId === urlStoreId && actor.storeRole) return true;

  res.status(403).json({ error: "Forbidden: cross-store access denied" });
  return false;
}
