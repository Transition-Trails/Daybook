/**
 * Event-specific email sender functions.
 * Called fire-and-forget from route handlers; errors are logged, not rethrown.
 * Keeps route code clean — no template logic lives there.
 */
import { db } from "@workspace/db";
import { ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "./send";
import {
  getEmailForUser,
  getStoreName,
  getStoreOwnerEmail,
} from "./identity";
import {
  ticketReceived,
  ticketReply,
  ticketClosed,
  newTicketStore,
  newTicketPlatform,
  buyerReopened,
} from "./templates/support";
import { orderReceipt } from "./templates/order";
import { autoResponse } from "./templates/auto-response";
import { APP_URL } from "./templates/layout";
import { emailAutoResponseDedupeTable } from "@workspace/db";
import { and, gt } from "drizzle-orm";

const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "";

// ── Support events ────────────────────────────────────────────────────────────

/** Called immediately after POST /support/tickets succeeds. */
export function onTicketCreated(ticket: {
  id: string;
  reporterUserId: string;
  storeId: string | null;
  recipientScope: string;
  area: string;
}): void {
  void (async () => {
    const isOwnerTier = ticket.recipientScope === "platform";

    const [reporterEmail, storeName] = await Promise.all([
      getEmailForUser(ticket.reporterUserId),
      ticket.storeId ? getStoreName(ticket.storeId) : Promise.resolve("the platform"),
    ]);

    // Acknowledge to reporter
    if (reporterEmail) {
      const tmpl = ticketReceived({
        ticketId: ticket.id,
        storeName,
        area: ticket.area,
        tier: isOwnerTier ? "owner" : "buyer",
      });
      await sendEmail({
        idempotencyKey: `ticket-received:${ticket.id}`,
        storeId: ticket.storeId,
        storeName,
        to: reporterEmail,
        template: "ticket_received",
        ...tmpl,
      }).catch(e => console.error("[email] ticket_received:", e));
    }

    // Notify recipient scope
    if (isOwnerTier) {
      if (PLATFORM_ADMIN_EMAIL) {
        const tmpl = newTicketPlatform({ ticketId: ticket.id, storeName, area: ticket.area });
        await sendEmail({
          idempotencyKey: `new-ticket-platform:${ticket.id}`,
          storeId: null,
          to: PLATFORM_ADMIN_EMAIL,
          template: "new_ticket_platform",
          ...tmpl,
        }).catch(e => console.error("[email] new_ticket_platform:", e));
      }
    } else if (ticket.storeId) {
      const ownerEmail = await getStoreOwnerEmail(ticket.storeId);
      if (ownerEmail) {
        const tmpl = newTicketStore({
          ticketId: ticket.id,
          storeName,
          storeId: ticket.storeId,
          area: ticket.area,
        });
        await sendEmail({
          idempotencyKey: `new-ticket-store:${ticket.id}`,
          storeId: ticket.storeId,
          storeName,
          to: ownerEmail,
          template: "new_ticket_store",
          ...tmpl,
        }).catch(e => console.error("[email] new_ticket_store:", e));
      }
    }
  })();
}

/** Called immediately after POST /support/tickets/:id/replies succeeds. */
export function onTicketReplied(opts: {
  ticketId: string;
  authorUserId: string;
  authorRole: string;
  ticket: {
    reporterUserId: string;
    storeId: string | null;
    recipientScope: string;
    area: string;
  };
}): void {
  void (async () => {
    const { ticketId, authorRole, ticket } = opts;
    const isScopeAdmin =
      authorRole === "super_admin" ||
      ["store_owner", "store_staff"].includes(authorRole);

    const [storeName, reporterEmail] = await Promise.all([
      ticket.storeId ? getStoreName(ticket.storeId) : Promise.resolve("the platform"),
      getEmailForUser(ticket.reporterUserId),
    ]);

    if (isScopeAdmin) {
      // Admin replied → notify buyer/reporter
      if (reporterEmail) {
        const tmpl = ticketReply({ ticketId, storeName, area: ticket.area });
        await sendEmail({
          idempotencyKey: `ticket-reply:${ticketId}:${opts.authorUserId}`,
          storeId: ticket.storeId,
          storeName,
          to: reporterEmail,
          template: "ticket_reply",
          ...tmpl,
        }).catch(e => console.error("[email] ticket_reply:", e));
      }
    } else {
      // Reporter replied → notify scope handler (buyer reopened)
      const isOwnerTier = ticket.recipientScope === "platform";
      const notifyEmail = isOwnerTier
        ? PLATFORM_ADMIN_EMAIL
        : await getStoreOwnerEmail(ticket.storeId ?? "");

      if (notifyEmail) {
        const tmpl = buyerReopened({
          ticketId,
          storeName,
          storeId: ticket.storeId ?? "",
          area: ticket.area,
          isOwnerTier,
        });
        await sendEmail({
          idempotencyKey: `buyer-reopened:${ticketId}:${opts.authorUserId}`,
          storeId: isOwnerTier ? null : ticket.storeId,
          storeName,
          to: notifyEmail,
          template: "buyer_reopened",
          ...tmpl,
        }).catch(e => console.error("[email] buyer_reopened:", e));
      }
    }
  })();
}

/** Called when PATCH /support/tickets/:id/status sets status to "closed". */
export function onTicketClosed(opts: {
  ticketId: string;
  ticket: {
    reporterUserId: string;
    storeId: string | null;
    area: string;
  };
  reason?: string;
}): void {
  void (async () => {
    const { ticketId, ticket, reason } = opts;
    const [reporterEmail, storeName] = await Promise.all([
      getEmailForUser(ticket.reporterUserId),
      ticket.storeId ? getStoreName(ticket.storeId) : Promise.resolve("the platform"),
    ]);

    if (reporterEmail) {
      const tmpl = ticketClosed({ ticketId, storeName, area: ticket.area, reason });
      await sendEmail({
        idempotencyKey: `ticket-closed:${ticketId}`,
        storeId: ticket.storeId,
        storeName,
        to: reporterEmail,
        template: "ticket_closed",
        ...tmpl,
      }).catch(e => console.error("[email] ticket_closed:", e));
    }
  })();
}

// ── Order events ──────────────────────────────────────────────────────────────

export async function sendOrderReceipt(opts: {
  orderId: string;
  storeId: string;
  buyerEmail: string;
  buyerName?: string;
  items: Array<{ name: string; priceCents: number; itemType?: string; itemId?: string; quantity?: number }>;
  totalCents: number;
  currency: string;
  downloadLinks: Array<{ name: string; url: string }>;
  resendToken?: string;
  attempt?: number;
}): Promise<void> {
  const storeName = await getStoreName(opts.storeId) ?? "Daybook";
  const APP_URL      = process.env["APP_URL"] ?? "https://app.daybook.com";
  const recoveryUrl  = `${APP_URL.replace(/\/+$/, "")}/api/orders/recovery`;

  const tmpl = orderReceipt({ storeName, downloads: opts.downloadLinks, recoveryUrl });
  await sendEmail({
    idempotencyKey: `order-receipt:${opts.orderId}:${opts.attempt ?? 0}`,
    storeId:   opts.storeId,
    storeName,
    to:        opts.buyerEmail,
    template:  "order_receipt",
    ...tmpl,
  });
}

// ── Inbound reply auto-response ───────────────────────────────────────────────

/**
 * Send a single auto-response to a sender who replied to a no-reply address.
 * Respects 24-hour dedup: if we already sent one to this (thread, sender) in the
 * last 24 hours we skip silently.
 *
 * The caller must have already checked that the inbound message is NOT itself
 * an auto-response (Auto-Submitted / Precedence headers).
 */
export async function sendAutoResponse(opts: {
  threadRef: string;   // ticket id
  senderEmail: string;
  storeName: string;
  ticketUrl: string;
}): Promise<void> {
  const { threadRef, senderEmail, storeName, ticketUrl } = opts;

  // 24-hour dedup check
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: emailAutoResponseDedupeTable.id })
    .from(emailAutoResponseDedupeTable)
    .where(
      and(
        eq(emailAutoResponseDedupeTable.threadRef, threadRef),
        eq(emailAutoResponseDedupeTable.senderEmail, senderEmail),
        gt(emailAutoResponseDedupeTable.sentAt, cutoff),
      ),
    )
    .limit(1);

  if (recent) return; // already sent within 24 h

  // Record dedup entry first (before sending, to prevent races)
  await db
    .insert(emailAutoResponseDedupeTable)
    .values({ threadRef, senderEmail })
    .catch(() => {}); // non-fatal

  const ticketRef = threadRef.replace(/-/g, "").slice(0, 8).toUpperCase();
  const tmpl = autoResponse({ storeName, ticketRef, ticketUrl });

  await sendEmail({
    idempotencyKey: `auto-response:${threadRef}:${senderEmail}:${new Date().toISOString().slice(0, 10)}`,
    storeId: null,
    to: senderEmail,
    template: "auto_response",
    headers: {
      "Auto-Submitted": "auto-replied",
      "Precedence": "bulk",
    },
    ...tmpl,
  });
}
