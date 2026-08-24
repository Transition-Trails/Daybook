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

export interface ProductionCostEstimate {
  provider?: string;
  model?: string;
  estimatedCostUsd?: number | null;
  estimateNote?: string;
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

/**
 * Final-art requests carry their estimate separately from compiler provenance.
 * Keep an unavailable estimate explicit instead of turning a missing provider
 * configuration into a misleading zero-dollar total.
 */
export function resolveProductionCostEstimate(
  production: ProductionCostEstimate | null | undefined,
): CostEstimateSummary {
  const amount = production?.estimatedCostUsd;
  if (!production?.provider || !Number.isFinite(amount) || amount == null || amount < 0) {
    return {
      providerLabel: production?.provider ?? "Unavailable",
      modelLabel: production?.model ?? null,
      lineItems: [],
      totalUsd: null,
      message: production?.estimateNote
        ?? "Estimated provider cost is unavailable for this final-art request.",
    };
  }

  return {
    providerLabel: production.provider,
    modelLabel: production.model ?? null,
    lineItems: [{ stage: "Final artwork", amountUsd: amount }],
    totalUsd: amount,
    message: "Projected from configured provider pricing; this is not a billed total.",
  };
}