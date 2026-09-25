import { buildLayout } from "./layout";

export function userInvitationEmail(input: {
  inviteUrl: string;
  roleLabel: string;
  storeName?: string;
}): { subject: string; html: string; text: string } {
  const assignment = input.storeName
    ? `${input.roleLabel} for ${input.storeName}`
    : input.roleLabel;
  const layout = buildLayout({
    preheader: "You have been invited to Daybook",
    title: "You're invited to Daybook",
    bodyHtml:
      `<p>You've been invited to join Daybook as <strong>${escapeHtml(assignment)}</strong>.</p>` +
      `<p>Use the secure invitation link below to register or sign in and accept your invitation. This link expires in seven days and can only be used once.</p>`,
    ctaLabel: "Accept invitation",
    ctaUrl: input.inviteUrl,
    extraFooter: "If you were not expecting this invitation, you can ignore this email.",
  });
  return {
    subject: "You're invited to Daybook",
    ...layout,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}