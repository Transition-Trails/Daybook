/**
 * Order routes — support reads and bounded receipt re-send.
 *
 * Order creation is intentionally absent: Stripe webhooks are the trusted,
 * idempotent commerce writer. A browser must never author prices, delivery
 * links, or a merchant-sender email.
 */
import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { ordersTable, storesTable } from "@workspace/db";
import { and, desc, eq, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { resolveStoreActor, resolveStoreActorOptional, requireSuperAdmin } from "../middleware/requireRole";
import { assertStoreScope } from "../lib/auth-middleware";
import { sendOrderReceipt } from "../lib/email/senders";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const RESEND_TOKEN_LIFETIME_MS = 48 * 60 * 60 * 1000;
const RESEND_WINDOW_MS = 60 * 60 * 1000;
const RESEND_RETRY_BACKOFF_MS = 60 * 1000;
const MAX_RESENDS_PER_HOUR = 10;
const MAX_RESENDS_PER_ORDER = 50;

// This is deliberately explicit: resendToken is an email-only capability and
// must never be exposed to support or store staff JSON responses.
const orderResponseFields = {
  id: ordersTable.id,
  storeId: ordersTable.storeId,
  buyerUserId: ordersTable.buyerUserId,
  buyerEmail: ordersTable.buyerEmail,
  buyerName: ordersTable.buyerName,
  items: ordersTable.items,
  totalCents: ordersTable.totalCents,
  currency: ordersTable.currency,
  downloadLinks: ordersTable.downloadLinks,
  resendTokenExpiresAt: ordersTable.resendTokenExpiresAt,
  resendCount: ordersTable.resendCount,
  receiptSentAt: ordersTable.receiptSentAt,
  receiptAttempts: ordersTable.receiptAttempts,
  receiptLastError: ordersTable.receiptLastError,
  receiptLastAttemptAt: ordersTable.receiptLastAttemptAt,
  createdAt: ordersTable.createdAt,
};

function tokenMatches(expected: string | null, supplied: unknown): boolean {
  if (!expected || typeof supplied !== "string") return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

function receiptPayload(order: {
  id: string;
  storeId: string;
  buyerEmail: string;
  buyerName: string | null;
  items: Array<{ name: string; priceCents: number; downloadUrl?: string }>;
  totalCents: number;
  currency: string;
  downloadLinks: Array<{ name: string; url: string }>;
  resendToken: string | null;
  resendCount: number;
}) {
  return {
    orderId: order.id,
    storeId: order.storeId,
    buyerEmail: order.buyerEmail,
    buyerName: order.buyerName ?? undefined,
    items: order.items,
    totalCents: order.totalCents,
    currency: order.currency,
    downloadLinks: order.downloadLinks,
    resendToken: order.resendToken ?? undefined,
    attempt: order.resendCount + 1,
  };
}

async function recordReceiptFailure(orderId: string, err: unknown): Promise<void> {
  try {
    await db
      .update(ordersTable)
      .set({ receiptLastError: err instanceof Error ? err.message : String(err) })
      .where(eq(ordersTable.id, orderId));
  } catch (updateErr) {
    logger.error(
      { err: updateErr, orderId, receiptError: err instanceof Error ? err.message : String(err) },
      "Could not persist order receipt failure",
    );
  }
}

// ── GET /orders/:id — support order detail ───────────────────────────────────
router.get(
  "/orders/:id",
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    try {
      const [order] = await db
        .select(orderResponseFields)
        .from(ordersTable)
        .where(eq(ordersTable.id, id))
        .limit(1);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      res.json({ order });
    } catch (err) {
      logger.error({ err, orderId: id }, "Could not load order detail");
      res.status(500).json({ error: "Could not load order" });
    }
  },
);

// ── POST /orders/:id/resend-receipt ──────────────────────────────────────────
// Auth: buyer/store staff/super admin OR an expiring capability token from the
// buyer's original receipt email.
router.post(
  "/orders/:id/resend-receipt",
  resolveStoreActorOptional,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const { token } = req.query as { token?: string };
    const now = new Date();

    try {
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, id))
        .limit(1);
      if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      const tokenExpired = !order.resendTokenExpiresAt
        || order.resendTokenExpiresAt.getTime() <= now.getTime();
      const validToken = !tokenExpired && tokenMatches(order.resendToken, token);
      const actor = req.actor;
      const actorCanResend = Boolean(
        actor
        && (
          actor.userId === order.buyerUserId
          || actor.isSuperAdmin
          || (actor.storeId === order.storeId && actor.storeRole)
        ),
      );
      if (!validToken && !actorCanResend) {
        res.status(403).json({ error: tokenExpired && token ? "Receipt link has expired" : "Forbidden" });
        return;
      }

      const activeWindow = order.resendWindowStartedAt
        && now.getTime() - order.resendWindowStartedAt.getTime() < RESEND_WINDOW_MS;
      const hourlyCount = activeWindow ? order.resendWindowCount : 0;
      if (hourlyCount >= MAX_RESENDS_PER_HOUR) {
        res.setHeader("Retry-After", Math.ceil(RESEND_WINDOW_MS / 1000).toString());
        res.status(429).json({ error: "Too many receipt resend requests for this order" });
        return;
      }
      if (order.resendCount >= MAX_RESENDS_PER_ORDER) {
        res.status(403).json({ error: "Receipt resend limit has been reached" });
        return;
      }
      if (
        order.receiptLastError
        && order.receiptLastAttemptAt
        && now.getTime() - order.receiptLastAttemptAt.getTime() < RESEND_RETRY_BACKOFF_MS
      ) {
        res.setHeader("Retry-After", Math.ceil(RESEND_RETRY_BACKOFF_MS / 1000).toString());
        res.status(429).json({ error: "Please wait before retrying receipt delivery" });
        return;
      }

      // Reservation is conditional on the values we just read. A concurrent
      // caller changes the window marker/count first, causing this request to
      // fail closed instead of sending an eleventh email.
      const reservationWindowCondition = activeWindow
        ? and(
          eq(ordersTable.resendWindowStartedAt, order.resendWindowStartedAt!),
          eq(ordersTable.resendWindowCount, order.resendWindowCount),
        )
        : and(
          or(
            isNull(ordersTable.resendWindowStartedAt),
            lte(ordersTable.resendWindowStartedAt, new Date(now.getTime() - RESEND_WINDOW_MS)),
          ),
          eq(ordersTable.resendWindowCount, order.resendWindowCount),
        );
      const [reserved] = await db
        .update(ordersTable)
        .set({
          receiptAttempts: sql`${ordersTable.receiptAttempts} + 1`,
          receiptLastAttemptAt: now,
          receiptLastError: null,
          resendCount: sql`${ordersTable.resendCount} + 1`,
          resendWindowStartedAt: activeWindow ? order.resendWindowStartedAt : now,
          resendWindowCount: hourlyCount + 1,
        })
        .where(and(
          eq(ordersTable.id, id),
          lt(ordersTable.resendCount, MAX_RESENDS_PER_ORDER),
          reservationWindowCondition,
        ))
        .returning({ id: ordersTable.id });
      if (!reserved) {
        res.status(429).json({ error: "Another receipt resend request is already being processed" });
        return;
      }

      try {
        await sendOrderReceipt(receiptPayload(order));
      } catch (err) {
        await recordReceiptFailure(id, err);
        logger.warn({ err, orderId: id }, "Order receipt resend failed");
        res.status(502).json({ error: "Receipt delivery failed; please retry shortly" });
        return;
      }

      try {
        await db
          .update(ordersTable)
          .set({ receiptSentAt: now, receiptLastError: null })
          .where(eq(ordersTable.id, id));
      } catch (err) {
        logger.error({ err, orderId: id }, "Order receipt was sent but confirmation state was not recorded");
        res.status(500).json({ error: "Receipt was sent but delivery state could not be recorded" });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, orderId: id }, "Could not resend order receipt");
      res.status(500).json({ error: "Could not resend receipt" });
    }
  },
);

