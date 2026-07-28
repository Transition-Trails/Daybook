/**
 * Regression suite — Cricut cut-path alignment with shadow padding (#41).
 *
 * When a sticker has a drop shadow the exported PNG is LARGER than the
 * pre-shadow image: addDropShadow expands the canvas by `pad` pixels on every
 * side.  The SVG cut path must be translated and its viewBox widened to match
 * the final PNG dimensions, otherwise the cut contour and the printed artwork
 * disagree in Cricut Design Space and the machine cuts offset.
 */
import { describe, it, expect } from "vitest";
import {
  shadowExpansionPad,
  adjustCutlineSvgForShadow,
} from "../lib/imageProcessing.js";

// ── Helper: build a minimal cutline SVG matching generateCutlineSvg output ───

function makeSvg(w: number, h: number): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `  viewBox="0 0 ${w} ${h}"`,
    `  width="${w}px" height="${h}px">`,
    `  <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z" fill="none" stroke="#000000" stroke-width="1"/>`,
    `</svg>`,
  ].join("\n");
}

const STYLES = ["flat", "soft", "lifted", "cut-paper"] as const;

// ── shadowExpansionPad ────────────────────────────────────────────────────────

describe("shadowExpansionPad", () => {
  it.each(STYLES)("returns a positive integer for style=%s", (style) => {
    const pad = shadowExpansionPad(style);
    expect(pad).toBeGreaterThan(0);
    expect(Number.isInteger(pad)).toBe(true);
  });

  it("matches the addDropShadow formula exactly for soft/liftPx=4 (known value)", () => {
    // soft: blurRadius=8, offX=4, pad = 8*2 + max(4,4) + 4 = 24
    expect(shadowExpansionPad("soft", 4)).toBe(24);
  });

  it("matches the addDropShadow formula exactly for lifted/liftPx=10 (known value)", () => {
    // lifted: blurRadius=12, offX=round(10*1.5)=15, pad = 12*2 + 15 + 4 = 43
    expect(shadowExpansionPad("lifted", 10)).toBe(43);
  });

  it("produces a larger pad for lifted than flat at the same liftPx", () => {
    expect(shadowExpansionPad("lifted", 10)).toBeGreaterThan(
      shadowExpansionPad("flat", 10),
    );
  });
});

// ── adjustCutlineSvgForShadow — viewBox expansion ────────────────────────────

describe("adjustCutlineSvgForShadow — viewBox", () => {
  it.each(STYLES)(
    "expands viewBox by exactly 2×pad on each axis for style=%s",
    (style) => {
      const origW = 200, origH = 150, liftPx = 6;
      const pad   = shadowExpansionPad(style, liftPx);
      const out   = adjustCutlineSvgForShadow(makeSvg(origW, origH), style, liftPx);

      expect(out).toContain(`viewBox="0 0 ${origW + pad * 2} ${origH + pad * 2}"`);
    },
  );

  it.each(STYLES)(
    "updates width and height px attributes for style=%s",
    (style) => {
      const origW = 200, origH = 150, liftPx = 6;
      const pad   = shadowExpansionPad(style, liftPx);
      const out   = adjustCutlineSvgForShadow(makeSvg(origW, origH), style, liftPx);

      expect(out).toContain(`width="${origW + pad * 2}px"`);
      expect(out).toContain(`height="${origH + pad * 2}px"`);
    },
  );

  it("viewBox matches the exact addDropShadow canvas size (soft/liftPx=4)", () => {
    // pad = 24; 100+48=148, 80+48=128
    const out = adjustCutlineSvgForShadow(makeSvg(100, 80), "soft", 4);
    expect(out).toContain(`viewBox="0 0 148 128"`);
    expect(out).toContain(`width="148px"`);
    expect(out).toContain(`height="128px"`);
  });
});

// ── adjustCutlineSvgForShadow — path translation ─────────────────────────────

describe("adjustCutlineSvgForShadow — path translation", () => {
  it.each(STYLES)(
    "wraps the path in translate(pad,pad) group for style=%s",
    (style) => {
      const pad = shadowExpansionPad(style, 6);
      const out = adjustCutlineSvgForShadow(makeSvg(200, 150), style, 6);

      expect(out).toContain(`transform="translate(${pad},${pad})"`);
    },
  );

  it("the original path data is preserved inside the group", () => {
    const out = adjustCutlineSvgForShadow(makeSvg(200, 150), "soft", 4);

    expect(out).toContain(
      `d="M 10 10 L 90 10 L 90 90 L 10 90 Z"`,
    );
    // Group opens before path, closes before </svg>
    expect(out.indexOf(`<g transform=`)).toBeLessThan(out.indexOf(`<path `));
    expect(out).toContain(`</g>`);
  });
});

// ── Alignment invariant ───────────────────────────────────────────────────────

describe("cut-path / PNG alignment invariant", () => {
  /**
   * Core correctness check: the artwork occupies origW×origH pixels starting
   * at pixel (pad, pad) in the final PNG.  The translated cut path must also
   * start at (pad, pad) in the expanded SVG coordinate space.
   *
   * We verify this by confirming the translate matches the pad used to compute
   * the viewBox expansion — both derived from the same shadowExpansionPad call.
   */
  it.each(STYLES)(
    "cut-path origin matches artwork origin in final PNG for style=%s",
    (style) => {
      const liftPx = 8;
      const pad    = shadowExpansionPad(style, liftPx);
      const out    = adjustCutlineSvgForShadow(makeSvg(300, 250), style, liftPx);

      // The translate value in the SVG must equal pad
      const translateMatch = out.match(/translate\((\d+),(\d+)\)/);
      expect(translateMatch).not.toBeNull();
      expect(Number(translateMatch![1])).toBe(pad);
      expect(Number(translateMatch![2])).toBe(pad);

      // The viewBox new origin is still (0,0) — the artwork is shifted by the group transform
      expect(out).toContain(`viewBox="0 0 `);
      expect(out).not.toContain(`viewBox="${pad}`);
    },
  );
});
