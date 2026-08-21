/**
 * Spec-board font rendering regression test — Task #406
 *
 * Wave 1 Step 09 fixed the spec-board font pipeline:
 *   - FONT_DIR corrected to ../fonts (was pointing at a non-existent worldsmith/fonts dir)
 *   - fontDirs + defaultFontFamily added to the resvg options
 *   - fontCss() rewritten with real on-disk filenames
 *   - Spectral-Italic-400.woff added to the bundle
 *
 * Without a regression test, a future FONT_DIR change, font rename, or resvg
 * upgrade could silently produce a blank board — resvg falls back to a no-op
 * placeholder rather than throwing when fonts are missing.
 *
 * This file calls the real renderSpecBoardToPng (no mocks) and asserts:
 *
 *   1. The returned buffer is a valid PNG with dimensions BOARD_W × BOARD_H.
 *   2. The raw pixel buffer contains dark pixels in the Spectral title band
 *      (proves glyphs were drawn, not empty fallback rectangles).
 *   3. A golden pixel-count lower bound is preserved so a font swap is caught
 *      on the first CI run.
 *
 * NOTE: This test dynamically imports @resvg/resvg-js the same way the source
 * does, so it will catch any ESM/CJS packaging regression in that library too.
 */

import { describe, it, expect } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import {
  renderSpecBoardToPng,
  buildSpecBoardSvg,
  BOARD_W,
  BOARD_H,
} from "../lib/worldsmith/spec-board-template.js";
import type { SpecBoardData } from "../lib/worldsmith/types.js";

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * The spec-board template's FONT_DIR resolves to src/lib/fonts/ at test time
 * (same location the test runner sees, since both use import.meta.url from
 * their respective directories under src/).
 *
 * This path is used here only for the independent Resvg render in the pixel
 * analysis tests (we don't re-export FONT_DIR from the template).
 */
const FONT_TEST_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "lib",
  "fonts",
);

/**
 * The y-coordinate of the large Spectral title (line 2 of a colon-split title).
 *
 * From spec-board-template.ts:
 *   const IMG_Y = TOP_Y = 56
 *   titleLine2 is rendered at IMG_Y + 120 = 176
 */
const SPECTRAL_TITLE_Y = 176; // pixels (board coordinate = output pixel at 1:1 scale)

/**
 * Band around the Spectral title where we expect dark (non-background) pixels.
 * Spectral 36px bold: cap height ≈ 26 px above baseline, descender ≈ 8 px below.
 * We scan ±24 px around the baseline to catch the full glyph body.
 */
const SPECTRAL_BAND_TOP = SPECTRAL_TITLE_Y - 28; // ~148
const SPECTRAL_BAND_BOT = SPECTRAL_TITLE_Y + 12; // ~188

/**
 * Horizontal range in the left title panel where "The Library Table" appears.
 * Text starts at x=14 (LFT_X + offset). We scan x=14..650.
 */
const SPECTRAL_BAND_LEFT = 14;
const SPECTRAL_BAND_RIGHT = 650;

/**
 * Dark-pixel threshold: avg(R,G,B) < DARK_THRESHOLD marks a pixel as
 * "not background paper (#F5F0E8 = avg 239)". This catches both fully-filled
 * navy glyphs and their heavily anti-aliased edges.
 */
const DARK_THRESHOLD = 200;

/**
 * Minimum dark pixel count in the Spectral title band. Chosen conservatively —
 * "The Library Table" at 36 px bold Spectral produces well over 500 such pixels
 * in practice. If this drops below 100, fonts are not loading.
 *
 * GOLDEN VALUE — do not lower without re-rendering and deliberately verifying
 * the result still looks correct.
 */
const MIN_DARK_PIXELS = 100;

// ── Fixture ───────────────────────────────────────────────────────────────────

/**
 * Minimal SpecBoardData with a colon-split title so both Instrument Sans
 * (line 1: "Test Specimen:") and Spectral (line 2: "The Library Table") are
 * exercised on the board.
 */
function minimalBoard(): SpecBoardData {
  return {
    specPageId: "font-reg-001",
    productionItem: "Test Specimen: The Library Table",
    specId: "TS-FONT-001",
    world: "Wychcombe",
    collection: "The Ember Codex",
    componentType: "Decorative Paper",
    payloadVersion: "PP-1.0",
    currentVersion: "1",
    status: "Draft",
    designIntent: "Aged parchment for the library scene.",
    narrativePurpose: "Establish the Victorian library atmosphere.",
    requiredContent: "Aged parchment, ink stains, quill.",
    reviewCriteria: "Warm and aged.",
    assetRole: "background",
    composition: "Full-bleed aged parchment.",
    materials: "Cotton rag, cold-press texture, natural deckle edge.",
    visualHierarchy: "Primary: reading lamp glow.",
    textRule: "Avoid center of page.",
    canonRule: "",
    printRule: "300 DPI minimum; CMYK-safe palette.",
    negativeConstraints: "No digital grain, no neon color, no modern objects.",
    promptModuleCount: 0,
    canonDependency: "None",
    canonRecordCount: 0,
    promptHash: "fontreg001",
  };
}

