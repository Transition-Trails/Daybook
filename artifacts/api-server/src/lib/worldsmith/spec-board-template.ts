/**
 * WorldSmith Product Specification Board — SVG template generator (v2.0).
 *
 * Redesigned as an elegant print-quality specification document in the
 * Victorian editorial style of the WorldSmith Visual Language Guide.
 *
 * Generates a 1600×2000 pixel board. The central DALL-E concept image is
 * composited at CONCEPT_IMAGE_AREA by spec-preview-service.ts.
 *
 * Usage:
 *   const svg = buildSpecBoardSvg(data);
 *   const png = await renderSpecBoardToPng(data);   // resvg-js
 */

import path from "path";
import { fileURLToPath } from "url";
import type { SpecBoardData } from "./types";

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts");

// ── Canvas constants ──────────────────────────────────────────────────────────

export const BOARD_W = 1600;
export const BOARD_H = 2000;

// Three-column layout
const L_X = 42;        // Left column start
const L_W = 415;       // Left column width
const C_X = 477;       // Center column start  (L_X + L_W + 20)
const C_W = 576;       // Center column width
const R_X = 1073;      // Right column start   (C_X + C_W + 20)
const R_W = 485;       // Right column width

const HEADER_H = 222;  // Header height
const BODY_Y   = HEADER_H;
const BODY_H   = 1133; // Body height (three columns)
const BODY_B   = BODY_Y + BODY_H; // 1355

const ROW1_Y = BODY_B + 12;       // Bottom row 1 start  (1367)
const ROW1_H = 238;
const ROW2_Y = ROW1_Y + ROW1_H + 12; // Bottom row 2 start  (1617)
const ROW2_H = 232;
const FOOTER_Y = ROW2_Y + ROW2_H + 18; // Footer start       (1867)

/** Pixel rectangle where the DALL-E concept image is composited by sharp. */
export const CONCEPT_IMAGE_AREA = {
  x: C_X + 16,        // 493
  y: BODY_Y + 24,     // 246
  width:  C_W - 32,   // 544
  height: 860,
} as const;

// ── Brand palette ─────────────────────────────────────────────────────────────

const PAPER  = "#F5F0E8";
const NAVY   = "#1B2A4A";
const CLAY   = "#C87560";
const CREAM  = "#F0EADE";
const INK    = "#1A1917";
const MUTED  = "#7A756E";
const RULE   = "#C4BEB4";
const FOREST = "#3D5A48";
const LIGHT  = "#E8E3D8";
const WHITE  = "#FFFFFF";

