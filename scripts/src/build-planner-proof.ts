/**
 * Build and machine-check the 2027 planner proof set.
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run proof:planner
 *
 * All assertions run against the serialized PDFs before any proof file is
 * emitted. A failed proof therefore leaves no new partial set for inspection.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

type WeekStart = "sun" | "mon";
type Orientation = "vertical" | "landscape";
type ProofConfig = {
  setup: {
    startYear: number;
    startMonth: number;
    monthCount: number;
    weekStart: WeekStart;
    orientation: Orientation;
    datingMode: "dated";
  };
  style: Record<string, unknown>;
  output: {
    calMode: "link";
    eventMins: 60;
    aiInPdf: false;
  };
  sections: string[];
};
type PageIdMap = {
  monthCalendars: string[];
  weeklies: string[];
  dailies: string[];
};
type GeneratorModule = {
  buildPdf(
    config: ProofConfig,
    themeColors?: string[],
    template?: unknown,
    background?: unknown,
    fontPairing?: unknown,
    hotspots?: unknown,
    inkFriendly?: boolean,
    einkDevice?: string,
    diagnosticPage?: boolean,
    spine?: SpineSpec,
  ): Promise<{ buffer: Uint8Array; pageCount: number; fontSubstitutions: string[] }>;
  generatePageIds(config: ProofConfig): PageIdMap;
  flattenPageIds(map: PageIdMap): string[];
};
type SpineSpec = {
  id: string;
  name: string;
  assetRef: string;
  unitAspect: number;
  gapRatio: number;
  orientation: Orientation extends "vertical" ? never : "vertical" | "horizontal";
};
type TemplateModule = {
  DEFAULT_TEMPLATE: {
    pages: Record<string, {
      dayCells?: {
        x_origin_pct: number;
        y_origin_pct: number;
        col_w_pct: number;
        row_h_pct: number;
      };
    }>;
  };
};
type Link = {
  pageIndex: number;
  destinationObjectNumber: number | null;
  uri: string | null;
  rect: [number, number, number, number];
};
type MonthSlot = {
  label: string;
  column: number;
  row: number;
  weekday: string;
};
type ProofSpec = {
  file: string;
  label: string;
  weekStart: WeekStart;
  orientation: Orientation;
  monthCount: number;
};
type ProofResult = {
  spec: ProofSpec;
  config: ProofConfig;
  buffer: Uint8Array;
  pageCount: number;
  linkCount: number;
  deadLinkCount: number;
  monthSlots: MonthSlot[];
  firstWeekDates: string[];
  fontSubstitutions: string[];
};

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const PROOF_DIR = path.join(ROOT, "proof");
const apiServerRequire = createRequire(
  new URL("../../artifacts/api-server/package.json", import.meta.url),
);
const {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
} = apiServerRequire("pdf-lib") as Record<string, any>;
const generatorUrl = new URL(
  "../../artifacts/api-server/src/lib/pdf-generator.ts",
  import.meta.url,
).href;
const templateUrl = new URL(
  "../../artifacts/api-server/src/lib/pdf-template.ts",
  import.meta.url,
).href;
const { buildPdf, generatePageIds, flattenPageIds } =
  (await import(generatorUrl)) as GeneratorModule;
const { DEFAULT_TEMPLATE } = (await import(templateUrl)) as TemplateModule;

const THEME = {
  name: "Terracotta (starter theme)",
  colors: ["#b75d3f", "#a04a30", "#c98a2b", "#7d8a6a", "#2c2822", "#f4efe6"],
} as const;
const SPINES = {
  vertical: {
    id: "spine-starter-rings-vertical",
    name: "Classic Rings — Vertical",
    unitAspect: 0.1353,
    gapRatio: 0,
    orientation: "vertical",
    file: "rings2.png",
  },
  landscape: {
    id: "spine-starter-rings-horizontal",
    name: "Classic Rings — Horizontal",
    unitAspect: 11.9,
    gapRatio: 0,
    orientation: "horizontal",
    file: "rings1.png",
  },
} as const;
const SECTIONS = ["Work", "Personal", "Health", "Goals"];
const PROOFS: ProofSpec[] = [
  {
    file: "2027-monday-vertical.pdf",
    label: "Monday vertical",
    weekStart: "mon",
    orientation: "vertical",
    monthCount: 12,
  },
  {
    file: "2027-sunday-vertical.pdf",
    label: "Sunday vertical",
    weekStart: "sun",
    orientation: "vertical",
    monthCount: 12,
  },
  {
    file: "2027-monday-landscape.pdf",
    label: "Monday landscape",
    weekStart: "mon",
    orientation: "landscape",
    monthCount: 12,
  },
  {
    file: "2027-13month-monday.pdf",
    label: "13-month Monday vertical",
    weekStart: "mon",
    orientation: "vertical",
    monthCount: 13,
  },
];

function fail(message: string): never {
  throw new Error(`Planner proof assertion failed: ${message}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function makeConfig(spec: ProofSpec): ProofConfig {
  return {
    setup: {
      startYear: 2027,
      startMonth: 0,
      monthCount: spec.monthCount,
      weekStart: spec.weekStart,
      orientation: spec.orientation,
      datingMode: "dated",
    },
    style: {
      size: "A5",
      tabPos: "right",
      renderStyle: "realistic",
      notePaper: "dot",
      themeId: "t1",
      coverTitle: "Daybook",
      coverSubtitle: `${spec.label} · ${THEME.name}`,
      coverYear: 2027,
      spineStyleId: SPINES[spec.orientation].id,
    },
    output: {
      calMode: "link",
      eventMins: 60,
      aiInPdf: false,
    },
    sections: [...SECTIONS],
  };
}

function decodeUri(value: any): string | null {
  if (value instanceof PDFString) return value.decodeText();
  if (value instanceof PDFName) {
    return value.asString()
      .replace(/^\//, "")
      .replace(/#([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)));
  }
  return null;
}

function extractLinks(doc: any): Link[] {
  const links: Link[] = [];
  for (const [pageIndex, page] of doc.getPages().entries()) {
    const annotations = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annotations) continue;
    for (let index = 0; index < annotations.size(); index++) {
      const raw = annotations.get(index);
      const annotation =
        raw instanceof PDFRef
          ? doc.context.lookup(raw, PDFDict)
          : raw instanceof PDFDict
            ? raw
            : null;
      if (!annotation) continue;
      const subtype = annotation.lookupMaybe(PDFName.of("Subtype"), PDFName);
      if (subtype?.asString() !== "/Link") continue;
      const rectArray = annotation.lookupMaybe(PDFName.of("Rect"), PDFArray);
      const rect = rectArray
        ? Array.from({ length: 4 }, (_, i) =>
            (rectArray.get(i) as InstanceType<typeof PDFNumber>).asNumber())
        : [0, 0, 0, 0];
      const destination = annotation.lookupMaybe(PDFName.of("Dest"), PDFArray)?.get(0);
      const action = annotation.lookupMaybe(PDFName.of("A"), PDFDict);
      links.push({
        pageIndex,
        destinationObjectNumber:
          destination instanceof PDFRef ? destination.objectNumber : null,
        uri: decodeUri(action?.lookup(PDFName.of("URI"))),
        rect: rect as [number, number, number, number],
      });
    }
  }
  return links;
}

function parseCalendarStart(uri: string): string | null {
  const match = uri.match(/[?&]dates=(\d{8})\//);
  return match?.[1] ?? null;
}

function expectedWeekdayColumn(date: Date, weekStart: WeekStart): number {
  const sundayColumn = date.getDay();
  return weekStart === "sun" ? sundayColumn : (sundayColumn + 6) % 7;
}

function verifyPageIdentity(
  label: string,
  doc: any,
  flat: string[],
  reportedPageCount: number,
): void {
  const uniqueIds = new Set(flat);
  assert(uniqueIds.size === flat.length, `${label}: duplicate page IDs in generated map`);
  const pages = doc.getPages();
  assert(
    reportedPageCount === flat.length,
    `${label}: generator reported ${reportedPageCount} pages for ${flat.length} page IDs`,
  );
  assert(
    pages.length === flat.length,
    `${label}: serialized PDF has ${pages.length} pages for ${flat.length} page IDs`,
  );
  const pageRefs = new Set(pages.map((page: any) => page.ref.objectNumber));
  assert(
    pageRefs.size === pages.length,
    `${label}: serialized PDF repeats one or more page objects`,
  );
}

function verifyInternalLinks(label: string, doc: any, links: Link[]): number {
  const pageRefs = new Set(
    doc.getPages().map((page: any) => page.ref.objectNumber),
  );
  const deadLinks = links.filter(
    (link) =>
      link.destinationObjectNumber !== null &&
      !pageRefs.has(link.destinationObjectNumber),
  );
  assert(
    deadLinks.length === 0,
    `${label}: ${deadLinks.length} internal link(s) target missing pages`,
  );
  return deadLinks.length;
}

function verifyMonthSlots(
  spec: ProofSpec,
  doc: any,
  map: PageIdMap,
  flat: string[],
  links: Link[],
): MonthSlot[] {
  const dayCells = DEFAULT_TEMPLATE.pages["month-calendar"]?.dayCells;
  assert(dayCells, `${spec.label}: default template has no month day-cell geometry`);
  const slots: MonthSlot[] = [];

  for (let monthIndex = 0; monthIndex < spec.monthCount; monthIndex++) {
    const year = 2027 + Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const date = new Date(year, month, 1);
    const monthPageIndex = flat.indexOf(map.monthCalendars[monthIndex]);
    const dayPageIndex = flat.indexOf(
      `d${year}${String(month + 1).padStart(2, "0")}01`,
    );
    assert(monthPageIndex >= 0, `${spec.label}: missing month page ${monthIndex + 1}`);
    assert(dayPageIndex >= 0, `${spec.label}: missing day page for ${year}-${month + 1}-01`);

    const destinationObjectNumber =
      doc.getPage(dayPageIndex).ref.objectNumber;
    const dayLink = links.find(
      (link) =>
        link.pageIndex === monthPageIndex &&
        link.destinationObjectNumber === destinationObjectNumber,
    );
    assert(dayLink, `${spec.label}: month ${month + 1} has no link to day 1`);

    const page = doc.getPage(monthPageIndex);
    const { width, height } = page.getSize();
    const xPct = (dayLink.rect[0] / width) * 100;
    const yPct = ((dayLink.rect[1] + 2) / height) * 100;
    const column = Math.round(
      (xPct - dayCells.x_origin_pct) / dayCells.col_w_pct,
    );
    const row = Math.round(
      (yPct - dayCells.y_origin_pct) / dayCells.row_h_pct,
    );
    const expectedColumn = expectedWeekdayColumn(date, spec.weekStart);
    assert(
      column === expectedColumn && row === 0,
      `${spec.label}: ${year}-${String(month + 1).padStart(2, "0")}-01 is in column ${column}, row ${row}; expected column ${expectedColumn}, row 0`,
    );
    slots.push({
      label: date.toLocaleString("en-US", { month: "short" }),
      column,
      row,
      weekday: date.toLocaleString("en-US", { weekday: "short" }),
    });
  }
  return slots;
}

function verifyWeeklyStarts(
  spec: ProofSpec,
  doc: any,
  map: PageIdMap,
  flat: string[],
  links: Link[],
): string[] {
  const starts: string[] = [];
  const expectedDay = spec.weekStart === "sun" ? 0 : 1;
  for (const weekId of map.weeklies) {
    const pageIndex = flat.indexOf(weekId);
    assert(pageIndex >= 0, `${spec.label}: missing weekly page ${weekId}`);
    const calendarStart = links
      .filter((link) => link.pageIndex === pageIndex && link.uri)
      .map((link) => parseCalendarStart(link.uri!))
      .find((value): value is string => value !== null);
    assert(calendarStart, `${spec.label}: ${weekId} has no dated calendar URI`);
    const date = new Date(
      Number(calendarStart.slice(0, 4)),
      Number(calendarStart.slice(4, 6)) - 1,
      Number(calendarStart.slice(6, 8)),
    );
    assert(
      date.getDay() === expectedDay,
      `${spec.label}: ${weekId} starts ${calendarStart} (${date.toLocaleString("en-US", { weekday: "long" })})`,
    );
    starts.push(calendarStart);
  }
  return starts;
}

function verifyBoundary(spec: ProofSpec, map: PageIdMap, flat: string[]): void {
  if (spec.monthCount !== 13) return;
  assert(
    map.monthCalendars.length === 13,
    `${spec.label}: expected 13 month calendars, got ${map.monthCalendars.length}`,
  );
  assert(flat.includes("d20271231"), `${spec.label}: missing 31 Dec 2027`);
  assert(flat.includes("d20280101"), `${spec.label}: missing 1 Jan 2028`);
  assert(flat.includes("d20280131"), `${spec.label}: missing 31 Jan 2028`);
}

function verifyPlausiblePageCount(spec: ProofSpec, pageCount: number): void {
  const [minimum, maximum] = spec.monthCount === 13 ? [450, 525] : [410, 490];
  assert(
    pageCount >= minimum && pageCount <= maximum,
    `${spec.label}: page count ${pageCount} is outside plausible band ${minimum}-${maximum} for ${SECTIONS.length} sections`,
  );
}

async function buildAndVerify(spec: ProofSpec): Promise<ProofResult> {
  const config = makeConfig(spec);
  const spineMeta = SPINES[spec.orientation];
  const spineBytes = await readFile(path.join(ROOT, "scripts/assets", spineMeta.file));
  const spine: SpineSpec = {
    ...spineMeta,
    assetRef: `data:image/png;base64,${spineBytes.toString("base64")}`,
  };
  const generated = await buildPdf(
    config,
    [...THEME.colors],
    undefined,
    undefined,
    undefined,
    undefined,
    false,
    undefined,
    false,
    spine,
  );
  const doc = await PDFDocument.load(generated.buffer);
  const map = generatePageIds(config);
  const flat = flattenPageIds(map);
  const links = extractLinks(doc);

  verifyPageIdentity(spec.label, doc, flat, generated.pageCount);
  const deadLinkCount = verifyInternalLinks(spec.label, doc, links);
  const monthSlots = verifyMonthSlots(spec, doc, map, flat, links);
  const firstWeekDates = verifyWeeklyStarts(spec, doc, map, flat, links);
  verifyBoundary(spec, map, flat);
  verifyPlausiblePageCount(spec, doc.getPageCount());

  return {
    spec,
    config,
    buffer: generated.buffer,
    pageCount: doc.getPageCount(),
    linkCount: links.length,
    deadLinkCount,
    monthSlots,
    firstWeekDates,
    fontSubstitutions: generated.fontSubstitutions,
  };
}

function printSummary(results: ProofResult[]): void {
  console.log("");
  console.log("2027 planner proof set passed all six assertions");
  console.log(`Theme: ${THEME.name}; generator standard fonts`);
  console.log(`Sections: ${SECTIONS.join(", ")}`);
  console.log("");
  for (const result of results) {
    const slotSummary = result.monthSlots
      .map((slot) => `${slot.label}=${slot.weekday}:c${slot.column + 1}r${slot.row + 1}`)
      .join(" ");
    console.log(`${result.spec.file}`);
    console.log(`  spine=${SPINES[result.spec.orientation].name}`);
    console.log(
      `  pages=${result.pageCount} links=${result.linkCount} dead-links=${result.deadLinkCount}`,
    );
    console.log(`  month-1 slots: ${slotSummary}`);
    console.log(
      `  weekly range: ${result.firstWeekDates[0]} to ${result.firstWeekDates.at(-1)}`,
    );
    if (result.fontSubstitutions.length > 0) {
      console.log(`  font substitutions: ${result.fontSubstitutions.join(", ")}`);
    }
  }
  console.log("");
  console.log(`Proof directory: ${PROOF_DIR}`);
}

async function main(): Promise<void> {
  const results: ProofResult[] = [];
  for (const proof of PROOFS) {
    results.push(await buildAndVerify(proof));
  }
  const monday = results.find((result) => result.spec.file === "2027-monday-vertical.pdf");
  const sunday = results.find((result) => result.spec.file === "2027-sunday-vertical.pdf");
  assert(monday && sunday, "missing Monday or Sunday comparison artifact");
  assert(
    createHash("sha256").update(monday.buffer).digest("hex") !==
      createHash("sha256").update(sunday.buffer).digest("hex"),
    "Monday and Sunday vertical PDFs are byte-identical",
  );
  assert(
    monday.firstWeekDates.join(",") !== sunday.firstWeekDates.join(","),
    "Monday and Sunday weekly ranges are identical",
  );

  await mkdir(PROOF_DIR, { recursive: true });
  await Promise.all(
    PROOFS.map((spec) => rm(path.join(PROOF_DIR, spec.file), { force: true })),
  );
  await Promise.all(
    results.map((result) =>
      writeFile(path.join(PROOF_DIR, result.spec.file), result.buffer)),
  );
  printSummary(results);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});