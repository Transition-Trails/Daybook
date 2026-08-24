/**
 * Compatibility WorldSmith Editorial Suite repair implementation.
 *
 * New deployments must use `pnpm --filter @workspace/db run migrate`, whose
 * tracked ledger owns the complete WorldSmith API contract. Both standalone
 * entry points call this module only to repair older environments that cannot
 * yet use the tracked migration command.
 */

const HTML_FONT_REFERENCE = /<p>\s*Daybook Font:\s*([^<\r\n]+?)\s*<br\s*\/?>\s*Curated roles:\s*[^<\r\n]*(?:\s*<br\s*\/?>\s*Available variants:\s*[^<\r\n]*)?(?:\s*<br\s*\/?>\s*Source notes:\s*[\s\S]*?)?\s*<\/p>/gi;
const TEXT_FONT_REFERENCE = /(?:^|\r?\n)Daybook Font:[ \t]*([^\r\n]+?)[ \t]*\r?\nCurated roles:[ \t]*[^\r\n]*[ \t]*(?:\r?\nAvailable variants:[ \t]*[^\r\n]*[ \t]*)?(?:\r?\nSource notes:[ \t]*[^\r\n]*)?(?=\r?\n|$)/gim;

async function tableExists(client, schema, table) {
  const result = await client.query(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = $2
  `, [schema, table]);
  return result.rows.length > 0;
}

async function columnExists(client, schema, table, column) {
  const result = await client.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2 AND column_name = $3
  `, [schema, table, column]);
  return result.rows.length > 0;
}

function catalogTypography(font) {
  const pairings = Array.isArray(font.curated_pairings) ? font.curated_pairings : [];
  return {
    fontId: font.id,
    family: font.family_name,
    roles: pairings
      .filter((pairing) => pairing && typeof pairing.role === "string" && pairing.role.trim())
      .map((pairing) => ({
        role: pairing.role.trim(),
        ...(typeof pairing.weight === "string" && pairing.weight.trim() ? { weight: pairing.weight.trim() } : {}),
      })),
  };
}

async function backfillTypographyFromProse(client, table, proseColumn) {
  const fonts = await client.query(`
    SELECT id, family_name, curated_pairings
    FROM fonts
  `);
  const fontByFamily = new Map(
    fonts.rows.map((font) => [String(font.family_name).trim().toLowerCase(), font]),
  );
  const rows = await client.query(`
    SELECT id, ${proseColumn} AS prose
    FROM ${table}
  `);

  for (const row of rows.rows) {
    if (typeof row.prose !== "string" || !row.prose.includes("Daybook Font:")) continue;

    const typography = [];
    let prose = row.prose;
    let unmatched = false;
    for (const pattern of [HTML_FONT_REFERENCE, TEXT_FONT_REFERENCE]) {
      // RegExp instances with the global flag retain a cursor. Recreate the
      // matcher per row so a previous record cannot hide a later legacy block.
      const matches = Array.from(row.prose.matchAll(new RegExp(pattern.source, pattern.flags)));
      for (const match of matches) {
        const family = match[1]?.trim() ?? "";
        const font = fontByFamily.get(family.toLowerCase());
        if (!font) {
          unmatched = true;
          continue;
        }
        typography.push(catalogTypography(font));
        prose = prose.replace(match[0], "");
      }
    }

    if (typography.length > 0) {
      const distinct = Array.from(new Map(typography.map((choice) => [choice.fontId, choice])).values());
      await client.query(`
        UPDATE ${table}
        SET typography = $1::jsonb, ${proseColumn} = $2
        WHERE id = $3
      `, [JSON.stringify(distinct), prose, row.id]);
    }
    if (unmatched) {
      console.warn(`[worldsmith typography migration] ${table}:${row.id} contains an unmatched legacy font reference; prose was retained for manual review.`);
    }
  }
}

async function addTypographyOnce(client, schema, table, proseColumn) {
  if (!(await tableExists(client, schema, table))) return;
  if (await columnExists(client, schema, table, "typography")) return;

  await client.query(`ALTER TABLE ${table} ADD COLUMN typography JSONB NOT NULL DEFAULT '[]';`);
  await backfillTypographyFromProse(client, table, proseColumn);
}

