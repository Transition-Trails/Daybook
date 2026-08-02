/**
 * WorldSmith Product Specification Board — SVG template generator.
 *
 * Generates a 1600×2000 pixel spec board that summarises a Production
 * Specification in the established WorldSmith visual language.
 *
 * Usage:
 *   const svg = buildSpecBoardSvg(data);
 *   const png = await renderSpecBoardToPng(data);   // resvg-js
 */

import path from "path";
import { fileURLToPath } from "url";
import type { SpecBoardData } from "./types";

// In the esbuild bundle all code lands in dist/index.mjs and fonts are copied
// alongside it at dist/fonts/ — so "fonts" (sibling) is correct, not "../fonts".
// This matches the pattern used by pdf-generator.ts and labelImageGen.ts.
const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts");

// ── Canvas constants ──────────────────────────────────────────────────────────

export const BOARD_W = 1600;
export const BOARD_H = 2000;

const HEADER_H = 130;
const META_H = 45;
const CONCEPT_Y = HEADER_H + META_H;      // 175
const CONCEPT_H = 575;
const SECTIONS_Y = CONCEPT_Y + CONCEPT_H; // 750
const ROW_H = 170;
const COL_W = 800;
const FULL_ROWS = 6;   // 6 two-column rows
const FULL_ROW_H = 170; // single full-width row for Canon Lock
const FOOTER_H = 60;

// Computed BOARD_H check: 130 + 45 + 575 + (6*170) + 170 + 60 = 2000 ✓

/** The exact pixel rectangle where the DALL-E concept image is composited. */
export const CONCEPT_IMAGE_AREA = {
  x: 180,
  y: CONCEPT_Y + 15,    // 190
  width: 1240,
  height: 545,
} as const;

// ── Brand constants ───────────────────────────────────────────────────────────

const NAVY   = "#1B2A4A";
const NAVY2  = "#24386A";
const CLAY   = "#C87560";
const CREAM  = "#F7F4EE";
const BORDER = "#D9D4CA";
const MUTED  = "#6B6560";
const WHITE  = "#FFFFFF";

const DEFAULT_SWATCHES: Array<{ name: string; hex: string }> = [
  { name: "Ink Navy", hex: "#1B2A4A" },
  { name: "Clay",     hex: "#C87560" },
  { name: "Cream",    hex: "#F7F4EE" },
  { name: "Forest",   hex: "#3D5A48" },
  { name: "Warm Gray", hex: "#8A8580" },
];

// ── Text helpers ──────────────────────────────────────────────────────────────

function esc(s: string | undefined | null): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trunc(s: string | undefined | null, max: number): string {
  const t = (s ?? "").trim();
  return t.length > max ? t.slice(0, max - 1) + "\u2026" : t;
}

function wrapText(
  raw: string | undefined | null,
  maxChars: number,
  maxLines: number,
): string[] {
  const text = (raw ?? "").trim();
  if (!text) return ["—"];
  const lines: string[] = [];

  for (const para of text.split(/\n+/)) {
    if (lines.length >= maxLines) break;
    const words = para.trim().split(/\s+/);
    let cur = "";
    for (const word of words) {
      if (lines.length >= maxLines) break;
      if ((cur ? cur + " " + word : word).length > maxChars) {
        if (cur) lines.push(cur);
        cur = word.length > maxChars ? word.slice(0, maxChars - 1) + "\u2026" : word;
      } else {
        cur = cur ? cur + " " + word : word;
      }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
  }

  if (
    lines.length === maxLines &&
    text.length > lines.join(" ").length + 5
  ) {
    lines[maxLines - 1] = (lines[maxLines - 1] ?? "").replace(/\s*\S+$/, "\u2026");
  }
  return lines.length ? lines : ["—"];
}

/** Build a tspan block for multi-line SVG text. */
function tspans(lines: string[], anchorX: number, lineHeight = 18): string {
  return lines
    .map(
      (ln, i) =>
        `<tspan x="${anchorX}" dy="${i === 0 ? 0 : lineHeight}">${esc(ln)}</tspan>`,
    )
    .join("");
}

// ── Section renderer ──────────────────────────────────────────────────────────

function section(
  x: number, y: number, w: number, h: number,
  title: string,
  content: string | undefined | null,
  accent: string = NAVY,
  bgColor = WHITE,
): string {
  const hdrH = 28;
  const padX = x + 18;
  const bodyY = y + hdrH;
  const textY = bodyY + 16;
  const usableW = w - 36;
  const charsPerLine = Math.floor(usableW / 7.2);
  const linesAvail = Math.floor((h - hdrH - 16) / 18);
  const lines = wrapText(content, charsPerLine, Math.min(linesAvail, 7));
  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${hdrH}" fill="${accent}"/>`,
    `<text x="${padX}" y="${y + 18}" font-family="Instrument Sans" font-size="10.5"`,
    `  font-weight="bold" fill="${WHITE}" letter-spacing="0.8">${esc(title.toUpperCase())}</text>`,
    `<rect x="${x}" y="${bodyY}" width="${w}" height="${h - hdrH}" fill="${bgColor}"`,
    `  stroke="${BORDER}" stroke-width="0.5"/>`,
    `<text x="${padX}" y="${textY}" font-family="Instrument Sans" font-size="12" fill="#2A2A2A">`,
    tspans(lines, padX),
    `</text>`,
  ].join("\n");
}

