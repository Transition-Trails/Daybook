// ── Shared email layout ───────────────────────────────────────────────────────
// Warm palette: paper #F7F0E6, card #FFFDF9, border #E7DCCB,
// navy #1B2A4A, clay #C87560, slate #4A6080, muted #7A8FA6.
// Table-based for Outlook compatibility; all styles inline.

const PLATFORM_NAME = process.env.EMAIL_PLATFORM_NAME ?? "Daybook";
const APP_URL = process.env.APP_URL
  ? `https://${process.env.APP_URL}`
  : process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : "https://example.com";

export { APP_URL };

export function buildLayout(opts: {
  /** Store display name; omit for platform-only emails. */
  storeName?: string;
  /** Short preview text shown in inbox before opening (≤ 90 chars). */
  preheader: string;
  title: string;
  /** Inner body HTML — keep it simple: <p>, <strong>, <em> only. */
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Optional extra line appended to the standard footer. */
  extraFooter?: string;
}): { html: string; text: string } {
  const { storeName, preheader, title, bodyHtml, ctaLabel, ctaUrl, extraFooter } = opts;

  const headerBrand = storeName
    ? `<span style="color:#F7F0E6;font-size:18px;font-weight:700;letter-spacing:-0.3px">${h(storeName)}</span>` +
      `<span style="color:#7A8FA6;font-size:13px;font-weight:400;margin-left:10px">via&nbsp;${h(PLATFORM_NAME)}</span>`
    : `<span style="color:#F7F0E6;font-size:18px;font-weight:700;letter-spacing:-0.3px">${h(PLATFORM_NAME)}</span>`;

  const ctaBlock =
    ctaLabel && ctaUrl
      ? `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:24px">
           <tr>
             <td style="background:#C87560;border-radius:8px;mso-padding-alt:0">
               <a href="${ctaUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;mso-hide:false">${h(ctaLabel)}</a>
             </td>
           </tr>
         </table>`
      : "";

  const extraLine = extraFooter
    ? `<br>${h(extraFooter)}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>${h(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F7F0E6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <!-- Preheader text (hidden in email body, visible in inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#F7F0E6">${h(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#F7F0E6">
    <tr>
      <td align="center" style="padding:32px 16px">
        <!--[if mso]><table width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:560px;background-color:#FFFDF9;border:1px solid #E7DCCB;border-radius:12px;overflow:hidden">

          <!-- Header band -->
          <tr>
            <td style="background-color:#1B2A4A;padding:20px 32px">
              ${headerBrand}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px">
              <h1 style="margin:0 0 14px;font-size:21px;font-weight:700;color:#1B2A4A;line-height:1.3;letter-spacing:-0.3px">${h(title)}</h1>
              <div style="font-size:14px;color:#4A6080;line-height:1.7">${bodyHtml}</div>
              ${ctaBlock}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #E7DCCB">
              <p style="margin:0;font-size:11px;color:#7A8FA6;line-height:1.7">
                Replies to this address are not monitored —
                <a href="${APP_URL}" style="color:#C87560;text-decoration:none">open the app</a>
                to respond to your request.${extraLine}
              </p>
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;

  // ── Plain-text fallback ────────────────────────────────────────────────────
  const textParts: string[] = [
    storeName ? `${storeName} (via ${PLATFORM_NAME})` : PLATFORM_NAME,
    "",
    title,
    "──────────────────────────────────",
    stripHtml(bodyHtml),
  ];
  if (ctaLabel && ctaUrl) {
    textParts.push("", `${ctaLabel}:`, ctaUrl);
  }
  textParts.push(
    "",
    "──────────────────────────────────",
    "Replies to this address are not monitored.",
    `Open the app: ${APP_URL}`,
  );
  if (extraFooter) textParts.push(extraFooter);

  return { html, text: textParts.join("\n") };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** HTML-escape a plain string for safe inline insertion. */
export function h(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
