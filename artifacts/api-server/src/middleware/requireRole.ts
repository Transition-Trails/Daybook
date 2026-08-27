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
  type StoreImpersonation,
} from "../lib/roles";
import { withAuditContext, writeAudit } from "../lib/audit";

// ── Internal helper ───────────────────────────────────────────────────────────

function getRequestStoreId(req: Request): string | null {
  return (
    (req.params.storeId as string | undefined) ??
    (req.headers["x-store-id"] as string | undefined) ??
    (typeof req.query.storeId === "string" ? req.query.storeId : null) ??
    null
  );
}

function getPathBoundStoreId(req: Request): string | undefined {
  const pathname = req.originalUrl.split("?")[0] ?? "";
  try {
    const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const storePrefixIndex = segments.findIndex(
      (segment) => segment === "stores" || segment === "store",
    );
    return storePrefixIndex >= 0 ? segments[storePrefixIndex + 1] : undefined;
  } catch {
    return undefined;
  }
}

export function getActiveImpersonation(req: Request, userId: string): StoreImpersonation | undefined {
  const session = req.session;
  const candidate = session?.storeImpersonation;
  if (!candidate || candidate.actorUserId !== userId) {
    if (candidate) delete session.storeImpersonation;
    return undefined;
  }
  if (
    !candidate.storeId ||
    !candidate.startedAt ||
    !candidate.expiresAt ||
    Number.isNaN(Date.parse(candidate.expiresAt)) ||
    Date.parse(candidate.expiresAt) <= Date.now()
  ) {
    delete session.storeImpersonation;
    return undefined;
  }
  return candidate;
}

function rejectImpersonationScope(
  req: Request,
  res: Response,
  impersonation: StoreImpersonation | undefined,
  allowMatchingStoreHeader = false,
): boolean {
  if (!impersonation) return true;

  const pathStoreId = getPathBoundStoreId(req);
  const headerStoreId = req.headers["x-store-id"] as string | undefined;
  const queryStoreId = typeof req.query.storeId === "string" ? req.query.storeId : undefined;
  const isExplicitExit =
    req.method === "POST" &&
    req.originalUrl.split("?")[0]?.endsWith("/stores/impersonation/exit");
  const isScopedAuditRead =
    req.method === "GET" &&
    req.originalUrl.split("?")[0]?.endsWith("/audit") &&
    queryStoreId === impersonation.storeId;
  const isScopedStoreDiscovery =
    req.method === "GET" &&
    req.originalUrl.split("?")[0]?.endsWith("/me/stores");
  const routeStoreId = isExplicitExit ? undefined : pathStoreId;
  const trustedStoreId =
    routeStoreId ??
    (allowMatchingStoreHeader && headerStoreId === impersonation.storeId
      ? headerStoreId
      : undefined);
  const suppliedStoreIds = [routeStoreId, headerStoreId, queryStoreId].filter(
    (value): value is string => Boolean(value),
  );
  if (suppliedStoreIds.some((storeId) => storeId !== impersonation.storeId)) {
    res.status(403).json({
      error: "Forbidden: impersonation scope is limited to the entered store",
    });
    return false;
  }
  // A header or query value is caller-controlled and cannot turn a platform
  // route into a store-scoped route. Only a route-bound :storeId is proof that
  // the operation itself targets the entered store.
  if (!trustedStoreId && !isExplicitExit && !isScopedAuditRead && !isScopedStoreDiscovery) {
    res.status(403).json({
      error: "Forbidden: an impersonated request must target the entered store",
    });
    return false;
  }
  if (
    Array.isArray(req.body?.changes) &&
    req.body.changes.some((change: { storeId?: unknown }) => change?.storeId !== impersonation.storeId)
  ) {
    res.status(403).json({
      error: "Forbidden: impersonation scope is limited to the entered store",
    });
    return false;
  }
  return true;
}

async function buildActor(req: Request): Promise<ActorContext | null> {
  if (!req.isAuthenticated()) return null;
  const user = req.user as User;
  const sa = isSuperAdmin(user);
  const impersonation = sa ? getActiveImpersonation(req, user.id) : undefined;

  // Store context from route param or header
  const storeId = getRequestStoreId(req) ?? impersonation?.storeId ?? null;

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
    impersonation,
  };
}

function setActorAndContinue(
  req: Request,
  res: Response,
  next: NextFunction,
  actor: ActorContext,
): void {
  const isMutation = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  const isExplicitExit = req.originalUrl.split("?")[0]?.endsWith("/stores/impersonation/exit");
  if (actor.impersonation && isMutation && !isExplicitExit) {
    const startedAt = Date.now();
    const requestPath = req.originalUrl.split("?")[0] ?? req.originalUrl;
    res.once("finish", () => {
      if (res.statusCode >= 400) return;
      void writeAudit(db, {
        actorUserId: actor.userId,
        actorRole: actor.effectiveRole,
        scope: actor.impersonation!.storeId,
        action: "store.impersonation.mutation",
        targetType: "http_request",
        targetId: requestPath,
        impersonation: actor.impersonation,
        metadata: {
          method: req.method,
          path: requestPath,
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt,
        },
      });
    });
  }
  req.actor = actor;
  withAuditContext(
    { actorUserId: actor.userId, impersonation: actor.impersonation },
    () => next(),
  );
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
  const actor = (await buildActor(req))!;
  if (!rejectImpersonationScope(req, res, actor.impersonation)) return;
  setActorAndContinue(req, res, next, actor);
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
    const actor = (await buildActor(req))!;
    if (rejectImpersonationScope(req, _res, actor.impersonation)) {
      setActorAndContinue(req, _res, next, actor);
    }
    return;
  }
  next();
}

/**
 * Optional actor resolution for a route whose handler independently verifies
 * the resource belongs to the x-store-id scope (for example token-capable order
 * actions). Do not use this for platform-wide routes.
 */
export async function resolveStoreActorOptionalWithStoreHeader(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.isAuthenticated()) {
    const actor = (await buildActor(req))!;
    if (rejectImpersonationScope(req, res, actor.impersonation, true)) {
      setActorAndContinue(req, res, next, actor);
    }
    return;
  }
  next();
}

/** Authenticated actor resolution for store-header-scoped operator routes. */
export async function resolveStoreActorWithStoreHeader(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const actor = (await buildActor(req))!;
  if (!rejectImpersonationScope(req, res, actor.impersonation, true)) return;
  setActorAndContinue(req, res, next, actor);
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
  const actor = req.actor ?? (await buildActor(req))!;
  if (!rejectImpersonationScope(req, res, actor.impersonation)) return;
  setActorAndContinue(req, res, next, actor);
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
    if (!rejectImpersonationScope(req, res, actor.impersonation, true)) return;

    if (actor.isSuperAdmin) {
      setActorAndContinue(req, res, next, actor);
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