export async function applyWorldsmithEditorialMigration(client, schema = "public") {
  // ── Collections ───────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ws_collections (
      id               TEXT PRIMARY KEY,
      world_id         TEXT NOT NULL,
      name             TEXT NOT NULL,
      season           TEXT,
      year             INTEGER,
      description      TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'draft',
      notion_page_id   TEXT,
      synced_at        TIMESTAMPTZ,
      created_by       TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_collections_world_idx ON ws_collections(world_id);`);

  // ── Volumes ───────────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ws_volumes (
      id               TEXT PRIMARY KEY,
      world_id         TEXT NOT NULL,
      collection_id    TEXT,
      name             TEXT NOT NULL,
      code             TEXT,
      status           TEXT NOT NULL DEFAULT 'draft',
      description      TEXT NOT NULL DEFAULT '',
      notion_page_id   TEXT,
      synced_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_volumes_world_idx ON ws_volumes(world_id);`);

  // ── Canon Records ─────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ws_canon_records (
      id                TEXT PRIMARY KEY,
      world_id          TEXT NOT NULL,
      name              TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'proposed',
      canon_type        TEXT,
      narrative_details TEXT NOT NULL DEFAULT '',
      historical_context TEXT NOT NULL DEFAULT '',
      visual_notes      TEXT NOT NULL DEFAULT '',
       typography        JSONB NOT NULL DEFAULT '[]',
      spec_ref_count    INTEGER NOT NULL DEFAULT 0,
      notion_page_id    TEXT,
      synced_at         TIMESTAMPTZ,
      created_by        TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_canon_records_world_idx ON ws_canon_records(world_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_canon_records_status_idx ON ws_canon_records(status);`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS emotional_register TEXT;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS sensory_clauses TEXT NOT NULL DEFAULT '';`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS register_locked BOOLEAN NOT NULL DEFAULT FALSE;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS narrative_visibility TEXT;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS temporal_scope TEXT;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS canon_stability TEXT;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS from_entity_id TEXT;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS to_entity_id TEXT;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS emotional_valence TEXT;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS portrait_url TEXT;`);
  await client.query(`ALTER TABLE ws_canon_records ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';`);

  // ── Style Guides ──────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ws_style_guides (
      id               TEXT PRIMARY KEY,
      world_id         TEXT NOT NULL,
      name             TEXT NOT NULL,
      content          TEXT NOT NULL DEFAULT '',
       typography       JSONB NOT NULL DEFAULT '[]',
      notion_page_id   TEXT,
      synced_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_style_guides_world_idx ON ws_style_guides(world_id);`);

  // Typography is backfilled only at column introduction. An empty array is a
  // deliberate author state, so re-running this migration must never revisit it.
  await addTypographyOnce(client, schema, "ws_canon_records", "visual_notes");
  await addTypographyOnce(client, schema, "ws_style_guides", "content");
  await addTypographyOnce(client, schema, "worldsmith_worlds", "visual_palette");

  // ── Component Specs ───────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ws_component_specs (
      id               TEXT PRIMARY KEY,
      world_id         TEXT NOT NULL,
      name             TEXT NOT NULL,
      component_type   TEXT NOT NULL,
      content          TEXT NOT NULL DEFAULT '',
      notion_page_id   TEXT,
      synced_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_component_specs_world_idx ON ws_component_specs(world_id);`);

  // ── Prompt Modules ────────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ws_prompt_modules (
      id               TEXT PRIMARY KEY,
      world_id         TEXT NOT NULL,
      name             TEXT NOT NULL,
      section          TEXT NOT NULL DEFAULT 'general' CHECK (section IN ('world', 'style', 'general')),
      content          TEXT NOT NULL DEFAULT '',
      dependency_ids   JSONB NOT NULL DEFAULT '[]',
      notion_page_id   TEXT,
      synced_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_prompt_modules_world_idx ON ws_prompt_modules(world_id);`);
  const sectionColumn = await client.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = $1
      AND table_name = 'ws_prompt_modules'
      AND column_name = 'section'
  `, [schema]);
  if (sectionColumn.rowCount === 0) {
    await client.query(`
      ALTER TABLE ws_prompt_modules
      ADD COLUMN section TEXT NOT NULL DEFAULT 'general'
      CHECK (section IN ('world', 'style', 'general'));
    `);
    await client.query(`
      UPDATE ws_prompt_modules
      SET section = CASE
        WHEN LOWER(name) LIKE '%style%' OR LOWER(name) LIKE '%aesthetic%' THEN 'style'
        WHEN LOWER(name) LIKE '%world%' THEN 'world'
        ELSE 'general'
      END;
    `);
  }

  // ── Production Specs ──────────────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ws_production_specs (
      id                    TEXT PRIMARY KEY,
      world_id              TEXT NOT NULL,
      collection_id         TEXT,
      volume_id             TEXT,
      production_item       TEXT NOT NULL,
      spec_id               TEXT,
      component_type        TEXT NOT NULL,
      component_set         TEXT,
      hero_family           TEXT,
      current_version       TEXT NOT NULL DEFAULT '1',
      design_intent         TEXT NOT NULL DEFAULT '',
      narrative_purpose     TEXT NOT NULL DEFAULT '',
      required_content      TEXT NOT NULL DEFAULT '',
      review_criteria       TEXT NOT NULL DEFAULT '',
      writing_space_percent REAL,
      orientation           TEXT,
      front_back_style      TEXT,
      canon_dependency      TEXT NOT NULL DEFAULT 'None',
      canon_record_ids      JSONB NOT NULL DEFAULT '[]',
      payload_version       TEXT,
      prompt_payload        TEXT NOT NULL DEFAULT '',
      style_guide_id        TEXT,
      component_spec_id     TEXT,
      prompt_module_ids     JSONB NOT NULL DEFAULT '[]',
      status                TEXT NOT NULL DEFAULT 'draft',
      compiled_prompt_status TEXT NOT NULL DEFAULT 'Not Compiled',
      readiness_score       INTEGER NOT NULL DEFAULT 0,
      notion_page_id        TEXT,
      synced_at             TIMESTAMPTZ,
      created_by            TEXT,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_production_specs_world_idx ON ws_production_specs(world_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_production_specs_status_idx ON ws_production_specs(status);`);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_production_specs_collection_idx ON ws_production_specs(collection_id);`);

  // ── Prompt Payload Revisions ──────────────────────────────────────────────
  await client.query(`
    CREATE TABLE IF NOT EXISTS ws_prompt_payloads (
      id               TEXT PRIMARY KEY,
      spec_id          TEXT NOT NULL,
      payload_version  TEXT NOT NULL,
      raw_payload      TEXT NOT NULL,
      shared_prompt    TEXT,
      front_prompt     TEXT,
      back_prompt      TEXT,
      negative_prompt  TEXT,
      is_current       BOOLEAN NOT NULL DEFAULT true,
      notion_page_id   TEXT,
      synced_at        TIMESTAMPTZ,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS ws_prompt_payloads_spec_idx ON ws_prompt_payloads(spec_id);`);
}

export async function runWorldsmithEditorialMigration(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await applyWorldsmithEditorialMigration(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}