import { createHash } from "node:crypto";

function stableValue(value: unknown, omitUpdatedAt = false): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(entry => stableValue(entry));
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !omitUpdatedAt || key !== "updatedAt")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, stableValue(entry)]);
    return Object.fromEntries(entries);
  }
  return value;
}

// Keep admin and MCP conflict tokens identical.
export function revisionFor(row: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableValue(row, true))).digest("hex")}`;
}