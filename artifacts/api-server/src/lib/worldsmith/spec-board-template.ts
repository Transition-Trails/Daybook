/**
 * WorldSmith Product Specification Board — SVG template generator (v3.0)
 *
 * "Visual Specification Sheet" layout (WS-PRODUCT-SPEC-V3):
 *   - Concept image is the dominant visual anchor (upper-right, ~63% width × ~51% height)
 *   - Clean narrative + composition sections on the left
 *   - 4-column mid band: elements checklist, materials, negative space, constraints
 *   - Technical strip: specs + color palette + auto-crop detail references
 *   - Companion / emotional intent / artist notes row
 *   - Footer: "INTERNAL PRODUCTION SPECIFICATION — FINAL ARTWORK GENERATED SEPARATELY"
 *
 * Board: 2400 × 2500 px
 * The DALL-E concept image is composited at CONCEPT_IMAGE_AREA by spec-preview-service.ts.
 * Detail crop thumbnails are composited into DETAIL_CROP_DEST_AREAS from the DALL-E image.
 */

import path from "path";
import { fileURLToPath } from "url";
import type { SpecBoardData } from "./types";

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts");

// ── Canvas constants ─────────────────────────────────────────────────────────

export const BOARD_W = 2400;
export const BOARD_H = 2500;

const MARGIN = 36;

// Top section: title panel (left) + concept image (right)
const TOP_Y  = 56;   // below header bar
const TOP_H  = 1268; // height of both title panel and concept image

// Left title+text panel
const LFT_X  = MARGIN;
const LFT_W  = 808;

// Concept image panel
const IMG_X  = LFT_X + LFT_W + 16;   // 860
const IMG_W  = BOARD_W - IMG_X - MARGIN; // 1504
const IMG_Y  = TOP_Y;
const IMG_H  = TOP_H;

/** Pixel rectangle where the DALL-E concept image is composited by sharp. */
export const CONCEPT_IMAGE_AREA = {
  x: IMG_X,
  y: IMG_Y,
  width:  IMG_W,
  height: IMG_H,
} as const;

// Mid 4-column section
const MID_Y  = TOP_Y + TOP_H + 12;  // 1336
const MID_H  = 474;

// Bottom technical strip
const BTM_Y  = MID_Y + MID_H + 12; // 1822
const BTM_H  = 312;

// Companion / emotional / artist row
const CMP_Y  = BTM_Y + BTM_H + 12; // 2146
const CMP_H  = 264;

// Footer
const FTR_Y  = CMP_Y + CMP_H + 10; // 2420

// ── Detail crop source rectangles (within CONCEPT_IMAGE_AREA, board coords) ──

/**
 * Four source rectangles within the concept image area.
 * spec-preview-service.ts crops these from the board after DALL-E compositing
 * and scales them into DETAIL_CROP_DEST_AREAS.
 */
export const DETAIL_CROP_SOURCE_RECTS: ReadonlyArray<{ x: number; y: number; width: number; height: number }> = (() => {
  const cw = IMG_W;
  const ch = IMG_H;
  const cropW = Math.floor(cw * 0.38);  // ~571
  const cropH = Math.floor(ch * 0.36);  // ~456
  return [
    // top-left — primary focal area
    { x: IMG_X + 32,           y: IMG_Y + 28,           width: cropW, height: cropH },
    // top-right — secondary element
    { x: IMG_X + cw - cropW - 32, y: IMG_Y + 28,        width: cropW, height: cropH },
    // bottom-left — material / texture detail
    { x: IMG_X + 32,           y: IMG_Y + ch - cropH - 28, width: cropW, height: cropH },
    // bottom-right — supporting / archival detail
    { x: IMG_X + cw - cropW - 32, y: IMG_Y + ch - cropH - 28, width: cropW, height: cropH },
  ];
})();

/**
 * Four destination rectangles in the bottom strip where crops are composited.
 * Sits within the detail-references portion of the BTM section.
 */
export const DETAIL_CROP_DEST_AREAS: ReadonlyArray<{ x: number; y: number; width: number; height: number }> = (() => {
  // The detail section occupies the right ~1100px of the BTM strip
  const secX   = BOARD_W - MARGIN - 1100; // 1264
  const thumbW = Math.floor((1100 - 3 * 10) / 4);  // 267
  const thumbH = Math.floor(BTM_H * 0.52);           // 162
  const thumbY = BTM_Y + 46;
  return [0, 1, 2, 3].map(i => ({
    x: secX + i * (thumbW + 10),
    y: thumbY,
    width:  thumbW,
    height: thumbH,
  }));
})();

// ── Brand palette ─────────────────────────────────────────────────────────────

const PAPER  = "#F5F0E8";
const NAVY   = "#1B2A4A";
const CLAY   = "#C87560";
const INK    = "#1A1917";
const MUTED  = "#7A756E";
const RULE   = "#C4BEB4";
const FOREST = "#3D5A48";
const LIGHT  = "#E8E3D8";
const CREAM  = "#F0EADE";

