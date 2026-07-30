/**
 * seed-house.ts — Coherent dogfood data for the Pixel Perfect Plans house store.
 *
 * Creates production-quality test data so Product Builder, Theme Studio, Sticker
 * Studio, and Edition Studio can be exercised end-to-end without hand-building
 * every asset first.  Data is grouped by creative theme so the Step 2 payoff
 * panel reads like a real product.
 *
 * Run:   pnpm --filter @workspace/scripts run seed-house
 * Clear: pnpm --filter @workspace/scripts run seed-house:clear
 *
 * All rows use the "hs_" id prefix — the clear script deletes by that prefix.
 * Does NOT touch platform starter/licensed content (t1-t6, p1-p3, i1-i6, etc.)
 * or ci_bad_ QA fixtures.
 *
 * Approximate row counts per table:
 *   palettes          10   (4 Warm Earth + 3 Vintage Christmas + 2 Botanicals + 1 Ocean)
 *   backgrounds       10
 *   inserts           11   (8 functional/seasonal + 3 cover art)
 *   widgets            6
 *   themes             4   (3 complete bundles + 1 intentionally incomplete)
 *   sticker_packs      7
 *   stickers_library  74   (36 named + 31 date-set + 7 weekday-set)
 *   pack_stickers     74
 *   editions           6   (1 live 2026 Daily + 5 drafts inc. notebook + journal)
 *   planner_configs    1   (published 2026 Daily with seeded Drive reference)
 *   orders             5
 *   tickets            6   (+ 4 replies across 3 threads)
 *   store_catalog     27
 *
 * Theme bundle join tables seeded for the three complete themes:
 *   theme_palettes, theme_backgrounds, theme_packs, theme_inserts,
 *   theme_covers, theme_hardware, theme_accessories, theme_fonts
 */
import { db, pool } from "@workspace/db";
import {
  palettesTable,
  backgroundsTable,
  insertsTable,
  widgetsTable,
  hardwareTable,
  accessoriesTable,
  fontsTable,
  stickerPacksTable,
  stickersLibraryTable,
  packStickersTable,
  themesTable,
  themePalettesTable,
  themeBackgroundsTable,
  themePacksTable,
  themeInsertsTable,
  themeCoversTable,
  themeHardwareTable,
  themeAccessoriesTable,
  themeFontsTable,
  editionsTable,
  storeCatalogTable,
  ordersTable,
  ticketsTable,
  ticketRepliesTable,
  plannerConfigsTable,
} from "@workspace/db";
import sharp from "sharp";

const STORE = "store-house";

