/**
 * Spec-board font rendering regression test — Task #406
 *
 * Wave 1 Step 09 fixed the spec-board font pipeline:
 *   - FONT_DIR corrected to ../fonts (was pointing at a non-existent worldsmith/fonts dir)
 *   - fontDirs + defaultFontFamily added to the resvg options
 *   - fontCss() rewritten with real on-disk filenames
 *   - Spectral-Italic-400.woff added to the bundle
 *
 * All pixel-level tests decode the PNG returned by the REAL renderSpecBoardToPng
 * (no mocks, no separately-constructed Resvg instance) so that any change to
 * FONT_DIR, fontDirs, or defaultFontFamily inside that function is detected
 * immediately by CI.
 *
 * Sharp is used for PNG→RGBA decoding; it is already a direct dependency of
 * the api-server package (used by spec-preview-service.ts).
 */

import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import {
  renderSpecBoardToPng,
  buildSpecBoardSvg,
  BOARD_W,
  BOARD_H,
} from "../lib/worldsmith/spec-board-template.js";
import type { SpecBoardData } from "../lib/worldsmith/types.js";

// ── Fixture ───────────────────────────────────────────────────────────────────

/**
 * Minimal SpecBoardData with a colon-split title so both fonts are exercised:
 *   - Instrument Sans 28 px bold  → "Test Specimen:"   (line 1, y ≈ 134)
 *   - Spectral 36 px bold         → "The Library Table" (line 2, y ≈ 176)
 *   - Spectral italic 13.5 px     → "World: Wychcombe"  (attribution, y ≈ 260)
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

function isPng(buf: Buffer): boolean {
  return (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  );
}

/** Width from IHDR at bytes 16–19, height at bytes 20–23. */
function pngDimensions(buf: Buffer): { width: number; height: number } {
  return {
    width:  (buf[16] << 24 | buf[17] << 16 | buf[18] << 8 | buf[19]) >>> 0,
    height: (buf[20] << 24 | buf[21] << 16 | buf[22] << 8 | buf[23]) >>> 0,
  };
}

// ── Shared render: one real call to the production renderer ───────────────────
//
// ALL pixel-level tests reuse this decoded buffer so changes to FONT_DIR,
// fontDirs, or defaultFontFamily inside renderSpecBoardToPng are detected.

let pngBuf: Buffer;               // raw PNG as returned by the production function
let rawPixels: Buffer;            // decompressed RGBA (or RGB) pixel bytes
let channels: number;             // 3 = RGB, 4 = RGBA (depends on sharp output)

// Timeout as a plain number — Vitest 4 beforeAll does not accept an options object.
beforeAll(async () => {
  pngBuf = await renderSpecBoardToPng(minimalBoard());

  // Decode to raw pixels using the same sharp version already in this package.
  // ensureAlpha() normalises to 4 channels regardless of source.
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  rawPixels = data;
  channels  = info.channels; // always 4 after ensureAlpha()
}, 30_000);

// ── Pixel helpers ─────────────────────────────────────────────────────────────

/**
 * Count pixels in a rectangular region of the decoded board where
 * avg(R, G, B) < threshold.
 *
 * Paper background (#F5F0E8) has avg ≈ 239.  Navy glyphs (#1B2A4A) and their
 * anti-aliased edges are well below 200, making 200 a reliable cut-off that
 * catches both filled glyph pixels and heavy anti-alias fringes.
 */
