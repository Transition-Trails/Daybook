import { Resend } from "resend";
import type { EmailAdapter, EmailPayload, SendResult } from "./adapter";

const client = new Resend(process.env.RESEND_API_KEY);

export const resendAdapter: EmailAdapter = {
  async send(payload: EmailPayload): Promise<SendResult> {
    const res = await client.emails.send({
      to: [payload.to],
      from: payload.from,
      replyTo: payload.replyTo,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      headers: payload.headers,
    });

    if (res.error) {
      throw new Error(`Resend error ${res.error.name}: ${res.error.message}`);
    }

    return { messageId: res.data!.id };
  },
};
