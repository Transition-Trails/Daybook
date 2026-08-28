import {
  PDFDocument,
  PDFPage,
  StandardFonts,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFFont,
} from "pdf-lib";
import type { PlannerInteriorAssets, PlannerInteriorManifest } from "@workspace/db";
import {
  SvgContractError,
  type SvgLinkZone,
  type ValidatedSvgTemplate,
  validateInteriorDefinition,
} from "./svg-contract";
import { parseHexColor } from "./color";
import { addGoToAnnotation } from "./pdf-template";
import { resolvePlannerInteriorFont } from "./pdf-generator";
import { getEinkPreset, getEinkRule } from "./eink-presets";

type ExpandedPage = {
  template: string;
  slotValues: Record<string, string>;
  month?: number;
  resolvedLinks: Array<{ zone: SvgLinkZone; targetIndex: number | null }>;
};

type RenderOptions = {
  themeColors?: string[];
  title?: string;
  subtitle?: string;
  year?: number;
  /** Forces monochrome output; device exports also enable this automatically. */
  inkFriendly?: boolean;
  /** Applies a device trim and the e-ink line-weight floor. */
  einkDevice?: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const POINTS_PER_MM = 72 / 25.4;

function parseMonth(value: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new SvgContractError(`Month repeat date "${value}" must use YYYY-MM`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (date.getUTCMonth() !== Number(match[2]) - 1) throw new SvgContractError(`Month repeat date "${value}" is invalid`);
  return date;
}

function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new SvgContractError(`Day repeat date "${value}" must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new SvgContractError(`Day repeat date "${value}" is invalid`);
  }
  return date;
}

function addMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function addDay(date: Date): Date {
  return new Date(date.valueOf() + 86_400_000);
}

function isoWeek(date: Date): number {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7));
  const first = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil(((copy.valueOf() - first.valueOf()) / 86_400_000 + 1) / 7);
}

function slotsForDate(date: Date): Record<string, string> {
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  return {
    date: `${MONTHS[month]} ${day}, ${year}`,
    weekday: WEEKDAYS[date.getUTCDay()],
    month: MONTHS[month],
    year: String(year),
    week: String(isoWeek(date)),
  };
}

function expandRules(manifest: PlannerInteriorManifest, globalSlots: Record<string, string> = {}): ExpandedPage[] {
  const pages: ExpandedPage[] = [];
  for (const rule of manifest.pages) {
    if (rule.once) {
      pages.push({ template: rule.template, slotValues: { ...globalSlots }, resolvedLinks: [] });
      continue;
    }
    const repeat = rule.repeat;
    if (!repeat) throw new SvgContractError(`Page rule "${rule.template}" has no repeat`);
    if (repeat.over === "months") {
      for (let date = parseMonth(repeat.from), end = parseMonth(repeat.to); date <= end; date = addMonth(date)) {
        pages.push({ template: rule.template, slotValues: { ...globalSlots, ...slotsForDate(date) }, month: date.getUTCMonth(), resolvedLinks: [] });
      }
      continue;
    }
    if (repeat.over === "days") {
      for (let date = parseDay(repeat.from), end = parseDay(repeat.to); date <= end; date = addDay(date)) {
        pages.push({ template: rule.template, slotValues: { ...globalSlots, ...slotsForDate(date) }, month: date.getUTCMonth(), resolvedLinks: [] });
      }
      continue;
    }
    throw new SvgContractError(`Repeat "${rule.template}" must be over months or days`);
  }
  return pages;
}

function resolvePageLinks(pages: ExpandedPage[], templates: Record<string, ValidatedSvgTemplate>): ExpandedPage[] {
  pages.forEach((page, index) => {
    const template = templates[page.template];
    page.resolvedLinks = (template?.zones ?? []).map((zone) => ({
      zone,
      targetIndex: resolveTarget(zone.target, index, pages),
    }));
  });
  return pages;
}

function globalSlotValues(options: RenderOptions): Record<string, string> {
  const values: Record<string, string> = {};
  if (options.title != null) values.title = options.title;
  if (options.subtitle != null) values.subtitle = options.subtitle;
  if (options.year != null) values.year = String(options.year);
  return values;
}

function resolveTarget(target: string, currentIndex: number, pages: ExpandedPage[]): number | null {
  if (target === "next") return currentIndex + 1 < pages.length ? currentIndex + 1 : null;
  if (target === "prev") return currentIndex > 0 ? currentIndex - 1 : null;
  if (target === "index" || target === "home") {
    const index = pages.findIndex((page) => page.template === target);
    if (index < 0) throw new SvgContractError(`Link target "${target}" cannot be resolved to a page`);
    return index;
  }
  if (target.startsWith("month:")) {
    const month = Number(target.slice("month:".length)) - 1;
    const index = pages.findIndex((page) => page.month === month);
    if (index < 0) throw new SvgContractError(`Link target "${target}" cannot be resolved to a page`);
    return index;
  }
  const template = target.replace(/^(tab:|page:)/, "");
  const index = pages.findIndex((page) => page.template === template);
  if (index < 0) throw new SvgContractError(`Link target "${target}" cannot be resolved to a page`);
  return index;
}

/**
 * Pure manifest expansion. The returned page order, slot values, and concrete
 * target indexes are deterministic and contain no PDF-specific state.
 */
export function expandPlannerInterior(
  manifest: PlannerInteriorManifest,
  assets: PlannerInteriorAssets,
): ExpandedPage[] {
  const templates = validateInteriorDefinition(manifest, assets);
  return resolvePageLinks(expandRules(manifest), templates);
}

function attrs(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const matcher = /([:@A-Za-z_][:\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of raw.matchAll(matcher)) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  const style = result.style?.split(";").reduce<Record<string, string>>((acc, declaration) => {
    const [key, value] = declaration.split(":");
    if (key?.trim() && value?.trim()) acc[key.trim().toLowerCase()] = value.trim();
    return acc;
  }, {}) ?? {};
  return { ...style, ...result };
}

function number(attrsMap: Record<string, string>, name: string, fallback = 0): number {
  const value = attrsMap[name] == null ? fallback : Number(attrsMap[name]);
  return Number.isFinite(value) ? value : fallback;
}

function paint(value: string | undefined, fallback: string): ReturnType<typeof rgb> | undefined {
  const color = parseHexColor(value, fallback);
  if (color === "none") return undefined;
  return rgb(parseInt(color.slice(1, 3), 16) / 255, parseInt(color.slice(3, 5), 16) / 255, parseInt(color.slice(5, 7), 16) / 255);
}

function renderPaint(value: string | undefined, fallback: string, inkFriendly: boolean): ReturnType<typeof rgb> | undefined {
  const color = paint(value, fallback);
  if (!inkFriendly || !color) return color;
  const hex = parseHexColor(value, fallback);
  if (hex === "none") return undefined;
  const red = parseInt(hex.slice(1, 3), 16);
  const green = parseInt(hex.slice(3, 5), 16);
  const blue = parseInt(hex.slice(5, 7), 16);
  const brightness = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  // Preserve authored paper/background fills as white while consolidating ink,
  // rules, and decorative color into high-contrast black.
  return brightness >= 0.72 ? rgb(1, 1, 1) : rgb(0, 0, 0);
}

function namedLayer(attrsMap: Record<string, string>): string | undefined {
  return attrsMap.id ?? attrsMap["data-name"];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function substituteSlots(svg: string, values: Record<string, string>): string {
  return svg.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text\s*>)/gi, (full, opening, _content, closing) => {
    const name = namedLayer(attrs(opening));
    if (!name?.startsWith("slot:text:")) return full;
    const field = name.slice("slot:text:".length);
    return values[field] == null ? full : `${opening}${escapeXml(values[field])}${closing}`;
  });
}

function stripGuidesAndZones(svg: string): string {
  const namedPattern = /<(rect|circle|ellipse|line|polyline|polygon|path|text|g)\b([^>]*)(?:\/>|>[\s\S]*?<\/\1\s*>)/gi;
  return svg.replace(namedPattern, (full, _tag, rawAttrs) => {
    const name = namedLayer(attrs(rawAttrs));
    return name?.startsWith("guide:") || name?.startsWith("zone:link:") ? "" : full;
  });
}

async function renderSvg(
  page: PDFPage,
  template: ValidatedSvgTemplate,
  slotValues: Record<string, string>,
  pageWidth: number,
  pageHeight: number,
  fallbackFont: PDFFont,
  fontCache: Map<string, PDFFont>,
  options: RenderOptions,
): Promise<void> {
  const svg = stripGuidesAndZones(substituteSlots(template.svg, slotValues));
  const preset = getEinkPreset(options.einkDevice);
  const toolbarRule = getEinkRule("toolbar_margin");
  const requestedInset = preset && toolbarRule?.enabled !== false
    ? Math.max(preset.safeInset, toolbarRule?.threshold ?? 0)
    : 0;
  const inset = Math.min(requestedInset, pageWidth / 4, pageHeight / 4);
  const scale = Math.min((pageWidth - 2 * inset) / template.viewBox.width, (pageHeight - 2 * inset) / template.viewBox.height);
  const offsetX = inset + (pageWidth - 2 * inset - template.viewBox.width * scale) / 2;
  const offsetY = inset + (pageHeight - 2 * inset - template.viewBox.height * scale) / 2;
  const toX = (x: number) => offsetX + (x - template.viewBox.x) * scale;
  const toY = (y: number) => pageHeight - offsetY - (y - template.viewBox.y) * scale;
  const grayscaleRule = getEinkRule("grayscale");
  const inkFriendly = options.inkFriendly || (!!options.einkDevice && grayscaleRule?.enabled !== false);
  const lineRule = getEinkRule("line_weight");
  const eInkStrokeFloor = options.einkDevice && lineRule?.enabled !== false
    ? (lineRule?.threshold ?? 0.75)
    : 0;
  const elementMatcher = /<(rect|circle|ellipse|line|polyline|polygon|path)\b([^>]*?)\/?\s*>/gi;
  for (const match of svg.matchAll(elementMatcher)) {
    const tag = match[1].toLowerCase();
    const attributeMap = attrs(match[2]);
    const fill = renderPaint(attributeMap.fill, "#000000", inkFriendly);
    const stroke = renderPaint(attributeMap.stroke, "none", inkFriendly);
    const rawStrokeWidth = number(attributeMap, "stroke-width", 1);
    const borderWidth = Math.max(rawStrokeWidth * scale, eInkStrokeFloor);
    const pathStrokeWidth = Math.max(rawStrokeWidth, eInkStrokeFloor / scale);
    if (tag === "rect") {
      const x = number(attributeMap, "x");
      const y = number(attributeMap, "y");
      const width = number(attributeMap, "width");
      const height = number(attributeMap, "height");
      page.drawRectangle({ x: toX(x), y: toY(y + height), width: width * scale, height: height * scale, color: fill, borderColor: stroke, borderWidth });
    } else if (tag === "circle") {
      page.drawEllipse({ x: toX(number(attributeMap, "cx")), y: toY(number(attributeMap, "cy")), xScale: number(attributeMap, "r") * scale, yScale: number(attributeMap, "r") * scale, color: fill, borderColor: stroke, borderWidth });
    } else if (tag === "ellipse") {
      page.drawEllipse({ x: toX(number(attributeMap, "cx")), y: toY(number(attributeMap, "cy")), xScale: number(attributeMap, "rx") * scale, yScale: number(attributeMap, "ry") * scale, color: fill, borderColor: stroke, borderWidth });
    } else if (tag === "line") {
      if (stroke) {
        page.drawLine({ start: { x: toX(number(attributeMap, "x1")), y: toY(number(attributeMap, "y1")) }, end: { x: toX(number(attributeMap, "x2")), y: toY(number(attributeMap, "y2")) }, thickness: borderWidth, color: stroke });
      }
    } else if (tag === "polyline" || tag === "polygon") {
      const points = (attributeMap.points ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (tag === "polygon" && points.length >= 6) {
        const d = points.reduce((path, value, index) => {
          if (index % 2 !== 0) return path;
          return `${path}${index === 0 ? "M" : "L"}${value} ${points[index + 1]} `;
        }, "") + "Z";
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, -scale, offsetX - template.viewBox.x * scale, pageHeight - offsetY + template.viewBox.y * scale));
        page.drawSvgPath(d, { color: fill, borderColor: stroke, borderWidth: pathStrokeWidth });
        page.pushOperators(popGraphicsState());
      } else if (stroke) {
        for (let index = 0; index + 3 < points.length; index += 2) {
          page.drawLine({ start: { x: toX(points[index]), y: toY(points[index + 1]) }, end: { x: toX(points[index + 2]), y: toY(points[index + 3]) }, thickness: borderWidth, color: stroke });
        }
      }
    } else if (tag === "path" && attributeMap.d) {
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(scale, 0, 0, -scale, offsetX - template.viewBox.x * scale, pageHeight - offsetY + template.viewBox.y * scale));
      page.drawSvgPath(attributeMap.d, { color: fill, borderColor: stroke, borderWidth: pathStrokeWidth });
      page.pushOperators(popGraphicsState());
    }
  }

  const textMatcher = /<text\b([^>]*)>([\s\S]*?)<\/text\s*>/gi;
  for (const match of svg.matchAll(textMatcher)) {
    const attributeMap = attrs(match[1]);
    const rawText = match[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    if (!rawText) continue;
    const size = number(attributeMap, "font-size", 12) * scale;
    const color = renderPaint(attributeMap.fill, "#000000", inkFriendly) ?? rgb(0, 0, 0);
    const x = toX(number(attributeMap, "x"));
    const y = toY(number(attributeMap, "y"));
    const fontFamily = attributeMap["font-family"]?.replace(/^["']|["']$/g, "");
    const bold = ["bold", "700"].includes(attributeMap["font-weight"] ?? "normal");
    const fontKey = `${fontFamily ?? "Helvetica"}:${bold ? "700" : "400"}`;
    const textFont = fontCache.get(fontKey)
      ?? (fontFamily ? await resolvePlannerInteriorFont(page.doc, fontFamily, bold) : fallbackFont);
    fontCache.set(fontKey, textFont);
    const anchor = attributeMap["text-anchor"];
    const anchoredX = anchor === "middle" ? x - textFont.widthOfTextAtSize(rawText, size) / 2
      : anchor === "end" ? x - textFont.widthOfTextAtSize(rawText, size)
      : x;
    page.drawText(rawText, { x: anchoredX, y, size, color, font: textFont });
  }
}

function drawPlaceholderCover(page: PDFPage, width: number, height: number, options: RenderOptions): void {
  const grayscaleRule = getEinkRule("grayscale");
  const inkFriendly = options.inkFriendly || (!!options.einkDevice && grayscaleRule?.enabled !== false);
  const paper = inkFriendly ? rgb(1, 1, 1) : paint(options.themeColors?.[5], "#FAFAF7") ?? rgb(0.98, 0.98, 0.96);
  const accent = inkFriendly ? rgb(0, 0, 0) : paint(options.themeColors?.[0], "#1B2A4A") ?? rgb(0.11, 0.16, 0.29);
  const ink = inkFriendly ? rgb(0, 0, 0) : paint(options.themeColors?.[4], "#1B2A4A") ?? rgb(0.11, 0.16, 0.29);
  page.drawRectangle({ x: 0, y: 0, width, height, color: paper });
  page.drawRectangle({ x: 0, y: height * 0.68, width, height: height * 0.32, color: accent });
  page.drawText(options.title ?? "Daybook Planner", { x: width * 0.12, y: height * 0.56, size: Math.max(22, width * 0.065), color: ink });
  if (options.subtitle) page.drawText(options.subtitle, { x: width * 0.12, y: height * 0.50, size: Math.max(10, width * 0.026), color: ink });
  if (options.year) page.drawText(String(options.year), { x: width * 0.12, y: height * 0.41, size: Math.max(16, width * 0.045), color: accent });
}

/** Creates a vector-only PDF for a pinned authored interior. */
export async function buildInteriorPdf(
  manifest: PlannerInteriorManifest,
  assets: PlannerInteriorAssets,
  options: RenderOptions = {},
): Promise<{ buffer: Uint8Array; pageCount: number; totalLinkAnnotations: number }> {
  const templates = validateInteriorDefinition(manifest, assets);
  const expanded = resolvePageLinks(expandRules(manifest, globalSlotValues(options)), templates);
  const eInkPreset = getEinkPreset(options.einkDevice);
  if (options.einkDevice && !eInkPreset) throw new SvgContractError(`Unknown e-ink device "${options.einkDevice}"`);
  const pageWidth = eInkPreset?.pts.w ?? manifest.trim.w * POINTS_PER_MM;
  const pageHeight = eInkPreset?.pts.h ?? manifest.trim.h * POINTS_PER_MM;
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontCache = new Map<string, PDFFont>([["Helvetica:400", helvetica]]);
  const pages = expanded.map(() => pdfDoc.addPage([pageWidth, pageHeight]));
  const toolbarRule = getEinkRule("toolbar_margin");
  const requestedSafeInset = eInkPreset && toolbarRule?.enabled !== false
    ? Math.max(eInkPreset.safeInset, toolbarRule?.threshold ?? 0)
    : 0;
  const safeInset = Math.min(requestedSafeInset, pageWidth / 4, pageHeight / 4);

  // pdf-lib text needs an embedded document font; assign it to text render calls
  // by relying on the document default set here via a small, invisible marker.
  for (let index = 0; index < expanded.length; index++) {
    const source = expanded[index];
    const page = pages[index];
    const template = templates[source.template];
    if (!template && source.template === "cover") {
      drawPlaceholderCover(page, pageWidth, pageHeight, options);
    } else if (template) {
      await renderSvg(page, template, source.slotValues, pageWidth, pageHeight, helvetica, fontCache, options);
    }
  }

  let totalLinkAnnotations = 0;
  for (let index = 0; index < expanded.length; index++) {
    const source = expanded[index];
    const template = templates[source.template];
    if (!template) continue;
    const scale = Math.min((pageWidth - 2 * safeInset) / template.viewBox.width, (pageHeight - 2 * safeInset) / template.viewBox.height);
    const offsetX = safeInset + (pageWidth - 2 * safeInset - template.viewBox.width * scale) / 2;
    const offsetY = safeInset + (pageHeight - 2 * safeInset - template.viewBox.height * scale) / 2;
    for (const link of source.resolvedLinks) {
      if (link.targetIndex == null) continue;
      const { x, y, width, height } = link.zone.bounds;
      const left = offsetX + (x - template.viewBox.x) * scale;
      const bottom = pageHeight - offsetY - (y - template.viewBox.y + height) * scale;
      addGoToAnnotation(pdfDoc, pages[index], pages[link.targetIndex].ref, [left, bottom, left + width * scale, bottom + height * scale]);
      totalLinkAnnotations++;
    }
  }
  return { buffer: await pdfDoc.save(), pageCount: expanded.length, totalLinkAnnotations };
}