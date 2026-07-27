import { buildLayout, h } from "./layout";

// ── Order email templates ─────────────────────────────────────────────────────

/** Purchase receipt with download link. */
export function orderReceipt(opts: {
  storeName: string;
  editionName: string;
  downloadUrl: string;
  resendUrl: string;
}): { subject: string; html: string; text: string } {
  const body =
    `<p>Thank you for your purchase from <strong>${h(opts.storeName)}</strong>. Your file is ready to download.</p>` +
    `<p style="margin-bottom:4px"><strong>${h(opts.editionName)}</strong></p>` +
    `<p style="margin-top:4px;font-size:12px;color:#7A8FA6">Download links expire after 48 hours. ` +
    `If yours has expired, use the resend link in the footer below.</p>`;

  return {
    subject: `Your download is ready — ${opts.editionName}`,
    ...buildLayout({
      storeName: opts.storeName,
      preheader: `Your download from ${opts.storeName} is ready`,
      title: "Your file is ready",
      bodyHtml: body,
      ctaLabel: "Download now",
      ctaUrl: opts.downloadUrl,
      extraFooter: `Need a fresh link? ${opts.resendUrl}`,
    }),
  };
}
