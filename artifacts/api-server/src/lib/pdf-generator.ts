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
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  type PDFFont,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Buffer } from "node:buffer";
import { promises as fsPromises } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { getEinkPreset, getEinkRule } from "./eink-presets";
import { parseHexColor } from "./color";
import type {
  PlannerSetup,
  PlannerStyle,
  PlannerOutput,
  PlannerWidgetPlacement,
  ThemeFontPairing,
} from "@workspace/db";
import { getPlannerPageCounts } from "@workspace/db/planner-pages";
import { sanitizeSvg } from "./svg-contract";
import { placementAppliesToPage } from "./planner-composition";
import {
  type PageIdMap,
  type PageRole,
  type PlannerTemplate,
  type StampContext,
  type UserHotspot,
  DEFAULT_TEMPLATE,
  addGoToAnnotation,
  addUriAnnotation,
  stampPageZones,
  stampUserHotspots,
  validateTemplate,
} from "./pdf-template";

// ── Types ─────────────────────────────────────────────────────────────────────

export type { PageIdMap, UserHotspot } from "./pdf-template";

/**
 * Resolved background to render as the page base layer.
 * Fetched from backgroundsTable before calling buildPdf/buildPreviewPdf.
 * color  → assetRef is a hex string (#RRGGBB)
 * image  → assetRef is a base64 PNG/JPG data URL
 * texture→ assetRef is a base64 PNG/JPG data URL (tiled patterns handled as full-cover image)
 */
export interface BackgroundSpec {
  id?: string | null;
  name?: string | null;
  type: string;      // "color" | "texture" | "image"
  assetRef?: string | null;
}

export interface BackgroundRenderWarning {
  backgroundId: string | null;
  backgroundName: string | null;
  backgroundType: "image" | "texture";
  reason: "missing_asset" | "embed_failed";
}

export interface SpineSpec {
  id?: string;
  name: string;
  assetRef: string;
  unitAspect: number;
  gapRatio: number;
  orientation: "vertical" | "horizontal";
}

export interface SpineTile {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetRenderSpec {
  id: string;
  name: string;
  svgData: string;
}

function pageTarget(map: PageIdMap, id: string): { pageType: string; pageIndex: number } | null {
  const exact: Record<string, string> = {
    cover: "cover",
    home: "home",
    year: "year",
    todo: "todo",
    notes: "notes",
  };
  if (exact[id]) return { pageType: exact[id], pageIndex: 0 };
  const groups: Array<[string, string[]]> = [
    ["month-divider", map.monthDividers],
    ["month-calendar", map.monthCalendars],
    ["weekly", map.weeklies],
    ["daily", map.dailies],
    ["section-divider", map.sectionDividers],
    ["note-paper", map.notePaper],
  ];
  for (const [pageType, ids] of groups) {
    const pageIndex = ids.indexOf(id);
    if (pageIndex >= 0) return { pageType, pageIndex };
  }
  return null;
}

async function stampWidgetComposition(
  pdfDoc: PDFDocument,
  pageMap: Map<string, PageWithId>,
  map: PageIdMap,
  style: PlannerStyle,
  pageWidth: number,
  pageHeight: number,
  colors: string[],
  labelFont: PDFFont,
  widgetSpecs?: WidgetRenderSpec[],
): Promise<void> {
  const placements = style.composition?.placements ?? [];
  if (placements.length === 0) return;
  const specs = new Map((widgetSpecs ?? []).map((widget) => [widget.id, widget]));
  const images = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  const slotColors: Record<string, string> = {
    accent: colors[0] ?? "#6366f1",
    secondary: colors[2] ?? "#a5b4fc",
    tertiary: colors[3] ?? "#c7d2fe",
    ink: colors[4] ?? "#1e1b4b",
    paper: colors[5] ?? "#fafafa",
  };

  for (const placement of placements) {
    const selectedSlot = placement.settings?.paletteSlot ?? "accent";
    const imageKey = `${placement.widgetId}:${selectedSlot}`;
    if (placement.settings?.visible === false || images.has(imageKey)) continue;
    const widget = specs.get(placement.widgetId);
    if (!widget?.svgData) throw new Error(`Widget ${placement.widgetId} cannot be rendered`);
    let svg = sanitizeSvg(widget.svgData);
    for (const [slot, defaultColor] of Object.entries(slotColors)) {
      const color = slot === "accent" ? (slotColors[selectedSlot] ?? defaultColor) : defaultColor;
      svg = svg.replaceAll(`{{slot:${slot}}}`, color);
    }
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    images.set(imageKey, await pdfDoc.embedPng(png));
  }

  for (const [id, entry] of pageMap) {
    const target = pageTarget(map, id);
    if (!target) continue;
    for (const placement of placements) {
      if (
        placement.settings?.visible === false ||
        !placementAppliesToPage(placement, target.pageType, target.pageIndex)
      ) continue;
      const image = images.get(`${placement.widgetId}:${placement.settings?.paletteSlot ?? "accent"}`);
      if (!image) throw new Error(`Widget ${placement.widgetId} cannot be rendered`);
      const x = placement.x * pageWidth;
      const y = pageHeight - (placement.y + placement.h) * pageHeight;
      const width = placement.w * pageWidth;
      const height = placement.h * pageHeight;
      entry.page.drawImage(image, {
        x, y, width, height,
      });
      if (placement.settings?.label?.trim()) {
        entry.page.drawText(placement.settings.label.trim(), {
          x: x + 3,
          y: y + height - 10,
          size: 8,
          font: labelFont,
          color: rgb(0.1, 0.1, 0.1),
          maxWidth: Math.max(1, width - 6),
        });
      }
    }
  }
}

/**
 * Binding-edge rule: vertical assets tile up the left edge; horizontal assets
 * tile across the top edge. The media box clips the final partial tile.
 */
export function calculateSpineTiles(
  pageWidth: number,
  pageHeight: number,
  spine?: Pick<SpineSpec, "unitAspect" | "gapRatio" | "orientation"> | null,
): SpineTile[] {
  if (!spine || spine.unitAspect <= 0 || pageWidth <= 0 || pageHeight <= 0) return [];
  const gapRatio = Math.max(0, spine.gapRatio);
  const tiles: SpineTile[] = [];
  if (spine.orientation === "horizontal") {
    const height = Math.min(60, pageHeight * 0.14);
    const width = height * spine.unitAspect;
    const step = width * (1 + gapRatio);
    for (let x = 0; x < pageWidth; x += step) tiles.push({ x, y: pageHeight - height, width, height });
  } else {
    const maxWidth = Math.min(60, pageWidth * 0.14);
    const height = Math.min(pageHeight, maxWidth / spine.unitAspect);
    const width = height * spine.unitAspect;
    const step = height * (1 + gapRatio);
    for (let y = 0; y < pageHeight; y += step) tiles.push({ x: 0, y, width, height });
  }
  return tiles;
}

async function embedSpineImage(pdfDoc: PDFDocument, spine?: SpineSpec | null) {
  if (!spine?.assetRef?.startsWith("data:image/")) return null;
  const b64 = spine.assetRef.replace(/^data:image\/[a-z+]+;base64,/, "");
  const bytes = Buffer.from(b64, "base64");
  const metadata = await sharp(bytes).metadata();
  if (!metadata.hasAlpha) {
    console.warn(`[pdf-generator] Spine style "${spine.name}" has no alpha channel; rendering opaque asset`);
  }
  return spine.assetRef.startsWith("data:image/png")
    ? pdfDoc.embedPng(bytes)
    : pdfDoc.embedJpg(bytes);
}

function drawSpineTiles(page: PDFPage, pageWidth: number, pageHeight: number, image: Awaited<ReturnType<typeof embedSpineImage>>, spine?: SpineSpec | null): void {
  if (!image || !spine) return;
  page.pushOperators(pushGraphicsState(), rectangle(0, 0, pageWidth, pageHeight), clip(), endPath());
  for (const tile of calculateSpineTiles(pageWidth, pageHeight, spine)) {
    page.drawImage(image, tile);
  }
  page.pushOperators(popGraphicsState());
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

export function getMonthGridOffset(
  year: number,
  month: number,
  weekStart: PlannerSetup["weekStart"],
): number {
  const firstDay = new Date(year, month, 1).getDay();
  const weekStartDay = weekStart === "mon" ? 1 : 0;
  return (firstDay - weekStartDay + 7) % 7;
}

export function getPlannerWeekStart(
  date: Date,
  weekStart: PlannerSetup["weekStart"],
): Date {
  const result = new Date(date);
  const weekStartDay = weekStart === "mon" ? 1 : 0;
  const daysBack = (result.getDay() - weekStartDay + 7) % 7;
  result.setDate(result.getDate() - daysBack);
  return result;
}

export function getWeekStartDate(
  weekId: string,
  weekStart: PlannerSetup["weekStart"],
): Date | null {
  const match = weekId.match(/^w(\d{4})W(\d{2})$/);
  if (!match) return null;
  const weekYear = Number(match[1]);
  const weekNum = Number(match[2]);
  const jan4 = new Date(weekYear, 0, 4);
  const isoMonday = new Date(jan4);
  isoMonday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNum - 1) * 7);
  if (weekStart === "sun") isoMonday.setDate(isoMonday.getDate() + 6);
  return isoMonday;
}

