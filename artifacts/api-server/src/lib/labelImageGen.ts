/**
 * Server-side label image generator for the "Generate a set" feature.
 *
 * Renders transparent PNGs of text labels (dates 1–31, weekdays, months)
 * using @resvg/resvg-js + system DejaVu fonts, then optionally applies
 * border and shadow via the existing imageProcessing pipeline.
 *
 * No external API required — everything runs locally.
 */
import path from "path";
import { applyBorderAndSize, addDropShadow } from "./imageProcessing";

// ── Font map ─────────────────────────────────────────────────────────────────
// Primary set mirrors the Daybook web UI (Instrument Sans + Spectral).
// TTF files are bundled at src/lib/fonts/ (downloaded from Google Fonts CDN).
// DejaVu Mono kept as fallback for "mono" keys.

const BUNDLED_FONT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "fonts");
const DEJAVU_FONT_DIR  = "/usr/share/fonts/truetype/dejavu";

interface FontSpec { file: string; dir: string; family: string; weight: string }

const FONT_MAP: Record<string, FontSpec> = {
  // Instrument Sans (sans-serif, matches app UI default body font)
  "sans":        { dir: BUNDLED_FONT_DIR, file: "InstrumentSans-Regular.ttf", family: "Instrument Sans", weight: "normal" },
  "sans-bold":   { dir: BUNDLED_FONT_DIR, file: "InstrumentSans-Bold.ttf",    family: "Instrument Sans", weight: "bold"   },
  // Spectral (serif display, matches app UI display font)
  "serif":       { dir: BUNDLED_FONT_DIR, file: "Spectral-Regular.ttf",        family: "Spectral",        weight: "normal" },
  "serif-bold":  { dir: BUNDLED_FONT_DIR, file: "Spectral-Bold.ttf",           family: "Spectral",        weight: "bold"   },
  // Space Mono (monospace, matches app UI mono font)
  "mono":        { dir: BUNDLED_FONT_DIR, file: "SpaceMono-Regular.ttf",        family: "Space Mono",       weight: "normal" },
  "mono-bold":   { dir: BUNDLED_FONT_DIR, file: "SpaceMono-Bold.ttf",           family: "Space Mono",       weight: "bold"   },
};

// ── Label generators ─────────────────────────────────────────────────────────

function ordSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export interface LabelItem { label: string; name: string }

export function getSetLabels(setType: string, labelStyle: string): LabelItem[] {
  switch (setType) {
    case "dates": {
      const items: LabelItem[] = [];
      for (let i = 1; i <= 31; i++) {
        let label: string;
        if (labelStyle === "padded")       label = String(i).padStart(2, "0");
        else if (labelStyle === "ordinal") label = `${i}${ordSuffix(i)}`;
        else                               label = String(i);
        items.push({ label, name: `Date coverup ${String(i).padStart(2, "0")}` });
      }
      return items;
    }
    case "weekdays": {
      const full    = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
      const abbr    = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
      const initial = ["M","Tu","W","Th","F","Sa","Su"];
      return full.map((f, i) => ({
        label: labelStyle === "full" ? f : labelStyle === "abbr" ? abbr[i] : initial[i],
        name: `Weekday ${abbr[i]}`,
      }));
    }
    case "months": {
      const full = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const abbr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return full.map((f, i) => ({
        label: labelStyle === "full" ? f : abbr[i],
        name:  `Month ${abbr[i]}`,
      }));
    }
    default:
      return [];
  }
}

// ── Font-size heuristic ───────────────────────────────────────────────────────

export function computeLabelFontSize(label: string): number {
  const len = label.length;
  if (len <= 2)  return 210;
  if (len <= 4)  return 155;
  if (len <= 6)  return 112;
  if (len <= 8)  return 84;
  if (len <= 10) return 66;
  return 52;
}

// ── Single-label PNG renderer ─────────────────────────────────────────────────

export async function renderLabelPng(params: {
  label:        string;
  fontKey:      string;
  color:        string;
  sizeInMm?:    number | null;
  borderStyle?: string;
  /** Legacy 96-DPI pixel value; new callers should send borderWidthMm. */
  borderWidth?: number | null;
  borderWidthMm?: number | null;
  borderColor?: string | null;
  shadowStyle?: string;
}): Promise<string> {
  const { Resvg } = (await import("@resvg/resvg-js")) as typeof import("@resvg/resvg-js");

  const {
    label, fontKey, color,
    sizeInMm, borderStyle = "none", borderWidth, borderWidthMm, borderColor, shadowStyle = "none",
  } = params;

  const spec      = FONT_MAP[fontKey] ?? FONT_MAP["sans-bold"];
  const fontPath  = path.join(spec.dir, spec.file);
  const fontSize  = computeLabelFontSize(label);
  const canvasSize = 400;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasSize} ${canvasSize}">`,
    `  <text`,
    `    x="${canvasSize / 2}" y="${canvasSize / 2}"`,
    `    text-anchor="middle" dominant-baseline="central"`,
    `    font-family="${spec.family}"`,
    `    font-weight="${spec.weight}"`,
    `    font-size="${fontSize}"`,
    `    fill="${color}"`,
    `  >${label}</text>`,
    `</svg>`,
  ].join("\n");

  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: false,
      fontFiles: [fontPath],
    },
    fitTo: { mode: "width" as const, value: canvasSize },
  });

  const rendered  = resvg.render();
  const pngBuffer = rendered.asPng();
  let dataUrl = `data:image/png;base64,${pngBuffer.toString("base64")}`;

  // Apply border / target size
  if (borderStyle !== "none" || sizeInMm) {
    dataUrl = await applyBorderAndSize(
      dataUrl,
      borderStyle,
      borderWidth ?? null,
      borderColor ?? null,
      sizeInMm ?? null,
      borderWidthMm ?? null,
    );
  } else if (sizeInMm) {
    dataUrl = await applyBorderAndSize(dataUrl, "none", null, null, sizeInMm);
  }

  // Apply shadow (baked into the PNG)
  if (shadowStyle && shadowStyle !== "none") {
    dataUrl = await addDropShadow(dataUrl, shadowStyle);
  }

  return dataUrl;
}
