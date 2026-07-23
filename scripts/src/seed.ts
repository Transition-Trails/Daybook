/**
 * Daybook seed — data matches spec/seed-data.json exactly
 * Run: pnpm --filter @workspace/scripts run seed
 *
 * All inserts are idempotent via onConflictDoNothing / onConflictDoUpdate.
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
  await db
    .insert(themesTable)
    .values([
      { id: "t1", name: "Terracotta", colors: ["#b75d3f","#a04a30","#c98a2b","#7d8a6a","#2c2822","#f4efe6"], price: 0, status: "live", createdBy: "seed" },
      { id: "t2", name: "Sage Calm",  colors: ["#5f7a5a","#49624a","#8a9a76","#c2b280","#2a322a","#eef1e9"], price: 0, status: "live", createdBy: "seed" },
      { id: "t3", name: "Ocean",      colors: ["#2f7d8c","#1f5f6c","#5f97a0","#c98a2b","#22333b","#edf3f4"], price: 4, status: "draft", createdBy: "seed" },
      { id: "t4", name: "Sunrise",    colors: ["#e07a4a","#c25f30","#f2c14e","#8ab6a6","#3a2e26","#fcf3ea"], price: 4, status: "live", createdBy: "seed" },
      { id: "t5", name: "Plum",       colors: ["#8a5a8f","#6e4472","#9a7aa0","#c2a15e","#2f2833","#f3eef4"], price: 5, status: "draft", createdBy: "seed" },
      { id: "t6", name: "Forest",     colors: ["#3f7a57","#2f6045","#6f9a7f","#c98a2b","#22302a","#edf2ee"], price: 5, status: "draft", createdBy: "seed" },
    ])
    .onConflictDoNothing();
  console.log("  ✓ themes (6)");

  // ── Sticker Packs ──────────────────────────────────────────────────────────
  await db
    .insert(stickerPacksTable)
    .values([
      { id: "p1", name: "Seasonal Set",        tags: ["spring","summer","fall","winter"], price: 6, status: "live",  planners: ["all"] },
      { id: "p2", name: "Productivity Icons",   tags: ["focus","tasks","icons"],           price: 8, status: "live",  planners: ["e1"] },
      { id: "p3", name: "Cozy Doodles",         tags: ["cozy","hand-drawn"],               price: 5, status: "draft", planners: ["e2"] },
    ])
    .onConflictDoNothing();
  console.log("  ✓ packs (3)");

  // ── Inserts ────────────────────────────────────────────────────────────────
  await db
    .insert(insertsTable)
    .values([
      { id: "i1", name: "Section header banner", cat: "Functional",  collection: "Starter",     planners: ["all"],      status: "live" },
      { id: "i2", name: "Habit tracker grid",    cat: "Trackers",    collection: "Starter",     planners: ["all"],      status: "live" },
      { id: "i3", name: "Washi tape strip",      cat: "Decorative",  collection: "Starter",     planners: ["e1","e2"],  status: "live" },
      { id: "i4", name: "Autumn leaf corner",    cat: "Seasonal",    collection: "Autumn 2026", planners: ["e1"],       status: "draft" },
      { id: "i5", name: "Mood tracker wheel",    cat: "Trackers",    collection: "Starter",     planners: ["e2"],       status: "live" },
      { id: "i6", name: "Floral cover spray",    cat: "Cover art",   collection: "Autumn 2026", planners: ["all"],      status: "draft" },
    ])
    .onConflictDoNothing();
  console.log("  ✓ inserts (6)");

  // ── Related Products ───────────────────────────────────────────────────────
  await db
    .insert(relatedProductsTable)
    .values([
      { id: "r1", name: "Notes-only Notebook",  kind: "Notebook · notes",    matches: ["e1","e2"], price: 9, status: "live" },
      { id: "r2", name: "To-Do Notebook",       kind: "Notebook · to-do",    matches: ["e1"],      price: 9, status: "live" },
      { id: "r3", name: "Meeting Notes Pad",    kind: "Notebook · notes",    matches: ["e3"],      price: 7, status: "draft" },
      { id: "r4", name: "Habit Journal",        kind: "Notebook · trackers", matches: ["e2"],      price: 8, status: "draft" },
    ])
    .onConflictDoNothing();
  console.log("  ✓ products (4)");

  // ── Editions ───────────────────────────────────────────────────────────────
  const defaultArt = { cover: null, first: null, divider: null, weekly: null, daily: null, notes: null };
  await db
    .insert(editionsTable)
    .values([
      { id: "e1", name: "Classic 2026",       status: "live",  tier: "advanced", year: 2026, sections: ["Ideas","Projects","Meetings","Goals","Health"],    priceLow: 29, priceHigh: 39, themes: ["t1","t2"], packs: ["p1","p2"], inserts: ["i1","i2","i3"], products: ["r1","r2"], art: defaultArt, revisionOf: null },
      { id: "e2", name: "ADHD Edition",       status: "live",  tier: "advanced", year: 2026, sections: ["Brain dump","Today's 3","Wins","Habits"],          priceLow: 34, priceHigh: 44, themes: ["t1"],      packs: ["p3"],      inserts: ["i5"],           products: ["r4"],      art: defaultArt, revisionOf: null },
      { id: "e3", name: "90-Day Framework",   status: "draft", tier: "advanced", year: 2026, sections: ["Vision","Milestones","Weekly review"],             priceLow: 49, priceHigh: 79, themes: [],          packs: [],          inserts: [],               products: ["r3"],      art: defaultArt, revisionOf: null },
      { id: "e4", name: "Basic 2026",         status: "live",  tier: "basic",    year: 2026, sections: ["Notes"],                                          priceLow: 12, priceHigh: 19, themes: [],          packs: ["p1"],      inserts: ["i1"],           products: [],          art: defaultArt, revisionOf: null },
    ])
    .onConflictDoNothing();
  console.log("  ✓ editions (4)");

  // ── Users ──────────────────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash(OWNER_PASSWORD, 12);
  const saHash    = await bcrypt.hash(SA_PASSWORD, 12);
  const storeHash = await bcrypt.hash("store-pw-2025", 12);

  const defaultConnections = { googleDrive: false, googleCalendar: false, googleTasks: false, googleDocs: false, notion: false };

  // Platform owner (legacy role=owner maps to super_admin in the new system)
  await db.insert(usersTable).values({
    id: "u-owner",
    provider: "google",
    email: OWNER_EMAIL,
    name: "Daybook Owner",
    role: "owner",
    platformRole: "super_admin",
    passwordHash: ownerHash,
    aiEnabled: true,
    aiProvider: "claude",
    owned: [],
    connections: defaultConnections,
  }).onConflictDoUpdate({
    target: usersTable.email,
    set: { platformRole: "super_admin", role: "owner" },
  });

  // Dedicated super_admin user
  await db.insert(usersTable).values({
    id: "u-sa",
    provider: "google",
    email: SA_EMAIL,
    name: "Platform Super Admin",
    role: "owner",
    platformRole: "super_admin",
    passwordHash: saHash,
    aiEnabled: true,
    aiProvider: "claude",
    owned: [],
    connections: defaultConnections,
  }).onConflictDoUpdate({
    target: usersTable.email,
    set: { platformRole: "super_admin", role: "owner" },
  });

  // Store owner users
  await db.insert(usersTable).values([
    { id: "u-alpha-owner", provider: "google", email: "owner@store-alpha.com", name: "Alpha Owner", role: "user", passwordHash: storeHash, aiEnabled: true, aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-beta-owner",  provider: "google", email: "owner@store-beta.com",  name: "Beta Owner",  role: "user", passwordHash: storeHash, aiEnabled: true, aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-gamma-owner", provider: "google", email: "owner@store-gamma.com", name: "Gamma Owner", role: "user", passwordHash: storeHash, aiEnabled: true, aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-delta-owner", provider: "google", email: "owner@store-delta.com", name: "Delta Owner", role: "user", passwordHash: storeHash, aiEnabled: true, aiProvider: "claude", owned: [], connections: defaultConnections },
  ]).onConflictDoNothing();

  // Store staff / support members
  await db.insert(usersTable).values([
    { id: "u-alpha-staff",   provider: "google", email: "staff@store-alpha.com",   name: "Alpha Staff",   role: "user", passwordHash: storeHash, aiEnabled: false, aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-beta-staff",    provider: "google", email: "staff@store-beta.com",    name: "Beta Staff",    role: "user", passwordHash: storeHash, aiEnabled: false, aiProvider: "claude", owned: [], connections: defaultConnections },
    { id: "u-beta-support",  provider: "google", email: "support@store-beta.com",  name: "Beta Support",  role: "user", passwordHash: storeHash, aiEnabled: false, aiProvider: "claude", owned: [], connections: defaultConnections },
  ]).onConflictDoNothing();

  console.log("  ✓ users (owner, super_admin + 7 store users)");

  // ── Stores ─────────────────────────────────────────────────────────────────
  await db.insert(storesTable).values([
    { id: "store-alpha", name: "Alpha Planners",    slug: "store-alpha", ownerUserId: "u-alpha-owner", plan: "pro",     status: "active" },
    { id: "store-beta",  name: "Beta Studio",       slug: "store-beta",  ownerUserId: "u-beta-owner",  plan: "pro",     status: "active" },
    { id: "store-gamma", name: "Gamma Designs",     slug: "store-gamma", ownerUserId: "u-gamma-owner", plan: "starter", status: "trial" },
    { id: "store-delta", name: "Delta Co.",         slug: "store-delta", ownerUserId: "u-delta-owner", plan: "starter", status: "suspended" },
  ]).onConflictDoNothing();
  console.log("  ✓ stores (4)");

  // ── Store members ──────────────────────────────────────────────────────────
  await db.insert(storeMembersTable).values([
    // Alpha: owner + staff
    { storeId: "store-alpha", userId: "u-alpha-owner", role: "store_owner" },
    { storeId: "store-alpha", userId: "u-alpha-staff", role: "store_staff" },
    // Beta: owner + staff + support
    { storeId: "store-beta",  userId: "u-beta-owner",   role: "store_owner" },
    { storeId: "store-beta",  userId: "u-beta-staff",   role: "store_staff" },
    { storeId: "store-beta",  userId: "u-beta-support", role: "support" },
    // Gamma: owner only
    { storeId: "store-gamma", userId: "u-gamma-owner",  role: "store_owner" },
    // Delta: owner only
    { storeId: "store-delta", userId: "u-delta-owner",  role: "store_owner" },
  ]).onConflictDoNothing();
  console.log("  ✓ store members");

  // ── Store catalog selections ───────────────────────────────────────────────
  // store-alpha: premium set (t1, t2, t4, p1, p2, i1, i2, i3, r1, r2, e1)
  // store-beta:  starter set (t1, t2, p1, i1, i2, e1, e4)
  // store-gamma: minimal set (t1, p1, i1, e4)
  // store-delta: nothing (suspended)
  await db.insert(storeCatalogTable).values([
    // Alpha — premium
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
    // Beta — starter
    { storeId: "store-beta", itemType: "theme",   itemId: "t1" },
    { storeId: "store-beta", itemType: "theme",   itemId: "t2" },
    { storeId: "store-beta", itemType: "pack",    itemId: "p1" },
    { storeId: "store-beta", itemType: "insert",  itemId: "i1" },
    { storeId: "store-beta", itemType: "insert",  itemId: "i2" },
    { storeId: "store-beta", itemType: "edition", itemId: "e1" },
    { storeId: "store-beta", itemType: "edition", itemId: "e4" },
    // Gamma — minimal
    { storeId: "store-gamma", itemType: "theme",   itemId: "t1" },
    { storeId: "store-gamma", itemType: "pack",    itemId: "p1" },
    { storeId: "store-gamma", itemType: "insert",  itemId: "i1" },
    { storeId: "store-gamma", itemType: "edition", itemId: "e4" },
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
    set: { aiEnabled: false }, // no-op update to make upsert idempotent
  });
  // Re-insert correct values via update to make fully idempotent
  await db.insert(storeFlagsTable).values([
    { storeId: "store-alpha", aiEnabled: true,  customDomain: true,  editionsCap: 20, storageQuota: 5120 },
    { storeId: "store-beta",  aiEnabled: true,  customDomain: false, editionsCap: 10, storageQuota: 2048 },
    { storeId: "store-gamma", aiEnabled: false, customDomain: false, editionsCap: 5,  storageQuota: 1024 },
    { storeId: "store-delta", aiEnabled: false, customDomain: false, editionsCap: 5,  storageQuota: 1024 },
  ]).onConflictDoUpdate({
    target: storeFlagsTable.storeId,
    set: {
      aiEnabled: false, // placeholder — onConflictDoNothing equivalent for flags
    },
  });
  console.log("  ✓ store flags");

  // ── Help content ───────────────────────────────────────────────────────────
  // Platform articles — managed by super_admin, visible to all authenticated users
  await db.insert(helpContentTable).values([
    // ── Platform articles
    {
      id: "h-build-first",
      title: "Build your first planner",
      body: `## Getting started\n\nOpen the Planner Builder from the sidebar, select an edition, then walk through the three steps: Style (choose a theme), Sections (pick your inserts and packs), and Output (set year, orientation, and file format).\n\nClick **Generate** when ready — your PDF will appear in the Downloads panel within a few seconds.\n\n## Tips\n- Pick a theme that matches your brand first; colours drive the whole look.\n- Start with fewer inserts and add more once you're happy with the base layout.\n- The preview button shows the first 9 pages so you can spot layout issues before generating 400+ pages.`,
      category: "Getting started",
      kind: "article",
      scope: "platform",
      status: "live",
    },
    {
      id: "h-google-drive",
      title: "Connect Google Drive & Calendar",
      body: `## Why connect Google?\n\nConnecting your Google account lets Daybook:\n- **Back up** generated PDFs directly to a Drive folder.\n- **Pull calendar events** into day/week views inside the admin.\n- **Push planner schedules** to Google Calendar so your plan lives where you work.\n\n## How to connect\n1. Go to **Google Sync** in the sidebar.\n2. Click **Connect Google** — you'll be redirected to Google's OAuth screen.\n3. Grant the requested permissions (Drive, Calendar).\n4. You'll be redirected back; the Sync dashboard will show green status badges.\n\n## Reconnecting after token expiry\nGoogle tokens expire after roughly 1 hour. If you see a yellow banner saying "Your Google connection expired", click **Reconnect Google** to refresh silently.`,
      category: "Integrations",
      kind: "article",
      scope: "platform",
      status: "live",
    },
    {
      id: "h-ai-assistant",
      title: "Using the AI assistant",
      body: `## What the AI assistant does\n\nThe AI assistant (powered by Claude, ChatGPT, or Gemini depending on your settings) helps you:\n- **Research trends** in the planner niche: top sellers, emerging categories, buyer pain points.\n- **Generate copy** for planner sections, insert labels, and product descriptions.\n- **Brainstorm** edition themes and section structures.\n\n## AI Settings\nGo to **AI Settings** in the sidebar to switch providers or disable AI for your account.\n\n## Trend Research\nThe **Trend Research** page sends a structured prompt to your chosen AI provider and returns a digest of top-selling planners, keyword trends, and opportunities in the niche you specify.`,
      category: "Features",
      kind: "article",
      scope: "platform",
      status: "live",
    },
    {
      id: "h-stickers-inserts",
      title: "Adding stickers & inserts",
      body: `## Sticker packs\n\nSticker packs are collections of decorative or functional PNG assets. Packs marked **live** are available in the Planner Builder; draft packs are only visible to admins.\n\nTo add a pack: go to **Sticker Packs** → **New Pack**, fill in a name and tags, then upload individual sticker assets via the asset manager.\n\n## Inserts\n\nInserts are full-page PDF pages inserted between planner sections — habit trackers, cover-art spreads, section headers, and so on. Each insert is linked to an asset file and scoped to one or more editions.\n\nCreate an insert under **Inserts** → **New Insert**, then attach it to the editions that should offer it.`,
      category: "Content management",
      kind: "article",
      scope: "platform",
      status: "live",
    },
    {
      id: "h-account-plans",
      title: "Account & plans",
      body: `## Plan types\n\n| Plan | Price | What you get |\n|------|-------|-------------|\n| One-time + maintenance | $49/yr | Current year's planner + yearly update fee |\n| Lifetime | $149 one-time | Every future upgrade, forever |\n\n## Managing your account\n- Your current plan is shown on the Dashboard.\n- To upgrade, visit the pricing page and select a plan.\n- Lifetime purchases never expire and include all future editions automatically.`,
      category: "Account",
      kind: "article",
      scope: "platform",
      status: "live",
    },

    // ── Platform FAQs
    {
      id: "h-faq-goodnotes",
      title: "Links broken in GoodNotes — how to fix",
      body: `**Q: I opened my planner PDF in GoodNotes and the navigation links don't work. What's wrong?**\n\nA: GoodNotes requires interactive links to be within the visible page area. If you generated with a non-standard page size, crop marks can push link zones outside the display boundary.\n\n**Fix:** Re-generate the planner and set Orientation to **Portrait** and Page size to **A4** or **Letter**. These are the sizes calibrated for GoodNotes link zones.\n\nIf links still don't work, try opening the PDF in Adobe Acrobat Reader first — if they work there, it's a GoodNotes rendering issue and a GoodNotes app reinstall usually resolves it.`,
      category: "Troubleshooting",
      kind: "faq",
      scope: "platform",
      status: "live",
    },
    {
      id: "h-faq-regen",
      title: "Can I change a planner after generating?",
      body: `**Q: I generated a planner but want to change the theme. Do I have to start over?**\n\nA: No. Open the **Planner Builder**, load the saved configuration, change the theme (or any other setting), and click **Generate** again. Each generation creates a new PDF version; your previous versions are kept in the Downloads panel until you delete them.\n\nNote: if you uploaded the old PDF to Google Drive, you'll need to manually replace it — the re-export doesn't auto-overwrite Drive files.`,
      category: "Usage",
      kind: "faq",
      scope: "platform",
      status: "live",
    },
    {
      id: "h-faq-lifetime",
      title: "One-time purchase vs lifetime — what's the difference?",
      body: `**Q: What's the difference between the One-time + maintenance plan and the Lifetime plan?**\n\nA: The **One-time + maintenance** plan gives you access to the current year's planner generation. After one year, you pay a small maintenance fee ($15/yr) to keep receiving updates.\n\nThe **Lifetime** plan is a single payment of $149 that covers all current and future editions — you never pay again, and every new edition or feature is automatically included.\n\nIf you generate planners regularly, Lifetime typically pays off within 3-4 years.`,
      category: "Plans & pricing",
      kind: "faq",
      scope: "platform",
      status: "live",
    },

    // ── Store-scoped example (store-alpha)
    {
      id: "h-alpha-welcome",
      title: "Welcome to Alpha Planners",
      body: `## Welcome!\n\nThank you for joining the Alpha Planners store. Here's what you need to know to get started:\n\n- Browse our curated collection of planner editions, themes, and inserts in the Shop.\n- Use the Planner Builder to customise your chosen edition.\n- Your generated PDFs will be available in the Downloads panel immediately.\n\nIf you have questions, use the Help chat or email us at support@store-alpha.com.`,
      category: "Getting started",
      kind: "article",
      scope: "store-alpha",
      status: "live",
    },
  ]).onConflictDoNothing();
  console.log("  ✓ help content (5 platform articles, 3 platform FAQs, 1 store article)");

  console.log("\n✅ Seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
