import { db } from "@workspace/db";
import {
  usersTable,
  themesTable,
  stickerPacksTable,
  insertsTable,
  relatedProductsTable,
  editionsTable,
  plansTable,
  aiSettingsTable,
  syncStatusTable,
  editionStickerPacksTable,
  editionInsertsTable,
  editionProductsTable,
  editionPlansTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding Daybook catalog…");

  // ── OWNER USER ──────────────────────────────────────────────────────────────
  const ownerEmail = process.env.OWNER_EMAIL ?? "owner@daybook.app";
  const ownerPassword = process.env.OWNER_PASSWORD ?? "daybook-owner-2025";
  const passwordHash = await bcrypt.hash(ownerPassword, 10);

  const [owner] = await db
    .insert(usersTable)
    .values({ email: ownerEmail, name: "Daybook Owner", role: "owner", passwordHash })
    .onConflictDoNothing()
    .returning();

  if (owner) {
    await db.insert(aiSettingsTable).values({ userId: owner.id, enabled: true, provider: "claude" }).onConflictDoNothing();
    await db.insert(syncStatusTable).values({ userId: owner.id, connected: false }).onConflictDoNothing();
    console.log(`Owner: ${ownerEmail} / ${ownerPassword}`);
  }

  // ── 6 THEMES ─────────────────────────────────────────────────────────────────
  const themes = await db
    .insert(themesTable)
    .values([
      { name: "Autumn Botanicals", slug: "autumn-botanicals", description: "Warm terracotta, sage, and gold tones inspired by pressed botanicals and autumn leaves.", status: "live", category: "seasonal", coverColor: "#C4704A", accentColor: "#D4A853", palette: { primary: "#C4704A", secondary: "#7A9E7E", accent: "#D4A853", background: "#FAF3E8", text: "#2C1810" }, previewImageUrl: null },
      { name: "Midnight Studio", slug: "midnight-studio", description: "Deep navy and charcoal with electric purple accents — built for night-owl creatives.", status: "live", category: "dark", coverColor: "#1A1B2E", accentColor: "#7B5EA7", palette: { primary: "#1A1B2E", secondary: "#16213E", accent: "#7B5EA7", background: "#0F0E17", text: "#FFFFFE" }, previewImageUrl: null },
      { name: "Cherry Blossom", slug: "cherry-blossom", description: "Soft pinks and whites with delicate sakura motifs for a serene, Japanese-inspired planner.", status: "live", category: "floral", coverColor: "#F2B5D4", accentColor: "#D4769A", palette: { primary: "#F2B5D4", secondary: "#FADADD", accent: "#D4769A", background: "#FFFAF9", text: "#3D2433" }, previewImageUrl: null },
      { name: "Desert Minimalist", slug: "desert-minimalist", description: "Warm sand, rust, and clay with a clean, editorial layout inspired by Southwestern design.", status: "live", category: "minimal", coverColor: "#C9A882", accentColor: "#8B4513", palette: { primary: "#C9A882", secondary: "#E8D5B7", accent: "#8B4513", background: "#FAF7F2", text: "#2D1B0E" }, previewImageUrl: null },
      { name: "Neon Dreams", slug: "neon-dreams", description: "Bold cyberpunk palette: hot pink, electric blue, and acid green on deep black.", status: "draft", category: "bold", coverColor: "#0D0D0D", accentColor: "#FF0080", palette: { primary: "#FF0080", secondary: "#00FFFF", accent: "#39FF14", background: "#0D0D0D", text: "#FFFFFF" }, previewImageUrl: null },
      { name: "Sage & Linen", slug: "sage-linen", description: "Understated sage greens and natural linen tones for a calm, Scandinavian-inspired aesthetic.", status: "live", category: "neutral", coverColor: "#B7C9B0", accentColor: "#7D9B76", palette: { primary: "#B7C9B0", secondary: "#D4C5A9", accent: "#7D9B76", background: "#F7F5F0", text: "#2C3A2A" }, previewImageUrl: null },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`Themes: ${themes.length} seeded`);

  // ── 3 STICKER PACKS ──────────────────────────────────────────────────────────
  const packs = await db
    .insert(stickerPacksTable)
    .values([
      { name: "Daily Essentials", slug: "daily-essentials", description: "Functional icons for tasks, habits, meals, workouts, and mood tracking.", status: "live", category: "functional", stickerCount: 40, previewImageUrl: null },
      { name: "Botanical Washi", slug: "botanical-washi", description: "Decorative botanical strips and corner pieces inspired by traditional washi tape patterns.", status: "live", category: "decorative", stickerCount: 24, previewImageUrl: null },
      { name: "Kawaii Study", slug: "kawaii-study", description: "Cute study-themed stickers: books, pencils, coffee cups, and motivational stamps.", status: "draft", category: "kawaii", stickerCount: 32, previewImageUrl: null },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`Sticker packs: ${packs.length} seeded`);

  // ── 6 INSERTS ────────────────────────────────────────────────────────────────
  const inserts = await db
    .insert(insertsTable)
    .values([
      { name: "Reading Log", slug: "reading-log", description: "Track books with title, author, start/finish dates, and a 5-star rating.", status: "live", category: "tracker", isTransparent: true },
      { name: "Mood Wheel", slug: "mood-wheel", description: "A color-coded circular mood tracker for monthly visualization.", status: "live", category: "wellness", isTransparent: true },
      { name: "Habit Grid", slug: "habit-grid", description: "31-day habit tracking grid with space for up to 8 habits.", status: "live", category: "tracker", isTransparent: true },
      { name: "Expense Log", slug: "expense-log", description: "Simple weekly expense tracker with category columns and totals.", status: "live", category: "finance", isTransparent: true },
      { name: "Project Kanban", slug: "project-kanban", description: "Three-column kanban board (To Do / In Progress / Done) with sticky note shapes.", status: "live", category: "productivity", isTransparent: true },
      { name: "Gratitude Lines", slug: "gratitude-lines", description: "Daily gratitude prompts with space for three entries and a reflection section.", status: "draft", category: "wellness", isTransparent: true },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`Inserts: ${inserts.length} seeded`);

  // ── 4 RELATED PRODUCTS ───────────────────────────────────────────────────────
  const products = await db
    .insert(relatedProductsTable)
    .values([
      { name: "Daily Notes Companion", slug: "daily-notes-companion", description: "Pure notes-only companion notebook with dotted, lined, and blank pages.", status: "live", type: "notes-only", price: 9.99 },
      { name: "Master To-Do Book", slug: "master-todo-book", description: "Comprehensive task management notebook with projects, priorities, and daily lists.", status: "live", type: "to-do", price: 9.99 },
      { name: "Habit & Goal Tracker", slug: "habit-goal-tracker", description: "Year-long tracker for habits, goals, and quarterly reviews.", status: "live", type: "tracker", price: 12.99 },
      { name: "Brain Dump Journal", slug: "brain-dump-journal", description: "Freeform mixed journal combining notes, tasks, and reflection spreads.", status: "live", type: "mixed", price: 11.99 },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`Products: ${products.length} seeded`);

  // ── 2 PLANS ──────────────────────────────────────────────────────────────────
  const plans = await db
    .insert(plansTable)
    .values([
      {
        name: "Daybook Basic", slug: "daybook-basic", description: "PDF-only planner generation with core themes and functionality.",
        status: "live", tier: "basic", oneTimePrice: 19.99, yearlyPrice: 14.99, lifetimePrice: 49.99,
        features: { pdfGeneration: true, coreThemes: true, googleDriveBackup: true, liveSync: false, aiAssistant: false },
      },
      {
        name: "Daybook Advanced", slug: "daybook-advanced", description: "Full platform access: live sync, AI assistant, all themes and packs, priority support.",
        status: "live", tier: "advanced", oneTimePrice: 39.99, yearlyPrice: 29.99, lifetimePrice: 99.99,
        features: { pdfGeneration: true, coreThemes: true, allThemes: true, googleDriveBackup: true, liveSync: true, aiAssistant: true, googleCalendarSync: true, googleTasksSync: true, prioritySupport: true },
      },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`Plans: ${plans.length} seeded`);

  // ── 4 EDITIONS ───────────────────────────────────────────────────────────────
  const themeMap = Object.fromEntries(themes.map((t) => [t.slug, t.id]));
  const packMap = Object.fromEntries(packs.map((p) => [p.slug, p.id]));
  const insertMap = Object.fromEntries(inserts.map((i) => [i.slug, i.id]));
  const productMap = Object.fromEntries(products.map((p) => [p.slug, p.id]));
  const planMap = Object.fromEntries(plans.map((p) => [p.slug, p.id]));

  const editions = await db
    .insert(editionsTable)
    .values([
      {
        name: "Core Planner 2025", slug: "core-planner-2025",
        description: "The essential Daybook planner: full year coverage, all core layouts, and a beautiful default theme.",
        status: "live", tier: "basic",
        themeId: themeMap["sage-linen"] ?? null,
        oneTimePrice: 19.99, yearlyPrice: 14.99, lifetimePrice: 49.99,
      },
      {
        name: "Autumn Edition 2025", slug: "autumn-edition-2025",
        description: "Cozy autumn aesthetics with botanical decorations, habit trackers, and seasonal mood wheels.",
        status: "live", tier: "advanced",
        themeId: themeMap["autumn-botanicals"] ?? null,
        oneTimePrice: 34.99, yearlyPrice: 24.99, lifetimePrice: 79.99,
      },
      {
        name: "Night Owl Studio", slug: "night-owl-studio",
        description: "Dark mode everything. Midnight Studio theme with creative tracking inserts for makers.",
        status: "live", tier: "advanced",
        themeId: themeMap["midnight-studio"] ?? null,
        oneTimePrice: 34.99, yearlyPrice: 24.99, lifetimePrice: 79.99,
      },
      {
        name: "Minimalist Essentials", slug: "minimalist-essentials",
        description: "Desert Minimalist theme stripped to essentials: daily pages, weekly spreads, and nothing more.",
        status: "draft", tier: "basic",
        themeId: themeMap["desert-minimalist"] ?? null,
        oneTimePrice: 19.99, yearlyPrice: 14.99, lifetimePrice: 49.99,
      },
    ])
    .onConflictDoNothing()
    .returning();
  console.log(`Editions: ${editions.length} seeded`);

  // Wire up edition relations
  if (editions.length > 0 && packs.length > 0 && inserts.length > 0) {
    const e = editions[0]; // Core Planner
    const e1 = editions[1]; // Autumn Edition
    const e2 = editions[2]; // Night Owl
    const e3 = editions[3]; // Minimalist

    const relations = [
      // Core Planner
      ...(packMap["daily-essentials"] && e ? [{ editionId: e.id, stickerPackId: packMap["daily-essentials"] }] : []),
      ...(insertMap["habit-grid"] && e ? [{ editionId: e.id, insertId: insertMap["habit-grid"] }] : []),
      ...(planMap["daybook-basic"] && e ? [{ editionId: e.id, planId: planMap["daybook-basic"] }] : []),
      // Autumn Edition
      ...(packMap["botanical-washi"] && e1 ? [{ editionId: e1.id, stickerPackId: packMap["botanical-washi"] }] : []),
      ...(insertMap["mood-wheel"] && e1 ? [{ editionId: e1.id, insertId: insertMap["mood-wheel"] }] : []),
      ...(insertMap["reading-log"] && e1 ? [{ editionId: e1.id, insertId: insertMap["reading-log"] }] : []),
      ...(planMap["daybook-advanced"] && e1 ? [{ editionId: e1.id, planId: planMap["daybook-advanced"] }] : []),
      // Night Owl
      ...(packMap["daily-essentials"] && e2 ? [{ editionId: e2.id, stickerPackId: packMap["daily-essentials"] }] : []),
      ...(insertMap["project-kanban"] && e2 ? [{ editionId: e2.id, insertId: insertMap["project-kanban"] }] : []),
      ...(planMap["daybook-advanced"] && e2 ? [{ editionId: e2.id, planId: planMap["daybook-advanced"] }] : []),
      // Minimalist
      ...(insertMap["expense-log"] && e3 ? [{ editionId: e3.id, insertId: insertMap["expense-log"] }] : []),
      ...(planMap["daybook-basic"] && e3 ? [{ editionId: e3.id, planId: planMap["daybook-basic"] }] : []),
    ];

    const packRelations = relations.filter((r): r is { editionId: number; stickerPackId: number } => "stickerPackId" in r);
    const insertRelations = relations.filter((r): r is { editionId: number; insertId: number } => "insertId" in r);
    const planRelations = relations.filter((r): r is { editionId: number; planId: number } => "planId" in r);

    if (packRelations.length > 0) await db.insert(editionStickerPacksTable).values(packRelations).onConflictDoNothing();
    if (insertRelations.length > 0) await db.insert(editionInsertsTable).values(insertRelations).onConflictDoNothing();
    if (planRelations.length > 0) await db.insert(editionPlansTable).values(planRelations).onConflictDoNothing();
  }

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
