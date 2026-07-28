/**
 * Canonical set of texture slugs that the platform recognises.
 *
 * The admin background-picker renders these as CSS patterns (see
 * artifacts/admin/src/pages/catalog/backgrounds/list.tsx → TEXTURE_CSS).
 * When a background row has type="texture", its assetRef must be one of
 * these slugs; any other value would silently produce a blank page in the
 * PDF generator.
 *
 * Keep this list in sync with the TEXTURE_CSS object in list.tsx.
 */
export const KNOWN_TEXTURE_SLUGS: ReadonlySet<string> = new Set([
  "linen",
  "kraft",
  "marble",
  "canvas",
  "grid",
  "dot",
]);