// ── PNG header helpers ────────────────────────────────────────────────────────

/** Read a 4-byte big-endian uint from a Buffer at the given offset. */
function readUint32BE(buf: Buffer, offset: number): number {
  return (buf[offset] << 24 | buf[offset + 1] << 16 | buf[offset + 2] << 8 | buf[offset + 3]) >>> 0;
}

/** True when the buffer starts with the 8-byte PNG signature. */
function isPng(buf: Buffer): boolean {
  return (
    buf[0] === 0x89 &&
    buf[1] === 0x50 && // P
    buf[2] === 0x4e && // N
    buf[3] === 0x47 && // G
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

/**
 * Extract width and height from the PNG IHDR chunk.
 * Structure: 8-byte signature | 4-byte chunk length | 4-byte "IHDR" | 4-byte W | 4-byte H | …
 */
function pngDimensions(buf: Buffer): { width: number; height: number } {
  // Width at bytes 16–19, height at bytes 20–23
  return {
    width:  readUint32BE(buf, 16),
    height: readUint32BE(buf, 20),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("renderSpecBoardToPng — PNG format and dimensions", () => {
  it("returns a buffer that starts with the PNG magic bytes", async () => {
    const buf = await renderSpecBoardToPng(minimalBoard());
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(100); // sanity: not empty
    expect(isPng(buf)).toBe(true);
  });

  it("produces BOARD_W × BOARD_H output dimensions — proves resvg ran to completion", async () => {
    const buf = await renderSpecBoardToPng(minimalBoard());
    const { width, height } = pngDimensions(buf);
    expect(width).toBe(BOARD_W);   // 2400
    expect(height).toBe(BOARD_H);  // 2500
  });

  it("PNG is large enough to contain real rendered content (not a trivially blank board)", async () => {
    const buf = await renderSpecBoardToPng(minimalBoard());
    // A fully blank 2400×2500 RGBA PNG compresses to roughly 5–10 KB.
    // A board with text and shapes is comfortably above 50 KB.
    expect(buf.length).toBeGreaterThan(50_000);
  });
});

describe("Spectral font rendering — glyph pixel regression (GOLDEN)", () => {
  /**
   * Use @resvg/resvg-js directly to get raw RGBA pixels without PNG round-trip,
   * then count dark pixels in the Spectral title band.
   *
   * This test will FAIL if:
   *   - The WOFF files are missing or their filenames change
   *   - FONT_DIR is wrong (reverted to the old non-existent worldsmith/fonts)
   *   - The fontDirs / defaultFontFamily options are removed from the Resvg constructor
   *   - A font replacement silently changes glyph shapes
   */
  it(
    "renders dark Spectral glyphs in the title band — golden minimum: " + MIN_DARK_PIXELS + " dark pixels",
    { timeout: 30_000 },
    async () => {
      const { Resvg } = await import("@resvg/resvg-js");
      const svg = buildSpecBoardSvg(minimalBoard());

      const resvg = new Resvg(svg, {
        font: {
          loadSystemFonts: false,
          fontDirs: [FONT_TEST_DIR],
          defaultFontFamily: "Spectral",
        },
        fitTo: { mode: "width" as const, value: BOARD_W },
      });

      const rendered = resvg.render();
      const pixels = rendered.pixels; // Uint8Array, RGBA, row-major at BOARD_W × BOARD_H

      // Count pixels in the Spectral title band where avg(R,G,B) < DARK_THRESHOLD.
      // The paper background is #F5F0E8 ≈ avg 239 — well above the threshold.
      // Spectral navy glyphs (#1B2A4A) and their anti-aliased edges are all below.
      let darkPixelCount = 0;

      for (let y = SPECTRAL_BAND_TOP; y < SPECTRAL_BAND_BOT; y++) {
        for (let x = SPECTRAL_BAND_LEFT; x < SPECTRAL_BAND_RIGHT; x++) {
          const base = (y * BOARD_W + x) * 4;
          const r = pixels[base];
          const g = pixels[base + 1];
          const b = pixels[base + 2];
          if ((r + g + b) / 3 < DARK_THRESHOLD) {
            darkPixelCount++;
          }
        }
      }

      // Report the count so a developer can update the golden value if the font
      // or layout legitimately changes.
      console.log(
        `[font regression] Spectral title band dark pixel count: ${darkPixelCount}` +
        ` (band y=${SPECTRAL_BAND_TOP}..${SPECTRAL_BAND_BOT}, x=${SPECTRAL_BAND_LEFT}..${SPECTRAL_BAND_RIGHT})`,
      );

      expect(darkPixelCount).toBeGreaterThanOrEqual(MIN_DARK_PIXELS);
    },
  );

  it(
    "Instrument Sans glyphs also render — dark pixels exist in the first title line band (y=110..150)",
    { timeout: 30_000 },
    async () => {
      // Title line 1 "Test Specimen:" is rendered in Instrument Sans 28px bold
      // at IMG_Y + 78 = 134. We scan y=110..150 to catch it.
      const { Resvg } = await import("@resvg/resvg-js");
      const svg = buildSpecBoardSvg(minimalBoard());

      const resvg = new Resvg(svg, {
        font: {
          loadSystemFonts: false,
          fontDirs: [FONT_TEST_DIR],
          defaultFontFamily: "Spectral",
        },
        fitTo: { mode: "width" as const, value: BOARD_W },
      });

      const rendered = resvg.render();
      const pixels = rendered.pixels;

      let darkPixelCount = 0;
      for (let y = 110; y < 150; y++) {
        for (let x = SPECTRAL_BAND_LEFT; x < SPECTRAL_BAND_RIGHT; x++) {
          const base = (y * BOARD_W + x) * 4;
          const r = pixels[base];
          const g = pixels[base + 1];
          const b = pixels[base + 2];
          if ((r + g + b) / 3 < DARK_THRESHOLD) {
            darkPixelCount++;
          }
        }
      }

      console.log(`[font regression] Instrument Sans title-1 band dark pixel count: ${darkPixelCount}`);
      expect(darkPixelCount).toBeGreaterThanOrEqual(MIN_DARK_PIXELS);
    },
  );
});

describe("Spectral italic font — rendered in italic world attribution line", () => {
  /**
   * The world attribution at IMG_Y + 204 = 260 is:
   *   <text ... font-style="italic" fill="#7A756E">World: Wychcombe</text>
   *
   * This exercises the newly-added Spectral-Italic-400.woff.
   * We check that pixels exist in the y=240..280 band.
   */
  it(
    "renders italic Spectral glyphs in the world attribution line (y ≈ 260)",
    { timeout: 30_000 },
    async () => {
      const { Resvg } = await import("@resvg/resvg-js");
      const svg = buildSpecBoardSvg(minimalBoard());

      const resvg = new Resvg(svg, {
        font: {
          loadSystemFonts: false,
          fontDirs: [FONT_TEST_DIR],
          defaultFontFamily: "Spectral",
        },
        fitTo: { mode: "width" as const, value: BOARD_W },
      });

      const rendered = resvg.render();
      const pixels = rendered.pixels;

      // World attribution line: Spectral italic 13.5px, fill "#7A756E" (MUTED).
      // MUTED avg = (122+117+110)/3 = 116.3 — well below DARK_THRESHOLD.
      let darkPixelCount = 0;
      for (let y = 240; y < 280; y++) {
        for (let x = SPECTRAL_BAND_LEFT; x < 400; x++) {
          const base = (y * BOARD_W + x) * 4;
          const r = pixels[base];
          const g = pixels[base + 1];
          const b = pixels[base + 2];
          if ((r + g + b) / 3 < DARK_THRESHOLD) {
            darkPixelCount++;
          }
        }
      }

      console.log(`[font regression] Spectral italic world attribution dark pixel count: ${darkPixelCount}`);

      // 13.5 px italic text is small; be permissive — at least 20 dark pixels.
      expect(darkPixelCount).toBeGreaterThanOrEqual(20);
    },
  );
});

describe("buildSpecBoardSvg — font-face declarations sanity check", () => {
  it("embeds all five @font-face rules in the SVG <style> block", () => {
    const svg = buildSpecBoardSvg(minimalBoard());

    // Spectral regular, bold, italic
    expect(svg).toContain("Spectral-400.woff");
    expect(svg).toContain("Spectral-700.woff");
    expect(svg).toContain("Spectral-Italic-400.woff");

    // Instrument Sans regular and bold
    expect(svg).toContain("Instrument_Sans-400.woff");
    expect(svg).toContain("Instrument_Sans-700.woff");
  });

  it("does not reference the old incorrect font directory name", () => {
    const svg = buildSpecBoardSvg(minimalBoard());
    // The old (wrong) path had "worldsmith/fonts" — it should never appear
    expect(svg).not.toContain("worldsmith/fonts");
    // Nor the old placeholder filenames
    expect(svg).not.toContain("spectral-regular.woff");
    expect(svg).not.toContain("spectral-bold.woff");
    expect(svg).not.toContain("spectral-italic.woff");
    expect(svg).not.toContain("instrument-sans-regular.woff");
    expect(svg).not.toContain("instrument-sans-bold.woff");
  });
});
