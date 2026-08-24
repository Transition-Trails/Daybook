#!/usr/bin/env node
/**
 * Verifies the post-migration contract used by the API.
 *
 * The expected ledger is derived from the checked-in Drizzle journal instead
 * of a hard-coded count, so adding a migration cannot silently weaken CI.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(packageDir, "drizzle");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");
const journal = JSON.parse(await readFile(journalPath, "utf8"));

const trackedMigrations = await Promise.all(
  journal.entries.map(async (entry) => {
    const sql = await readFile(path.join(migrationsDir, `${entry.tag}.sql`));
    return {
      tag: entry.tag,
      hash: createHash("sha256").update(sql).digest("hex"),
      createdAt: String(entry.when),
    };
  }),
);

const worldsmithContracts = {
  worldsmith_worlds: ["id", "name", "code"],
  worldsmith_assets: ["id", "asset_name", "production_spec_notion_id", "readiness_state"],
  worldsmith_runs: [
    "id",
    "production_spec_id",
    "status",
    "generated_filename",
    "notion_upload_id",
  ],
  worldsmith_spec_previews: [
    "id",
    "spec_page_id",
    "status",
    "preview_object_path",
    "output_metadata",
  ],
  worldsmith_production_packages: [
    "id",
    "production_spec_id",
    "prompt_hash",
    "provider",
    "model_name",
    "model_version",
    "effective_size",
    "quality",
    "filename",
    "visual_asset_notion_id",
    "notion_upload_id",
    "provider_request_id",
    "estimated_cost_usd",
    "actual_cost_usd",
    "status",
    "production_art_status",
    "error",
    "created_at",
    "updated_at",
  ],
  ws_collections: ["id", "world_id", "name"],
  ws_volumes: ["id", "world_id", "name"],
  ws_canon_records: ["id", "world_id", "name"],
  ws_canon_record_relations: ["from_record_id", "to_record_id"],
  ws_style_guides: ["id", "world_id", "name"],
  ws_component_specs: ["id", "world_id", "name"],
  ws_prompt_modules: ["id", "world_id", "name", "content"],
  ws_production_specs: ["id", "world_id", "production_item"],
  ws_prompt_payloads: ["id", "spec_id", "payload_version", "raw_payload"],
};

function fail(message) {
  throw new Error(`Migration verification failed: ${message}`);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const ledger = await pool.query(`
    SELECT hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY id
  `);

  if (ledger.rows.length !== trackedMigrations.length) {
    fail(
      `expected ${trackedMigrations.length} ledger rows from ${journalPath}, `
      + `found ${ledger.rows.length}`,
    );
  }

  const seenHashes = new Set();
  for (const [index, migration] of trackedMigrations.entries()) {
    const row = ledger.rows[index];
    if (row.hash !== migration.hash || String(row.created_at) !== migration.createdAt) {
      fail(
        `ledger row ${index + 1} does not match ${migration.tag} `
        + `(expected hash/timestamp ${migration.hash}/${migration.createdAt}, `
        + `found ${row.hash}/${row.created_at})`,
      );
    }
    if (seenHashes.has(row.hash)) {
      fail(`migration ${migration.tag} is recorded more than once`);
    }
    seenHashes.add(row.hash);
  }

  const tableNames = Object.keys(worldsmithContracts);
  const columns = await pool.query(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position
    `,
    [tableNames],
  );
  const columnsByTable = new Map();
  for (const row of columns.rows) {
    const tableColumns = columnsByTable.get(row.table_name) ?? new Set();
    tableColumns.add(row.column_name);
    columnsByTable.set(row.table_name, tableColumns);
  }

  for (const [tableName, requiredColumns] of Object.entries(worldsmithContracts)) {
    const actualColumns = columnsByTable.get(tableName);
    if (!actualColumns) {
      fail(`API-facing WorldSmith table ${tableName} is missing`);
    }
    const missingColumns = requiredColumns.filter(column => !actualColumns.has(column));
    if (missingColumns.length) {
      fail(`${tableName} is missing required columns: ${missingColumns.join(", ")}`);
    }

    // Exercise the same zero-row query shape the API uses without requiring
    // fixture data in a clean database.
    await pool.query(`SELECT * FROM "${tableName}" LIMIT 0`);
  }

  console.log(
    `✓ Verified ${trackedMigrations.length} tracked migrations exactly once `
    + `and ${tableNames.length} API-facing WorldSmith tables`,
  );
} finally {
  await pool.end();
}
