/**
 * publish-vgj-kit.ts — Generate texture images for the 24 VGJ backgrounds
 * and promote all 8 themes + 24 backgrounds to status: "live".
 *
 * Run:  pnpm --filter @workspace/scripts run publish-vgj-kit
 *
 * Textures are generated procedurally using sharp:
 *   Variant A — fine linen grain (paper-tone base, hairline crosshatch noise)
 *   Variant B — medium watercolour/wash texture (soft vertical streaks + grain)
 *   Variant C — parchment/aged paper (coarser grain + slight tonal banding)
 *
 * All output is 512×512 PNG stored as base64 data-URLs in backgrounds.assetRef.
 * The PDF generator embeds them directly as full-cover page backgrounds.
 */

import sharp from "sharp";
import { pool } from "@workspace/db";

// ── Kit definitions (must match seed-kit-vgj.ts) ─────────────────────────────

interface KitBg {
  id: string;
  name: string;
  variant: "a" | "b" | "c"; // linen | wash | parchment
}

interface Kit {
  themeId: string;
  /** palette[0]=ink  [1]=paper  [2]=accent  [3]=secondary  [4]=tertiary  [5]=quaternary */
  colors: string[];
  backgrounds: KitBg[];
}

const KITS: Kit[] = [
  {
    themeId: "vgj_01_botanica",
    colors: ["#2A3428", "#F5EFE0", "#8FAF7E", "#C9967A", "#6B8F71", "#D4B896"],
    backgrounds: [
      { id: "vgj_bg_01_a", name: "Botanica: Aged Cream Linen",        variant: "a" },
      { id: "vgj_bg_01_b", name: "Botanica: Sage Watercolour Wash",   variant: "b" },
      { id: "vgj_bg_01_c", name: "Botanica: Dusty Rose Parchment",    variant: "c" },
    ],
  },
  {
    themeId: "vgj_02_fern",
    colors: ["#1B3A2A", "#EEE8D5", "#4A7C59", "#B8A45A", "#2D5C40", "#D4C87A"],
    backgrounds: [
      { id: "vgj_bg_02_a", name: "Fern & Fossil: Forest Floor Paper", variant: "a" },
      { id: "vgj_bg_02_b", name: "Fern & Fossil: Ochre Linen Weave",  variant: "b" },
      { id: "vgj_bg_02_c", name: "Fern & Fossil: Pressed Leaf Texture",variant: "c" },
    ],
  },
  {
    themeId: "vgj_03_midnight",
    colors: ["#1A1035", "#F0EAF5", "#6B4FA0", "#A86FAE", "#3D2A6B", "#E8D4F0"],
    backgrounds: [
      { id: "vgj_bg_03_a", name: "Midnight Orchid: Velvet Indigo",    variant: "a" },
      { id: "vgj_bg_03_b", name: "Midnight Orchid: Plum Damask",      variant: "b" },
      { id: "vgj_bg_03_c", name: "Midnight Orchid: Moonlit Parchment",variant: "c" },
    ],
  },
  {
    themeId: "vgj_04_ivory",
    colors: ["#3D2B1A", "#FAF6EE", "#C4A882", "#8B6545", "#D9C9B0", "#6B4E30"],
    backgrounds: [
      { id: "vgj_bg_04_a", name: "Ivory & Umber: Raw Notebook Paper", variant: "a" },
      { id: "vgj_bg_04_b", name: "Ivory & Umber: Umber Grid Texture", variant: "b" },
      { id: "vgj_bg_04_c", name: "Ivory & Umber: Aged Ivory Field Notes",variant: "c" },
    ],
  },
  {
    themeId: "vgj_05_crimson",
    colors: ["#2A0A0A", "#FFF5F0", "#C0392B", "#9B5E48", "#8B1A1A", "#E8C4B8"],
    backgrounds: [
      { id: "vgj_bg_05_a", name: "Crimson Herbarium: Specimen Paper", variant: "a" },
      { id: "vgj_bg_05_b", name: "Crimson Herbarium: Sepia Annotation",variant: "b" },
      { id: "vgj_bg_05_c", name: "Crimson Herbarium: Foxed Ivory",    variant: "c" },
    ],
  },
  {
    themeId: "vgj_06_cobalt",
    colors: ["#0D2B6E", "#F8F4ED", "#1E4D9B", "#4A7BC4", "#0A2050", "#C8D8F0"],
    backgrounds: [
      { id: "vgj_bg_06_a", name: "Cobalt & Cream: Delft Tile Paper",  variant: "a" },
      { id: "vgj_bg_06_b", name: "Cobalt & Cream: Wedgwood Linen",    variant: "b" },
      { id: "vgj_bg_06_c", name: "Cobalt & Cream: Blueprint Draft",   variant: "c" },
    ],
  },
  {
    themeId: "vgj_07_amber",
    colors: ["#3A1E00", "#FEFBF0", "#C47A20", "#E8A84A", "#8B4A00", "#F5D88A"],
    backgrounds: [
      { id: "vgj_bg_07_a", name: "Amber Conservatory: Warm Glass Texture",variant: "a" },
      { id: "vgj_bg_07_b", name: "Amber Conservatory: Copper Leaf Paper", variant: "b" },
      { id: "vgj_bg_07_c", name: "Amber Conservatory: Apricot Silk Weave",variant: "c" },
    ],
  },
  {
    themeId: "vgj_08_moonrise",
    colors: ["#1C2B28", "#F0F4F0", "#5C7A6A", "#A0B8A8", "#3A5248", "#D4E4DC"],
    backgrounds: [
      { id: "vgj_bg_08_a", name: "Moonrise Moss: Dusk Linen",         variant: "a" },
      { id: "vgj_bg_08_b", name: "Moonrise Moss: Slate Watercolour",  variant: "b" },
      { id: "vgj_bg_08_c", name: "Moonrise Moss: Silver Fern Imprint",variant: "c" },
    ],
  },
];