const DEFAULT_SWATCHES: Array<{ name: string; hex: string }> = [
  { name: "Antique Ivory",    hex: "#F3E9D7" },
  { name: "Parchment Cream",  hex: "#EDE5C6" },
  { name: "Sage Gray",        hex: "#9AA090" },
  { name: "Walnut Brown",     hex: "#5A442E" },
  { name: "Aged Oak",         hex: "#6B4F3A" },
  { name: "Charcoal",         hex: "#2E2E2E" },
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

function wrapText(raw: string | undefined | null, maxChars: number, maxLines: number): string[] {
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
  if (lines.length === maxLines && text.length > lines.join(" ").length + 5) {
    lines[maxLines - 1] = (lines[maxLines - 1] ?? "").replace(/\s*\S+$/, "\u2026");
  }
  return lines.length ? lines : ["—"];
}

function tspans(lines: string[], anchorX: number, lineH = 18): string {
  return lines
    .map((ln, i) => `<tspan x="${anchorX}" dy="${i === 0 ? 0 : lineH}">${esc(ln)}</tspan>`)
    .join("");
}

/** Small leaf SVG symbol centered at cx,cy. */
function leafIcon(cx: number, cy: number, sz = 11): string {
  const h = sz * 1.6;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${sz * 0.5}" ry="${h * 0.5}" fill="${FOREST}" opacity="0.55" transform="rotate(-35,${cx},${cy})"/>
<line x1="${cx}" y1="${cy + h * 0.4}" x2="${cx}" y2="${cy - h * 0.4}" stroke="${FOREST}" stroke-width="0.8" opacity="0.4"/>`;
}

/** Numbered circle for composition hierarchy. */
function numCircle(cx: number, cy: number, n: number, r = 13): string {
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${NAVY}" opacity="0.08"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${NAVY}" stroke-width="0.9" opacity="0.3"/>`,
    `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-family="Spectral" font-size="13" font-weight="bold" fill="${NAVY}" opacity="0.7">${n}</text>`,
  ].join("\n");
}

/** Thin labelled section header with optional icon. */
function sectionHead(x: number, y: number, w: number, label: string, accent = NAVY, icon?: () => string): string {
  const iconW = icon ? 22 : 0;
  return [
    icon ? icon() : "",
    `<text x="${x + iconW}" y="${y}" font-family="Instrument Sans" font-size="11.5" font-weight="bold" fill="${accent}" letter-spacing="1.8" opacity="0.75">${esc(label.toUpperCase())}</text>`,
    `<line x1="${x}" y1="${y + 6}" x2="${x + w}" y2="${y + 6}" stroke="${accent}" stroke-width="0.5" opacity="0.25"/>`,
  ].join("\n");
}

// ── Ornamental header elements ───────────────────────────────────────────────

function ornamentalRule(cx: number, y: number, totalW: number): string {
  const halfW = totalW / 2;
  return [
    `<line x1="${cx - halfW}" y1="${y}" x2="${cx - 28}" y2="${y}" stroke="${RULE}" stroke-width="0.6" opacity="0.7"/>`,
    `<circle cx="${cx}" cy="${y}" r="3.5" fill="none" stroke="${CLAY}" stroke-width="0.8" opacity="0.5"/>`,
    `<circle cx="${cx}" cy="${y}" r="1.2" fill="${CLAY}" opacity="0.4"/>`,
    `<line x1="${cx + 28}" y1="${y}" x2="${cx + halfW}" y2="${y}" stroke="${RULE}" stroke-width="0.6" opacity="0.7"/>`,
  ].join("\n");
}

// ── HEADER BAR (y=0..56) ─────────────────────────────────────────────────────

function headerBar(world: string, collection: string | undefined, volume: string | undefined): string {
  const parts = [world, collection || volume].filter(Boolean);
  const archiveLine = parts.length
    ? `WORLDSMITH LIVING ARCHIVE  ·  ${parts.join(" \u2014 ").toUpperCase()}`
    : "WORLDSMITH LIVING ARCHIVE  ·  THE CURATOR'S DESK";

  const midX = BOARD_W / 2;
  return [
    `<rect width="${BOARD_W}" height="56" fill="${NAVY}" opacity="0.04"/>`,
    `<rect width="${BOARD_W}" height="3" fill="${CLAY}" opacity="0.55"/>`,
    ornamentalRule(midX, 31, 640),
    `<text x="${midX}" y="${28}" text-anchor="middle" font-family="Instrument Sans" font-size="11" fill="${MUTED}" letter-spacing="3.5">${esc(archiveLine)}</text>`,
    `<line x1="${MARGIN}" y1="55" x2="${BOARD_W - MARGIN}" y2="55" stroke="${RULE}" stroke-width="0.4" opacity="0.6"/>`,
  ].join("\n");
}

// ── LEFT PANEL ── Title block + Narrative Role + Composition ─────────────────