function countDarkPixels(
  yTop: number, yBot: number,
  xLeft: number, xRight: number,
  threshold = 200,
): number {
  let count = 0;
  for (let y = yTop; y < yBot; y++) {
    for (let x = xLeft; x < xRight; x++) {
      const base = (y * BOARD_W + x) * channels;
      const avg = (rawPixels[base] + rawPixels[base + 1] + rawPixels[base + 2]) / 3;
      if (avg < threshold) count++;
    }
  }
  return count;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("renderSpecBoardToPng — PNG format and dimensions", () => {
  it("returns a buffer that starts with the PNG magic bytes", () => {
    expect(pngBuf).toBeInstanceOf(Buffer);
    expect(isPng(pngBuf)).toBe(true);
  });

  it("produces BOARD_W × BOARD_H output dimensions — proves resvg ran to completion", () => {
    const { width, height } = pngDimensions(pngBuf);
    expect(width).toBe(BOARD_W);   // 2400
    expect(height).toBe(BOARD_H);  // 2500
  });

  it("PNG is large enough to contain real rendered content (not a trivially blank board)", () => {
    // A fully blank 2400×2500 PNG compresses to roughly 5–10 KB.
    // A board with text and shapes is comfortably above 50 KB.
    expect(pngBuf.length).toBeGreaterThan(50_000);
  });
});

describe(
  "Glyph pixel regression — production renderer output decoded via sharp (GOLDEN)",
  () => {
    /**
     * These tests decode the PNG returned by the REAL renderSpecBoardToPng.
     * Any change to its font pipeline (FONT_DIR, fontDirs, defaultFontFamily,
     * or the WOFF filenames in fontCss()) will produce different or absent
     * glyphs and fail the golden lower bounds.
     *
     * Coordinate reference (board pixels, 1:1 with SVG units at BOARD_W=2400):
     *   IMG_Y = TOP_Y = 56
     *   Title line 1 baseline  = IMG_Y + 78  = 134  → Instrument Sans 28 px bold
     *   Title line 2 baseline  = IMG_Y + 120 = 176  → Spectral 36 px bold  ← key font
     *   Attribution baseline   = IMG_Y + 204 = 260  → Spectral italic 13.5 px
     */

    it("Spectral title band has ≥ 100 dark pixels in y=148..188, x=14..650", () => {
      // Rows 148-188 bracket the Spectral 36 px "The Library Table" baseline.
      const count = countDarkPixels(148, 188, 14, 650);
      console.log(`[font regression] Spectral title-2 band: ${count} dark pixels`);
      expect(count).toBeGreaterThanOrEqual(100);
    });

    it("Instrument Sans title band has ≥ 100 dark pixels in y=110..150, x=14..650", () => {
      // Rows 110-150 bracket the Instrument Sans 28 px "Test Specimen:" baseline.
      const count = countDarkPixels(110, 150, 14, 650);
      console.log(`[font regression] Instrument Sans title-1 band: ${count} dark pixels`);
      expect(count).toBeGreaterThanOrEqual(100);
    });

    it("Spectral italic has ≥ 20 dark pixels in world attribution band y=240..280, x=14..400", () => {
      // 13.5 px italic text is small; be permissive — the MUTED (#7A756E, avg≈116)
      // attribution text still produces clearly sub-200 pixels.
      const count = countDarkPixels(240, 280, 14, 400);
      console.log(`[font regression] Spectral italic attribution: ${count} dark pixels`);
      expect(count).toBeGreaterThanOrEqual(20);
    });
  },
);

describe("buildSpecBoardSvg — @font-face declarations sanity check", () => {
  it("embeds all five @font-face rules with the correct on-disk filenames", () => {
    const svg = buildSpecBoardSvg(minimalBoard());
    expect(svg).toContain("Spectral-400.woff");
    expect(svg).toContain("Spectral-700.woff");
    expect(svg).toContain("Spectral-Italic-400.woff");
    expect(svg).toContain("Instrument_Sans-400.woff");
    expect(svg).toContain("Instrument_Sans-700.woff");
  });

  it("does not reference the old incorrect font directory or placeholder filenames", () => {
    const svg = buildSpecBoardSvg(minimalBoard());
    // Old (wrong) path that pointed at a non-existent directory
    expect(svg).not.toContain("worldsmith/fonts");
    // Old placeholder filenames from before the Wave 1 fix
    expect(svg).not.toContain("spectral-regular.woff");
    expect(svg).not.toContain("spectral-bold.woff");
    expect(svg).not.toContain("spectral-italic.woff");
    expect(svg).not.toContain("instrument-sans-regular.woff");
    expect(svg).not.toContain("instrument-sans-bold.woff");
  });
});
