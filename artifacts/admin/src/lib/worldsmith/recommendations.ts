export const RECOMMENDATION_CODES = new Set([
  "LEGACY_PAYLOAD_FORMAT",
  "MIGRATION_SUGGESTED",
  "PAYLOAD_OPTIMIZATION",
  "OPTIONAL_PROMPT_MODULE",
  "OPTIONAL_MODULE",
]);

export function isRecommendationCode(code: string | null | undefined): boolean {
  return RECOMMENDATION_CODES.has(code ?? "");
}