import { parseHexColor } from "./color";
import { validateSvgTemplate, SvgContractError } from "./svg-contract";
import { SVGPathData } from "svg-pathdata";
import type {
  StickerFunctionType,
  StickerShapeRecipe,
  StickerShapeRecipeOrigin,
  StickerShapeRecipeStatus,
} from "@workspace/db";
import { STICKER_FUNCTION_TYPES } from "@workspace/db";

export const RECIPE_PLACEHOLDERS = new Set([
  "primary",
  "accent",
  "label",
  "labelFontSize",
]);

export type ShapeRecipeInput = {
  name: string;
  slug: string;
  functionType: string;
  svgTemplate: string;
  aspectRatio: number;
  defaultSizeMm: number;
  takesLabel: boolean;
  status?: StickerShapeRecipeStatus;
};

export type ValidatedShapeRecipe = {
  svgTemplate: string;
  viewBox: { x: number; y: number; width: number; height: number };
  cutlinePath: string;
};

const SHAPE_RECIPE_OUTPUT_DPI = 300;
const MM_PER_INCH = 25.4;

function rootAttributes(svg: string): Record<string, string> {
  const match = /^\s*<svg\b([^>]*)>/i.exec(svg);
  if (!match) throw new SvgContractError("Rule 1 failed: template must start with an SVG root element");
  const attrs: Record<string, string> = {};
  const matcher = /([:@A-Za-z_][:\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const part of match[1].matchAll(matcher)) {
    attrs[part[1].toLowerCase()] = part[2] ?? part[3] ?? part[4] ?? "";
  }
  return attrs;
}

function parseMm(raw: string | undefined, name: string): number {
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)mm\s*$/i.exec(raw ?? "");
  const value = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new SvgContractError(`Rule 2 failed: SVG ${name} must be a positive millimetre value`);
  }
  return value;
}

function assertQuotedRootDimensions(svg: string): void {
  const rootMatch = /^\s*<svg\b([^>]*)>/i.exec(svg);
  if (!rootMatch) return;
  for (const name of ["width", "height"]) {
    const quoted = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "i").test(rootMatch[1]);
    if (!quoted) {
      throw new SvgContractError(`Rule 2 failed: SVG ${name} must be a quoted positive millimetre value`);
    }
  }
}

function parseViewBox(raw: string | undefined): { x: number; y: number; width: number; height: number } {
  const values = (raw ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value)) || values[2] <= 0 || values[3] <= 0) {
    throw new SvgContractError("Rule 2 failed: SVG requires a finite, positive four-number viewBox");
  }
  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

function parseAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const matcher = /([:@A-Za-z_][:\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const part of raw.matchAll(matcher)) {
    attrs[part[1].toLowerCase()] = part[2] ?? part[3] ?? part[4] ?? "";
  }
  return attrs;
}

function cutlineFromTemplate(svg: string): string {
  const paths = [...svg.matchAll(/<path\b([^>]*)>/gi)]
    .map((match) => parseAttributes(match[1]))
    .filter((attrs) => attrs["data-name"] === "cutline");
  if (paths.length !== 1) {
    throw new SvgContractError("Rule 3 failed: template must contain exactly one <path data-name=\"cutline\">");
  }
  const d = paths[0].d?.trim() ?? "";
  if (!d || !/[zZ]\s*$/.test(d)) {
    throw new SvgContractError("Rule 3 failed: the cutline path must have a closed d attribute ending in Z");
  }
  return d;
}

function validateCutlineGeometry(
  cutlinePath: string,
  viewBox: { x: number; y: number; width: number; height: number },
): void {
  let parsed: SVGPathData;
  try {
    parsed = new SVGPathData(cutlinePath);
  } catch {
    throw new SvgContractError("Rule 3 failed: cutline d must be valid SVG path data");
  }

  const moveCount = parsed.commands.filter((command) => command.type === SVGPathData.MOVE_TO).length;
  const closeCount = parsed.commands.filter((command) => command.type === SVGPathData.CLOSE_PATH).length;
  if (
    parsed.commands.length < 4 ||
    parsed.commands[0]?.type !== SVGPathData.MOVE_TO ||
    parsed.commands.at(-1)?.type !== SVGPathData.CLOSE_PATH ||
    moveCount !== 1 ||
    closeCount !== 1
  ) {
    throw new SvgContractError("Rule 3 failed: cutline must be one closed contour with exactly one subpath");
  }

  const bounds = parsed.getBounds();
  const values = [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY];
  if (!values.every(Number.isFinite) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    throw new SvgContractError("Rule 3 failed: cutline contour must have non-zero width and height");
  }

  const epsilon = Math.max(viewBox.width, viewBox.height) * 0.000001;
  if (
    bounds.minX < viewBox.x - epsilon ||
    bounds.minY < viewBox.y - epsilon ||
    bounds.maxX > viewBox.x + viewBox.width + epsilon ||
    bounds.maxY > viewBox.y + viewBox.height + epsilon
  ) {
    throw new SvgContractError("Rule 3 failed: cutline bounds must stay inside the SVG viewBox");
  }

  const coverageX = (bounds.maxX - bounds.minX) / viewBox.width;
  const coverageY = (bounds.maxY - bounds.minY) / viewBox.height;
  if (coverageX < 0.9 || coverageY < 0.9) {
    throw new SvgContractError("Rule 3 failed: cutline must cover at least 90% of the SVG viewBox");
  }
}

