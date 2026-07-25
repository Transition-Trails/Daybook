/**
 * plannerFileName — human-readable bundle naming for exported planners.
 *
 * Pattern (dated):   {year}-{layoutSlug}_{themeSlug}_{orientationSlug}_{weekStart}.pdf
 * Pattern (undated): {layoutSlug}_{themeSlug}_{orientationSlug}_{weekStart}.pdf
 *
 * Examples:
 *   2027-daily_sage_vertical_mon.pdf
 *   daily_sage_vertical_mon.pdf  (undated/perpetual)
 */

export interface PlannerFileNameConfig {
  setup: {
    datingMode?: "dated" | "undated" | "perpetual";
    startYear?: number;
    orientation: "landscape" | "vertical";
    weekStart: "sun" | "mon";
  };
  editionName?: string | null;
  themeName?: string | null;
}

/** Slugify: lowercase, replace spaces/special chars with hyphens, collapse runs. */
function slugify(s: string | null | undefined): string {
  if (!s) return "custom";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "custom";
}

export function plannerFileName(config: PlannerFileNameConfig): string {
  const { setup, editionName, themeName } = config;
  const { datingMode = "dated", startYear, orientation, weekStart } = setup;

  const layoutSlug = slugify(editionName);
  const themeSlug = slugify(themeName);
  const orientationSlug = orientation === "landscape" ? "landscape" : "vertical";

  const core = `${layoutSlug}_${themeSlug}_${orientationSlug}_${weekStart}.pdf`;

  if (datingMode !== "dated" || !startYear) {
    return core;
  }
  return `${startYear}-${core}`;
}
