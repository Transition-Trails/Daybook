export type PackPrice = number | null | undefined;

const PRICE_PATTERN = /^\d+(?:\.\d{1,2})?$/;

/**
 * Parse a user-entered pack price without coercing malformed input to zero.
 *
 * Platform pack creation intentionally supports free packs, so callers can
 * opt into `allowFree` and receive null for a blank/zero value. Seller-facing
 * pack publishing should use the default and require a positive price.
 */
export function parsePackPrice(value: string, options: { allowFree?: boolean } = {}): PackPrice {
  const trimmed = value.trim();
  if (!trimmed) return options.allowFree ? null : undefined;
  if (!PRICE_PATTERN.test(trimmed)) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed <= 0) return options.allowFree ? null : undefined;
  return parsed;
}

export function getPackPriceError(
  value: string,
  options: { allowFree?: boolean } = {},
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return options.allowFree ? null : "Enter a price to publish.";
  if (!PRICE_PATTERN.test(trimmed)) {
    return "Price must be in whole cents (for example, 4.99).";
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return "Enter a valid price.";
  if (parsed <= 0 && !options.allowFree) return "Price must be greater than $0.00.";
  return null;
}