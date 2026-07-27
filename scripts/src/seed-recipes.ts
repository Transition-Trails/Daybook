/**
 * Seed the 11 product recipes shown in the Product Recipes screenshot.
 * Run: pnpm --filter @workspace/scripts run seed-recipes
 */
import { db } from "@workspace/db";
import { productRecipesTable } from "@workspace/db";

function id() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

const NOW = new Date();
const PREV_YEAR  = NOW.getFullYear();
const THIS_YEAR  = NOW.getFullYear();
const NEXT_YEAR  = NOW.getFullYear() + 1;

const RECIPES = [
  {
    id: id(), name: "Dated planner",     category: "Planner Studio", status: "live",
    parts: ["calendar engine", "tab rails", "hyperlink map", "covers"],
    physicalPath: { prints: true, impositionSheet: "A4 / US Letter", templates: ["daily", "weekly", "monthly"] },
    decisionCard: {
      prompt: "How would you like your planner dated?",
      optionA: { label: "Fixed year", consequence: "Pages show 2026 dates. Perfect for a gift or specific planning year." },
      optionB: { label: "Perpetual",  consequence: "Buyer fills in dates. Works any year, maximises resale." },
    },
    claudeBrief: { asks: ["What is the planner for?", "Who is the buyer?", "What tone should the design take?"], generates: "A fully structured section layout with cover concept and colour direction." },
    release: { planTiers: ["all"], month: 1, year: PREV_YEAR },
    buildCount: 412,
  },
  {
    id: id(), name: "Undated notebook",  category: "Planner Studio", status: "live",
    parts: ["page recipe", "covers", "dividers"],
    physicalPath: { prints: true, impositionSheet: "A5 / US Letter", templates: ["lined", "dotted", "blank"] },
    decisionCard: {
      prompt: "What ruling style do you want?",
      optionA: { label: "Lined",  consequence: "Clean ruled pages for writing. Works for journaling and notes." },
      optionB: { label: "Dotted", consequence: "Dot grid for bullet journaling and sketching." },
    },
    claudeBrief: { asks: ["What is the notebook for?", "What section mix makes sense?"], generates: "A section order with cover concept and paper stock recommendation." },
    release: { planTiers: ["all"], month: 2, year: PREV_YEAR },
    buildCount: 188,
  },
  {
    id: id(), name: "Sticker pack",      category: "Sticker Studio", status: "live",
    parts: ["cutout", "cut path", "index sheet"],
    physicalPath: { prints: true, impositionSheet: "Letter sheet 8.5×11", templates: ["kiss-cut", "die-cut"] },
    decisionCard: {
      prompt: "What cutting format do you need?",
      optionA: { label: "Kiss-cut sheet", consequence: "Stickers stay on backing sheet. Easiest for buyers to use." },
      optionB: { label: "Die-cut singles", consequence: "Each sticker cut to shape. Better for resale and gifting." },
    },
    claudeBrief: { asks: ["What is the sticker theme?", "What moods or seasons?"], generates: "A 12-sticker set with colour palette and shape direction." },
    release: { planTiers: ["all"], month: 3, year: PREV_YEAR },
    buildCount: 506,
  },
  {
    id: id(), name: "Ephemera set",      category: "Sticker Studio", status: "live",
    parts: ["shape masks", "papers", "edge treatment", "nesting"],
    physicalPath: { prints: true, impositionSheet: "A4 / US Letter", templates: ["tags", "journaling cards", "tabs"] },
    decisionCard: {
      prompt: "What edge style do you want for the cut shapes?",
      optionA: { label: "Torn paper", consequence: "Rough torn-paper edges. High-texture, artisan feel." },
      optionB: { label: "Clean cut",  consequence: "Crisp outlines. Works better for digital scrapbooking." },
    },
    claudeBrief: { asks: ["What aesthetic or era?", "What colour palette?"], generates: "An ephemera set with paper textures, edge treatments, and nesting layout." },
    release: { planTiers: ["pro"], month: 4, year: PREV_YEAR },
    buildCount: 94,
  },
  {
    id: id(), name: "Junk journal kit",  category: "Journal Studio", status: "live",
    parts: ["page recipe", "ephemera", "tags", "pockets", "imposition"],
    physicalPath: { prints: true, impositionSheet: "A4 half-fold", templates: ["pocket pages", "tag clusters", "fold-outs"] },
    decisionCard: {
      prompt: "What is the main binding style?",
      optionA: { label: "Pamphlet stitch", consequence: "Simple fold-and-stitch. Beginner-friendly build." },
      optionB: { label: "Coptic stitch",   consequence: "Lays flat when open. Better for heavy use." },
    },
    claudeBrief: { asks: ["What era or aesthetic?", "Are there specific holidays or events?"], generates: "A junk journal kit with coordinated ephemera, pocket pages, and tag set." },
    release: { planTiers: ["pro"], month: 5, year: PREV_YEAR },
    buildCount: 71,
  },
  {
    id: id(), name: "Memory book",       category: "Journal Studio", status: "live",
    parts: ["photo layouts", "page recipe", "covers"],
    physicalPath: { prints: true, impositionSheet: "A4 landscape / 8.5×11", templates: ["photo grid", "scrapbook spread", "milestone page"] },
    decisionCard: {
      prompt: "What is the primary use?",
      optionA: { label: "Baby/family",   consequence: "Milestone prompts and family photo grids." },
      optionB: { label: "Travel/events", consequence: "Place for maps, ticket stubs, and itinerary notes." },
    },
    claudeBrief: { asks: ["What moments or milestones?", "What emotional tone?"], generates: "A memory book structure with photo layout variety and prompt hierarchy." },
    release: { planTiers: ["all"], month: 6, year: PREV_YEAR },
    buildCount: 63,
  },
  {
    id: id(), name: "Solo journaling game", category: "Journal Studio", status: "live",
    parts: ["prompt deck", "oracle", "play sheet", "tracker", "B&W export"],
    physicalPath: { prints: true, impositionSheet: "A5 / US Half Letter", templates: ["prompt cards", "oracle table", "tracking sheet"] },
    decisionCard: {
      prompt: "What style of play do you want?",
      optionA: { label: "Linear narrative", consequence: "Guided story arc with chapter prompts. Easier to complete." },
      optionB: { label: "Free oracle",      consequence: "Random oracle draws. More replayable and emergent." },
    },
    claudeBrief: { asks: ["What genre or world?", "How long is a session?"], generates: "A solo journaling game with prompt deck, oracle table, and tracking sheet." },
    release: { planTiers: ["pro"], month: 7, year: THIS_YEAR },
    buildCount: 0,
  },
  {
    id: id(), name: "SVG cut pack",      category: "Sticker Studio", status: "live",
    parts: ["cut path", "DXF", "layered export"],
    physicalPath: { prints: false, impositionSheet: "", templates: ["SVG", "DXF", "PNG layers"] },
    decisionCard: {
      prompt: "What cutting machine are you targeting?",
      optionA: { label: "Cricut",   consequence: "Optimised SVG with Cricut-safe path simplification." },
      optionB: { label: "Silhouette", consequence: "DXF output with Silhouette Studio compatibility." },
    },
    claudeBrief: { asks: ["What shapes or motifs?", "What complexity level?"], generates: "An SVG cut pack with layered design files and cut-safe path variants." },
    release: { planTiers: ["pro"], month: 8, year: PREV_YEAR },
    buildCount: 38,
  },
  {
    id: id(), name: "Digital paper pack", category: "Theme Studio", status: "live",
    parts: ["paper generator", "palettes", "tiling"],
    physicalPath: { prints: true, impositionSheet: "A4 / US Letter / 12×12", templates: ["seamless tile", "bordered sheet", "half-page"] },
    decisionCard: {
      prompt: "What format does your buyer prefer?",
      optionA: { label: "12×12 scrapbook", consequence: "Classic scrapbook size. High demand on Etsy." },
      optionB: { label: "A4 + Letter",     consequence: "International + US formats. Wider audience." },
    },
    claudeBrief: { asks: ["What aesthetic?", "What season or holiday?"], generates: "A 12-sheet digital paper pack with coordinated patterns and tiling variants." },
    release: { planTiers: ["all"], month: 9, year: PREV_YEAR },
    buildCount: 127,
  },
  {
    id: id(), name: "Wedding suite",     category: "New studio", status: "draft",
    parts: ["invitations", "place cards", "signage", "envelopes"],
    physicalPath: { prints: true, impositionSheet: "A5 / 5×7 / A6", templates: ["invitation", "RSVP", "menu", "table name", "order of service"] },
    decisionCard: null,
    claudeBrief: null,
    release: { planTiers: ["pro"], month: 9, year: THIS_YEAR },
    buildCount: 0,
  },
  {
    id: id(), name: "Classroom pack",    category: "New studio", status: "draft",
    parts: ["lesson pages", "labels", "certificates", "charts"],
    physicalPath: { prints: true, impositionSheet: "US Letter", templates: ["lesson sheet", "name label", "certificate", "progress chart"] },
    decisionCard: null,
    claudeBrief: null,
    release: { planTiers: ["all", "pro"], month: 10, year: THIS_YEAR },
    buildCount: 0,
  },
] as const;

async function main() {
  console.log(`Seeding ${RECIPES.length} product recipes…`);
  for (const r of RECIPES) {
    await db.insert(productRecipesTable).values({
      id:           r.id,
      name:         r.name,
      category:     r.category,
      decisionCard: r.decisionCard ?? null,
      parts:        [...r.parts],
      physicalPath: r.physicalPath,
      claudeBrief:  r.claudeBrief ?? null,
      release:      r.release,
      status:       r.status,
      buildCount:   r.buildCount,
    }).onConflictDoNothing();
    console.log(`  ✓ ${r.name}`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
