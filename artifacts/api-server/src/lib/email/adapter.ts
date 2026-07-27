// ── Email adapter interface ───────────────────────────────────────────────────
// Callers use sendEmail() from ./send; they never touch adapters directly.

export interface EmailPayload {
  to: string;
  from: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  /** Optional RFC 2822 headers (e.g. Auto-Submitted, Precedence). */
  headers?: Record<string, string>;
}

export interface SendResult {
  messageId: string;
}

/** Thin interface so the provider is swappable and tests can inject a null adapter. */
export interface EmailAdapter {
  send(payload: EmailPayload): Promise<SendResult>;
}
