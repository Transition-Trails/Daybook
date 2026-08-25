/**
 * Canonical hexadecimal colour parsing for server-side rendering.
 *
 * The SVG contract permits `none` because it represents an absent paint. Callers
 * that need concrete RGBA values should use hexToRgba, which rejects `none`.
 */
export function parseHexColor(value: string | undefined, fallback = "#000000"): string {
  const color = (value ?? fallback).trim();
  const short = /^#([0-9a-f]{3})$/i.exec(color);
  if (short) return `#${short[1].split("").map((part) => part + part).join("")}`.toUpperCase();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase();
  if (color === "none") return color;
  throw new Error(`Unsupported colour "${color}"; use #RGB, #RRGGBB, or none`);
}

export function hexToRgba(value: string | undefined): { r: number; g: number; b: number; alpha: number } {
  const hex = parseHexColor(value);
  if (hex === "none") throw new Error('Colour "none" cannot be converted to RGBA');
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    alpha: 1,
  };
}