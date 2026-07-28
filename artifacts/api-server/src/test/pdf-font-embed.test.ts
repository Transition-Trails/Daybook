/**
 * PDF font embedding smoke check.
 *
 * Confirms that a generated planner PDF contains embedded glyph data for the
 * requested Google Font family ("Lora") rather than falling back to
 * StandardFonts (Helvetica / Times-Roman).
 *
 * Resolution chain used by fetchGoogleFontBytes:
 *   1. In-process Map  → cleared in beforeEach
 *   2. Bundled WOFF    → src/lib/fonts/Lora-400.woff (present in the repo)
 *   3. Disk /tmp cache → cleared in beforeEach
 *   4. Live Google Fonts CDN (only reached when bundle file is absent)
 *
 * In a normal dev / CI environment the bundled WOFF files are present and step 2
 * succeeds without any network call.  The test therefore passes even when the
 * network is unavailable, while still proving that the embedding pipeline works
 * end-to-end.
 *
 * "fetchGoogleFontBytes returns null" tests use a serif family with no bundled
 * file ("Merriweather") and stub global.fetch to return a 500, forcing the
 * resolution chain to return null and triggering StandardFonts fallback.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { promises as fsPromises } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { buildPdf, _googleFontCache, _diskCachePath } from "../lib/pdf-generator";
import type { ThemeFontPairing } from "@workspace/db";

// ── Minimal planner config ────────────────────────────────────────────────────

const MINIMAL_CONFIG = {
  setup: {
    weekStart:   "mon" as const,
    orientation: "vertical" as const,
    startMonth:  0,
    startYear:   2027,
    monthCount:  1,
  },
  style:    { renderStyle: "flat" as const },
  output:   { calMode: "none" as const, eventMins: 60 as const, aiInPdf: false },
  sections: [],
};

// ── Helper: extract /BaseFont names from PDF bytes ────────────────────────────
//
// pdf-lib saves with compressed object streams by default; font names are
// invisible to plain-text regex in that form.  Re-saving without object streams
// makes every /BaseFont entry ASCII-readable.
//
//   Standard fonts   → /BaseFont /Times-Roman   /BaseFont /Helvetica
//   Embedded subsets → /BaseFont /ABCDEF+Lora-Regular  (strip prefix → "Lora-Regular")

async function extractBaseFonts(pdfBytes: Uint8Array): Promise<string[]> {
  const reloaded = await PDFDocument.load(pdfBytes);
  const flat     = await reloaded.save({ useObjectStreams: false });
  const text     = Buffer.from(flat).toString("latin1");

  const found = new Set<string>();
  for (const m of text.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)) {
    const raw  = m[1]!;
    const name = raw.includes("+") ? raw.split("+")[1]! : raw;
    found.add(name);
  }
  return [...found];
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Flush the in-process font cache so bundled bytes are loaded fresh each test.
  _googleFontCache.clear();

  // Flush the disk cache so no stale entry interferes with the fallback tests.
  const diskDir = "/tmp/gfont-cache";
  await fsPromises.rm(diskDir, { recursive: true, force: true }).catch(() => {});

  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PDF font embedding — Lora (bundled WOFF present)", () => {
  it(
    "embeds a real Lora glyph subset (not Helvetica, not Times-Roman) when the font is reachable",
    async () => {
      // Both heading and body set to "Lora" to keep the assertion simple —
      // every font slot should resolve to the real typeface.
      const fontPairing: ThemeFontPairing = { heading: "Lora", body: "Lora" };

      const { buffer } = await buildPdf(
        MINIMAL_CONFIG as any,
        undefined,   // themeColors
        undefined,   // template (DEFAULT_TEMPLATE)
        undefined,   // background
        fontPairing,
      );

      expect(buffer.byteLength).toBeGreaterThan(0);

      const baseFonts = await extractBaseFonts(buffer);
      console.log("[pdf-font-embed] Lora base fonts:", baseFonts);

      // The bundled WOFF for Lora is present in src/lib/fonts/.
      // fetchGoogleFontBytes loads it at step 2 of the resolution chain, so the
      // PDF must embed the real typeface.  A subset name like "Lora-Regular" or
      // "Lora-Bold" must appear; StandardFont names must not.
      const hasRealLora = baseFonts.some((f) => f.toLowerCase().startsWith("lora"));
      expect(
        hasRealLora,
        `Expected at least one /BaseFont entry starting with "Lora" but got: ${baseFonts.join(", ")}`,
      ).toBe(true);

      expect(baseFonts).not.toContain("Helvetica");
      expect(baseFonts).not.toContain("Helvetica-Bold");
      expect(baseFonts).not.toContain("Times-Roman");
      expect(baseFonts).not.toContain("Times-Roman-Bold");
    },
    60_000,
  );
});

describe("PDF font embedding — fallback when fetchGoogleFontBytes returns null", () => {
  /**
   * "Merriweather" is in SERIF_PDF_FAMILIES but has no bundled WOFF file.
   * With global.fetch stubbed to fail (500), all three resolution steps
   * (bundle, disk cache, network) return null → generator falls back to
   * StandardFonts.  Merriweather is serif → Times-Roman expected.
   */
  it(
    "falls back to Times-Roman for a serif family when no bundle and fetch fails",
    async () => {
      // Stub global.fetch to return a 500 for every URL.
      // This forces the network path to fail after the bundle miss.
      vi.spyOn(global, "fetch").mockImplementation(async () =>
        new Response("Server Error", { status: 500 }),
      );

      const fontPairing: ThemeFontPairing = {
        heading: "Merriweather",
        body:    "Merriweather",
      };

      const { buffer } = await buildPdf(
        MINIMAL_CONFIG as any,
        undefined,
        undefined,
        undefined,
        fontPairing,
      );

      expect(buffer.byteLength).toBeGreaterThan(0);

      const baseFonts = await extractBaseFonts(buffer);
      console.log("[pdf-font-embed] Merriweather fallback base fonts:", baseFonts);

      // Merriweather is in SERIF_PDF_FAMILIES → StandardFonts fallback is Times-Roman.
      const hasTimesRoman = baseFonts.some((f) => f.startsWith("Times"));
      expect(
        hasTimesRoman,
        `Expected Times-Roman fallback but got: ${baseFonts.join(", ")}`,
      ).toBe(true);

      // No real Merriweather glyph data — null prevented any TTF embed.
      const hasRealFont = baseFonts.some((f) =>
        f.toLowerCase().includes("merriweather"),
      );
      expect(hasRealFont).toBe(false);
    },
    60_000,
  );

  it(
    "falls back to Helvetica for a sans-serif family when no bundle and fetch fails",
    async () => {
      // Stub global.fetch to return a 500 for every URL.
      vi.spyOn(global, "fetch").mockImplementation(async () =>
        new Response("Server Error", { status: 500 }),
      );

      // "Crimson Pro" is a serif family — but let's use a sans family with no bundle.
      // "Roboto" is not in the bundled set and not in SERIF_PDF_FAMILIES → Helvetica.
      const fontPairing: ThemeFontPairing = {
        heading: "Roboto",
        body:    "Roboto",
      };

      const { buffer } = await buildPdf(
        MINIMAL_CONFIG as any,
        undefined,
        undefined,
        undefined,
        fontPairing,
      );

      expect(buffer.byteLength).toBeGreaterThan(0);

      const baseFonts = await extractBaseFonts(buffer);
      console.log("[pdf-font-embed] Roboto fallback base fonts:", baseFonts);

      // Roboto is not in SERIF_PDF_FAMILIES → falls back to Helvetica.
      const hasHelvetica = baseFonts.some((f) => f.startsWith("Helvetica"));
      expect(
        hasHelvetica,
        `Expected Helvetica fallback but got: ${baseFonts.join(", ")}`,
      ).toBe(true);

      // No real Roboto glyph data.
      const hasRealFont = baseFonts.some((f) => f.toLowerCase().includes("roboto"));
      expect(hasRealFont).toBe(false);
    },
    60_000,
  );
});
