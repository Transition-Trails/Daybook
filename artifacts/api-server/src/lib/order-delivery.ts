import { createHmac, timingSafeEqual } from "node:crypto";
import type { OrderItem } from "@workspace/db";

export const DOWNLOAD_LINK_TTL_SECONDS = 48 * 60 * 60;

function getSigningSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to sign order downloads");
  return secret;
}

function signatureFor(orderId: string, itemIndex: number, expiresAt: number): string {
  return createHmac("sha256", getSigningSecret())
    .update(`${orderId}:${itemIndex}:${expiresAt}`)
    .digest("base64url");
}

function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:5000").replace(/\/+$/, "");
}

export function createSignedDownloadUrl(
  orderId: string,
  itemIndex: number,
  now = Date.now(),
): string {
  const expiresAt = Math.floor(now / 1000) + DOWNLOAD_LINK_TTL_SECONDS;
  const signature = signatureFor(orderId, itemIndex, expiresAt);
  return `${appUrl()}/api/orders/${encodeURIComponent(orderId)}/downloads/${itemIndex}`
    + `?expires=${expiresAt}&signature=${encodeURIComponent(signature)}`;
}

export function createSignedDownloadLinks(
  orderId: string,
  items: OrderItem[],
  now = Date.now(),
): Array<{ name: string; url: string }> {
  return items.map((item, index) => ({
    name: item.name,
    url: createSignedDownloadUrl(orderId, index, now),
  }));
}

export function verifySignedDownload(
  orderId: string,
  itemIndex: number,
  expires: unknown,
  suppliedSignature: unknown,
  now = Date.now(),
): boolean {
  if (typeof expires !== "string" || !/^\d+$/.test(expires)) return false;
  if (typeof suppliedSignature !== "string" || suppliedSignature.length === 0) return false;
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;

  const expected = Buffer.from(signatureFor(orderId, itemIndex, expiresAt));
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function recoveryUrl(orderId: string): string {
  void orderId;
  // Recovery intentionally starts from email alone, rather than an old
  // order-specific capability. The GET endpoint renders a small form that
  // posts to the privacy-preserving recovery handler.
  return `${appUrl()}/api/orders/recovery`;
}