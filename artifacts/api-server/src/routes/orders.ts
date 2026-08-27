/**
 * Order routes — support reads and bounded receipt re-send.
 *
 * Order creation is intentionally absent: Stripe webhooks are the trusted,
 * idempotent commerce writer. A browser must never author prices, delivery
 * links, or a merchant-sender email.
 */
import { timingSafeEqual } from "node:crypto";
import { Router, urlencoded, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { ordersTable, plannerConfigsTable, storesTable } from "@workspace/db";
import { and, desc, eq, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  resolveStoreActor,
  resolveStoreActorOptionalWithStoreHeader,
  requireStoreAccess,
  requireSuperAdmin,
} from "../middleware/requireRole";
import { sendOrderReceipt } from "../lib/email/senders";
import { logger } from "../lib/logger";
import { createSignedDownloadLinks, recoveryUrl, verifySignedDownload } from "../lib/order-delivery";
import { getValidGoogleToken, GoogleAuthError } from "../lib/google-auth";
import { Transform } from "node:stream";

const router: IRouter = Router();
// The recovery page is a regular browser form while programmatic callers use
// JSON; parse the former locally without changing the API's global body policy.
router.use(urlencoded({ extended: false }));
const RESEND_TOKEN_LIFETIME_MS = 48 * 60 * 60 * 1000;
const RESEND_WINDOW_MS = 60 * 60 * 1000;
const RESEND_RETRY_BACKOFF_MS = 60 * 1000;
const MAX_RESENDS_PER_HOUR = 10;
const MAX_RESENDS_PER_ORDER = 50;
const RECOVERY_WINDOW_MS = 60 * 60 * 1000;
const MAX_RECOVERY_REQUESTS_PER_WINDOW = 5;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const recoveryAttempts = new Map<string, { startedAt: number; count: number }>();

export function plannerDriveCredentialOwner(config: Pick<typeof plannerConfigsTable.$inferSelect, "userId">): string {
  return config.userId;
}

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
  items: Array<{ itemType?: string; itemId?: string; name: string; priceCents: number; quantity?: number }>;
  totalCents: number;
  currency: string;
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
    // Never reuse a URL persisted by a legacy row. Delivery links are fresh,
    // order-scoped, and short lived for every receipt attempt.
    downloadLinks: createSignedDownloadLinks(order.id, order.items),
    resendToken: order.resendToken ?? undefined,
    attempt: order.resendCount + 1,
  };
}

function recoveryRateLimitKey(req: Request, email: string): string {
  return `${req.ip || req.socket.remoteAddress || "unknown"}:${email.toLowerCase()}`;
}