function leftPanel(data: SpecBoardData): string {
  const { productionItem, componentType, world, narrativePurpose, designIntent,
          illustratedNarrative, composition, visualHierarchy,
          materials, negativeConstraints, focalHierarchy } = data;

  const x = LFT_X;
  const w = LFT_W;

  // ── Title block (top, ~295px) ───────────────────────────────────────────
  const titleBlockH = 295;

  // Parse title into two lines if it contains ":"
  const colonIdx = productionItem.indexOf(":");
  let titleLine1 = productionItem;
  let titleLine2 = "";
  if (colonIdx !== -1 && colonIdx < productionItem.length - 1) {
    titleLine1 = productionItem.slice(0, colonIdx + 1).trim();
    titleLine2 = productionItem.slice(colonIdx + 1).trim();
  }
  // Leaf icon at top-left of panel
  const leafX = x + 14; const leafY = IMG_Y + 28;

  const titleBlock = [
    // Leaf ornament
    leafIcon(leafX + 6, leafY, 12),
    // Series / component badge
    componentType
      ? `<text x="${x + 36}" y="${IMG_Y + 32}" font-family="Instrument Sans" font-size="11" font-weight="bold" fill="${CLAY}" letter-spacing="2.5">${esc(componentType.toUpperCase())}</text>`
      : "",
    `<line x1="${x + 36}" y1="${IMG_Y + 40}" x2="${x + w - 8}" y2="${IMG_Y + 40}" stroke="${CLAY}" stroke-width="0.6" opacity="0.35"/>`,
    // Title line 1 (e.g. "HERO PAPER 004:")
    `<text x="${x + 14}" y="${IMG_Y + 78}" font-family="Instrument Sans" font-size="28" font-weight="bold" fill="${NAVY}">${esc(trunc(titleLine1, 26))}</text>`,
    // Title line 2 (e.g. "THE LIBRARY TABLE")
    titleLine2
      ? `<text x="${x + 14}" y="${IMG_Y + 120}" font-family="Spectral" font-size="36" font-weight="bold" fill="${NAVY}">${esc(trunc(titleLine2, 20))}</text>`
      : `<text x="${x + 14}" y="${IMG_Y + 120}" font-family="Spectral" font-size="30" font-weight="bold" fill="${NAVY}">${esc(trunc(titleLine1, 22))}</text>`,
    // Sub-label
    `<text x="${x + 14}" y="${IMG_Y + 155}" font-family="Instrument Sans" font-size="11.5" fill="${MUTED}" letter-spacing="2.2">VISUAL SPECIFICATION SHEET</text>`,
    // Decorative rule below title
    `<line x1="${x + 14}" y1="${IMG_Y + 170}" x2="${x + w - 14}" y2="${IMG_Y + 170}" stroke="${RULE}" stroke-width="0.5" opacity="0.8"/>`,
    `<line x1="${x + 14}" y1="${IMG_Y + 174}" x2="${x + w - 14}" y2="${IMG_Y + 174}" stroke="${CLAY}" stroke-width="1.2" opacity="0.22"/>`,
    `<line x1="${x + 14}" y1="${IMG_Y + 178}" x2="${x + w - 14}" y2="${IMG_Y + 178}" stroke="${RULE}" stroke-width="0.3" opacity="0.5"/>`,
    // World attribution
    world
      ? `<text x="${x + 14}" y="${IMG_Y + 204}" font-family="Spectral" font-size="13.5" font-style="italic" fill="${MUTED}">World: ${esc(world)}</text>`
      : "",
    // Component type footnote
    `<text x="${x + 14}" y="${IMG_Y + 232}" font-family="Instrument Sans" font-size="10.5" fill="${MUTED}" letter-spacing="0.5" opacity="0.7">INTERNAL PRODUCTION SPECIFICATION · ${new Date().toISOString().slice(0, 10)}</text>`,
  ].join("\n");

  // ── Narrative Role section (~312px tall) ──────────────────────────────────
  const narY = IMG_Y + titleBlockH;
  const narH = 312;
  const narText = illustratedNarrative || narrativePurpose || designIntent || "—";
  const narLines = wrapText(narText, Math.floor((w - 30) / 7.2), 11);

  const narrativeSection = [
    `<rect x="${x}" y="${narY}" width="2.5" height="${narH}" fill="${FOREST}" opacity="0.45"/>`,
    leafIcon(x + 22, narY + 20, 10),
    sectionHead(x + 36, narY + 22, w - 50, "Narrative Role", FOREST),
    `<text x="${x + 18}" y="${narY + 50}" font-family="Spectral" font-size="13.5" fill="${INK}" opacity="0.88">`,
    tspans(narLines, x + 18, 19),
    `</text>`,
  ].join("\n");

  // ── Composition & Focal Hierarchy section (fills remaining left panel) ─────
  const compY = narY + narH;
  const compH = IMG_H - titleBlockH - narH;
  const charsW = Math.floor((w - 48) / 7.2);

  // Derive focal items from data
  const rawFocal = focalHierarchy ?? [];
  const focalItems: Array<{ label: string; text: string }> = [
    {
      label: "Primary Focal Point",
      text:  rawFocal[0] || composition || "Not specified.",
    },
    {
      label: "Secondary Cluster",
      text:  rawFocal[1] || visualHierarchy || narrativePurpose || "—",
    },
    {
      label: "Supporting Field",
      text:  rawFocal[2] || materials || "—",
    },
    {
      label: "Negative Space",
      text:  rawFocal[3] || negativeConstraints || "Preserve open paper areas.",
    },
  ];

  const itemH = Math.floor((compH - 48) / focalItems.length);
  const focalSvg = focalItems.map((fi, i) => {
    const fy    = compY + 46 + i * itemH;
    const cxPos = x + 18 + 13; // circle center
    const txStart = x + 18 + 36;
    const labelLines = wrapText(`${fi.text}`, charsW - 4, 3);
    return [
      numCircle(cxPos, fy + 6, i + 1),
      `<text x="${txStart}" y="${fy + 2}" font-family="Instrument Sans" font-size="11" font-weight="bold" fill="${NAVY}" opacity="0.8">${esc(fi.label.toUpperCase())}</text>`,
      `<text x="${txStart}" y="${fy + 19}" font-family="Spectral" font-size="13" fill="${INK}" opacity="0.83">`,
      tspans(labelLines, txStart, 17),
      `</text>`,
    ].join("\n");
  }).join("\n");

  // Grid icon (4 squares) at heading
  const compIconX = x + 22; const compIconY = compY + 14;
  const compIcon = [
    `<rect x="${compIconX - 8}" y="${compIconY - 8}" width="7" height="7" fill="${NAVY}" opacity="0.2" rx="1"/>`,
    `<rect x="${compIconX + 1}" y="${compIconY - 8}" width="7" height="7" fill="${NAVY}" opacity="0.2" rx="1"/>`,
    `<rect x="${compIconX - 8}" y="${compIconY + 1}" width="7" height="7" fill="${NAVY}" opacity="0.2" rx="1"/>`,
    `<rect x="${compIconX + 1}" y="${compIconY + 1}" width="7" height="7" fill="${NAVY}" opacity="0.2" rx="1"/>`,
  ].join("\n");

  const compositionSection = [
    `<rect x="${x}" y="${compY}" width="2.5" height="${compH}" fill="${NAVY}" opacity="0.38"/>`,
    compIcon,
    sectionHead(x + 36, compY + 18, w - 50, "Composition & Focal Hierarchy", NAVY),
    focalSvg,
  ].join("\n");

  return [titleBlock, narrativeSection, compositionSection].join("\n");
}

