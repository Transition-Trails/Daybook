/**
 * Font pre-loader — runs once at server startup (fire-and-forget).
 *
 * Strategy:
 *  1. Query `theme_fonts` JOIN `fonts` for every live theme to collect
 *     font family names registered in the join table.
 *  2. Also extract family names from `themes.fontPairing` JSONB (heading /
 *     subheading / body / accent / button slots) so themes that use the
 *     pairing field without explicit theme_fonts rows are covered too.
 *  3. Deduplicate all (familyName, weight) pairs — weights 400 and 700 are
 *     always pre-fetched because they are the only weights the PDF generator uses.
 *  4. Fetch concurrently with a cap of 3 parallel downloads so we don't spike
 *     outbound bandwidth on a fresh container.
 *  5. Any individual failure is logged and swallowed; the warmup never rejects
 *     or throws to the caller.
 *
 * The warmup populates both the in-process Map and the /tmp disk cache so the
 * first planner export — regardless of whether it arrives on a fresh container
 * or after a hot-reload — pays zero network latency.
 */

import { db } from "@workspace/db";
import { themesTable, themeFontsTable, fontsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { fetchGoogleFontBytes, getFontFallbacks, _bundledFontPath, _googleFontCache, UI_REACHABLE_FAMILIES, SINGLE_WEIGHT_FAMILIES } from "./pdf-generator";
import { existsSync, readFileSync } from "fs";
import type { ThemeFontPairing } from "@workspace/db";

const CONCURRENCY = 3;
const WEIGHTS: Array<400 | 700> = [400, 700];

/**
 * Run `fn` over `items` with at most `concurrency` simultaneous calls.
 * Errors from individual calls are swallowed; overall promise always resolves.
 */
async function pMap<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item === undefined) break;
      try {
        await fn(item);
      } catch {
        // Individual errors are already logged inside fetchGoogleFontBytes
      }
    }
  });
  await Promise.all(workers);
}

/**
 * Collect all unique font family names referenced by live themes.
 * Sources:
 *   a) theme_fonts join table → fonts.family_name
 *   b) themes.font_pairing JSONB (heading/subheading/body/accent/button)
 */
async function collectLiveFamilyNames(): Promise<Set<string>> {
  const families = new Set<string>();

  // a) theme_fonts JOIN fonts WHERE themes.status = 'live'
  try {
    // Fetch all live theme IDs first
    const liveThemes = await db
      .select({ id: themesTable.id, fontPairing: themesTable.fontPairing })
      .from(themesTable)
      .where(eq(themesTable.status, "live"));

    const liveThemeIds = liveThemes.map((t) => t.id);

    // Extract family names from fontPairing JSONB (source b)
    for (const theme of liveThemes) {
      const pairing = theme.fontPairing as ThemeFontPairing | null | undefined;
      if (pairing) {
        for (const slot of ["heading", "subheading", "body", "accent", "button"] as const) {
          const name = pairing[slot];
          if (name && typeof name === "string" && name.trim()) {
            families.add(name.trim());
          }
        }
      }
    }

    // Source a: theme_fonts → fonts
    if (liveThemeIds.length > 0) {
      const rows = await db
        .select({ familyName: fontsTable.familyName })
        .from(themeFontsTable)
        .innerJoin(fontsTable, eq(themeFontsTable.fontId, fontsTable.id))
        .where(inArray(themeFontsTable.themeId, liveThemeIds));

      for (const row of rows) {
        if (row.familyName && row.familyName.trim()) {
          families.add(row.familyName.trim());
        }
      }
    }
  } catch (err) {
    console.warn("[font-warmup] DB query failed:", (err as Error).message);
  }

  return families;
}

// ── Warmup status ─────────────────────────────────────────────────────────────

export type WarmupPhase = "pending" | "running" | "done" | "error";