// ── Page ID generation ────────────────────────────────────────────────────────

export function generatePageIds(config: GeneratorConfig): PageIdMap {
  const { setup, style, sections } = config;
  const { startMonth, startYear, monthCount, weekStart } = setup;
  const tabPos = style.tabPos ?? "right";
  const notePaper = style.notePaper ?? "dot";
  const pageCounts = getPlannerPageCounts(setup, { sections, notePaper });

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
  const weeksSeen = new Set<string>();
  const cursor = getPlannerWeekStart(startDate, weekStart);
  for (let i = 0; i < pageCounts.weekly; i++) {
    const weekId = getISOWeekId(cursor);
    if (!weeksSeen.has(weekId)) { weeksSeen.add(weekId); map.weeklies.push(weekId); }
    cursor.setDate(cursor.getDate() + 7);
  }

  for (let i = 1; i <= sections.length; i++) {
    map.sectionDividers.push(`ns${i}`);
  }

  for (let i = 0; i < pageCounts["note-paper"]; i++) {
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

/** Page dimensions in PDF points (1pt = 1/72 in) for each supported size key. */
const PAGE_SIZES: Record<string, { w: number; h: number }> = {
  "a4":          { w: 595, h: 842 },
  "a5":          { w: 420, h: 595 },
  "b6":          { w: 354, h: 499 },
  "personal":    { w: 270, h: 485 },   // Filofax Personal 95×171mm
  "half-letter": { w: 396, h: 612 },   // 5.5×8.5in
  "letter":      { w: 612, h: 792 },   // 8.5×11in
  "ipad-4-3":    { w: 576, h: 768 },   // 8×10.67in (iPad 4:3)
};
const PAGE_WIDTH  = 595;  // A4 default
const PAGE_HEIGHT = 842;
const BASE_MARGIN = 40;

export function getLegacyEinkMargin(einkDevice: string | null | undefined): number {
  const preset = getEinkPreset(einkDevice ?? null);
  if (!preset) return BASE_MARGIN;
  const toolbarRule = getEinkRule("toolbar_margin");
  return toolbarRule?.enabled !== false
    ? Math.max(BASE_MARGIN, preset.safeInset, toolbarRule?.threshold ?? 0)
    : BASE_MARGIN;
}

interface PageWithId {
  id: string;
  page: PDFPage;
  pageRef: PDFRef;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = parseHexColor(hex);
  if (clean === "none") throw new Error('Background colour cannot be "none"');
  return {
    r: parseInt(clean.slice(1, 3), 16) / 255,
    g: parseInt(clean.slice(3, 5), 16) / 255,
    b: parseInt(clean.slice(5, 7), 16) / 255,
  };
}

/**
 * Google Font families that map to the PDF Times Roman standard font.
 * All others fall back to Helvetica (sans default).
 * Used only as the offline/error fallback path when real font fetch fails.
 */
const SERIF_PDF_FAMILIES = new Set([
  "Playfair Display",
  "Lora",
  "Cormorant Garamond",
  "DM Serif Display",
  "Spectral",
  "Merriweather",
  "EB Garamond",
]);

/**
 * Every Google Font family reachable from a UI picker (Theme Studio suggested
 * pairings, fonts-catalog seed rows, Planner Studio theme font slots).
 *
 * Used by:
 *   • font-warmup — cross-checks that every family here has a bundled WOFF file.
 *   • Generation routes — distinguish "expected gap still un-bundled" from
 *     "network failure on a family that should be offline-ready".
 */
export const UI_REACHABLE_FAMILIES = new Set([
  // ── Theme Studio SUGGESTED_PAIRS (both slots of every preset) ────────────
  "Playfair Display",   "Lato",
  "Cormorant Garamond", "Source Sans Pro",
  "Spectral",           "Work Sans",
  "Crimson Pro",        "Instrument Sans",
  "DM Serif Display",   "DM Sans",
  "EB Garamond",        "Inter",
  // ── Fonts-catalog seed (theme_fonts → PDF generation) ───────────────────
  "Lora",
  "Space Grotesk",
  "Nunito Sans",
  // ── SC variants used directly by the planner generator ──────────────────
  "Playfair Display SC",
  "Cormorant SC",
]);

/**
 * Font families that ship only a single weight (400) upstream.
 * When a bold role (heading) resolves to one of these, the generator uses 400
 * rather than requesting a 700 file that does not exist.
 * No 700 WOFF should exist on disk for any family in this set.
 */
export const SINGLE_WEIGHT_FAMILIES = new Set([
  "DM Serif Display",
]);

/**
 * Resolve the nearest StandardFont for a given font family name.
 * Serif families → Times Roman / Times Bold Roman.
 * Everything else → Helvetica / Helvetica Bold (sans default).
 * Used as fallback when Google Fonts fetch fails or family is undefined.
 */
export function resolveStandardFont(familyName: string | undefined, bold: boolean): StandardFonts {
  if (familyName && SERIF_PDF_FAMILIES.has(familyName)) {
    return bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
  }
  return bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
}

// ── Google Fonts embedding ─────────────────────────────────────────────────────

/**
 * In-process cache of downloaded font binaries.
 * Key: `${familyName}:${weight}` — e.g. "Lora:400", "Playfair Display:700"
 * Persists for the lifetime of the process, so repeated generation calls for the
 * same family skip the network round-trip entirely.
 */
// Exported for test access only — do not import from production code paths.
export const _googleFontCache = new Map<string, Uint8Array>();

// ── Disk font cache ────────────────────────────────────────────────────────────

/**
 * Root directory for the disk-based font cache.
 * /tmp survives across hot-reloads in the same container but is cleared on
 * a full machine restart — still far cheaper than a cold download per request.
 */
const GFONT_DISK_DIR = "/tmp/gfont-cache";

/**
 * Convert a font cache key ("Playfair Display:700") into a safe filesystem path.
 * Spaces → underscore, colon → hyphen, everything else non-alphanumeric → removed.
 */
// Exported for test access only — allows tests to compute the expected disk path.
export function _diskCachePath(familyName: string, weight: 400 | 700): string {
  const safe = `${familyName.replace(/\s+/g, "_")}-${weight}.ttf`
    .replace(/[^A-Za-z0-9_\-.]/g, "");
  return path.join(GFONT_DISK_DIR, safe);
}

/**
 * Fire-and-forget: write font bytes to disk.
 * Any I/O error (EROFS, ENOSPC, EPERM …) is swallowed so it never delays or
 * fails the current PDF generation request.
 */
function _writeDiskFontCache(filePath: string, bytes: Uint8Array): void {
  fsPromises.mkdir(path.dirname(filePath), { recursive: true })
    .then(() => fsPromises.writeFile(filePath, bytes))
    .catch((err: Error) =>
      console.warn("[pdf-generator] Disk font cache write failed:", err.message),
    );
}

// ── Bundled font assets ─────────────────────────────────────────────────────
// build.mjs copies src/lib/fonts → dist/fonts so these are co-located with
// the compiled bundle.  Loading from disk here means font rendering is
// completely independent of network availability.
// import.meta.url works in both tsx (ESM source) and the esbuild bundle
// (where the banner also provides globalThis.__dirname for compat).
const BUNDLED_FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts");

export function _bundledFontPath(familyName: string, weight: 400 | 700): string {
  const safe = `${familyName.replace(/\s+/g, "_")}-${weight}.woff`
    .replace(/[^A-Za-z0-9_\-.]/g, "");
  return path.join(BUNDLED_FONT_DIR, safe);
}

// ── Font fallback tracking ───────────────────────────────────────────────────
/** Families that fell back to StandardFonts in the current process. */
const FONT_FALLBACK_FAMILIES = new Set<string>();
/** Returns the family names that are rendering in StandardFonts, not the real typeface. */
export function getFontFallbacks(): string[] { return [...FONT_FALLBACK_FAMILIES]; }

/**
 * Firefox 26 on Linux UA — makes the Google Fonts CSS v1 API return TTF format
 * URLs (not EOT for old IE, not WOFF2 for modern browsers).
 */
const GFONT_TTF_UA =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:26.0) Gecko/20100101 Firefox/26.0";

/**
 * Validate font binary magic bytes.
 * TTF:  00 01 00 00  (standard) or  74 72 75 65  ("true" — Apple variant)
 * OTF:  4F 54 54 4F  ("OTTO")
 * Returns "TTF", "OTF", "WOFF" (v1 — fontkit can embed), or null for WOFF2/EOT/other.
 * WOFF v1 bytes can be passed directly to pdf-lib embedFont because fontkit parses and
 * converts the compressed sfnt data internally; only WOFF2 (wOF2) requires decompression
 * that the current fontkit build does not expose to pdf-lib.
 */
function detectFontFormat(bytes: Uint8Array): "TTF" | "OTF" | "WOFF" | null {
  const isTTF =
    (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) ||
    (bytes[0] === 0x74 && bytes[1] === 0x72 && bytes[2] === 0x75 && bytes[3] === 0x65);
  if (isTTF) return "TTF";
  const isOTF =
    bytes[0] === 0x4f && bytes[1] === 0x54 && bytes[2] === 0x54 && bytes[3] === 0x4f;
  if (isOTF) return "OTF";
  // WOFF v1: 77 4f 46 46 ("wOFF") — Google Fonts CSS API returns this format on restricted networks.
  const isWOFF = bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x46;
  if (isWOFF) return "WOFF";
  return null;
}

/**
 * Extract the best candidate font download URL from a Google Fonts CSS response.
 * Prefers entries explicitly tagged format('truetype') or format('opentype');
 * falls back to the first bare src: url() if no tagged entry is found.
 */
function extractFontUrl(cssText: string): string | null {
  const ttMatch = cssText.match(
    /url\(([^)]+)\)\s+format\(['"](?:truetype|opentype)['"]\)/,
  );
  if (ttMatch) return ttMatch[1].trim().replace(/['"]/g, "");
  const anyMatch = cssText.match(/src:\s*url\(([^)]+)\)/);
  if (anyMatch) return anyMatch[1].trim().replace(/['"]/g, "");
  return null;
}

/**
 * Fetch one CSS stylesheet from Google Fonts and return the text.
 * Returns null on HTTP error or network timeout.
 */
async function fetchGoogleFontsCss(
  cssUrl: string,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(cssUrl, {
      headers: { "User-Agent": GFONT_TTF_UA },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[pdf-generator] Google Fonts CSS HTTP ${res.status} (${cssUrl})`);
      return null;
    }
    return await res.text();
  } catch (err) {
    console.warn(
      `[pdf-generator] Google Fonts CSS fetch error (${cssUrl}):`,
      (err as Error).message,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Download a font binary from the given URL and return its bytes.
 * Returns null on HTTP error or network timeout.
 */
async function downloadFontBinary(
  fontUrl: string,
  label: string,
  timeoutMs: number,
): Promise<Uint8Array | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(fontUrl, { signal: controller.signal });
    if (!res.ok) {
      console.warn(
        `[pdf-generator] Font binary HTTP ${res.status} for "${label}" (${fontUrl})`,
      );
      return null;
    }
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    console.warn(
      `[pdf-generator] Font binary fetch error for "${label}" (${fontUrl}):`,
      (err as Error).message,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a TTF/OTF binary for a Google Font family + numeric weight.
 *
 * Multi-strategy approach for robustness across network environments:
 *
 *  Strategy A — CSS v1 with Firefox-26 UA:
 *    `fonts.googleapis.com/css?family=…:weight`
 *    The Firefox-26 UA directs Google Fonts to emit TTF format URLs.
 *    Works in most environments but some CDN edge nodes may still serve WOFF.
 *
 *  Strategy B — CSS v2 with Firefox-26 UA:
 *    `fonts.googleapis.com/css2?family=…:wght@weight&display=swap`
 *    CSS v2 emits explicit `format('truetype')` / `format('woff2')` tags per
 *    @font-face block.  We only accept entries tagged truetype/opentype, so
 *    WOFF2 blocks are skipped and we grab a real TTF URL when one exists.
 *
 *  In both cases the downloaded bytes are validated against TTF/OTF magic bytes.
 *  If Strategy A yields WOFF bytes, Strategy B is attempted before giving up.
 *
 *  The result is written to both the in-process map and the /tmp disk cache.
 *  Returns null — never throws — on any failure so callers fall back to StandardFonts.
 */
export async function fetchGoogleFontBytes(familyName: string, weight: 400 | 700): Promise<Uint8Array | null> {
  const cacheKey = `${familyName}:${weight}`;

  // 0. In-process cache — fastest path, zero I/O.
  const cached = _googleFontCache.get(cacheKey);
  if (cached) return cached;

  // 1. Bundled font — shipped alongside the server binary; immune to network.
  const bundledPath = _bundledFontPath(familyName, weight);
  try {
    const bundledRaw = await fsPromises.readFile(bundledPath);
    const bytes = new Uint8Array(bundledRaw.buffer, bundledRaw.byteOffset, bundledRaw.byteLength);
    const fmt = detectFontFormat(bytes);
    if (fmt) {
      _googleFontCache.set(cacheKey, bytes);
      console.log(`[pdf-generator] Font loaded from bundle: "${cacheKey}" ${Math.round(bytes.byteLength / 1024)} KB (${fmt})`);
      return bytes;
    }
  } catch {
    // Bundled asset not present — fall through to disk cache then network.
  }

  // 2. Disk cache — survives server restarts within the same container so the
  //    first generation after a hot-reload doesn't pay the network round-trip.
  const diskPath = _diskCachePath(familyName, weight);
  try {
    const diskBytes = await fsPromises.readFile(diskPath);
    const bytes = new Uint8Array(diskBytes.buffer, diskBytes.byteOffset, diskBytes.byteLength);
    _googleFontCache.set(cacheKey, bytes); // backfill in-process cache
    console.log(`[pdf-generator] Google Font loaded from disk cache: "${cacheKey}" ${Math.round(bytes.byteLength / 1024)} KB`);
    return bytes;
  } catch {
    // Cache miss (ENOENT) or unreadable — fall through to network fetch.
  }

  const TIMEOUT_MS = 5000;

  // ── Strategy A: CSS v1 ──────────────────────────────────────────────────────
  // One @font-face block per weight; Firefox-26 UA should yield TTF format URLs.
  const cssV1Url = `https://fonts.googleapis.com/css?family=${encodeURIComponent(familyName)}:${weight}`;

  try {
    const cssText = await fetchGoogleFontsCss(cssV1Url, TIMEOUT_MS);
    if (cssText) {
      const fontUrl = extractFontUrl(cssText);
      if (fontUrl) {
        const bytes = await downloadFontBinary(fontUrl, `${familyName}:${weight}`, TIMEOUT_MS);
        if (bytes) {
          const fmt = detectFontFormat(bytes);
          if (fmt) {
            _googleFontCache.set(cacheKey, bytes);
            _writeDiskFontCache(diskPath, bytes);
            console.log(
              `[pdf-generator] Google Font fetched & cached (CSS v1): "${cacheKey}" ${Math.round(bytes.byteLength / 1024)} KB (${fmt})`,
            );
            return bytes;
          }
          // WOFF2 or unknown format — not embeddable via current fontkit build.
          const magic = Array.from(bytes.slice(0, 4))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
          console.warn(
            `[pdf-generator] CSS v1 returned non-embeddable format for "${cacheKey}" (magic: ${magic}) — trying CSS v2`,
          );
        }
      } else {
        console.warn(`[pdf-generator] No font URL in CSS v1 response for "${cacheKey}" — trying CSS v2`);
      }
    }
  } catch (err) {
    console.warn(
      `[pdf-generator] CSS v1 strategy error for "${cacheKey}":`,
      (err as Error).message,
    );
  }

  // ── Strategy B: CSS v2 ──────────────────────────────────────────────────────
  // CSS v2 emits per-block format() tags. With Firefox-26 UA, TTF-tagged blocks
  // appear alongside WOFF2 blocks; extractFontUrl() picks format('truetype') first.
  const cssV2Url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyName)}:wght@${weight}&display=swap`;

  try {
    const cssText = await fetchGoogleFontsCss(cssV2Url, TIMEOUT_MS);
    if (cssText) {
      const fontUrl = extractFontUrl(cssText);
      if (fontUrl) {
        const bytes = await downloadFontBinary(fontUrl, `${familyName}:${weight}`, TIMEOUT_MS);
        if (bytes) {
          const fmt = detectFontFormat(bytes);
          if (fmt) {
            _googleFontCache.set(cacheKey, bytes);
            _writeDiskFontCache(diskPath, bytes);
            console.log(
              `[pdf-generator] Google Font fetched & cached (CSS v2): "${cacheKey}" ${Math.round(bytes.byteLength / 1024)} KB (${fmt})`,
            );
            return bytes;
          }
          const magic = Array.from(bytes.slice(0, 4))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(" ");
          console.warn(
            `[pdf-generator] CSS v2 also returned non-embeddable format for "${cacheKey}" (magic: ${magic}) — falling back to StandardFonts`,
          );
        }
      } else {
        console.warn(`[pdf-generator] No TTF-tagged font URL in CSS v2 response for "${cacheKey}" — falling back to StandardFonts`);
      }
    }
  } catch (err) {
    console.warn(
      `[pdf-generator] CSS v2 strategy error for "${cacheKey}":`,
      (err as Error).message,
    );
  }

  return null;
}

/**
 * Embed a font into the PDF document, preferring the real TTF/OTF binary from
 * Google Fonts over the StandardFonts fallback.
 * Falls back to StandardFonts on any fetch failure, format-validation failure,
 * or pdf-lib embed error — with a distinct warning log for each failure mode.
 */
async function resolveEmbeddedFont(
  pdfDoc: PDFDocument,
  familyName: string | undefined,
  bold: boolean,
  /** Optional per-generation set — populated alongside the global FONT_FALLBACK_FAMILIES. */
  fallbackLog?: Set<string>,
) {
  if (familyName) {
    // Single-weight families have no 700 file on disk or upstream.
    // Use 400 for every role rather than serving a fake duplicate weight.
    const isSingleWeight = SINGLE_WEIGHT_FAMILIES.has(familyName);
    if (bold && isSingleWeight) {
      console.log(
        `[pdf-generator] "${familyName}" is single-weight — bold role rendered at 400 (no 700 variant exists).`,
      );
    }
    const bytes = await fetchGoogleFontBytes(familyName, (bold && !isSingleWeight) ? 700 : 400);
    if (bytes) {
      try {
        const embedded = await pdfDoc.embedFont(bytes);
        // Validation: full round-trip render on a throw-away document so we exercise
        // TTFGlyph._getCBox (glyph bounding-box access).  widthOfTextAtSize only touches
        // advanceWidth tables, which succeed even when the glyph data is truncated.
        // save() forces pdf-lib to finalise all glyph streams, triggering the same
        // crash path as buildPdf/drawText — but here inside the try-catch.
        //
        // We test ALL 95 printable ASCII characters (0x20–0x7E) because WOFF subsets
        // can be truncated at specific glyph indices — testing only a name-plus-digit
        // sample misses corruptions that show up on less-common printable chars.
        const probeChars = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
        const probeDoc = await PDFDocument.create();
        probeDoc.registerFontkit(fontkit);
        const probeFont = await probeDoc.embedFont(bytes);
        const probePg = probeDoc.addPage([500, 50]);
        probePg.drawText(probeChars, { font: probeFont, size: 9 });
        await probeDoc.save();  // forces full glyph-table access
        return embedded;
      } catch (err) {
        // Distinct log: embed pipeline failure is different from a network failure.
        console.warn(
          `[pdf-generator] embedFont pipeline error for "${familyName}" — falling back to StandardFonts:`,
          (err as Error).message,
        );
      }
    }
  }
  if (familyName) {
    FONT_FALLBACK_FAMILIES.add(familyName);
    fallbackLog?.add(familyName);
  }
  return pdfDoc.embedFont(resolveStandardFont(familyName, bold));
}

/** Shared embedded-font resolver for SVG-authored planner interiors. */
export async function resolvePlannerInteriorFont(
  pdfDoc: PDFDocument,
  familyName: string | undefined,
  bold: boolean,
): Promise<PDFFont> {
  pdfDoc.registerFontkit(fontkit);
  return resolveEmbeddedFont(pdfDoc, familyName, bold);
}

// ── Shared e-ink helper factory ──────────────────────────────────────────────
/**
 * Returns the lt/lo/skipLinks helpers and preset metadata for the given device
 * key. Both buildPdf and the export-backed buildPreviewPdf call this so the
 * enforcement is identical — the preview is always truthful about the export.
 */
function makeEinkHelpers(einkDevice: string | null | undefined) {
  const einkPreset = getEinkPreset(einkDevice ?? null);
  const einkMode = !!einkPreset;
  const grayscaleRule = getEinkRule("grayscale");
  const lineRule = getEinkRule("line_weight");
  const lineFloor = lineRule?.threshold ?? 0.75;
  /** Enforce the configured minimum on any drawn line in e-ink mode. */
  const lt = (n: number) => einkMode && lineRule?.enabled !== false ? Math.max(n, lineFloor) : n;
  /** Enforce ≥ 0.30 opacity on content strokes so faint rules remain visible on e-ink. */
  const lo = (n: number) => einkMode ? Math.max(n, 0.30) : n;
  /** Suppress URI annotations on Kindle Scribe — links are unreliable via Send-to-Kindle. */
  const skipLinks = einkMode && (einkPreset?.linksQuality === "poor");
  const forceGrayscale = einkMode && grayscaleRule?.enabled !== false;
  const margin = getLegacyEinkMargin(einkDevice);
  return { einkPreset, einkMode, forceGrayscale, lt, lo, skipLinks, margin } as const;
}

export async function buildPdf(
  config: GeneratorConfig,
  themeColors?: string[],
  template: PlannerTemplate = DEFAULT_TEMPLATE,
  background?: BackgroundSpec,
  fontPairing?: ThemeFontPairing,
  hotspotsByTemplate?: Map<string, UserHotspot[]>,
  inkFriendly = false,
  einkDevice?: string,
  /** When true, append a final diagnostic page carrying build metadata.
   *  Gate this behind a flag — never set it on buyer-facing generations. */
  diagnosticPage = false,
  spine?: SpineSpec | null,
  widgetSpecs?: WidgetRenderSpec[],
): Promise<{
  buffer: Uint8Array;
  pageCount: number;
  fontSubstitutions: string[];
  backgroundWarnings: BackgroundRenderWarning[];
  totalLinkAnnotations?: number;
}> {
  const { einkPreset, forceGrayscale, lt, lo, skipLinks, margin: MARGIN } = makeEinkHelpers(einkDevice);
  // E-ink mode forces ink-friendly (grayscale is the e-ink asset)
  if (forceGrayscale) inkFriendly = true;

  const { setup, style, output, sections } = config;
  const { startMonth, startYear, monthCount, weekStart, orientation } = setup;
  const tabPos      = (style.tabPos ?? "right") as "right" | "top" | "none";
  const calMode     = output.calMode ?? "none";
  // Dating mode + binding + cover — read from JSONB style/setup fields
  const datingMode  = ((setup as Record<string, unknown>).datingMode as string | undefined) ?? "dated";
  const coverTitle    = (style as Record<string, unknown>).coverTitle as string | undefined;
  const coverSubtitle = (style as Record<string, unknown>).coverSubtitle as string | undefined;
  const coverYear     = (style as Record<string, unknown>).coverYear;  // false = suppress year
  const showCoverYear = coverYear !== false && datingMode === "dated";
  const coverYearText = String(typeof coverYear === "number" ? coverYear : startYear);
  const coverTitleText = (coverTitle ?? "Daybook")
    .replace(new RegExp(`\\s*${coverYearText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "")
    .trim() || "Daybook";

  // 1. Generate & validate page IDs + template
  const map = generatePageIds(config);
  validatePageIds(map, sections);
  validateTemplate(template, map, sections);

  // 2. Resolve theme colors
  const colors = themeColors ?? ["#6366f1", "#4f46e5", "#a5b4fc", "#c7d2fe", "#1e1b4b", "#fafafa"];
  // In ink-friendly mode: pure black for all ink/accent, pure white for paper
  const accent = inkFriendly ? { r: 0, g: 0, b: 0 } : hexToRgb(colors[0] ?? "#6366f1");
  const ink    = inkFriendly ? { r: 0, g: 0, b: 0 } : hexToRgb(colors[4] ?? "#1e1b4b");

  // Paper colour — explicit paperColour in style overrides theme[5]; ink-friendly always uses white
  const PAPER_COLOUR_HEX: Record<string, string> = {
    cream: "#FAFAF7", white: "#FFFFFF", ivory: "#FFFFF0",
    kraft: "#B5926A", slate: "#94A3B8",
  };
  const paperColourKey = (style as PlannerStyle & { paperColour?: string }).paperColour;
  if (!inkFriendly && (paperColourKey === "kraft" || paperColourKey === "slate")) {
    console.warn(`[pdf-generator] Contrast warning: paperColour="${paperColourKey}" may reduce ink text readability`);
  }
  const paperHex = inkFriendly ? "#FFFFFF"
    : (paperColourKey ? (PAPER_COLOUR_HEX[paperColourKey] ?? colors[5]) : (colors[5] ?? "#fafafa"));
  const paper = hexToRgb(paperHex as string);

  // 3. Create PDF
  const pdfDoc = await PDFDocument.create();
  const spineImage = inkFriendly ? null : await embedSpineImage(pdfDoc, spine);
  // Register fontkit so pdfDoc.embedFont(bytes) can handle TTF/OTF binaries.
  pdfDoc.registerFontkit(fontkit);
  // Page dimensions: e-ink device preset overrides style.size; fallback to A4.
  // E-ink presets are always portrait (device native orientation).
  const sizeKey  = (style as Record<string, unknown>).size as string | undefined;
  const baseSize = einkPreset
    ? einkPreset.pts                              // device native trim, portrait only
    : (PAGE_SIZES[sizeKey ?? "a4"] ?? PAGE_SIZES.a4!);
  const pageWidth  = (!einkPreset && orientation === "landscape") ? baseSize.h : baseSize.w;
  const pageHeight = (!einkPreset && orientation === "landscape") ? baseSize.w : baseSize.h;
  // 3. Embed fonts — resolve from theme fontPairing when provided.
  // heading slot drives fontBold (large headings/titles);
  // body slot drives font (regular text, labels, dates).
  // Real TTF binaries are fetched from Google Fonts and cached in-process;
  // falls back to StandardFonts on timeout/error.
  const headingFamily = fontPairing?.heading;
  const bodyFamily    = fontPairing?.body ?? fontPairing?.heading; // fall back to heading if body unset
  const genFallbackLog = new Set<string>();
  const [font, fontBold] = await Promise.all([
    resolveEmbeddedFont(pdfDoc, bodyFamily, false, genFallbackLog),
    resolveEmbeddedFont(pdfDoc, headingFamily, true, genFallbackLog),
  ]);

  // 3a. Resolve background rendering spec (once, before the page loop).
  // Gracefully falls back to paper fill on any error — never fails generation.
  let bgColorOverride: { r: number; g: number; b: number } | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let bgEmbedded: any = null; // PDFImage, kept as any to avoid pdf-lib internals
  const backgroundWarnings: BackgroundRenderWarning[] = [];

  // In ink-friendly mode: skip all backgrounds (photographic art omitted, not greyed).
  if (!inkFriendly && background) {
    if (background.type === "color" && background.assetRef) {
      try { bgColorOverride = hexToRgb(background.assetRef); } catch { /* ignore malformed hex */ }
    } else if (background.type === "image" || background.type === "texture") {
      const warningBase = {
        backgroundId: background.id ?? null,
        backgroundName: background.name ?? null,
        backgroundType: background.type,
      } as const;
      if (!background.assetRef?.startsWith("data:image/")) {
        backgroundWarnings.push({ ...warningBase, reason: "missing_asset" });
      } else {
        try {
          const b64 = background.assetRef.replace(/^data:image\/[a-z+]+;base64,/, "");
          const buf = Buffer.from(b64, "base64");
          bgEmbedded = background.assetRef.startsWith("data:image/png")
            ? await pdfDoc.embedPng(buf)
            : await pdfDoc.embedJpg(buf);
        } catch (err) {
          backgroundWarnings.push({ ...warningBase, reason: "embed_failed" });
          console.warn("[pdf-generator] Background image embed failed — using paper fill:", (err as Error).message);
        }
      }
    }
  }

  // 3b. Realistic render style: generate template overlays ONCE, embed as reusable XObjects.
  // Default is "realistic"; pass renderStyle:"flat" to opt out.
  // Ink-friendly always uses flat — no grain or gutter overlays.
  const renderStyle = inkFriendly ? "flat" : ((style as PlannerStyle & { renderStyle?: string }).renderStyle ?? "realistic");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let realisticGutterImg: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let realisticGrainImg: any = null;
  let realisticOverlaySourceBytes = 0;

  if (renderStyle === "realistic") {
    try {
      // 1. Gutter shading: a semi-transparent dark strip along the binding edge (left)
      const gutterW = Math.max(12, Math.ceil(pageWidth * 0.05));
      const gutterBuf = await sharp({
        create: { width: gutterW, height: pageHeight, channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.12 } },
      }).png().toBuffer();
      realisticOverlaySourceBytes += gutterBuf.byteLength;
      realisticGutterImg = await pdfDoc.embedPng(gutterBuf);

      // 2. Paper grain: tileable 128×128 noise overlay (subtle texture)
      const grainSz = 128;
      const grainPixels = Buffer.alloc(grainSz * grainSz * 4);
      for (let gi = 0; gi < grainSz * grainSz; gi++) {
        const v = Math.floor(Math.random() * 28);
        grainPixels[gi * 4]     = v;
        grainPixels[gi * 4 + 1] = v;
        grainPixels[gi * 4 + 2] = v;
        grainPixels[gi * 4 + 3] = 16; // very subtle alpha
      }
      const grainBuf = await sharp(grainPixels, {
        raw: { width: grainSz, height: grainSz, channels: 4 },
      }).png().toBuffer();
      realisticOverlaySourceBytes += grainBuf.byteLength;
      realisticGrainImg = await pdfDoc.embedPng(grainBuf);

      const sourceSzKb = Math.round(realisticOverlaySourceBytes / 1024);
      console.log(`[pdf-generator] Realistic overlays embedded; source assets: ~${sourceSzKb}KB`);
    } catch (err) {
      console.warn("[pdf-generator] Realistic overlay gen failed, falling back to flat:", (err as Error).message);
      realisticGutterImg = null; realisticGrainImg = null;
    }
  }

  // 4. Build ordered ID list and create pages
  const flat = flattenPageIds(map);
  const pageMap = new Map<string, PageWithId>();

  for (const id of flat) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const pageRef = page.ref;
    pageMap.set(id, { id, page, pageRef });

    // Layer 1: paper fill (color override when background type=color)
    const paperFill = bgColorOverride ?? paper;
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: rgb(paperFill.r, paperFill.g, paperFill.b) });

    // Layer 2: background image (texture/image type) — drawn UNDER all content
    if (bgEmbedded) {
      page.drawImage(bgEmbedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    }

    // Layer 2b: realistic template overlays — grain + gutter, each embedded once and referenced per page
    if (realisticGrainImg) {
      // Draw grain at page scale (embedded once, XObject reference per page)
      page.drawImage(realisticGrainImg, { x: 0, y: 0, width: pageWidth, height: pageHeight, opacity: 0.45 });
    }
    if (realisticGutterImg) {
      const gutterW = pageWidth * 0.05;
      page.drawImage(realisticGutterImg, { x: 0, y: 0, width: gutterW, height: pageHeight });
    }
    // Layer 2c: catalog-backed binding artwork. Media-box clipping keeps the
    // final full-size tile inside the page without distorting its aspect ratio.
    drawSpineTiles(page, pageWidth, pageHeight, spineImage, spine);

    // Layer 3: accent header + page ID
    // Colour: solid accent fill with white text.
    // Ink-friendly: white panel with hairline black border and black text.
    if (inkFriendly) {
      page.drawRectangle({ x: 0, y: pageHeight - 20, width: pageWidth, height: 20,
        color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
      page.drawText(id, { x: MARGIN, y: pageHeight - 14, size: 7, font, color: rgb(0, 0, 0) });
    } else {
      page.drawRectangle({ x: 0, y: pageHeight - 20, width: pageWidth, height: 20, color: rgb(accent.r, accent.g, accent.b) });
      page.drawText(id, { x: MARGIN, y: pageHeight - 14, size: 7, font, color: rgb(1, 1, 1) });
    }
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

  // Convenience: stamp user hotspots after template zones (Item 1 stamp-once)
  function hs(role: PageRole): UserHotspot[] {
    return hotspotsByTemplate?.get(role) ?? [];
  }

  // ── COVER ──
  {
    const sp = getPage("cover");
    if (sp) {
      const maxTitleWidth = pageWidth - MARGIN * 2;
      const titleSize = Math.max(18, Math.min(32, 32 * maxTitleWidth / Math.max(maxTitleWidth, fontBold.widthOfTextAtSize(coverTitleText, 32))));
      const titleY = pageHeight / 2 + 48;
      const subtitleY = titleY - titleSize - 12;
      const yearY = subtitleY - 34;
      sp.drawText(coverTitleText, { x: MARGIN, y: titleY, size: titleSize, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
      sp.drawText(coverSubtitle ?? "Your planner, your way.", { x: MARGIN, y: subtitleY, size: 14, font, color: rgb(ink.r, ink.g, ink.b), maxWidth: maxTitleWidth });
      if (showCoverYear) {
        sp.drawText(coverYearText, { x: MARGIN, y: yearY, size: 22, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
      }
      if (orientation !== "landscape") {
        sp.drawRectangle({ x: 0, y: 0, width: 8, height: pageHeight, color: rgb(accent.r, accent.g, accent.b) });
      }
    }
    const coverCtx = makeCtx("cover", "cover");
    stampPageZones(coverCtx);
    stampUserHotspots(coverCtx, hs("cover"));
  }

  // ── HOME ──
  {
    const sp = getPage("home");
    if (sp) {
      sp.drawText("Home", { x: MARGIN, y: pageHeight - 50, size: 20, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    const homeCtx = makeCtx("home", "home");
    stampPageZones(homeCtx);
    stampUserHotspots(homeCtx, hs("home"));
  }

  // ── YEAR ──
  {
    const sp = getPage("year");
    if (sp) {
      sp.drawText(datingMode === "dated" ? `${startYear} Overview` : "Year Overview", { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    const yearCtx = makeCtx("year", "year");
    stampPageZones(yearCtx);
    stampUserHotspots(yearCtx, hs("year"));
  }

  // ── MONTH DIVIDERS + MONTH CALENDARS ──
  for (let i = 0; i < map.monthDividers.length; i++) {
    const mdivId = map.monthDividers[i];
    const mId    = map.monthCalendars[i];
    const { year, month } = monthList[i];
    const monthName = new Date(year, month, 1).toLocaleString("en-US", { month: "long" });

    // Month divider: content (undated → "Month N", perpetual → monthName only, dated → monthName + year)
    const mdivPage = getPage(mdivId);
    if (mdivPage) {
      const mdivHeading = datingMode === "undated" ? `Month ${i + 1}` : monthName;
      mdivPage.drawText(mdivHeading, { x: MARGIN, y: pageHeight / 2, size: 36, font: fontBold, color: rgb(accent.r, accent.g, accent.b) });
      if (datingMode === "dated") {
        mdivPage.drawText(String(year), { x: MARGIN, y: pageHeight / 2 - 44, size: 18, font, color: rgb(ink.r, ink.g, ink.b) });
      }
    }
    // Month divider: links + user hotspots
    const mdivCtx = makeCtx(mdivId, "month-divider", { monthIndex: i });
    stampPageZones(mdivCtx);
    stampUserHotspots(mdivCtx, hs("month-divider"));

    // Month calendar: content
    const mPage = getPage(mId);
    if (mPage) {
      const calHeading = datingMode === "undated"
        ? `Month ${i + 1}`
        : datingMode === "perpetual"
          ? monthName
          : `${monthName} ${year}`;
      mPage.drawText(calHeading, { x: MARGIN, y: pageHeight - 50, size: 16, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }

    // Month calendar: links + user hotspots
    const mCtx = makeCtx(mId, "month-calendar", {
      monthIndex: i,
      dayOfMonthContext: { year, month, weekStartOffset: getMonthGridOffset(year, month, weekStart) },
    });
    stampPageZones(mCtx);
    stampUserHotspots(mCtx, hs("month-calendar"));
  }

  // ── WEEKLIES ──
  let weeklyIndex = 0; // 0-based position in map.weeklies (used by next-week/prev-week hotspots)
  for (const weekId of map.weeklies) {
    const wPage = getPage(weekId);
    if (!wPage) continue;
    const weekMatch = weekId.match(/^w(\d{4})W(\d{2})$/);
    if (!weekMatch) continue;
    const weekYear = parseInt(weekMatch[1]);
    const weekNum  = parseInt(weekMatch[2]);

    const weekStartDate = getWeekStartDate(weekId, weekStart);
    if (!weekStartDate) continue;

    // Heading adapts to datingMode
    const weekHeading = datingMode === "undated"
      ? `Week ${weeklyIndex + 1}`
      : datingMode === "perpetual"
        ? `Week ${weekNum}  ·  ${weekStartDate.toLocaleString("en-US", { weekday: "short" })}–${new Date(weekStartDate.getTime() + 6 * 86400000).toLocaleString("en-US", { weekday: "short" })}`
        : `Week ${weekNum} — ${weekYear}`;
    wPage.drawText(weekHeading, { x: MARGIN, y: pageHeight - 50, size: 16, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });

    // Calendar links per day — suppressed on Kindle Scribe (links unreliable via Send)
    if (!skipLinks) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStartDate);
        date.setDate(weekStartDate.getDate() + d);
        if (calMode === "link" || calMode === "overlay") {
          const nextDay = new Date(date);
          nextDay.setDate(date.getDate() + 1);
          // Use proportional column widths so links stay within any page size.
          // A hardcoded 70-pt step overflows A5 (420 pt) and e-ink (447 pt) on days 5–6.
          const colW = (pageWidth - 2 * MARGIN) / 7;
          const colX1 = MARGIN + d * colW;
          const calRect: [number, number, number, number] = [
            colX1, pageHeight - 120, colX1 + Math.min(65, colW - 2), pageHeight - 102,
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
    }

    // AI block — suppressed on Kindle Scribe
    if (output.aiInPdf && !skipLinks) {
      const aiUrl = `${process.env.APP_URL ?? "https://daybook.app"}/assistant?context=weekly&page=${weekId}`;
      addUriAnnotation(pdfDoc, wPage, aiUrl, [MARGIN, MARGIN + 22, MARGIN + 130, MARGIN + 40], "* Ask AI about this week", font, accent);
    }

    // Find which month this weekly falls in
    const monthIdx = (() => {
      for (let i = 0; i < monthCount; i++) {
        const { year, month } = addMonths(startYear, startMonth, i);
        if (weekStartDate.getFullYear() === year && weekStartDate.getMonth() === month) return i;
      }
      return 0;
    })();

    // Links: month-for-week + 7 day columns via template; stamp user hotspots after
    const wCtx = makeCtx(weekId, "weekly", {
      weeklyMonthIndex: monthIdx,
      weeklyIndex,
      weekStartDate,
      includeTabRail: true,
    });
    stampPageZones(wCtx);
    stampUserHotspots(wCtx, hs("weekly"));
    weeklyIndex++;
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

    // Daily heading adapts to datingMode
    const dayHeading = datingMode === "undated"
      ? `Day ${i + 1}`
      : datingMode === "perpetual"
        ? date.toLocaleString("en-US", { weekday: "long" })
        : date.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    dPage.drawText(dayHeading, { x: MARGIN, y: pageHeight - 50, size: 14, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });

    // Calendar link — suppressed on Kindle Scribe
    if (!skipLinks && (calMode === "link" || calMode === "overlay")) {
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
    if (output.aiInPdf && !skipLinks) {
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

    // Links: month-for-day, prev-day, next-day via template; stamp user hotspots after
    const dCtx = makeCtx(dayId, "daily", { monthIndex: monthIdx, dailyIndex: i, includeTabRail: true });
    stampPageZones(dCtx);
    stampUserHotspots(dCtx, hs("daily"));
  }

  // ── TODO ──
  { const todoCtx = makeCtx("todo", "todo", { includeTabRail: true }); stampPageZones(todoCtx); stampUserHotspots(todoCtx, hs("todo")); }

  // ── NOTES + SECTION DIVIDERS ──
  {
    const np = getPage("notes");
    if (np) {
      np.drawText("Notes", { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
    }
    const notesCtx = makeCtx("notes", "notes", { includeTabRail: true });
    stampPageZones(notesCtx);
    stampUserHotspots(notesCtx, hs("notes"));

    for (let i = 0; i < map.sectionDividers.length; i++) {
      const nsId = map.sectionDividers[i];
      const nsp = getPage(nsId);
      if (nsp) {
        nsp.drawText(sections[i] ?? nsId, { x: MARGIN, y: pageHeight - 50, size: 18, font: fontBold, color: rgb(ink.r, ink.g, ink.b) });
      }
      const nsCtx = makeCtx(nsId, "section-divider", { sectionIndex: i, includeTabRail: true });
      stampPageZones(nsCtx);
      stampUserHotspots(nsCtx, hs("section-divider"));
    }
  }

  // ── NOTE PAPER ──
  for (const npId of map.notePaper) {
    const npCtx = makeCtx(npId, "note-paper", { includeTabRail: true });
    stampPageZones(npCtx);
    stampUserHotspots(npCtx, hs("note-paper"));
  }

  // 8. Optional diagnostic page — test builds only; never set on buyer-facing planners.
  // Appended as the very last page so GoTo destinations (which reference PDFRef objects,
  // not page indices) are never shifted.
  let totalLinkAnnotations: number | undefined;
  if (diagnosticPage) {
    // Count all link annotations that were stamped during steps 4-7 above.
    let annotCount = 0;
    for (const pg of pdfDoc.getPages()) {
      const annots = pg.node.get(PDFName.of("Annots"));
      if (annots instanceof PDFArray) annotCount += annots.size();
    }
    totalLinkAnnotations = annotCount;

    const { createHash } = await import("node:crypto");
    const configHash = createHash("sha256")
      .update(JSON.stringify({ setup: config.setup, style: config.style, output: config.output }))
      .digest("hex")
      .slice(0, 16);

    const diagPg = pdfDoc.addPage([pageWidth, pageHeight]);
    const clayR = rgb(0.78, 0.46, 0.38); // Daybook clay — readable in both colour and B&W
    const diagInk = rgb(0.08, 0.08, 0.08);
    const lineH = 16;

    // Header band
    diagPg.drawRectangle({ x: 0, y: pageHeight - 80, width: pageWidth, height: 80, color: clayR });
    diagPg.drawText("DAYBOOK TEST BUILD — NOT FOR RELEASE", {
      x: 40, y: pageHeight - 50, size: 12, font: fontBold, color: rgb(1, 1, 1),
    });
    diagPg.drawText("This page is injected by diagnosticPage=true and must not appear in buyer exports.", {
      x: 40, y: pageHeight - 68, size: 7.5, font, color: rgb(0.95, 0.95, 0.95),
    });

    const styleTyped = config.style as PlannerStyle & {
      themeId?: string; paletteId?: string; backgroundId?: string;
    };
    const setupTyped = config.setup as PlannerSetup & { datingMode?: string };
    const outputTyped = config.output as PlannerOutput & { einkDevice?: string };

    const rows: [string, string][] = [
      ["Generated",       new Date().toISOString()],
      ["Config hash",     configHash],
      ["Template",        "DEFAULT_TEMPLATE"],
      ["", ""],
      ["Dating mode",     setupTyped.datingMode ?? "dated"],
      ["Orientation",     `${config.setup.orientation}  ·  weekStart: ${config.setup.weekStart}`],
      ["Year / months",   `${config.setup.startYear}-${String(config.setup.startMonth + 1).padStart(2,"0")} × ${config.setup.monthCount} months`],
      ["Sections",        sections.length > 0 ? sections.join(", ") : "none"],
      ["", ""],
      ["Theme ID",        styleTyped.themeId ?? "—"],
      ["Palette ID",      styleTyped.paletteId ?? "—"],
      ["Background ID",   styleTyped.backgroundId ?? "—"],
      ["E-ink device",    einkDevice ?? outputTyped.einkDevice ?? "—"],
      ["", ""],
      ["Content pages",   String(flat.length)],
      ["Link annotations",String(annotCount)],
    ];

    let dy = pageHeight - 100;
    const col1x = 40;
    const col2x = 160;
    for (const [label, value] of rows) {
      if (!label && !value) { dy -= lineH * 0.6; continue; }
      diagPg.drawText(label + ":", { x: col1x, y: dy, size: 8.5, font: fontBold, color: diagInk });
      diagPg.drawText(value,      { x: col2x, y: dy, size: 8.5, font,             color: diagInk });
      dy -= lineH;
    }

    // Footer rule
    diagPg.drawLine({
      start: { x: 40, y: 50 }, end: { x: pageWidth - 40, y: 50 },
      thickness: 0.5, color: clayR,
    });
    diagPg.drawText("Daybook PDF engine — diagnostic build", {
      x: 40, y: 36, size: 7, font, color: rgb(0.5, 0.5, 0.5),
    });
  }

  await stampWidgetComposition(
    pdfDoc, pageMap, map, style, pageWidth, pageHeight, colors, font, widgetSpecs,
  );

  // 9. Serialize
  const pdfBytes = await pdfDoc.save();
  return {
    buffer: pdfBytes,
    pageCount: flat.length,
    fontSubstitutions: [...genFallbackLog],
    backgroundWarnings,
    totalLinkAnnotations,
  };
}

// ── Preview PDF ───────────────────────────────────────────────────────────────
// Preview renders the real export, then copies a representative subset of its
// pages. This deliberately trades a little preview latency for visual truth:
// page geometry, backgrounds, fonts, links, widgets, and e-ink treatment all
// come from buildPdf rather than a second approximation.

function pageIdForTarget(map: PageIdMap, pageType: string, pageIndex: number): string | undefined {
  const exact: Record<string, string> = {
    cover: map.cover,
    home: map.home,
    year: map.year,
    todo: map.todo,
    notes: map.notes,
  };
  if (exact[pageType]) return pageIndex === 0 ? exact[pageType] : undefined;
  const groups: Record<string, string[]> = {
    "month-divider": map.monthDividers,
    "month-calendar": map.monthCalendars,
    weekly: map.weeklies,
    daily: map.dailies,
    "section-divider": map.sectionDividers,
    "note-paper": map.notePaper,
  };
  return groups[pageType]?.[pageIndex];
}

export function selectPreviewPageIds(config: GeneratorConfig): string[] {
  const map = generatePageIds(config);
  const firstMonthDailyId = `d${config.setup.startYear}${String(config.setup.startMonth + 1).padStart(2, "0")}01`;
  const selected = new Set<string>([
    map.cover,
    map.home,
    map.year,
    map.monthDividers[0],
    map.monthCalendars[0],
    map.weeklies[0],
    map.dailies.includes(firstMonthDailyId) ? firstMonthDailyId : map.dailies[0],
    map.notes,
    map.sectionDividers[0],
  ].filter((id): id is string => !!id));

  for (const placement of config.style.composition?.placements ?? []) {
    if (placement.settings?.visible === false) continue;
    const indexes = new Set<number>([placement.pageIndex]);
    if (placement.scope === "range") {
      if (placement.rangeStart !== undefined) indexes.add(placement.rangeStart);
      if (placement.rangeEnd !== undefined) indexes.add(placement.rangeEnd);
    }
    for (const index of indexes) {
      const id = pageIdForTarget(map, placement.pageType, index);
      if (id) selected.add(id);
    }
  }

  const selectedSet = selected;
  return flattenPageIds(map).filter((id) => selectedSet.has(id));
}

export async function buildPreviewPdf(
  config: GeneratorConfig,
  themeColors?: string[],
  template: PlannerTemplate = DEFAULT_TEMPLATE,
  background?: BackgroundSpec,
  fontPairing?: ThemeFontPairing,
  einkDevice?: string,
  spine?: SpineSpec | null,
  widgetSpecs?: WidgetRenderSpec[],
  hotspotsByTemplate?: Map<string, UserHotspot[]>,
): Promise<{
  buffer: Uint8Array;
  pageCount: number;
  fontSubstitutions: string[];
  backgroundWarnings: BackgroundRenderWarning[];
}> {
  const generated = await buildPdf(
    config,
    themeColors,
    template,
    background,
    fontPairing,
    hotspotsByTemplate,
    !!config.output.inkFriendly,
    einkDevice,
    false,
    spine,
    widgetSpecs,
  );
  const source = await PDFDocument.load(generated.buffer);
  const map = generatePageIds(config);
  const flattened = flattenPageIds(map);
  const sourceIndexes = new Map(flattened.map((id, index) => [id, index]));
  const selectedIds = selectPreviewPageIds(config);
  const indexes = selectedIds
    .map((id) => sourceIndexes.get(id))
    .filter((index): index is number => index !== undefined);
  const selectedIndexes = new Set(indexes);
  const retainedPageRefs = new Set(
    indexes.map((index) => source.getPage(index).ref.objectNumber),
  );
  for (const index of indexes) {
    const annots = source.getPage(index).node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    for (let annotIndex = annots.size() - 1; annotIndex >= 0; annotIndex -= 1) {
      const annot = source.context.lookup(annots.get(annotIndex));
      if (!(annot instanceof PDFDict)) continue;
      const destination = annot.lookupMaybe(PDFName.of("Dest"), PDFArray);
      const target = destination?.get(0);
      if (target instanceof PDFRef && !retainedPageRefs.has(target.objectNumber)) {
        annots.remove(annotIndex);
      }
    }
  }
  for (let index = source.getPageCount() - 1; index >= 0; index -= 1) {
    if (!selectedIndexes.has(index)) {
      source.removePage(index);
    }
  }
  return {
    buffer: await source.save(),
    pageCount: indexes.length,
    fontSubstitutions: generated.fontSubstitutions,
    backgroundWarnings: generated.backgroundWarnings,
  };
}
