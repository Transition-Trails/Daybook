import { describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import {
  buildPdf,
  buildPreviewPdf,
  flattenPageIds,
  generatePageIds,
  selectPreviewPageIds,
  type BackgroundSpec,
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

// Fixed 1×1 PNG keeps this regression independent from image generation,
// calendars, fonts, and network availability.
const DETERMINISTIC_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

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

  it(
    "keeps representative retained pages equal for a branded color background",
    async () => {
      const config = {
        setup: {
          weekStart: "mon" as const,
          orientation: "vertical" as const,
          startMonth: 3,
          startYear: 2027,
          monthCount: 2,
        },
        style: {
          size: "A5" as const,
          renderStyle: "flat" as const,
          sections: ["Projects"],
        },
        output: { calMode: "none" as const, eventMins: 60 as const, aiInPdf: false },
        sections: ["Projects"],
      } satisfies GeneratorConfig;
      const themeColors = ["#ffffff", "#172033", "#d2694f", "#c7d2fe", "#1e1b4b", "#fafafa"];
      const background: BackgroundSpec = {
        type: "color",
        assetRef: "#f2c4b5",
      };
      const selectedIds = selectPreviewPageIds(config);
      const idsToCompare = [
        selectedIds[0],
        selectedIds.find((id) => id === "m0"),
        selectedIds.find((id) => id.startsWith("d")),
        selectedIds.find((id) => id === "notes"),
      ].filter((id): id is string => !!id);

      const [exportResult, previewResult, plainExportResult] = await Promise.all([
        buildPdf(config, themeColors, undefined, background),
        buildPreviewPdf(config, themeColors, undefined, background),
        buildPdf(config, themeColors),
      ]);
      const exportDocument = await PDFDocument.load(exportResult.buffer);
      const previewDocument = await PDFDocument.load(previewResult.buffer);
      const plainExportDocument = await PDFDocument.load(plainExportResult.buffer);

      expect(idsToCompare.length).toBe(4);
      expect(previewResult.pageCount).toBe(selectedIds.length);
      expect(previewDocument.getPageCount()).toBe(selectedIds.length);
      expect(exportDocument.getPageCount()).toBeGreaterThan(selectedIds.length);
      expect(exportResult.backgroundWarnings).toEqual([]);
      expect(previewResult.backgroundWarnings).toEqual([]);
      expect(pageContentBytes(exportDocument, 0)).not.toEqual(
        pageContentBytes(plainExportDocument, 0),
      );

      idsToCompare.forEach((pageId) => {
        const exportIndex = exportPageIndex(config, pageId);
        const actualPreviewIndex = selectedIds.indexOf(pageId);
        expect(exportIndex, `missing export page for ${pageId}`).toBeGreaterThanOrEqual(0);
        expect(actualPreviewIndex, `missing preview page for ${pageId}`).toBeGreaterThanOrEqual(0);
        expect(previewDocument.getPage(actualPreviewIndex).getSize()).toEqual(
          exportDocument.getPage(exportIndex).getSize(),
        );
        expect(pageContentBytes(previewDocument, actualPreviewIndex)).toEqual(
          pageContentBytes(exportDocument, exportIndex),
        );
      });
    },
    120_000,
  );

  it(
    "keeps representative retained pages equal for an image background",
    async () => {
      const config = {
        setup: {
          weekStart: "mon" as const,
          orientation: "vertical" as const,
          startMonth: 3,
          startYear: 2027,
          monthCount: 2,
        },
        style: {
          size: "A5" as const,
          renderStyle: "flat" as const,
          sections: ["Projects"],
        },
        output: { calMode: "none" as const, eventMins: 60 as const, aiInPdf: false },
        sections: ["Projects"],
      } satisfies GeneratorConfig;
      const themeColors = ["#ffffff", "#172033", "#d2694f", "#c7d2fe", "#1e1b4b", "#fafafa"];
      const background: BackgroundSpec = {
        type: "image",
        assetRef: DETERMINISTIC_PNG_DATA_URL,
      };
      const selectedIds = selectPreviewPageIds(config);
      const idsToCompare = [
        selectedIds[0],
        selectedIds.find((id) => id === "m0"),
        selectedIds.find((id) => id.startsWith("d")),
        selectedIds.find((id) => id === "notes"),
      ].filter((id): id is string => !!id);

      const [exportResult, previewResult, plainExportResult] = await Promise.all([
        buildPdf(config, themeColors, undefined, background),
        buildPreviewPdf(config, themeColors, undefined, background),
        buildPdf(config, themeColors),
      ]);
      const exportDocument = await PDFDocument.load(exportResult.buffer);
      const previewDocument = await PDFDocument.load(previewResult.buffer);
      const plainExportDocument = await PDFDocument.load(plainExportResult.buffer);

      expect(idsToCompare.length).toBe(4);
      expect(previewResult.pageCount).toBe(selectedIds.length);
      expect(previewDocument.getPageCount()).toBe(selectedIds.length);
      expect(exportDocument.getPageCount()).toBeGreaterThan(selectedIds.length);
      expect(pageContentBytes(exportDocument, 0)).not.toEqual(
        pageContentBytes(plainExportDocument, 0),
      );

      idsToCompare.forEach((pageId) => {
        const exportIndex = exportPageIndex(config, pageId);
        const actualPreviewIndex = selectedIds.indexOf(pageId);
        expect(exportIndex, `missing export page for ${pageId}`).toBeGreaterThanOrEqual(0);
        expect(actualPreviewIndex, `missing preview page for ${pageId}`).toBeGreaterThanOrEqual(0);
        expect(previewDocument.getPage(actualPreviewIndex).getSize()).toEqual(
          exportDocument.getPage(exportIndex).getSize(),
        );
        expect(pageContentBytes(previewDocument, actualPreviewIndex)).toEqual(
          pageContentBytes(exportDocument, exportIndex),
        );
      });
    },
    120_000,
  );

  it(
    "falls back to the configured paper fill when an image background is malformed",
    async () => {
      const config = {
        setup: {
          weekStart: "mon" as const,
          orientation: "vertical" as const,
          startMonth: 3,
          startYear: 2027,
          monthCount: 2,
        },
        style: {
          size: "A5" as const,
          renderStyle: "flat" as const,
          paperColour: "ivory" as const,
          sections: ["Projects"],
        },
        output: { calMode: "none" as const, eventMins: 60 as const, aiInPdf: false },
        sections: ["Projects"],
      } satisfies GeneratorConfig;
      const themeColors = ["#d2694f", "#172033", "#ffffff", "#c7d2fe", "#1e1b4b", "#fafafa"];
      const malformedBackground: BackgroundSpec = {
        id: "bg-broken-garden",
        name: "Broken Garden Texture",
        type: "image",
        assetRef: "data:image/png;base64,not-a-valid-png",
      };
      const missingTexture: BackgroundSpec = {
        id: "bg-missing-linen",
        name: "Missing Linen",
        type: "texture",
        assetRef: null,
      };
      const selectedIds = selectPreviewPageIds(config);

      const [exportResult, previewResult, plainExportResult, missingTextureResult] = await Promise.all([
        buildPdf(config, themeColors, undefined, malformedBackground),
        buildPreviewPdf(config, themeColors, undefined, malformedBackground),
        buildPdf(config, themeColors),
        buildPdf(config, themeColors, undefined, missingTexture),
      ]);
      const exportDocument = await PDFDocument.load(exportResult.buffer);
      const previewDocument = await PDFDocument.load(previewResult.buffer);
      const plainExportDocument = await PDFDocument.load(plainExportResult.buffer);

      expect(selectedIds.length).toBeGreaterThan(0);
      expect(previewResult.pageCount).toBe(selectedIds.length);
      expect(previewDocument.getPageCount()).toBe(selectedIds.length);
      expect(exportDocument.getPageCount()).toBeGreaterThan(selectedIds.length);
      expect(exportResult.backgroundWarnings).toEqual([{
        backgroundId: "bg-broken-garden",
        backgroundName: "Broken Garden Texture",
        backgroundType: "image",
        reason: "embed_failed",
      }]);
      expect(previewResult.backgroundWarnings).toEqual(exportResult.backgroundWarnings);
      expect(missingTextureResult.backgroundWarnings).toEqual([{
        backgroundId: "bg-missing-linen",
        backgroundName: "Missing Linen",
        backgroundType: "texture",
        reason: "missing_asset",
      }]);
      expect(plainExportResult.backgroundWarnings).toEqual([]);
      expect(pageContentBytes(exportDocument, 0)).toEqual(
        pageContentBytes(plainExportDocument, 0),
      );

      selectedIds.forEach((pageId, previewIndex) => {
        const exportIndex = exportPageIndex(config, pageId);
        expect(exportIndex, `missing export page for ${pageId}`).toBeGreaterThanOrEqual(0);
        expect(pageContentBytes(previewDocument, previewIndex)).toEqual(
          pageContentBytes(exportDocument, exportIndex),
        );
        expect(pageContentBytes(previewDocument, previewIndex)).toEqual(
          pageContentBytes(plainExportDocument, exportIndex),
        );
      });
    },
    120_000,
  );
});
