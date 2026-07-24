/**
 * Starter sticker seed — inserts 8 platform starter stickers + 3 starter packs.
 *
 * Run: pnpm --filter @workspace/scripts run seed-stickers
 *
 * Idempotent: all inserts use onConflictDoNothing.
 * Stickers are generated as transparent PNGs via SVG → sharp → base64.
 * No background removal needed — SVGs use transparent backgrounds.
 */
import { db } from "@workspace/db";
import { stickersLibraryTable, stickerPacksTable, packStickersTable } from "@workspace/db";
import sharp from "sharp";

// ── SVG designs (512×512, transparent background) ─────────────────────────────

const STICKER_DEFS = [
  {
    id: "stk_starter_checkbox",
    name: "Checkbox",
    functionType: "checkbox",
    tags: ["check", "done", "todo", "task"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="56" y="56" width="400" height="400" rx="72" fill="#C87560"/>
      <rect x="100" y="100" width="312" height="312" rx="48" fill="#D9927F"/>
      <line x1="150" y1="256" x2="226" y2="340" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
      <line x1="226" y1="340" x2="370" y2="172" stroke="white" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    id: "stk_starter_flag",
    name: "Flag marker",
    functionType: "flag",
    tags: ["flag", "mark", "priority", "highlight"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="116" y="80" width="28" height="360" rx="10" fill="#5E8B6A"/>
      <polygon points="144,88 420,156 144,248" fill="#5E8B6A"/>
      <polygon points="144,92 408,156 144,244" fill="#7AAD88"/>
      <circle cx="116" cy="440" r="18" fill="#5E8B6A"/>
    </svg>`,
  },
  {
    id: "stk_starter_habit",
    name: "Habit tracker",
    functionType: "habit",
    tags: ["habit", "streak", "daily", "tracker", "grid"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <circle cx="128" cy="128" r="56" fill="#8B5E8B"/>
      <circle cx="256" cy="128" r="56" fill="#8B5E8B"/>
      <circle cx="384" cy="128" r="56" fill="#8B5E8B"/>
      <circle cx="128" cy="256" r="56" fill="#8B5E8B"/>
      <circle cx="256" cy="256" r="56" fill="#A87CB8"/>
      <circle cx="384" cy="256" r="56" fill="#8B5E8B"/>
      <circle cx="128" cy="384" r="56" fill="#8B5E8B"/>
      <circle cx="256" cy="384" r="56" fill="#8B5E8B"/>
      <circle cx="384" cy="384" r="56" fill="#8B5E8B"/>
    </svg>`,
  },
  {
    id: "stk_starter_timeblock",
    name: "Time block",
    functionType: "time-block",
    tags: ["time", "clock", "schedule", "block", "hour"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <circle cx="256" cy="256" r="228" fill="#3E7A8C"/>
      <circle cx="256" cy="256" r="188" fill="#EAF4F7"/>
      <rect x="244" y="92" width="24" height="136" rx="12" fill="#3E7A8C"/>
      <rect x="256" y="244" width="128" height="24" rx="12" fill="#3E7A8C"/>
      <circle cx="256" cy="256" r="20" fill="#3E7A8C"/>
      <circle cx="256" cy="72" r="12" fill="#3E7A8C"/>
      <circle cx="440" cy="256" r="12" fill="#3E7A8C"/>
      <circle cx="256" cy="440" r="12" fill="#3E7A8C"/>
      <circle cx="72" cy="256" r="12" fill="#3E7A8C"/>
    </svg>`,
  },
  {
    id: "stk_starter_tab",
    name: "Section tab",
    functionType: "tab",
    tags: ["tab", "section", "divider", "index", "label"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="64" y="192" width="384" height="280" rx="24" fill="#3E7A57"/>
      <rect x="64" y="168" width="192" height="60" rx="20" fill="#3E7A57"/>
      <rect x="80" y="184" width="160" height="48" rx="16" fill="#5A9E74"/>
      <rect x="80" y="220" width="368" height="232" rx="16" fill="#5A9E74"/>
    </svg>`,
  },
  {
    id: "stk_starter_date",
    name: "Date marker",
    functionType: "date",
    tags: ["date", "calendar", "day", "month", "schedule"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect x="52" y="100" width="408" height="368" rx="32" fill="#B85C3C"/>
      <rect x="52" y="100" width="408" height="112" rx="32" fill="#8F3E22"/>
      <rect x="52" y="168" width="408" height="44" fill="#8F3E22"/>
      <rect x="168" y="52" width="40" height="92" rx="16" fill="#8F3E22"/>
      <rect x="304" y="52" width="40" height="92" rx="16" fill="#8F3E22"/>
      <rect x="108" y="252" width="92" height="80" rx="12" fill="#D47050"/>
      <rect x="212" y="252" width="92" height="80" rx="12" fill="#D47050"/>
      <rect x="316" y="252" width="92" height="80" rx="12" fill="#D47050"/>
      <rect x="108" y="348" width="92" height="80" rx="12" fill="#D47050"/>
      <rect x="212" y="348" width="92" height="80" rx="12" fill="#D47050"/>
    </svg>`,
  },
  {
    id: "stk_starter_banner",
    name: "Banner label",
    functionType: "banner",
    tags: ["banner", "ribbon", "label", "heading", "title"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <polygon points="48,152 464,152 464,336 256,420 48,336" fill="#E07840"/>
      <polygon points="48,152 48,336 96,316 96,172" fill="#B85A28"/>
      <polygon points="464,152 464,336 416,316 416,172" fill="#B85A28"/>
      <polygon points="48,152 96,172 96,312 48,336" fill="#C4682E"/>
      <polygon points="464,152 416,172 416,312 464,336" fill="#C4682E"/>
      <rect x="108" y="200" width="296" height="104" rx="12" fill="#F09060" opacity="0.35"/>
    </svg>`,
  },
  {
    id: "stk_starter_decorative",
    name: "Floral accent",
    functionType: "decorative",
    tags: ["flower", "floral", "decorative", "accent", "art"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <ellipse cx="256" cy="148" rx="60" ry="116" fill="#7A4E8C"/>
      <ellipse cx="256" cy="148" rx="60" ry="116" fill="#7A4E8C" transform="rotate(45 256 256)"/>
      <ellipse cx="256" cy="148" rx="60" ry="116" fill="#7A4E8C" transform="rotate(90 256 256)"/>
      <ellipse cx="256" cy="148" rx="60" ry="116" fill="#7A4E8C" transform="rotate(135 256 256)"/>
      <circle cx="256" cy="256" r="72" fill="#A87EC0"/>
      <circle cx="256" cy="256" r="44" fill="#7A4E8C"/>
    </svg>`,
  },
] as const;

// ── Starter packs ──────────────────────────────────────────────────────────────

const STARTER_PACKS = [
  {
    id: "stkpk_s001",
    name: "Planner Essentials",
    tags: ["essentials", "starter"],
    // sticker ids in this pack:
    stickerIds: ["stk_starter_checkbox", "stk_starter_flag", "stk_starter_date"],
  },
  {
    id: "stkpk_s002",
    name: "Daily Rhythm",
    tags: ["daily", "routine", "starter"],
    stickerIds: ["stk_starter_habit", "stk_starter_timeblock", "stk_starter_tab"],
  },
  {
    id: "stkpk_s003",
    name: "Style & Accent",
    tags: ["decorative", "style", "starter"],
    stickerIds: ["stk_starter_banner", "stk_starter_decorative", "stk_starter_checkbox"],
  },
] as const;

// ── SVG → PNG helper ───────────────────────────────────────────────────────────

async function svgToPng(svgStr: string): Promise<Buffer> {
  try {
    return await sharp(Buffer.from(svgStr)).png().toBuffer();
  } catch (err) {
    // Fallback if librsvg is unavailable: create a plain colored 400×400 square.
    // The shape won't match the SVG design, but a valid PNG is still stored.
    console.warn("  ⚠️  SVG rendering unavailable, using fallback PNG:", (err as Error).message);
    const size = 400;
    return sharp({
      create: { width: size, height: size, channels: 4, background: { r: 150, g: 100, b: 180, alpha: 1 } },
    })
      .png()
      .toBuffer();
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎨 Seeding starter sticker library…");

  // 1. Generate PNGs and insert starter stickers
  for (const def of STICKER_DEFS) {
    process.stdout.write(`  Generating ${def.name}…`);
    const pngBuf = await svgToPng(def.svg);
    const processedImageData = `data:image/png;base64,${pngBuf.toString("base64")}`;

    await db
      .insert(stickersLibraryTable)
      .values({
        id: def.id,
        name: def.name,
        functionType: def.functionType,
        tags: [...def.tags],
        status: "live",
        origin: "starter",
        authoredByStoreId: null,
        borderStyle: "none",
        exportTargets: { goodnotes: true, ink: true, cricut: false },
        processedImageData,
        cutlineSvg: null,
      })
      .onConflictDoNothing();

    console.log(" ✓");
  }

  // 2. Insert starter packs
  console.log("\n📦 Creating starter packs…");
  for (const pack of STARTER_PACKS) {
    await db
      .insert(stickerPacksTable)
      .values({
        id: pack.id,
        name: pack.name,
        tags: [...pack.tags],
        price: 0,
        status: "live",
        origin: "starter",
        globalAvailable: true,
        authoredByStoreId: null,
        planners: ["all"],
      })
      .onConflictDoNothing();
    console.log(`  ✓ ${pack.name}`);
  }

  // 3. Link stickers to packs
  console.log("\n🔗 Linking stickers to packs…");
  for (const pack of STARTER_PACKS) {
    for (let i = 0; i < pack.stickerIds.length; i++) {
      await db
        .insert(packStickersTable)
        .values({ packId: pack.id, stickerId: pack.stickerIds[i], position: i })
        .onConflictDoNothing();
    }
    console.log(`  ✓ ${pack.name} → ${pack.stickerIds.length} sticker(s)`);
  }

  console.log("\n✅ Starter sticker seed complete.");
  process.exit(0);
}

main().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
