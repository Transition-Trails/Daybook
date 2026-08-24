export interface ExplicitCostLineItem {
  stage: string;
  amountUsd: number;
  note?: string;
}

export interface ExplicitCostProvenance {
  provider?: string;
  model?: string;
  lineItems?: ExplicitCostLineItem[];
}

export interface CostEstimateSummary {
  providerLabel: string;
  modelLabel: string | null;
  lineItems: ExplicitCostLineItem[];
  totalUsd: number | null;
  message: string | null;
}

/**
 * Costs are displayable only when the response supplies explicit, attributable
 * pricing line items. Compiler provenance currently does not include them.
 */
export function resolveCostEstimate(provenance: ExplicitCostProvenance | null | undefined): CostEstimateSummary {
  const lineItems = (provenance?.lineItems ?? []).filter(
    item => Number.isFinite(item.amountUsd) && item.amountUsd >= 0 && item.stage.trim().length > 0,
  );
  if (!provenance?.provider || lineItems.length === 0) {
    return {
      providerLabel: "Unavailable",
      modelLabel: null,
      lineItems: [],
      totalUsd: null,
      message: "This compile does not include provider usage or pricing provenance. Projected cost is unavailable.",
    };
  }
  return {
    providerLabel: provenance.provider,
    modelLabel: provenance.model ?? null,
    lineItems,
    totalUsd: lineItems.reduce((total, item) => total + item.amountUsd, 0),
    message: "Projected from explicit provider pricing metadata; this is not a billed total.",
  };
}