import { describe, expect, it } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
} from "pdf-lib";
import {
  buildPdf,
  buildPreviewPdf,
  flattenPageIds,
  generatePageIds,
  getMonthGridOffset,
  getPlannerWeekStart,
  getWeekStartDate,
  type GeneratorConfig,
} from "../lib/pdf-generator";
import { DEFAULT_TEMPLATE } from "../lib/pdf-template";

function makeConfig(
  weekStart: "sun" | "mon",
  startYear = 2027,
  startMonth = 0,
  monthCount = 1,
): GeneratorConfig {
  return {
    setup: {
      startYear,
      startMonth,
      monthCount,
      weekStart,
      orientation: "vertical",
    },
    style: {},
    output: { calMode: "none", eventMins: 60, aiInPdf: false },
    sections: [],
  };
}

function ymd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function linkAnnotations(
  doc: PDFDocument,
  pageIndex: number,
): Array<{ rect: number[]; destination: PDFRef | null; uri: string | null }> {
  const page = doc.getPage(pageIndex);
  const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
  if (!annots) return [];

  return Array.from({ length: annots.size() }, (_, index) => {
    const raw = annots.get(index);
    const annot = raw instanceof PDFRef ? doc.context.lookup(raw, PDFDict) : raw as PDFDict;
    const rectArray = annot.lookup(PDFName.of("Rect"), PDFArray);
    const rect = Array.from({ length: rectArray.size() }, (_, i) =>
      (rectArray.get(i) as PDFNumber).asNumber(),
    );
    const dest = annot.lookupMaybe(PDFName.of("Dest"), PDFArray)?.get(0);
    const action = annot.lookupMaybe(PDFName.of("A"), PDFDict);
    const uriObject = action?.lookup(PDFName.of("URI"));
    const uri = uriObject instanceof PDFString
      ? uriObject.decodeText()
      : uriObject instanceof PDFName
        ? uriObject.asString().replace(/^\//, "")
          .replace(/#([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
        : null;
    return {
      rect,
      destination: dest instanceof PDFRef ? dest : null,
      uri,
    };
  });
}

describe("planner calendar correctness", () => {
  it("places the first of each month under its real weekday", () => {
    // January 1, 2027 is Friday.
    expect(getMonthGridOffset(2027, 0, "sun")).toBe(5);
    expect(getMonthGridOffset(2027, 0, "mon")).toBe(4);

    // February 1, 2027 is Monday.
    expect(getMonthGridOffset(2027, 1, "sun")).toBe(1);
    expect(getMonthGridOffset(2027, 1, "mon")).toBe(0);

    // August 1, 2027 is Sunday.
    expect(getMonthGridOffset(2027, 7, "sun")).toBe(0);
    expect(getMonthGridOffset(2027, 7, "mon")).toBe(6);

    // February 1, 2028 is Tuesday (and 2028 is a leap year).
    expect(getMonthGridOffset(2028, 1, "sun")).toBe(2);
    expect(getMonthGridOffset(2028, 1, "mon")).toBe(1);
  });

  it("walks backward to the selected week start instead of stopping at the month boundary", () => {
    const januaryFirst = new Date(2027, 0, 1);

    expect(ymd(getPlannerWeekStart(januaryFirst, "sun"))).toBe("2026-12-27");
    expect(ymd(getPlannerWeekStart(januaryFirst, "mon"))).toBe("2026-12-28");
  });

  it("generates distinct Sunday- and Monday-start weekly ranges that cover the full month", () => {
    const sundayMap = generatePageIds(makeConfig("sun"));
    const mondayMap = generatePageIds(makeConfig("mon"));
    const sundayStarts = sundayMap.weeklies.map((id) => getWeekStartDate(id, "sun"));
    const mondayStarts = mondayMap.weeklies.map((id) => getWeekStartDate(id, "mon"));

    expect(sundayStarts.every((date) => date?.getDay() === 0)).toBe(true);
    expect(mondayStarts.every((date) => date?.getDay() === 1)).toBe(true);
    expect(sundayMap.weeklies).not.toEqual(mondayMap.weeklies);

    expect(ymd(sundayStarts[0]!)).toBe("2026-12-27");
    expect(ymd(sundayStarts.at(-1)!)).toBe("2027-01-31");
    expect(ymd(mondayStarts[0]!)).toBe("2026-12-28");
    expect(ymd(mondayStarts.at(-1)!)).toBe("2027-01-25");

    const mondayFinalDay = new Date(mondayStarts.at(-1)!);
    mondayFinalDay.setDate(mondayFinalDay.getDate() + 6);
    expect(ymd(mondayFinalDay)).toBe("2027-01-31");
  });

  it("keeps weekly coverage correct across a year boundary", () => {
    for (const weekStart of ["sun", "mon"] as const) {
      const map = generatePageIds(makeConfig(weekStart, 2027, 11, 2));
      const starts = map.weeklies.map((id) => getWeekStartDate(id, weekStart));

      expect(starts.every((date) => date?.getDay() === (weekStart === "sun" ? 0 : 1))).toBe(true);
      expect(map.dailies).toContain("d20271231");
      expect(map.dailies).toContain("d20280101");

      const firstStart = starts[0]!;
      const lastEnd = new Date(starts.at(-1)!);
      lastEnd.setDate(lastEnd.getDate() + 6);
      expect(firstStart.getTime()).toBeLessThanOrEqual(new Date(2027, 11, 1).getTime());
      expect(lastEnd.getTime()).toBeGreaterThanOrEqual(new Date(2028, 0, 31).getTime());
    }
  });

  it.each(["sun", "mon"] as const)(
    "aligns the %s-start preview day label cell and link target in landscape",
    async (weekStart) => {
      const config = makeConfig(weekStart);
      config.setup.orientation = "landscape";
      config.style.renderStyle = "flat";
      const preview = await buildPreviewPdf(config);
      const doc = await PDFDocument.load(preview.buffer);
      const monthPage = doc.getPage(4);
      const dailyPage = doc.getPage(6);
      const dailyLink = linkAnnotations(doc, 4).find(
        (link) => link.destination?.objectNumber === dailyPage.ref.objectNumber,
      );
      expect(dailyLink).toBeDefined();

      const { width, height } = monthPage.getSize();
      const dayCells = DEFAULT_TEMPLATE.pages["month-calendar"]!.dayCells!;
      const offset = getMonthGridOffset(2027, 0, weekStart);
      const expectedX = ((dayCells.x_origin_pct + offset * dayCells.col_w_pct) / 100) * width;
      const expectedY = (dayCells.y_origin_pct / 100) * height - 2;
      expect(dailyLink!.rect[0]).toBeCloseTo(expectedX, 4);
      expect(dailyLink!.rect[1]).toBeCloseTo(expectedY, 4);
    },
    30_000,
  );

  it.each([
    ["sun", "20261227"],
    ["mon", "20261228"],
  ] as const)(
    "uses the selected %s week boundary in preview and full-PDF calendar links",
    async (weekStart, expectedStart) => {
      const config = makeConfig(weekStart);
      config.style.renderStyle = "flat";
      config.output.calMode = "link";
      const [preview, full] = await Promise.all([
        buildPreviewPdf(config),
        buildPdf(config),
      ]);

      const previewDoc = await PDFDocument.load(preview.buffer);
      const fullDoc = await PDFDocument.load(full.buffer);
      const firstPreviewUri = linkAnnotations(previewDoc, 5)
        .map((link) => link.uri)
        .find((uri) => uri?.includes("calendar.google.com"));
      const firstFullWeeklyPageIndex =
        3 + config.setup.monthCount * 2;
      const firstFullUri = linkAnnotations(fullDoc, firstFullWeeklyPageIndex)
        .map((link) => link.uri)
        .find((uri) => uri?.includes("calendar.google.com"));

      expect(firstPreviewUri).toContain(`dates=${expectedStart}`);
      expect(firstFullUri).toContain(`dates=${expectedStart}`);
    },
    60_000,
  );

  it("suppresses calendar URI annotations in poor-link device previews", async () => {
    const config = makeConfig("mon");
    config.style.renderStyle = "flat";
    config.output.calMode = "overlay";
    config.output.aiInPdf = true;

    const preview = await buildPreviewPdf(config, undefined, undefined, undefined, undefined, "kindle_scribe");
    const doc = await PDFDocument.load(preview.buffer);
    const uris = doc.getPages().flatMap((_, pageIndex) =>
      linkAnnotations(doc, pageIndex).flatMap((link) => link.uri ? [link.uri] : []),
    );

    expect(uris).toEqual([]);
  }, 30_000);

  it.each([
    ["sun", 2],
    ["mon", 1],
  ] as const)(
    "places leap day in the correct generated February 2028 grid for a %s start",
    async (weekStart, expectedColumn) => {
      const config = makeConfig(weekStart, 2028, 1);
      config.style.renderStyle = "flat";
      const result = await buildPdf(config);
      const doc = await PDFDocument.load(result.buffer);
      const flat = flattenPageIds(generatePageIds(config));
      const leapDayIndex = flat.indexOf("d20280229");
      expect(leapDayIndex).toBeGreaterThanOrEqual(0);

      const leapDayPage = doc.getPage(leapDayIndex);
      const leapDayLink = linkAnnotations(doc, flat.indexOf("m0")).find(
        (link) => link.destination?.objectNumber === leapDayPage.ref.objectNumber,
      );
      expect(leapDayLink).toBeDefined();

      const monthPage = doc.getPage(flat.indexOf("m0"));
      const { width, height } = monthPage.getSize();
      const dayCells = DEFAULT_TEMPLATE.pages["month-calendar"]!.dayCells!;
      const expectedX =
        ((dayCells.x_origin_pct + expectedColumn * dayCells.col_w_pct) / 100) * width;
      const expectedY =
        ((dayCells.y_origin_pct + 4 * dayCells.row_h_pct) / 100) * height - 2;
      expect(leapDayLink!.rect[0]).toBeCloseTo(expectedX, 4);
      expect(leapDayLink!.rect[1]).toBeCloseTo(expectedY, 4);
    },
    60_000,
  );
});