const DEFAULT_SWATCHES: Array<{ name: string; hex: string }> = [
  { name: "Antique Ivory",   hex: "#F3E9D7" },
  { name: "Parchment Cream", hex: "#EDE5C6" },
  { name: "Sage Gray",       hex: "#9AA090" },
  { name: "Olive",           hex: "#7A5C3A" },
  { name: "Walnut Brown",    hex: "#5A442E" },
  { name: "Charcoal",        hex: "#2E2E2E" },
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

function tspans(lines: string[], anchorX: number, lineHeight = 15.5): string {
  return lines
    .map((ln, i) => `<tspan x="${anchorX}" dy="${i === 0 ? 0 : lineHeight}">${esc(ln)}</tspan>`)
    .join("");
}

// ── Section renderer — document style (no colored header box) ─────────────────

/**
 * Renders a numbered section with:
 *   - Thin left accent bar
 *   - Bold small-caps section title with fine rule below
 *   - Wrapped body text
 */
function docSection(
  x: number, y: number, w: number, h: number,
  num: number,
  title: string,
  mandatory: boolean,
  content: string | null | undefined,
  accent: string = NAVY,
): string {
  const padX  = x + 15;
  const titleY = y + 18;
  const ruleY  = y + 27;
  const textY  = y + 45;
  const usableW = w - 30;
  const charsPerLine = Math.floor(usableW / 6.4);
  const linesAvail   = Math.floor((h - 55) / 15.5);
  const lines = wrapText(content, charsPerLine, Math.min(linesAvail, 9));
  const suffix = mandatory ? " (MANDATORY)" : "";

  return [
    `<rect x="${x}" y="${y}" width="2.5" height="${h}" fill="${accent}" opacity="0.5"/>`,
    `<text x="${padX}" y="${titleY}" font-family="Spectral" font-size="9.5" font-weight="bold" fill="${accent}" opacity="0.65">${num}.</text>`,
    `<text x="${padX + 14}" y="${titleY}" font-family="Spectral" font-size="10" font-weight="bold" fill="${INK}" letter-spacing="1.1">${esc(title.toUpperCase() + suffix)}</text>`,
    `<line x1="${padX}" y1="${ruleY}" x2="${x + w - 12}" y2="${ruleY}" stroke="${RULE}" stroke-width="0.5"/>`,
    `<text x="${padX}" y="${textY}" font-family="Spectral" font-size="11.5" fill="${INK}" opacity="0.87">`,
    tspans(lines, padX),
    `</text>`,
  ].join("\n");
}

/** Renders a section with a bullet list instead of wrapped text. */
function bulletSection(
  x: number, y: number, w: number, h: number,
  num: number,
  title: string,
  mandatory: boolean,
  items: string[],
  accent: string = NAVY,
): string {
  const padX   = x + 15;
  const titleY = y + 18;
  const ruleY  = y + 27;
  const charsPerLine = Math.floor((w - 42) / 6.4);

  let curY = y + 44;
  const bullets: string[] = [];
  for (const item of items) {
    if (curY > y + h - 12) break;
    const t = trunc(item, charsPerLine);
    bullets.push(
      `<circle cx="${padX + 4}" cy="${curY - 3.5}" r="2" fill="${accent}" opacity="0.45"/>`,
      `<text x="${padX + 13}" y="${curY}" font-family="Spectral" font-size="11" fill="${INK}" opacity="0.87">${esc(t)}</text>`,
    );
    curY += 16;
  }
  const suffix = mandatory ? " (MANDATORY)" : "";
  return [
    `<rect x="${x}" y="${y}" width="2.5" height="${h}" fill="${accent}" opacity="0.5"/>`,
    `<text x="${padX}" y="${titleY}" font-family="Spectral" font-size="9.5" font-weight="bold" fill="${accent}" opacity="0.65">${num}.</text>`,
    `<text x="${padX + 14}" y="${titleY}" font-family="Spectral" font-size="10" font-weight="bold" fill="${INK}" letter-spacing="1.1">${esc(title.toUpperCase() + suffix)}</text>`,
    `<line x1="${padX}" y1="${ruleY}" x2="${x + w - 12}" y2="${ruleY}" stroke="${RULE}" stroke-width="0.5"/>`,
    ...bullets,
  ].join("\n");
}

// ── Illustration characteristics section (right column, Section 5) ────────────

const TECHNIQUES: Array<{ name: string; desc: string; color: string }> = [
  { name: "WATERCOLOUR WASHES",         desc: "Transparent washes with soft edges and visible brush texture.",   color: "#B8CED8" },
  { name: "GOUACHE HIGHLIGHTS",         desc: "Opaque touches for highlights, lightened edges, paper opacity.",  color: "#E8E0CC" },
  { name: "FINE INK LINEWORK",          desc: "Delicate ink lines for typography, rules, botanical details.",    color: "#3A3028" },
  { name: "GRAPHITE CONSTRUCTION",      desc: "Subtle sketch lines and soft graphite texture.",                   color: "#A0A098" },
  { name: "AGED PAPER INTEGRATION",     desc: "Visible paper tooth, fibers, foxing, and water staining.",        color: "#C8B88A" },
  { name: "SOFT PIGMENT TRANSITIONS",   desc: "No hard digital edges. Natural diffusion, layered pigment.",      color: "#D4C8A8" },
  { name: "HAND-ILLUSTRATED CONSISTENCY", desc: "All elements match in technique, scale, and line quality.",     color: "#7A8A78" },
];

function illustrationCharSection(
  x: number, y: number, w: number, h: number,
  num: number,
): string {
  const padX = x + 15;
  const titleY = y + 18;
  const ruleY  = y + 27;
  const techniques = TECHNIQUES; // all 7
  const itemH = Math.floor((h - 52) / techniques.length);
  const swatchSz = 22;

  const items = techniques.map((tech, i) => {
    const iy = y + 46 + i * itemH;
    const descTrunc = trunc(tech.desc, Math.floor((w - swatchSz - 44) / 5.5));
    return [
      `<rect x="${padX}" y="${iy - 2}" width="${swatchSz}" height="${swatchSz}" fill="${tech.color}" rx="2" stroke="${RULE}" stroke-width="0.4"/>`,
      `<text x="${padX + swatchSz + 9}" y="${iy + 9}" font-family="Spectral" font-size="8.5" font-weight="bold" fill="${INK}" letter-spacing="0.7">${esc(tech.name)}</text>`,
      `<text x="${padX + swatchSz + 9}" y="${iy + 22}" font-family="Spectral" font-size="9.5" fill="${MUTED}">${esc(descTrunc)}</text>`,
    ].join("\n");
  });

  return [
    `<rect x="${x}" y="${y}" width="2.5" height="${h}" fill="${FOREST}" opacity="0.5"/>`,
    `<text x="${padX}" y="${titleY}" font-family="Spectral" font-size="9.5" font-weight="bold" fill="${FOREST}" opacity="0.65">${num}.</text>`,
    `<text x="${padX + 14}" y="${titleY}" font-family="Spectral" font-size="10" font-weight="bold" fill="${INK}" letter-spacing="1.1">ILLUSTRATION CHARACTERISTICS (REQUIRED)</text>`,
    `<line x1="${padX}" y1="${ruleY}" x2="${x + w - 12}" y2="${ruleY}" stroke="${RULE}" stroke-width="0.5"/>`,
    ...items,
  ].join("\n");
}

// ── Color palette section (right column, Section 6) ───────────────────────────

function colorPaletteSection(
  x: number, y: number, w: number, h: number,
  num: number,
  swatches: Array<{ name: string; hex: string }>,
): string {
  const padX = x + 15;
  const effective = (swatches.length > 0 ? swatches : DEFAULT_SWATCHES).slice(0, 6);
  const cols = 3;
  const colW = Math.floor((w - 30) / cols);
  const r    = Math.min(Math.floor(colW / 2) - 6, 30); // circle radius
  const startY = y + 44;
  const rowH   = r * 2 + 34; // circle + name + hex

  const items = effective.map((sw, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx  = padX + col * colW + colW / 2;
    const cy  = startY + row * rowH + r;
    return [
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(sw.hex)}" stroke="${RULE}" stroke-width="0.6"/>`,
      `<text x="${cx}" y="${cy + r + 14}" text-anchor="middle" font-family="Spectral" font-size="8.5" fill="${INK}">${esc(trunc(sw.name, 14))}</text>`,
      `<text x="${cx}" y="${cy + r + 25}" text-anchor="middle" font-family="Instrument Sans" font-size="8" fill="${MUTED}">${esc(sw.hex)}</text>`,
    ].join("\n");
  });

  const noteY = startY + Math.ceil(effective.length / cols) * rowH + 6;

  return [
    `<rect x="${x}" y="${y}" width="2.5" height="${h}" fill="${NAVY}" opacity="0.38"/>`,
    `<text x="${padX}" y="${y + 18}" font-family="Spectral" font-size="9.5" font-weight="bold" fill="${NAVY}" opacity="0.65">${num}.</text>`,
    `<text x="${padX + 14}" y="${y + 18}" font-family="Spectral" font-size="10" font-weight="bold" fill="${INK}" letter-spacing="1.1">COLOR PALETTE (GUIDE)</text>`,
    `<line x1="${padX}" y1="${y + 27}" x2="${x + w - 12}" y2="${y + 27}" stroke="${RULE}" stroke-width="0.5"/>`,
    ...items,
    noteY < y + h - 8
      ? `<text x="${padX}" y="${noteY}" font-family="Spectral" font-size="9.5" fill="${MUTED}" font-style="italic">Palette must feel cohesive, muted, and authentically aged.</text>`
      : "",
  ].join("\n");
}

