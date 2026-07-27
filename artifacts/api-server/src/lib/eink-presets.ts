/**
 * E-ink device presets for Daybook planner exports.
 *
 * Points are calculated as: pixels / deviceDpi * 72.
 * Safe inset is the minimum guaranteed clear zone in PDF points.
 *
 * linksQuality:
 *   "full"  — internal PDF links (TOC tabs, date anchors) work correctly.
 *   "poor"  — internal links are unreliable (Kindle Send pipeline strips them);
 *             the generator should either omit the link layer or surface a caveat.
 */
export interface EinkPreset {
  key:          string;
  label:        string;
  /** Pixel dimensions at native device DPI (for documentation only). */
  px:           { w: number; h: number };
  /** Page trim size in PDF points (1pt = 1/72 in). */
  pts:          { w: number; h: number };
  linksQuality: "full" | "poor";
  /**
   * Safe-inset for device toolbars and bezels, in PDF points.
   * Already covered by the generator's default MARGIN (40pt), so this is
   * the *additional* inset beyond MARGIN — kept as metadata.
   */
  safeInset:    number;
  /** Listing caveat to surface when linksQuality is poor. */
  caveat?:      string;
}

export const EINK_PRESETS: Record<string, EinkPreset> = {
  remarkable: {
    key:          "remarkable",
    label:        "reMarkable 2 / Pro",
    px:           { w: 1404, h: 1872 },
    // 1404 / 226dpi * 72 ≈ 447 pt  |  1872 / 226dpi * 72 ≈ 597 pt
    pts:          { w: 447, h: 597 },
    linksQuality: "full",
    safeInset:    8,
  },
  supernote: {
    key:          "supernote",
    label:        "Supernote A5X / A6X",
    px:           { w: 1404, h: 1872 },
    pts:          { w: 447, h: 597 },
    linksQuality: "full",
    safeInset:    10,
  },
  boox: {
    key:          "boox",
    label:        "Boox Note / Tab",
    px:           { w: 1404, h: 1872 },
    // Same native resolution family; use closest preset (reMarkable trim).
    pts:          { w: 447, h: 597 },
    linksQuality: "full",
    safeInset:    12,
  },
  kindle_scribe: {
    key:          "kindle_scribe",
    label:        "Kindle Scribe",
    px:           { w: 1860, h: 2480 },
    // 1860 / 300dpi * 72 ≈ 446 pt  |  2480 / 300dpi * 72 ≈ 595 pt
    pts:          { w: 446, h: 595 },
    linksQuality: "poor",
    safeInset:    14,
    caveat: "Printable-style on Kindle Scribe — hyperlinks are supported on reMarkable, Supernote and Boox.",
  },
};

/** Look up a preset by key (case-insensitive). Returns null if not found. */
export function getEinkPreset(key: string | null | undefined): EinkPreset | null {
  if (!key) return null;
  return EINK_PRESETS[key.toLowerCase()] ?? null;
}
