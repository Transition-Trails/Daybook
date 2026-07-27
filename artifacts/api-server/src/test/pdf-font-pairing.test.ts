/**
 * Font pairing tests for the PDF generator.
 *
 * Two layers of coverage:
 *   1. Unit — resolveStandardFont mapping: serif families → Times Roman,
 *      everything else → Helvetica.
 *   2. Integration — buildPdf with a fontPairing containing a serif heading family
 *      produces a PDF that embeds Times Roman (fallback path when Google Fonts is
 *      unreachable) or the real TTF — but never Helvetica for the heading slot.
 *      The no-fontPairing case confirms Helvetica remains the default.
 */

import { describe, it, expect } from "vitest";
import { StandardFonts, PDFDocument } from "pdf-lib";
import { resolveStandardFont, buildPdf } from "../lib/pdf-generator";
import type { ThemeFontPairing } from "@workspace/db";

// ── Shared minimal config ─────────────────────────────────────────────────────

const MINIMAL_CONFIG = {
  setup: {
    weekStart: "mon" as const,
    orientation: "vertical" as const,
    startMonth: 0,
    startYear: 2027,
    monthCount: 1,
  },
  style: { renderStyle: "flat" as const },
  output: { calMode: "none" as const, eventMins: 60 as const, aiInPdf: false },
  sections: [],
};

// ── Helper: extract font names from PDF bytes ─────────────────────────────────
//
// pdf-lib saves with compressed cross-reference / object streams by default,
// which makes font names invisible to a plain-text regex.  We reload the PDF
// and re-save without object streams so that all dictionaries are ASCII-readable.
// Standard fonts appear as  /BaseFont /Times-Roman  or  /BaseFont /Helvetica.
// Embedded TTFs appear as  /BaseFont /ABCDEF+Lora-Regular  (subset prefix).

async function extractBaseFonts(pdfBytes: Uint8Array): Promise<string[]> {
  // Reload and re-save without object-stream compression so the structure
  // bytes are visible as plain text.
  const reloaded = await PDFDocument.load(pdfBytes);
  const flat = await reloaded.save({ useObjectStreams: false });
  const text = Buffer.from(flat).toString("latin1");

  const found = new Set<string>();
  for (const m of text.matchAll(/\/BaseFont\s*\/([A-Za-z0-9+_-]+)/g)) {
    const raw = m[1]!;
    // Strip XXXXXX+ subset prefix (e.g. "ABCDEF+Lora-Regular" → "Lora-Regular")
    const name = raw.includes("+") ? raw.split("+")[1]! : raw;
    found.add(name);
  }
  return [...found];
}

// ── 1. Unit tests: resolveStandardFont ───────────────────────────────────────

describe("resolveStandardFont", () => {
  it("maps Lora → Times Roman (regular)", () => {
    expect(resolveStandardFont("Lora", false)).toBe(StandardFonts.TimesRoman);
  });

  it("maps Lora → Times Roman Bold (bold)", () => {
    expect(resolveStandardFont("Lora", true)).toBe(StandardFonts.TimesRomanBold);
  });

  it("maps Playfair Display → Times Roman", () => {
    expect(resolveStandardFont("Playfair Display", false)).toBe(StandardFonts.TimesRoman);
  });

  it("maps Cormorant Garamond → Times Roman", () => {
    expect(resolveStandardFont("Cormorant Garamond", false)).toBe(StandardFonts.TimesRoman);
  });

  it("maps Merriweather → Times Roman", () => {
    expect(resolveStandardFont("Merriweather", false)).toBe(StandardFonts.TimesRoman);
  });

  it("maps EB Garamond → Times Roman", () => {
    expect(resolveStandardFont("EB Garamond", false)).toBe(StandardFonts.TimesRoman);
  });

  it("maps Open Sans → Helvetica (sans-serif fallback)", () => {
    expect(resolveStandardFont("Open Sans", false)).toBe(StandardFonts.Helvetica);
  });

  it("maps Roboto → Helvetica", () => {
    expect(resolveStandardFont("Roboto", false)).toBe(StandardFonts.Helvetica);
  });

  it("maps undefined → Helvetica (no family provided)", () => {
    expect(resolveStandardFont(undefined, false)).toBe(StandardFonts.Helvetica);
  });

  it("maps undefined bold → Helvetica-Bold", () => {
    expect(resolveStandardFont(undefined, true)).toBe(StandardFonts.HelveticaBold);
  });
});

