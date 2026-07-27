/**
 * Periodic domain re-verification.
 * Runs every 4 hours; checks any store whose domain is in "pending" or "verified"
 * state and whose last check was more than 4 hours ago. Updates the DB with the
 * fresh Resend status and flags any newly-broken domains.
 *
 * Called fire-and-forget from index.ts after server start.
 */
import { db } from "@workspace/db";
import { storeEmailConfigTable } from "@workspace/db";
import { eq, or, lt, isNotNull, and } from "drizzle-orm";
import { getDomainStatus } from "./domain-verify";
import { logger } from "../logger";

const INTERVAL_MS  = 4 * 60 * 60 * 1000; // 4 hours
const STALE_AFTER  = 4 * 60 * 60 * 1000; // re-check if last check > 4 h ago

export function schedulePeriodicDomainVerify(): void {
  // Run once at startup (offset 2 min to avoid boot noise), then every 4 h
  setTimeout(() => {
    runDomainRecheck().catch((e) =>
      logger.error({ err: e }, "[domain-recheck] startup pass failed"),
    );
  }, 2 * 60 * 1000);

  setInterval(() => {
    runDomainRecheck().catch((e) =>
      logger.error({ err: e }, "[domain-recheck] interval pass failed"),
    );
  }, INTERVAL_MS);
}

async function runDomainRecheck(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER);

  // Find stores with an active domain that haven't been checked recently
  const rows = await db
    .select({
      storeId:       storeEmailConfigTable.storeId,
      resendDomainId: storeEmailConfigTable.resendDomainId,
      domainStatus:  storeEmailConfigTable.domainStatus,
    })
    .from(storeEmailConfigTable)
    .where(
      and(
        isNotNull(storeEmailConfigTable.resendDomainId),
        or(
          eq(storeEmailConfigTable.domainStatus, "pending"),
          eq(storeEmailConfigTable.domainStatus, "verified"),
        ),
        or(
          lt(storeEmailConfigTable.lastVerifyCheckAt, cutoff),
          isNotNull(storeEmailConfigTable.resendDomainId), // always check if lastVerifyCheckAt is null
        ),
      ),
    )
    .limit(50); // cap per pass to avoid thundering herd

  if (rows.length === 0) return;
  logger.info({ count: rows.length }, "[domain-recheck] checking domains");

  for (const row of rows) {
    if (!row.resendDomainId) continue;
    try {
      const info = await getDomainStatus(row.resendDomainId);

      // Mark DKIM/SPF verified if the domain is now in verified status
      const nowVerified = info.status === "verified" ? new Date() : undefined;
      await db
        .update(storeEmailConfigTable)
        .set({
          domainStatus:      info.status,
          ...(nowVerified && row.domainStatus !== "verified"
            ? { dkimVerifiedAt: nowVerified, spfVerifiedAt: nowVerified }
            : {}),
          lastVerifyCheckAt: new Date(),
          lastVerifyError:   null,
        })
        .where(eq(storeEmailConfigTable.storeId, row.storeId));

      if (row.domainStatus === "verified" && info.status !== "verified") {
        logger.warn({ storeId: row.storeId, newStatus: info.status },
          "[domain-recheck] previously-verified domain is no longer verified");
      }
    } catch (err) {
      logger.error({ storeId: row.storeId, err }, "[domain-recheck] check failed for store");
      await db
        .update(storeEmailConfigTable)
        .set({ lastVerifyCheckAt: new Date(), lastVerifyError: String(err) })
        .where(eq(storeEmailConfigTable.storeId, row.storeId));
    }
  }
}
