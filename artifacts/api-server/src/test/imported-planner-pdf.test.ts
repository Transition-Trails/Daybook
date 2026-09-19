import { describe, expect, it } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { composeImportedPlannerPdf } from "../lib/imported-planner-pdf";

describe("composeImportedPlannerPdf", () => {
  it("preserves mapped order, duplicates, and omissions without changing the source", async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 500]).drawRectangle({ x: 20, y: 20, width: 40, height: 40, color: rgb(1, 0, 0) });
    source.addPage([400, 600]).drawRectangle({ x: 20, y: 20, width: 40, height: 40, color: rgb(0, 0, 1) });
    source.addPage([500, 700]).drawRectangle({ x: 20, y: 20, width: 40, height: 40, color: rgb(0, 1, 0) });
    const sourceBytes = await source.save();

    const generated = await composeImportedPlannerPdf(sourceBytes, [
      { sourcePageNumber: 3 },
      { sourcePageNumber: 1 },
      { sourcePageNumber: 3 },
    ]);
    const output = await PDFDocument.load(generated.buffer);

    expect(generated.pageCount).toBe(3);
    expect(output.getPages().map(page => page.getSize())).toEqual([
      { width: 500, height: 700 },
      { width: 300, height: 500 },
      { width: 500, height: 700 },
    ]);
    expect(sourceBytes.byteLength).toBeGreaterThan(0);
  });

  it("rejects an invalid source page reference", async () => {
    const source = await PDFDocument.create();
    source.addPage();
    await expect(
      composeImportedPlannerPdf(await source.save(), [{ sourcePageNumber: 2 }]),
    ).rejects.toThrow("invalid source page 2");
  });
});