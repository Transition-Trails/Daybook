/**
 * Daybook seed — data matches spec/seed-data.json exactly
 * Run: pnpm --filter @workspace/scripts run seed
 */
import { db } from "@workspace/db";
import {
  themesTable,
  stickerPacksTable,
  insertsTable,
  relatedProductsTable,
  editionsTable,
  plansTable,
  usersTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";

const OWNER_EMAIL = "owner@daybook.app";
const OWNER_PASSWORD = "daybook-owner-2025";

async function main() {
  console.log("🌱 Seeding Daybook database…");

  // ── Plans ──────────────────────────────────────────────────────────────────
  await db
    .insert(plansTable)
    .values([
      {
        id: "yearly",
        name: "One-time + maintenance",
        description:
          "Pay once for the current year, then a small yearly fee to keep getting updates.",
        oneTimePrice: 49,
        yearlyPrice: 15,
      },
      {
        id: "lifetime",
        name: "Lifetime (all upgrades)",
        description:
          "One payment, every future upgrade included forever.",
        oneTimePrice: 149,
        yearlyPrice: null,
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ plans");

  // ── Themes ─────────────────────────────────────────────────────────────────
  // colors: [accent, accent-dark, secondary, tertiary, ink, paper]
  await db
    .insert(themesTable)
    .values([
      {
        id: "t1",
        name: "Terracotta",
        colors: ["#b75d3f", "#a04a30", "#c98a2b", "#7d8a6a", "#2c2822", "#f4efe6"],
        price: 0,
        status: "live",
        createdBy: "seed",
      },
      {
        id: "t2",
        name: "Sage Calm",
        colors: ["#5f7a5a", "#49624a", "#8a9a76", "#c2b280", "#2a322a", "#eef1e9"],
        price: 0,
        status: "live",
        createdBy: "seed",
      },
      {
        id: "t3",
        name: "Ocean",
        colors: ["#2f7d8c", "#1f5f6c", "#5f97a0", "#c98a2b", "#22333b", "#edf3f4"],
        price: 4,
        status: "draft",
        createdBy: "seed",
      },
      {
        id: "t4",
        name: "Sunrise",
        colors: ["#e07a4a", "#c25f30", "#f2c14e", "#8ab6a6", "#3a2e26", "#fcf3ea"],
        price: 4,
        status: "live",
        createdBy: "seed",
      },
      {
        id: "t5",
        name: "Plum",
        colors: ["#8a5a8f", "#6e4472", "#9a7aa0", "#c2a15e", "#2f2833", "#f3eef4"],
        price: 5,
        status: "draft",
        createdBy: "seed",
      },
      {
        id: "t6",
        name: "Forest",
        colors: ["#3f7a57", "#2f6045", "#6f9a7f", "#c98a2b", "#22302a", "#edf2ee"],
        price: 5,
        status: "draft",
        createdBy: "seed",
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ themes (6)");

  // ── Sticker Packs ──────────────────────────────────────────────────────────
  await db
    .insert(stickerPacksTable)
    .values([
      {
        id: "p1",
        name: "Seasonal Set",
        tags: ["spring", "summer", "fall", "winter"],
        price: 6,
        status: "live",
        planners: ["all"],
      },
      {
        id: "p2",
        name: "Productivity Icons",
        tags: ["focus", "tasks", "icons"],
        price: 8,
        status: "live",
        planners: ["e1"],
      },
      {
        id: "p3",
        name: "Cozy Doodles",
        tags: ["cozy", "hand-drawn"],
        price: 5,
        status: "draft",
        planners: ["e2"],
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ packs (3)");

  // ── Inserts ────────────────────────────────────────────────────────────────
  await db
    .insert(insertsTable)
    .values([
      {
        id: "i1",
        name: "Section header banner",
        cat: "Functional",
        collection: "Starter",
        planners: ["all"],
        status: "live",
      },
      {
        id: "i2",
        name: "Habit tracker grid",
        cat: "Trackers",
        collection: "Starter",
        planners: ["all"],
        status: "live",
      },
      {
        id: "i3",
        name: "Washi tape strip",
        cat: "Decorative",
        collection: "Starter",
        planners: ["e1", "e2"],
        status: "live",
      },
      {
        id: "i4",
        name: "Autumn leaf corner",
        cat: "Seasonal",
        collection: "Autumn 2026",
        planners: ["e1"],
        status: "draft",
      },
      {
        id: "i5",
        name: "Mood tracker wheel",
        cat: "Trackers",
        collection: "Starter",
        planners: ["e2"],
        status: "live",
      },
      {
        id: "i6",
        name: "Floral cover spray",
        cat: "Cover art",
        collection: "Autumn 2026",
        planners: ["all"],
        status: "draft",
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ inserts (6)");

  // ── Related Products ───────────────────────────────────────────────────────
  await db
    .insert(relatedProductsTable)
    .values([
      {
        id: "r1",
        name: "Notes-only Notebook",
        kind: "Notebook · notes",
        matches: ["e1", "e2"],
        price: 9,
        status: "live",
      },
      {
        id: "r2",
        name: "To-Do Notebook",
        kind: "Notebook · to-do",
        matches: ["e1"],
        price: 9,
        status: "live",
      },
      {
        id: "r3",
        name: "Meeting Notes Pad",
        kind: "Notebook · notes",
        matches: ["e3"],
        price: 7,
        status: "draft",
      },
      {
        id: "r4",
        name: "Habit Journal",
        kind: "Notebook · trackers",
        matches: ["e2"],
        price: 8,
        status: "draft",
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ products (4)");

  // ── Editions ───────────────────────────────────────────────────────────────
  const defaultArt = {
    cover: null,
    first: null,
    divider: null,
    weekly: null,
    daily: null,
    notes: null,
  };
  await db
    .insert(editionsTable)
    .values([
      {
        id: "e1",
        name: "Classic 2026",
        status: "live",
        tier: "advanced",
        year: 2026,
        sections: ["Ideas", "Projects", "Meetings", "Goals", "Health"],
        priceLow: 29,
        priceHigh: 39,
        themes: ["t1", "t2"],
        packs: ["p1", "p2"],
        inserts: ["i1", "i2", "i3"],
        products: ["r1", "r2"],
        art: defaultArt,
        revisionOf: null,
      },
      {
        id: "e2",
        name: "ADHD Edition",
        status: "live",
        tier: "advanced",
        year: 2026,
        sections: ["Brain dump", "Today's 3", "Wins", "Habits"],
        priceLow: 34,
        priceHigh: 44,
        themes: ["t1"],
        packs: ["p3"],
        inserts: ["i5"],
        products: ["r4"],
        art: defaultArt,
        revisionOf: null,
      },
      {
        id: "e3",
        name: "90-Day Framework",
        status: "draft",
        tier: "advanced",
        year: 2026,
        sections: ["Vision", "Milestones", "Weekly review"],
        priceLow: 49,
        priceHigh: 79,
        themes: [],
        packs: [],
        inserts: [],
        products: ["r3"],
        art: defaultArt,
        revisionOf: null,
      },
      {
        id: "e4",
        name: "Basic 2026 (PDF only)",
        status: "live",
        tier: "basic",
        year: 2026,
        sections: ["Notes"],
        priceLow: 12,
        priceHigh: 19,
        themes: [],
        packs: ["p1"],
        inserts: ["i1"],
        products: [],
        art: defaultArt,
        revisionOf: null,
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ editions (4)");

  // ── Owner user ─────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 12);
  await db
    .insert(usersTable)
    .values({
      provider: "google",
      email: OWNER_EMAIL,
      name: "Daybook Owner",
      role: "owner",
      passwordHash,
      aiEnabled: true,
      aiProvider: "claude",
      owned: [],
      connections: {
        googleDrive: false,
        googleCalendar: false,
        googleTasks: false,
        googleDocs: false,
        notion: false,
      },
    })
    .onConflictDoNothing();
  console.log("  ✓ owner user (owner@daybook.app)");

  console.log("\n✅ Seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