function assertPlaceholders(svg: string, takesLabel: boolean): void {
  const found = [...svg.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]);
  const unknown = found.find((name) => !RECIPE_PLACEHOLDERS.has(name));
  if (unknown) throw new SvgContractError(`Rule 6 failed: unknown placeholder "{{${unknown}}}"`);
  const hasLabel = found.includes("label");
  if (hasLabel !== takesLabel) {
    throw new SvgContractError(
      `Rule 7 failed: {{label}} must appear ${takesLabel ? "when takes_label is true" : "only when takes_label is true"}`,
    );
  }
}

function assertNoRaster(svg: string): void {
  if (/<\s*image\b/i.test(svg)) throw new SvgContractError("Rule 4 failed: raster <image> elements are not allowed");
  if (/\b(?:fill|style)\s*=\s*["'][^"']*(?:url\s*\(|data:image)/i.test(svg)) {
    throw new SvgContractError("Rule 4 failed: raster fills and external paint references are not allowed");
  }
}

export function validateShapeRecipeTemplate(input: ShapeRecipeInput): ValidatedShapeRecipe {
  if (!input.name.trim()) throw new SvgContractError("Recipe name is required");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    throw new SvgContractError("Recipe slug must contain lowercase letters, numbers, and hyphens only");
  }
  if (!Number.isFinite(input.aspectRatio) || input.aspectRatio <= 0) {
    throw new SvgContractError("Rule 5 failed: aspect_ratio must be a positive number");
  }
  if (!Number.isFinite(input.defaultSizeMm) || input.defaultSizeMm <= 0) {
    throw new SvgContractError("default_size_mm must be a positive number");
  }
  if (!STICKER_FUNCTION_TYPES.includes(input.functionType as StickerFunctionType)) {
    throw new SvgContractError(`functionType must be one of: ${STICKER_FUNCTION_TYPES.join(", ")}`);
  }
  const attrs = rootAttributes(input.svgTemplate);
  assertQuotedRootDimensions(input.svgTemplate);
  const width = parseMm(attrs.width, "width");
  const height = parseMm(attrs.height, "height");
  const viewBox = parseViewBox(attrs.viewbox);
  const templateAspect = viewBox.width / viewBox.height;
  const physicalAspect = width / height;
  const aspectTolerance = 0.005;
  if (
    Math.abs(templateAspect - input.aspectRatio) / input.aspectRatio > aspectTolerance ||
    Math.abs(physicalAspect - input.aspectRatio) / input.aspectRatio > aspectTolerance ||
    Math.abs(physicalAspect - templateAspect) / templateAspect > aspectTolerance
  ) {
    throw new SvgContractError(
      `Rule 5 failed: physical dimensions (${physicalAspect.toFixed(4)}) and viewBox (${templateAspect.toFixed(4)}) must match aspect_ratio ${input.aspectRatio.toFixed(4)} within 0.5%`,
    );
  }
  assertNoRaster(input.svgTemplate);
  assertPlaceholders(input.svgTemplate, input.takesLabel);

  // The shared contract scanner validates the complete element/attribute allowlist.
  // Replace legal dynamic values only for the scan; the original sanitized template
  // is returned so placeholders remain available to the deterministic renderer.
  const scanSvg = input.svgTemplate
    .replace(/\{\{primary\}\}/g, "#000000")
    .replace(/\{\{accent\}\}/g, "#000000")
    .replace(/\{\{labelFontSize\}\}/g, "100")
    .replace(/\{\{label\}\}/g, "Label");
  try {
    validateSvgTemplate(scanSvg, { unit: "mm", w: width, h: height });
  } catch (error) {
    if (error instanceof SvgContractError) {
      throw new SvgContractError(`Rule 1/2 failed: ${error.message}`);
    }
    throw error;
  }
  const cutlinePath = cutlineFromTemplate(input.svgTemplate);
  validateCutlineGeometry(cutlinePath, viewBox);
  return { svgTemplate: input.svgTemplate.trim(), viewBox, cutlinePath };
}

