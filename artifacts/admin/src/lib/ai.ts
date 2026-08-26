/**
 * AI utilities for the Daybook Admin AI Studios.
 * Wraps POST /ai/complete and provides defensive JSON parsing.
 */

async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── AI completion ───────────────────────────────────────────────────────────

export interface AiResult {
  text: string;
  provider: string;
  model: string;
}

export const aiApi = {
  complete: (system: string, userMessage: string) =>
    apiFetch<AiResult>("/ai/complete", {
      method: "POST",
      body: JSON.stringify({
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
    }),
};

// ── Defensive JSON extraction ───────────────────────────────────────────────
// Strips markdown fences, then grabs the first {...} or [...] block.

export function extractJson<T>(raw: string): T {
  // 1. Strip ```json ... ``` or ``` ... ``` fences
  const stripped = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  // 2. Try to match first object or array
  const objMatch = stripped.match(/\{[\s\S]*\}/);
  const arrMatch = stripped.match(/\[[\s\S]*\]/);

  // Prefer whichever appears first
  let candidate: string | null = null;
  if (objMatch && arrMatch) {
    candidate =
      stripped.indexOf("{") < stripped.indexOf("[") ? objMatch[0] : arrMatch[0];
  } else {
    candidate = objMatch?.[0] ?? arrMatch?.[0] ?? null;
  }

  if (!candidate) throw new Error("No JSON block found in AI response");
  return JSON.parse(candidate) as T;
}

// ── Color helpers ───────────────────────────────────────────────────────────

export const PALETTE_LABELS = [
  "Accent",
  "Accent dark",
  "Secondary",
  "Tertiary",
  "Ink",
  "Paper",
];

export function isValidHex(s: string) {
  const value = s.trim();
  return value === "none" || /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}
