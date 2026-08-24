/**
 * migrate-worldsmith-editorial — compatibility repair for legacy databases.
 *
 * New deployments: pnpm --filter @workspace/db run migrate
 *
 * SAFE: uses CREATE TABLE IF NOT EXISTS; idempotent.
 */
import { pool } from "@workspace/db";
import { runWorldsmithEditorialMigration } from "./worldsmith-editorial-migration.mjs";

runWorldsmithEditorialMigration(pool)
  .then(() => console.log("\n✓ WorldSmith Editorial Suite migration complete (8 tables created or already exist)."))
  .catch((error) => {
    console.error("Migration failed, rolled back:", error);
    process.exit(1);
  });
