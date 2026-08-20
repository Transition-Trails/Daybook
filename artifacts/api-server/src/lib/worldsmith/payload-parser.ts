/**
 * PP-1.0 Payload Parser
 * Parses the YAML-like plain-text prompt payload stored in Notion.
 * Format: each line is `key: value`; multi-line values use indented continuation.
 * Keys use lowercase snake_case; each key appears exactly once.
 */
import type { ParsedPayload } from "./types";

export interface ParseResult {
  payload: Partial<ParsedPayload>;
  /** Any keys that appeared more than once. */
  duplicateKeys: string[];
  /** Raw key-value map preserving insertion order. */
  rawEntries: Array<[string, string]>;
}

/**
 * Parse the raw YAML-like payload text into a key-value map.
 * Multi-line values: subsequent lines that start with whitespace are
 * treated as continuation of the previous key's value.
 */
export function parsePayload(raw: string): ParseResult {
  const rawEntries: Array<[string, string]> = [];
  const duplicateKeys: string[] = [];
  const seen = new Set<string>();

  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let currentKey: string | null = null;
  let currentValue = "";

  const flush = () => {
    if (currentKey !== null) {
      const val = currentValue.trim();
      rawEntries.push([currentKey, val]);
      if (seen.has(currentKey)) {
        duplicateKeys.push(currentKey);
      } else {
        seen.add(currentKey);
      }
      currentKey = null;
      currentValue = "";
    }
  };

  for (const line of lines) {
    // Skip blank lines
    if (!line.trim()) {
      flush();
      continue;
    }

    // Continuation line (indented or starts with spaces)
    if ((line.startsWith(" ") || line.startsWith("\t")) && currentKey !== null) {
      currentValue += " " + line.trim();
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      // Treat as continuation if we have a current key
      if (currentKey !== null) {
        currentValue += " " + line.trim();
      }
      continue;
    }

    const candidate = line.slice(0, colonIdx).trim().toLowerCase();

    // Validate key format: only lowercase letters, digits, underscores
    if (/^[a-z][a-z0-9_]*$/.test(candidate)) {
      flush();
      currentKey = candidate;
      currentValue = line.slice(colonIdx + 1).trim();
    } else {
      // Treat as continuation text
      if (currentKey !== null) {
        currentValue += " " + line.trim();
      }
    }
  }
  flush();

  // Build payload object
  const payload: Partial<ParsedPayload> = {};
  for (const [k, v] of rawEntries) {
    // Last write wins for duplicates (we still track them)
    payload[k as keyof ParsedPayload] = v;
  }

  return { payload, duplicateKeys, rawEntries };
}

/** Check for placeholder values that should have been filled in. */
const PLACEHOLDER_PATTERNS = [/^\[.*\]$/, /^<.*>$/, /^TODO$/i, /^TBD$/i, /^\.\.\.$/, /^N\/A$/i];

export function isPlaceholder(value: string): boolean {
  const v = value.trim();
  return !v || PLACEHOLDER_PATTERNS.some((p) => p.test(v));
}
