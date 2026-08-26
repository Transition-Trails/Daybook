import { describe, expect, it } from "vitest";
import {
  renderShapeRecipe,
  renderShapeRecipeCutlineSvg,
  validateShapeRecipeTemplate,
} from "../lib/shape-recipes";
import { STARTER_SHAPE_RECIPES } from "@workspace/db";

const template = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120mm" height="40mm">
  <polygon points="0,8 24,8 24,32 0,32 10,20" fill="{{accent}}"/>
  <rect x="18" y="4" width="84" height="32" fill="{{primary}}"/>
  <text x="60" y="25" text-anchor="middle" font-size="{{labelFontSize}}" fill="#FFFFFF">{{label}}</text>
  <path data-name="cutline" d="M0 8 L18 8 L24 0 L96 0 L102 8 L120 8 L110 20 L120 32 L102 32 L96 40 L24 40 L18 32 L0 32 L10 20 Z" fill="none" stroke="none"/>
</svg>`;

const valid = {
  name: "Classic ribbon",
  slug: "classic-ribbon",
  functionType: "banner",
  svgTemplate: template,
  aspectRatio: 3,
  defaultSizeMm: 60,
  takesLabel: true,
  status: "live" as const,
};

function withCutline(d: string): string {
  return template.replace(/(<path data-name="cutline" d=")[^"]+/, `$1${d}`);
}

describe("sticker shape recipe validation", () => {
  it("accepts the authored ribbon contract", () => {
    expect(validateShapeRecipeTemplate(valid).cutlinePath).toMatch(/Z$/);
  });

  it.each([
    ["Rule 1", { svgTemplate: "not svg" }],
    ["Rule 2", { svgTemplate: template.replace('width="120mm"', 'width="120px"') }],
    ["Rule 2", { svgTemplate: template.replace('width="120mm"', "width=120mm") }],
    ["Rule 3", { svgTemplate: template.replace('data-name="cutline"', 'data-name="outline"') }],
    ["Rule 3", { svgTemplate: withCutline("not-a-path Z") }],
    ["Rule 3", { svgTemplate: withCutline("M0 0 L120 0 Z") }],
    ["Rule 3", { svgTemplate: withCutline("M0 0 L120 0 L120 40 Z M10 10 L20 10 L20 20 Z") }],
    ["Rule 3", { svgTemplate: withCutline("M-1 0 L120 0 L120 40 L0 40 Z") }],
    ["Rule 3", { svgTemplate: withCutline("M10 10 L20 10 L20 20 L10 20 Z") }],
    ["Rule 4", { svgTemplate: template.replace("</svg>", '<image href="data:image/png;base64,x"/></svg>') }],
    ["Rule 5", { aspectRatio: 2.5 }],
    ["Rule 5", { svgTemplate: template.replace('height="40mm"', 'height="100mm"') }],
    ["Rule 6", { svgTemplate: template.replace("{{primary}}", "{{primarry}}") }],
    ["Rule 7", { takesLabel: false }],
  ])("rejects %s failures with the failed rule", (rule, patch) => {
    expect(() => validateShapeRecipeTemplate({ ...valid, ...patch })).toThrow(rule);
  });
});

describe("sticker shape recipe rendering", () => {
  it("produces byte-identical SVG for identical inputs", () => {
    const recipe = { svgTemplate: template, aspectRatio: 3, takesLabel: true };
    const params = { primary: "#1B2A4A", accent: "#C87560", label: "Today", labelFontSize: 84, sizeInMm: 60 };
    const first = renderShapeRecipe(recipe, params);
    const second = renderShapeRecipe(recipe, params);
    expect(first.svg).toBe(second.svg);
  });

  it("scales the cutline to a 300-DPI viewBox with explicit physical dimensions", () => {
    const rendered = renderShapeRecipe(
      { svgTemplate: template, aspectRatio: 3, takesLabel: true },
      { primary: "#1B2A4A", accent: "#C87560", label: "Today", sizeInMm: 60 },
    );
    const cutline = renderShapeRecipeCutlineSvg(rendered, 60);
    expect(cutline).toContain('viewBox="0 0 709 236"');
    expect(cutline).toContain('width="60mm" height="20mm"');
  });

  it("keeps the ribbon tails inside a full-width authored cutline", () => {
    const { cutlinePath, viewBox } = validateShapeRecipeTemplate(valid);
    const xCoordinates = [...cutlinePath.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)/gi)].map((match) => Number(match[1]));
    expect(Math.min(...xCoordinates)).toBe(viewBox.x);
    expect(Math.max(...xCoordinates)).toBe(viewBox.x + viewBox.width);
  });

  it("renders every seeded starter recipe through the same validated contract", () => {
    for (const recipe of STARTER_SHAPE_RECIPES) {
      const rendered = renderShapeRecipe(recipe, {
        primary: "#1B2A4A",
        accent: "#C87560",
        label: "Today",
        labelFontSize: 84,
        sizeInMm: recipe.defaultSizeMm,
      });
      expect(rendered.svg).toContain(`${recipe.defaultSizeMm}mm`);
      expect(rendered.cutlinePath).toMatch(/[zZ]$/);
    }
  });
});