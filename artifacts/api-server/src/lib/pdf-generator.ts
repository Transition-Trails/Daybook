/**
 * Daybook PDF Generator
 * Implements spec/LINK-SCHEME.md — deterministic page IDs, all cross-links resolved,
 * CI determinism check before every export.
 *
 * Link annotation placement is fully data-driven via PlannerTemplate.
 * See pdf-template.ts for the type system, DEFAULT_TEMPLATE, and stampPageZones.
 */
import {
  PDFDocument,
  PDFPage,
  PDFRef,
  rgb,
  StandardFonts,
  degrees,
  PDFName,
  PDFArray,
  PDFDict,
  PDFNumber,
} from "pdf-lib";
import type { PlannerSetup, PlannerStyle, PlannerOutput } from "@workspace/db";
import {
  type PageIdMap,
  type PageRole,
  type PlannerTemplate,
  type StampContext,
  DEFAULT_TEMPLATE,
  addGoToAnnotation,
  addUriAnnotation,
  stampPageZones,
  validateTemplate,
} from "./pdf-template";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { PageIdMap } from "./pdf-template";

export interface GeneratorConfig {
  setup: PlannerSetup;
  style: PlannerStyle;
  output: PlannerOutput;
  sections: string[];
  editionId?: string;
  userId?: string;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function getISOWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `w${d.getUTCFullYear()}W${String(weekNum).padStart(2, "0")}`;
}

function yyyymmdd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = month + delta;
  return { year: year + Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// ── Page ID generation ────────────────────────────────────────────────────────

export function generatePageIds(config: GeneratorConfig): PageIdMap {
  const { setup, style, sections } = config;
  const { startMonth, startYear, monthCount, weekStart } = setup;
  const tabPos = style.tabPos ?? "right";
  const notePaper = style.notePaper ?? "dot";

  const map: PageIdMap = {
    cover: "cover",
    home: "home",
    year: "year",
    monthDividers: [],
    monthCalendars: [],
    weeklies: [],
    dailies: [],
    todo: "todo",
    notes: "notes",
    sectionDividers: [],
    notePaper: [],
  };

  for (let i = 0; i < monthCount; i++) {
    map.monthDividers.push(`mdiv${i}`);
    map.monthCalendars.push(`m${i}`);
  }

  const seen = new Set<string>();
  for (let i = 0; i < monthCount; i++) {
    const { year, month } = addMonths(startYear, startMonth, i);
    const days = daysInMonth(year, month);
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      const id = `d${yyyymmdd(date)}`;
      if (!seen.has(id)) { seen.add(id); map.dailies.push(id); }
    }
  }

  const startDate = new Date(startYear, startMonth, 1);
  const { year: endYear, month: endMonth } = addMonths(startYear, startMonth, monthCount - 1);
  const endDate = new Date(endYear, endMonth, daysInMonth(endYear, endMonth));

  const weeksSeen = new Set<string>();
  const cursor = new Date(startDate);
  const wdOffset = weekStart === "mon" ? 1 : 0;
  while ((cursor.getDay() !== wdOffset) && cursor.getTime() >= startDate.getTime()) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (cursor.getTime() <= endDate.getTime()) {
    const weekId = getISOWeekId(cursor);
    if (!weeksSeen.has(weekId)) { weeksSeen.add(weekId); map.weeklies.push(weekId); }
    cursor.setDate(cursor.getDate() + 7);
  }

  for (let i = 1; i <= sections.length; i++) {
    map.sectionDividers.push(`ns${i}`);
  }

  const paperCount = notePaper === "mixed" ? 3 : 1;
  for (let i = 0; i < paperCount; i++) {
    map.notePaper.push(`notes-p${i}`);
  }

  return map;
}

export function flattenPageIds(map: PageIdMap): string[] {
  const ids: string[] = [map.cover, map.home, map.year];
  for (let i = 0; i < map.monthDividers.length; i++) {
    ids.push(map.monthDividers[i]);
    ids.push(map.monthCalendars[i]);
  }
  ids.push(...map.weeklies);
  ids.push(...map.dailies);
  ids.push(map.todo);
  ids.push(map.notes);
  ids.push(...map.sectionDividers);
  ids.push(...map.notePaper);
  return ids;
}

// ── CI determinism check ──────────────────────────────────────────────────────

