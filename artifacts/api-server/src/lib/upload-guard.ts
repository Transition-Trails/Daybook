/**
 * Upload guard — size cap, content-type allowlist, and magic-byte detection.
 *
 * Used in two places:
 *  1. POST /storage/uploads/request-url — rejects oversized or non-image
 *     metadata before a presigned URL is issued.
 *  2. POST /backgrounds upsert chokepoint — re-checks the first bytes of the
 *     stored object to catch spoofed MIME types.
 */

/** Maximum allowed upload size in bytes (8 MiB). */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/** Content-type values accepted for background image uploads. */
export const ALLOWED_IMAGE_TYPES: ReadonlySet<string> = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

// ── Magic-byte signatures ─────────────────────────────────────────────────────

type MagicEntry = { label: string; bytes: readonly number[]; offset?: number };

const MAGIC_SIGNATURES: MagicEntry[] = [
  // JPEG: FF D8 FF
  { label: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { label: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  // GIF87a / GIF89a
  { label: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: bytes 8-11 = 57 45 42 50 ("WEBP"), preceded by RIFF at 0-3
  { label: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

/**
 * Detect the image type from raw leading bytes.
 *
 * Returns a MIME-style label (e.g. "image/jpeg") when the bytes match a
 * known signature, or `null` when no signature matches (binary is not a
 * recognisable image).
 *
 * Pass at least 12 bytes for reliable WebP detection.
 */
export function detectImageMagicBytes(bytes: Uint8Array): string | null {
  for (const { label, bytes: sig, offset = 0 } of MAGIC_SIGNATURES) {
    if (bytes.length < offset + sig.length) continue;
    const match = sig.every((b, i) => bytes[offset + i] === b);
    if (match) return label;
  }
  return null;
}
