import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFName } from "pdf-lib";
import { buildInteriorPdf, expandPlannerInterior } from "../lib/planner-interior-renderer";
import { sanitizeSvg, SvgContractError, validateInteriorDefinition } from "../lib/svg-contract";

const manifest = {
  trim: { w: 148, h: 210, unit: "mm" as const },
  pages: [
    { template: "index", once: true as const },
    { template: "month", repeat: { over: "months" as const, from: "2027-01", to: "2027-02" } },
    { template: "home", once: true as const },
  ],
};

const assets = {
  index: `<svg viewBox="0 0 148 210"><rect id="zone:link:month:1" x="10" y="10" width="40" height="20" fill="#ABC"/><text id="slot:text:year" x="10" y="50" fill="#123456">Year</text></svg>`,
  month: `<svg viewBox="0 0 148 210"><rect id="zone:link:index" x="10" y="10" width="30" height="20" fill="#abcdef"/><text id="slot:text:month" x="10" y="50" fill="#123456">Month</text></svg>`,
  home: `<svg viewBox="0 0 148 210"><rect id="zone:link:index" x="10" y="10" width="30" height="20" fill="#abcdef"/></svg>`,
};

describe("planner interior SVG contract", () => {
  it("expands repeating pages and resolves symbolic links deterministically", () => {
    const pages = expandPlannerInterior(manifest, assets);
    expect(pages).toHaveLength(4);
    expect(pages[1].slotValues.month).toBe("January");
    expect(pages[2].slotValues.month).toBe("February");
    expect(pages[0].resolvedLinks[0].targetIndex).toBe(1);
    expect(pages[1].resolvedLinks[0].targetIndex).toBe(0);
  });

  it("rejects unsafe SVG instead of repairing an authored interior silently", () => {
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><script>alert(1)</script></svg>`,
    })).toThrow(SvgContractError);
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><image href="https://example.com/x.png"/></svg>`,
    })).toThrow("not allowed");
  });

  it("uses the shared sanitizer for external SVG attack surfaces", () => {
    const sanitized = sanitizeSvg(`<svg onload="alert(1)"><script>alert(1)</script><image href="https://example.com/a.svg"/><use href=https://example.com/b.svg/><rect fill="url(https://example.com/pattern.svg)"/></svg>`);
    expect(sanitized).not.toMatch(/script|onload|https:\/\/example\.com|url\(/i);
  });

  it("rejects SVG features and paint values the vector renderer cannot reproduce", () => {
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><rect transform="translate(10 10)" x="0" y="0" width="10" height="10"/></svg>`,
    })).toThrow("transform");
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><g><rect x="0" y="0" width="10" height="10"/></g></svg>`,
    })).toThrow("not allowed");
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><rect x="0" y="0" width="10" height="10" fill="red"/></svg>`,
    })).toThrow("Unsupported SVG colour");
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><rect x="0" y="0" width="10" height="10" opacity="0"/></svg>`,
    })).toThrow("attribute");
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><rect x="0" y="0" width="10" height="10" rx="2"/></svg>`,
    })).toThrow("attribute");
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><rect x="0" y="0" width="10" height="10" style="stroke-dasharray: 2 2"/></svg>`,
    })).toThrow("style");
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210" fill="#123456"><rect x="0" y="0" width="10" height="10"/></svg>`,
    })).toThrow("attribute");
    expect(() => validateInteriorDefinition(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><line x1="0" y1="0" x2="10" y2="10" fill="#123456"/></svg>`,
    })).toThrow("fill");
  });

  it("creates vector pages and stamps in-bounds internal annotations", async () => {
    const result = await buildInteriorPdf(manifest, {
      ...assets,
      month: `<svg viewBox="0 0 148 210"><polygon points="10,70 30,70 20,90" fill="#abcdef"/><rect id="zone:link:index" x="10" y="10" width="30" height="20" fill="#abcdef"/><text id="slot:text:month" x="10" y="50" font-family="Lato" font-weight="700" fill="#123456">Month</text></svg>`,
    }, { title: "2027 Planner" });
    expect(result.pageCount).toBe(4);
    expect(result.totalLinkAnnotations).toBe(4);
    const pdf = await PDFDocument.load(result.buffer);
    expect(pdf.getPageCount()).toBe(4);
    for (const page of pdf.getPages()) {
      const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
      if (!annotations) continue;
      expect(annotations.size()).toBeGreaterThan(0);
    }
  });

  it("uses monochrome device trim for an e-ink interior export", async () => {
    const result = await buildInteriorPdf(manifest, {
      ...assets,
      index: `<svg viewBox="0 0 148 210"><rect x="0" y="0" width="148" height="210" fill="#F8F6F1"/><text x="10" y="50" fill="#1B2A4A">Dark ink</text></svg>`,
    }, { einkDevice: "kindle_scribe" });
    const pdf = await PDFDocument.load(result.buffer);
    expect(pdf.getPageCount()).toBe(4);
    expect(pdf.getPage(0).getSize()).toEqual({ width: 446, height: 595 });
    expect(result.buffer.byteLength).toBeGreaterThan(1_000);
  });

  it("keeps the authored trim while supporting generic ink-friendly output", async () => {
    const result = await buildInteriorPdf(manifest, assets, { inkFriendly: true });
    const pdf = await PDFDocument.load(result.buffer);
    expect(pdf.getPage(0).getSize()).toEqual({
      width: 148 * 72 / 25.4,
      height: 210 * 72 / 25.4,
    });
  });

  it("preserves authored once-page text until a global planner value is supplied", async () => {
    const fallback = await buildInteriorPdf(manifest, assets);
    const supplied = await buildInteriorPdf(manifest, assets, { year: 2031 });
    expect(fallback.buffer.byteLength).toBeGreaterThan(1_000);
    expect(supplied.buffer.byteLength).toBeGreaterThan(1_000);
    expect(expandPlannerInterior(manifest, assets)[0].slotValues).toEqual({});
  });
});