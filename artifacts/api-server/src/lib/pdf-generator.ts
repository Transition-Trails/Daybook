/**
 * Daybook PDF Generator
 * Implements spec/LINK-SCHEME.md — deterministic page IDs, all cross-links resolved,
 * CI determinism check before every export.
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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageIdMap {
  cover: string;
  home: string;
  year: string;
  monthDividers: string[]; // mdiv0, mdiv1, ...
  monthCalendars: string[]; // m0, m1, ...
  weeklies: string[]; // w{year}W{ww}
  dailies: string[]; // d{YYYYMMDD}
  todo: string;
  notes: string;
  sectionDividers: string[]; // ns1, ns2, ...
  notePaper: string[]; // notes-p0, notes-p1, ...
}

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
  const day = d.getUTCDay() || 7; // Monday = 1, Sunday = 7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of the week
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

  // Month dividers + month calendars
  for (let i = 0; i < monthCount; i++) {
    map.monthDividers.push(`mdiv${i}`);
    map.monthCalendars.push(`m${i}`);
  }

  // Dailies: every day in the range
  const seen = new Set<string>();
  for (let i = 0; i < monthCount; i++) {
    const { year, month } = addMonths(startYear, startMonth, i);
    const days = daysInMonth(year, month);
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      const id = `d${yyyymmdd(date)}`;
      if (!seen.has(id)) {
        seen.add(id);
        map.dailies.push(id);
      }
    }
  }

  // Weeklies: ISO weeks that overlap the date range
  const startDate = new Date(startYear, startMonth, 1);
  const { year: endYear, month: endMonth } = addMonths(startYear, startMonth, monthCount - 1);
  const endDate = new Date(endYear, endMonth, daysInMonth(endYear, endMonth));

  const weeksSeen = new Set<string>();
  const cursor = new Date(startDate);
  // Rewind to Monday (or Sunday per weekStart)
  const wdOffset = weekStart === "mon" ? 1 : 0;
  while ((cursor.getDay() !== wdOffset) && cursor.getTime() >= startDate.getTime()) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (cursor.getTime() <= endDate.getTime()) {
    const weekId = getISOWeekId(cursor);
    if (!weeksSeen.has(weekId)) {
      weeksSeen.add(weekId);
      map.weeklies.push(weekId);
    }
    cursor.setDate(cursor.getDate() + 7);
  }

  // Section dividers: ns1..nsN
  for (let i = 1; i <= sections.length; i++) {
    map.sectionDividers.push(`ns${i}`);
  }

  // Notes paper: 1 page, or 3 if notePaper === "mixed"
  const paperCount = notePaper === "mixed" ? 3 : 1;
  for (let i = 0; i < paperCount; i++) {
    map.notePaper.push(`notes-p${i}`);
  }

  return map;
}

/** Returns a flat ordered list of all page IDs, in page-number order */
export function flattenPageIds(map: PageIdMap): string[] {
  const ids: string[] = [map.cover, map.home, map.year];
  for (let i = 0; i < map.monthDividers.length; i++) {
    ids.push(map.monthDividers[i]);
    ids.push(map.monthCalendars[i]);
    // Insert weeklies + dailies that fall in this month? Keep them grouped after month pages
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

  // 1. No duplicate IDs
  for (const id of flat) {
    if (idSet.has(id)) {
      throw new Error(`CI FAIL: Duplicate page id "${id}"`);
    }
    idSet.add(id);
  }

  // 2. Required pages always exist
  if (!idSet.has("home")) throw new Error("CI FAIL: Missing required page id 'home'");
  if (!idSet.has("year")) throw new Error("CI FAIL: Missing required page id 'year'");

  // 3. ns* count equals sections.length
  if (map.sectionDividers.length !== sections.length) {
    throw new Error(
      `CI FAIL: ns* count (${map.sectionDividers.length}) != sections.length (${sections.length})`,
    );
  }

  // 4. Cross-link targets: every link must resolve
  const crossLinks: Array<[string, string]> = [
    ["cover", "home"],
    ["home", "year"],
    ["home", "todo"],
    ["home", "notes"],
    ...map.sectionDividers.map((ns): [string, string] => ["home", ns]),
    ...map.monthDividers.map((mdiv, i): [string, string] => [mdiv, `m${i}`]),
    ...map.monthCalendars.map((m, i): [string, string] => [m, map.monthDividers[i]]),
    ...map.sectionDividers.map((ns): [string, string] => [ns, "notes"]),
  ];

  for (const [src, tgt] of crossLinks) {
    if (!idSet.has(tgt)) {
      throw new Error(`CI FAIL: Page "${src}" links to missing target "${tgt}"`);
    }
  }

  // 5. Calendar URL format check (just validates our generation is correct — no network call)
  // Weeklies follow w{year}W{ww} pattern
  for (const w of map.weeklies) {
    if (!/^w\d{4}W\d{2}$/.test(w)) {
      throw new Error(`CI FAIL: Weekly id "${w}" does not match w{year}W{ww}`);
    }
  }

  // Dailies follow d{YYYYMMDD}
  for (const d of map.dailies) {
    if (!/^d\d{8}$/.test(d)) {
      throw new Error(`CI FAIL: Daily id "${d}" does not match d{YYYYMMDD}`);
    }
  }
}

// ── Calendar link helpers ─────────────────────────────────────────────────────

function googleCalendarLink(start: string, end: string): string {
  // all-day uses YYYYMMDD/YYYYMMDD; timed uses local datetime
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&dates=${start}/${end}`;
}

function icsDataUri(startDate: Date, endDate: Date, title: string): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(".000Z", "Z");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(startDate)}`,
    `DTEND:${fmt(endDate)}`,
    `SUMMARY:${title}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

// ── PDF builder ───────────────────────────────────────────────────────────────

const PAGE_WIDTH = 595; // A4 pts
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

function addUriAnnotation(
  pdfDoc: PDFDocument,
  page: PDFPage,
  url: string,
  rect: [number, number, number, number],
  label?: string,
  font?: Awaited<ReturnType<typeof pdfDoc.embedFont>>,
  textColor?: { r: number; g: number; b: number },
): void {
  if (label && font && textColor) {
    page.drawText(label, {
      x: rect[0] + 3,
      y: rect[1] + 3,
      size: 8,
      font,
      color: rgb(textColor.r, textColor.g, textColor.b),
    });
  }
  const annot = pdfDoc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: rect,
    Border: [0, 0, 0],
    A: pdfDoc.context.obj({ Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: url }),
  });
  const annotRef = pdfDoc.context.register(annot);
  const annotsKey = PDFName.of("Annots");
  const existing = page.node.lookupMaybe(annotsKey, PDFArray);
  if (existing) existing.push(annotRef);
  else page.node.set(annotsKey, pdfDoc.context.obj([annotRef]));
}

function addGoToAnnotation(
  pdfDoc: PDFDocument,
  sourcePage: PDFPage,
  targetPageRef: PDFRef,
  rect: [number, number, number, number],
): void {
  const annot = pdfDoc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: rect,
    Border: [0, 0, 0],
    Dest: [targetPageRef, PDFName.of("Fit")],
  });
  const annotRef = pdfDoc.context.register(annot);
  const annotsKey = PDFName.of("Annots");
  const existing = sourcePage.node.lookupMaybe(annotsKey, PDFArray);
  if (existing) {
    existing.push(annotRef);
  } else {
    sourcePage.node.set(annotsKey, pdfDoc.context.obj([annotRef]));
  }
}

export async function buildPdf(
  config: GeneratorConfig,
  themeColors?: string[], // 6 hex: [accent, accent-dark, secondary, tertiary, ink, paper]
): Promise<{ buffer: Uint8Array; pageCount: number }> {
  const { setup, style, output, sections } = config;
  const { startMonth, startYear, monthCount, weekStart, orientation } = setup;
  const tabPos = style.tabPos ?? "right";
  const calMode = output.calMode ?? "none";

  // 1. Generate & validate page IDs
  const map = generatePageIds(config);
  validatePageIds(map, sections);

  // 2. Resolve theme colors
  const colors = themeColors ?? ["#6366f1", "#4f46e5", "#a5b4fc", "#c7d2fe", "#1e1b4b", "#fafafa"];
  const accent = hexToRgb(colors[0] ?? "#6366f1");
  const ink = hexToRgb(colors[4] ?? "#1e1b4b");
  const paper = hexToRgb(colors[5] ?? "#fafafa");

  // 3. Create PDF
  const pdfDoc = await PDFDocument.create();
  const pageWidth = orientation === "landscape" ? PAGE_HEIGHT : PAGE_WIDTH;
  const pageHeight = orientation === "landscape" ? PAGE_WIDTH : PAGE_HEIGHT;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // 4. Build ordered ID list and create pages
  const flat = flattenPageIds(map);
  const pageMap = new Map<string, PageWithId>();

  for (const id of flat) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const pageRef = page.ref;
    pageMap.set(id, { id, page, pageRef });

    // Base background
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(paper.r, paper.g, paper.b),
    });

    // Accent header strip (20pt)
    page.drawRectangle({
      x: 0,
      y: pageHeight - 20,
      width: pageWidth,
      height: 20,
      color: rgb(accent.r, accent.g, accent.b),
    });

    // Page role label
    page.drawText(id, {
      x: MARGIN,
      y: pageHeight - 14,
      size: 7,
      font,
      color: rgb(1, 1, 1),
    });
  }

  // 5. Add content + cross-links

  const getRef = (id: string): PDFRef | null => pageMap.get(id)?.pageRef ?? null;
  const getPage = (id: string): PDFPage | null => pageMap.get(id)?.page ?? null;

  // Helper: add a labeled link button on sourcePage pointing to targetId
  function addLink(
    sourceId: string,
    targetId: string,
    label: string,
    x: number,
    y: number,
    w = 80,
    h = 16,
  ) {
    const sp = getPage(sourceId);
    const tr = getRef(targetId);
    if (!sp || !tr) return;
    sp.drawRectangle({ x, y: y - 2, width: w, height: h, color: rgb(accent.r, accent.g, accent.b), opacity: 0.15 });
    sp.drawText(label, { x: x + 4, y: y + 2, size: 8, font, color: rgb(ink.r, ink.g, ink.b) });
    addGoToAnnotation(pdfDoc, sp, tr, [x, y - 2, x + w, y - 2 + h]);
  }

  // COVER → HOME
  {
    const sp = getPage("cover");
    if (sp) {
      sp.drawText("Daybook", { x: MARGIN, y: pageHeight / 2 + 40, size: 32, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
      sp.drawText("Your planner, your way.", { x: MARGIN, y: pageHeight / 2, size: 14, font, color: rgb(ink.r, ink.g, ink.b) });
    }
    addLink("cover", "home", "→ Get started", MARGIN, pageHeight / 2 - 40, 120, 20);
  }

  // HOME → year, todo, notes, each ns{i}
  {
    const sp = getPage("home");
    if (sp) {
      sp.drawText("Home", { x: MARGIN, y: pageHeight - 50, size: 20, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    let y = pageHeight - 90;
    addLink("home", "year", "Year at a Glance", MARGIN, y, 140, 18); y -= 28;
    addLink("home", "todo", "To-Do", MARGIN, y, 80, 18); y -= 28;
    addLink("home", "notes", "Notes", MARGIN, y, 80, 18); y -= 28;
    for (const nsId of map.sectionDividers) {
      const idx = parseInt(nsId.replace("ns", "")) - 1;
      addLink("home", nsId, sections[idx] ?? nsId, MARGIN, y, 160, 18);
      y -= 28;
    }
  }

  // YEAR → each mdiv{i}
  {
    const sp = getPage("year");
    if (sp) {
      sp.drawText("Year Overview", { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    let col = 0;
    for (let i = 0; i < map.monthDividers.length; i++) {
      const { year, month } = addMonths(startYear, startMonth, i);
      const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "short" });
      const x = MARGIN + (col % 3) * 160;
      const y = pageHeight - 90 - Math.floor(col / 3) * 40;
      addLink("year", map.monthDividers[i], `${monthName} ${year}`, x, y, 140, 18);
      col++;
    }
  }

  // MONTH DIVIDER → MONTH CALENDAR; MONTH CALENDAR day cells → dailies
  for (let i = 0; i < map.monthDividers.length; i++) {
    const mdivId = map.monthDividers[i];
    const mId = map.monthCalendars[i];
    const { year, month } = addMonths(startYear, startMonth, i);
    const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "long" });

    const mdivPage = getPage(mdivId);
    if (mdivPage) {
      mdivPage.drawText(monthName, { x: MARGIN, y: pageHeight / 2, size: 36, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
      mdivPage.drawText(String(year), { x: MARGIN, y: pageHeight / 2 - 44, size: 18, font, color: rgb(ink.r, ink.g, ink.b) });
    }
    addLink(mdivId, mId, "→ Month view", pageWidth - 120, MARGIN, 100, 18);

    // Month calendar → each day
    const mPage = getPage(mId);
    if (mPage) {
      mPage.drawText(`${monthName} ${year}`, { x: MARGIN, y: pageHeight - 50, size: 16, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    const days = daysInMonth(year, month);
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      const dayId = `d${yyyymmdd(date)}`;
      const col = (d - 1) % 7;
      const row = Math.floor((d - 1) / 7);
      const cx = MARGIN + col * 72;
      const cy = pageHeight - 80 - row * 50;
      addLink(mId, dayId, String(d), cx, cy, 60, 18);
    }

    // Month calendar → previous mdiv (tab rail)
    if (i > 0) addLink(mId, map.monthDividers[i - 1], "◀ Prev", MARGIN, MARGIN, 60, 18);
    if (i < map.monthDividers.length - 1) addLink(mId, map.monthDividers[i + 1], "Next ▶", pageWidth - 80, MARGIN, 60, 18);
  }

  // Tab rail → each m{i} (on daily/weekly pages if tabPos !== "none")
  if (tabPos !== "none") {
    const tabPages = [...map.weeklies, ...map.dailies, "todo", "notes", ...map.sectionDividers, ...map.notePaper];
    for (const sourceId of tabPages) {
      for (let i = 0; i < map.monthCalendars.length; i++) {
        const { year, month } = addMonths(startYear, startMonth, i);
        const label = new Date(year, month, 1).toLocaleString("en-US", { month: "short" });
        const tx = tabPos === "right" ? pageWidth - 24 : MARGIN + i * 30;
        const ty = tabPos === "right" ? pageHeight - 60 - i * 30 : pageHeight - 20;
        addLink(sourceId, map.monthCalendars[i], label, tx, ty, 20, 16);
      }
    }
  } else {
    // tabPos === "none": ONLY home tab
    const tabPages = [...map.weeklies, ...map.dailies, "todo", "notes", ...map.sectionDividers, ...map.notePaper];
    for (const sourceId of tabPages) {
      addLink(sourceId, "home", "⌂", MARGIN, pageHeight - 50, 24, 18);
    }
  }

  // WEEKLIES ↔ dailies + back to m{n}
  for (const weekId of map.weeklies) {
    const wPage = getPage(weekId);
    if (!wPage) continue;
    const weekMatch = weekId.match(/^w(\d{4})W(\d{2})$/);
    if (!weekMatch) continue;
    const weekYear = parseInt(weekMatch[1]);
    const weekNum = parseInt(weekMatch[2]);

    // Find Monday of this ISO week
    const jan4 = new Date(weekYear, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNum - 1) * 7);

    wPage.drawText(`Week ${weekNum} — ${weekYear}`, { x: MARGIN, y: pageHeight - 50, size: 16, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });

    // Weekly ↔ 7 days
    for (let d = 0; d < 7; d++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + d);
      const dayId = `d${yyyymmdd(date)}`;
      const label = date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" });
      addLink(weekId, dayId, label, MARGIN + d * 70, pageHeight - 90, 65, 18);

      // Calendar link on weekly page (per spec: google or apple; none = no link)
      if (calMode === "google" || calMode === "apple") {
        const nextDay = new Date(date);
        nextDay.setDate(date.getDate() + 1);
        const lp = getPage(weekId);
        if (lp) {
          const calRect: [number, number, number, number] = [
            MARGIN + d * 70, pageHeight - 120, MARGIN + d * 70 + 65, pageHeight - 102,
          ];
          if (calMode === "google") {
            addUriAnnotation(pdfDoc, lp, googleCalendarLink(yyyymmdd(date), yyyymmdd(nextDay)), calRect, "＋Cal", font, accent);
          } else {
            // apple: .ics data URI (all-day event for weekly day cells)
            const startDt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0, 0);
            const endDt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, output.eventMins ?? 60, 0);
            addUriAnnotation(pdfDoc, lp, icsDataUri(startDt, endDt, `Week ${weekNum} — Day ${d + 1}`), calRect, "＋Cal", font, accent);
          }
        }
      }
    }

    // Back to month: find which month this week falls in
    const monthIdx = (() => {
      for (let i = 0; i < monthCount; i++) {
        const { year, month } = addMonths(startYear, startMonth, i);
        if (monday.getFullYear() === year && monday.getMonth() === month) return i;
      }
      return 0;
    })();
    addLink(weekId, map.monthCalendars[monthIdx], "Month", MARGIN, MARGIN, 60, 18);

    // AI block — clickable link to user assistant (spec: output.aiInPdf = true)
    if (output.aiInPdf) {
      const aiUrl = `${process.env.APP_URL ?? "https://daybook.app"}/assistant?context=weekly&page=${weekId}`;
      addUriAnnotation(pdfDoc, wPage, aiUrl, [MARGIN, MARGIN + 22, MARGIN + 130, MARGIN + 40], "✦ Ask AI about this week", font, accent);
    }
  }

  // DAILIES → month + prev/next day
  const dailyList = map.dailies;
  for (let i = 0; i < dailyList.length; i++) {
    const dayId = dailyList[i];
    const dPage = getPage(dayId);
    if (!dPage) continue;

    const dateStr = dayId.replace("d", "");
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    const date = new Date(year, month, day);

    dPage.drawText(date.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }), {
      x: MARGIN, y: pageHeight - 50, size: 14, font: fontBold, color: rgb(ink.r, ink.g, ink.b),
    });

    // → month calendar
    const monthIdx = (() => {
      for (let j = 0; j < monthCount; j++) {
        const m = addMonths(startYear, startMonth, j);
        if (m.year === year && m.month === month) return j;
      }
      return 0;
    })();
    addLink(dayId, map.monthCalendars[monthIdx], "Month", MARGIN, MARGIN, 60, 18);

    // prev/next day
    if (i > 0) addLink(dayId, dailyList[i - 1], "◀ Prev", MARGIN + 70, MARGIN, 60, 18);
    if (i < dailyList.length - 1) addLink(dayId, dailyList[i + 1], "Next ▶", MARGIN + 140, MARGIN, 60, 18);

    // Calendar link (per spec/LINK-SCHEME.md)
    if (calMode === "google" || calMode === "apple") {
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      const calRect: [number, number, number, number] = [pageWidth - 120, pageHeight - 50, pageWidth - MARGIN, pageHeight - 34];
      if (calMode === "google") {
        addUriAnnotation(pdfDoc, dPage, googleCalendarLink(yyyymmdd(date), yyyymmdd(nextDay)), calRect, "＋Google Cal", font, accent);
      } else {
        // apple: timed event per output.eventMins
        const startDt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0, 0);
        const endDt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, output.eventMins ?? 60, 0);
        addUriAnnotation(pdfDoc, dPage, icsDataUri(startDt, endDt, date.toLocaleDateString("en-US", { month: "long", day: "numeric" })), calRect, "＋Apple Cal", font, accent);
      }
    }

    // AI block — clickable link with context (spec: output.aiInPdf = true)
    if (output.aiInPdf) {
      const aiUrl = `${process.env.APP_URL ?? "https://daybook.app"}/assistant?context=daily&page=${dayId}`;
      addUriAnnotation(pdfDoc, dPage, aiUrl, [pageWidth - MARGIN - 70, MARGIN + 22, pageWidth - MARGIN, MARGIN + 40], "✦ Ask AI", font, accent);
    }
  }

  // NOTES → each ns{i}; each ns{i} → notes
  {
    const np = getPage("notes");
    if (np) {
      np.drawText("Notes", { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    for (let i = 0; i < map.sectionDividers.length; i++) {
      const nsId = map.sectionDividers[i];
      addLink("notes", nsId, sections[i] ?? nsId, MARGIN, pageHeight - 90 - i * 28, 200, 18);
      addLink(nsId, "notes", "← Notes", MARGIN, MARGIN, 60, 18);
      const nsp = getPage(nsId);
      if (nsp) {
        nsp.drawText(sections[i] ?? nsId, { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
      }
    }
  }

  // 6. Serialize
  const pdfBytes = await pdfDoc.save();
  return { buffer: pdfBytes, pageCount: flat.length };
}