/** Special colour-palette section with swatch rectangles. */
function colorPaletteSection(
  x: number, y: number, w: number, h: number,
  swatches: Array<{ name: string; hex: string }>,
): string {
  const hdrH = 28;
  const bodyY = y + hdrH;
  const padX = 18;
  const effective = (swatches.length > 0 ? swatches : DEFAULT_SWATCHES).slice(0, 5);
  const swatchW = Math.floor((w - padX * 2) / effective.length);
  const swatchH = 58;
  const swatchTop = bodyY + 14;

  const items = effective.map((sw, i) => {
    const sx = x + padX + i * swatchW + 3;
    const centerX = sx + (swatchW - 6) / 2;
    return [
      `<rect x="${sx}" y="${swatchTop}" width="${swatchW - 6}" height="${swatchH}"`,
      `  fill="${esc(sw.hex)}" rx="3" stroke="${BORDER}" stroke-width="0.5"/>`,
      `<text x="${centerX}" y="${swatchTop + swatchH + 13}" text-anchor="middle"`,
      `  font-family="Instrument Sans" font-size="9.5" fill="${MUTED}">${esc(trunc(sw.name, 11))}</text>`,
      `<text x="${centerX}" y="${swatchTop + swatchH + 25}" text-anchor="middle"`,
      `  font-family="Space Mono" font-size="8.5" fill="#9C9088">${esc(sw.hex)}</text>`,
    ].join("\n");
  });

  return [
    `<rect x="${x}" y="${y}" width="${w}" height="${hdrH}" fill="${NAVY}"/>`,
    `<text x="${x + padX}" y="${y + 18}" font-family="Instrument Sans" font-size="10.5"`,
    `  font-weight="bold" fill="${WHITE}" letter-spacing="0.8">COLOR PALETTE</text>`,
    `<rect x="${x}" y="${bodyY}" width="${w}" height="${h - hdrH}"`,
    `  fill="${WHITE}" stroke="${BORDER}" stroke-width="0.5"/>`,
    ...items,
  ].join("\n");
}

// ── Main SVG builder ──────────────────────────────────────────────────────────

