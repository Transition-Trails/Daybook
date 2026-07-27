/**
 * Daybook seed — data matches spec/seed-data.json exactly
 * Run: pnpm --filter @workspace/scripts run seed
 *
 * All inserts are idempotent via onConflictDoNothing / onConflictDoUpdate.
 *
 * v2 additions: origin ('starter'|'licensed'|'owned') on all catalog items;
 * defaultMode + subscriptionActive on stores.
 *
 * Starter subset (always entitled, no subscription needed):
 *   Themes: t1 (Terracotta), t2 (Sage Calm)
 *   Inserts: i1 (Section header banner), i2 (Habit tracker grid)
 *   Editions: e4 (Basic 2026)
 * Everything else is 'licensed'.
 * No 'owned' items seeded — those are created by stores later via AI studios.
 */
import { db } from "@workspace/db";
import {
  themesTable,
  stickerPacksTable,
  insertsTable,
  editionsTable,
  plansTable,
  usersTable,
  storesTable,
  storeMembersTable,
  storeCatalogTable,
  storeFlagsTable,
  helpContentTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";

const OWNER_EMAIL    = "owner@daybook.app";
const OWNER_PASSWORD = "daybook-owner-2025";
const SA_EMAIL       = "superadmin@daybook.app";
const SA_PASSWORD    = "daybook-sa-2025";

async function main() {
  console.log("🌱 Seeding Daybook database…");

  // ── Plans ──────────────────────────────────────────────────────────────────
  await db
    .insert(plansTable)
    .values([
      {
        id: "yearly",
        name: "One-time + maintenance",
        description: "Pay once for the current year, then a small yearly fee to keep getting updates.",
        oneTimePrice: 49,
        yearlyPrice: 15,
      },
      {
        id: "lifetime",
        name: "Lifetime (all upgrades)",
        description: "One payment, every future upgrade included forever.",
        oneTimePrice: 149,
        yearlyPrice: null,
      },
    ])
    .onConflictDoNothing();
  console.log("  ✓ plans");

  // ── Themes ─────────────────────────────────────────────────────────────────
  // t1, t2 = starter; t3–t6 = licensed
  await db
    .insert(themesTable)
    .values([
      { id: "t1", name: "Terracotta", colors: ["#b75d3f","#a04a30","#c98a2b","#7d8a6a","#2c2822","#f4efe6"], price: 0, status: "live", createdBy: "seed", origin: "starter" },
      { id: "t2", name: "Sage Calm",  colors: ["#5f7a5a","#49624a","#8a9a76","#c2b280","#2a322a","#eef1e9"], price: 0, status: "live", createdBy: "seed", origin: "starter" },
      { id: "t3", name: "Ocean",      colors: ["#2f7d8c","#1f5f6c","#5f97a0","#c98a2b","#22333b","#edf3f4"], price: 4, status: "draft", createdBy: "seed", origin: "licensed" },
      { id: "t4", name: "Sunrise",    colors: ["#e07a4a","#c25f30","#f2c14e","#8ab6a6","#3a2e26","#fcf3ea"], price: 4, status: "live", createdBy: "seed", origin: "licensed" },
      { id: "t5", name: "Plum",       colors: ["#8a5a8f","#6e4472","#9a7aa0","#c2a15e","#2f2833","#f3eef4"], price: 5, status: "draft", createdBy: "seed", origin: "licensed" },
      { id: "t6", name: "Forest",     colors: ["#3f7a57","#2f6045","#6f9a7f","#c98a2b","#22302a","#edf2ee"], price: 5, status: "draft", createdBy: "seed", origin: "licensed" },
    ])
    .onConflictDoUpdate({
      target: themesTable.id,
      set: { origin: themesTable.origin },
    });
  console.log("  ✓ themes (6): t1,t2=starter  t3–t6=licensed");

  // ── Sticker Packs ──────────────────────────────────────────────────────────
  // All licensed (packs require theme/design work, not a simple starter set)
  await db
    .insert(stickerPacksTable)
    .values([
      { id: "p1", name: "Seasonal Set",       tags: ["spring","summer","fall","winter"], price: 6, status: "live",  planners: ["all"], origin: "licensed" },
      { id: "p2", name: "Productivity Icons", tags: ["focus","tasks","icons"],           price: 8, status: "live",  planners: ["e1"], origin: "licensed" },
      { id: "p3", name: "Cozy Doodles",       tags: ["cozy","hand-drawn"],              price: 5, status: "draft", planners: ["e2"], origin: "licensed" },
    ])
    .onConflictDoUpdate({
      target: stickerPacksTable.id,
      set: { origin: stickerPacksTable.origin },
    });
  console.log("  ✓ packs (3): all licensed");

  // ── Inserts ────────────────────────────────────────────────────────────────
  // Starter collection items → origin='starter'; others → 'licensed'
  await db
    .insert(insertsTable)
    .values([
      { id: "i1", name: "Section header banner", cat: "Functional",  collection: "Starter",     planners: ["all"],     status: "live",  origin: "starter" },
      { id: "i2", name: "Habit tracker grid",    cat: "Trackers",    collection: "Starter",     planners: ["all"],     status: "live",  origin: "starter" },
      { id: "i3", name: "Washi tape strip",      cat: "Decorative",  collection: "Starter",     planners: ["e1","e2"], status: "live",  origin: "licensed" },
      { id: "i4", name: "Autumn leaf corner",    cat: "Seasonal",    collection: "Autumn 2026", planners: ["e1"],      status: "draft", origin: "licensed" },
      { id: "i5", name: "Mood tracker wheel",    cat: "Trackers",    collection: "Starter",     planners: ["e2"],      status: "live",  origin: "licensed" },
      { id: "i6", name: "Floral cover spray",    cat: "Cover art",   collection: "Autumn 2026", planners: ["all"],     status: "draft", origin: "licensed" },
    ])
    .onConflictDoUpdate({
      target: insertsTable.id,
      set: { origin: insertsTable.origin },
    });
  console.log("  ✓ inserts (6): i1,i2=starter  i3–i6=licensed");

  // ── Notebook / Journal Editions (formerly related_products) ──────────────
  // These rows were migrated from the retired related_products table into editions.
  // Seeds are idempotent via ON CONFLICT DO NOTHING.
  await db
    .insert(editionsTable)
    .values([
      { id: "r1", name: "Notes-only Notebook", status: "live",  tier: "basic", sections: [], priceLow: 9,  priceHigh: 9,  themes: [], packs: [], inserts: [], products: [], art: defaultArt, origin: "licensed", productType: "notebook",  binding: { type: "coil", finish: "silver" } },
      { id: "r2", name: "To-Do Notebook",      status: "live",  tier: "basic", sections: [], priceLow: 9,  priceHigh: 9,  themes: [], packs: [], inserts: [], products: [], art: defaultArt, origin: "licensed", productType: "notebook",  binding: { type: "coil", finish: "silver" } },
      { id: "r3", name: "Meeting Notes Pad",   status: "draft", tier: "basic", sections: [], priceLow: 7,  priceHigh: 7,  themes: [], packs: [], inserts: [], products: [], art: defaultArt, origin: "licensed", productType: "notebook",  binding: { type: "coil", finish: "silver" } },
      { id: "r4", name: "Habit Journal",       status: "draft", tier: "basic", sections: [], priceLow: 8,  priceHigh: 8,  themes: [], packs: [], inserts: [], products: [], art: defaultArt, origin: "licensed", productType: "journal",   binding: { type: "coil", finish: "silver" } },
    ])
    .onConflictDoNothing();
  console.log("  ✓ notebook/journal editions (4): r1–r4 licensed");

  // ── Editions ───────────────────────────────────────────────────────────────
  // e4 Basic 2026 = starter (minimum viable planner, no licensed extras)
  const defaultArt = { cover: null, first: null, divider: null, weekly: null, daily: null, notes: null };
  await db
    .insert(editionsTable)
    .values([
      { id: "e1", name: "Classic 2026",     status: "live",  tier: "advanced", year: 2026, sections: ["Ideas","Projects","Meetings","Goals","Health"],  priceLow: 29, priceHigh: 39, themes: ["t1","t2"], packs: ["p1","p2"], inserts: ["i1","i2","i3"], products: ["r1","r2"], art: defaultArt, revisionOf: null, origin: "licensed" },
      { id: "e2", name: "ADHD Edition",     status: "live",  tier: "advanced", year: 2026, sections: ["Brain dump","Today's 3","Wins","Habits"],        priceLow: 34, priceHigh: 44, themes: ["t1"],      packs: ["p3"],      inserts: ["i5"],          products: ["r4"],      art: defaultArt, revisionOf: null, origin: "licensed" },
      { id: "e3", name: "90-Day Framework", status: "draft", tier: "advanced", year: 2026, sections: ["Vision","Milestones","Weekly review"],           priceLow: 49, priceHigh: 79, themes: [],          packs: [],          inserts: [],              products: ["r3"],      art: defaultArt, revisionOf: null, origin: "licensed" },
      { id: "e4", name: "Basic 2026",       status: "live",  tier: "basic",    year: 2026, sections: ["Notes"],                                        priceLow: 12, priceHigh: 19, themes: [],          packs: ["p1"],      inserts: ["i1"],          products: [],          art: defaultArt, revisionOf: null, origin: "starter" },
    ])
    .onConflictDoUpdate({
      target: editionsTable.id,
      set: { origin: editionsTable.origin },
    });
  console.log("  ✓ editions (4): e4=starter  e1–e3=licensed");

  // ── Users ──────────────────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash(OWNER_PASSWORD, 12);
  const saHash    = await bcrypt.hash(SA_PASSWORD, 12);
  const storeHash = await bcrypt.hash("store-pw-2025", 12);
  const defaultConnections = { googleDrive: false, googleCalendar: false, googleTasks: false, googleDocs: false, notion: false };

  await db.insert(usersTable).values({
    id: "u-owner", provider: "google", email: OWNER_EMAIL, name: "Daybook Owner",
    role: "owner", platformRole: "super_admin", passwordHash: ownerHash,
    aiEnabled: true, aiProvider: "claude", owned: [], connections: defaultConnections,
  }).onConflictDoUpdate({ target: usersTable.email, set: { platformRole: "super_admin", role: "owner" } });

  await db.insert(usersTable).values({
    id: "u-sa", provider: "google", email: SA_EMAIL, name: "Platform Super Admin",
    role: "owner", platformRole: "super_admin", passwordHash: saHash,
    aiEnabled: true, aiProvider: "claude", owned: [], connections: defaultConnections,
  }).onConflictDoUpdate({ target: usersTable.email, set: { platformRole: "super_admin", role: "owner" } });

  // Store owners use role="owner", store staff use role="staff"
  // so the /api/auth/staff/login endpoint accepts them.
  await db.insert(usersTable).values([
    { id: "u-alpha-owner", provider: "google", email: "owner@store-alpha.com", name: "Alpha Owner", role: "owner", passwordHash: storeHash, aiEnabled: true,  aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-beta-owner",  provider: "google", email: "owner@store-beta.com",  name: "Beta Owner",  role: "owner", passwordHash: storeHash, aiEnabled: true,  aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-gamma-owner", provider: "google", email: "owner@store-gamma.com", name: "Gamma Owner", role: "owner", passwordHash: storeHash, aiEnabled: true,  aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-delta-owner", provider: "google", email: "owner@store-delta.com", name: "Delta Owner", role: "owner", passwordHash: storeHash, aiEnabled: false, aiProvider: "claude", owned: [], connections: defaultConnections },
  ]).onConflictDoUpdate({ target: usersTable.id, set: { role: usersTable.role } });

  await db.insert(usersTable).values([
    { id: "u-alpha-staff",  provider: "google", email: "staff@store-alpha.com",   name: "Alpha Staff",   role: "staff", passwordHash: storeHash, aiEnabled: false, aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-beta-staff",   provider: "google", email: "staff@store-beta.com",    name: "Beta Staff",    role: "staff", passwordHash: storeHash, aiEnabled: false, aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-beta-support", provider: "google", email: "support@store-beta.com",  name: "Beta Support",  role: "staff", passwordHash: storeHash, aiEnabled: false, aiProvider: "claude", owned: [], connections: defaultConnections },
  ]).onConflictDoUpdate({ target: usersTable.id, set: { role: usersTable.role } });

  console.log("  ✓ users (owner, super_admin + 7 store users)");

  // ── Stores ─────────────────────────────────────────────────────────────────
  // alpha/beta/gamma: curated + subscriptionActive=true
  // delta: independent mode + subscriptionActive=false (demonstrates the gated state)
  await db.insert(storesTable).values([
    { id: "store-alpha", name: "Alpha Planners", slug: "store-alpha", ownerUserId: "u-alpha-owner", plan: "pro",     status: "active",    defaultMode: "curated",      subscriptionActive: true },
    { id: "store-beta",  name: "Beta Studio",    slug: "store-beta",  ownerUserId: "u-beta-owner",  plan: "pro",     status: "active",    defaultMode: "curated",      subscriptionActive: true },
    { id: "store-gamma", name: "Gamma Designs",  slug: "store-gamma", ownerUserId: "u-gamma-owner", plan: "starter", status: "trial",     defaultMode: "curated",      subscriptionActive: true },
    { id: "store-delta", name: "Delta Co.",      slug: "store-delta", ownerUserId: "u-delta-owner", plan: "starter", status: "suspended", defaultMode: "independent",  subscriptionActive: false },
  ]).onConflictDoUpdate({
    target: storesTable.id,
    set: {
      defaultMode: storesTable.defaultMode,
      subscriptionActive: storesTable.subscriptionActive,
    },
  });
  console.log("  ✓ stores (4): alpha/beta/gamma=curated+active  delta=independent+inactive");

  // ── Store members ──────────────────────────────────────────────────────────
  await db.insert(storeMembersTable).values([
    { storeId: "store-alpha", userId: "u-alpha-owner", role: "store_owner" },
    { storeId: "store-alpha", userId: "u-alpha-staff", role: "store_staff" },
    { storeId: "store-beta",  userId: "u-beta-owner",  role: "store_owner" },
    { storeId: "store-beta",  userId: "u-beta-staff",  role: "store_staff" },
    { storeId: "store-beta",  userId: "u-beta-support",role: "support" },
    { storeId: "store-gamma", userId: "u-gamma-owner", role: "store_owner" },
    { storeId: "store-delta", userId: "u-delta-owner", role: "store_owner" },
  ]).onConflictDoNothing();
  console.log("  ✓ store members");

  // ── Store catalog selections ───────────────────────────────────────────────
  await db.insert(storeCatalogTable).values([
    // Alpha — premium curated set
    { storeId: "store-alpha", itemType: "theme",   itemId: "t1" },
    { storeId: "store-alpha", itemType: "theme",   itemId: "t2" },
    { storeId: "store-alpha", itemType: "theme",   itemId: "t4" },
    { storeId: "store-alpha", itemType: "pack",    itemId: "p1" },
    { storeId: "store-alpha", itemType: "pack",    itemId: "p2" },
    { storeId: "store-alpha", itemType: "insert",  itemId: "i1" },
    { storeId: "store-alpha", itemType: "insert",  itemId: "i2" },
    { storeId: "store-alpha", itemType: "insert",  itemId: "i3" },
    { storeId: "store-alpha", itemType: "product", itemId: "r1" },
    { storeId: "store-alpha", itemType: "product", itemId: "r2" },
    { storeId: "store-alpha", itemType: "edition", itemId: "e1" },
    // Beta — moderate curated set
    { storeId: "store-beta", itemType: "theme",   itemId: "t1" },
    { storeId: "store-beta", itemType: "theme",   itemId: "t2" },
    { storeId: "store-beta", itemType: "pack",    itemId: "p1" },
    { storeId: "store-beta", itemType: "insert",  itemId: "i1" },
    { storeId: "store-beta", itemType: "insert",  itemId: "i2" },
    { storeId: "store-beta", itemType: "edition", itemId: "e1" },
    { storeId: "store-beta", itemType: "edition", itemId: "e4" },
    // Gamma — minimal curated
    { storeId: "store-gamma", itemType: "theme",   itemId: "t1" },
    { storeId: "store-gamma", itemType: "pack",    itemId: "p1" },
    { storeId: "store-gamma", itemType: "insert",  itemId: "i1" },
    { storeId: "store-gamma", itemType: "edition", itemId: "e4" },
    // Delta — independent mode, starter only (e4 + i1 + i2 are starter)
    { storeId: "store-delta", itemType: "edition", itemId: "e4" },
    { storeId: "store-delta", itemType: "insert",  itemId: "i1" },
    { storeId: "store-delta", itemType: "insert",  itemId: "i2" },
  ]).onConflictDoNothing();
  console.log("  ✓ store catalog selections");

  // ── Store flags ────────────────────────────────────────────────────────────
  await db.insert(storeFlagsTable).values([
    { storeId: "store-alpha", aiEnabled: true,  customDomain: true,  editionsCap: 20, storageQuota: 5120 },
    { storeId: "store-beta",  aiEnabled: true,  customDomain: false, editionsCap: 10, storageQuota: 2048 },
    { storeId: "store-gamma", aiEnabled: false, customDomain: false, editionsCap: 5,  storageQuota: 1024 },
    { storeId: "store-delta", aiEnabled: false, customDomain: false, editionsCap: 5,  storageQuota: 1024 },
  ]).onConflictDoUpdate({
    target: storeFlagsTable.storeId,
    set: { aiEnabled: storeFlagsTable.aiEnabled, editionsCap: storeFlagsTable.editionsCap, storageQuota: storeFlagsTable.storageQuota },
  });
  console.log("  ✓ store flags");

  // ── Help content ───────────────────────────────────────────────────────────
  await db.insert(helpContentTable).values([
    { id: "h-build-first", title: "Build your first planner", body: `## Getting started\n\nOpen the Planner Builder from the sidebar, select an edition, then walk through the three steps: Style (choose a theme), Sections (pick your inserts and packs), and Output (set year, orientation, and file format).\n\nClick **Generate** when ready — your PDF will appear in the Downloads panel within a few seconds.\n\n## Tips\n- Pick a theme that matches your brand first; colours drive the whole look.\n- Start with fewer inserts and add more once you're happy with the base layout.\n- The preview button shows the first 9 pages so you can spot layout issues before generating 400+ pages.`, category: "Getting started", kind: "article", scope: "platform", status: "live" },
    { id: "h-google-drive", title: "Connect Google Drive & Calendar", body: `## Why connect Google?\n\nConnecting your Google account lets Daybook:\n- **Back up** generated PDFs directly to a Drive folder.\n- **Pull calendar events** into day/week views inside the admin.\n- **Push planner schedules** to Google Calendar so your plan lives where you work.\n\n## How to connect\n1. Go to **Google Sync** in the sidebar.\n2. Click **Connect Google** — you'll be redirected to Google's OAuth screen.\n3. Grant the requested permissions (Drive, Calendar).\n4. You'll be redirected back; the Sync dashboard will show green status badges.\n\n## Reconnecting after token expiry\nGoogle tokens expire after roughly 1 hour. If you see a yellow banner saying "Your Google connection expired", click **Reconnect Google** to refresh silently.`, category: "Integrations", kind: "article", scope: "platform", status: "live" },
    { id: "h-ai-assistant", title: "Using the AI assistant", body: `## What the AI assistant does\n\nThe AI assistant helps you research trends, generate copy, and brainstorm edition themes.`, category: "Features", kind: "article", scope: "platform", status: "live" },
    { id: "h-stickers-inserts", title: "Adding stickers & inserts", body: `## Sticker packs\n\nSticker packs are collections of decorative or functional PNG assets.\n\n## Inserts\n\nInserts are full-page PDF pages inserted between planner sections.`, category: "Content management", kind: "article", scope: "platform", status: "live" },
    { id: "h-account-plans", title: "Account & plans", body: `## Plan types\n\n| Plan | Price | What you get |\n|------|-------|-------------|\n| One-time + maintenance | $49/yr | Current year's planner + yearly update fee |\n| Lifetime | $149 one-time | Every future upgrade, forever |`, category: "Account", kind: "article", scope: "platform", status: "live" },
    { id: "h-faq-goodnotes", title: "Links broken in GoodNotes — how to fix", body: `**Q:** GoodNotes requires interactive links to be within the visible page area. **Fix:** Re-generate with Portrait orientation and A4 or Letter page size.`, category: "Troubleshooting", kind: "faq", scope: "platform", status: "live" },
    { id: "h-faq-regen",     title: "Can I change a planner after generating?", body: `**Q:** Yes — load the saved config, change settings, and click Generate again. Each generation creates a new PDF version.`, category: "Usage", kind: "faq", scope: "platform", status: "live" },
    { id: "h-faq-lifetime",  title: "One-time purchase vs lifetime — what's the difference?", body: `**Q:** One-time + maintenance ($49/yr) covers the current year. Lifetime ($149) covers all future editions forever.`, category: "Plans & pricing", kind: "faq", scope: "platform", status: "live" },
    { id: "h-alpha-welcome", title: "Welcome to Alpha Planners", body: `## Welcome!\n\nThank you for joining the Alpha Planners store. Browse our curated collection in the Shop.`, category: "Getting started", kind: "article", scope: "store-alpha", status: "live" },
  ]).onConflictDoNothing();
  console.log("  ✓ help content");

  console.log("\n✅ Seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
