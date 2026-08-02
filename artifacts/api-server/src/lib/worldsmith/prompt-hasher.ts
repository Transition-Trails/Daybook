/**
 * Deterministic SHA-256 prompt hash.
 * Rules:
 *  - Normalize line endings to \n.
 *  - Preserve meaningful whitespace inside approved_text.
 *  - Serialize settings with stable key ordering.
 *  - Do NOT include timestamps, request IDs, costs, or generated filenames.
 *  - Store the lowercase hex result.
 */
import { createHash } from "crypto";

export interface HashInput {
  payload_version: string;
  compiled_prompt: string;
  negative_prompt?: string;
  generation_provider?: string;
  model_name?: string;
  model_version?: string;
  generation_settings?: Record<string, unknown>;
}

function normalizeLineEndings(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stableStringify(obj: Record<string, unknown>): string {
  const sorted = Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      const v = obj[k];
      acc[k] = v !== null && typeof v === "object" && !Array.isArray(v)
        ? JSON.parse(stableStringify(v as Record<string, unknown>))
        : v;
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

export function computePromptHash(input: HashInput): string {
  const canonical = {
    payload_version: input.payload_version,
    compiled_prompt: normalizeLineEndings(input.compiled_prompt),
    negative_prompt: input.negative_prompt ? normalizeLineEndings(input.negative_prompt) : "",
    generation_provider: input.generation_provider ?? "",
    model_name: input.model_name ?? "",
    model_version: input.model_version ?? "",
    generation_settings: input.generation_settings
      ? JSON.parse(stableStringify(input.generation_settings))
      : {},
  };

  const json = JSON.stringify(canonical, Object.keys(canonical).sort());
  return createHash("sha256").update(json, "utf8").digest("hex");
}
