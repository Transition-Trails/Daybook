/**
 * seed-backgrounds — inserts 8 starter platform backgrounds.
 *
 * Run: pnpm --filter @workspace/scripts run seed-backgrounds
 *
 * Uses raw SQL for the existence check (avoids drizzle-orm helper imports).
 * IDs are stable string literals so re-runs are safely idempotent.
 *
 * The 8 starters:
 *   Solid colours:  Warm Cream, Fog White, Charcoal
 *   Textures:       Linen, Kraft
 *   Images:         Soft Grid, Dot Grid (inline SVG data-URIs), Cloud Paper
 */
import { db, pool, backgroundsTable } from "@workspace/db";

// ── Tiny inline SVG data-URIs (no external dependency) ──────────────────────

const GRID_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='20' height='20' fill='%23FFFDF9'/><path d='M20 0H0v20' fill='none' stroke='%23E7DCCB' stroke-width='0.5'/></svg>`
)}`;

const DOT_SVG = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><rect width='16' height='16' fill='%23FFFDF9'/><circle cx='8' cy='8' r='1.2' fill='%23D4C5B0'/></svg>`
)}`;

const STARTERS: Array<{ id: string; name: string; type: string; assetRef: string }> = [
  // Solid colours
  { id: "bg_starter_warm_cream",  name: "Warm Cream",  type: "color",   assetRef: "#F7F0E6" },
  { id: "bg_starter_fog_white",   name: "Fog White",   type: "color",   assetRef: "#F9F8F6" },
  { id: "bg_starter_charcoal",    name: "Charcoal",    type: "color",   assetRef: "#2D3540" },
  // Named textures (renderer resolves slug to tile pattern at generation time)
  { id: "bg_starter_linen",       name: "Linen",       type: "texture", assetRef: "linen"   },
  { id: "bg_starter_kraft",       name: "Kraft",       type: "texture", assetRef: "kraft"   },
  // SVG pattern images
  { id: "bg_starter_soft_grid",   name: "Soft Grid",   type: "image",   assetRef: GRID_SVG  },
  { id: "bg_starter_dot_grid",    name: "Dot Grid",    type: "image",   assetRef: DOT_SVG   },
  // External reference example
  { id: "bg_starter_cloud_paper", name: "Cloud Paper", type: "image",   assetRef: "https://www.transparenttextures.com/patterns/white-wall.png" },
];

async function run() {
  console.log("🌅  Seeding starter backgrounds…");
  let inserted = 0;
  let skipped  = 0;

  for (const s of STARTERS) {
    // Raw SQL existence check — avoids drizzle-orm helper imports
    const { rows } = await pool.query<{ id: string }>(
      "SELECT id FROM backgrounds WHERE id = $1 LIMIT 1",
      [s.id],
    );

    if (rows.length > 0) {
      console.log(`  ⏭  Skipping "${s.name}" (already exists)`);
      skipped++;
      continue;
    }

    await db.insert(backgroundsTable).values({
      id:       s.id,
      name:     s.name,
      type:     s.type,
      assetRef: s.assetRef,
      status:   "live",
      origin:   "starter",
    });
    console.log(`  ✅  Inserted "${s.name}" (${s.type})`);
    inserted++;
  }

  console.log(`\nDone — ${inserted} inserted, ${skipped} skipped.`);
  process.exit(0);
}

run().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
