/**
 * Adds store ownership and the WorldSmith flag.
 *
 * Existing worlds are assigned to the house store, preserving their current
 * platform availability while preventing them from being exposed to other stores.
 *
 * Run:
 *   pnpm --filter @workspace/scripts run migrate-worldsmith-store-scope
 */
import { pool } from "@workspace/db";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type SqlResult = {
  rowCount: number | null;
  rows: Array<{ count?: number }>;
};

export interface WorldsmithScopeMigrationClient {
  query(sql: string): Promise<SqlResult>;
  release(): void;
}

export interface WorldsmithScopeMigrationPool {
  connect(): Promise<WorldsmithScopeMigrationClient>;
  end(): Promise<void>;
}

const HOUSE_STORE_ID = "store-house";

/**
 * Applies the schema changes and legacy-world backfill inside an existing
 * transaction. Separating this from connection lifecycle keeps the
 * all-or-nothing migration behavior directly testable.
 */
export async function applyWorldsmithStoreScopeMigration(
  client: WorldsmithScopeMigrationClient,
  houseStoreId = HOUSE_STORE_ID,
): Promise<void> {
  const escapedHouseStoreId = houseStoreId.replaceAll("'", "''");
  await client.query(`
    ALTER TABLE store_flags
      ADD COLUMN IF NOT EXISTS worldsmith_enabled BOOLEAN NOT NULL DEFAULT false;
  `);
  await client.query(`
    ALTER TABLE worldsmith_worlds
      ADD COLUMN IF NOT EXISTS store_id TEXT REFERENCES stores(id) ON DELETE CASCADE;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS worldsmith_worlds_store_id_idx
      ON worldsmith_worlds (store_id);
  `);
  const houseStore = await client.query(`
    SELECT id FROM stores WHERE id = '${escapedHouseStoreId}' FOR KEY SHARE;
  `);
  if (houseStore.rowCount !== 1) {
    throw new Error(`WorldSmith store-scope migration requires the seeded '${houseStoreId}' store.`);
  }
  await client.query(`
    UPDATE worldsmith_worlds
      SET store_id = '${escapedHouseStoreId}'
      WHERE store_id IS NULL;
  `);
  const unownedWorlds = await client.query(`
    SELECT COUNT(*)::int AS count FROM worldsmith_worlds WHERE store_id IS NULL;
  `);
  if (unownedWorlds.rows[0]?.count !== 0) {
    throw new Error("WorldSmith store-scope migration left unowned worlds; transaction rolled back.");
  }
  await client.query(`
    INSERT INTO store_flags (store_id, worldsmith_enabled)
    VALUES ('${escapedHouseStoreId}', true)
    ON CONFLICT (store_id)
    DO UPDATE SET worldsmith_enabled = true;
  `);
}

export async function runWorldsmithStoreScopeMigration(
  migrationPool: WorldsmithScopeMigrationPool = pool,
  houseStoreId = HOUSE_STORE_ID,
): Promise<void> {
  const client = await migrationPool.connect();
  try {
    await client.query("BEGIN");
    await applyWorldsmithStoreScopeMigration(client, houseStoreId);
    await client.query("COMMIT");
    console.log("✓ WorldSmith store scope and feature flag");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await migrationPool.end();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await runWorldsmithStoreScopeMigration();
}