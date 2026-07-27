/**
 * Download all UI-reachable Google Font families that are missing from the
 * bundled font directory so the PDF generator never needs the network.
 *
 * Run from repo root:  node scripts/download-fonts.mjs
 *
 * Naming convention matches _bundledFontPath():
 *   "Work Sans" 400  →  Work_Sans-400.woff
 */
import https from "https";
import http  from "http";
import { promises as fs, existsSync } from "fs";
import path  from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR  = path.join(__dirname, "../artifacts/api-server/src/lib/fonts");
const WEIGHTS    = [400, 700];
// Firefox 26 Linux UA — same header the generator uses, gives TTF URLs on the v1 API.
const UA = "Mozilla/5.0 (X11; Linux x86_64; rv:26.0) Gecko/20100101 Firefox/26.0";

/** Families to ensure are bundled as WOFF (matches UI_REACHABLE_FAMILIES in pdf-generator). */
const FAMILIES = [
  // Theme Studio SUGGESTED_PAIRS — all 12 families across 6 presets
  "Playfair Display",  "Lato",
  "Cormorant Garamond","Source Sans Pro",
  "Spectral",          "Work Sans",
  "Crimson Pro",       "Instrument Sans",
  "DM Serif Display",  "DM Sans",
  "EB Garamond",       "Inter",
  // Fonts catalog seed
  "Lora",
  "Space Grotesk",
  "Nunito Sans",
  // SC variants used by planner generator directly
  "Playfair Display SC",
  "Cormorant SC",
];

function safeName(family, weight) {
  return `${family.replace(/\s+/g, "_")}-${weight}.woff`
    .replace(/[^A-Za-z0-9_.\-]/g, "");
}

function detectFmt(buf) {
  if (buf[0]===0x77&&buf[1]===0x4f&&buf[2]===0x46&&buf[3]===0x46) return "WOFF";
  if (buf[0]===0x00&&buf[1]===0x01&&buf[2]===0x00&&buf[3]===0x00) return "TTF";
  if (buf[0]===0x4f&&buf[1]===0x54&&buf[2]===0x54&&buf[3]===0x4f) return "OTF";
  if (buf[0]===0x77&&buf[1]===0x4f&&buf[2]===0x46&&buf[3]===0x32) return "WOFF2";
  return `??(0x${buf[0].toString(16)}${buf[1].toString(16)})`;
}

/** Follow redirects; return Buffer of response body. */
function fetch(url, headers={}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { headers, timeout: 15_000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetch(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end",  () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("timeout", () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    req.on("error", reject);
  });
}

async function downloadOne(family, weight) {
  const filename = safeName(family, weight);
  const dest = path.join(FONTS_DIR, filename);
  if (existsSync(dest)) {
    const existing = await fs.readFile(dest);
    if (existing.length > 1000) {
      const fmt = detectFmt(existing);
      return { filename, size: existing.length, fmt, skipped: true };
    }
  }

  // Step 1: fetch CSS to get the font binary URL
  const encoded = family.replace(/ /g, "+");
  const cssUrl  = `https://fonts.googleapis.com/css?family=${encoded}:${weight}`;
  const css = (await fetch(cssUrl, { "User-Agent": UA })).toString();

  // Extract first url(...) in src block
  const m = css.match(/src:\s*url\(([^)'"]+)/);
  if (!m) throw new Error(`No src URL found in CSS response.\nCSS snippet: ${css.slice(0, 300)}`);
  const fontUrl = m[1].trim();

  // Step 2: download font binary
  const buf = await fetch(fontUrl);
  if (buf.length < 1000) throw new Error(`Font binary suspiciously small (${buf.length} B)`);

  const fmt = detectFmt(buf);
  await fs.writeFile(dest, buf);
  return { filename, size: buf.length, fmt, skipped: false };
}

// ── Main ───────────────────────────────────────────────────────────────────────
const ok = [], fail = [];

for (const family of FAMILIES) {
  for (const w of WEIGHTS) {
    try {
      const { filename, size, fmt, skipped } = await downloadOne(family, w);
      const tag = skipped ? "(already)" : "downloaded";
      console.log(`  ✓ ${filename.padEnd(36)} ${Math.round(size/1024).toString().padStart(3)}KB  ${fmt}  ${tag}`);
      ok.push(filename);
    } catch (err) {
      console.error(`  ✗ ${family}:${w}  —  ${err.message}`);
      fail.push(`${family}:${w}`);
    }
  }
}

console.log(`\n${ok.length} files OK, ${fail.length} failed.`);
if (fail.length > 0) {
  console.error("FAILED:", fail.join(", "));
  process.exit(1);
}