export interface WarmupStatus {
  /** Lifecycle phase of the warmup. "pending" = not yet started. */
  phase: WarmupPhase;
  /** ISO timestamp when warmFontCache() was invoked. null until started. */
  startedAt: string | null;
  /** ISO timestamp when warmup finished (success or error). null while running. */
  completedAt: string | null;
  /** How many distinct font family names were found across live themes. */
  familiesFound: number;
  /** Total (family × weight) pairs scheduled for fetching. */
  pairsTotal: number;
  /** Pairs successfully loaded (bundle, disk cache, or network). */
  pairsLoaded: number;
  /** Pairs that returned null (network failure or unsupported format). */
  pairsFailed: number;
  /** Families currently in the in-process cache after warmup. */
  familiesCached: string[];
  /** Families that fell back to StandardFonts (Helvetica/TimesRoman). */
  fallbacks: string[];
  /** UI-reachable families with no bundled WOFF on disk. */
  bundleGaps: string[];
  /** Error message if phase === "error". */
  errorMessage: string | null;
}

let _warmupStatus: WarmupStatus = {
  phase: "pending",
  startedAt: null,
  completedAt: null,
  familiesFound: 0,
  pairsTotal: 0,
  pairsLoaded: 0,
  pairsFailed: 0,
  familiesCached: [],
  fallbacks: [],
  bundleGaps: [],
  errorMessage: null,
};

/**
 * Returns a snapshot of the font warmup status.
 * Intended for the /healthz/fonts endpoint and diagnostics.
 */
export function getWarmupStatus(): WarmupStatus {
  return { ..._warmupStatus };
}

// ── Bundle coverage API ───────────────────────────────────────────────────────
/** Populated once by warmFontCache(); empty array until warmup has run. */
let _lastBundleGaps: string[] = [];

/**
 * Returns the list of UI-reachable font families that have no bundled WOFF
 * file in dist/fonts/.  Empty array = full coverage.
 * Intended for the super-admin font-coverage API endpoint.
 */
export function getBundleCoverageGaps(): string[] { return [..._lastBundleGaps]; }

/** Run the bundle coverage cross-check synchronously and update _lastBundleGaps. */
function checkBundleCoverage(): void {
  // ── 1. Missing-file check ─────────────────────────────────────────────────
  // Every UI-reachable family must have a 400 WOFF on disk.
  // Single-weight families (SINGLE_WEIGHT_FAMILIES) must NOT have a 700 WOFF.
  _lastBundleGaps = [...UI_REACHABLE_FAMILIES].filter(
    (f) => !existsSync(_bundledFontPath(f, 400)),
  );
  if (_lastBundleGaps.length > 0) {
    console.warn(
      `[font-warmup] ⚠ BUNDLE COVERAGE GAP — ${_lastBundleGaps.length} UI-reachable ` +
      `family/families have no bundled WOFF file and will fall back to network (or ` +
      `StandardFonts if offline): ${_lastBundleGaps.join(", ")}. ` +
      `Run scripts/download-fonts.mjs and redeploy to eliminate this risk.`,
    );
  } else {
    console.log("[font-warmup] ✓ Bundle coverage complete — all UI-reachable families have bundled files.");
  }

  // ── 2. Fake-weight check ──────────────────────────────────────────────────
  // A 700 WOFF byte-identical to its 400 sibling is a copied file masquerading
  // as a different weight — it silently renders at regular weight for bold roles.
  // Flag it so the problem cannot recur undetected.
  const fakeWeights: string[] = [];
  for (const family of UI_REACHABLE_FAMILIES) {
    if (SINGLE_WEIGHT_FAMILIES.has(family)) {
      // Single-weight family must not have a 700 file at all.
      if (existsSync(_bundledFontPath(family, 700))) {
        fakeWeights.push(`${family} (700 file present for a single-weight family — delete it)`);
      }
      continue;
    }
    const p400 = _bundledFontPath(family, 400);
    const p700 = _bundledFontPath(family, 700);
    if (!existsSync(p400) || !existsSync(p700)) continue; // missing-file check already handles this
    try {
      const b400 = readFileSync(p400);
      const b700 = readFileSync(p700);
      if (b400.length === b700.length && b400.equals(b700)) {
        fakeWeights.push(`${family} (700 byte-identical to 400)`);
      }
    } catch {
      // I/O error reading a bundled file — not a fake-weight issue; ignore here.
    }
  }
  if (fakeWeights.length > 0) {
    console.warn(
      `[font-warmup] ⚠ FAKE WEIGHT — ${fakeWeights.length} family/families have a 700 WOFF ` +
      `that is a copy of their 400, not a real bold: ${fakeWeights.join("; ")}. ` +
      `Remove the copied file and add the family to SINGLE_WEIGHT_FAMILIES in pdf-generator.ts.`,
    );
  }
}

