/**
 * A Stripe Price ID is only usable when it contains a non-whitespace value.
 * Keep this normalization shared so startup diagnostics, public catalog
 * visibility, and checkout all agree on what "sellable" means.
 */
export function getConfiguredStripePriceId(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}