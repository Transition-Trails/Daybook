/**
 * Canonical browser-side normalization for Notion page/database IDs.
 * Mirrors the server contract without importing server code into the Vite app.
 */
export function normalizeNotionId(raw: string): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  const hexOnly = input.replace(/-/g, "");
  const match = hexOnly.match(/([0-9a-fA-F]{32})(?:[^0-9a-fA-F]|$)/);
  const hex = match ? match[1] :
    (hexOnly.length === 32 && /^[0-9a-fA-F]{32}$/.test(hexOnly) ? hexOnly : null);
  if (!hex) return null;
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)]
    .join("-")
    .toLowerCase();
}