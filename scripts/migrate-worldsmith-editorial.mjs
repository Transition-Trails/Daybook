/**
 * WorldSmith Editorial Suite migration — creates all local-first editorial tables.
 * Run with: node scripts/migrate-worldsmith-editorial.mjs
 */
import pg from "pg";
import { runWorldsmithEditorialMigration } from "./src/worldsmith-editorial-migration.mjs";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

runWorldsmithEditorialMigration(pool).then(() => {
  console.log("✓ WorldSmith Editorial Suite tables created (or already exist)");
  console.log("  Tables: ws_collections, ws_volumes, ws_canon_records, ws_style_guides,");
  console.log("          ws_component_specs, ws_prompt_modules, ws_production_specs, ws_prompt_payloads");
}).catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});