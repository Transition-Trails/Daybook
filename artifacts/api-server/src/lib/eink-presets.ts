/**
 * E-ink device profiles and enforcement rules.
 *
 * The database is the authority. The exported records are a small synchronous
 * cache because PDF rendering is synchronous at the point where it chooses
 * page geometry and stroke widths. Generation and the platform routes refresh
 * this cache before they use it.
 */
import { db, einkDevicePresetsTable, einkEnforcementRulesTable } from "@workspace/db";

export type EinkLinkSupport = "full" | "partial" | "poor";

export interface EinkPreset {
  key: string;
  label: string;
  px: { w: number; h: number };
  pts: { w: number; h: number };
  linksQuality: EinkLinkSupport;
  linkSupport: EinkLinkSupport;
  safeInset: number;
  sellGuidance: string;
  caveat?: string;
}

export interface EinkRule {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  threshold: number | null;
  unit: string | null;
}

const DEFAULT_PRESETS: EinkPreset[] = [
  {
    key: "remarkable",
    label: "reMarkable 2 / Pro",
    px: { w: 1404, h: 1872 },
    pts: { w: 447, h: 597 },
    linksQuality: "full",
    linkSupport: "full",
    safeInset: 8,
    sellGuidance: "The strongest fit. Internal PDF links work exactly as designed.",
  },
  {
    key: "supernote",
    label: "Supernote A5X / A6X",
    px: { w: 1404, h: 1872 },
    pts: { w: 447, h: 597 },
    linksQuality: "full",
    linkSupport: "full",
    safeInset: 10,
    sellGuidance: "Handles links and heavy documents well.",
  },
  {
    key: "boox",
    label: "Boox Note / Tab",
    px: { w: 1404, h: 1872 },
    pts: { w: 447, h: 597 },
    linksQuality: "full",
    linkSupport: "full",
    safeInset: 12,
    sellGuidance: "Android-based and capable; use the closest trim preset.",
  },
  {
    key: "kindle_scribe",
    label: "Kindle Scribe",
    px: { w: 1860, h: 2480 },
    pts: { w: 446, h: 595 },
    linksQuality: "poor",
    linkSupport: "poor",
    safeInset: 14,
    sellGuidance: "Sell it as a printable-style planner; sideloaded links are unreliable.",
    caveat: "Printable-style on Kindle Scribe — hyperlinks are supported on reMarkable, Supernote and Boox.",
  },
];

const DEFAULT_RULES: EinkRule[] = [
  { key: "grayscale", label: "Grayscale only", description: "The ink-friendly B&W variant is the e-ink asset.", enabled: true, threshold: null, unit: null },
  { key: "contrast_floor", label: "Contrast floor", description: "Fills lighter than about 15% grey cannot carry meaning.", enabled: true, threshold: 0.85, unit: "brightness" },
  { key: "line_weight", label: "Line weight", description: "Rules the buyer needs to see are at least 0.75 pt.", enabled: true, threshold: 0.75, unit: "pt" },
  { key: "file_weight", label: "File weight", description: "Vector-first exports avoid slow page turns and oversized files.", enabled: true, threshold: 10, unit: "MB" },
  { key: "toolbar_margin", label: "Toolbar margin", description: "Live content stays inside a safe inset from device overlays.", enabled: true, threshold: 40, unit: "pt" },
];

export const EINK_PRESETS: Record<string, EinkPreset> = Object.fromEntries(DEFAULT_PRESETS.map((preset) => [preset.key, preset]));
export const EINK_RULES: Record<string, EinkRule> = Object.fromEntries(DEFAULT_RULES.map((rule) => [rule.key, rule]));

function linkSupport(value: string | null | undefined): EinkLinkSupport {
  return value === "poor" || value === "partial" ? value : "full";
}

function presetFromRow(row: typeof einkDevicePresetsTable.$inferSelect): EinkPreset {
  const support = linkSupport(row.linkSupport);
  return {
    key: row.key,
    label: row.name,
    px: { w: row.pixelWidth, h: row.pixelHeight },
    pts: { w: row.trimWidth, h: row.trimHeight },
    linksQuality: support,
    linkSupport: support,
    safeInset: row.safeInset,
    sellGuidance: row.sellGuidance,
    ...(row.caveat ? { caveat: row.caveat } : {}),
  };
}

function ruleFromRow(row: typeof einkEnforcementRulesTable.$inferSelect): EinkRule {
  return {
    key: row.key,
    label: row.label,
    description: row.description,
    enabled: row.enabled,
    threshold: row.threshold,
    unit: row.unit,
  };
}

function replaceCache<T extends { key: string }>(target: Record<string, T>, rows: T[]) {
  for (const key of Object.keys(target)) delete target[key];
  for (const row of rows) target[row.key] = row;
}

/**
 * Load the current catalog from shared storage. Built-in defaults are only a
 * startup/query-failure fallback; a successful empty query is authoritative.
 */
export async function refreshEinkCatalog(): Promise<{ presets: EinkPreset[]; rules: EinkRule[] }> {
  try {
    const [presetRows, ruleRows] = await Promise.all([
      db.select().from(einkDevicePresetsTable),
      db.select().from(einkEnforcementRulesTable),
    ]);
    replaceCache(EINK_PRESETS, presetRows.map(presetFromRow));
    replaceCache(EINK_RULES, ruleRows.map(ruleFromRow));
  } catch (error) {
    console.warn("[eink] unable to refresh profile catalog; using cached values", (error as Error).message);
  }
  return { presets: getEinkPresets(), rules: getEinkRules() };
}

export function getEinkPresets(): EinkPreset[] {
  return Object.values(EINK_PRESETS);
}

export function getEinkRules(): EinkRule[] {
  return Object.values(EINK_RULES);
}

export function getEinkPreset(key: string | null | undefined): EinkPreset | null {
  if (!key) return null;
  return EINK_PRESETS[key.toLowerCase()] ?? null;
}

export function getEinkRule(key: string): EinkRule | null {
  return EINK_RULES[key] ?? null;
}

export function cacheEinkPreset(row: typeof einkDevicePresetsTable.$inferSelect): EinkPreset {
  const preset = presetFromRow(row);
  EINK_PRESETS[preset.key] = preset;
  return preset;
}

export function removeCachedEinkPreset(key: string): void {
  delete EINK_PRESETS[key];
}

export function cacheEinkRule(row: typeof einkEnforcementRulesTable.$inferSelect): EinkRule {
  const rule = ruleFromRow(row);
  EINK_RULES[rule.key] = rule;
  return rule;
}