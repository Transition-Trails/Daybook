import type { EmailAdapter, EmailPayload, SendResult } from "./adapter";

/** No-op adapter used when RESEND_API_KEY is not set (dev / test). */
export const nullAdapter: EmailAdapter = {
  async send(payload: EmailPayload): Promise<SendResult> {
    console.log(
      `[email:null] → ${payload.to}  subject: "${payload.subject}"  from: ${payload.from}`,
    );
    return { messageId: `null-${Date.now()}` };
  },
};
