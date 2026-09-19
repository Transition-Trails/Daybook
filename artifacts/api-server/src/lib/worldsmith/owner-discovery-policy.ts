export type OwnerDiscoveryDecision = "accept" | "return" | "reject";

const allowedStates: Record<OwnerDiscoveryDecision, readonly string[]> = {
  accept: ["submitted", "in_review"],
  return: ["submitted", "in_review"],
  reject: ["submitted", "in_review", "returned"],
};

export function ownerDiscoveryDecisionAllowed(
  action: OwnerDiscoveryDecision,
  status: string,
): boolean {
  return allowedStates[action].includes(status);
}