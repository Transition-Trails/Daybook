import { db } from "@workspace/db";
import { emailLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAdapter } from "./index";
import { resolveEmailIdentity } from "./identity";
import { checkTier1RateLimit } from "./rate-limit";

export type EmailTemplate =
  | "ticket_received"
  | "ticket_reply"
  | "ticket_closed"
  | "buyer_reopened"
  | "new_ticket_store"
  | "new_ticket_platform"
  | "order_receipt"
  | "auto_response";

export interface SendEmailOpts {
  /** Caller-supplied idempotency key. A retry with the same key is a no-op if
   *  the previous attempt was not a hard failure. */
  idempotencyKey: string;
  storeId: string | null;
  storeName?: string;
  to: string;
  template: EmailTemplate;
  subject: string;
  html: string;
  text: string;
  /** Extra RFC 2822 headers (e.g. Auto-Submitted for auto-responses). */
  headers?: Record<string, string>;
}

/**
 * Send one transactional email.
 * - Idempotent: a second call with the same key is a no-op unless the first failed.
 * - Writes an email_log row before and after sending.
 * - Rate-limits tier-1 sends per store; throws RateLimitError if exceeded.
 * - Never logs full email bodies.
 */
export async function sendEmail(opts: SendEmailOpts): Promise<void> {
  const { idempotencyKey, storeId, storeName, to, template, subject, html, text, headers } = opts;

  // ── Idempotency check ──────────────────────────────────────────────────────
  const [existing] = await db
    .select({ id: emailLogTable.id, status: emailLogTable.status })
    .from(emailLogTable)
    .where(eq(emailLogTable.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing && existing.status !== "failed") {
    return; // already sent (or queued) — skip
  }

  // ── Resolve sending identity ───────────────────────────────────────────────
  const identity = await resolveEmailIdentity(storeId, storeName);

  // ── Tier-1 rate limit (only applies when sending from the platform domain) ─
  if (storeId && identity.tier === "platform") {
    await checkTier1RateLimit(storeId); // throws RateLimitError on breach
  }

  // ── Insert / reset log row ─────────────────────────────────────────────────
  const inserted = await db
    .insert(emailLogTable)
    .values({
      idempotencyKey,
      storeId,
      recipientEmail: to,
      template,
      tier: identity.tier,
      fromAddress: identity.from,
      subject,
      status: "queued",
    })
    .onConflictDoUpdate({
      target: emailLogTable.idempotencyKey,
      set: { status: "queued", statusUpdatedAt: new Date() },
    })
    .returning({ id: emailLogTable.id });

  const logId = inserted[0]?.id;
  if (!logId) throw new Error("email_log insert returned no id");

  // ── Send ───────────────────────────────────────────────────────────────────
  try {
    const adapter = getAdapter();
    const result = await adapter.send({
      to,
      from: identity.from,
      replyTo: identity.replyTo,
      subject,
      html,
      text,
      headers,
    });

    await db
      .update(emailLogTable)
      .set({
        status: "sent",
        providerMessageId: result.messageId,
        sentAt: new Date(),
        statusUpdatedAt: new Date(),
      })
      .where(eq(emailLogTable.id, logId));
  } catch (err) {
    await db
      .update(emailLogTable)
      .set({
        status: "failed",
        errorMessage: String(err),
        statusUpdatedAt: new Date(),
      })
      .where(eq(emailLogTable.id, logId));
    throw err;
  }
}
