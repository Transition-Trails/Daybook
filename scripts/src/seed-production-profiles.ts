import { pool } from "@workspace/db";

const punchId = "00000000-0000-4000-8000-000000000901";
const profiles = [
  ["DIG-FULL", "Digital Planner — Full Page", null, null, "digital", "none", 0, 0, 0, "none", null],
  ["DISC-HPC-925", "Disc-Bound — Happy Planner Classic — 7 × 9.25", 7, 9.25, "print", "disc_bound", .125, .25, .75, "mirrored", punchId],
  ["DISC-HL-85", "Disc-Bound — Half Letter — 5.5 × 8.5", 5.5, 8.5, "print", "disc_bound", .125, .25, .75, "mirrored", null],
  ["DISC-LTR-11", "Disc-Bound — US Letter — 8.5 × 11", 8.5, 11, "print", "disc_bound", .125, .25, .75, "mirrored", null],
] as const;

const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`INSERT INTO ws_punch_templates
    (id,name,code,binding_type,status,disc_count,reference_page_height,units,version)
    VALUES ($1,$2,'PUNCH-9D-CLASSIC-V1','disc_bound','draft',9,9.25,'inches',1)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, disc_count=9, reference_page_height=9.25,
      units='inches', version=1`, [punchId, "9-Disc Classic — v1"]);
  for (const [code, name, width, height, medium, binding, bleed, margin, zone, edge, punch] of profiles) {
    await client.query(`INSERT INTO ws_production_profiles
      (id,name,code,status,output_medium,finished_width,finished_height,units,orientation_behavior,
       bleed,outer_safe_margin,binding_type,binding_safe_zone,binding_edge_behavior,punch_template_id,punch_template_version)
       VALUES (md5($2)::uuid,$1,$2,$3,$4,$5,$6,'inches',$13,$7,$8,$9,$10,$11,$12,$14)
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,output_medium=EXCLUDED.output_medium,
       finished_width=EXCLUDED.finished_width,finished_height=EXCLUDED.finished_height,bleed=EXCLUDED.bleed,
       outer_safe_margin=EXCLUDED.outer_safe_margin,binding_type=EXCLUDED.binding_type,binding_safe_zone=EXCLUDED.binding_safe_zone,
       binding_edge_behavior=EXCLUDED.binding_edge_behavior,punch_template_id=EXCLUDED.punch_template_id,
       punch_template_version=EXCLUDED.punch_template_version,orientation_behavior=EXCLUDED.orientation_behavior`,
      [name, code, medium === "digital" ? "draft" : "active", medium, width, height, bleed, margin, binding, binding === "none" ? 0 : zone, binding === "none" ? "none" : edge, punch, medium === "digital" ? "supports_both" : "fixed_portrait", punch ? 1 : null]);
  }
  await client.query(`UPDATE ws_production_profiles p
    SET punch_template_snapshot = jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'code', t.code,
      'bindingType', t.binding_type,
      'status', t.status,
      'discCount', t.disc_count,
      'referencePageHeight', t.reference_page_height,
      'units', t.units,
      'punchCenterSpacing', t.punch_center_spacing,
      'edgeOffset', t.edge_offset,
      'mushroomHeadDiameter', t.mushroom_head_diameter,
      'stemWidth', t.stem_width,
      'stemDepth', t.stem_depth,
      'topOffset', t.top_offset,
      'bottomOffset', t.bottom_offset,
      'manufacturingTolerance', t.manufacturing_tolerance,
      'version', t.version
    )
    FROM ws_punch_templates t
    WHERE p.punch_template_id = t.id
      AND p.punch_template_snapshot IS NULL`);
  await client.query("COMMIT");
} catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); await pool.end(); }