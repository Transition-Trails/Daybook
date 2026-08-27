/**
 * Audit log helper. Call writeAudit() from every mutating route handler.
 * Failures are logged but never surface to the caller.
 */
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { auditLogTable } from "@workspace/db";
import { logger } from "./logger";
import { AsyncLocalStorage } from "node:async_hooks";
import type { StoreImpersonation } from "./roles";

const auditContext = new AsyncLocalStorage<{
  actorUserId: string;
  impersonation?: StoreImpersonation;
}>();

export interface AuditEntry {
  actorUserId: string | null;
  actorRole: string;
  scope: string; // "platform" | storeId
  action: string; // e.g. "store.create", "member.assign", "catalog.enable"
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  /** Used by session lifecycle events before the request context is established. */
  impersonation?: StoreImpersonation;
}

export function withAuditContext<T>(context: {
  actorUserId: string;
  impersonation?: StoreImpersonation;
}, callback: () => T): T {
  return auditContext.run(context, callback);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function writeAudit(db: NodePgDatabase<any>, entry: AuditEntry): Promise<void> {
  try {
    const context = auditContext.getStore();
    const impersonation = entry.impersonation ?? context?.impersonation;
    const scope = impersonation?.storeId ?? entry.scope;
    // When a super admin acts within a store scope, auto-flag the row so that
    // support mutations are always distinguishable from store-owner actions.
    const isAdminSupportAction =
      entry.actorRole === "super_admin" && scope !== "platform";
    const metadata = isAdminSupportAction
      ? {
          ...entry.metadata,
          adminSupportAction: true,
          ...(impersonation ? {
            impersonation: {
              actorUserId: impersonation.actorUserId,
              storeId: impersonation.storeId,
              startedAt: impersonation.startedAt,
              expiresAt: impersonation.expiresAt,
            },
          } : {}),
        }
      : (entry.metadata ?? null);

    await db.insert(auditLogTable).values({
      actorUserId: entry.actorUserId,
      actorRole: entry.actorRole,
      scope,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata,
    });
  } catch (err) {
    // Audit failures must never break the main request path.
    logger.error({ err, entry }, "audit log write failed");
  }
}
