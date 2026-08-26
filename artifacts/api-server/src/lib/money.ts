/**
 * JavaScript decimal literals are binary floating-point values, so values such
 * as 19.99 do not reliably have an exact integer when multiplied by 100.
 * Compare to the nearest cent with a small fixed tolerance instead.
 */
export function isNonNegativeWholeCentAmount(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
  const nearestCent = Math.round(value * 100);
  return Math.abs(value * 100 - nearestCent) < 1e-8;
}