// ── Colour utilities ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Blend colour toward white by `t` (0=original, 1=white). */
function lighten(rgb: { r: number; g: number; b: number }, t: number) {
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * t),
    g: Math.round(rgb.g + (255 - rgb.g) * t),
    b: Math.round(rgb.b + (255 - rgb.b) * t),
  };
}

/** Simple seeded LCG PRNG so textures are reproducible. */
function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── Texture generators ─────────────────────────────────────────────────────────

const SIZE = 512;

/**
 * Variant A — fine linen grain.
 * Base: paper colour tinted very lightly toward accent.
 * Noise: hairline crosshatch at ~8% opacity.
 */
async function variantA(
  paperHex: string,
  accentHex: string,
  seed: number,
): Promise<Buffer> {
  const paper = hexToRgb(paperHex);
  const accent = hexToRgb(accentHex);
  // Blend paper toward accent at 4% to give a hint of warmth
  const base = {
    r: Math.round(paper.r * 0.96 + accent.r * 0.04),
    g: Math.round(paper.g * 0.96 + accent.g * 0.04),
    b: Math.round(paper.b * 0.96 + accent.b * 0.04),
  };

  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  const rng = makePrng(seed);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 3;
      // Fine linen: subtle noise ±6 per channel
      const noise = (rng() - 0.5) * 12;
      // Horizontal thread emphasis at every 4th row
      const hThread = (y % 4 === 0) ? -3 : 0;
      // Vertical thread emphasis at every 4th column
      const vThread = (x % 4 === 0) ? -3 : 0;
      pixels[idx]     = Math.min(255, Math.max(0, Math.round(base.r + noise + hThread + vThread)));
      pixels[idx + 1] = Math.min(255, Math.max(0, Math.round(base.g + noise + hThread + vThread)));
      pixels[idx + 2] = Math.min(255, Math.max(0, Math.round(base.b + noise + hThread + vThread)));
    }
  }

  return sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png({ compressionLevel: 8 })
    .toBuffer();
}

