/** A provider response is not a successful suggestion run unless it has usable items. */
export function parseSuggestionArray(content: string): Record<string, unknown>[] {
  const clean = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const candidates = [clean, clean.match(/\[[\s\S]*\]/)?.[0]].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        const items = parsed.filter((item): item is Record<string, unknown> =>
          item !== null && typeof item === "object" && !Array.isArray(item));
        if (items.length) return items;
      }
    } catch { /* Try extracting an array from a prose wrapper. */ }
  }
  throw new Error("The AI returned no usable suggestions. Please try again.");
}