/**
 * Webhook endpoints:
 *   POST /webhooks/resend         — Resend delivery events (bounce / complaint / delivered)
 *   POST /webhooks/inbound-email  — Inbound reply handler (auto-response trigger)
 *
 * NOTE: These routes must be mounted BEFORE the express.json() body parser
 * so that /webhooks/resend receives the raw body for signature verification.
 * Mount them directly in server.ts / app.ts with express.raw().
 *
 * Inbound email notes
 * ───────────────────
 * Resend is outbound-only. To receive replies at no-reply@your-domain you need
 * MX records pointing to an inbound email routing service (e.g. Cloudflare Email
 * Routing, Postmark Inbound, or SendGrid Inbound Parse) that forwards a webhook
 * to POST /api/webhooks/inbound-email. The auto-response machinery here is
 * complete; only the inbound forwarder is external infrastructure.
 */
import { Router, raw } from "express";
import { Webhook } from "svix";
import { db } from "@workspace/db";
import { emailLogTable, storeEmailConfigTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { sendAutoResponse } from "../lib/email/senders";
import { APP_URL } from "../lib/email/templates/layout";

const router = Router();

// ── POST /webhooks/resend ─────────────────────────────────────────────────────
// Must receive raw body — mount with express.raw({ type: "application/json" }).
router.post(
  "/webhooks/resend",
  raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) {
      // No secret configured — accept without verification (dev only)
      console.warn("[webhook] RESEND_WEBHOOK_SECRET not set; skipping verification");
    } else {
      try {
        const wh = new Webhook(secret);
        wh.verify(req.body as Buffer, {
          "svix-id":        req.headers["svix-id"] as string,
          "svix-timestamp": req.headers["svix-timestamp"] as string,
          "svix-signature": req.headers["svix-signature"] as string,
        });
      } catch (err) {
        console.warn("[webhook/resend] signature verification failed:", err);
        return res.status(400).json({ error: "Invalid signature" });
      }
    }

    let event: ResendWebhookEvent;
    try {
      event = JSON.parse(req.body.toString()) as ResendWebhookEvent;
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    const { type, data } = event;
    const messageId: string = data?.email_id ?? "";

    if (!messageId) return res.status(200).json({ ok: true });

    // Find the log row
    const [row] = await db
      .select({ id: emailLogTable.id, storeId: emailLogTable.storeId, status: emailLogTable.status })
      .from(emailLogTable)
      .where(eq(emailLogTable.providerMessageId, messageId))
      .limit(1);

    const newStatus =
      type === "email.delivered"  ? "delivered"  :
      type === "email.bounced"    ? "bounced"    :
      type === "email.complained" ? "complained" :
      null;

    if (row && newStatus) {
      await db
        .update(emailLogTable)
        .set({ status: newStatus, statusUpdatedAt: new Date() })
        .where(eq(emailLogTable.id, row.id));
    }

    // Reputation tracking
    if (row?.storeId) {
      if (type === "email.bounced") {
        await db
          .insert(storeEmailConfigTable)
          .values({ storeId: row.storeId, bounceCount: 1, tier1Suspended: false, domainStatus: "not_started" })
          .onConflictDoUpdate({
            target: storeEmailConfigTable.storeId,
            set: { bounceCount: sql`${storeEmailConfigTable.bounceCount} + 1` },
          });

        await maybeAutoSuspend(row.storeId, "bounce");
      }

      if (type === "email.complained") {
        await db
          .insert(storeEmailConfigTable)
          .values({ storeId: row.storeId, complaintCount: 1, tier1Suspended: false, domainStatus: "not_started" })
          .onConflictDoUpdate({
            target: storeEmailConfigTable.storeId,
            set: { complaintCount: sql`${storeEmailConfigTable.complaintCount} + 1` },
          });

        await maybeAutoSuspend(row.storeId, "complaint");
      }

      if (type === "email.delivered" || type === "email.sent") {
        await db
          .insert(storeEmailConfigTable)
          .values({ storeId: row.storeId, monthlyVolume: 1, tier1Suspended: false, domainStatus: "not_started" })
          .onConflictDoUpdate({
            target: storeEmailConfigTable.storeId,
            set: { monthlyVolume: sql`${storeEmailConfigTable.monthlyVolume} + 1` },
          });
      }
    }

    return res.status(200).json({ ok: true });
  },
);

// ── POST /webhooks/inbound-email ──────────────────────────────────────────────
// Receives forwarded inbound messages from your MX inbound routing provider.
// Sends one auto-response per (ticket thread, sender) per 24 h, then discards.
router.post("/webhooks/inbound-email", async (req, res): Promise<void> => {
  const body = req.body as InboundEmailPayload;

  // Guard against mail loops: skip if this is itself an auto-response
  const autoSubmitted = (body.headers?.["Auto-Submitted"] ?? "").toLowerCase();
  const precedence    = (body.headers?.["Precedence"] ?? "").toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") { res.status(200).json({ ok: true }); return; }
  if (precedence === "bulk" || precedence === "list") { res.status(200).json({ ok: true }); return; }

  const { fromEmail, ticketId, storeName } = body;
  if (!fromEmail || !ticketId) { res.status(400).json({ error: "fromEmail and ticketId required" }); return; }

  const ticketUrl = `${APP_URL}/s/${encodeURIComponent(storeName ?? "")}/support`;

  await sendAutoResponse({
    threadRef:   ticketId,
    senderEmail: fromEmail,
    storeName:   storeName ?? "the store",
    ticketUrl,
  }).catch(e => console.error("[webhook/inbound] auto-response failed:", e));

  res.status(200).json({ ok: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const BOUNCE_SUSPEND_THRESHOLD    = 0.10; // 10% bounce rate
const COMPLAINT_SUSPEND_THRESHOLD = 0.005; // 0.5% complaint rate

async function maybeAutoSuspend(
  storeId: string,
  trigger: "bounce" | "complaint",
): Promise<void> {
  const [cfg] = await db
    .select({
      monthlyVolume: storeEmailConfigTable.monthlyVolume,
      bounceCount:   storeEmailConfigTable.bounceCount,
      complaintCount:storeEmailConfigTable.complaintCount,
      tier1Suspended:storeEmailConfigTable.tier1Suspended,
    })
    .from(storeEmailConfigTable)
    .where(eq(storeEmailConfigTable.storeId, storeId))
    .limit(1);

  if (!cfg || cfg.tier1Suspended || cfg.monthlyVolume < 10) return;

  const bounceRate    = cfg.bounceCount    / cfg.monthlyVolume;
  const complaintRate = cfg.complaintCount / cfg.monthlyVolume;

  let reason: string | null = null;
  if (bounceRate    >= BOUNCE_SUSPEND_THRESHOLD)    reason = `Bounce rate ${(bounceRate * 100).toFixed(1)}% exceeded 10%`;
  if (complaintRate >= COMPLAINT_SUSPEND_THRESHOLD) reason = `Complaint rate ${(complaintRate * 100).toFixed(2)}% exceeded 0.5%`;

  if (reason) {
    console.warn(`[email:reputation] auto-suspending store ${storeId}: ${reason}`);
    await db
      .update(storeEmailConfigTable)
      .set({ tier1Suspended: true, suspendedReason: reason, updatedAt: new Date() })
      .where(eq(storeEmailConfigTable.storeId, storeId));
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ResendWebhookEvent {
  type: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    subject?: string;
    [key: string]: unknown;
  };
}

interface InboundEmailPayload {
  fromEmail?: string;
  ticketId?: string;
  storeName?: string;
  headers?: Record<string, string>;
}

export default router;