/**
 * Variant B — watercolour wash / woven texture.
 * Soft vertical streak gradient + medium grain.
 */
async function variantB(
  paperHex: string,
  accentHex: string,
  seed: number,
): Promise<Buffer> {
  const paper = hexToRgb(paperHex);
  const accent = hexToRgb(accentHex);
  // Blend paper toward accent at 7%
  const base = {
    r: Math.round(paper.r * 0.93 + accent.r * 0.07),
    g: Math.round(paper.g * 0.93 + accent.g * 0.07),
    b: Math.round(paper.b * 0.93 + accent.b * 0.07),
  };

  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  const rng = makePrng(seed + 1000);

  // Pre-compute column tonal offsets to simulate warp thread variation
  const colOffset = new Float32Array(SIZE);
  for (let x = 0; x < SIZE; x++) {
    colOffset[x] = Math.sin(x * 0.08) * 4 + (rng() - 0.5) * 6;
  }

  for (let y = 0; y < SIZE; y++) {
    // Row-level watercolour wave
    const rowWave = Math.sin(y * 0.05) * 3;
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 3;
      const noise = (rng() - 0.5) * 16;
      const weave = (y % 6 < 3) ? colOffset[x] : -colOffset[x] * 0.5;
      const total = noise + rowWave + weave;
      pixels[idx]     = Math.min(255, Math.max(0, Math.round(base.r + total)));
      pixels[idx + 1] = Math.min(255, Math.max(0, Math.round(base.g + total)));
      pixels[idx + 2] = Math.min(255, Math.max(0, Math.round(base.b + total)));
    }
  }

  return sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png({ compressionLevel: 8 })
    .toBuffer();
}

/**
 * Variant C — aged parchment / foxed paper.
 * Coarser grain + subtle low-frequency banding (foxing spots softened to blobs).
 */
async function variantC(
  paperHex: string,
  accentHex: string,
  seed: number,
): Promise<Buffer> {
  const paper = hexToRgb(paperHex);
  const accent = hexToRgb(accentHex);
  // Blend paper toward accent at 10%
  const base = {
    r: Math.round(paper.r * 0.90 + accent.r * 0.10),
    g: Math.round(paper.g * 0.90 + accent.g * 0.10),
    b: Math.round(paper.b * 0.90 + accent.b * 0.10),
  };
  // Darken slightly to simulate age
  const aged = lighten(base, -0.04);

  const pixels = Buffer.alloc(SIZE * SIZE * 3);
  const rng = makePrng(seed + 2000);

  // Pre-compute a low-frequency "foxing" field (8×8 grid of blobs)
  const BLOBS = 8;
  interface Blob { cx: number; cy: number; strength: number }
  const blobs: Blob[] = [];
  for (let i = 0; i < BLOBS; i++) {
    blobs.push({ cx: rng() * SIZE, cy: rng() * SIZE, strength: rng() * 10 + 4 });
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 3;
      const noise = (rng() - 0.5) * 20;
      // Foxing contribution — soft radial blobs tinting slightly toward accent
      let fox = 0;
      for (const b of blobs) {
        const dx = x - b.cx, dy = y - b.cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        fox += b.strength * Math.max(0, 1 - dist / 80);
      }
      fox = Math.min(fox, 10);
      pixels[idx]     = Math.min(255, Math.max(0, Math.round(aged.r + noise + fox * 0.8)));
      pixels[idx + 1] = Math.min(255, Math.max(0, Math.round(aged.g + noise + fox * 0.4)));
      pixels[idx + 2] = Math.min(255, Math.max(0, Math.round(aged.b + noise)));
    }
  }

  return sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .png({ compressionLevel: 8 })
    .toBuffer();
}

