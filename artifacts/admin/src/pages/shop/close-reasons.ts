/**
 * Canonical close-reason definitions shared by buyer and store-admin surfaces.
 * The `value` field is what gets stored in tickets.close_reason.
 */
export const CLOSE_REASONS = [
  {
    value: "fixed_myself",
    label: "Fixed it myself",
    description: "You found and resolved the root cause without outside help.",
  },
  {
    value: "answered_article_existed",
    label: "Answered — article existed",
    description: "A help article already covered this; the buyer just needed pointing to it.",
  },
  {
    value: "answered_no_article",
    label: "Answered — no article yet",
    description: "You answered it manually. No article exists yet to prevent the next one.",
  },
  {
    value: "buyer_error",
    label: "Buyer error",
    description: "The buyer misunderstood how the product works; no defect or gap.",
  },
  {
    value: "product_defect",
    label: "Product defect",
    description: "A real bug or file issue that needs a fix on your end.",
  },
] as const;

export type CloseReasonValue = (typeof CLOSE_REASONS)[number]["value"];

export function closeReasonLabel(value: string | null | undefined): string {
  return CLOSE_REASONS.find((r) => r.value === value)?.label ?? value ?? "—";
}