// ── CONCEPT IMAGE FRAME (right panel) ────────────────────────────────────────

function conceptImageFrame(specId: string | undefined, world: string): string {
  const { x, y, width: w, height: h } = CONCEPT_IMAGE_AREA;

  return [
    // Outer border
    `<rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" fill="none" stroke="${NAVY}" stroke-width="0.6" opacity="0.18"/>`,
    // Image background
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${LIGHT}" stroke="${RULE}" stroke-width="1.2" stroke-dasharray="10,6" rx="2"/>`,
    // Placeholder text
    `<text x="${x + w / 2}" y="${y + h / 2 - 18}" text-anchor="middle" font-family="Spectral" font-size="28" font-weight="bold" fill="${RULE}">CONCEPT PREVIEW</text>`,
    `<text x="${x + w / 2}" y="${y + h / 2 + 14}" text-anchor="middle" font-family="Instrument Sans" font-size="14.5" fill="${RULE}" letter-spacing="1.5">FOR HUMAN REVIEW</text>`,
    // Bottom caption strip
    `<rect x="${x}" y="${y + h - 38}" width="${w}" height="38" fill="${NAVY}" opacity="0.6" rx="0"/>`,
    world
      ? `<text x="${x + w / 2}" y="${y + h - 20}" text-anchor="middle" font-family="Instrument Sans" font-size="10.5" fill="#FFFFFF" letter-spacing="2">CONCEPT PREVIEW  ·  FOR HUMAN REVIEW</text>`
      : "",
    specId
      ? `<text x="${x + 16}" y="${y + h - 8}" font-family="Instrument Sans" font-size="9" fill="#FFFFFF" opacity="0.7">Specimen No. ${esc(specId.slice(0, 16))}</text>`
      : "",
  ].join("\n");
}

// ── MID SECTION — 4 columns ──────────────────────────────────────────────────