// ── GET /store/:storeId/orders ───────────────────────────────────────────────
router.get(
  "/store/:storeId/orders",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };
    const receiptStatus = req.query.receiptStatus;
    if (!assertStoreScope(actor, storeId, res)) return;
    if (receiptStatus && !["failed", "pending", "sent"].includes(String(receiptStatus))) {
      res.status(400).json({ error: "receiptStatus must be failed, pending, or sent" });
      return;
    }

    try {
      const [store] = await db
        .select({ id: storesTable.id })
        .from(storesTable)
        .where(eq(storesTable.id, storeId))
        .limit(1);
      if (!store) {
        res.status(404).json({ error: "Store not found" });
        return;
      }

      const baseCondition = eq(ordersTable.storeId, storeId);
      const where = receiptStatus === "failed"
        ? and(baseCondition, isNotNull(ordersTable.receiptLastError))
        : receiptStatus === "pending"
          ? and(baseCondition, isNull(ordersTable.receiptSentAt), isNull(ordersTable.receiptLastError))
          : receiptStatus === "sent"
            ? and(baseCondition, isNotNull(ordersTable.receiptSentAt))
            : baseCondition;
      const orders = await db
        .select(orderResponseFields)
        .from(ordersTable)
        .where(where)
        .orderBy(desc(ordersTable.createdAt))
        .limit(100);
      res.json({ orders });
    } catch (err) {
      logger.error({ err, storeId }, "Could not load store orders");
      res.status(500).json({ error: "Could not load store orders" });
    }
  },
);

export { RESEND_TOKEN_LIFETIME_MS, MAX_RESENDS_PER_HOUR };
export default router;