export function buildSpecBoardSvg(data: SpecBoardData): string {
  const {
    productionItem, specId, world, volume, componentType,
    payloadVersion, currentVersion, status,
    designIntent, narrativePurpose, requiredContent, reviewCriteria,
    assetRole, composition, materials, visualHierarchy,
    textRule, canonRule, printRule, negativeConstraints,
    componentSpecName, componentSpecContent,
    styleGuideName, styleGuideContent,
    promptModuleCount, canonDependency, canonRecordCount,
    colorSwatches,
  } = data;

  const today = new Date().toISOString().slice(0, 10);
  const collectionLine = [world, volume].filter(Boolean).join(" · ");

  // ── HEADER (y=0–130) ─────────────────────────────────────────────────────

  const header = [
    `<rect x="0" y="0" width="${BOARD_W}" height="${HEADER_H}" fill="${NAVY}"/>`,
    // Top stripe accent
    `<rect x="0" y="0" width="${BOARD_W}" height="4" fill="${CLAY}"/>`,
    // WorldSmith Foundation
    `<text x="40" y="38" font-family="Spectral" font-size="13" font-weight="bold"`,
    `  fill="${CLAY}" letter-spacing="0.5">WorldSmith Foundation</text>`,
    // Production item title
    `<text x="40" y="76" font-family="Spectral" font-size="28" font-weight="bold"`,
    `  fill="${WHITE}">${esc(trunc(productionItem, 60))}</text>`,
    // Collection line
    `<text x="40" y="106" font-family="Instrument Sans" font-size="13" fill="#8BA8C4"`,
    `  letter-spacing="0.3">${esc(collectionLine || world || "—")}</text>`,
    // Right-side badge
    `<text x="${BOARD_W - 40}" y="38" text-anchor="end" font-family="Instrument Sans"`,
    `  font-size="11" font-weight="bold" fill="${CLAY}" letter-spacing="1.2">PRODUCT SPECIFICATION</text>`,
    // Component type chip
    `<rect x="${BOARD_W - 40 - 160}" y="50" width="160" height="22" rx="3" fill="${NAVY2}" stroke="${CLAY}" stroke-width="0.8"/>`,
    `<text x="${BOARD_W - 40 - 80}" y="65" text-anchor="middle" font-family="Instrument Sans"`,
    `  font-size="11" fill="${WHITE}">${esc(trunc(componentType, 22))}</text>`,
    // Status chip (right, below component type)
    `<rect x="${BOARD_W - 40 - 160}" y="82" width="160" height="22" rx="3" fill="#354F7A"/>`,
    `<text x="${BOARD_W - 40 - 80}" y="97" text-anchor="middle" font-family="Instrument Sans"`,
    `  font-size="11" fill="#A8C4E0">${esc(trunc(status || "Active", 22))}</text>`,
  ].join("\n");

  // ── META STRIP (y=130–175) ───────────────────────────────────────────────

  const metaItems = [
    ["Spec ID", specId || "—"],
    ["Payload Version", payloadVersion || "—"],
    ["Version", currentVersion || "1"],
    ["Modules", String(promptModuleCount)],
    ["Date", today],
  ];
  const metaItemW = Math.floor(BOARD_W / metaItems.length);

  const meta = [
    `<rect x="0" y="${HEADER_H}" width="${BOARD_W}" height="${META_H}" fill="${NAVY2}"/>`,
    ...metaItems.map(([label, value], i) => {
      const mx = 40 + i * metaItemW;
      return [
        `<text x="${mx}" y="${HEADER_H + 17}" font-family="Instrument Sans" font-size="9"`,
        `  font-weight="bold" fill="#8BA8C4" letter-spacing="0.8">${esc(label.toUpperCase())}</text>`,
        `<text x="${mx}" y="${HEADER_H + 33}" font-family="Space Mono" font-size="10.5"`,
        `  fill="${WHITE}">${esc(trunc(value, 28))}</text>`,
      ].join("\n");
    }),
  ].join("\n");

  // ── CONCEPT AREA (y=175–750) ─────────────────────────────────────────────

  const conceptBg = CREAM;
  const imgX = CONCEPT_IMAGE_AREA.x;
  const imgY = CONCEPT_IMAGE_AREA.y;
  const imgW = CONCEPT_IMAGE_AREA.width;
  const imgH = CONCEPT_IMAGE_AREA.height;

  const concept = [
    `<rect x="0" y="${CONCEPT_Y}" width="${BOARD_W}" height="${CONCEPT_H}" fill="${conceptBg}"/>`,
    // Left and right padding columns
    `<rect x="0" y="${CONCEPT_Y}" width="${imgX}" height="${CONCEPT_H}" fill="${CREAM}"/>`,
    `<rect x="${imgX + imgW}" y="${CONCEPT_Y}" width="${BOARD_W - imgX - imgW}" height="${CONCEPT_H}" fill="${CREAM}"/>`,
    // Central concept image placeholder (DALL-E image composited here)
    `<rect x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}"`,
    `  fill="#E8E4DE" stroke="#C4BDB5" stroke-width="1.5" stroke-dasharray="10,5" rx="2"/>`,
    // Placeholder text (visible if no image is composited)
    `<text x="${imgX + imgW / 2}" y="${imgY + imgH / 2 - 14}" text-anchor="middle"`,
    `  font-family="Spectral" font-size="24" font-weight="bold" fill="#B4ACA4">CONCEPT PREVIEW</text>`,
    `<text x="${imgX + imgW / 2}" y="${imgY + imgH / 2 + 14}" text-anchor="middle"`,
    `  font-family="Instrument Sans" font-size="14" fill="#C4BDB5">FOR HUMAN REVIEW</text>`,
    // Label bar below image
    `<rect x="0" y="${CONCEPT_Y + CONCEPT_H - 32}" width="${BOARD_W}" height="32" fill="#E0DDD7"/>`,
    `<text x="${BOARD_W / 2}" y="${CONCEPT_Y + CONCEPT_H - 12}" text-anchor="middle"`,
    `  font-family="Instrument Sans" font-size="11" font-weight="bold" fill="${MUTED}"`,
    `  letter-spacing="1.5">▸  CONCEPT PREVIEW  ·  FOR HUMAN REVIEW  ◂</text>`,
  ].join("\n");

  // ── SECTION GRID ─────────────────────────────────────────────────────────

  const sy = SECTIONS_Y;

  // Style Lock content: use style guide content or a summary
  const styleLockContent = styleGuideContent
    ? trunc(styleGuideContent, 600)
    : styleGuideName
      ? `Style Guide: ${styleGuideName}. See the linked Style Guide for full illustration medium, historical period, visual treatment, and prohibited style deviations.`
      : "No style guide linked. See Production Specification for style constraints.";

  // Asset Purpose
  const assetPurpose = [designIntent, narrativePurpose]
    .filter(Boolean)
    .join("\n\n") || "—";

  // Narrative summary
  const narrativeSummary = [
    requiredContent ? `Required content: ${requiredContent}` : "",
    componentType ? `Component type: ${componentType}` : "",
    assetRole ? `Asset role: ${assetRole}` : "",
  ].filter(Boolean).join("\n") || "—";

  // Composition & Layout
  const compositionContent = [
    composition ? `Composition: ${composition}` : "",
    visualHierarchy ? `Visual hierarchy: ${visualHierarchy}` : "",
    componentSpecContent ? `Component spec: ${trunc(componentSpecContent, 200)}` : "",
  ].filter(Boolean).join("\n") || "—";

  // Illustration characteristics
  const illustrationContent = [
    materials ? `Materials: ${materials}` : "",
    styleGuideName ? `Style guide: ${styleGuideName}` : "",
    promptModuleCount > 0 ? `${promptModuleCount} Prompt Module${promptModuleCount > 1 ? "s" : ""} applied` : "",
  ].filter(Boolean).join("\n") || "—";

  // Prohibitions
  const prohibitionsContent = [
    negativeConstraints ? `Negative constraints: ${negativeConstraints}` : "",
    textRule ? `Text rule: ${textRule}` : "",
  ].filter(Boolean).join("\n") || "—";

  // Technical requirements
  const technicalContent = [
    printRule ? `Print rule: ${printRule}` : "",
    "Output: PNG · sRGB",
    "Preview: 1600×2000 px · 72–150 DPI · Screen review only",
    payloadVersion ? `Payload version: ${payloadVersion}` : "",
  ].filter(Boolean).join("\n") || "—";

  // Usability
  const usabilityContent = reviewCriteria || "Review criteria not specified. Evaluate against the linked Component Specification and Style Guide.";

  // QA Review Criteria (checklist style)
  const qaLines = (reviewCriteria || "")
    .split(/[;\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((s) => `☐ ${s}`);
  const qaContent = qaLines.length ? qaLines.join("\n") : "☐ Matches composition requirements\n☐ Respects negative constraints\n☐ Correct component type\n☐ Canon compliance";

  // Series / Component Benchmark
  const seriesContent = [
    componentSpecName ? `Component Specification: ${componentSpecName}` : "",
    "Reuse Level: Review linked Component Specification.",
    world ? `World: ${world}` : "",
    volume ? `Volume: ${volume}` : "",
  ].filter(Boolean).join("\n") || "—";

  // References
  const referencesContent = [
    componentSpecName ? `Component Spec: ${componentSpecName}` : "",
    styleGuideName ? `Style Guide: ${styleGuideName}` : "",
    promptModuleCount > 0 ? `${promptModuleCount} Prompt Module${promptModuleCount > 1 ? "s" : ""} linked` : "",
    "See Notion record for linked asset references.",
  ].filter(Boolean).join("\n") || "—";

  // Canon Lock
  const canonContent = [
    canonDependency ? `Canon Dependency: ${canonDependency}` : "Canon Dependency: None",
    canonRecordCount > 0 ? `${canonRecordCount} Canon Record${canonRecordCount > 1 ? "s" : ""} linked` : "No canon records linked.",
    canonRule ? `Canon rule: ${canonRule}` : "",
    "Do not invent canon names, characters, or locations not approved in linked Canon Records.",
  ].filter(Boolean).join("\n");

  // Row 1: Style Lock | Asset Purpose
  const r1 = section(0,         sy,          COL_W, ROW_H, "Style Lock",         styleLockContent,     "#3D5A48");
  const r1b = section(COL_W,    sy,          COL_W, ROW_H, "Asset Purpose",       assetPurpose,          NAVY);

  // Row 2: Narrative Summary | Composition & Layout
  const r2 = section(0,         sy + ROW_H,       COL_W, ROW_H, "Narrative Summary",   narrativeSummary,      NAVY);
  const r2b = section(COL_W,    sy + ROW_H,       COL_W, ROW_H, "Composition & Layout", compositionContent,  "#4A3B6E");

  // Row 3: Illustration Characteristics | Color Palette
  const r3 = section(0,         sy + ROW_H * 2,   COL_W, ROW_H, "Illustration Characteristics", illustrationContent, "#5A3B2E");
  const r3b = colorPaletteSection(COL_W, sy + ROW_H * 2, COL_W, ROW_H, colorSwatches ?? []);

  // Row 4: Prohibitions | Technical Requirements
  const r4 = section(0,         sy + ROW_H * 3,   COL_W, ROW_H, "Prohibitions",        prohibitionsContent,   "#7A2E2E");
  const r4b = section(COL_W,    sy + ROW_H * 3,   COL_W, ROW_H, "Technical Requirements", technicalContent,   "#2E4A5A");

  // Row 5: Usability | QA Review Criteria
  const r5 = section(0,         sy + ROW_H * 4,   COL_W, ROW_H, "Usability",           usabilityContent,      NAVY);
  const r5b = section(COL_W,    sy + ROW_H * 4,   COL_W, ROW_H, "QA Review Criteria",  qaContent,             "#3D4A3E");

  // Row 6: Series / Component Benchmark | References
  const r6 = section(0,         sy + ROW_H * 5,   COL_W, ROW_H, "Series & Component Benchmark", seriesContent, "#4A3B6E");
  const r6b = section(COL_W,    sy + ROW_H * 5,   COL_W, ROW_H, "References",          referencesContent,     NAVY);

  // Row 7: Canon Lock (full width)
  const canonRowY = sy + ROW_H * FULL_ROWS;
  const r7 = section(0, canonRowY, BOARD_W, FULL_ROW_H, "Canon Lock", canonContent, "#6B2929");

  // ── FOOTER (y=1940–2000) ─────────────────────────────────────────────────

  const footerY = canonRowY + FULL_ROW_H;
  const footer = [
    `<rect x="0" y="${footerY}" width="${BOARD_W}" height="${FOOTER_H}" fill="${NAVY}"/>`,
    `<rect x="0" y="${footerY}" width="${BOARD_W}" height="3" fill="${CLAY}"/>`,
    `<text x="${BOARD_W / 2}" y="${footerY + 24}" text-anchor="middle"`,
    `  font-family="Instrument Sans" font-size="12" font-weight="bold" fill="${CLAY}"`,
    `  letter-spacing="1">SCREEN REVIEW PREVIEW — NOT FINAL PRINT ARTWORK</text>`,
    `<text x="${BOARD_W / 2}" y="${footerY + 43}" text-anchor="middle"`,
    `  font-family="Instrument Sans" font-size="10.5" fill="#8BA8C4">`,
    `  WorldSmith Foundation · Template v1 · Generated ${today}`,
    `</text>`,
  ].join("\n");

  // ── Assemble ─────────────────────────────────────────────────────────────

  return [
    `<svg xmlns="http://www.w3.org/2000/svg"`,
    `  viewBox="0 0 ${BOARD_W} ${BOARD_H}"`,
    `  width="${BOARD_W}" height="${BOARD_H}">`,
    // Full background
    `<rect width="${BOARD_W}" height="${BOARD_H}" fill="${CREAM}"/>`,
    header,
    meta,
    concept,
    r1, r1b,
    r2, r2b,
    r3, r3b,
    r4, r4b,
    r5, r5b,
    r6, r6b,
    r7,
    footer,
    `</svg>`,
  ].join("\n");
}

// ── PNG renderer ─────────────────────────────────────────────────────────────

/**
 * Render the spec board SVG to a PNG Buffer via @resvg/resvg-js.
 * Uses the bundled Spectral, Instrument Sans, and Space Mono TTF fonts.
 */
export async function renderSpecBoardToPng(data: SpecBoardData): Promise<Buffer> {
  const { Resvg } = (await import("@resvg/resvg-js")) as typeof import("@resvg/resvg-js");

  const svg = buildSpecBoardSvg(data);

  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: [
        path.join(FONT_DIR, "Spectral-Bold.ttf"),
        path.join(FONT_DIR, "Spectral-Regular.ttf"),
        path.join(FONT_DIR, "InstrumentSans-Bold.ttf"),
        path.join(FONT_DIR, "InstrumentSans-Regular.ttf"),
        path.join(FONT_DIR, "SpaceMono-Regular.ttf"),
        path.join(FONT_DIR, "SpaceMono-Bold.ttf"),
      ],
      defaultFontFamily: "Instrument Sans",
    },
    fitTo: { mode: "width" as const, value: BOARD_W },
  });

  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}
