import { buildLayout, h } from "./layout";

// ── Auto-response template ────────────────────────────────────────────────────
// Sent (at most once per 24 h per thread+sender) when someone replies to a
// no-reply address. Must carry Auto-Submitted and Precedence headers (set by
// the caller) to prevent mail loops.

export function autoResponse(opts: {
  storeName: string;
  ticketRef: string;  // short human-readable ref, e.g. "AB123456"
  ticketUrl: string;
}): { subject: string; html: string; text: string } {
  const body =
    `<p>Thanks for getting in touch. This address doesn't accept replies — ` +
    `please use the app to read and respond to your support request.</p>` +
    `<p style="margin:0">Reference: <strong>#${h(opts.ticketRef)}</strong></p>`;

  return {
    subject: `Re: Your support request — #${h(opts.ticketRef)}`,
    ...buildLayout({
      storeName: opts.storeName,
      preheader: "Replies to this address aren't monitored — visit the app instead",
      title: "This address doesn't accept replies",
      bodyHtml: body,
      ctaLabel: "Open your request",
      ctaUrl: opts.ticketUrl,
    }),
  };
}
