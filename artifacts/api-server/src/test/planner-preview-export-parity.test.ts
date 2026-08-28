import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import {
  buildPdf,
  buildPreviewPdf,
  flattenPageIds,
  generatePageIds,
  selectPreviewPageIds,
  type GeneratorConfig,
} from "../lib/pdf-generator";

function pageContentBytes(document: PDFDocument, pageIndex: number): Buffer {
  const contents = document.getPage(pageIndex).node.Contents();
  const objects =
    contents instanceof PDFArray
      ? contents.asArray()
      : contents
        ? [contents]
        : [];
  return Buffer.concat(
    objects.map((object) => {
      const stream = document.context.lookup(object);
      return stream instanceof PDFRawStream
        ? Buffer.from(stream.getContents())
        : Buffer.from(String(stream));
    }),
  );
}

function exportPageIndex(config: GeneratorConfig, pageId: string): number {
  return flattenPageIds(generatePageIds(config)).indexOf(pageId);
}

describe("planner preview/export visual parity", () => {
  it.each([
    {
      name: "standard planner",
      config: {
        setup: {
          weekStart: "mon",
          orientation: "vertical",
          startMonth: 0,
          startYear: 2027,
          monthCount: 2,
        },
        style: {
          size: "A5",
          renderStyle: "flat",
          sections: ["Projects"],
        },
        output: { calMode: "none", eventMins: 60, aiInPdf: false },
        sections: ["Projects"],
      } satisfies GeneratorConfig,
      themeColors: ["#ffffff", "#172033", "#d2694f"],
      einkDevice: undefined,
    },
    {
      name: "Kindle Scribe e-ink planner",
      config: {
        setup: {
          weekStart: "sun",
          orientation: "landscape",
          startMonth: 1,
          startYear: 2028,
          monthCount: 2,
        },
        style: {
          size: "Letter",
          renderStyle: "realistic",
          sections: ["Journal", "Notes"],
        },
        output: {
          calMode: "none",
          eventMins: 30,
          aiInPdf: false,
          inkFriendly: true,
        },
        sections: ["Journal", "Notes"],
      } satisfies GeneratorConfig,
      themeColors: [
        "#d2694f",
        "#172033",
        "#ffffff",
        "#c7d2fe",
        "#1e1b4b",
        "#fafafa",
      ],
      einkDevice: "kindle_scribe",
    },
  ])(
    "$name keeps every selected preview page equal to its export source",
    async ({ config, themeColors, einkDevice }) => {
      const selectedIds = selectPreviewPageIds(config);
      const exportResult = await buildPdf(
        config,
        themeColors,
        undefined,
        undefined,
        undefined,
        undefined,
        !!config.output.inkFriendly,
        einkDevice,
      );
      const previewResult = await buildPreviewPdf(
        config,
        themeColors,
        undefined,
        undefined,
        undefined,
        einkDevice,
      );
      const exportDocument = await PDFDocument.load(exportResult.buffer);
      const previewDocument = await PDFDocument.load(previewResult.buffer);

      expect(selectedIds.length).toBeGreaterThan(0);
      expect(previewResult.pageCount).toBe(selectedIds.length);
      expect(previewDocument.getPageCount()).toBe(selectedIds.length);
      expect(exportDocument.getPageCount()).toBeGreaterThan(selectedIds.length);

      selectedIds.forEach((pageId, previewIndex) => {
        const exportIndex = exportPageIndex(config, pageId);
        expect(
          exportIndex,
          `missing export page for ${pageId}`,
        ).toBeGreaterThanOrEqual(0);
        expect(previewDocument.getPage(previewIndex).getSize()).toEqual(
          exportDocument.getPage(exportIndex).getSize(),
        );
        expect(pageContentBytes(previewDocument, previewIndex)).toEqual(
          pageContentBytes(exportDocument, exportIndex),
        );
      });
    },
    120_000,
  );
});
