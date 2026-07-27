import { resendAdapter } from "./resend-adapter";
import { nullAdapter } from "./null-adapter";
import type { EmailAdapter } from "./adapter";

// Lazy singleton — selected once on first use.
let _adapter: EmailAdapter | null = null;

export function getAdapter(): EmailAdapter {
  if (_adapter) return _adapter;

  if (process.env.RESEND_API_KEY) {
    _adapter = resendAdapter;
  } else {
    console.warn("[email] RESEND_API_KEY not set — using null adapter (no mail will be sent)");
    _adapter = nullAdapter;
  }

  return _adapter;
}

export { sendEmail } from "./send";
export type { EmailTemplate, SendEmailOpts } from "./send";
export { resolveEmailIdentity } from "./identity";
