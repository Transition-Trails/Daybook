import { parseHexColor } from "./color";
import { validateSvgTemplate, SvgContractError } from "./svg-contract";
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
  const width = parseMm(attrs.width, "width");
  const height = parseMm(attrs.height, "height");
  const viewBox = parseViewBox(attrs.viewbox);
  const templateAspect = viewBox.width / viewBox.height;
  if (Math.abs(templateAspect - input.aspectRatio) > 0.01) {
    throw new SvgContractError(
      `Rule 5 failed: viewBox aspect ratio ${templateAspect.toFixed(4)} differs from aspect_ratio ${input.aspectRatio.toFixed(4)} by more than 0.01`,
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