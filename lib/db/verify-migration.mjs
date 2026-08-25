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
import {
  classifyMigrationLedger,
  describeLedgerRecovery,
  describeLedgerSchemaRecovery,
  describeLedgerTypeRecovery,
  incompatibleLedgerColumns,
  missingLedgerColumns,
} from "./migration-ledger.mjs";

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
  // Store-scoped WorldSmith access checks this feature flag before loading a
  // world's editorial data.
  store_flags: ["store_id", "worldsmith_enabled"],
  worldsmith_worlds: [
    "id", "store_id", "name", "code", "description", "status", "cover_color",
    "cover_accent", "current_collection", "current_volume", "owner", "tags",
    "notion_production_db_id", "notion_canon_db_id", "notion_style_guide_id",
    "notion_style_guides_db_id", "world_rules", "visual_palette", "prose_voice",
    "atmospheric_notes", "material_world", "typography", "style_guide_version",
    "drive_folder_id", "image_provider", "cover_image_url", "created_by",
    "created_at", "updated_at",
  ],
  worldsmith_assets: [
    "id", "asset_name", "asset_type", "world", "volume", "component_type",
    "current_version", "filename", "production_spec_notion_id",
    "visual_asset_notion_id", "drive_file_id", "drive_url", "prompt_hash",
    "generation_provider", "model_name", "provider_request_id", "readiness_state",
    "created_at", "updated_at",
  ],
  worldsmith_runs: [
    "id", "production_spec_id", "operation", "status", "dry_run", "payload_version",
    "compiled_prompt", "prompt_hash", "compiled_prompt_status",
    "visual_asset_notion_id", "asset_id", "asset_version", "provider", "model_name",
    "model_version", "generation_settings", "seed", "provider_request_id", "cost_usd",
    "generated_filename", "notion_upload_id", "drive_file_id", "drive_folder_id",
    "drive_url", "daybook_asset_id", "errors", "warnings", "failed_stage",
    "error_code", "resolved_source_ids", "retry_count", "notion_retries",
    "compiled_sections", "initiated_by", "started_at", "completed_at",
  ],
  worldsmith_spec_previews: [
    "id", "spec_page_id", "prompt_hash", "template_version", "status",
    "preview_filename", "preview_object_path", "provider", "model", "notion_upload_id",
    "production_item", "previous_status", "new_status", "notion_page_url", "error",
    "dry_run", "output_metadata", "created_at",
  ],
  worldsmith_production_packages: [
    "id", "production_spec_id", "prompt_hash", "provider", "model_name",
    "model_version", "effective_size", "quality", "filename", "visual_asset_notion_id",
    "notion_upload_id", "provider_request_id", "estimated_cost_usd", "actual_cost_usd",
    "status", "production_art_status", "error", "created_at", "updated_at",
  ],
  worldsmith_image_targets: [
    "component_type", "print_width_in", "print_height_in", "created_at", "updated_at",
  ],
  ws_collections: [
    "id", "world_id", "name", "season", "year", "description", "status",
    "notion_page_id", "synced_at", "created_by", "created_at", "updated_at",
  ],
  ws_volumes: [
    "id", "world_id", "collection_id", "name", "code", "status", "description",
    "notion_page_id", "synced_at", "created_at", "updated_at",
  ],
  ws_canon_records: [
    "id", "world_id", "name", "status", "canon_type", "narrative_details",
    "historical_context", "visual_notes", "typography", "emotional_register",
    "sensory_clauses", "register_locked", "narrative_visibility", "temporal_scope",
    "canon_stability", "from_entity_id", "to_entity_id", "emotional_valence",
    "portrait_url", "notes", "spec_ref_count", "notion_page_id", "synced_at",
    "created_by", "created_at", "updated_at",
  ],
  ws_canon_record_relations: [
    "from_record_id", "to_record_id", "relation_type", "created_at",
  ],
  ws_style_guides: [
    "id", "world_id", "name", "content", "typography", "notion_page_id",
    "synced_at", "created_at", "updated_at",
  ],
  ws_component_specs: [
    "id", "world_id", "name", "component_type", "content", "notion_page_id",
    "synced_at", "created_at", "updated_at",
  ],
  ws_prompt_modules: [
    "id", "world_id", "name", "section", "content", "dependency_ids",
    "notion_page_id", "synced_at", "created_at", "updated_at",
  ],
  ws_production_specs: [
    "id", "world_id", "collection_id", "volume_id", "production_item", "spec_id",
    "component_type", "component_set", "hero_family", "current_version",
    "design_intent", "narrative_purpose", "required_content", "review_criteria",
    "writing_space_percent", "orientation", "front_back_style", "canon_dependency",
    "canon_record_ids", "payload_version", "prompt_payload", "style_guide_id",
    "component_spec_id", "prompt_module_ids", "status", "compiled_prompt_status",
    "readiness_score", "notion_page_id", "synced_at", "created_by", "created_at",
    "updated_at",
  ],
  ws_prompt_payloads: [
    "id", "spec_id", "payload_version", "raw_payload", "shared_prompt",
    "front_prompt", "back_prompt", "negative_prompt", "is_current", "notion_page_id",
    "synced_at", "created_at",
  ],
  ws_stories: [
    "id", "world_id", "title", "summary", "status", "sort_order", "created_by",
    "created_at", "updated_at",
  ],
  ws_story_acts: [
    "id", "story_id", "world_id", "act_number", "title", "tagline", "created_at",
    "updated_at",
  ],
  ws_encounters: [
    "id", "act_id", "location_record_id", "trigger_text", "description", "roll_type",
    "outcome_text", "created_at", "updated_at",
  ],
  ws_journal_prompts: [
    "id", "record_id", "story_id", "prompt_text", "hint_label", "sort_order",
    "created_at",
  ],
  ws_canon_record_story_links: [
    "canon_record_id", "story_id", "act_id", "created_at",
  ],
};

function fail(message) {
  throw new Error(`Migration verification failed: ${message}`);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const ledgerColumns = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'drizzle'
      AND table_name = '__drizzle_migrations'
  `);
  const missingColumns = missingLedgerColumns(
    ledgerColumns.rows.map((row) => row.column_name),
  );
  if (missingColumns.length) {
    fail(describeLedgerSchemaRecovery(missingColumns));
  }
  const incompatibleColumns = incompatibleLedgerColumns(ledgerColumns.rows);
  if (incompatibleColumns.length) {
    fail(describeLedgerTypeRecovery(incompatibleColumns));
  }

  const ledger = await pool.query(`
    SELECT hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY id
  `);

  const ledgerClassification = classifyMigrationLedger(ledger.rows, trackedMigrations);
  if (ledgerClassification.kind === "invalid") {
    fail(describeLedgerRecovery(ledgerClassification));
  }
  if (ledgerClassification.kind === "supportedHistorical") {
    fail(
      "the ledger is in the supported historical order and must be normalized by "
      + "`pnpm --filter @workspace/db run migrate` before verification",
    );
  }

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