export function validatePageIds(map: PageIdMap, sections: string[]): void {
  const flat = flattenPageIds(map);
  const idSet = new Set<string>();

  for (const id of flat) {
    if (idSet.has(id)) throw new Error(`CI FAIL: Duplicate page id "${id}"`);
    idSet.add(id);
  }
  if (!idSet.has("home")) throw new Error("CI FAIL: Missing required page id 'home'");
  if (!idSet.has("year")) throw new Error("CI FAIL: Missing required page id 'year'");
  if (map.sectionDividers.length !== sections.length) {
    throw new Error(
      `CI FAIL: ns* count (${map.sectionDividers.length}) != sections.length (${sections.length})`,
    );
  }

  const crossLinks: Array<[string, string]> = [
    ["cover", "home"], ["home", "year"], ["home", "todo"], ["home", "notes"],
    ...map.sectionDividers.map((ns): [string, string] => ["home", ns]),
    ...map.monthDividers.map((mdiv, i): [string, string] => [mdiv, `m${i}`]),
    ...map.monthCalendars.map((m, i): [string, string] => [m, map.monthDividers[i]]),
    ...map.sectionDividers.map((ns): [string, string] => [ns, "notes"]),
  ];
  for (const [src, tgt] of crossLinks) {
    if (!idSet.has(tgt)) throw new Error(`CI FAIL: Page "${src}" links to missing target "${tgt}"`);
  }

  // Calendar URL format check
  for (const w of map.weeklies) {
    if (!/^w\d{4}W\d{2}$/.test(w)) throw new Error(`CI FAIL: Weekly id "${w}" does not match w{year}W{ww}`);
  }
  for (const d of map.dailies) {
    if (!/^d\d{8}$/.test(d)) throw new Error(`CI FAIL: Daily id "${d}" does not match d{YYYYMMDD}`);
  }
}

// ── Calendar link helpers ─────────────────────────────────────────────────────

function googleCalendarLink(start: string, end: string): string {
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&dates=${start}/${end}`;
}

function icsDataUri(startDate: Date, endDate: Date, title: string): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(".000Z", "Z");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    `DTSTART:${fmt(startDate)}`, `DTEND:${fmt(endDate)}`, `SUMMARY:${title}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

// ── PDF builder ───────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 40;

interface PageWithId {
  id: string;
  page: PDFPage;
  pageRef: PDFRef;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16) / 255,
    g: parseInt(clean.substring(2, 4), 16) / 255,
    b: parseInt(clean.substring(4, 6), 16) / 255,
  };
}