// ── References section with placeholder image boxes ───────────────────────────

function referencesSection(
  x: number, y: number, w: number, h: number,
  num: number,
  specName: string | null | undefined,
  styleName: string | null | undefined,
  moduleCount: number,
): string {
  const padX  = x + 15;
  const thumbW = Math.floor((w - 30 - 15) / 4);
  const thumbH = Math.floor((h - 60) * 0.52);
  const thumbY = y + 38;

  const boxes = [0, 1, 2, 3].map(i => {
    const tx = padX + i * (thumbW + 5);
    return [
      `<rect x="${tx}" y="${thumbY}" width="${thumbW}" height="${thumbH}" fill="${LIGHT}" rx="2" stroke="${RULE}" stroke-width="0.5"/>`,
      `<line x1="${tx + 7}" y1="${thumbY + thumbH / 2}" x2="${tx + thumbW - 7}" y2="${thumbY + thumbH / 2}" stroke="${RULE}" stroke-width="0.4"/>`,
      `<line x1="${tx + thumbW / 2}" y1="${thumbY + 7}" x2="${tx + thumbW / 2}" y2="${thumbY + thumbH - 7}" stroke="${RULE}" stroke-width="0.4"/>`,
    ].join("\n");
  });

  const labelsY = thumbY + thumbH + 13;
  const refs = [
    specName   ? `Component Spec: ${trunc(specName, 36)}`   : null,
    styleName  ? `Style Guide: ${trunc(styleName, 38)}`      : null,
    moduleCount > 0 ? `${moduleCount} Prompt Module${moduleCount > 1 ? "s" : ""} linked` : null,
    "See Notion record for linked references.",
  ].filter(Boolean) as string[];

  const refLines = refs.slice(0, 3).map((r, i) =>
    `<text x="${padX}" y="${labelsY + i * 13}" font-family="Spectral" font-size="9" fill="${MUTED}">${esc(r)}</text>`
  ).join("\n");

  return [
    `<rect x="${x}" y="${y}" width="2.5" height="${h}" fill="${NAVY}" opacity="0.38"/>`,
    `<text x="${padX}" y="${y + 18}" font-family="Spectral" font-size="9.5" font-weight="bold" fill="${NAVY}" opacity="0.65">${num}.</text>`,
    `<text x="${padX + 14}" y="${y + 18}" font-family="Spectral" font-size="10" font-weight="bold" fill="${INK}" letter-spacing="1.1">REFERENCES (INSPIRATION)</text>`,
    `<line x1="${padX}" y1="${y + 27}" x2="${x + w - 12}" y2="${y + 27}" stroke="${RULE}" stroke-width="0.5"/>`,
    ...boxes,
    refLines,
  ].join("\n");
}