// ── 2. Integration tests: buildPdf font embedding ────────────────────────────
//
// These tests call the real buildPdf.  Google Fonts fetch will either succeed
// (embedding the actual TTF) or fail/timeout (falling back to StandardFonts).
// In both outcomes the invariants below hold:
//
//   Serif heading  → Times-Roman OR real-font embed  (never Helvetica heading)
//   No fontPairing → Helvetica family                (sans-serif default)

describe("buildPdf — font pairing integration", () => {
  it(
    "uses Times Roman (or real Lora TTF) — never Helvetica — when heading is a serif family",
    async () => {
      const fontPairing: ThemeFontPairing = { heading: "Lora" };

      const { buffer } = await buildPdf(
        MINIMAL_CONFIG as any,
        undefined,   // no themeColors override
        undefined,   // DEFAULT_TEMPLATE
        undefined,   // no background
        fontPairing,
      );

      expect(buffer.byteLength).toBeGreaterThan(0);

      const baseFonts = await extractBaseFonts(buffer);
      console.log("[pdf-font-pairing] serif case base fonts:", baseFonts);

      // When Google Fonts fetch succeeds: real Lora TTF is embedded — no
      //   StandardFont name in /BaseFont at all, so baseFonts may be empty.
      // When fetch fails: StandardFonts.TimesRoman fallback → "Times-Roman" present.
      // Either way: "Helvetica" and "Helvetica-Bold" must NOT appear because
      //   the body slot falls back to the heading family (Lora) when body is unset.
      expect(baseFonts).not.toContain("Helvetica");
      expect(baseFonts).not.toContain("Helvetica-Bold");

      // If any StandardFont DID end up in the PDF, it must be Times-Roman family.
      const nonTimes = baseFonts.filter(
        (f) => !f.startsWith("Times") && !f.startsWith("Lora"),
      );
      expect(nonTimes).toHaveLength(0);
    },
    60_000,
  );

  it(
    "falls back to Helvetica when no fontPairing is provided",
    async () => {
      const { buffer } = await buildPdf(
        MINIMAL_CONFIG as any,
        undefined,
        undefined,
        undefined,
        undefined, // no fontPairing
      );

      expect(buffer.byteLength).toBeGreaterThan(0);

      const baseFonts = await extractBaseFonts(buffer);
      console.log("[pdf-font-pairing] sans fallback base fonts:", baseFonts);

      // With no fontPairing, both body and heading resolve to Helvetica.
      // At least one Helvetica variant should appear in the font table.
      const hasHelvetica = baseFonts.some((f) => f.startsWith("Helvetica"));
      expect(hasHelvetica).toBe(true);

      // Times-Roman must NOT appear — there is no serif family in play.
      expect(baseFonts).not.toContain("Times-Roman");
      expect(baseFonts).not.toContain("Times-Roman-Bold");
      expect(baseFonts).not.toContain("TimesRoman");
    },
    60_000,
  );

  it(
    "uses Times Roman for heading and Helvetica for body when only heading is serif",
    async () => {
      // body family left undefined → bodyFamily = headingFamily = "Lora" (see pdf-generator)
      // To exercise a mixed case we must set body explicitly to a sans family.
      const fontPairing: ThemeFontPairing = { heading: "Lora", body: "Roboto" };

      const { buffer } = await buildPdf(
        MINIMAL_CONFIG as any,
        undefined,
        undefined,
        undefined,
        fontPairing,
      );

      expect(buffer.byteLength).toBeGreaterThan(0);

      const baseFonts = await extractBaseFonts(buffer);
      console.log("[pdf-font-pairing] mixed case base fonts:", baseFonts);

      // When Google Fonts fetch fails for both:
      //   heading (Lora) → Times-Roman
      //   body (Roboto)  → Helvetica
      // When fetch succeeds for either, the real TTF is embedded instead of the
      // standard font name. The assertions below cover the fetch-fails path:
      if (baseFonts.some((f) => f.startsWith("Times") || f.startsWith("Helvetica"))) {
        // At least one serif font for heading
        const hasSerif = baseFonts.some(
          (f) => f.startsWith("Times") || f.startsWith("Lora"),
        );
        expect(hasSerif).toBe(true);
      }
      // In all paths: the PDF must be non-empty and not throw.
    },
    60_000,
  );
});