export async function buildPdf(
  config: GeneratorConfig,
  themeColors?: string[],
  template: PlannerTemplate = DEFAULT_TEMPLATE,
): Promise<{ buffer: Uint8Array; pageCount: number }> {
  const { setup, style, output, sections } = config;
  const { startMonth, startYear, monthCount, weekStart, orientation } = setup;
  const tabPos = (style.tabPos ?? "right") as "right" | "top" | "none";
  const calMode = output.calMode ?? "none";

  // 1. Generate & validate page IDs + template
  const map = generatePageIds(config);
  validatePageIds(map, sections);
  validateTemplate(template, map, sections);

  // 2. Resolve theme colors
  const colors = themeColors ?? ["#6366f1", "#4f46e5", "#a5b4fc", "#c7d2fe", "#1e1b4b", "#fafafa"];
  const accent = hexToRgb(colors[0] ?? "#6366f1");
  const ink    = hexToRgb(colors[4] ?? "#1e1b4b");
  const paper  = hexToRgb(colors[5] ?? "#fafafa");

  // 3. Create PDF
  const pdfDoc = await PDFDocument.create();
  const pageWidth  = orientation === "landscape" ? PAGE_HEIGHT : PAGE_WIDTH;
  const pageHeight = orientation === "landscape" ? PAGE_WIDTH  : PAGE_HEIGHT;
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 4. Build ordered ID list and create pages
  const flat = flattenPageIds(map);
  const pageMap = new Map<string, PageWithId>();

  for (const id of flat) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const pageRef = page.ref;
    pageMap.set(id, { id, page, pageRef });

    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(paper.r, paper.g, paper.b) });
    page.drawRectangle({ x: 0, y: pageHeight - 20, width: pageWidth, height: 20, color: rgb(accent.r, accent.g, accent.b) });
    page.drawText(id, { x: MARGIN, y: pageHeight - 14, size: 7, font, color: rgb(1, 1, 1) });
  }

  // 5. Convenience accessors
  const getRef  = (id: string): PDFRef | null => pageMap.get(id)?.pageRef ?? null;
  const getPage = (id: string): PDFPage | null => pageMap.get(id)?.page ?? null;

  // 6. Build month list + StampContext factory
  const monthList = Array.from({ length: monthCount }, (_, i) => addMonths(startYear, startMonth, i));

  function makeCtx(
    pageId: string,
    role: PageRole,
    extra: Partial<StampContext> = {},
  ): StampContext {
    const pw = pageMap.get(pageId);
    if (!pw) throw new Error(`makeCtx: page "${pageId}" not in pageMap`);
    return {
      pageId,
      page: pw.page,
      role,
      pageWidth,
      pageHeight,
      pdfDoc,
      pageMap,
      accent,
      ink,
      font,
      map,
      sections,
      monthList,
      tabPos,
      includeTabRail: false,
      template,
      ...extra,
    };
  }

  // 7. Content drawing + link stamping
  //    Content (drawText / drawRectangle / drawLine) is exactly as before.
  //    Link annotation placement is delegated to stampPageZones.

  // ── COVER ──
  {
    const sp = getPage("cover");
    if (sp) {
      sp.drawText("Daybook", { x: MARGIN, y: pageHeight / 2 + 40, size: 32, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
      sp.drawText("Your planner, your way.", { x: MARGIN, y: pageHeight / 2, size: 14, font, color: rgb(ink.r, ink.g, ink.b) });
    }
    stampPageZones(makeCtx("cover", "cover"));
  }

  // ── HOME ──
  {
    const sp = getPage("home");
    if (sp) {
      sp.drawText("Home", { x: MARGIN, y: pageHeight - 50, size: 20, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    stampPageZones(makeCtx("home", "home"));
  }

  // ── YEAR ──
  {
    const sp = getPage("year");
    if (sp) {
      sp.drawText("Year Overview", { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    stampPageZones(makeCtx("year", "year"));
  }

  // ── MONTH DIVIDERS + MONTH CALENDARS ──
  for (let i = 0; i < map.monthDividers.length; i++) {
    const mdivId = map.monthDividers[i];
    const mId    = map.monthCalendars[i];
    const { year, month } = monthList[i];
    const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "long" });

    // Month divider: content
    const mdivPage = getPage(mdivId);
    if (mdivPage) {
      mdivPage.drawText(monthName, { x: MARGIN, y: pageHeight / 2, size: 36, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
      mdivPage.drawText(String(year), { x: MARGIN, y: pageHeight / 2 - 44, size: 18, font, color: rgb(ink.r, ink.g, ink.b) });
    }
    // Month divider: links
    stampPageZones(makeCtx(mdivId, "month-divider", { monthIndex: i }));

    // Month calendar: content
    const mPage = getPage(mId);
    if (mPage) {
      mPage.drawText(`${monthName} ${year}`, { x: MARGIN, y: pageHeight - 50, size: 16, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }

    // Month calendar: links (prev-mdiv, next-mdiv + day cells via dayCells spec)
    // weekStartOffset=0 matches the current code's (d-1)%7 layout (no weekday alignment)
    stampPageZones(makeCtx(mId, "month-calendar", {
      monthIndex: i,
      dayOfMonthContext: { year, month, weekStartOffset: 0 },
    }));
  }

  // ── WEEKLIES ──
  for (const weekId of map.weeklies) {
    const wPage = getPage(weekId);
    if (!wPage) continue;
    const weekMatch = weekId.match(/^w(\d{4})W(\d{2})$/);
    if (!weekMatch) continue;
    const weekYear = parseInt(weekMatch[1]);
    const weekNum  = parseInt(weekMatch[2]);

    const jan4 = new Date(weekYear, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNum - 1) * 7);

    wPage.drawText(`Week ${weekNum} — ${weekYear}`, { x: MARGIN, y: pageHeight - 50, size: 16, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });

    // Calendar links per day (remains imperative — driven by output.calMode)
    for (let d = 0; d < 7; d++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + d);
      if (calMode === "link" || calMode === "overlay") {
        const nextDay = new Date(date);
        nextDay.setDate(date.getDate() + 1);
        const calRect: [number, number, number, number] = [
          MARGIN + d * 70, pageHeight - 120, MARGIN + d * 70 + 65, pageHeight - 102,
        ];
        if (calMode === "link") {
          addUriAnnotation(pdfDoc, wPage, googleCalendarLink(yyyymmdd(date), yyyymmdd(nextDay)), calRect, "+Cal", font, accent);
        } else {
          const startDt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0, 0);
          const endDt   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, output.eventMins ?? 60, 0);
          addUriAnnotation(pdfDoc, wPage, icsDataUri(startDt, endDt, `Week ${weekNum} Day ${d + 1}`), calRect, "+Cal", font, accent);
        }
      }
    }

    // AI block
    if (output.aiInPdf) {
      const aiUrl = `${process.env.APP_URL ?? "https://daybook.app"}/assistant?context=weekly&page=${weekId}`;
      addUriAnnotation(pdfDoc, wPage, aiUrl, [MARGIN, MARGIN + 22, MARGIN + 130, MARGIN + 40], "* Ask AI about this week", font, accent);
    }

    // Find which month this weekly falls in
    const monthIdx = (() => {
      for (let i = 0; i < monthCount; i++) {
        const { year, month } = addMonths(startYear, startMonth, i);
        if (monday.getFullYear() === year && monday.getMonth() === month) return i;
      }
      return 0;
    })();

    // Links: month-for-week + 7 day columns via template
    stampPageZones(makeCtx(weekId, "weekly", {
      weeklyMonthIndex: monthIdx,
      weekMonday: monday,
      includeTabRail: true,
    }));
  }

  // ── DAILIES ──
  const dailyList = map.dailies;
  for (let i = 0; i < dailyList.length; i++) {
    const dayId = dailyList[i];
    const dPage = getPage(dayId);
    if (!dPage) continue;

    const dateStr = dayId.replace("d", "");
    const year  = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day   = parseInt(dateStr.substring(6, 8));
    const date  = new Date(year, month, day);

    dPage.drawText(
      date.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      { x: MARGIN, y: pageHeight - 50, size: 14, font: fontBold, color: rgb(ink.r, ink.g, ink.b) },
    );

    // Calendar link
    if (calMode === "link" || calMode === "overlay") {
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      const calRect: [number, number, number, number] = [pageWidth - 120, pageHeight - 50, pageWidth - MARGIN, pageHeight - 34];
      if (calMode === "link") {
        addUriAnnotation(pdfDoc, dPage, googleCalendarLink(yyyymmdd(date), yyyymmdd(nextDay)), calRect, "+Google Cal", font, accent);
      } else {
        const startDt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0, 0);
        const endDt   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, output.eventMins ?? 60, 0);
        addUriAnnotation(pdfDoc, dPage, icsDataUri(startDt, endDt, date.toLocaleDateString("en-US", { month: "long", day: "numeric" })), calRect, "+Cal", font, accent);
      }
    }

    // AI block
    if (output.aiInPdf) {
      const aiUrl = `${process.env.APP_URL ?? "https://daybook.app"}/assistant?context=daily&page=${dayId}`;
      addUriAnnotation(pdfDoc, dPage, aiUrl, [pageWidth - MARGIN - 70, MARGIN + 22, pageWidth - MARGIN, MARGIN + 40], "* Ask AI", font, accent);
    }

    const monthIdx = (() => {
      for (let j = 0; j < monthCount; j++) {
        const m = addMonths(startYear, startMonth, j);
        if (m.year === year && m.month === month) return j;
      }
      return 0;
    })();

    // Links: month-for-day, prev-day, next-day via template
    stampPageZones(makeCtx(dayId, "daily", {
      monthIndex: monthIdx,
      dailyIndex: i,
      includeTabRail: true,
    }));
  }

  // ── TODO ──
  stampPageZones(makeCtx("todo", "todo", { includeTabRail: true }));

  // ── NOTES + SECTION DIVIDERS ──
  {
    const np = getPage("notes");
    if (np) {
      np.drawText("Notes", { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    stampPageZones(makeCtx("notes", "notes", { includeTabRail: true }));

    for (let i = 0; i < map.sectionDividers.length; i++) {
      const nsId = map.sectionDividers[i];
      const nsp = getPage(nsId);
      if (nsp) {
        nsp.drawText(sections[i] ?? nsId, { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
      }
      stampPageZones(makeCtx(nsId, "section-divider", {
        sectionIndex: i,
        includeTabRail: true,
      }));
    }
  }

  // ── NOTE PAPER ──
  for (const npId of map.notePaper) {
    stampPageZones(makeCtx(npId, "note-paper", { includeTabRail: true }));
  }

  // 8. Serialize
  const pdfBytes = await pdfDoc.save();
  return { buffer: pdfBytes, pageCount: flat.length };
}

// ── Preview PDF ───────────────────────────────────────────────────────────────
// Renders a representative 8-9 page sample using the SAME drawing primitives
// as buildPdf but skipping DB writes, Drive uploads, and large month ranges.
// Pages: cover · home · year · month-divider · month-calendar · weekly · daily
//        · notes hub · (optional) first section divider

export async function buildPreviewPdf(
  config: GeneratorConfig,
  themeColors?: string[],
  template: PlannerTemplate = DEFAULT_TEMPLATE,
): Promise<{ buffer: Uint8Array; pageCount: number }> {
  const { setup, style, output, sections } = config;
  const { startMonth, startYear, weekStart, orientation } = setup;
  const tabPos = (style.tabPos ?? "right") as "right" | "top" | "none";

  const colors = themeColors ?? ["#6366f1", "#4f46e5", "#a5b4fc", "#c7d2fe", "#1e1b4b", "#fafafa"];
  const accent = hexToRgb(colors[0] ?? "#6366f1");
  const ink    = hexToRgb(colors[4] ?? "#1e1b4b");
  const paper  = hexToRgb(colors[5] ?? "#fafafa");

  const pdfDoc = await PDFDocument.create();
  const pageWidth  = orientation === "landscape" ? PAGE_HEIGHT : PAGE_WIDTH;
  const pageHeight = orientation === "landscape" ? PAGE_WIDTH  : PAGE_HEIGHT;
  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const firstDate     = new Date(startYear, startMonth, 1);
  const firstDayId    = `d${yyyymmdd(firstDate)}`;
  const firstWeeklyId = getISOWeekId(firstDate);
  const monthNameFull  = firstDate.toLocaleString("en-US", { month: "long" });
  const monthNameShort = firstDate.toLocaleString("en-US", { month: "short" });

  const previewIds: string[] = [
    "cover", "home", "year", "mdiv0", "m0",
    firstWeeklyId, firstDayId, "notes",
    ...(sections.length > 0 ? ["ns1"] : []),
  ];

  const pageMap = new Map<string, PageWithId>();
  for (const id of previewIds) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageMap.set(id, { id, page, pageRef: page.ref });
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(paper.r, paper.g, paper.b) });
    page.drawRectangle({ x: 0, y: pageHeight - 20, width: pageWidth, height: 20, color: rgb(accent.r, accent.g, accent.b) });
    page.drawText(id, { x: MARGIN, y: pageHeight - 14, size: 7, font, color: rgb(1, 1, 1) });
  }

  const getRef  = (id: string): PDFRef | null => pageMap.get(id)?.pageRef ?? null;
  const getPage = (id: string): PDFPage | null => pageMap.get(id)?.page ?? null;

  // Preview-specific addLink (for links that aren't in the DEFAULT_TEMPLATE)
  function addLinkPreview(srcId: string, tgtId: string, label: string, x: number, y: number, w = 80, h = 16) {
    const sp = getPage(srcId);
    const tr = getRef(tgtId);
    if (!sp || !tr) return;
    sp.drawRectangle({ x, y: y - 2, width: w, height: h, color: rgb(accent.r, accent.g, accent.b), opacity: 0.15 });
    sp.drawText(label, { x: x + 4, y: y + 2, size: 8, font, color: rgb(ink.r, ink.g, ink.b) });
    addGoToAnnotation(pdfDoc, sp, tr, [x, y - 2, x + w, y - 2 + h]);
  }

  // Preview PageIdMap (minimal — only preview pages)
  const previewMap: PageIdMap = {
    cover: "cover",
    home: "home",
    year: "year",
    monthDividers: ["mdiv0"],
    monthCalendars: ["m0"],
    weeklies: [firstWeeklyId],
    dailies: [firstDayId],
    todo: "todo",
    notes: "notes",
    sectionDividers: sections.length > 0 ? ["ns1"] : [],
    notePaper: [],
  };
  const previewMonthList = [{ year: startYear, month: startMonth }];

  function makePreviewCtx(
    pageId: string,
    role: PageRole,
    extra: Partial<StampContext> = {},
  ): StampContext {
    const pw = pageMap.get(pageId);
    if (!pw) throw new Error(`makePreviewCtx: "${pageId}" not in preview pageMap`);
    return {
      pageId, page: pw.page, role, pageWidth, pageHeight,
      pdfDoc, pageMap, accent, ink, font,
      map: previewMap, sections,
      monthList: previewMonthList,
      tabPos, includeTabRail: false,
      template,
      ...extra,
    };
  }

  // ── COVER ──
  const cp = getPage("cover");
  if (cp) {
    cp.drawText("Daybook", { x: MARGIN, y: pageHeight / 2 + 40, size: 32, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
    cp.drawText("Your planner, your way.", { x: MARGIN, y: pageHeight / 2, size: 14, font, color: rgb(ink.r, ink.g, ink.b) });
    cp.drawRectangle({ x: 0, y: 0, width: 8, height: pageHeight, color: rgb(accent.r, accent.g, accent.b) });
  }
  stampPageZones(makePreviewCtx("cover", "cover"));

  // ── HOME ──
  const homeP = getPage("home");
  if (homeP) {
    homeP.drawText("Home", { x: MARGIN, y: pageHeight - 50, size: 20, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
  }
  // Standard home links (year, todo→skipped, notes, sections)
  stampPageZones(makePreviewCtx("home", "home"));
  // Preview-specific shortcut: direct link to first month calendar
  let hy = pageHeight - 90 - 28; // slot below "Year at a Glance"
  addLinkPreview("home", "m0", monthNameShort, MARGIN, hy, 80, 18);

  // ── YEAR ──
  const yp = getPage("year");
  if (yp) {
    yp.drawText(`${startYear} Year Overview`, { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    yp.drawText("(preview shows first month)", { x: MARGIN, y: pageHeight - 68, size: 9, font, color: rgb(ink.r, ink.g, ink.b), opacity: 0.4 });
    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    for (let m = 0; m < 12; m++) {
      const col = m % 4;
      const row = Math.floor(m / 4);
      const mx = MARGIN + col * 120;
      const my = pageHeight - 100 - row * 40;
      const isFirst = m === startMonth;
      if (isFirst) yp.drawRectangle({ x: mx - 2, y: my - 4, width: 110, height: 24, color: rgb(accent.r, accent.g, accent.b), opacity: 0.12 });
      yp.drawText(MONTH_NAMES[m] + " " + startYear, { x: mx, y: my + 6, size: 9, font: isFirst ? fontBold : font, color: rgb(ink.r, ink.g, ink.b) });
    }
  }
  // Year → mdiv0 (template repeating zone stamps this; gracefully skips mdiv1..N not in preview)
  stampPageZones(makePreviewCtx("year", "year"));

  // ── MONTH DIVIDER ──
  const mdivP = getPage("mdiv0");
  if (mdivP) {
    mdivP.drawRectangle({ x: 0, y: pageHeight / 2 - 20, width: 6, height: 80, color: rgb(accent.r, accent.g, accent.b) });
    mdivP.drawText(monthNameFull, { x: MARGIN, y: pageHeight / 2 + 20, size: 36, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
    mdivP.drawText(String(startYear), { x: MARGIN, y: pageHeight / 2 - 24, size: 18, font, color: rgb(ink.r, ink.g, ink.b) });
  }
  stampPageZones(makePreviewCtx("mdiv0", "month-divider", { monthIndex: 0 }));

  // ── MONTH CALENDAR ──
  const mcp = getPage("m0");
  if (mcp) {
    mcp.drawText(`${monthNameFull} ${startYear}`, { x: MARGIN, y: pageHeight - 50, size: 16, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    const DOW = weekStart === "mon"
      ? ["Mo","Tu","We","Th","Fr","Sa","Su"]
      : ["Su","Mo","Tu","We","Th","Fr","Sa"];
    const colW = (pageWidth - 2 * MARGIN) / 7;
    for (let c = 0; c < 7; c++) {
      mcp.drawText(DOW[c], { x: MARGIN + c * colW + colW / 2 - 6, y: pageHeight - 72, size: 8, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
    }
    // Draw day number text (links are handled by template dayCells)
    const days = daysInMonth(startYear, startMonth);
    const firstDow = new Date(startYear, startMonth, 1).getDay();
    // weekStartOffset=0 keeps consistency with main buildPdf's (d-1)%7 grid layout
    for (let d = 1; d <= days; d++) {
      const slot = d - 1; // weekStartOffset=0
      const col = slot % 7;
      const row = Math.floor(slot / 7);
      const cx = MARGIN + col * 72;
      const cy = pageHeight - 80 - row * 50;
      mcp.drawText(String(d), { x: cx + 6, y: cy + 4, size: 9, font, color: rgb(ink.r, ink.g, ink.b) });
    }
  }
  stampPageZones(makePreviewCtx("m0", "month-calendar", {
    monthIndex: 0,
    dayOfMonthContext: { year: startYear, month: startMonth, weekStartOffset: 0 },
  }));

  // ── WEEKLY ──
  const wp = getPage(firstWeeklyId);
  const weekMatch = firstWeeklyId.match(/^w(\d{4})W(\d{2})$/);
  if (wp && weekMatch) {
    const weekYear = parseInt(weekMatch[1]);
    const weekNum  = parseInt(weekMatch[2]);
    wp.drawText(`Week ${weekNum} — ${weekYear}`, { x: MARGIN, y: pageHeight - 50, size: 16, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });

    const jan4 = new Date(weekYear, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNum - 1) * 7);

    const colW = (pageWidth - 2 * MARGIN) / 7;
    for (let d = 0; d < 7; d++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + d);
      const label = date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const cx = MARGIN + d * colW;
      const isFirstDay = yyyymmdd(date) === yyyymmdd(firstDate);
      if (isFirstDay) {
        wp.drawRectangle({ x: cx, y: pageHeight - 97, width: colW - 2, height: 28, color: rgb(accent.r, accent.g, accent.b), opacity: 0.12 });
      } else {
        wp.drawText(label, { x: cx + 4, y: pageHeight - 88, size: 7, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
      }
      if (d > 0) {
        wp.drawLine({ start: { x: cx, y: pageHeight - 100 }, end: { x: cx, y: MARGIN + 30 }, thickness: 0.4, color: rgb(ink.r, ink.g, ink.b), opacity: 0.1 });
      }
      for (let h = 8; h <= 18; h++) {
        const hy2 = pageHeight - 110 - (h - 8) * 26;
        if (hy2 < MARGIN + 30) break;
        if (d === 0) wp.drawText(`${h}:00`, { x: MARGIN - 2, y: hy2, size: 6, font, color: rgb(ink.r, ink.g, ink.b), opacity: 0.3 });
        wp.drawLine({ start: { x: cx + 1, y: hy2 + 4 }, end: { x: cx + colW - 2, y: hy2 + 4 }, thickness: 0.3, color: rgb(ink.r, ink.g, ink.b), opacity: 0.08 });
      }
    }

    // Calendar links per day column (preview — driven by output.calMode)
    const previewCalMode = output.calMode ?? "none";
    if (previewCalMode === "link" || previewCalMode === "overlay") {
      for (let d = 0; d < 7; d++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + d);
        const nextDay = new Date(date);
        nextDay.setDate(date.getDate() + 1);
        const cx = MARGIN + d * colW;
        const calRect: [number, number, number, number] = [cx + 1, pageHeight - 120, cx + colW - 3, pageHeight - 104];
        if (previewCalMode === "link") {
          addUriAnnotation(pdfDoc, wp, googleCalendarLink(yyyymmdd(date), yyyymmdd(nextDay)), calRect, "+Cal", font, accent);
        } else {
          const startDt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0, 0);
          const endDt   = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, output.eventMins ?? 60, 0);
          addUriAnnotation(pdfDoc, wp, icsDataUri(startDt, endDt, `Day ${d + 1}`), calRect, "+Cal", font, accent);
        }
      }
    }

    // Links via template (month-for-week + week-day columns; tab rail)
    stampPageZones(makePreviewCtx(firstWeeklyId, "weekly", {
      weeklyMonthIndex: 0,
      weekMonday: monday,
      includeTabRail: true,
    }));
  }

  // ── DAILY ──
  const dp = getPage(firstDayId);
  if (dp) {
    dp.drawText(
      firstDate.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      { x: MARGIN, y: pageHeight - 50, size: 14, font: fontBold, color: rgb(ink.r, ink.g, ink.b) },
    );
    dp.drawLine({ start: { x: MARGIN, y: pageHeight - 60 }, end: { x: pageWidth - MARGIN, y: pageHeight - 60 }, thickness: 0.5, color: rgb(accent.r, accent.g, accent.b), opacity: 0.3 });
    for (let h = 6; h <= 21; h++) {
      const hy2 = pageHeight - 80 - (h - 6) * ((pageHeight - 80 - MARGIN - 30) / 16);
      if (hy2 < MARGIN + 30) break;
      dp.drawText(`${String(h).padStart(2, "0")}:00`, { x: MARGIN, y: hy2, size: 8, font, color: rgb(ink.r, ink.g, ink.b), opacity: 0.4 });
      dp.drawLine({ start: { x: MARGIN + 34, y: hy2 + 4 }, end: { x: pageWidth - MARGIN, y: hy2 + 4 }, thickness: 0.3, color: rgb(ink.r, ink.g, ink.b), opacity: h % 4 === 0 ? 0.2 : 0.07 });
    }

    // Calendar link on daily preview (driven by output.calMode)
    const previewCalModeDaily = output.calMode ?? "none";
    if (previewCalModeDaily === "link" || previewCalModeDaily === "overlay") {
      const nextDay = new Date(firstDate);
      nextDay.setDate(firstDate.getDate() + 1);
      const calRect: [number, number, number, number] = [pageWidth - 120, pageHeight - 50, pageWidth - MARGIN, pageHeight - 34];
      if (previewCalModeDaily === "link") {
        addUriAnnotation(pdfDoc, dp, googleCalendarLink(yyyymmdd(firstDate), yyyymmdd(nextDay)), calRect, "+Google Cal", font, accent);
      } else {
        const startDt = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate(), 9, 0, 0);
        const endDt   = new Date(firstDate.getFullYear(), firstDate.getMonth(), firstDate.getDate(), 9, output.eventMins ?? 60, 0);
        addUriAnnotation(pdfDoc, dp, icsDataUri(startDt, endDt, firstDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })), calRect, "+Cal", font, accent);
      }
    }
  }
  // Standard daily links (month-for-day, prev-day→null, next-day→null for preview)
  stampPageZones(makePreviewCtx(firstDayId, "daily", {
    monthIndex: 0,
    dailyIndex: 0,
    includeTabRail: true,
  }));
  // Preview-specific: link back to weekly
  addLinkPreview(firstDayId, firstWeeklyId, "Week", MARGIN, MARGIN, 60, 18);

  // ── NOTES ──
  const np = getPage("notes");
  if (np) {
    np.drawText("Notes", { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    const dotGap = 18;
    for (let px = MARGIN; px < pageWidth - MARGIN; px += dotGap) {
      for (let py = MARGIN + 10; py < pageHeight - 80; py += dotGap) {
        np.drawCircle({ x: px, y: py, size: 0.8, color: rgb(ink.r, ink.g, ink.b), opacity: 0.15 });
      }
    }
  }
  stampPageZones(makePreviewCtx("notes", "notes", { includeTabRail: true }));

  // ── SECTION DIVIDER ns1 ──
  if (sections.length > 0) {
    const nsp = getPage("ns1");
    if (nsp) {
      nsp.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 8, color: rgb(accent.r, accent.g, accent.b) });
      nsp.drawText(sections[0], { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
      nsp.drawText("section divider", { x: MARGIN, y: pageHeight - 70, size: 10, font, color: rgb(ink.r, ink.g, ink.b), opacity: 0.4 });
    }
    stampPageZones(makePreviewCtx("ns1", "section-divider", {
      sectionIndex: 0,
      includeTabRail: true,
    }));
  }

  // ── Preview footer on every page ──
  for (const id of previewIds) {
    const p = getPage(id);
    if (p) {
      p.drawText("PREVIEW -- representative pages only, not the final output", {
        x: pageWidth / 2 - 130, y: 6, size: 7, font,
        color: rgb(accent.r, accent.g, accent.b), opacity: 0.45,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  return { buffer: pdfBytes, pageCount: previewIds.length };
}
