import { pool } from "@workspace/db";

async function q(sql: string): Promise<unknown[]> {
  const r = await pool.query(sql);
  return r.rows;
}

async function main() {
  const [hw, acc, fnt, rp, nb, pc, ur, ebt, rpX, pcS, edS, hwS, accS, fntS, gpS] =
    await Promise.all([
      q("SELECT COUNT(*) AS n FROM hardware"),
      q("SELECT COUNT(*) AS n FROM accessories"),
      q("SELECT COUNT(*) AS n FROM fonts"),
      q("SELECT COUNT(*) AS n FROM related_products"),
      q("SELECT COUNT(*) AS n FROM editions WHERE product_type IN ('notebook','journal','memory-keeping')"),
      q("SELECT COUNT(*) AS n FROM planner_configs"),
      q("SELECT COUNT(*) AS n FROM planner_configs pc WHERE NOT EXISTS (SELECT 1 FROM editions e WHERE e.id = pc.edition_id)"),
      q("SELECT product_type, COUNT(*) AS n FROM editions GROUP BY product_type ORDER BY product_type"),
      q("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='related_products') AS exists"),
      q("SELECT id, edition_id FROM planner_configs LIMIT 4"),
      q("SELECT id, product_type, name FROM editions WHERE product_type IN ('notebook','journal','memory-keeping') LIMIT 8"),
      q("SELECT name, kind, finish FROM hardware ORDER BY name LIMIT 6"),
      q("SELECT name, kind FROM accessories ORDER BY name LIMIT 6"),
      q("SELECT family_name, status FROM fonts ORDER BY family_name LIMIT 6"),
      q("SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest, COUNT(*) AS n FROM generated_planners").catch(() => [{ n: "table_missing" }]),
    ]);

  console.log(JSON.stringify({
    "1_hardware_count":            (hw[0]  as any).n,
    "1_accessories_count":         (acc[0] as any).n,
    "1_fonts_count":               (fnt[0] as any).n,
    "1_hw_sample":                 hwS,
    "1_acc_sample":                accS,
    "1_fnt_sample":                fntS,
    "2_related_products_legacy":   (rp[0]  as any).n,
    "2_notebook_editions":         (nb[0]  as any).n,
    "2_planner_configs_total":     (pc[0]  as any).n,
    "2_unresolvable_configs":      (ur[0]  as any).n,
    "2_editions_by_type":          ebt,
    "2_rp_table_still_in_db":      (rpX[0] as any).exists,
    "2_planner_config_sample":     pcS,
    "2_notebook_edition_sample":   edS,
    "generated_planners":          gpS[0],
  }, null, 2));
}

main()
  .catch(e => { console.error("QUERY ERROR:", e.message); process.exit(1); })
  .finally(async () => { await pool.end(); process.exit(0); });