// ── SVG → PNG helper (mirrors seed-stickers.ts exactly) ─────────────────────
async function svgToPng(svg: string): Promise<string> {
  const buf = await sharp(Buffer.from(svg), { density: 144 })
    .resize(256, 256)
    .png()
    .toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// PALETTES
// colors order: [accent, accent-dark, secondary, tertiary, ink, paper]
// ══════════════════════════════════════════════════════════════════════════════

const PALETTE_DEFS = [
  // ── Warm Earth (4 palettes) ────────────────────────────────────────────────
  { id: "hs_pal_we_classic",    name: "WE · Clay Classic",
    colors: ["#C87560","#9E5A47","#D4A853","#8B6E5B","#2C1A12","#F5EDE0"], isPrimary: true  },
  { id: "hs_pal_we_dusk",      name: "WE · Terracotta Dusk",
    colors: ["#B5613A","#8C4228","#E8B96F","#7A5C4A","#1E1008","#F9F1E4"], isPrimary: false },
  { id: "hs_pal_we_sand",      name: "WE · Desert Sand",
    colors: ["#D4956A","#B07248","#E8C87A","#9E8060","#3A2418","#FBF5EC"], isPrimary: false },
  { id: "hs_pal_we_cocoa",     name: "WE · Cocoa Brown",
    colors: ["#8B5E4A","#6B4230","#C49A5E","#7A6058","#1A0E08","#F0E4D4"], isPrimary: false },

  // ── Vintage Christmas (3 palettes) ─────────────────────────────────────────
  { id: "hs_pal_xms_holly",    name: "XMS · Holly Red",
    colors: ["#B5283C","#7A1328","#C9A227","#4A6741","#1A0A0E","#F4EDD5"], isPrimary: true  },
  { id: "hs_pal_xms_cranberry",name: "XMS · Cranberry",
    colors: ["#8B1A2C","#5C0F1A","#D4AA40","#3A5530","#12060A","#F7F0E0"], isPrimary: false },
  { id: "hs_pal_xms_sage",     name: "XMS · Sage & Brass",
    colors: ["#4A6741","#2E4028","#C9A227","#B5283C","#1A2014","#EFE9D4"], isPrimary: false },

  // ── Botanicals (2 palettes) ─────────────────────────────────────────────────
  { id: "hs_pal_bot_sage",     name: "BOT · Sage Stone",
    colors: ["#7A9E7E","#4A7050","#B8A898","#6B8E7A","#1C2820","#F2EDE4"], isPrimary: true  },
  { id: "hs_pal_bot_moss",     name: "BOT · Moss River",
    colors: ["#5E8065","#3A5C40","#A89880","#587A65","#141E18","#EDE8DF"], isPrimary: false },

  // ── Deep Ocean (1 palette — intentionally incomplete theme) ─────────────────
  { id: "hs_pal_ocean",        name: "OCEAN · Deep Teal",
    colors: ["#2A5F8F","#1A3F6A","#5BA8C4","#7DCCD8","#0A1E2A","#E8F4F8"], isPrimary: true  },
];

// ══════════════════════════════════════════════════════════════════════════════
// BACKGROUNDS
// type: "color" | "texture" | "image"
// assetRef: hex for color, texture slug for texture, file ref for image
// ══════════════════════════════════════════════════════════════════════════════

const BACKGROUND_DEFS = [
  // ── Warm Earth ─────────────────────────────────────────────────────────────
  { id: "hs_bg_we_linen",    name: "WE · Warm Linen",     type: "texture", assetRef: "linen-warm"   },
  { id: "hs_bg_we_cream",    name: "WE · Cream Paper",    type: "color",   assetRef: "#F5EDE0"      },
  { id: "hs_bg_we_kraft",    name: "WE · Natural Kraft",  type: "texture", assetRef: "kraft-natural" },
  { id: "hs_bg_we_sand",     name: "WE · Sand Wash",      type: "color",   assetRef: "#EDE0CC"      },

  // ── Vintage Christmas ───────────────────────────────────────────────────────
  { id: "hs_bg_xms_aged",    name: "XMS · Aged Paper",    type: "texture", assetRef: "paper-aged"   },
  { id: "hs_bg_xms_burgundy",name: "XMS · Deep Burgundy", type: "color",   assetRef: "#3A0F18"      },
  { id: "hs_bg_xms_kraft",   name: "XMS · Dark Kraft",    type: "texture", assetRef: "kraft-dark"   },

  // ── Botanicals ──────────────────────────────────────────────────────────────
  { id: "hs_bg_bot_stone",   name: "BOT · Stone White",   type: "color",   assetRef: "#F2EDE4"      },
  { id: "hs_bg_bot_linen",   name: "BOT · Sage Linen",    type: "texture", assetRef: "linen-sage"   },

  // ── Deep Ocean (only one — theme is intentionally incomplete) ───────────────
  { id: "hs_bg_ocean_deep",  name: "OCEAN · Deep Teal",   type: "color",   assetRef: "#0A2A3A"      },
];

// ══════════════════════════════════════════════════════════════════════════════
// INSERTS
// cat: "Functional" | "Decorative" | "Trackers" | "Seasonal" | "Cover art"
// ══════════════════════════════════════════════════════════════════════════════

const INSERT_DEFS = [
  // ── Seasonal (Vintage Christmas) ────────────────────────────────────────────
  { id: "hs_ins_dec_daily",    name: "December Daily",         cat: "Seasonal",   collection: "Vintage Christmas" },
  { id: "hs_ins_gift_tracker", name: "Gift Tracker",           cat: "Seasonal",   collection: "Vintage Christmas" },

  // ── Functional ──────────────────────────────────────────────────────────────
  { id: "hs_ins_recipe_card",  name: "Recipe Cards",           cat: "Functional", collection: null },
  { id: "hs_ins_menu_planner", name: "Weekly Menu Planner",    cat: "Functional", collection: null },
  { id: "hs_ins_meal_grid",    name: "Meal Prep Grid",         cat: "Functional", collection: null },
  { id: "hs_ins_project_page", name: "Project Planning Page",  cat: "Functional", collection: null },
  { id: "hs_ins_brain_dump",   name: "Brain Dump",             cat: "Functional", collection: null },
  { id: "hs_ins_contacts",     name: "Contact Directory",      cat: "Functional", collection: null },

  // ── Cover art (needed for theme_covers linkage) ─────────────────────────────
  { id: "hs_ins_cover_earth",       name: "Warm Earth Cover Art",   cat: "Cover art",  collection: "Warm Earth"        },
  { id: "hs_ins_cover_xmas",        name: "Vintage Christmas Cover",cat: "Cover art",  collection: "Vintage Christmas" },
  { id: "hs_ins_cover_botanicals",  name: "Botanicals Cover Art",   cat: "Cover art",  collection: "Botanicals"        },
];

// ══════════════════════════════════════════════════════════════════════════════
// WIDGETS  (SVG with {{slot:name}} placeholders for palette colours)
// sizeVariants: named sizes offered in the library
// ══════════════════════════════════════════════════════════════════════════════

const WIDGET_DEFS = [
  {
    id: "hs_wdg_habit_grid",
    name: "Habit Grid",
    sizeVariants: ["7-day", "30-day"],
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 294 64">
  <rect width="294" height="64" rx="8" fill="{{slot:paper}}" opacity="0.9"/>
  <text x="8" y="14" font-family="sans-serif" font-size="10" fill="{{slot:ink}}" opacity="0.6">HABIT TRACKER</text>
  ${[0,1,2,3,4,5,6].map(i=>`<circle cx="${21+i*42}" cy="44" r="16" fill="{{slot:accent}}" opacity="0.15" stroke="{{slot:accent}}" stroke-width="1.5"/>
  <text x="${21+i*42}" y="14" font-family="sans-serif" font-size="9" text-anchor="middle" fill="{{slot:ink}}" opacity="0.5">${["M","T","W","T","F","S","S"][i]}</text>`).join("")}
</svg>`,
    paletteSlots: { accent: "#C87560", ink: "#2C1A12", paper: "#F5EDE0" },
  },
  {
    id: "hs_wdg_mood_tracker",
    name: "Mood Tracker",
    sizeVariants: ["weekly", "monthly"],
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 294 72">
  <rect width="294" height="72" rx="8" fill="{{slot:paper}}" opacity="0.9"/>
  <text x="8" y="14" font-family="sans-serif" font-size="10" fill="{{slot:ink}}" opacity="0.6">MOOD</text>
  ${[0,1,2,3,4,5,6].map(i=>{
    const moods=["😊","🙂","😐","😕","😔","😤","😴"];
    return `<rect x="${i*42}" y="22" width="36" height="36" rx="6" fill="{{slot:accent}}" opacity="${0.1+i*0.04}" stroke="{{slot:accent}}" stroke-width="1"/>
  <text x="${18+i*42}" y="46" font-family="sans-serif" font-size="18" text-anchor="middle">${moods[i]}</text>`;
  }).join("")}
</svg>`,
    paletteSlots: { accent: "#C87560", ink: "#2C1A12", paper: "#F5EDE0" },
  },
  {
    id: "hs_wdg_countdown",
    name: "Countdown",
    sizeVariants: ["7-day", "30-day"],
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80">
  <rect width="160" height="80" rx="10" fill="{{slot:accent}}"/>
  <rect x="4" y="4" width="152" height="72" rx="8" fill="{{slot:paper}}" opacity="0.92"/>
  <text x="80" y="34" font-family="sans-serif" font-size="11" text-anchor="middle" fill="{{slot:ink}}" opacity="0.6">DAYS UNTIL</text>
  <text x="80" y="64" font-family="sans-serif" font-size="30" font-weight="bold" text-anchor="middle" fill="{{slot:accent}}">__</text>
</svg>`,
    paletteSlots: { accent: "#C87560", ink: "#2C1A12", paper: "#F5EDE0" },
  },
  {
    id: "hs_wdg_water_intake",
    name: "Water Intake",
    sizeVariants: ["daily"],
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 56">
  <rect width="280" height="56" rx="8" fill="{{slot:paper}}" opacity="0.9"/>
  <text x="8" y="14" font-family="sans-serif" font-size="10" fill="{{slot:ink}}" opacity="0.6">WATER · 8 GLASSES</text>
  ${Array.from({length:8},(_,i)=>`<path d="M${14+i*32} 22 Q${14+i*32} 18 ${18+i*32} 18 L${28+i*32} 18 Q${32+i*32} 18 ${32+i*32} 22 L${30+i*32} 46 Q${30+i*32} 48 ${23+i*32} 48 Q${16+i*32} 48 ${16+i*32} 46 Z" fill="{{slot:accent}}" opacity="0.15" stroke="{{slot:accent}}" stroke-width="1.2"/>`).join("")}
</svg>`,
    paletteSlots: { accent: "#2A5F8F", ink: "#0A1E2A", paper: "#E8F4F8" },
  },
  {
    id: "hs_wdg_meal_plan",
    name: "Mini Meal Planner",
    sizeVariants: ["weekly"],
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 294 112">
  <rect width="294" height="112" rx="8" fill="{{slot:paper}}" opacity="0.9"/>
  <text x="8" y="14" font-family="sans-serif" font-size="10" fill="{{slot:ink}}" opacity="0.6">WEEKLY MEALS</text>
  ${["B","L","D"].map((meal,r)=>[0,1,2,3,4,5,6].map(d=>`<rect x="${d*42}" y="${20+r*28}" width="38" height="22" rx="4" fill="{{slot:accent}}" opacity="0.1" stroke="{{slot:accent}}" stroke-width="0.8"/>
  <text x="${19+d*42}" y="${20+r*28+8}" font-family="sans-serif" font-size="8" text-anchor="middle" fill="{{slot:accent}}" opacity="0.7">${meal}</text>`).join("")).join("")}
</svg>`,
    paletteSlots: { accent: "#7A9E7E", ink: "#1C2820", paper: "#F2EDE4" },
  },
  {
    id: "hs_wdg_gratitude",
    name: "Gratitude Log",
    sizeVariants: ["weekly", "monthly"],
    svgData: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 96">
  <rect width="260" height="96" rx="8" fill="{{slot:paper}}" opacity="0.9"/>
  <text x="8" y="16" font-family="sans-serif" font-size="10" fill="{{slot:accent}}" opacity="0.9">GRATITUDE</text>
  ${[0,1,2].map(i=>`<line x1="8" y1="${30+i*22}" x2="252" y2="${30+i*22}" stroke="{{slot:accent}}" stroke-width="0.8" opacity="0.25"/>
  <text x="12" y="${42+i*22}" font-family="sans-serif" font-size="9" fill="{{slot:ink}}" opacity="0.4">${i+1}.</text>`).join("")}
</svg>`,
    paletteSlots: { accent: "#C87560", ink: "#2C1A12", paper: "#F5EDE0" },
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// STICKER DEFINITIONS
// All 512×512 SVGs with transparent backgrounds.
// Date set (31) and weekday set (7) are generated programmatically below.
// ══════════════════════════════════════════════════════════════════════════════

interface StickerDef {
  id: string; name: string; functionType: string; tags: string[];
  shadowStyle?: string; shadowLiftPx?: number;
  setId?: string; setLabel?: string;
  svg: string;
}

// ── Named stickers (36 total across 5 packs) ──────────────────────────────────

const NAMED_STICKER_DEFS: StickerDef[] = [
  // ── Warm Earth Essentials (8) ──────────────────────────────────────────────
  {
    id: "hs_stk_we_checkbox", name: "WE · Checkbox", functionType: "checkbox",
    tags: ["warm earth","checkbox","clay","done"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="80" y="80" width="352" height="352" rx="64" fill="#C87560"/>
      <rect x="108" y="108" width="296" height="296" rx="52" fill="#D9927F"/>
      <polyline points="164,256 224,320 354,192"
        stroke="white" stroke-width="46" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_flag", name: "WE · Priority Flag", functionType: "flag",
    tags: ["warm earth","flag","priority","terracotta"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="110" y="72" width="30" height="368" rx="10" fill="#8B6E5B"/>
      <path d="M140,90 L406,164 L140,256 Z" fill="#C87560"/>
      <path d="M140,94 L394,164 L140,252 Z" fill="#D9927F"/>
      <circle cx="110" cy="450" r="22" fill="#8B6E5B"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_habit", name: "WE · Habit Dots", functionType: "habit",
    tags: ["warm earth","habit","streak","clay","grid"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      ${[128,256,384].flatMap(cx=>[128,256,384].map(cy=>
        `<circle cx="${cx}" cy="${cy}" r="60" fill="#C87560" opacity="${cy===256&&cx===256?'1':'0.6'}"/>`
      )).join("")}
      <circle cx="256" cy="256" r="60" fill="#D9927F"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_deco_leaf", name: "WE · Botanical Leaf", functionType: "decorative",
    tags: ["warm earth","leaf","botanical","decorative","clay"],
    shadowStyle: "soft", shadowLiftPx: 4,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <path d="M256,420 Q120,320 96,180 Q200,100 330,148 Q420,240 256,420 Z" fill="#C87560"/>
      <path d="M256,420 Q160,320 136,196 Q228,124 340,164 Q400,250 256,420 Z" fill="#D4956A" opacity="0.7"/>
      <line x1="256" y1="420" x2="240" y2="148" stroke="#9E5A47" stroke-width="3" opacity="0.5"/>
      <path d="M256,360 Q200,320 190,270" stroke="#9E5A47" stroke-width="2" fill="none" opacity="0.4"/>
      <path d="M256,300 Q210,260 196,218" stroke="#9E5A47" stroke-width="2" fill="none" opacity="0.4"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_deco_arch", name: "WE · Rising Sun", functionType: "decorative",
    tags: ["warm earth","arch","sun","decorative","terracotta"],
    shadowStyle: "flat",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <path d="M80,400 Q80,168 256,168 Q432,168 432,400 Z" fill="#C87560"/>
      <path d="M100,400 Q100,188 256,188 Q412,188 412,400 Z" fill="#D9927F"/>
      <rect x="80" y="392" width="352" height="28" rx="6" fill="#9E5A47"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_deco_dots", name: "WE · Dot Burst", functionType: "decorative",
    tags: ["warm earth","dots","burst","decorative","pattern"],
    shadowStyle: "flat",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <circle cx="256" cy="256" r="48" fill="#C87560"/>
      ${Array.from({length:12},(_,i)=>{
        const a=i*30*Math.PI/180; const r=160;
        const x=256+r*Math.cos(a), y=256+r*Math.sin(a);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${20+Math.sin(i)*6}" fill="#D4A853" opacity="${0.5+i%3*0.15}"/>`;
      }).join("")}
      ${Array.from({length:12},(_,i)=>{
        const a=(i*30+15)*Math.PI/180; const r=100;
        const x=256+r*Math.cos(a), y=256+r*Math.sin(a);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="#C87560" opacity="0.5"/>`;
      }).join("")}
    </svg>`,
  },
  {
    id: "hs_stk_we_banner", name: "WE · Write-in Banner", functionType: "banner",
    tags: ["warm earth","banner","label","text","clay"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <path d="M48,196 L0,256 L48,316 L464,316 L464,196 Z" fill="#C87560"/>
      <path d="M56,204 L16,256 L56,308 L456,308 L456,204 Z" fill="#D9927F"/>
      <line x1="80" y1="256" x2="432" y2="256" stroke="white" stroke-width="2" opacity="0.3" stroke-dasharray="4,8"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_tab", name: "WE · Section Tab", functionType: "tab",
    tags: ["warm earth","tab","section","divider","clay"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="48" y="176" width="416" height="296" rx="24" fill="#C87560"/>
      <rect x="48" y="152" width="216" height="64" rx="20" fill="#C87560"/>
      <rect x="62" y="162" width="188" height="54" rx="16" fill="#D9927F"/>
      <rect x="62" y="204" width="388" height="252" rx="16" fill="#D9927F"/>
    </svg>`,
  },

  // ── Warm Earth Time Pack (6) ───────────────────────────────────────────────
  {
    id: "hs_stk_we_tb_morning", name: "WE · Morning Block", functionType: "time-block",
    tags: ["warm earth","morning","AM","time-block","schedule"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="64" y="64" width="384" height="384" rx="40" fill="#D4A853"/>
      <rect x="88" y="88" width="336" height="336" rx="32" fill="#E8C87A"/>
      <circle cx="256" cy="220" r="72" fill="#D4A853"/>
      ${Array.from({length:8},(_,i)=>{
        const a=i*45*Math.PI/180; const r=120;
        return `<line x1="${256+90*Math.cos(a)}" y1="${220+90*Math.sin(a)}" x2="${256+r*Math.cos(a)}" y2="${220+r*Math.sin(a)}" stroke="#9E6C1A" stroke-width="10" stroke-linecap="round"/>`;
      }).join("")}
      <rect x="104" y="324" width="304" height="72" rx="14" fill="#D4A853" opacity="0.6"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_tb_afternoon", name: "WE · Afternoon Block", functionType: "time-block",
    tags: ["warm earth","afternoon","PM","time-block","schedule"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="64" y="64" width="384" height="384" rx="40" fill="#C87560"/>
      <rect x="88" y="88" width="336" height="336" rx="32" fill="#D9927F"/>
      <circle cx="256" cy="256" r="100" fill="none" stroke="#C87560" stroke-width="16"/>
      <circle cx="256" cy="256" r="12" fill="#9E5A47"/>
      <line x1="256" y1="176" x2="256" y2="256" stroke="#9E5A47" stroke-width="12" stroke-linecap="round"/>
      <line x1="256" y1="256" x2="320" y2="256" stroke="#9E5A47" stroke-width="10" stroke-linecap="round"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_tb_evening", name: "WE · Evening Block", functionType: "time-block",
    tags: ["warm earth","evening","night","time-block","moon"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="64" y="64" width="384" height="384" rx="40" fill="#8B6E5B"/>
      <rect x="88" y="88" width="336" height="336" rx="32" fill="#A88070"/>
      <path d="M296,148 A120,120 0 1,0 296,364 A80,80 0 1,1 296,148 Z" fill="#8B6E5B"/>
      <circle cx="330" cy="200" r="12" fill="#D4A853" opacity="0.8"/>
      <circle cx="300" cy="160" r="8" fill="#D4A853" opacity="0.6"/>
      <circle cx="356" cy="238" r="6" fill="#D4A853" opacity="0.5"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_tb_focus", name: "WE · Focus Block", functionType: "time-block",
    tags: ["warm earth","focus","deep work","time-block"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="64" y="64" width="384" height="384" rx="40" fill="#2C1A12"/>
      <rect x="88" y="88" width="336" height="336" rx="32" fill="#3E2418"/>
      <circle cx="256" cy="232" r="96" fill="none" stroke="#C87560" stroke-width="12"/>
      <circle cx="256" cy="232" r="64" fill="none" stroke="#C87560" stroke-width="8" opacity="0.6"/>
      <circle cx="256" cy="232" r="32" fill="#C87560"/>
      <rect x="104" y="348" width="304" height="72" rx="14" fill="#C87560" opacity="0.25"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_tb_break", name: "WE · Break", functionType: "time-block",
    tags: ["warm earth","break","rest","time-block"],
    shadowStyle: "flat",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="64" y="160" width="384" height="192" rx="32" fill="#D4A853" opacity="0.9"/>
      <rect x="80" y="176" width="352" height="160" rx="24" fill="#E8C87A"/>
      <path d="M200,248 Q256,208 312,248 Q256,288 200,248 Z" fill="#D4A853"/>
      <circle cx="256" cy="248" r="20" fill="#9E6C1A" opacity="0.5"/>
    </svg>`,
  },
  {
    id: "hs_stk_we_tab2", name: "WE · Index Tab", functionType: "tab",
    tags: ["warm earth","tab","index","paper","label"],
    shadowStyle: "flat",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="80" y="64" width="360" height="384" rx="16" fill="#F5EDE0"/>
      <rect x="80" y="64" width="360" height="80" rx="16" fill="#C87560"/>
      <rect x="80" y="112" width="360" height="32" fill="#C87560"/>
      <rect x="96" y="176" width="328" height="12" rx="6" fill="#C87560" opacity="0.2"/>
      <rect x="96" y="204" width="280" height="12" rx="6" fill="#C87560" opacity="0.2"/>
      <rect x="96" y="232" width="300" height="12" rx="6" fill="#C87560" opacity="0.2"/>
    </svg>`,
  },

  // ── Holly & Berry Pack (8 stickers for Vintage Christmas) ──────────────────
  {
    id: "hs_stk_xms_checkbox", name: "XMS · Checkbox", functionType: "checkbox",
    tags: ["christmas","checkbox","red","done","festive"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="80" y="80" width="352" height="352" rx="64" fill="#B5283C"/>
      <rect x="108" y="108" width="296" height="296" rx="52" fill="#CC3B50"/>
      <polyline points="164,256 224,320 354,192"
        stroke="#C9A227" stroke-width="44" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`,
  },
  {
    id: "hs_stk_xms_flag", name: "XMS · Ribbon Flag", functionType: "flag",
    tags: ["christmas","flag","ribbon","priority","red"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="110" y="72" width="28" height="368" rx="10" fill="#7A1328"/>
      <path d="M138,90 L402,164 L138,256 Z" fill="#B5283C"/>
      <path d="M138,94 L390,164 L138,252 Z" fill="#CC3B50"/>
      <circle cx="138" cy="164" r="12" fill="#C9A227"/>
      <circle cx="110" cy="450" r="20" fill="#7A1328"/>
    </svg>`,
  },
  {
    id: "hs_stk_xms_holly", name: "XMS · Holly Branch", functionType: "decorative",
    tags: ["christmas","holly","berries","decorative","festive"],
    shadowStyle: "soft", shadowLiftPx: 4,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <path d="M256,320 Q160,280 120,180 Q200,120 280,180 Q300,140 320,120 Q400,160 370,260 Q340,300 256,320 Z" fill="#4A6741"/>
      <path d="M256,320 Q170,288 138,196 Q210,138 282,192 Q296,156 314,132 Q386,168 360,258 Z" fill="#5A8050" opacity="0.7"/>
      <line x1="256" y1="320" x2="240" y2="196" stroke="#2E4028" stroke-width="3" opacity="0.4"/>
      <path d="M256,280 Q216,256 204,228" stroke="#2E4028" stroke-width="2" fill="none" opacity="0.35"/>
      <circle cx="256" cy="332" r="22" fill="#B5283C"/>
      <circle cx="232" cy="348" r="18" fill="#CC3B50"/>
      <circle cx="278" cy="346" r="20" fill="#7A1328"/>
    </svg>`,
  },
  {
    id: "hs_stk_xms_star", name: "XMS · Gold Star", functionType: "decorative",
    tags: ["christmas","star","gold","decorative","festive"],
    shadowStyle: "soft", shadowLiftPx: 4,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <polygon points="${[0,1,2,3,4,5,6,7,8,9].map(i=>{
        const a=(i*36-90)*Math.PI/180; const r=i%2===0?220:88;
        return `${256+r*Math.cos(a)},${256+r*Math.sin(a)}`;
      }).join(" ")}" fill="#C9A227"/>
      <polygon points="${[0,1,2,3,4,5,6,7,8,9].map(i=>{
        const a=(i*36-90)*Math.PI/180; const r=i%2===0?196:72;
        return `${256+r*Math.cos(a)},${256+r*Math.sin(a)}`;
      }).join(" ")}" fill="#E0B840" opacity="0.7"/>
    </svg>`,
  },
  {
    id: "hs_stk_xms_bell", name: "XMS · Bell", functionType: "decorative",
    tags: ["christmas","bell","gold","decorative","festive"],
    shadowStyle: "soft", shadowLiftPx: 4,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <path d="M256,80 Q256,80 180,130 Q120,200 120,310 L392,310 Q392,200 332,130 Q256,80 256,80 Z" fill="#C9A227"/>
      <path d="M256,84 Q256,84 186,132 Q130,198 130,310 L382,310 Q382,198 326,132 Z" fill="#E0B840" opacity="0.6"/>
      <ellipse cx="256" cy="316" rx="136" ry="28" fill="#B89020"/>
      <circle cx="256" cy="360" r="36" fill="#C9A227"/>
      <circle cx="256" cy="360" r="24" fill="#9A7010"/>
      <rect x="244" y="60" width="24" height="32" rx="12" fill="#7A5010"/>
    </svg>`,
  },
  {
    id: "hs_stk_xms_candle", name: "XMS · Candle", functionType: "decorative",
    tags: ["christmas","candle","flame","decorative","festive"],
    shadowStyle: "soft", shadowLiftPx: 4,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <ellipse cx="256" cy="448" rx="120" ry="24" fill="#7A1328" opacity="0.3"/>
      <rect x="192" y="216" width="128" height="232" rx="16" fill="#F4EDD5"/>
      <rect x="204" y="228" width="104" height="208" rx="12" fill="#FBF5E8"/>
      <path d="M256,216 Q276,180 268,148 Q290,160 292,200 Q310,160 298,120 Q330,140 326,188 Q346,152 336,108 Q376,140 356,200 Q368,176 370,148 Q390,176 380,216 Z" fill="#C9A227" opacity="0.85"/>
      <ellipse cx="256" cy="120" rx="32" ry="48" fill="#E8840A"/>
      <ellipse cx="256" cy="128" rx="18" ry="32" fill="#FFC93C"/>
      <line x1="256" y1="216" x2="256" y2="212" stroke="#8B6E5B" stroke-width="6"/>
    </svg>`,
  },
  {
    id: "hs_stk_xms_habit", name: "XMS · Advent Habit", functionType: "habit",
    tags: ["christmas","habit","advent","dots","festive"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      ${[0,1,2,3,4,5,6,7,8].map((i)=>{
        const colors=["#B5283C","#C9A227","#4A6741"];
        const cx=128+((i%3)*128), cy=128+Math.floor(i/3)*128;
        return `<circle cx="${cx}" cy="${cy}" r="52" fill="${colors[i%3]}" opacity="${i===4?1:0.6}"/>`;
      }).join("")}
      <circle cx="256" cy="256" r="52" fill="#CC3B50"/>
    </svg>`,
  },
  {
    id: "hs_stk_xms_banner", name: "XMS · Festive Banner", functionType: "banner",
    tags: ["christmas","banner","festive","label","write-in"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <path d="M48,196 L0,256 L48,316 L464,316 L464,196 Z" fill="#B5283C"/>
      <path d="M56,204 L16,256 L56,308 L456,308 L456,204 Z" fill="#CC3B50"/>
      <circle cx="110" cy="196" r="8" fill="#C9A227"/>
      <circle cx="402" cy="196" r="8" fill="#C9A227"/>
      <circle cx="110" cy="316" r="8" fill="#C9A227"/>
      <circle cx="402" cy="316" r="8" fill="#C9A227"/>
    </svg>`,
  },

  // ── Kraft Labels Pack (6) ──────────────────────────────────────────────────
  {
    id: "hs_stk_kl_banner_wide", name: "KL · Kraft Banner", functionType: "banner",
    tags: ["kraft","banner","vintage","label","write-in"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="48" y="192" width="416" height="128" rx="12" fill="#C49A5E"/>
      <rect x="60" y="204" width="392" height="104" rx="8" fill="#D4B07A"/>
      <path d="M48,248 L0,256 L48,264" fill="#B07248" stroke="none"/>
      <path d="M464,248 L512,256 L464,264" fill="#B07248" stroke="none"/>
      <line x1="88" y1="256" x2="424" y2="256" stroke="#B07248" stroke-width="1.5" opacity="0.3" stroke-dasharray="6,10"/>
    </svg>`,
  },
  {
    id: "hs_stk_kl_tag", name: "KL · Gift Tag", functionType: "banner",
    tags: ["kraft","gift-tag","christmas","label","vintage"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="128" y="120" width="256" height="304" rx="20" fill="#C49A5E"/>
      <rect x="144" y="136" width="224" height="272" rx="14" fill="#D4B07A"/>
      <circle cx="256" cy="120" r="20" fill="#C49A5E"/>
      <circle cx="256" cy="120" r="10" fill="white"/>
      <path d="M256,100 Q280,72 284,40" stroke="#C49A5E" stroke-width="3" fill="none"/>
      <line x1="168" y1="280" x2="344" y2="280" stroke="#B07248" stroke-width="1.5" opacity="0.4" stroke-dasharray="4,8"/>
      <line x1="168" y1="306" x2="300" y2="306" stroke="#B07248" stroke-width="1.5" opacity="0.4" stroke-dasharray="4,8"/>
    </svg>`,
  },
  {
    id: "hs_stk_kl_label", name: "KL · To/From Label", functionType: "banner",
    tags: ["kraft","to-from","christmas","label","tag"],
    shadowStyle: "flat",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="64" y="148" width="384" height="216" rx="16" fill="#C49A5E"/>
      <rect x="76" y="160" width="360" height="192" rx="10" fill="#D4B07A"/>
      <text x="256" y="240" font-family="sans-serif" font-size="44" font-weight="bold" text-anchor="middle" fill="#8B6040" opacity="0.6">TO:</text>
      <line x1="100" y1="300" x2="412" y2="300" stroke="#8B6040" stroke-width="2" opacity="0.3"/>
    </svg>`,
  },
  {
    id: "hs_stk_kl_tab_red", name: "KL · Red Tab", functionType: "tab",
    tags: ["christmas","tab","red","section","vintage"],
    shadowStyle: "soft", shadowLiftPx: 2,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="48" y="176" width="416" height="280" rx="24" fill="#7A1328"/>
      <rect x="48" y="152" width="200" height="64" rx="20" fill="#7A1328"/>
      <rect x="62" y="162" width="172" height="54" rx="16" fill="#B5283C"/>
      <rect x="62" y="204" width="388" height="236" rx="16" fill="#B5283C"/>
    </svg>`,
  },
  {
    id: "hs_stk_kl_tab_gold", name: "KL · Brass Tab", functionType: "tab",
    tags: ["christmas","tab","gold","brass","vintage"],
    shadowStyle: "soft", shadowLiftPx: 2,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="48" y="176" width="416" height="280" rx="24" fill="#9A7010"/>
      <rect x="48" y="152" width="200" height="64" rx="20" fill="#9A7010"/>
      <rect x="62" y="162" width="172" height="54" rx="16" fill="#C9A227"/>
      <rect x="62" y="204" width="388" height="236" rx="16" fill="#C9A227"/>
    </svg>`,
  },
  {
    id: "hs_stk_kl_tab_green", name: "KL · Holly Green Tab", functionType: "tab",
    tags: ["christmas","tab","green","holly","vintage"],
    shadowStyle: "soft", shadowLiftPx: 2,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="48" y="176" width="416" height="280" rx="24" fill="#2E4028"/>
      <rect x="48" y="152" width="200" height="64" rx="20" fill="#2E4028"/>
      <rect x="62" y="162" width="172" height="54" rx="16" fill="#4A6741"/>
      <rect x="62" y="204" width="388" height="236" rx="16" fill="#4A6741"/>
    </svg>`,
  },

  // ── Pressed Botanicals Pack (8) ────────────────────────────────────────────
  {
    id: "hs_stk_bot_fern", name: "BOT · Pressed Fern", functionType: "decorative",
    tags: ["botanicals","fern","pressed","decorative","sage"],
    shadowStyle: "soft", shadowLiftPx: 4,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <path d="M256,440 L256,100" stroke="#4A7050" stroke-width="6"/>
      ${Array.from({length:10},(_,i)=>{
        const y=140+i*30, len=80-i*6, ang=(i%2===0?-1:1)*0.7;
        return `<path d="M256,${y} Q${256+len*Math.cos(ang)*0.6},${y-len*0.4} ${256+len*Math.cos(ang)},${y-len*Math.sin(Math.abs(ang))}" stroke="#7A9E7E" stroke-width="3.5" fill="none"/>`;
      }).join("")}
      ${Array.from({length:10},(_,i)=>{
        const y=140+i*30, len=80-i*6, ang=-(i%2===0?-1:1)*0.7;
        return `<path d="M256,${y} Q${256+len*Math.cos(ang)*0.6},${y-len*0.4} ${256+len*Math.cos(ang)},${y-len*Math.sin(Math.abs(ang))}" stroke="#7A9E7E" stroke-width="3.5" fill="none"/>`;
      }).join("")}
    </svg>`,
  },
  {
    id: "hs_stk_bot_sprig", name: "BOT · Sage Sprig", functionType: "decorative",
    tags: ["botanicals","sage","sprig","decorative","herb"],
    shadowStyle: "soft", shadowLiftPx: 4,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <path d="M256,460 Q248,380 240,300 Q230,240 256,120 Q282,240 272,300 Q264,380 256,460 Z" stroke="#4A7050" stroke-width="5" fill="none"/>
      ${Array.from({length:8},(_,i)=>{
        const y=160+i*38, side=i%2===0?-1:1, x=256+side*28, w=60-i*4;
        return `<ellipse cx="${x+side*w*0.5}" cy="${y-12}" rx="${w*0.55}" ry="${w*0.28}" fill="#7A9E7E" opacity="${0.7+i%2*0.2}" transform="rotate(${side*-20} ${x} ${y})"/>`;
      }).join("")}
    </svg>`,
  },
  {
    id: "hs_stk_bot_flower", name: "BOT · Stone Flower", functionType: "decorative",
    tags: ["botanicals","flower","stone","decorative","minimal"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      ${Array.from({length:6},(_,i)=>{
        const a=i*60*Math.PI/180;
        return `<ellipse cx="${256+104*Math.cos(a)}" cy="${256+104*Math.sin(a)}" rx="72" ry="48" fill="#B8A898" transform="rotate(${i*60} ${256+104*Math.cos(a)} ${256+104*Math.sin(a)})" opacity="0.85"/>`;
      }).join("")}
      <circle cx="256" cy="256" r="56" fill="#8B7A6A"/>
      <circle cx="256" cy="256" r="36" fill="#D4C8B8"/>
    </svg>`,
  },
  {
    id: "hs_stk_bot_petal", name: "BOT · Scattered Petals", functionType: "decorative",
    tags: ["botanicals","petals","scatter","decorative","flowers"],
    shadowStyle: "flat",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      ${[
        [150,180,30,45],[320,140,24,120],[420,260,28,200],[180,380,26,300],
        [360,400,22,60],[260,300,32,170],[100,320,20,250],[440,160,18,330],
      ].map(([cx,cy,r,rot])=>
        `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r/2}" fill="#B8A898" transform="rotate(${rot} ${cx} ${cy})" opacity="0.75"/>`
      ).join("")}
      ${[
        [200,240,16,80],[340,320,14,160],[150,440,12,310],[390,100,18,240],
      ].map(([cx,cy,r,rot])=>
        `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r/2}" fill="#7A9E7E" opacity="0.6" transform="rotate(${rot} ${cx} ${cy})"/>`
      ).join("")}
    </svg>`,
  },
  {
    id: "hs_stk_bot_tab_sage", name: "BOT · Sage Tab", functionType: "tab",
    tags: ["botanicals","tab","sage","section","green"],
    shadowStyle: "soft", shadowLiftPx: 2,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="48" y="176" width="416" height="280" rx="24" fill="#4A7050"/>
      <rect x="48" y="152" width="200" height="64" rx="20" fill="#4A7050"/>
      <rect x="62" y="162" width="172" height="54" rx="16" fill="#7A9E7E"/>
      <rect x="62" y="204" width="388" height="236" rx="16" fill="#7A9E7E"/>
    </svg>`,
  },
  {
    id: "hs_stk_bot_tab_stone", name: "BOT · Stone Tab", functionType: "tab",
    tags: ["botanicals","tab","stone","section","neutral"],
    shadowStyle: "soft", shadowLiftPx: 2,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="48" y="176" width="416" height="280" rx="24" fill="#8B7A6A"/>
      <rect x="48" y="152" width="200" height="64" rx="20" fill="#8B7A6A"/>
      <rect x="62" y="162" width="172" height="54" rx="16" fill="#B8A898"/>
      <rect x="62" y="204" width="388" height="236" rx="16" fill="#B8A898"/>
    </svg>`,
  },
  {
    id: "hs_stk_bot_habit", name: "BOT · Sage Habit Dots", functionType: "habit",
    tags: ["botanicals","habit","sage","dots","tracker"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      ${[128,256,384].flatMap(cx=>[128,256,384].map(cy=>
        `<circle cx="${cx}" cy="${cy}" r="56" fill="#7A9E7E" opacity="${cx===256&&cy===256?'1':'0.55'}"/>`
      )).join("")}
      <circle cx="256" cy="256" r="56" fill="#5E8065"/>
    </svg>`,
  },
  {
    id: "hs_stk_bot_flag", name: "BOT · Botanical Flag", functionType: "flag",
    tags: ["botanicals","flag","sage","priority","botanical"],
    shadowStyle: "soft", shadowLiftPx: 3,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="110" y="72" width="28" height="368" rx="10" fill="#4A7050"/>
      <path d="M138,90 L402,164 L138,256 Z" fill="#7A9E7E"/>
      <path d="M138,94 L390,164 L138,252 Z" fill="#9EC0A0" opacity="0.7"/>
      <ellipse cx="320" cy="164" rx="32" ry="20" fill="#4A7050" opacity="0.5"/>
      <circle cx="110" cy="450" r="20" fill="#4A7050"/>
    </svg>`,
  },
];

// ── Date set (1–31) — programmatically generated ──────────────────────────────

const DATE_STICKER_DEFS: StickerDef[] = Array.from({ length: 31 }, (_, i) => {
  const d = i + 1;
  const fontSize = d >= 10 ? 176 : 200;
  return {
    id: `hs_stk_date_${String(d).padStart(2, "0")}`,
    name: `Date · ${d}`,
    functionType: "date",
    setId: "hs_set_dates",
    setLabel: String(d),
    tags: ["date", "number", `day-${d}`, "warm earth", "set"],
    shadowStyle: "soft", shadowLiftPx: 2,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <circle cx="256" cy="256" r="224" fill="#C87560"/>
      <circle cx="256" cy="256" r="196" fill="#D9927F"/>
      <text x="256" y="300" font-family="Georgia, serif" font-size="${fontSize}" font-weight="bold"
        text-anchor="middle" fill="white" dominant-baseline="auto">${d}</text>
    </svg>`,
  };
});

// ── Weekday set (Mon–Sun) — programmatically generated ────────────────────────

const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"] as const;
const WEEKDAY_COLORS = ["#C87560","#B5613A","#8B6E5B","#C87560","#D4A853","#9E5A47","#B07248"];

const WEEKDAY_STICKER_DEFS: StickerDef[] = WEEKDAYS.map((day, i) => ({
  id: `hs_stk_wday_${day.toLowerCase()}`,
  name: `Weekday · ${day}`,
  functionType: "date",
  setId: "hs_set_weekdays",
  setLabel: day,
  tags: ["weekday", day.toLowerCase(), "label", "warm earth", "set"],
  shadowStyle: "soft", shadowLiftPx: 2,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <rect x="56" y="160" width="400" height="192" rx="96" fill="${WEEKDAY_COLORS[i]}"/>
    <rect x="72" y="176" width="368" height="160" rx="80" fill="${WEEKDAY_COLORS[i].replace(/\w{6}$/, c => {
      const n=parseInt(c,16); const r=Math.min(255,((n>>16)&0xff)+32); const g=Math.min(255,((n>>8)&0xff)+20); const b=Math.min(255,(n&0xff)+20);
      return (r*65536+g*256+b).toString(16).padStart(6,'0');
    })}"/>
    <text x="256" y="278" font-family="Georgia, serif" font-size="128" font-weight="bold"
      text-anchor="middle" fill="white" dominant-baseline="auto">${day.toUpperCase()}</text>
  </svg>`,
}));

// All sticker definitions combined
const ALL_STICKER_DEFS = [...NAMED_STICKER_DEFS, ...DATE_STICKER_DEFS, ...WEEKDAY_STICKER_DEFS];

// ══════════════════════════════════════════════════════════════════════════════
// STICKER PACKS
// ══════════════════════════════════════════════════════════════════════════════

const PACK_DEFS = [
  {
    id: "hs_pack_we_essentials", name: "Warm Earth Essentials",
    tags: ["warm earth","clay","terracotta","checkbox","flag","habit"],
    stickerIds: ["hs_stk_we_checkbox","hs_stk_we_flag","hs_stk_we_habit",
                 "hs_stk_we_deco_leaf","hs_stk_we_deco_arch","hs_stk_we_deco_dots",
                 "hs_stk_we_banner","hs_stk_we_tab"],
  },
  {
    id: "hs_pack_we_time", name: "Warm Earth Time Blocks",
    tags: ["warm earth","time-block","schedule","focus","morning","evening"],
    stickerIds: ["hs_stk_we_tb_morning","hs_stk_we_tb_afternoon","hs_stk_we_tb_evening",
                 "hs_stk_we_tb_focus","hs_stk_we_tb_break","hs_stk_we_tab2"],
  },
  {
    id: "hs_pack_holly_berry", name: "Holly & Berry",
    tags: ["christmas","festive","holly","berries","red","gold"],
    stickerIds: ["hs_stk_xms_checkbox","hs_stk_xms_flag","hs_stk_xms_holly",
                 "hs_stk_xms_star","hs_stk_xms_bell","hs_stk_xms_candle",
                 "hs_stk_xms_habit","hs_stk_xms_banner"],
  },
  {
    id: "hs_pack_kraft_labels", name: "Kraft Label Set",
    tags: ["kraft","vintage","christmas","banner","tab","label"],
    stickerIds: ["hs_stk_kl_banner_wide","hs_stk_kl_tag","hs_stk_kl_label",
                 "hs_stk_kl_tab_red","hs_stk_kl_tab_gold","hs_stk_kl_tab_green"],
  },
  {
    id: "hs_pack_pressed_botanicals", name: "Pressed Botanicals",
    tags: ["botanicals","sage","fern","pressed","leaves","flower","stone"],
    stickerIds: ["hs_stk_bot_fern","hs_stk_bot_sprig","hs_stk_bot_flower",
                 "hs_stk_bot_petal","hs_stk_bot_tab_sage","hs_stk_bot_tab_stone",
                 "hs_stk_bot_habit","hs_stk_bot_flag"],
  },
  {
    id: "hs_pack_dates", name: "Date Set 1–31",
    tags: ["date","number","set","clay","warm earth","planning"],
    stickerIds: DATE_STICKER_DEFS.map(s => s.id),
  },
  {
    id: "hs_pack_weekdays", name: "Weekday Labels",
    tags: ["weekday","day","set","warm earth","planning","label"],
    stickerIds: WEEKDAY_STICKER_DEFS.map(s => s.id),
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// THEMES
// colors: [accent, accent-dark, secondary, tertiary, ink, paper]
// ══════════════════════════════════════════════════════════════════════════════

const THEME_DEFS = [
  // ── 1. Warm Earth — complete bundle ─────────────────────────────────────────
  {
    id: "hs_theme_warm_earth",
    name: "Warm Earth",
    desc: "Clay, cocoa, and cream paper — the house look. Grounded and inviting.",
    colors: ["#C87560","#9E5A47","#D4A853","#8B6E5B","#2C1A12","#F5EDE0"],
    status: "live",
    fontPairing: { heading: "Playfair Display", subheading: "DM Serif", body: "Lora", accent: "Cormorant" },
    paletteIds: ["hs_pal_we_classic","hs_pal_we_dusk","hs_pal_we_sand","hs_pal_we_cocoa"],
    primaryPaletteId: "hs_pal_we_classic",
    backgroundIds: ["hs_bg_we_linen","hs_bg_we_cream","hs_bg_we_kraft","hs_bg_we_sand"],
    packIds: ["hs_pack_we_essentials","hs_pack_we_time","hs_pack_dates"],
    insertIds: ["hs_ins_project_page","hs_ins_brain_dump","hs_ins_contacts","hs_ins_menu_planner"],
    coverInsertId: "hs_ins_cover_earth",
    hardwareId: "hw_brass_coil",
    accessoryId: "acc_ribbon_bookmark",
    fontIds: ["font_playfair_display","font_lora","font_dm_serif","font_cormorant"],
  },
  // ── 2. Vintage Christmas — complete bundle ───────────────────────────────────
  {
    id: "hs_theme_xmas",
    name: "Vintage Christmas",
    desc: "Aged paper, deep reds, and brass hardware. Pairs with the December inserts.",
    colors: ["#B5283C","#7A1328","#C9A227","#4A6741","#1A0A0E","#F4EDD5"],
    status: "live",
    fontPairing: { heading: "Cormorant", subheading: "Playfair Display", body: "Lora", accent: "DM Serif" },
    paletteIds: ["hs_pal_xms_holly","hs_pal_xms_cranberry","hs_pal_xms_sage"],
    primaryPaletteId: "hs_pal_xms_holly",
    backgroundIds: ["hs_bg_xms_aged","hs_bg_xms_kraft","hs_bg_xms_burgundy"],
    packIds: ["hs_pack_holly_berry","hs_pack_kraft_labels"],
    insertIds: ["hs_ins_dec_daily","hs_ins_gift_tracker","hs_ins_menu_planner","hs_ins_recipe_card"],
    coverInsertId: "hs_ins_cover_xmas",
    hardwareId: "hw_brass_coil",
    accessoryId: "acc_ribbon_bookmark",
    fontIds: ["font_cormorant","font_playfair_display","font_lora","font_dm_serif"],
  },
  // ── 3. Botanicals — complete bundle ─────────────────────────────────────────
  {
    id: "hs_theme_botanicals",
    name: "Botanicals",
    desc: "Sage and stone with pressed-leaf art. Calm and natural.",
    colors: ["#7A9E7E","#4A7050","#B8A898","#6B8E7A","#1C2820","#F2EDE4"],
    status: "draft",
    fontPairing: { heading: "DM Serif", subheading: "Cormorant", body: "Libre Baskerville", accent: "Lora" },
    paletteIds: ["hs_pal_bot_sage","hs_pal_bot_moss"],
    primaryPaletteId: "hs_pal_bot_sage",
    backgroundIds: ["hs_bg_bot_stone","hs_bg_bot_linen"],
    packIds: ["hs_pack_pressed_botanicals","hs_pack_weekdays"],
    insertIds: ["hs_ins_meal_grid","hs_ins_recipe_card","hs_ins_brain_dump"],
    coverInsertId: "hs_ins_cover_botanicals",
    hardwareId: "hw_silver_discs",
    accessoryId: "acc_tab_set",
    fontIds: ["font_dm_serif","font_cormorant","font_lora","font_libre_baskerville"],
  },
  // ── 4. Deep Ocean — intentionally INCOMPLETE (only palette + 1 bg) ───────────
  {
    id: "hs_theme_ocean",
    name: "Deep Ocean",
    desc: "Draft — palette only. Slots for packs, inserts, hardware, and cover art are empty.",
    colors: ["#2A5F8F","#1A3F6A","#5BA8C4","#7DCCD8","#0A1E2A","#E8F4F8"],
    status: "draft",
    fontPairing: null,
    paletteIds: ["hs_pal_ocean"],
    primaryPaletteId: "hs_pal_ocean",
    backgroundIds: ["hs_bg_ocean_deep"],
    packIds: [],
    insertIds: [],
    coverInsertId: null,
    hardwareId: null,
    accessoryId: null,
    fontIds: [],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// EDITIONS
// ══════════════════════════════════════════════════════════════════════════════

const EDITION_DEFS = [
  // ── 1. PUBLISHED — "Next year of something you already sell" carries from this ──
  {
    id: "hs_ed_2026_daily",
    name: "2026 Daily · Warm Earth",
    status: "live",  tier: "advanced",  productType: "planner",  year: 2026,
    sections: ["Today's Plan","Goals","Habits","Notes","Ideas","Projects","Contacts"],
    priceLow: 29,  priceHigh: 39,
    themes: ["hs_theme_warm_earth"],
    packs: ["hs_pack_we_essentials","hs_pack_we_time"],
    inserts: ["hs_ins_project_page","hs_ins_brain_dump","hs_ins_contacts"],
    products: [],
    binding: { type: "discs" as const, finish: "gold" as const },
    revisionOf: null,
  },
  // ── 2. Draft 2027 — shows the "create next year" carry-forward flow ────────
  {
    id: "hs_ed_2027_daily",
    name: "2027 Daily · Warm Earth",
    status: "draft",  tier: "advanced",  productType: "planner",  year: 2027,
    sections: ["Today's Plan","Goals","Habits","Notes","Ideas","Projects","Contacts"],
    priceLow: 29,  priceHigh: 39,
    themes: ["hs_theme_warm_earth"],
    packs: ["hs_pack_we_essentials","hs_pack_we_time"],
    inserts: ["hs_ins_project_page","hs_ins_brain_dump","hs_ins_contacts"],
    products: [],
    binding: { type: "discs" as const, finish: "gold" as const },
    revisionOf: "hs_ed_2026_daily",  // ← carry-forward reference
  },
  // ── 3. Draft seasonal ──────────────────────────────────────────────────────
  {
    id: "hs_ed_xmas_2026",
    name: "Vintage Christmas Planner 2026",
    status: "draft",  tier: "advanced",  productType: "planner",  year: 2026,
    sections: ["Gift List","December Daily","Holiday Menu","Events & Gatherings","Cards Sent"],
    priceLow: 24,  priceHigh: 34,
    themes: ["hs_theme_xmas"],
    packs: ["hs_pack_holly_berry","hs_pack_kraft_labels"],
    inserts: ["hs_ins_dec_daily","hs_ins_gift_tracker","hs_ins_menu_planner"],
    products: [],
    binding: { type: "coil" as const, finish: "gold" as const },
    revisionOf: null,
  },
  // ── 4. Undated botanical planner ───────────────────────────────────────────
  {
    id: "hs_ed_botanicals",
    name: "Botanicals Undated Planner",
    status: "draft",  tier: "basic",  productType: "planner",  year: null,
    sections: ["Daily Intentions","Garden Notes","Meal Planning","Gratitude","Ideas"],
    priceLow: 19,  priceHigh: 27,
    themes: ["hs_theme_botanicals"],
    packs: ["hs_pack_pressed_botanicals"],
    inserts: ["hs_ins_meal_grid","hs_ins_recipe_card"],
    products: [],
    binding: { type: "twin-loop" as const, finish: "silver" as const },
    revisionOf: null,
  },
  // ── 5. Notebook — exercises non-planner recipe path ────────────────────────
  {
    id: "hs_ed_notebook",
    name: "Warm Earth Notebook",
    status: "draft",  tier: "basic",  productType: "notebook" as const,  year: null,
    sections: [],
    priceLow: 12,  priceHigh: 18,
    themes: ["hs_theme_warm_earth"],
    packs: [],
    inserts: [],
    products: [],
    binding: { type: "coil" as const, finish: "silver" as const },
    revisionOf: null,
  },
  // ── 6. Journal — exercises journal recipe path ─────────────────────────────
  {
    id: "hs_ed_journal",
    name: "Botanicals Dot Journal",
    status: "draft",  tier: "basic",  productType: "journal" as const,  year: null,
    sections: [],
    priceLow: 14,  priceHigh: 22,
    themes: ["hs_theme_botanicals"],
    packs: ["hs_pack_pressed_botanicals"],
    inserts: [],
    products: [],
    binding: { type: "discs" as const, finish: "silver" as const },
    revisionOf: null,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("🏠  Seeding house store (Pixel Perfect Plans) dogfood data…\n");

  // ── Resolve owner user ID (may differ from "u-owner" in live DB) ────────────
  const ownerLookup = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1 LIMIT 1",
    ["owner@daybook.app"],
  );
  const ownerUserId = ownerLookup.rows[0]?.id ?? "u-owner";

  // ── 1. Ensure core fonts exist (idempotent — safe to re-run alongside seed-theme-assets) ─
  console.log("📝  Fonts (ensuring core families exist)…");
  const CORE_FONTS = [
    { id: "font_playfair_display", familyName: "Playfair Display",
      variants: [{ weight: "400" }, { weight: "700" }, { weight: "400", style: "italic" as const }],
      curatedPairings: [{ role: "heading" as const, family: "Playfair Display", weight: "700" }] },
    { id: "font_lora", familyName: "Lora",
      variants: [{ weight: "400" }, { weight: "700" }, { weight: "400", style: "italic" as const }],
      curatedPairings: [{ role: "heading" as const, family: "Lora", weight: "700" }, { role: "body" as const, family: "Lora", weight: "400" }] },
    { id: "font_dm_serif", familyName: "DM Serif Display",
      variants: [{ weight: "400" }, { weight: "400", style: "italic" as const }],
      curatedPairings: [{ role: "heading" as const, family: "DM Serif Display", weight: "400" }] },
    { id: "font_cormorant", familyName: "Cormorant Garamond",
      variants: [{ weight: "400" }, { weight: "600" }, { weight: "400", style: "italic" as const }],
      curatedPairings: [{ role: "accent" as const, family: "Cormorant Garamond", weight: "400" }] },
    { id: "font_libre_baskerville", familyName: "Libre Baskerville",
      variants: [{ weight: "400" }, { weight: "700" }],
      curatedPairings: [{ role: "body" as const, family: "Libre Baskerville", weight: "400" }] },
  ];
  for (const f of CORE_FONTS) {
    await db.insert(fontsTable).values({ ...f, status: "live", globalAvailable: true, origin: "licensed" })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${CORE_FONTS.length} core font families ensured`);

  // ── 2. Palettes ─────────────────────────────────────────────────────────────
  console.log("\n🎨  Palettes…");
  await db.insert(palettesTable)
    .values(PALETTE_DEFS.map(({ isPrimary: _, ...p }) => ({
      ...p,
      status: "live",
      globalAvailable: false,
      origin: "owned" as const,
      authoredByStoreId: STORE,
    })))
    .onConflictDoNothing();
  console.log(`  ✓ ${PALETTE_DEFS.length} palettes`);

  // ── 3. Backgrounds ──────────────────────────────────────────────────────────
  console.log("\n🖼️   Backgrounds…");
  await db.insert(backgroundsTable)
    .values(BACKGROUND_DEFS.map(b => ({
      ...b,
      status: "live",
      globalAvailable: false,
      origin: "owned" as const,
      authoredByStoreId: STORE,
    })))
    .onConflictDoNothing();
  console.log(`  ✓ ${BACKGROUND_DEFS.length} backgrounds`);

  // ── 4. Inserts ──────────────────────────────────────────────────────────────
  console.log("\n📄  Inserts…");
  await db.insert(insertsTable)
    .values(INSERT_DEFS.map(ins => ({
      ...ins,
      planners: ["all"],
      status: "live",
      globalAvailable: false,
      origin: "owned" as const,
      authoredByStoreId: STORE,
    })))
    .onConflictDoNothing();
  console.log(`  ✓ ${INSERT_DEFS.length} inserts`);

  // ── 5. Widgets ──────────────────────────────────────────────────────────────
  console.log("\n🧩  Widgets…");
  await db.insert(widgetsTable)
    .values(WIDGET_DEFS.map(w => ({
      id: w.id,
      name: w.name,
      storeId: STORE,
      sizeVariants: w.sizeVariants,
      svgData: w.svgData,
      paletteSlots: w.paletteSlots,
      status: "live",
      origin: "owned" as const,
      authoredByStoreId: STORE,
    })))
    .onConflictDoNothing();
  console.log(`  ✓ ${WIDGET_DEFS.length} widgets`);

  // ── 6. Sticker packs (shells first, stickers linked after) ──────────────────
  console.log("\n📦  Sticker packs…");
  await db.insert(stickerPacksTable)
    .values(PACK_DEFS.map(p => ({
      id: p.id,
      name: p.name,
      tags: p.tags,
      price: 0,
      status: "live",
      globalAvailable: false,
      origin: "owned" as const,
      authoredByStoreId: STORE,
      planners: ["all"],
    })))
    .onConflictDoNothing();
  console.log(`  ✓ ${PACK_DEFS.length} packs`);

  // ── 7. Stickers (SVG → PNG via sharp) ───────────────────────────────────────
  console.log("\n🎀  Stickers (rendering PNGs)…");
  let stickerCount = 0;
  for (const def of ALL_STICKER_DEFS) {
    const processedImageData = await svgToPng(def.svg);
    await db.insert(stickersLibraryTable)
      .values({
        id: def.id,
        name: def.name,
        tags: def.tags,
        functionType: def.functionType,
        status: "live",
        origin: "owned" as const,
        authoredByStoreId: STORE,
        borderStyle: "none",
        sizeInMm: 25,
        exportTargets: { goodnotes: true, ink: true, cricut: false },
        generationType: def.setId ? "text-set" : "functional-svg",
        sourceType: "generated-svg",
        shadowStyle: def.shadowStyle ?? "flat",
        shadowLiftPx: def.shadowLiftPx ?? 0,
        setId: def.setId ?? null,
        setLabel: def.setLabel ?? null,
        processedImageData,
        cutlineSvg: null,
      })
      .onConflictDoNothing();
    stickerCount++;
    if (stickerCount % 10 === 0) process.stdout.write(`  ${stickerCount}/${ALL_STICKER_DEFS.length}…\r`);
  }
  console.log(`\n  ✓ ${stickerCount} stickers rendered`);

  // ── 8. Pack ↔ sticker links ──────────────────────────────────────────────────
  console.log("\n🔗  Linking stickers to packs…");
  let linkCount = 0;
  for (const pack of PACK_DEFS) {
    for (let pos = 0; pos < pack.stickerIds.length; pos++) {
      await db.insert(packStickersTable)
        .values({ packId: pack.id, stickerId: pack.stickerIds[pos], position: pos })
        .onConflictDoNothing();
      linkCount++;
    }
  }
  console.log(`  ✓ ${linkCount} pack↔sticker links`);

  // ── 9. Themes ────────────────────────────────────────────────────────────────
  console.log("\n🎨  Themes…");
  await db.insert(themesTable)
    .values(THEME_DEFS.map(t => ({
      id: t.id,
      name: t.name,
      desc: t.desc,
      colors: t.colors,
      price: 0,
      status: t.status,
      createdBy: "seed",
      globalAvailable: false,
      origin: "owned" as const,
      authoredByStoreId: STORE,
      fontPairing: t.fontPairing,
    })))
    .onConflictDoNothing();
  console.log(`  ✓ ${THEME_DEFS.length} themes`);

  // ── 10. Theme bundle join tables ────────────────────────────────────────────
  console.log("\n🔗  Theme bundle linkages…");
  for (const theme of THEME_DEFS) {
    // Palettes
    for (let pos = 0; pos < theme.paletteIds.length; pos++) {
      await db.insert(themePalettesTable)
        .values({ themeId: theme.id, paletteId: theme.paletteIds[pos], position: pos,
                  isPrimary: theme.paletteIds[pos] === theme.primaryPaletteId })
        .onConflictDoNothing();
    }
    // Backgrounds
    for (let pos = 0; pos < theme.backgroundIds.length; pos++) {
      await db.insert(themeBackgroundsTable)
        .values({ themeId: theme.id, backgroundId: theme.backgroundIds[pos], position: pos })
        .onConflictDoNothing();
    }
    // Packs
    for (let pos = 0; pos < theme.packIds.length; pos++) {
      await db.insert(themePacksTable)
        .values({ themeId: theme.id, packId: theme.packIds[pos], position: pos })
        .onConflictDoNothing();
    }
    // Inserts (functional/seasonal)
    for (let pos = 0; pos < theme.insertIds.length; pos++) {
      await db.insert(themeInsertsTable)
        .values({ themeId: theme.id, insertId: theme.insertIds[pos], position: pos })
        .onConflictDoNothing();
    }
    // Cover art
    if (theme.coverInsertId) {
      await db.insert(themeCoversTable)
        .values({ themeId: theme.id, insertId: theme.coverInsertId, position: 0 })
        .onConflictDoNothing();
    }
    // Hardware
    if (theme.hardwareId) {
      await db.insert(themeHardwareTable)
        .values({ themeId: theme.id, hardwareId: theme.hardwareId, position: 0 })
        .onConflictDoNothing();
    }
    // Accessories
    if (theme.accessoryId) {
      await db.insert(themeAccessoriesTable)
        .values({ themeId: theme.id, accessoryId: theme.accessoryId, position: 0 })
        .onConflictDoNothing();
    }
    // Fonts
    for (let pos = 0; pos < theme.fontIds.length; pos++) {
      await db.insert(themeFontsTable)
        .values({ themeId: theme.id, fontId: theme.fontIds[pos], position: pos })
        .onConflictDoNothing();
    }
  }
  console.log("  ✓ theme_palettes, theme_backgrounds, theme_packs, theme_inserts, theme_covers, theme_hardware, theme_accessories, theme_fonts");

  // ── 11. Editions ─────────────────────────────────────────────────────────────
  console.log("\n📚  Editions…");
  const defaultArt = { cover: null, first: null, divider: null, weekly: null, daily: null, notes: null };
  await db.insert(editionsTable)
    .values(EDITION_DEFS.map(e => ({
      id: e.id,
      name: e.name,
      status: e.status,
      tier: e.tier,
      productType: e.productType as "planner" | "notebook" | "journal" | "memory-keeping",
      year: e.year ?? undefined,
      sections: e.sections,
      priceLow: e.priceLow,
      priceHigh: e.priceHigh,
      themes: e.themes,
      packs: e.packs,
      inserts: e.inserts,
      products: e.products,
      binding: e.binding,
      revisionOf: e.revisionOf ?? null,
      art: defaultArt,
      globalAvailable: false,
      origin: "owned" as const,
      authoredByStoreId: STORE,
    })))
    .onConflictDoNothing();
  console.log(`  ✓ ${EDITION_DEFS.length} editions  (1 live, 5 draft — incl. notebook + journal)`);

  // ── 12. Planner config for published 2026 Daily ──────────────────────────────
  //   drive.pdfFileId is a seeded placeholder — real PDF is generated via studio.
  //   The "Next year" carry-forward path only needs the live edition row + this config.
  console.log("\n📋  Planner config (published 2026 Daily)…");
  await db.insert(plannerConfigsTable)
    .values({
      id: "hs_cfg_2026_daily",
      userId: ownerUserId,
      storeId: STORE,
      editionId: "hs_ed_2026_daily",
      year: 2026,
      productType: "planner",
      setup: { weekStart: "mon", orientation: "vertical", startMonth: 0, startYear: 2026, monthCount: 12, datingMode: "dated" },
      style: {
        themeId: "hs_theme_warm_earth",
        paletteId: "hs_pal_we_classic",
        backgroundId: "hs_bg_we_linen",
        size: "A5",
        tabPos: "right",
        tabShape: "rounded",
        paperColour: "cream",
        renderStyle: "flat",
        binding: { type: "discs", finish: "gold" },
        coverType: "texture",
        coverTitle: "2026",
        coverSubtitle: "Warm Earth Planner",
        coverYear: 2026,
        sections: ["Today's Plan","Goals","Habits","Notes","Ideas","Projects","Contacts"],
      },
      output: { calMode: "link", eventMins: 60, aiInPdf: false },
      drive: {
        folderId: "hs_seed_folder_2026_warm_earth",
        pdfFileId: "hs_seed_pdf_2026_daily_warm_earth",
        configFileId: "hs_seed_cfg_json_2026_daily",
      },
      generatedAt: new Date("2025-11-01T10:00:00Z"),
    })
    .onConflictDoNothing();
  console.log("  ✓ planner config hs_cfg_2026_daily  (drive.pdfFileId = hs_seed_pdf_2026_daily_warm_earth)");
  console.log("  ℹ  Seeded Drive reference is a placeholder. Run generation in Planner Studio to create a real PDF.");

  // ── 13. Orders against the published edition ─────────────────────────────────
  console.log("\n🛒  Orders…");
  const ORDER_SEEDS = [
    { id: "hs_ord_001", email: "sarah.chen@example.com",   name: "Sarah Chen",     cents: 3400, date: "2025-11-03T14:22:00Z" },
    { id: "hs_ord_002", email: "tom.wright@example.com",   name: "Tom Wright",     cents: 2900, date: "2025-11-08T09:45:00Z" },
    { id: "hs_ord_003", email: "amara.osei@example.com",   name: "Amara Osei",     cents: 3900, date: "2025-11-15T16:30:00Z" },
    { id: "hs_ord_004", email: "lia.rosenberg@example.com",name: "Lia Rosenberg",  cents: 2900, date: "2025-11-22T11:10:00Z" },
    { id: "hs_ord_005", email: "kai.yamamoto@example.com", name: "Kai Yamamoto",   cents: 3400, date: "2025-11-29T20:05:00Z" },
  ];
  for (const o of ORDER_SEEDS) {
    await db.insert(ordersTable)
      .values({
        id: o.id,
        storeId: STORE,
        buyerEmail: o.email,
        buyerName: o.name,
        items: [{ name: "2026 Daily · Warm Earth", priceCents: o.cents }],
        totalCents: o.cents,
        currency: "usd",
        downloadLinks: [{ name: "2026 Daily · Warm Earth.pdf", url: `https://dl.daybook.app/hs_seed_pdf_2026_daily_warm_earth` }],
        receiptSentAt: new Date(o.date),
        createdAt: new Date(o.date),
      })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${ORDER_SEEDS.length} orders`);

  // ── 14. Support tickets ──────────────────────────────────────────────────────
  //   Mix of statuses to populate the inbox, patterns view, and article backlog.
  console.log("\n🎫  Support tickets…");

  const TICKET_SEEDS = [
    // open — needs reply
    {
      id: "hs_tkt_001", status: "open", area: "building-planner",
      recipientScope: "platform", reporterRole: "store_owner",
      body: "I'm trying to start from a theme in Product Builder but the Step 2 payoff panel shows no sections. Is this expected when the edition has no inserts yet?",
      closeReason: null, closeNote: null,
    },
    // replied — in progress
    {
      id: "hs_tkt_002", status: "replied", area: "exported-pdf",
      recipientScope: "platform", reporterRole: "store_owner",
      body: "The ink-friendly export is downloading but some of the tab labels on the right rail are cut off. Happens consistently on A5 landscape.",
      closeReason: null, closeNote: null,
    },
    // open (store scope — buyer filed against house store)
    {
      id: "hs_tkt_003", status: "open", area: "opening-planner",
      recipientScope: STORE, reporterRole: "buyer",
      body: "I downloaded my 2026 Daily planner but the links on the week-at-a-glance pages don't work in PDF Expert. They work in GoodNotes but not PDF Expert.",
      closeReason: null, closeNote: null,
    },
    // fixed — waiting confirmation
    {
      id: "hs_tkt_004", status: "fixed", area: "drive-sync",
      recipientScope: "platform", reporterRole: "store_owner",
      body: "After the regeneration the Drive folder wasn't updated — the old PDF was still there and the new one had a different file ID.",
      closeReason: null, closeNote: null,
    },
    // closed — answered, article existed
    {
      id: "hs_tkt_005", status: "closed", area: "exported-pdf",
      recipientScope: "platform", reporterRole: "store_owner",
      body: "How do I add a custom font to my exported planner? I want to use a font I purchased.",
      closeReason: "answered_article_existed",
      closeNote: "Pointed to Font Bundle Coverage article — user confirmed resolved.",
    },
    // closed — answered, NO article yet (populates the article backlog cluster)
    {
      id: "hs_tkt_006", status: "closed", area: "opening-planner",
      recipientScope: STORE, reporterRole: "buyer",
      body: "The planner works fine in GoodNotes and Notability but crashes Xodo on Android. Is there a version compatible with Xodo?",
      closeReason: "answered_no_article",
      closeNote: "Advised to use GoodNotes or Notability. No Xodo compatibility article exists yet.",
    },
  ];

  const now = new Date();
  for (const t of TICKET_SEEDS) {
    await db.insert(ticketsTable)
      .values({
        id: t.id,
        reporterRole: t.reporterRole,
        recipientScope: t.recipientScope,
        storeId: STORE,
        area: t.area,
        symptoms: [],
        body: t.body,
        screenshotRefs: [],
        diagnostics: { seeded: true },
        status: t.status,
        closeReason: t.closeReason,
        closeNote: t.closeNote,
        closedAt: t.closeReason ? new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) : null,
        createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${TICKET_SEEDS.length} tickets`);

  // Replies on tickets 001, 002, 004 so threads have content
  const REPLY_SEEDS = [
    { ticketId: "hs_tkt_001", role: "super_admin", body: "Thanks for reporting. The payoff panel only surfaces inserts that have a matching recipe section type. If your recipe has no insert-type sections yet, the panel shows empty. Try linking at least one insert in the edition settings first, then re-enter Step 2." },
    { ticketId: "hs_tkt_002", role: "super_admin", body: "Confirmed on A5 landscape — the tab label truncation is a known issue when the page left margin and the tab rail overlap. A fix is staged for the next build." },
    { ticketId: "hs_tkt_002", role: "store_owner", body: "Thanks! Is there a workaround in the meantime? Can I reduce the number of tabs or widen the margin?" },
    { ticketId: "hs_tkt_004", role: "super_admin", body: "The new Drive regeneration path now updates the existing file in-place rather than creating a new one with a different ID. Please regenerate and confirm the folder is updated." },
  ];
  for (const r of REPLY_SEEDS) {
    await db.insert(ticketRepliesTable)
      .values({ ticketId: r.ticketId, authorRole: r.role, body: r.body })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${REPLY_SEEDS.length} ticket replies`);

  // ── 15. Store catalog registrations ─────────────────────────────────────────
  console.log("\n📋  Store catalog registrations…");
  const CATALOG_ENTRIES: { itemType: string; itemId: string }[] = [
    ...THEME_DEFS.map(t => ({ itemType: "theme",   itemId: t.id })),
    ...PACK_DEFS.map(p  => ({ itemType: "pack",    itemId: p.id })),
    ...INSERT_DEFS.map(i=> ({ itemType: "insert",  itemId: i.id })),
    ...EDITION_DEFS.map(e=>({ itemType: "edition", itemId: e.id })),
  ];
  for (const entry of CATALOG_ENTRIES) {
    await db.insert(storeCatalogTable)
      .values({ storeId: STORE, ...entry })
      .onConflictDoNothing();
  }
  console.log(`  ✓ ${CATALOG_ENTRIES.length} store_catalog entries`);

  // ── Row count summary ────────────────────────────────────────────────────────
  type CountRow = { count: string };
  const counts = await Promise.all([
    pool.query<CountRow>("SELECT count(*) FROM palettes WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM backgrounds WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM inserts WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM widgets WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM themes WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM sticker_packs WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM stickers_library WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM pack_stickers WHERE pack_id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM editions WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM planner_configs WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM orders WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM tickets WHERE id LIKE 'hs_%'"),
    pool.query<CountRow>("SELECT count(*) FROM store_catalog WHERE store_id = 'store-house' AND item_id LIKE 'hs_%'"),
  ]);

  const labels = ["palettes","backgrounds","inserts","widgets","themes",
                  "sticker_packs","stickers_library","pack_stickers","editions",
                  "planner_configs","orders","tickets","store_catalog"];
  console.log("\n📊  Row counts after seed:");
  labels.forEach((label, i) => {
    console.log(`   ${label.padEnd(20)} ${counts[i].rows[0].count}`);
  });

  // Carry-forward check
  const cfCheck = await pool.query<{ id: string; name: string; status: string }>(
    "SELECT id, name, status FROM editions WHERE id = 'hs_ed_2026_daily' AND authored_by_store_id = 'store-house'",
  );
  console.log("\n✅  Carry-forward path check:");
  if (cfCheck.rows.length > 0) {
    const ed = cfCheck.rows[0];
    console.log(`   hs_ed_2026_daily  (${ed.name})  status=${ed.status}  ← Product Builder "Next year" path will find this.`);
  } else {
    console.log("   ⚠️  hs_ed_2026_daily not found — something went wrong.");
  }

  console.log("\n🏁  House store seed complete.\n");
  process.exit(0);
}

main().catch(err => {
  console.error("\n❌  Seed failed:", err);
  process.exit(1);
});
