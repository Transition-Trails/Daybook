/**
 * Normalize any Notion Production Specification input to a dashed UUID.
 *
 * Accepts:
 *   - Full Notion URL  https://www.notion.so/Title-43fb4f74303e4f3f8fdbaea9294ca3f4
 *   - Dashed ID        43fb4f74-303e-4f3f-8fdb-aea9294ca3f4
 *   - Raw 32-char hex  43fb4f74303e4f3f8fdbaea9294ca3f4
 *
 * Returns dashed UUID string, or throws a descriptive error.
 */
export function normalizeNotionId(raw: string): string {
  const input = (raw ?? "").trim();
  if (!input) throw new Error("Production Specification input is empty.");

  // Extract the rightmost 32 hex characters from URL path or plain string.
  // Notion page IDs are always the last segment of the path (after stripping
  // an optional human-readable slug prefix separated by a non-hex character).
  const hexOnly = input.replace(/-/g, "");
  const match = hexOnly.match(/([0-9a-fA-F]{32})(?:[^0-9a-fA-F]|$)/);
  const hex = match ? match[1] : (hexOnly.length === 32 && /^[0-9a-fA-F]{32}$/.test(hexOnly) ? hexOnly : null);

  if (!hex) {
    throw new Error(
      `Could not extract a Notion page ID from "${input}". ` +
      `Paste a full Notion URL or the 32-character page ID.`,
    );
  }

  // Re-insert UUID dashes: 8-4-4-4-12
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-").toLowerCase();
}