/**
 * Pre-fetch all live-theme font families (weights 400 + 700) in the background.
 * Call this once after the DB pool is ready.  Never awaited by the caller.
 */
export function warmFontCache(): void {
  _warmupStatus = {
    ..._warmupStatus,
    phase: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    errorMessage: null,
  };

  (async () => {
    try {
      const families = await collectLiveFamilyNames();

      if (families.size === 0) {
        console.log("[font-warmup] No live theme fonts found — nothing to pre-fetch.");
        checkBundleCoverage();
        _warmupStatus = {
          ..._warmupStatus,
          phase: "done",
          completedAt: new Date().toISOString(),
          familiesFound: 0,
          pairsTotal: 0,
          pairsLoaded: 0,
          pairsFailed: 0,
          familiesCached: [],
          fallbacks: getFontFallbacks(),
          bundleGaps: getBundleCoverageGaps(),
        };
        return;
      }

      // Build the full (family, weight) work list
      const pairs: Array<{ family: string; weight: 400 | 700 }> = [];
      for (const family of families) {
        for (const weight of WEIGHTS) {
          pairs.push({ family, weight });
        }
      }

      _warmupStatus = {
        ..._warmupStatus,
        familiesFound: families.size,
        pairsTotal: pairs.length,
      };

      console.log(
        `[font-warmup] Pre-fetching ${families.size} font family/families × ${WEIGHTS.length} weights = ${pairs.length} files (concurrency ${CONCURRENCY})…`,
      );

      let loaded = 0;
      let failed = 0;

      await pMap(
        pairs,
        async ({ family, weight }) => {
          const bytes = await fetchGoogleFontBytes(family, weight);
          if (bytes) { loaded++; } else { failed++; }
        },
        CONCURRENCY,
      );

      checkBundleCoverage();

      const fallbacks = getFontFallbacks();
      const loadedFamilies = [...families].filter(f => !fallbacks.includes(f));
      const ok   = loadedFamilies.length > 0 ? `✓ ${loadedFamilies.join(", ")}` : "none";
      const fail = fallbacks.length > 0       ? `✗ fallback: ${fallbacks.join(", ")}` : "✓ all real";
      console.log(
        `[font-warmup] Done — ${loaded}/${pairs.length} files loaded. ${ok} | ${fail}`,
      );
      if (failed > 0) {
        console.warn(
          `[font-warmup] ⚠ ${failed}/${pairs.length} font file(s) failed to load. ` +
          `PDFs for affected families will fall back to Helvetica/TimesRoman. ` +
          `Check network connectivity and that bundled WOFF files exist in dist/fonts/.`,
        );
      }
      if (fallbacks.length > 0) {
        console.warn(
          `[font-warmup] ⚠ FONT FALLBACK ACTIVE — the following families will render in ` +
          `Helvetica/Times in generated PDFs instead of their chosen typeface: ${fallbacks.join(", ")}. ` +
          `Check that src/lib/fonts/ contains the bundled WOFF files and was copied to dist/fonts/.`,
        );
      }

      // Snapshot which families are now in the in-process cache
      const cachedFamilies = [...new Set(
        [..._googleFontCache.keys()].map((k) => k.split(":")[0] as string),
      )].sort();

      _warmupStatus = {
        ..._warmupStatus,
        phase: "done",
        completedAt: new Date().toISOString(),
        pairsLoaded: loaded,
        pairsFailed: failed,
        familiesCached: cachedFamilies,
        fallbacks,
        bundleGaps: getBundleCoverageGaps(),
      };
    } catch (err) {
      // Top-level safety net — should never be reached given inner try/catches
      const msg = (err as Error).message;
      console.warn(
        `[font-warmup] ⚠ Unexpected error during font warm-up: ${msg}. ` +
        `Font cache may be empty — the first PDF export will pay full network latency ` +
        `and risk timeout if Google Fonts is unreachable.`,
      );
      _warmupStatus = {
        ..._warmupStatus,
        phase: "error",
        completedAt: new Date().toISOString(),
        errorMessage: msg,
        bundleGaps: getBundleCoverageGaps(),
      };
    }
  })();
}
