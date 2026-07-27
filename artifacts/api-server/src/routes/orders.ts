/**
 * Order routes — receipt sending and re-send.
 *
 * POST /orders          — record an order and fire the receipt email
 * POST /orders/:id/resend-receipt — re-send the receipt (auth or resend_token)
 * GET  /store/:storeId/orders    — store owner list
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { ordersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { resolveStoreActor, resolveStoreActorOptional } from "../middleware/requireRole";
import { sendOrderReceipt } from "../lib/email/senders";

const router: IRouter = Router();

// ── POST /orders ──────────────────────────────────────────────────────────────
router.post(
  "/orders",
  resolveStoreActorOptional,
  async (req: Request, res: Response): Promise<void> => {
    const {
      storeId,
      buyerEmail,
      buyerName,
      items = [],
      totalCents = 0,
      currency = "usd",
      downloadLinks = [],
    } = req.body as {
      storeId: string;
      buyerEmail: string;
      buyerName?: string;
      items?: Array<{ name: string; priceCents: number; downloadUrl?: string }>;
      totalCents?: number;
      currency?: string;
      downloadLinks?: Array<{ name: string; url: string }>;
    };

    if (!storeId || !buyerEmail) {
      res.status(400).json({ error: "storeId and buyerEmail are required" });
      return;
    }

    try {
      const actor = req.actor;
      const [order] = await db
        .insert(ordersTable)
        .values({
          storeId,
          buyerUserId: actor?.userId ?? null,
          buyerEmail,
          buyerName: buyerName ?? null,
          items,
          totalCents,
          currency,
          downloadLinks,
        })
        .returning();

      // Fire receipt email — fire-and-forget
      sendOrderReceipt({
        orderId:       order.id,
        storeId:       order.storeId,
        buyerEmail:    order.buyerEmail,
        buyerName:     order.buyerName ?? undefined,
        items:         order.items,
        totalCents:    order.totalCents,
        currency:      order.currency,
        downloadLinks: order.downloadLinks,
        resendToken:   order.resendToken ?? undefined,
      }).then(async () => {
        await db
          .update(ordersTable)
          .set({ receiptSentAt: new Date() })
          .where(eq(ordersTable.id, order.id));
      }).catch((err: unknown) => {
        console.error("[orders] receipt send failed", err);
      });

      res.status(201).json({ order });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── POST /orders/:id/resend-receipt ──────────────────────────────────────────
// Auth: either logged-in buyer who owns the order, or valid resend_token query param
router.post(
  "/orders/:id/resend-receipt",
  resolveStoreActorOptional,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const { token } = req.query as { token?: string };

    try {
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, id))
        .limit(1);

      if (!order) { res.status(404).json({ error: "Order not found" }); return; }

      const actor = req.actor;
      const canResend =
        (token && order.resendToken === token) ||
        (actor && (actor.userId === order.buyerUserId || actor.storeId === order.storeId || actor.isSuperAdmin));

      if (!canResend) { res.status(403).json({ error: "Forbidden" }); return; }

      await sendOrderReceipt({
        orderId:       order.id,
        storeId:       order.storeId,
        buyerEmail:    order.buyerEmail,
        buyerName:     order.buyerName ?? undefined,
        items:         order.items,
        totalCents:    order.totalCents,
        currency:      order.currency,
        downloadLinks: order.downloadLinks,
        resendToken:   order.resendToken ?? undefined,
      });

      await db.update(ordersTable).set({ receiptSentAt: new Date() }).where(eq(ordersTable.id, id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ── GET /store/:storeId/orders ────────────────────────────────────────────────
router.get(
  "/store/:storeId/orders",
  resolveStoreActor,
  async (req: Request, res: Response): Promise<void> => {
    const actor = req.actor!;
    const { storeId } = req.params as { storeId: string };

    if (!actor.isSuperAdmin && actor.storeId !== storeId) {
      res.status(403).json({ error: "Forbidden" }); return;
    }

    try {
      const orders = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.storeId, storeId))
        .orderBy(ordersTable.createdAt)
        .limit(100);
      res.json({ orders });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

export default router;
