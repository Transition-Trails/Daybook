/**
 * seed-worldsmith-wychcombe — idempotent seed for the Wychcombe world.
 *
 * Inserts (or updates on conflict) the Wychcombe world record, 28 visual
 * assets, and 38 successful + 1 failed compiler run. Uses real Notion IDs
 * from environment secrets when available; falls back to sentinel values so
 * the seed always succeeds even in CI.
 *
 * Run: pnpm --filter @workspace/scripts run seed-worldsmith-wychcombe
 */
import { pool } from "@workspace/db";

// ─── helpers ─────────────────────────────────────────────────────────────────

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

// Asset ID: WS-WYC-V01-{TYPE}{SEQ:03}-MASTER
function assetId(type: string, seq: number): string {
  return `WS-WYC-V01-${type}${String(seq).padStart(3, "0")}-MASTER`;
}

// Fake Notion-style page IDs for seed runs (32 hex chars)
function fakeNotionId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  return `${hex}0000000000000000000000000000`.slice(0, 32);
}

// ─── data ────────────────────────────────────────────────────────────────────

const WORLD_ID = "wychcombe";
const WORLD_CODE = "WYC";
const VOLUME = "Volume I";

// 28 assets across product types
const ASSETS: Array<{
  id: string; name: string; assetType: string; componentType: string;
  readinessState: string; volume: string;
}> = [
  // 4 Hero Papers — Approved
  { id: assetId("HP", 1), name: "Garden Ledger",              assetType: "hero_paper",        componentType: "paper", readinessState: "Approved",     volume: VOLUME },
  { id: assetId("HP", 2), name: "The Greenhouse Workbench",   assetType: "hero_paper",        componentType: "paper", readinessState: "Approved",     volume: VOLUME },
  { id: assetId("HP", 3), name: "The Herbarium Cabinet",      assetType: "hero_paper",        componentType: "paper", readinessState: "Approved",     volume: VOLUME },
  { id: assetId("HP", 4), name: "The Library Table",          assetType: "hero_paper",        componentType: "paper", readinessState: "Approved",     volume: VOLUME },

  // 8 Coordinating Papers — Under Review (awaiting artwork review)
  { id: assetId("CP", 1),  name: "Coordinating Paper 001",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("CP", 2),  name: "Coordinating Paper 002",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("CP", 3),  name: "Coordinating Paper 003",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("CP", 4),  name: "Coordinating Paper 004",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("CP", 5),  name: "Coordinating Paper 005",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("CP", 6),  name: "Coordinating Paper 006",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("CP", 7),  name: "Coordinating Paper 007",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("CP", 8),  name: "Coordinating Paper 008",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Under Review", volume: VOLUME },

  // 4 Coordinating Papers — Approved (already reviewed)
  { id: assetId("CP", 9),  name: "Coordinating Paper 009",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Approved",     volume: VOLUME },
  { id: assetId("CP", 10), name: "Coordinating Paper 010",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Approved",     volume: VOLUME },
  { id: assetId("CP", 11), name: "Coordinating Paper 011",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Approved",     volume: VOLUME },
  { id: assetId("CP", 12), name: "Coordinating Paper 012",   assetType: "coordinating_paper", componentType: "paper", readinessState: "Approved",     volume: VOLUME },

  // 6 Journal Cards — Under Review (awaiting artwork review)
  { id: assetId("JC", 1), name: "Journal Card 001 — Botanical Border",   assetType: "journal_card", componentType: "card", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("JC", 2), name: "Journal Card 002 — Pressed Fern",       assetType: "journal_card", componentType: "card", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("JC", 3), name: "Journal Card 003 — Estate Letterhead",  assetType: "journal_card", componentType: "card", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("JC", 4), name: "Journal Card 004 — Greenhouse Window",  assetType: "journal_card", componentType: "card", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("JC", 5), name: "Journal Card 005 — Curator's Label",    assetType: "journal_card", componentType: "card", readinessState: "Under Review", volume: VOLUME },
  { id: assetId("JC", 6), name: "Journal Card 006 — Specimen Tag",       assetType: "journal_card", componentType: "card", readinessState: "Under Review", volume: VOLUME },

  // 2 assets — Rejected (returned for revision)
  { id: assetId("JC", 7), name: "Journal Card 007 — Archive Map",        assetType: "journal_card", componentType: "card", readinessState: "Rejected",     volume: VOLUME },
  { id: assetId("EP", 1), name: "Ephemera — Curator's Desk Objects",      assetType: "ephemera",     componentType: "ephemera", readinessState: "Rejected", volume: VOLUME },

  // 4 Approved ephemera / construction
  { id: assetId("EP", 2), name: "Ephemera — Botanical & Greenhouse Artifacts",      assetType: "ephemera",     componentType: "ephemera", readinessState: "Approved", volume: VOLUME },
  { id: assetId("EP", 3), name: "Ephemera — Archival Correspondence",               assetType: "ephemera",     componentType: "ephemera", readinessState: "Approved", volume: VOLUME },
  { id: assetId("PK", 1), name: "Library Card Pocket",                              assetType: "pocket",       componentType: "construction", readinessState: "Approved", volume: VOLUME },
  { id: assetId("PK", 2), name: "Herbarium Specimen Pocket",                        assetType: "pocket",       componentType: "construction", readinessState: "Approved", volume: VOLUME },
];

// ─── run seed ────────────────────────────────────────────────────────────────

async function run() {
  const client = await pool.connect();
  let created = 0;
  let updated = 0;
  const warnings: string[] = [];

  try {
    await client.query("BEGIN");

    // ── 1. Upsert world ───────────────────────────────────────────────────────
    console.log("1. Upserting Wychcombe world…");
    const notionProdDbId  = env("NOTION_PRODUCTION_SPEC_DB_ID", "NOTION_PROD_SPEC_NOT_SET");
    const notionCanonDbId = env("NOTION_CANON_DB_ID",           "NOTION_CANON_NOT_SET");
    const notionStyleId   = env("NOTION_STYLE_GUIDES_DB_ID",    "NOTION_STYLE_NOT_SET");

    if (!process.env.NOTION_PRODUCTION_SPEC_DB_ID) warnings.push("NOTION_PRODUCTION_SPEC_DB_ID not set — using sentinel value");
    if (!process.env.NOTION_CANON_DB_ID)           warnings.push("NOTION_CANON_DB_ID not set — using sentinel value");
    if (!process.env.NOTION_STYLE_GUIDES_DB_ID)    warnings.push("NOTION_STYLE_GUIDES_DB_ID not set — using sentinel value");

    const worldResult = await client.query(`
      INSERT INTO worldsmith_worlds (
        id, name, code, description, status,
        cover_color, cover_accent,
        current_collection, current_volume,
        owner, tags,
        notion_production_db_id, notion_canon_db_id, notion_style_guide_id,
        image_provider, created_by,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7,
        $8, $9,
        $10, $11::jsonb,
        $12, $13, $14,
        $15, $16,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name                    = EXCLUDED.name,
        code                    = EXCLUDED.code,
        description             = EXCLUDED.description,
        status                  = EXCLUDED.status,
        cover_color             = EXCLUDED.cover_color,
        cover_accent            = EXCLUDED.cover_accent,
        current_collection      = EXCLUDED.current_collection,
        current_volume          = EXCLUDED.current_volume,
        owner                   = EXCLUDED.owner,
        tags                    = EXCLUDED.tags,
        notion_production_db_id = EXCLUDED.notion_production_db_id,
        notion_canon_db_id      = EXCLUDED.notion_canon_db_id,
        notion_style_guide_id   = EXCLUDED.notion_style_guide_id,
        image_provider          = EXCLUDED.image_provider,
        updated_at              = NOW()
      RETURNING (xmax = 0) AS inserted
    `, [
      WORLD_ID,
      "Wychcombe",
      WORLD_CODE,
      "A fictional Victorian estate dedicated to botanical preservation, archival research, and quiet scholarship. Wychcombe is the flagship World for WorldSmith and serves as the foundation for the Victorian Garden Journals product line.",
      "active",
      "linear-gradient(135deg, #1B2A4A 0%, #2E4A3A 100%)",
      "#C87560",
      "Victorian Garden Journals",
      "Volume I",
      "WorldSmith Foundation",
      JSON.stringify(["botanical", "victorian", "journals", "heritage"]),
      notionProdDbId,
      notionCanonDbId,
      notionStyleId,
      "dalle3",
      "seed",
    ]);

    if (worldResult.rows[0]?.inserted) { created++; console.log("  ✓ World created"); }
    else                                { updated++; console.log("  ↻ World updated"); }

    // ── 2. Upsert assets ──────────────────────────────────────────────────────
    console.log(`2. Upserting ${ASSETS.length} assets…`);
    for (const a of ASSETS) {
      const res = await client.query(`
        INSERT INTO worldsmith_assets (
          id, asset_name, asset_type, world, volume,
          component_type, current_version, readiness_state,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          asset_name      = EXCLUDED.asset_name,
          readiness_state = EXCLUDED.readiness_state,
          updated_at      = NOW()
        RETURNING (xmax = 0) AS inserted
      `, [a.id, a.name, a.assetType, WORLD_ID, a.volume, a.componentType, "v001", a.readinessState]);

      if (res.rows[0]?.inserted) created++; else updated++;
    }
    console.log("  ✓ Assets upserted");

    // ── 3. Upsert compiler runs ───────────────────────────────────────────────
    // 38 successful runs spread over the last 90 days, plus the 1 existing
    // failed run (already in DB — skipped by ON CONFLICT DO NOTHING).
    console.log("3. Seeding compiler run history…");

    const specIds = [
      assetId("HP", 1), assetId("HP", 2), assetId("HP", 3), assetId("HP", 4),
      ...Array.from({ length: 12 }, (_, i) => assetId("CP", i + 1)),
      ...Array.from({ length: 6 },  (_, i) => assetId("JC", i + 1)),
      ...Array.from({ length: 3 },  (_, i) => assetId("EP", i + 1)),
      assetId("PK", 1), assetId("PK", 2),
    ];

    // One recent successful run at the top of the history
    const recentRuns = [
      { specIdx: 0,  hoursBack: 2,   assetIdx: 0 },  // Garden Ledger — today
      { specIdx: 11, hoursBack: 26,  assetIdx: 11 },  // CP 012 — yesterday
      { specIdx: 3,  hoursBack: 51,  assetIdx: 3 },   // The Library Table
      { specIdx: 4,  hoursBack: 72,  assetIdx: 4 },
      { specIdx: 5,  hoursBack: 96,  assetIdx: 5 },
    ];

    // Build 38 run records
    const runs: Array<{
      specId: string; assetId: string; daysBack: number; hoursBack?: number;
    }> = [];

    // 5 recent ones with hour precision
    for (const r of recentRuns) {
      runs.push({ specId: fakeNotionId(specIds[r.specIdx]), assetId: ASSETS[r.assetIdx].id, daysBack: 0, hoursBack: r.hoursBack });
    }

    // 33 more spread over the last 90 days
    for (let i = 0; i < 33; i++) {
      const specIdx  = i % specIds.length;
      const assetIdx = i % ASSETS.length;
      runs.push({
        specId:  fakeNotionId(`${specIds[specIdx]}-run-${i}`),
        assetId: ASSETS[assetIdx].id,
        daysBack: Math.floor((i / 33) * 88) + 1,
      });
    }

    let runCreated = 0;
    let runSkipped = 0;
    for (const r of runs) {
      const startedAt  = r.hoursBack !== undefined ? hoursAgo(r.hoursBack) : daysAgo(r.daysBack);
      const completedAt = new Date(startedAt.getTime() + 4000 + Math.random() * 8000);
      const runId = fakeNotionId(`run-${r.specId}-${r.daysBack ?? r.hoursBack}`);

      const res = await client.query(`
        INSERT INTO worldsmith_runs (
          id, production_spec_id, operation, status, dry_run,
          asset_id, asset_version,
          provider, model_name,
          retry_count, initiated_by,
          started_at, completed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `, [
        runId,
        r.specId,
        "validate_and_compile",
        "complete",
        false,
        r.assetId,
        "v001",
        "dalle3",
        "dall-e-3",
        0,
        "seed",
        startedAt.toISOString(),
        completedAt.toISOString(),
      ]);

      if (res.rowCount && res.rowCount > 0) runCreated++; else runSkipped++;
    }
    created += runCreated;
    console.log(`  ✓ ${runCreated} runs created, ${runSkipped} already existed (skipped)`);

    await client.query("COMMIT");

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log("\n════════════════════════════════════════");
    console.log("  Wychcombe seed complete");
    console.log("════════════════════════════════════════");
    console.log(`  Records created : ${created}`);
    console.log(`  Records updated : ${updated}`);
    console.log(`  Runs skipped    : ${runSkipped}`);
    if (warnings.length) {
      console.log("\n  Warnings:");
      for (const w of warnings) console.log(`  ⚠  ${w}`);
    }
    console.log("\n  ✓ Wychcombe is available in the World selector and ready for demonstration.");

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