function midSection(data: SpecBoardData): string {
  const { requiredContent, materials, negativeConstraints,
          textRule, printRule, canonRule, componentType, colorSwatches } = data;

  const colW = Math.floor((BOARD_W - 2 * MARGIN - 3 * 12) / 4); // ~567
  const cols  = [0, 1, 2, 3].map(i => MARGIN + i * (colW + 12));

  // ── Col 1: Required Elements Checklist ─────────────────────────────────
  const reqItems = (requiredContent || "")
    .split(/[;\n,]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (reqItems.length < 3) {
    reqItems.push(
      componentType || "Primary illustrated component",
      "Muted, period-appropriate palette",
      "Hand-illustrated medium — no photography",
    );
  }

  const charsC1 = Math.floor((colW - 36) / 6.4);
  let cy1 = MID_Y + 46;
  const col1Items = reqItems.slice(0, 10).map(item => {
    const lines = wrapText(item, charsC1, 2);
    const result = [
      // Checkbox (filled circle for checked)
      `<rect x="${cols[0] + 14}" y="${cy1 - 12}" width="11" height="11" fill="none" stroke="${FOREST}" stroke-width="0.8" opacity="0.6" rx="1"/>`,
      `<line x1="${cols[0] + 15.5}" y1="${cy1 - 8}" x2="${cols[0] + 17.5}" y2="${cy1 - 5.5}" stroke="${FOREST}" stroke-width="1" opacity="0.5"/>`,
      `<line x1="${cols[0] + 17.5}" y1="${cy1 - 5.5}" x2="${cols[0] + 22}" y2="${cy1 - 11}" stroke="${FOREST}" stroke-width="1" opacity="0.5"/>`,
      `<text x="${cols[0] + 32}" y="${cy1}" font-family="Spectral" font-size="12" fill="${INK}" opacity="0.83">${esc(lines[0])}</text>`,
      lines[1] ? `<text x="${cols[0] + 32}" y="${cy1 + 16}" font-family="Spectral" font-size="12" fill="${INK}" opacity="0.83">${esc(lines[1])}</text>` : "",
    ].join("\n");
    cy1 += lines[1] ? 38 : 22;
    return result;
  }).join("\n");

  // ── Col 2: Material & Lighting Notes ───────────────────────────────────
  const matBullets = (materials || "")
    .split(/[;\n•]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 7);
  if (matBullets.length === 0) matBullets.push("Aged paper, cloth, and worn leather surfaces.", "Natural window light or warm ambient library light.", "No harsh contrast or theatrical effects.");

  const charsC2 = Math.floor((colW - 28) / 6.4);
  let cy2 = MID_Y + 46;
  const col2Items = matBullets.map(b => {
    const lines = wrapText(b, charsC2, 3);
    const result = [
      `<circle cx="${cols[1] + 20}" cy="${cy2 - 3}" r="3" fill="${CLAY}" opacity="0.45"/>`,
      `<text x="${cols[1] + 32}" y="${cy2}" font-family="Spectral" font-size="12.5" fill="${INK}" opacity="0.83">`,
      tspans(lines, cols[1] + 32, 17),
      `</text>`,
    ].join("\n");
    cy2 += lines.length * 17 + 8;
    return result;
  }).join("\n");

  // ── Col 3: Negative Space Guidance ─────────────────────────────────────
  const negBullets = (negativeConstraints || "")
    .split(/[;\n•]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  if (negBullets.length === 0) negBullets.push("Preserve open paper areas for layering and writing.", "Avoid filling every inch — allow composition to breathe.", "Keep margins and clear areas for cropping.");

  const charsC3 = Math.floor((colW - 28) / 6.4);
  let cy3 = MID_Y + 46;
  const col3Items = negBullets.map(b => {
    const lines = wrapText(b, charsC3, 3);
    const result = [
      `<circle cx="${cols[2] + 20}" cy="${cy3 - 3}" r="3" fill="${NAVY}" opacity="0.35"/>`,
      `<text x="${cols[2] + 32}" y="${cy3}" font-family="Spectral" font-size="12.5" fill="${INK}" opacity="0.83">`,
      tspans(lines, cols[2] + 32, 17),
      `</text>`,
    ].join("\n");
    cy3 += lines.length * 17 + 8;
    return result;
  }).join("\n");

  // ── Col 4: Design Constraints ───────────────────────────────────────────
  const constraints: string[] = [];
  if (textRule)  constraints.push(textRule);
  if (printRule) constraints.push(printRule);
  if (canonRule) constraints.push(canonRule);
  const stdConstraints = [
    "No modern printed maps",
    "No contemporary typography",
    "No modern devices or supplies",
    "No photorealism or 3D rendering",
    "No cinematic or dramatic lighting",
  ];
  while (constraints.length < 6) constraints.push(stdConstraints[constraints.length] || "");
  const charsC4 = Math.floor((colW - 30) / 6.4);
  let cy4 = MID_Y + 46;
  const col4Items = constraints.filter(Boolean).slice(0, 8).map(c => {
    const lines = wrapText(c, charsC4, 2);
    const result = [
      `<text x="${cols[3] + 14}" y="${cy4}" font-family="Instrument Sans" font-size="13" fill="${CLAY}" opacity="0.75">×</text>`,
      `<text x="${cols[3] + 30}" y="${cy4}" font-family="Spectral" font-size="12" fill="${INK}" opacity="0.83">${esc(lines[0])}</text>`,
      lines[1] ? `<text x="${cols[3] + 30}" y="${cy4 + 16}" font-family="Spectral" font-size="12" fill="${INK}" opacity="0.7">${esc(lines[1])}</text>` : "",
    ].join("\n");
    cy4 += lines[1] ? 38 : 22;
    return result;
  }).join("\n");

  const sectionBodies = [
    // Column backgrounds
    `<rect x="${cols[0]}" y="${MID_Y}" width="${colW}" height="${MID_H}" fill="${PAPER}" stroke="${RULE}" stroke-width="0.4" opacity="0.6" rx="1"/>`,
    `<rect x="${cols[1]}" y="${MID_Y}" width="${colW}" height="${MID_H}" fill="${PAPER}" stroke="${RULE}" stroke-width="0.4" opacity="0.6" rx="1"/>`,
    `<rect x="${cols[2]}" y="${MID_Y}" width="${colW}" height="${MID_H}" fill="${PAPER}" stroke="${RULE}" stroke-width="0.4" opacity="0.6" rx="1"/>`,
    `<rect x="${cols[3]}" y="${MID_Y}" width="${colW}" height="${MID_H}" fill="${PAPER}" stroke="${RULE}" stroke-width="0.4" opacity="0.6" rx="1"/>`,
    // Column headings
    sectionHead(cols[0] + 14, MID_Y + 20, colW - 28, "Required Elements Checklist", FOREST),
    sectionHead(cols[1] + 14, MID_Y + 20, colW - 28, "Material & Lighting Notes",   CLAY),
    sectionHead(cols[2] + 14, MID_Y + 20, colW - 28, "Negative Space Guidance",      NAVY),
    sectionHead(cols[3] + 14, MID_Y + 20, colW - 28, "Design Constraints",           CLAY),
    // Column content
    col1Items, col2Items, col3Items, col4Items,
  ].join("\n");

  return sectionBodies;
}

// ── BOTTOM TECHNICAL STRIP ───────────────────────────────────────────────────

function bottomStrip(data: SpecBoardData): string {
  const { payloadVersion, componentType, currentVersion, reviewCriteria,
          colorSwatches, focalHierarchy } = data;

  // ── Section 1: Technical Specifications ──────────────────────────────
  const techX = MARGIN;
  const techW = 480;
  const techLines: Array<[string, string]> = [
    ["Size",        "12 × 12 in (or 8.5 × 11)"],
    ["Dimensions",  "3600 × 3600 px (or 2550 × 3300)"],
    ["Resolution",  "300 DPI"],
    ["Color",       "sRGB / RGB"],
    ["Format",      "PNG master"],
    ["Focal Safety","0.25 in"],
    ["PDF Deriv.",  "Printable PDF required"],
    ["Payload ver.",payloadVersion || "PP-2.0"],
  ];
  const techSvg = techLines.map(([label, value], i) => {
    const ry = BTM_Y + 46 + i * 32;
    return [
      `<text x="${techX + 14}" y="${ry}" font-family="Instrument Sans" font-size="10.5" font-weight="bold" fill="${MUTED}" letter-spacing="0.4">${esc(label)}:</text>`,
      `<text x="${techX + 160}" y="${ry}" font-family="Spectral" font-size="11.5" fill="${INK}" opacity="0.8">${esc(value)}</text>`,
      `<line x1="${techX + 14}" y1="${ry + 8}" x2="${techX + techW - 14}" y2="${ry + 8}" stroke="${RULE}" stroke-width="0.3" opacity="0.5"/>`,
    ].join("\n");
  }).join("\n");

  // ── Section 2: Color Palette ────────────────────────────────────────────
  const palX = techX + techW + 12;
  const palW = 656;
  const effective = ((colorSwatches?.length ?? 0) > 0 ? colorSwatches! : DEFAULT_SWATCHES).slice(0, 6);
  const swatchSz = 26;
  const swatchGap = 10;
  const swatchesPerRow = 3;
  const swatchColW = Math.floor((palW - 28) / swatchesPerRow);

  const swatchSvg = effective.map((sw, i) => {
    const col = i % swatchesPerRow;
    const row = Math.floor(i / swatchesPerRow);
    const sx  = palX + 14 + col * swatchColW + (swatchColW - swatchSz) / 2;
    const sy  = BTM_Y + 44 + row * (swatchSz + 38);
    return [
      `<rect x="${sx}" y="${sy}" width="${swatchSz}" height="${swatchSz}" fill="${esc(sw.hex)}" rx="3" stroke="${RULE}" stroke-width="0.5"/>`,
      `<text x="${sx + swatchSz / 2}" y="${sy + swatchSz + 13}" text-anchor="middle" font-family="Instrument Sans" font-size="9" fill="${INK}">${esc(trunc(sw.name, 14))}</text>`,
      `<text x="${sx + swatchSz / 2}" y="${sy + swatchSz + 24}" text-anchor="middle" font-family="Instrument Sans" font-size="8.5" fill="${MUTED}">${esc(sw.hex)}</text>`,
    ].join("\n");
  }).join("\n");

  // ── Section 3: Detail & Element References (thumbnail placeholders) ─────
  const detX = palX + palW + 12;
  const detW = BOARD_W - detX - MARGIN;
  const thumbLabels = focalHierarchy ?? [];
  const defaultLabels = ["Primary focal area", "Secondary element", "Material & texture detail", "Supporting / archival detail"];
  const thumbDests = DETAIL_CROP_DEST_AREAS;

  const detailSvg = thumbDests.map((dest, i) => {
    const label = thumbLabels[i] || defaultLabels[i] || `Detail ${i + 1}`;
    const labelY = dest.y + dest.height + 14;
    return [
      // Placeholder box
      `<rect x="${dest.x}" y="${dest.y}" width="${dest.width}" height="${dest.height}" fill="${LIGHT}" stroke="${RULE}" stroke-width="0.8" rx="2" stroke-dasharray="5,4"/>`,
      // Cross hair placeholder (overwritten when crop is composited)
      `<line x1="${dest.x + 8}" y1="${dest.y + dest.height / 2}" x2="${dest.x + dest.width - 8}" y2="${dest.y + dest.height / 2}" stroke="${RULE}" stroke-width="0.6"/>`,
      `<line x1="${dest.x + dest.width / 2}" y1="${dest.y + 8}" x2="${dest.x + dest.width / 2}" y2="${dest.y + dest.height - 8}" stroke="${RULE}" stroke-width="0.6"/>`,
      // Label
      `<text x="${dest.x + dest.width / 2}" y="${labelY}" text-anchor="middle" font-family="Instrument Sans" font-size="9.5" fill="${MUTED}">${esc(trunc(label, 22))}</text>`,
    ].join("\n");
  }).join("\n");

  return [
    // Background rects
    `<rect x="${techX}" y="${BTM_Y}" width="${techW}" height="${BTM_H}" fill="${CREAM}" stroke="${RULE}" stroke-width="0.4" opacity="0.7" rx="1"/>`,
    `<rect x="${palX}" y="${BTM_Y}" width="${palW}" height="${BTM_H}" fill="${CREAM}" stroke="${RULE}" stroke-width="0.4" opacity="0.7" rx="1"/>`,
    `<rect x="${detX}" y="${BTM_Y}" width="${detW}" height="${BTM_H}" fill="${CREAM}" stroke="${RULE}" stroke-width="0.4" opacity="0.7" rx="1"/>`,
    // Headings
    sectionHead(techX + 14, BTM_Y + 20, techW - 28, "Technical Specifications", NAVY),
    sectionHead(palX  + 14, BTM_Y + 20, palW - 28,  "Color Palette (Guide)",   NAVY),
    sectionHead(detX  + 14, BTM_Y + 20, detW - 28,  "Detail & Element References", NAVY),
    techSvg,
    swatchSvg,
    detailSvg,
    // Palette note
    `<text x="${palX + 14}" y="${BTM_Y + BTM_H - 12}" font-family="Spectral" font-size="9.5" fill="${MUTED}" font-style="italic">Palette must feel cohesive, muted, and authentically aged.</text>`,
  ].join("\n");
}

// ── COMPANION / EMOTIONAL / ARTIST ROW ──────────────────────────────────────

function companionRow(data: SpecBoardData): string {
  const { canonNames, specId, componentType, styleGuideName, materials, reviewCriteria } = data;

  const totalW = BOARD_W - 2 * MARGIN;
  const gap = 12;
  const colW = Math.floor((totalW - 2 * gap) / 3);
  const cols = [MARGIN, MARGIN + colW + gap, MARGIN + (colW + gap) * 2];

  // ── Col 1: Relationship to companion assets ─────────────────────────────
  const companions = (canonNames ?? []).slice(0, 5);
  if (companions.length === 0 && componentType) companions.push(`${componentType} Series`);
  const col1Text = companions.length
    ? companions.map((n, i) => `HP00${i + 1}: ${n}`).join("\n")
    : "See Canon Records for companion asset relationships.";
  const col1Lines = wrapText(col1Text, Math.floor((colW - 28) / 6.4), 8);

  // ── Col 2: Emotional Intent ─────────────────────────────────────────────
  const emotionalWords = [
    "Expanding understanding",
    "Intellectual anticipation",
    "Careful comparison",
    "Connected histories",
    "Quiet responsibility",
    "The first glimpse of a larger system",
  ];
  const emoY = CMP_Y + 44;

  // ── Col 3: Notes for Artist ─────────────────────────────────────────────
  const artistNotes = [
    styleGuideName ? `Follow style guide: ${styleGuideName}` : "Maintain historical accuracy in materials, tools, and bindings.",
    "Keep text minimal and suggestive — no legible names, dates, or invented content.",
    reviewCriteria ? trunc(reviewCriteria, 90) : "Scene should feel active, not staged — research in progress.",
  ];
  const artistLines = artistNotes.map(n => wrapText(n, Math.floor((colW - 28) / 6.4), 3));

  let col3Y = CMP_Y + 44;
  const col3Svg = artistLines.map(lines => {
    const result = `<text x="${cols[2] + 14}" y="${col3Y}" font-family="Spectral" font-size="12.5" fill="${INK}" opacity="0.83">` +
      tspans(lines, cols[2] + 14, 17) + `</text>`;
    col3Y += lines.length * 17 + 10;
    return result;
  }).join("\n");

  return [
    // Backgrounds
    `<rect x="${cols[0]}" y="${CMP_Y}" width="${colW}" height="${CMP_H}" fill="${PAPER}" stroke="${RULE}" stroke-width="0.35" opacity="0.6" rx="1"/>`,
    `<rect x="${cols[1]}" y="${CMP_Y}" width="${colW}" height="${CMP_H}" fill="${PAPER}" stroke="${RULE}" stroke-width="0.35" opacity="0.6" rx="1"/>`,
    `<rect x="${cols[2]}" y="${CMP_Y}" width="${colW}" height="${CMP_H}" fill="${PAPER}" stroke="${RULE}" stroke-width="0.35" opacity="0.6" rx="1"/>`,
    // Headings
    sectionHead(cols[0] + 14, CMP_Y + 18, colW - 28, "Relationship to Companion Assets", NAVY),
    sectionHead(cols[1] + 14, CMP_Y + 18, colW - 28, "Emotional Intent",                 NAVY),
    sectionHead(cols[2] + 14, CMP_Y + 18, colW - 28, "Notes for Artist",                 NAVY),
    // Col 1 content
    `<text x="${cols[0] + 14}" y="${CMP_Y + 44}" font-family="Spectral" font-size="12.5" fill="${INK}" opacity="0.83">`,
    tspans(col1Lines, cols[0] + 14, 17),
    `</text>`,
    // Col 2 content — emotional descriptors as phrase list
    ...emotionalWords.map((w, i) => [
      `<text x="${cols[1] + 24}" y="${emoY + i * 28}" font-family="Spectral" font-size="13" fill="${INK}" opacity="0.78" font-style="italic">${esc(w)}</text>`,
      i < emotionalWords.length - 1
        ? `<line x1="${cols[1] + 24}" y1="${emoY + i * 28 + 8}" x2="${cols[1] + colW - 20}" y2="${emoY + i * 28 + 8}" stroke="${RULE}" stroke-width="0.3" opacity="0.5"/>`
        : "",
    ].join("\n")),
    // Col 3 content
    col3Svg,
  ].join("\n");
}

// ── FOOTER ───────────────────────────────────────────────────────────────────

function footer(data: SpecBoardData): string {
  const { specId, currentVersion } = data;
  const today = new Date().toISOString().slice(0, 10);
  const midX  = BOARD_W / 2;

  // Seal circle
  const sealX = BOARD_W - MARGIN - 52;
  const sealY = FTR_Y + 26;

  return [
    `<line x1="${MARGIN}" y1="${FTR_Y}" x2="${BOARD_W - MARGIN}" y2="${FTR_Y}" stroke="${RULE}" stroke-width="0.5" opacity="0.5"/>`,
    `<line x1="${MARGIN}" y1="${FTR_Y + 3}" x2="${BOARD_W - MARGIN}" y2="${FTR_Y + 3}" stroke="${CLAY}" stroke-width="1.5" opacity="0.2"/>`,
    `<text x="${midX}" y="${FTR_Y + 24}" text-anchor="middle" font-family="Instrument Sans" font-size="12" fill="${MUTED}" letter-spacing="2">INTERNAL PRODUCTION SPECIFICATION  ·  FINAL ARTWORK GENERATED SEPARATELY</text>`,
    `<text x="${MARGIN}" y="${FTR_Y + 42}" font-family="Instrument Sans" font-size="9" fill="${MUTED}">WorldSmith Foundation  ·  Template v3  ·  Generated ${today}</text>`,
    specId ? `<text x="${MARGIN + 500}" y="${FTR_Y + 42}" font-family="Instrument Sans" font-size="9" fill="${MUTED}">Asset ID: ${esc(specId.slice(0, 18))}</text>` : "",
    // Seal
    `<circle cx="${sealX}" cy="${sealY}" r="42" fill="none" stroke="${NAVY}" stroke-width="1.4" opacity="0.3"/>`,
    `<circle cx="${sealX}" cy="${sealY}" r="35" fill="none" stroke="${NAVY}" stroke-width="0.5" opacity="0.2"/>`,
    `<text x="${sealX}" y="${sealY - 9}" text-anchor="middle" font-family="Spectral" font-size="7" font-weight="bold" fill="${NAVY}" opacity="0.4">WORLDSMITH</text>`,
    `<text x="${sealX}" y="${sealY + 1}" text-anchor="middle" font-family="Spectral" font-size="6.5" fill="${NAVY}" opacity="0.35">FOUNDATION</text>`,
    `<text x="${sealX}" y="${sealY + 12}" text-anchor="middle" font-family="Spectral" font-size="6" fill="${CLAY}" opacity="0.4">SPEC SHEET</text>`,
    `<text x="${BOARD_W - MARGIN - 102}" y="${FTR_Y + 42}" font-family="Instrument Sans" font-size="9" fill="${MUTED}">NOT FINAL ART</text>`,
  ].join("\n");
}

// ── Embedded font CSS ─────────────────────────────────────────────────────────

function fontCss(): string {
  return `
    @font-face { font-family: 'Spectral'; src: url('${FONT_DIR}/spectral-regular.woff') format('woff'); font-weight: 400; }
    @font-face { font-family: 'Spectral'; src: url('${FONT_DIR}/spectral-bold.woff') format('woff'); font-weight: 700; }
    @font-face { font-family: 'Spectral'; src: url('${FONT_DIR}/spectral-italic.woff') format('woff'); font-weight: 400; font-style: italic; }
    @font-face { font-family: 'Instrument Sans'; src: url('${FONT_DIR}/instrument-sans-regular.woff') format('woff'); font-weight: 400; }
    @font-face { font-family: 'Instrument Sans'; src: url('${FONT_DIR}/instrument-sans-bold.woff') format('woff'); font-weight: 700; }
  `;
}

// ── MAIN BUILDER ──────────────────────────────────────────────────────────────

export function buildSpecBoardSvg(data: SpecBoardData): string {
  const { world, volume, collection, specId } = data;

  const background = [
    `<rect width="${BOARD_W}" height="${BOARD_H}" fill="${PAPER}"/>`,
    // Subtle paper texture vignette
    `<rect width="${BOARD_W}" height="${BOARD_H}" fill="none" stroke="${NAVY}" stroke-width="0.5" opacity="0.12" x="22" y="22" width="${BOARD_W - 44}" height="${BOARD_H - 44}"/>`,
    // Aged-paper corner dots
    `<circle cx="32" cy="32" r="2.5" fill="${RULE}" opacity="0.4"/>`,
    `<circle cx="${BOARD_W - 32}" cy="32" r="2.5" fill="${RULE}" opacity="0.4"/>`,
    `<circle cx="32" cy="${BOARD_H - 32}" r="2.5" fill="${RULE}" opacity="0.4"/>`,
    `<circle cx="${BOARD_W - 32}" cy="${BOARD_H - 32}" r="2.5" fill="${RULE}" opacity="0.4"/>`,
  ].join("\n");

  // Horizontal divider between top section and mid section
  const divider = [
    `<line x1="${MARGIN}" y1="${MID_Y - 6}" x2="${BOARD_W - MARGIN}" y2="${MID_Y - 6}" stroke="${RULE}" stroke-width="0.5" opacity="0.5"/>`,
    `<line x1="${MARGIN}" y1="${MID_Y - 3}" x2="${BOARD_W - MARGIN}" y2="${MID_Y - 3}" stroke="${CLAY}" stroke-width="1" opacity="0.18"/>`,
  ].join("\n");

  const docBox = (() => {
    const dbX = LFT_X + LFT_W - 320; const dbY = IMG_Y + 242;
    const dbW = 316; const dbH = 100;
    const today = new Date().toISOString().slice(0, 10);
    const rows: [string, string][] = [
      ["DOCUMENT ID",  trunc(specId || "—", 22)],
      ["VERSION",      data.currentVersion || "1"],
      ["DATE",         today],
      ["OWNER",        "WorldSmith Foundation"],
    ];
    return [
      `<rect x="${dbX}" y="${dbY}" width="${dbW}" height="${dbH}" fill="${CREAM}" stroke="${RULE}" stroke-width="0.5" opacity="0.75" rx="1"/>`,
      ...rows.map(([label, value], i) => {
        const ry = dbY + 14 + i * 22;
        return [
          `<text x="${dbX + 8}" y="${ry}" font-family="Instrument Sans" font-size="8.5" font-weight="bold" fill="${MUTED}" letter-spacing="0.3">${esc(label)}:</text>`,
          `<text x="${dbX + 112}" y="${ry}" font-family="Instrument Sans" font-size="9" fill="${INK}">${esc(value)}</text>`,
          `<line x1="${dbX + 8}" y1="${ry + 5}" x2="${dbX + dbW - 8}" y2="${ry + 5}" stroke="${RULE}" stroke-width="0.25" opacity="0.6"/>`,
        ].join("\n");
      }),
    ].join("\n");
  })();

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${BOARD_W}" height="${BOARD_H}" viewBox="0 0 ${BOARD_W} ${BOARD_H}">
  <defs><style>${fontCss()}</style></defs>
  ${background}
  ${headerBar(world, collection, volume)}
  ${leftPanel(data)}
  ${docBox}
  ${conceptImageFrame(specId, world)}
  ${divider}
  ${midSection(data)}
  ${bottomStrip(data)}
  ${companionRow(data)}
  ${footer(data)}
</svg>`;

  return svg;
}

// ── PNG renderer ──────────────────────────────────────────────────────────────

export async function renderSpecBoardToPng(data: SpecBoardData): Promise<Buffer> {
  const { Resvg } = await import("@resvg/resvg-js");
  const svg = buildSpecBoardSvg(data);
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: false },
    fitTo: { mode: "width" as const, value: BOARD_W },
  });
  return Buffer.from(resvg.render().asPng());
}
