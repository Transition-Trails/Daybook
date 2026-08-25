import { buildLayout, h } from "./layout";

// ── Order email templates ─────────────────────────────────────────────────────

/** Purchase receipt with download link. */
export function orderReceipt(opts: {
  storeName: string;
  downloads: Array<{ name: string; url: string }>;
  recoveryUrl: string;
}): { subject: string; html: string; text: string } {
  const firstName = opts.downloads[0]?.name ?? "your order";
  const downloadList = opts.downloads.map((download) =>
    `<p style="margin:12px 0"><a href="${h(download.url)}">Download ${h(download.name)}</a></p>`,
  ).join("");
  const body =
    `<p>Thank you for your purchase from <strong>${h(opts.storeName)}</strong>. Your files are ready to download.</p>` +
    downloadList +
    `<p style="margin-top:4px;font-size:12px;color:#7A8FA6">Download links expire after 48 hours. ` +
    `If yours has expired, request fresh links using the form in the footer below.</p>`;
  const layout = buildLayout({
    storeName: opts.storeName,
    preheader: `Your download from ${opts.storeName} is ready`,
    title: opts.downloads.length === 1 ? "Your file is ready" : "Your files are ready",
    bodyHtml: body,
    ctaLabel: "Download first file",
    ctaUrl: opts.downloads[0]?.url ?? opts.recoveryUrl,
    extraFooter: `Need fresh links? ${opts.recoveryUrl}`,
  });

  return {
    subject: opts.downloads.length === 1
      ? `Your download is ready — ${firstName}`
      : `${opts.downloads.length} downloads are ready`,
    ...layout,
    text: [
      `Thank you for your purchase from ${opts.storeName}.`,
      ...opts.downloads.map((download) => `${download.name}: ${download.url}`),
      `Download links expire after 48 hours. Need fresh links? ${opts.recoveryUrl}`,
    ].join("\n"),
  };
}
