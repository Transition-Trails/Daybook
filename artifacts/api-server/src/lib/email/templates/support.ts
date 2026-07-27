import { buildLayout, h, APP_URL } from "./layout";

// ── Support email templates ───────────────────────────────────────────────────
// All templates: one-line summary + CTA button.
// Do NOT include full thread body — the app is the record.

/** 1. Ticket received — sent to reporter immediately after filing. */
export function ticketReceived(opts: {
  ticketId: string;
  storeName: string;
  area: string;
  tier: "owner" | "buyer";
}): { subject: string; html: string; text: string } {
  const ref = ref8(opts.ticketId);
  const ctaUrl =
    opts.tier === "owner"
      ? `${APP_URL}/super/support`
      : `${APP_URL}/s/${encodeURIComponent(opts.storeName)}/support`;

  const body =
    `<p>We've received your request about <strong>${h(opts.area)}</strong>. ` +
    `Our team will review it and get back to you as soon as possible.</p>` +
    `<p style="margin:0">Reference: <strong>#${ref}</strong></p>`;

  return {
    subject: `Your support request has been received — #${ref}`,
    ...buildLayout({
      storeName: opts.storeName,
      preheader: `We've received your request. Ref #${ref}`,
      title: "We've got your request",
      bodyHtml: body,
      ctaLabel: "View request",
      ctaUrl,
    }),
  };
}

/** 2. Store/platform replied — sent to the reporter (buyer). */
export function ticketReply(opts: {
  ticketId: string;
  storeName: string;
  area: string;
}): { subject: string; html: string; text: string } {
  const ref = ref8(opts.ticketId);
  const ctaUrl = `${APP_URL}/s/${encodeURIComponent(opts.storeName)}/support`;

  const body =
    `<p>${h(opts.storeName)} has responded to your request about <strong>${h(opts.area)}</strong>.</p>` +
    `<p>Open the app to read the reply and respond directly.</p>`;

  return {
    subject: `${opts.storeName} replied to your support request — #${ref}`,
    ...buildLayout({
      storeName: opts.storeName,
      preheader: `${opts.storeName} replied to your support request`,
      title: "You have a new reply",
      bodyHtml: body,
      ctaLabel: "Read and reply",
      ctaUrl,
    }),
  };
}

/** 3. Ticket closed — sent to the reporter with optional close reason. */
export function ticketClosed(opts: {
  ticketId: string;
  storeName: string;
  area: string;
  reason?: string;
}): { subject: string; html: string; text: string } {
  const ref = ref8(opts.ticketId);
  const ctaUrl = `${APP_URL}/s/${encodeURIComponent(opts.storeName)}/support`;

  const reasonBlock = opts.reason
    ? `<p>The team noted: <em>${h(opts.reason)}</em></p>`
    : "";

  const body =
    `<p>Your request about <strong>${h(opts.area)}</strong> has been marked resolved.</p>` +
    reasonBlock +
    `<p>If your issue isn't fully sorted, you can reopen it from the app — we're happy to keep helping.</p>`;

  return {
    subject: `Your support request is resolved — #${ref}`,
    ...buildLayout({
      storeName: opts.storeName,
      preheader: `Your support request has been resolved`,
      title: "Your request is resolved",
      bodyHtml: body,
      ctaLabel: "View or reopen",
      ctaUrl,
    }),
  };
}

/** 4. New ticket alert — sent to the store owner when a buyer files a ticket. */
export function newTicketStore(opts: {
  ticketId: string;
  storeName: string;
  storeId: string;
  area: string;
}): { subject: string; html: string; text: string } {
  const ref = ref8(opts.ticketId);
  const ctaUrl = `${APP_URL}/store/${opts.storeId}/support-inbox`;

  const body =
    `<p>A buyer submitted a support request about <strong>${h(opts.area)}</strong>.</p>` +
    `<p>Reference: <strong>#${ref}</strong></p>` +
    `<p>Open your support inbox to read the details and reply.</p>`;

  return {
    subject: `New support request in ${opts.storeName} — #${ref}`,
    ...buildLayout({
      storeName: opts.storeName,
      preheader: `New buyer support request in ${opts.storeName}`,
      title: "New support request",
      bodyHtml: body,
      ctaLabel: "View in inbox",
      ctaUrl,
    }),
  };
}

/** 5. New ticket alert — sent to platform admins when a store owner files a ticket. */
export function newTicketPlatform(opts: {
  ticketId: string;
  storeName: string;
  area: string;
}): { subject: string; html: string; text: string } {
  const ref = ref8(opts.ticketId);
  const ctaUrl = `${APP_URL}/super/support`;

  const body =
    `<p><strong>${h(opts.storeName)}</strong> filed a support request about <strong>${h(opts.area)}</strong>.</p>` +
    `<p>Reference: <strong>#${ref}</strong></p>`;

  return {
    subject: `[Platform] New support request from ${opts.storeName} — #${ref}`,
    ...buildLayout({
      preheader: `New platform support request from ${opts.storeName}`,
      title: "New support request from a seller",
      bodyHtml: body,
      ctaLabel: "View in platform inbox",
      ctaUrl,
    }),
  };
}

/** 6. Buyer reopened — sent to the scope handler when a reporter replies to a closed ticket. */
export function buyerReopened(opts: {
  ticketId: string;
  storeName: string;
  storeId: string;
  area: string;
  isOwnerTier: boolean;
}): { subject: string; html: string; text: string } {
  const ref = ref8(opts.ticketId);
  const ctaUrl = opts.isOwnerTier
    ? `${APP_URL}/super/support`
    : `${APP_URL}/store/${opts.storeId}/support-inbox`;

  const body =
    `<p>A request about <strong>${h(opts.area)}</strong> has been reopened.</p>` +
    `<p>Reference: <strong>#${ref}</strong></p>` +
    `<p>Open the inbox to review and respond.</p>`;

  return {
    subject: `Support request reopened — #${ref}`,
    ...buildLayout({
      storeName: opts.isOwnerTier ? undefined : opts.storeName,
      preheader: `Support request #${ref} was reopened`,
      title: "A support request was reopened",
      bodyHtml: body,
      ctaLabel: "View in inbox",
      ctaUrl,
    }),
  };
}

function ref8(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
