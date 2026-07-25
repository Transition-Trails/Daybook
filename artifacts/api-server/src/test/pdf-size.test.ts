import { describe, it } from "vitest";
import { buildPdf } from "../lib/pdf-generator";

// Tests buildPdf (full generator) — this is the path that includes realistic overlays.
// buildPreviewPdf is a lightweight 8-page sample and does NOT have the realistic path.
describe("PDF size: realistic vs flat", () => {
  it("measures overlay overhead on a 13-month full build", async () => {
    const base = {
      setup: { weekStart: "mon" as const, orientation: "vertical" as const, startMonth: 0, startYear: 2027, monthCount: 13 },
      style: {},
      output: { calMode: "none" as const, eventMins: 60 as const, aiInPdf: false },
      sections: [],
    };

    const t0f = Date.now();
    const { buffer: flatBuf, pageCount } = await buildPdf({ ...base, style: { renderStyle: "flat" } } as any);
    const flatMs = Date.now() - t0f;

    const t0r = Date.now();
    const { buffer: realBuf } = await buildPdf({ ...base, style: { renderStyle: "realistic" } } as any);
    const realMs = Date.now() - t0r;

    console.log(`\nPDF SIZE REPORT — full build, ${pageCount} pages`);
    console.log(`  Flat:      ${(flatBuf.byteLength / 1024).toFixed(1)} KB  (${flatMs}ms)`);
    console.log(`  Realistic: ${(realBuf.byteLength / 1024).toFixed(1)} KB  (${realMs}ms)`);
    console.log(`  Overhead:  +${((realBuf.byteLength - flatBuf.byteLength) / 1024).toFixed(1)} KB  (+${(((realBuf.byteLength / flatBuf.byteLength) - 1) * 100).toFixed(1)}%)`);
    console.log(`  3 overlays: gutter (dark strip) + grain (128×128 noise) + ring art (landscape only — N/A on vertical)`);
  }, 120_000);
});