async function generateTexture(
  variant: "a" | "b" | "c",
  paperHex: string,
  accentHex: string,
  seed: number,
): Promise<string> {
  let buf: Buffer;
  if (variant === "a") buf = await variantA(paperHex, accentHex, seed);
  else if (variant === "b") buf = await variantB(paperHex, accentHex, seed);
  else buf = await variantC(paperHex, accentHex, seed);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nPublishing 8 Victorian Garden Journal kits…`);
  console.log(`  Generating ${KITS.reduce((n, k) => n + k.backgrounds.length, 0)} texture PNGs (512×512)…`);

  let bgUpdated = 0;
  let bgSkipped = 0;

  for (const kit of KITS) {
    // paper = palette[1], accent = palette[2]
    const paperHex = kit.colors[1];
    const accentHex = kit.colors[2];
    const seedBase = parseInt(kit.themeId.replace(/[^0-9]/g, "").padEnd(6, "0").slice(0, 6), 10);

    for (const bg of kit.backgrounds) {
      // Check if already populated (column comes back as snake_case: asset_ref)
      const rows = await pool.query<{ asset_ref: string | null }>(
        "SELECT asset_ref FROM backgrounds WHERE id = $1 LIMIT 1",
        [bg.id],
      );
      const existing = rows.rows[0]?.asset_ref;
      if (existing !== null && existing !== undefined && existing !== "") {
        console.log(`  ⏭  Skipping ${bg.id} (already has assetRef)`);
        bgSkipped++;
        continue;
      }

      const seed = seedBase + (bg.variant === "a" ? 0 : bg.variant === "b" ? 1 : 2);
      process.stdout.write(`  🎨  ${bg.name} … `);
      const assetRef = await generateTexture(bg.variant, paperHex, accentHex, seed);

      await pool.query(
        "UPDATE backgrounds SET asset_ref = $1, status = 'live' WHERE id = $2",
        [assetRef, bg.id],
      );

      const kbSize = Math.round(assetRef.length / 1024);
      console.log(`✓ (${kbSize} KB)`);
      bgUpdated++;
    }

    // Promote theme to live
    await pool.query(
      "UPDATE themes SET status = 'live' WHERE id = $1",
      [kit.themeId],
    );

    console.log(`  ✅  Theme ${kit.themeId} → live`);
  }

  // Summary
  const themeIds = KITS.map(k => k.themeId);
  const liveThemes = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM themes WHERE id = ANY($1)`,
    [themeIds],
  );
  const bgIds = KITS.flatMap(k => k.backgrounds.map(b => b.id));
  const liveBgs = await pool.query<{ id: string; status: string; has_asset: boolean }>(
    `SELECT id, status, asset_ref IS NOT NULL as has_asset FROM backgrounds WHERE id = ANY($1)`,
    [bgIds],
  );

  const themesLive = liveThemes.rows.filter(r => r.status === "live").length;
  const bgsLive = liveBgs.rows.filter(r => r.status === "live").length;
  const bgsWithAsset = liveBgs.rows.filter(r => r.has_asset).length;

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  Textures generated: ${bgUpdated}  (${bgSkipped} skipped/already done)`);
  console.log(`  Themes → live:      ${themesLive} / ${themeIds.length}`);
  console.log(`  Backgrounds → live: ${bgsLive} / ${bgIds.length}`);
  console.log(`  Backgrounds w/ asset: ${bgsWithAsset} / ${bgIds.length}`);
  console.log(`─────────────────────────────────────────`);
  if (themesLive < themeIds.length || bgsLive < bgIds.length || bgsWithAsset < bgIds.length) {
    console.error("\n❌  Some rows were not fully promoted — check errors above.");
    process.exit(1);
  }
  console.log("\n✅  All 8 VGJ kits are live and have texture backgrounds.");
}

run()
  .catch(err => { console.error("Publish failed:", err); process.exit(1); })
  .finally(() => pool.end());
