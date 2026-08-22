/**
 * PP-1.0 Payload Parser
 * Parses the YAML-like plain-text prompt payload stored in Notion.
 * Format: each line is `key: value`; multi-line values use indented continuation.
 * Keys use lowercase snake_case; each key appears exactly once.
 */
import type { ParsedPayload } from "./types";
import { parsePayloadEntries } from "@workspace/api-zod/readiness";

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
  const { rawEntries, duplicateKeys } = parsePayloadEntries(raw);

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
