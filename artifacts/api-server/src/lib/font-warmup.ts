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
import { fetchGoogleFontBytes, getFontFallbacks, _bundledFontPath, UI_REACHABLE_FAMILIES } from "./pdf-generator";
import { existsSync } from "fs";
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
}

/**
 * Pre-fetch all live-theme font families (weights 400 + 700) in the background.
 * Call this once after the DB pool is ready.  Never awaited by the caller.
 */
export function warmFontCache(): void {
  (async () => {
    try {
      const families = await collectLiveFamilyNames();

      if (families.size === 0) {
        console.log("[font-warmup] No live theme fonts found — nothing to pre-fetch.");
        checkBundleCoverage();
        return;
      }

      // Build the full (family, weight) work list
      const pairs: Array<{ family: string; weight: 400 | 700 }> = [];
      for (const family of families) {
        for (const weight of WEIGHTS) {
          pairs.push({ family, weight });
        }
      }

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

      const fallbacks = getFontFallbacks();
      const loadedFamilies = [...families].filter(f => !fallbacks.includes(f));
      const ok   = loadedFamilies.length > 0 ? `✓ ${loadedFamilies.join(", ")}` : "none";
      const fail = fallbacks.length > 0       ? `✗ fallback: ${fallbacks.join(", ")}` : "✓ all real";
      console.log(
        `[font-warmup] Done — ${loaded}/${pairs.length} files loaded. ${ok} | ${fail}`,
      );
      if (fallbacks.length > 0) {
        console.warn(
          `[font-warmup] ⚠ FONT FALLBACK ACTIVE — the following families will render in ` +
          `Helvetica/Times in generated PDFs instead of their chosen typeface: ${fallbacks.join(", ")}. ` +
          `Check that src/lib/fonts/ contains the bundled WOFF files and was copied to dist/fonts/.`,
        );
      }

      checkBundleCoverage();
    } catch (err) {
      // Top-level safety net — should never be reached given inner try/catches
      console.warn("[font-warmup] Unexpected error during font warm-up:", (err as Error).message);
    }
  })();
}
