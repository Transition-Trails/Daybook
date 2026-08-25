import type {
  PlannerInteriorAssets,
  PlannerInteriorManifest,
  PlannerInteriorTrim,
} from "@workspace/db";
import { parseHexColor } from "./color";

const ALLOWED_ELEMENTS = new Set([
  "svg", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text",
]);
const LINK_TARGET_PATTERN = /^(next|prev|index|home|month:(?:[1-9]|1[0-2])|tab:[A-Za-z0-9_-]+|page:[A-Za-z0-9_-]+)$/;
const SLOT_FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const EPSILON = 0.0001;

export type SvgViewBox = { x: number; y: number; width: number; height: number };
export type SvgBounds = { x: number; y: number; width: number; height: number };
export type SvgLinkZone = { id: string; target: string; bounds: SvgBounds };
export type SvgTextSlot = { id: string; field: string };
export type ValidatedSvgTemplate = {
  svg: string;
  viewBox: SvgViewBox;
  zones: SvgLinkZone[];
  slots: SvgTextSlot[];
};

export class SvgContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgContractError";
  }
}

type SvgElement = {
  tag: string;
  attrs: Record<string, string>;
  raw: string;
};

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const matcher = /([:@A-Za-z_][:\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of raw.matchAll(matcher)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function scanElements(svg: string): SvgElement[] {
  const elements: SvgElement[] = [];
  const matcher = /<\s*([A-Za-z][\w:-]*)\b([^>]*?)\/?\s*>/g;
  for (const match of svg.matchAll(matcher)) {
    const tag = match[1].toLowerCase();
    elements.push({ tag, attrs: parseAttributes(match[2]), raw: match[0] });
  }
  return elements;
}

function namedLayer(attrs: Record<string, string>): string | undefined {
  return attrs.id ?? attrs["data-name"];
}

function styleAttributes(attrs: Record<string, string>): Record<string, string> {
  return attrs.style?.split(";").reduce<Record<string, string>>((result, declaration) => {
    const [rawName, rawValue] = declaration.split(":");
    if (rawName?.trim() && rawValue?.trim()) result[rawName.trim().toLowerCase()] = rawValue.trim();
    return result;
  }, {}) ?? {};
}

const SHAPE_ATTRIBUTES = new Set(["id", "data-name", "fill", "stroke", "stroke-width", "style"]);
const ELEMENT_ATTRIBUTES: Record<string, Set<string>> = {
  svg: new Set(["viewbox", "width", "height", "xmlns"]),
  rect: new Set(["x", "y", "width", "height"]),
  circle: new Set(["cx", "cy", "r"]),
  ellipse: new Set(["cx", "cy", "rx", "ry"]),
  line: new Set(["x1", "y1", "x2", "y2"]),
  polyline: new Set(["points"]),
  polygon: new Set(["points"]),
  path: new Set(["d"]),
  text: new Set(["id", "data-name", "x", "y", "fill", "font-size", "font-family", "font-weight", "font-style", "text-anchor", "style"]),
};
const TEXT_STYLE_ATTRIBUTES = new Set(["fill", "font-size", "font-family", "font-weight", "font-style", "text-anchor"]);
const SHAPE_STYLE_ATTRIBUTES = new Set(["fill", "stroke", "stroke-width"]);
const STROKE_ONLY_ELEMENTS = new Set(["line", "polyline"]);

function assertRendererSupportedAttributes(element: SvgElement): void {
  const allowed = ELEMENT_ATTRIBUTES[element.tag];
  const isText = element.tag === "text";
  const isShape = !isText && element.tag !== "svg";
  for (const name of Object.keys(element.attrs)) {
    if (name === "transform") throw new SvgContractError("SVG transform attributes are not supported in authored interiors");
    if (STROKE_ONLY_ELEMENTS.has(element.tag) && name === "fill") {
      throw new SvgContractError(`SVG fill on <${element.tag}> is not supported; use stroke geometry instead`);
    }
    if (allowed.has(name) || (isShape && SHAPE_ATTRIBUTES.has(name))) continue;
    throw new SvgContractError(`SVG attribute "${name}" on <${element.tag}> is not supported by the vector renderer`);
  }
  const styles = styleAttributes(element.attrs);
  const allowedStyles = isText
    ? TEXT_STYLE_ATTRIBUTES
    : STROKE_ONLY_ELEMENTS.has(element.tag)
      ? new Set(["stroke", "stroke-width"])
      : isShape ? SHAPE_STYLE_ATTRIBUTES : new Set<string>();
  for (const name of Object.keys(styles)) {
    if (!allowedStyles.has(name)) {
      throw new SvgContractError(`SVG style "${name}" on <${element.tag}> is not supported by the vector renderer`);
    }
  }
}

function numberAttr(attrs: Record<string, string>, name: string, context: string, fallback?: number): number {
  const raw = attrs[name];
  if (raw == null && fallback != null) return fallback;
  if (raw == null || raw.trim() === "") throw new SvgContractError(`${context} requires a numeric ${name} attribute`);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new SvgContractError(`${context} has an invalid ${name} attribute`);
  return value;
}

function parseViewBox(attrs: Record<string, string>): SvgViewBox {
  const values = (attrs.viewbox ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new SvgContractError("SVG requires a finite four-number viewBox");
  }
  const [x, y, width, height] = values;
  if (width <= 0 || height <= 0) throw new SvgContractError("SVG viewBox width and height must be greater than zero");
  return { x, y, width, height };
}

function parsePoints(raw: string | undefined, context: string): Array<[number, number]> {
  if (!raw) throw new SvgContractError(`${context} requires points`);
  const values = raw.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length < 4 || values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) {
    throw new SvgContractError(`${context} has invalid points`);
  }
  const points: Array<[number, number]> = [];
  for (let i = 0; i < values.length; i += 2) points.push([values[i], values[i + 1]]);
  return points;
}

function boundsForZone(element: SvgElement, label: string): SvgBounds {
  const { attrs, tag } = element;
  if (attrs.transform) throw new SvgContractError(`${label} cannot use transform; link-zone bounds must be explicit`);
  if (tag === "rect") {
    const x = numberAttr(attrs, "x", label, 0);
    const y = numberAttr(attrs, "y", label, 0);
    const width = numberAttr(attrs, "width", label);
    const height = numberAttr(attrs, "height", label);
    if (width <= 0 || height <= 0) throw new SvgContractError(`${label} must have positive width and height`);
    return { x, y, width, height };
  }
  if (tag === "circle") {
    const cx = numberAttr(attrs, "cx", label, 0);
    const cy = numberAttr(attrs, "cy", label, 0);
    const r = numberAttr(attrs, "r", label);
    if (r <= 0) throw new SvgContractError(`${label} must have a positive r`);
    return { x: cx - r, y: cy - r, width: r * 2, height: r * 2 };
  }
  if (tag === "ellipse") {
    const cx = numberAttr(attrs, "cx", label, 0);
    const cy = numberAttr(attrs, "cy", label, 0);
    const rx = numberAttr(attrs, "rx", label);
    const ry = numberAttr(attrs, "ry", label);
    if (rx <= 0 || ry <= 0) throw new SvgContractError(`${label} must have positive rx and ry`);
    return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  }
  if (tag === "line") {
    const x1 = numberAttr(attrs, "x1", label, 0);
    const y1 = numberAttr(attrs, "y1", label, 0);
    const x2 = numberAttr(attrs, "x2", label);
    const y2 = numberAttr(attrs, "y2", label);
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }
  if (tag === "polygon" || tag === "polyline") {
    const points = parsePoints(attrs.points, label);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }
  throw new SvgContractError(`${label} must be a rect, circle, ellipse, line, polygon, or polyline`);
}

function assertBoundsInsideViewBox(bounds: SvgBounds, viewBox: SvgViewBox, label: string): void {
  if (
    bounds.x < viewBox.x - EPSILON ||
    bounds.y < viewBox.y - EPSILON ||
    bounds.x + bounds.width > viewBox.x + viewBox.width + EPSILON ||
    bounds.y + bounds.height > viewBox.y + viewBox.height + EPSILON
  ) {
    throw new SvgContractError(`${label} falls outside the SVG viewBox`);
  }
}

function assertViewBoxMatchesTrim(viewBox: SvgViewBox, trim: PlannerInteriorTrim): void {
  const svgAspect = viewBox.width / viewBox.height;
  const trimAspect = trim.w / trim.h;
  if (Math.abs(svgAspect - trimAspect) / trimAspect > 0.005) {
    throw new SvgContractError("SVG viewBox aspect differs from the declared trim by more than 0.5%");
  }
}

function assertSafeSvg(svg: string, elements: SvgElement[]): void {
  if (!svg.trim().startsWith("<svg")) throw new SvgContractError("Template must start with an SVG element");
  if (/<\s*script\b/i.test(svg)) throw new SvgContractError("SVG contains a forbidden script element");
  if (/<\s*foreignobject\b/i.test(svg)) throw new SvgContractError("SVG contains a forbidden foreignObject element");
  for (const element of elements) {
    if (!ALLOWED_ELEMENTS.has(element.tag)) throw new SvgContractError(`SVG element <${element.tag}> is not allowed`);
    assertRendererSupportedAttributes(element);
    const styles = styleAttributes(element.attrs);
    for (const paint of [element.attrs.fill, element.attrs.stroke, styles.fill, styles.stroke]) {
      if (paint != null) {
        try {
          parseHexColor(paint);
        } catch (error) {
          throw new SvgContractError((error as Error).message.replace(/^Unsupported colour/, "Unsupported SVG colour"));
        }
      }
    }
    const fontStyle = styles["font-style"] ?? element.attrs["font-style"];
    if (fontStyle && fontStyle !== "normal") throw new SvgContractError("Only normal SVG font-style is supported");
    const fontWeight = styles["font-weight"] ?? element.attrs["font-weight"];
    if (fontWeight && !["normal", "bold", "400", "700"].includes(fontWeight)) {
      throw new SvgContractError("SVG font-weight must be normal, bold, 400, or 700");
    }
    for (const [name, value] of Object.entries(element.attrs)) {
      if (name.startsWith("on")) throw new SvgContractError(`SVG event attribute ${name} is not allowed`);
      if ((name === "href" || name === "xlink:href" || name === "src") && !value.startsWith("#")) {
        throw new SvgContractError("SVG external references are not allowed");
      }
      if (value.trim().toLowerCase().startsWith("javascript:")) throw new SvgContractError("SVG javascript references are not allowed");
    }
  }
}

/**
 * Sanitises untrusted generated SVG before it is returned from the Studio. The
 * stricter authored-template validator reports the same unsafe input as errors
 * instead of silently repairing it.
 */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/<foreignObject[^>]*\/>/gi, "")
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:(?:xlink:)?href|src)\s*=\s*(?:(["'])(?!#)[\s\S]*?\1|(?!(?:#)[^\s>]*)([^\s>]+))/gi, "")
    .replace(/url\(\s*(['"]?)(?!#)[^)]+\1\s*\)/gi, "none");
}

export function validateSvgTemplate(svg: string, trim: PlannerInteriorTrim): ValidatedSvgTemplate {
  if (!Number.isFinite(trim.w) || !Number.isFinite(trim.h) || trim.w <= 0 || trim.h <= 0 || trim.unit !== "mm") {
    throw new SvgContractError("Manifest trim must have positive millimetre dimensions");
  }
  const elements = scanElements(svg);
  assertSafeSvg(svg, elements);
  const root = elements.find((element) => element.tag === "svg");
  if (!root) throw new SvgContractError("Template requires an SVG root element");
  const viewBox = parseViewBox(root.attrs);
  assertViewBoxMatchesTrim(viewBox, trim);

  const zones: SvgLinkZone[] = [];
  const slots: SvgTextSlot[] = [];
  const names = new Set<string>();
  for (const element of elements) {
    const name = namedLayer(element.attrs);
    if (!name) continue;
    if (names.has(name)) throw new SvgContractError(`SVG layer name "${name}" is duplicated`);
    names.add(name);
    if (name.startsWith("zone:link:")) {
      const target = name.slice("zone:link:".length);
      if (!LINK_TARGET_PATTERN.test(target)) throw new SvgContractError(`Unknown zone:link target "${target}"`);
      const bounds = boundsForZone(element, `zone "${name}"`);
      assertBoundsInsideViewBox(bounds, viewBox, `zone "${name}"`);
      zones.push({ id: name, target, bounds });
    }
    if (name.startsWith("slot:text:")) {
      const field = name.slice("slot:text:".length);
      if (element.tag !== "text") throw new SvgContractError(`slot:text "${field}" must be on a <text> element`);
      if (!SLOT_FIELD_PATTERN.test(field)) throw new SvgContractError(`slot:text field "${field}" is invalid`);
      slots.push({ id: name, field });
    }
  }
  return { svg: sanitizeSvg(svg), viewBox, zones, slots };
}

function parseMonth(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new SvgContractError(`Month repeat date "${value}" must use YYYY-MM`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new SvgContractError(`Month repeat date "${value}" has an invalid month`);
  return { year, month };
}

function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new SvgContractError(`Day repeat date "${value}" must use YYYY-MM-DD`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new SvgContractError(`Day repeat date "${value}" is invalid`);
  }
  return date;
}

/** Validates the compact storage contract before any version is persisted. */
export function validateInteriorDefinition(
  manifest: PlannerInteriorManifest,
  assets: PlannerInteriorAssets,
): Record<string, ValidatedSvgTemplate> {
  if (!manifest || !Array.isArray(manifest.pages) || manifest.pages.length === 0) {
    throw new SvgContractError("Manifest requires at least one page rule");
  }
  if (!assets || typeof assets !== "object" || Array.isArray(assets)) {
    throw new SvgContractError("Interior assets must be a template-to-SVG object");
  }
  const validated: Record<string, ValidatedSvgTemplate> = {};
  for (const [templateId, svg] of Object.entries(assets)) {
    if (!/^[A-Za-z0-9_-]+$/.test(templateId)) throw new SvgContractError(`Template id "${templateId}" is invalid`);
    if (typeof svg !== "string" || svg.trim().length === 0) throw new SvgContractError(`Template "${templateId}" must contain SVG`);
    validated[templateId] = validateSvgTemplate(svg, manifest.trim);
  }
  for (const rule of manifest.pages) {
    if (!rule || typeof rule.template !== "string" || !/^[A-Za-z0-9_-]+$/.test(rule.template)) {
      throw new SvgContractError("Every manifest page requires a valid template id");
    }
    const isOnce = rule.once === true;
    const repeat = rule.repeat;
    if (isOnce === Boolean(repeat)) throw new SvgContractError(`Page rule "${rule.template}" must declare exactly one of once or repeat`);
    if (!validated[rule.template] && rule.template !== "cover") {
      throw new SvgContractError(`Manifest references missing template "${rule.template}"`);
    }
    if (repeat) {
      if (repeat.over === "months") {
        const from = parseMonth(repeat.from);
        const to = parseMonth(repeat.to);
        if (from.year * 12 + from.month > to.year * 12 + to.month) throw new SvgContractError(`Month repeat "${rule.template}" ends before it starts`);
      } else if (repeat.over === "days") {
        if (parseDay(repeat.from) > parseDay(repeat.to)) throw new SvgContractError(`Day repeat "${rule.template}" ends before it starts`);
      } else {
        throw new SvgContractError(`Repeat "${rule.template}" must be over months or days`);
      }
    }
  }
  return validated;
}