// ── Approved for Production section ──────────────────────────────────────────

function approvedSection(
  x: number, y: number, w: number, h: number,
): string {
  const padX = x + 15;
  // Circular seal (bottom-right)
  const sealX = x + w - 58;
  const sealY = y + h - 68;
  const sealR = 48;

  return [
    `<rect x="${x}" y="${y}" width="2.5" height="${h}" fill="${CLAY}" opacity="0.5"/>`,
    `<text x="${padX}" y="${y + 18}" font-family="Spectral" font-size="10" font-weight="bold" fill="${INK}" letter-spacing="1.1">APPROVED FOR PRODUCTION</text>`,
    `<line x1="${padX}" y1="${y + 27}" x2="${x + w - 12}" y2="${y + 27}" stroke="${RULE}" stroke-width="0.5"/>`,
    // Signature block 1
    `<line x1="${padX}" y1="${y + 68}" x2="${padX + 140}" y2="${y + 68}" stroke="${RULE}" stroke-width="0.7"/>`,
    `<text x="${padX}" y="${y + 80}" font-family="Instrument Sans" font-size="8.5" fill="${MUTED}">Art Director</text>`,
    `<text x="${padX}" y="${y + 92}" font-family="Instrument Sans" font-size="7.5" fill="${MUTED}">Date: ___________</text>`,
    // Signature block 2
    `<line x1="${padX}" y1="${y + 128}" x2="${padX + 140}" y2="${y + 128}" stroke="${RULE}" stroke-width="0.7"/>`,
    `<text x="${padX}" y="${y + 140}" font-family="Instrument Sans" font-size="8.5" fill="${MUTED}">Creative Director</text>`,
    `<text x="${padX}" y="${y + 152}" font-family="Instrument Sans" font-size="7.5" fill="${MUTED}">Date: ___________</text>`,
    // Seal
    `<circle cx="${sealX}" cy="${sealY}" r="${sealR}" fill="none" stroke="${NAVY}" stroke-width="1.4" opacity="0.4"/>`,
    `<circle cx="${sealX}" cy="${sealY}" r="${sealR - 7}" fill="none" stroke="${NAVY}" stroke-width="0.5" opacity="0.3"/>`,
    `<text x="${sealX}" y="${sealY - 10}" text-anchor="middle" font-family="Spectral" font-size="7.5" font-weight="bold" fill="${NAVY}" opacity="0.55">WORLDSMITH</text>`,
    `<text x="${sealX}" y="${sealY + 2}" text-anchor="middle" font-family="Spectral" font-size="7" font-weight="bold" fill="${NAVY}" opacity="0.45">FOUNDATION</text>`,
    `<text x="${sealX}" y="${sealY + 13}" text-anchor="middle" font-family="Spectral" font-size="6.5" fill="${CLAY}" opacity="0.55">CREATE · PRESERVE</text>`,
    `<text x="${sealX}" y="${sealY + 24}" text-anchor="middle" font-family="Spectral" font-size="6.5" fill="${CLAY}" opacity="0.45">· INSPIRE ·</text>`,
  ].join("\n");
}

// ── MAIN SVG BUILDER ─────────────────────────────────────────────────────────