function allowRecoveryRequest(req: Request, email: string): boolean {
  const key = recoveryRateLimitKey(req, email);
  const now = Date.now();
  const previous = recoveryAttempts.get(key);
  if (!previous || now - previous.startedAt >= RECOVERY_WINDOW_MS) {
    recoveryAttempts.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (previous.count >= MAX_RECOVERY_REQUESTS_PER_WINDOW) return false;
  previous.count += 1;
  return true;
}

async function deliverReceipt(order: typeof ordersTable.$inferSelect, now = new Date()): Promise<boolean> {
  try {
    await sendOrderReceipt(receiptPayload(order));
    await db.update(ordersTable).set({
      receiptSentAt: now,
      receiptLastError: null,
      // Only successful delivery consumes the lifetime allowance.
      resendCount: sql`${ordersTable.resendCount} + 1`,
    }).where(eq(ordersTable.id, order.id));
    return true;
  } catch (err) {
    await recordReceiptFailure(order.id, err);
    logger.warn({ err, orderId: order.id }, "Order receipt delivery failed");
    return false;
  }
}

function recoveryFormHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Request fresh download links</title></head>
<body><main><h1>Request fresh download links</h1>
<p>Enter the email address used at checkout. If eligible purchases exist, we’ll send new links shortly.</p>
<form method="post" action="/api/orders/recovery"><label>Email <input type="email" name="email" required autocomplete="email"></label>
<button type="submit">Email my links</button></form></main></body></html>`;
}

// This public route must precede `/orders/:id`, otherwise Express treats
// "recovery" as an order ID and the protected support-detail route returns 401.
router.get("/orders/recovery", (_req: Request, res: Response): void => {
  res.type("html").send(recoveryFormHtml());
});

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

// ── GET /orders/:id — support/store operator order detail ─────────────────────
router.get(
  "/orders/:id",
  requireStoreAccess("store_staff"),
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
      const actor = req.actor!;
      if (actor.impersonation && actor.impersonation.storeId !== order.storeId) {
        res.status(403).json({ error: "Forbidden: order is outside the impersonated store" });
        return;
      }
      const isStoreOperator = actor.storeRole === "store_owner" || actor.storeRole === "store_staff";
      if (!actor.isSuperAdmin && (actor.storeId !== order.storeId || !isStoreOperator)) {
        res.status(403).json({ error: "Forbidden: store operator access required" });
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
  resolveStoreActorOptionalWithStoreHeader,
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
      if (actor?.impersonation && actor.impersonation.storeId !== order.storeId) {
        res.status(403).json({ error: "Forbidden: order is outside the impersonated store" });
        return;
      }
      const actorCanResend = Boolean(
        actor
        && (
          actor.userId === order.buyerUserId
          || actor.isSuperAdmin
          || (
            actor.storeId === order.storeId
            && (actor.storeRole === "store_owner" || actor.storeRole === "store_staff")
          )
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

      if (!await deliverReceipt(order, now)) {
        res.status(502).json({ error: "Receipt delivery failed; please retry shortly" });
        return;
      }

      try {
        const [persisted] = await db.select({ id: ordersTable.id })
          .from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
        if (!persisted) throw new Error("Order disappeared after receipt send");
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

// ── POST /orders/recovery ────────────────────────────────────────────────────
// Email-only lost-receipt recovery. The response intentionally does not reveal
// whether the address has any orders; only an inbox owner can observe delivery.
router.post("/orders/recovery", async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const genericResponse = () => res.status(202).json({
    ok: true,
    message: "If an eligible purchase exists, we will send a fresh download link shortly.",
  });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    genericResponse();
    return;
  }
  if (!allowRecoveryRequest(req, email)) {
    genericResponse();
    return;
  }

  try {
    const orders = await db.select().from(ordersTable)
      .where(sql`lower(${ordersTable.buyerEmail}) = ${email}`)
      .orderBy(desc(ordersTable.createdAt))
      .limit(MAX_RESENDS_PER_ORDER);
    const now = new Date();
    for (const order of orders) {
      if (order.resendCount >= MAX_RESENDS_PER_ORDER) continue;
      const activeWindow = order.resendWindowStartedAt
        && now.getTime() - order.resendWindowStartedAt.getTime() < RESEND_WINDOW_MS;
      const hourlyCount = activeWindow ? order.resendWindowCount : 0;
      if (hourlyCount >= MAX_RESENDS_PER_HOUR) continue;

      const [reserved] = await db.update(ordersTable).set({
        receiptAttempts: sql`${ordersTable.receiptAttempts} + 1`,
        receiptLastAttemptAt: now,
        receiptLastError: null,
        resendWindowStartedAt: activeWindow ? order.resendWindowStartedAt : now,
        resendWindowCount: hourlyCount + 1,
      }).where(and(
        eq(ordersTable.id, order.id),
        lt(ordersTable.resendCount, MAX_RESENDS_PER_ORDER),
        eq(ordersTable.resendWindowCount, order.resendWindowCount),
      )).returning({ id: ordersTable.id });
      if (reserved) await deliverReceipt(order, now);
    }
  } catch (err) {
    // The request stays private even if a database or provider problem occurs.
    logger.error({ err }, "Lost-receipt recovery could not complete");
  }
  genericResponse();
});

// ── GET /orders/:id/downloads/:itemIndex ─────────────────────────────────────
// The URL itself is a short-lived, order-scoped capability. It is not stored on
// the order and cannot be reused after expiry.
router.get(
  "/orders/:id/downloads/:itemIndex",
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const itemIndex = Number(req.params.itemIndex);
    if (!Number.isInteger(itemIndex) || itemIndex < 0) {
      res.status(400).json({ error: "Invalid download item" });
      return;
    }
    const valid = verifySignedDownload(id, itemIndex, req.query.expires, req.query.signature);
    if (!valid) {
      res.status(410).json({
        error: "This download link has expired or is invalid",
        recovery: "Request a new receipt using POST /api/orders/recovery with your purchase email.",
      });
      return;
    }
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, id)).limit(1);
    if (!order || !order.items[itemIndex]) {
      res.status(404).json({ error: "Download not found" });
      return;
    }
    const item = order.items[itemIndex];
    if (item.itemType !== "edition" || !item.itemId) {
      res.status(409).json({
        error: "This catalog item does not have a downloadable file yet",
        recovery: recoveryUrl(order.id),
      });
      return;
    }

    const configs = await db.select().from(plannerConfigsTable)
      .where(and(
        eq(plannerConfigsTable.storeId, order.storeId),
        eq(plannerConfigsTable.editionId, item.itemId),
      ))
      .orderBy(desc(plannerConfigsTable.generatedAt));
    const config = configs.find((candidate) => {
      const drive = candidate.drive as { pdfFileId?: string | null };
      return Boolean(drive?.pdfFileId && !drive.pdfFileId.startsWith("pdf-"));
    });
    const pdfFileId = (config?.drive as { pdfFileId?: string | null } | undefined)?.pdfFileId;
    if (!config || !pdfFileId) {
      res.status(409).json({
        error: "Your file is still being prepared",
        recovery: recoveryUrl(order.id),
      });
      return;
    }

    try {
      // The selected planner belongs to the staff member who generated it.
      // Their Drive credential owns the file; a store owner cannot generally
      // fetch a staff-created file with their own token.
      const token = await getValidGoogleToken(plannerDriveCredentialOwner(config));
      const driveResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(pdfFileId)}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) },
      );
      if (!driveResponse.ok || !driveResponse.body) {
        res.status(502).json({ error: "Could not retrieve the purchased file", recovery: recoveryUrl(order.id) });
        return;
      }
      const contentType = driveResponse.headers.get("content-type") ?? "";
      const contentLength = Number(driveResponse.headers.get("content-length") ?? 0);
      if (!contentType.includes("pdf") || (Number.isFinite(contentLength) && contentLength > MAX_DOWNLOAD_BYTES)) {
        res.status(502).json({ error: "The purchased file is unavailable", recovery: recoveryUrl(order.id) });
        return;
      }
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${item.name.replace(/[^a-z0-9._ -]/gi, "_")}.pdf"`);
      res.setHeader("Cache-Control", "private, no-store");
      const { Readable } = await import("node:stream");
      let sentBytes = 0;
      const sizeGuard = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          sentBytes += chunk.length;
          if (sentBytes > MAX_DOWNLOAD_BYTES) {
            callback(new Error("Purchased file exceeds the delivery size limit"));
            return;
          }
          callback(null, chunk);
        },
      });
      sizeGuard.once("error", (err) => {
        logger.warn({ err, orderId: id }, "Order download exceeded size guard");
        if (!res.headersSent) res.status(502).json({ error: "The purchased file is unavailable" });
        else res.destroy(err);
      });
      Readable.fromWeb(driveResponse.body as ReadableStream<Uint8Array>).pipe(sizeGuard).pipe(res);
    } catch (err) {
      const error = err instanceof GoogleAuthError
        ? "The seller's file connection is unavailable"
        : "Could not retrieve the purchased file";
      logger.warn({ err, orderId: id }, "Order download failed");
      res.status(502).json({ error, recovery: recoveryUrl(order.id) });
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
    const isStoreOperator = actor.storeRole === "store_owner" || actor.storeRole === "store_staff";
    if (!actor.isSuperAdmin && (actor.storeId !== storeId || !isStoreOperator)) {
      res.status(403).json({ error: "Forbidden: store operator access required" });
      return;
    }
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
