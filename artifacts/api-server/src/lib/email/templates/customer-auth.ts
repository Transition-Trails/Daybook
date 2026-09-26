import { buildLayout } from "./layout";

export function customerAuthEmail(input: {
  action: "verify your email address" | "reset your password";
  url: string;
}): { subject: string; html: string; text: string } {
  const verify = input.action === "verify your email address";
  const subject = verify ? "Verify your email address" : "Reset your password";
  const layout = buildLayout({
    preheader: subject,
    title: subject,
    bodyHtml: `<p>Use the secure link below to ${input.action}. The link can only be used once and will expire shortly.</p>`,
    ctaLabel: verify ? "Verify email" : "Reset password",
    ctaUrl: input.url,
    extraFooter: "If you did not request this, you can safely ignore this email.",
  });
  return { subject, ...layout };
}