export function renderShapeRecipe(
  recipe: Pick<StickerShapeRecipe, "svgTemplate" | "aspectRatio" | "takesLabel">,
  params: { primary: string; accent: string; label?: string; labelFontSize?: number; sizeInMm: number },
): { svg: string; cutlinePath: string; viewBox: { x: number; y: number; width: number; height: number } } {
  const primary = parseHexColor(params.primary);
  const accent = parseHexColor(params.accent);
  const label = params.label ?? "";
  const labelFontSize = params.labelFontSize ?? 100;
  const validated = validateShapeRecipeTemplate({
    name: "render",
    slug: "render",
    functionType: "banner",
    svgTemplate: recipe.svgTemplate,
    aspectRatio: recipe.aspectRatio,
    defaultSizeMm: params.sizeInMm,
    takesLabel: recipe.takesLabel,
  });
  const escapeXml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  const width = params.sizeInMm;
  const height = params.sizeInMm / recipe.aspectRatio;
  const svg = validated.svgTemplate
    .replace(/\{\{primary\}\}/g, primary)
    .replace(/\{\{accent\}\}/g, accent)
    .replace(/\{\{labelFontSize\}\}/g, String(labelFontSize))
    .replace(/\{\{label\}\}/g, escapeXml(label))
    .replace(
      /(<svg\b[^>]*\bwidth\s*=\s*["'])[^"']+(["'])/i,
      `$1${width}mm$2`,
    )
    .replace(
      /(<svg\b[^>]*\bheight\s*=\s*["'])[^"']+(["'])/i,
      `$1${height}mm$2`,
    );
  const rendered = validateSvgTemplate(svg, {
    unit: "mm",
    w: width,
    h: height,
  });
  return { svg: rendered.svg, cutlinePath: validated.cutlinePath, viewBox: rendered.viewBox };
}

export function renderShapeRecipeCutlineSvg(
  rendered: Pick<ValidatedShapeRecipe, "cutlinePath" | "viewBox">,
  widthMm: number,
): string {
  if (!Number.isFinite(widthMm) || widthMm <= 0) {
    throw new SvgContractError("Cutline width must be a positive millimetre value");
  }
  const heightMm = widthMm * (rendered.viewBox.height / rendered.viewBox.width);
  const pixelWidth = Math.max(1, Math.round((widthMm / MM_PER_INCH) * SHAPE_RECIPE_OUTPUT_DPI));
  const pixelHeight = Math.max(1, Math.round((heightMm / MM_PER_INCH) * SHAPE_RECIPE_OUTPUT_DPI));
  const scaleX = pixelWidth / rendered.viewBox.width;
  const scaleY = pixelHeight / rendered.viewBox.height;
  const d = new SVGPathData(rendered.cutlinePath)
    .toAbs()
    .matrix(scaleX, 0, 0, scaleY, -rendered.viewBox.x * scaleX, -rendered.viewBox.y * scaleY)
    .round(3)
    .encode();
  const format = (value: number) => Number(value.toFixed(3)).toString();
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixelWidth} ${pixelHeight}" width="${format(widthMm)}mm" height="${format(heightMm)}mm">`,
    `  <path d="${d}" fill="none" stroke="#000000" stroke-width="1"/>`,
    `</svg>`,
  ].join("\n");
}

export function normalizeRecipeInput(body: Record<string, unknown>): ShapeRecipeInput {
  return {
    name: typeof body.name === "string" ? body.name : "",
    slug: typeof body.slug === "string" ? body.slug : "",
    functionType: typeof body.functionType === "string" ? body.functionType : "",
    svgTemplate: typeof body.svgTemplate === "string" ? body.svgTemplate : "",
    aspectRatio: Number(body.aspectRatio),
    defaultSizeMm: Number(body.defaultSizeMm),
    takesLabel: body.takesLabel === true,
    status: body.status === "live" ? "live" : "draft",
  };
}

export function recipeToResponse(recipe: StickerShapeRecipe) {
  return {
    id: recipe.id,
    origin: recipe.origin as StickerShapeRecipeOrigin,
    authoredByStoreId: recipe.authoredByStoreId,
    name: recipe.name,
    slug: recipe.slug,
    functionType: recipe.functionType,
    svgTemplate: recipe.svgTemplate,
    aspectRatio: recipe.aspectRatio,
    defaultSizeMm: recipe.defaultSizeMm,
    takesLabel: recipe.takesLabel,
    status: recipe.status,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
  };
}