import { type NextFunction, type Request, type Response } from "express";
import type { ActorContext } from "./roles";

type ScopedCatalogAsset = {
  authoredByStoreId: string | null;
  status?: string | null;
};

/**
 * Preview is available to storefront customers, but only for their active
 * store context and only as a catalog preview. Customer sessions cannot use
 * preview as an authoring/composition endpoint.
 */
export function plannerPreviewAuthorizationError(
  actor: ActorContext,
  requestedStoreId: string | undefined,
  hasComposition: boolean,
): string | null {
  if (!requestedStoreId) {
    if (actor.storeRole === "customer") return "Forbidden: store context required";
    return null;
  }
  if (!actor.isSuperAdmin && actor.storeId !== requestedStoreId) {
    return "Forbidden: cross-store access denied";
  }
  if (actor.isSuperAdmin) return null;
  if (!["store_owner", "store_staff", "customer"].includes(actor.storeRole ?? "")) {
    return "Forbidden: store membership required";
  }
  if (actor.storeRole === "customer" && hasComposition) {
    return "Forbidden: planner composition preview is restricted to store staff";
  }
  return null;
}

export function authorizePlannerPreviewRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const body = req.body as {
    storeContext?: { storeId?: string };
    style?: { composition?: { placements?: unknown[] } };
  };
  const error = plannerPreviewAuthorizationError(
    req.actor!,
    body.storeContext?.storeId,
    !!body.style?.composition?.placements?.length,
  );
  if (error) {
    res.status(403).json({ error });
    return;
  }
  next();
}

export function canPreviewCatalogAsset(
  actor: ActorContext,
  asset: ScopedCatalogAsset,
): boolean {
  if (actor.isSuperAdmin) return true;
  if (asset.authoredByStoreId) {
    return asset.authoredByStoreId === actor.storeId && (
      ["store_owner", "store_staff"].includes(actor.storeRole ?? "") ||
      (actor.storeRole === "customer" && asset.status === "live")
    );
  }
  return asset.status === "live";
}