export function buildSpecBoardSvg(data: SpecBoardData): string {
  const {
    productionItem, specId, world, volume, collection, componentType,
    payloadVersion, currentVersion, status,
    designIntent, narrativePurpose, requiredContent, reviewCriteria,
    assetRole, composition, materials, visualHierarchy,
    textRule, canonRule, printRule, negativeConstraints,
    componentSpecName, componentSpecContent,
    styleGuideName, styleGuideContent,
    promptModuleCount, canonDependency, canonRecordCount,
    canonNames, illustratedNarrative,
    colorSwatches,
  } = data;

  const today = new Date().toISOString().slice(0, 10);

  // ── PAPER BACKGROUND & BORDER ────────────────────────────────────────────

  const background = `
<rect width="${BOARD_W}" height="${BOARD_H}" fill="${PAPER}"/>
<rect x="22" y="22" width="${BOARD_W - 44}" height="${BOARD_H - 44}" fill="none" stroke="${NAVY}" stroke-width="0.5" opacity="0.3"/>
<rect x="22" y="22" width="${BOARD_W - 44}" height="3" fill="${CLAY}" opacity="0.65"/>`;

  // ── HEADER (y=22 to y=222) ────────────────────────────────────────────────

  // Subtitle: "WORLDSMITH VOLUME I — THE CURATOR'S DESK" style
  // Prefer world + collection; fall back to world + volume, then just Foundation.
  const subtitleParts = [world, collection || volume].filter(Boolean);
  const subtitleLine = subtitleParts.length
    ? `WORLDSMITH ${subtitleParts.join(" \u2014 ").toUpperCase()}`
    : "WORLDSMITH FOUNDATION";

  // Document metadata box (top right)
  const dbX = 1258; const dbY = 36; const dbW = 306; const dbH = 158;
  const docMeta = [
    ["DOCUMENT ID",  trunc(specId || specId?.slice(0, 22) || productionItem.slice(0, 18) || "—", 26)],
    ["VERSION",      currentVersion || "1"],
    ["DATE",         today],
    ["OWNER",        "WorldSmith Foundation"],
    ["STATUS",       trunc(status || "Not Started", 22)],
  ];

  const docBox = [
    `<rect x="${dbX}" y="${dbY}" width="${dbW}" height="${dbH}" fill="none" stroke="${NAVY}" stroke-width="0.65" opacity="0.38"/>`,
    `<rect x="${dbX}" y="${dbY}" width="${dbW}" height="17" fill="${NAVY}" opacity="0.06"/>`,
    docMeta.map(([label, value], i) => {
      const ry = dbY + 14 + i * 28;
      return [
        `<text x="${dbX + 10}" y="${ry}" font-family="Instrument Sans" font-size="8" font-weight="bold" fill="${MUTED}" letter-spacing="0.5">${esc(label)}:</text>`,
        `<text x="${dbX + 108}" y="${ry}" font-family="Instrument Sans" font-size="8.5" fill="${INK}">${esc(value)}</text>`,
        `<line x1="${dbX + 10}" y1="${ry + 7}" x2="${dbX + dbW - 10}" y2="${ry + 7}" stroke="${RULE}" stroke-width="0.3" opacity="0.7"/>`,
      ].join("\n");
    }).join("\n"),
  ].join("\n");

  // WorldSmith Foundation block (top left) with geometric fir ornament
  const wsfBlock = [
    // Fir tree ornament (simplified geometric)
    `<rect x="62" y="118" width="5" height="18" fill="${NAVY}" opacity="0.45"/>`,
    `<polygon points="64.5,90 53,115 76,115" fill="${FOREST}" opacity="0.50"/>`,
    `<polygon points="64.5,103 51,121 78,121" fill="${FOREST}" opacity="0.45"/>`,
    `<polygon points="64.5,115 48,130 81,130" fill="${FOREST}" opacity="0.40"/>`,
    // Text
    `<text x="88" y="118" font-family="Spectral" font-size="16" font-weight="bold" fill="${NAVY}">WORLDSMITH</text>`,
    `<text x="88" y="137" font-family="Spectral" font-size="16" font-weight="bold" fill="${NAVY}">FOUNDATION</text>`,
    `<text x="42" y="162" font-family="Instrument Sans" font-size="7.5" fill="${MUTED}" letter-spacing="1.5">VISUAL ASSET PRODUCT SPECIFICATION</text>`,
  ].join("\n");

  // Center title block
  const centerTitle = [
    `<text x="800" y="65" text-anchor="middle" font-family="Instrument Sans" font-size="10.5" fill="${MUTED}" letter-spacing="3.5">${esc(subtitleLine)}</text>`,
    `<line x1="325" y1="74" x2="580" y2="74" stroke="${RULE}" stroke-width="0.5"/>`,
    `<line x1="1020" y1="74" x2="1235" y2="74" stroke="${RULE}" stroke-width="0.5"/>`,
    `<text x="800" y="122" text-anchor="middle" font-family="Spectral" font-size="43" font-weight="bold" fill="${NAVY}" letter-spacing="1.5">PRODUCT SPECIFICATION</text>`,
    `<text x="800" y="157" text-anchor="middle" font-family="Spectral" font-size="18" fill="${INK}">${esc(trunc(productionItem, 58))}</text>`,
    componentType
      ? `<text x="800" y="181" text-anchor="middle" font-family="Instrument Sans" font-size="13" font-weight="bold" fill="${CLAY}" letter-spacing="1.8">${esc(componentType.toUpperCase())}</text>`
      : "",
    // Triple-rule header divider
    `<line x1="42" y1="204" x2="${BOARD_W - 42}" y2="204" stroke="${NAVY}" stroke-width="0.5" opacity="0.3"/>`,
    `<line x1="42" y1="208" x2="${BOARD_W - 42}" y2="208" stroke="${CLAY}" stroke-width="1.8" opacity="0.38"/>`,
    `<line x1="42" y1="214" x2="${BOARD_W - 42}" y2="214" stroke="${NAVY}" stroke-width="0.4" opacity="0.18"/>`,
  ].join("\n");

  const header = [wsfBlock, docBox, centerTitle].join("\n");

  // ── CENTER COLUMN — ILLUSTRATION FRAME ────────────────────────────────────

  const imgX = CONCEPT_IMAGE_AREA.x;
  const imgY = CONCEPT_IMAGE_AREA.y;
  const imgW = CONCEPT_IMAGE_AREA.width;
  const imgH = CONCEPT_IMAGE_AREA.height;

  const specLabelY = imgY + imgH + 10;
  const specLabelH = Math.max(BODY_B - specLabelY - 8, 28);

  const centerCol = [
    // Outer frame
    `<rect x="${C_X + 8}" y="${BODY_Y + 8}" width="${C_W - 16}" height="${BODY_H - 16}" fill="none" stroke="${NAVY}" stroke-width="0.55" opacity="0.22"/>`,
    // Image area background (DALL-E is composited here by sharp)
    `<rect x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" fill="${LIGHT}" stroke="${RULE}" stroke-width="1" stroke-dasharray="8,5" rx="2"/>`,
    // Placeholder text (overwritten once DALL-E image is composited)
    `<text x="${imgX + imgW / 2}" y="${imgY + imgH / 2 - 14}" text-anchor="middle" font-family="Spectral" font-size="22" font-weight="bold" fill="${RULE}">CONCEPT PREVIEW</text>`,
    `<text x="${imgX + imgW / 2}" y="${imgY + imgH / 2 + 12}" text-anchor="middle" font-family="Instrument Sans" font-size="12" fill="${RULE}">FOR HUMAN REVIEW</text>`,
    // Specimen archive label below illustration
    `<rect x="${C_X + 15}" y="${specLabelY}" width="${C_W - 30}" height="${specLabelH}" fill="${CREAM}" stroke="${RULE}" stroke-width="0.5" rx="1" opacity="0.75"/>`,
    world
      ? `<text x="${C_X + C_W / 2}" y="${specLabelY + 16}" text-anchor="middle" font-family="Spectral" font-size="11" font-style="italic" fill="${INK}" opacity="0.65">FLORA OF ${esc(world.toUpperCase())}</text>`
      : "",
    (specId || componentType)
      ? `<text x="${C_X + C_W / 2}" y="${specLabelY + 30}" text-anchor="middle" font-family="Instrument Sans" font-size="9" fill="${MUTED}">Specimen No. ${esc(specId?.slice(0, 12) || componentType || "—")}</text>`
      : "",
  ].join("\n");

  // ── LEFT COLUMN — SECTIONS 1–4 ────────────────────────────────────────────

  // Section 3 is "Illustrated Narrative" — give it more height so the scene
  // description renders in full.  Trim other sections slightly to compensate.
  const s1H = 268;
  const s2H = 228;
  const s3H = 298;
  const s4H = BODY_H - s1H - s2H - s3H; // ~339

  const styleLockContent = styleGuideContent
    ? trunc(styleGuideContent, 560)
    : styleGuideName
      ? `This asset MUST be rendered as specified in the linked Style Guide.\n\nStyle Guide: ${styleGuideName}\n\nSee the linked Style Guide for full illustration medium, historical period, visual treatment, and prohibited style deviations.\n\nIf any element reads as photographic, this asset fails the style requirement.`
      : "No style guide linked. See Production Specification for full style constraints and visual requirements.";

  const assetPurpose = [designIntent, narrativePurpose]
    .filter(Boolean)
    .join("\n\n") || "—";

  // Section 3: Illustrated Narrative — use the compiled scene prompt (front_prompt /
  // world_and_collection_context) so the reviewer can assess visual direction.
  // Fall back to a structured summary when no narrative is available.
  const narrativeContent = illustratedNarrative
    || [
      requiredContent ? `Required content: ${requiredContent}` : "",
      componentType   ? `Component type: ${componentType}`    : "",
      assetRole       ? `Asset role: ${assetRole}`            : "",
    ].filter(Boolean).join("\n")
    || "—";

  const compositionItems = [
    composition     || "Composition not specified.",
    visualHierarchy ? `Visual hierarchy: ${visualHierarchy}` : "",
    componentSpecContent ? trunc(componentSpecContent, 110) : "",
    componentSpecName ? `Component spec: Approved Modular Print Component Standard` : "",
  ].filter(Boolean);

  const leftCol = [
    docSection(L_X, BODY_Y,                   L_W, s1H, 1, "Style Lock",                          true,  styleLockContent,  FOREST),
    docSection(L_X, BODY_Y + s1H,             L_W, s2H, 2, "Asset Purpose",                       false, assetPurpose,      NAVY),
    docSection(L_X, BODY_Y + s1H + s2H,       L_W, s3H, 3, "Illustrated Narrative (Scene Summary)", false, narrativeContent, NAVY),
    bulletSection(L_X, BODY_Y + s1H + s2H + s3H, L_W, s4H, 4, "Composition & Layout",            false, compositionItems,  "#4A3B6E"),
  ].join("\n");

  // ── RIGHT COLUMN — SECTIONS 5–6 ──────────────────────────────────────────

  const s5H = 628;
  const s6H = BODY_H - s5H; // 505

  const rightCol = [
    illustrationCharSection(R_X, BODY_Y,       R_W, s5H, 5),
    colorPaletteSection(    R_X, BODY_Y + s5H, R_W, s6H, 6, colorSwatches ?? []),
  ].join("\n");

  // ── BOTTOM ROW 1 — SECTIONS 7–10 ─────────────────────────────────────────

  const bTotal = BOARD_W - L_X * 2;           // 1516
  const bGap   = 12;
  const bCount = 4;
  const bw     = Math.floor((bTotal - bGap * (bCount - 1)) / bCount); // 374
  const bxArr  = [0, 1, 2, 3].map(i => L_X + i * (bw + bGap));

  const prohibContent = [
    "This asset MUST NOT include:",
    negativeConstraints || "Photorealism, glossy reflections, DSLR appearance, digital art, 3D rendering.",
    textRule ? `Text rule: ${textRule}` : "",
    "\nIf the asset feels like a photograph rather than an illustration, it fails the style requirement.",
  ].filter(Boolean).join("\n");

  const techContent = [
    printRule ? printRule : "",
    `Format: 8.5 × 11 inches (US Letter)`,
    `Dimensions: 2550 × 3300 pixels`,
    `Resolution: 300 DPI`,
    `Color Mode: RGB`,
    `File Format: PNG`,
    `Print Ready: Yes`,
    payloadVersion ? `Payload version: ${payloadVersion}` : "",
  ].filter(Boolean).join("\n");

  const usabilityContent = [
    "Maintain a large, clean specimen area for clarity and preservation.",
    "Keep text and labels unobtrusive and legible.",
    "Ensure balance for layering with ephemera, notes, and stamps.",
    reviewCriteria ? trunc(reviewCriteria, 150) : "",
  ].filter(Boolean).join("\n");

  const qaRaw = (reviewCriteria || "")
    .split(/[;\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map(s => `\u2610 ${s}`);
  const qaContent = qaRaw.length
    ? qaRaw.join("\n")
    : `\u2610 Fields remain generic and writable\n\u2610 No modern weather icons\n\u2610 Botanical sketch believable\n\u2610 No unapproved dates or species\n\u2610 Water marks controlled\n\u2610 Text legible after home printing.`;

  const row1 = [
    docSection(bxArr[0], ROW1_Y, bw, ROW1_H, 7,  "Photorealism Prohibition", true,  prohibContent,   "#7A2E2E"),
    docSection(bxArr[1], ROW1_Y, bw, ROW1_H, 8,  "Technical Requirements",   false, techContent,     "#2E4A5A"),
    docSection(bxArr[2], ROW1_Y, bw, ROW1_H, 9,  "Negative Space & Usability", false, usabilityContent, FOREST),
    docSection(bxArr[3], ROW1_Y, bw, ROW1_H, 10, `QA Review Criteria (WS-${trunc(specId?.slice(-4) || "006", 5)})`, false, qaContent, "#3D4A3E"),
  ].join("\n");

  // ── BOTTOM ROW 2 — SECTIONS 11–14 ────────────────────────────────────────

  const seriesContent = [
    componentSpecName
      ? `${componentSpecName} establishes the typographic language, illustrated quality benchmark, and visual standard for this series.`
      : "",
    "Consistency with this visual language is REQUIRED across all future assets.",
    "Drift toward realism is a production defect because it weakens the integrity of the series.",
  ].filter(Boolean).join("\n");

  // Canon lock: show actual record names when available; fall back to count
  const canonNameItems: string[] = canonNames && canonNames.length > 0
    ? canonNames
    : canonRecordCount > 0
      ? [`${canonRecordCount} Canon Record${canonRecordCount > 1 ? "s" : ""} linked`]
      : ["No canon records linked."];

  const canonHeader = canonDependency && canonDependency !== "None"
    ? `Canon Dependency: ${canonDependency}\n`
    : "";
  const canonFooter = canonRule
    || "Do not invent canon names, characters, or locations not approved in linked Canon Records.";
  const canonContent = [
    canonHeader.trim(),
    canonNameItems.join("\n"),
    canonFooter,
  ].filter(Boolean).join("\n\n");

  const row2 = [
    docSection(        bxArr[0], ROW2_Y, bw, ROW2_H, 11, "Series Benchmark",      false, seriesContent,   "#4A3B6E"),
    referencesSection( bxArr[1], ROW2_Y, bw, ROW2_H, 12, componentSpecName, styleGuideName, promptModuleCount),
    docSection(        bxArr[2], ROW2_Y, bw, ROW2_H, 13, "Canon Lock",            true,  canonContent,    "#6B2929"),
    approvedSection(   bxArr[3], ROW2_Y, bw, ROW2_H),
  ].join("\n");

  // ── FOOTER ───────────────────────────────────────────────────────────────

  const footer = [
    `<line x1="42" y1="${FOOTER_Y}" x2="${BOARD_W - 42}" y2="${FOOTER_Y}" stroke="${RULE}" stroke-width="0.5"/>`,
    `<line x1="42" y1="${FOOTER_Y + 4}" x2="${BOARD_W - 42}" y2="${FOOTER_Y + 4}" stroke="${CLAY}" stroke-width="1.6" opacity="0.4"/>`,
    `<line x1="42" y1="${FOOTER_Y + 8}" x2="${BOARD_W - 42}" y2="${FOOTER_Y + 8}" stroke="${RULE}" stroke-width="0.3" opacity="0.5"/>`,
    `<text x="${BOARD_W / 2}" y="${FOOTER_Y + 36}" text-anchor="middle" font-family="Spectral" font-size="14" font-style="italic" fill="${NAVY}" letter-spacing="0.5" opacity="0.72">GUARDIAN OF STORY. KEEPER OF DETAIL. PRESERVER OF BEAUTY.</text>`,
    `<text x="${BOARD_W / 2}" y="${FOOTER_Y + 58}" text-anchor="middle" font-family="Instrument Sans" font-size="10" fill="${MUTED}">WorldSmith Foundation  \u00b7  Template v2  \u00b7  Generated ${today}</text>`,
    `<line x1="42" y1="${BOARD_H - 26}" x2="${BOARD_W - 42}" y2="${BOARD_H - 26}" stroke="${RULE}" stroke-width="0.4" opacity="0.45"/>`,
  ].join("\n");

  // ── ASSEMBLE ─────────────────────────────────────────────────────────────

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOARD_W} ${BOARD_H}" width="${BOARD_W}" height="${BOARD_H}">`,
    background,
    header,
    centerCol,
    leftCol,
    rightCol,
    row1,
    row2,
    footer,
    `</svg>`,
  ].join("\n");
}

// ── PNG renderer ──────────────────────────────────────────────────────────────

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
      defaultFontFamily: "Spectral",
    },
    fitTo: { mode: "width" as const, value: BOARD_W },
  });

  const rendered = resvg.render();
  return Buffer.from(rendered.asPng());
}
