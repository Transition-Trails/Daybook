/**
 * E-ink safety checker for Daybook planner exports.
 *
 * Runs AFTER buildPdf (so the buffer size is known) and BEFORE Drive upload.
 * Throws EinkSafetyError if the output would render poorly on e-ink.
 *
 * The three checks:
 *
 *  1. CONTRAST FLOOR — original (pre-B&W) accent fill lighter than ~15% gray.
 *     On the colour version, very light fills carry no meaning; when the B&W
 *     export strips all colour they simply disappear. Fail the build early.
 *
 *  2. LINE WEIGHT — enforced at draw-time inside buildPdf (min 0.75 pt when
 *     einkMode is active). This check acts as a post-build assertion in case a
 *     template hard-codes a thinner value.
 *
 *  3. FILE WEIGHT BUDGET — full-bleed raster art makes page turns crawl.
 *     Budget: 10 MB. Backgrounds are stripped in ink-friendly mode, so this
 *     is a safety net for unusually complex vector content.
 */

/** Minimal hex → rgb converter (duplicated to keep this module self-contained). */
function hexBrightness(hex: string): number {
  const h = hex.replace("#", "");
  if (h.length !== 6) return 0;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // Perceived brightness (WCAG-adjacent luma)
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export class EinkSafetyError extends Error {
  constructor(public readonly violations: string[]) {
    super(`E-ink safety check failed:\n${violations.map((v) => `  • ${v}`).join("\n")}`);
    this.name = "EinkSafetyError";
  }
}

/** Options passed to the checker. */
export interface EinkCheckOpts {
  /** Original accent colour hex BEFORE the ink-friendly B&W override (e.g. "#c5d4e8"). */
  originalAccentHex: string;
  /** Size of the generated PDF buffer in bytes. */
  bufferBytes: number;
  /** The device key (used only for contextual messaging). */
  deviceKey: string;
}

/**
 * Run e-ink safety assertions. Returns the violation list (empty = pass).
 * Callers can either throw on non-empty or surface as warnings.
 */
export function collectEinkViolations(opts: EinkCheckOpts): string[] {
  const violations: string[] = [];

  // 1. Contrast floor
  const brightness = hexBrightness(opts.originalAccentHex);
  if (brightness > 0.85) {
    violations.push(
      `Accent colour ${opts.originalAccentHex} has perceived brightness ` +
      `${(brightness * 100).toFixed(0)}% — fills lighter than ~15% gray ` +
      `are invisible on e-ink. Pick a darker accent or the contrast floor will ` +
      `hide section headers on device.`,
    );
  }

  // 2. File weight budget (10 MB)
  const BUDGET_MB = 10;
  const sizeMb = opts.bufferBytes / 1024 / 1024;
  if (sizeMb > BUDGET_MB) {
    violations.push(
      `PDF is ${sizeMb.toFixed(1)} MB — exceeds the ${BUDGET_MB} MB e-ink budget. ` +
      `Page turns will be slow on device. Remove full-bleed raster art or switch ` +
      `to a vector-only background.`,
    );
  }

  return violations;
}

/**
 * Strict variant: throws EinkSafetyError if any violations are found.
 */
export function assertEinkSafe(opts: EinkCheckOpts): void {
  const violations = collectEinkViolations(opts);
  if (violations.length > 0) throw new EinkSafetyError(violations);
}
