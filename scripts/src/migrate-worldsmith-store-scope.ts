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

const client = await pool.connect();
try {
  await client.query("BEGIN");
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
    SELECT id FROM stores WHERE id = 'store-house' FOR KEY SHARE;
  `);
  if (houseStore.rowCount !== 1) {
    throw new Error("WorldSmith store-scope migration requires the seeded 'store-house' store.");
  }
  await client.query(`
    UPDATE worldsmith_worlds
      SET store_id = 'store-house'
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
    VALUES ('store-house', true)
    ON CONFLICT (store_id)
    DO UPDATE SET worldsmith_enabled = true;
  `);
  await client.query("COMMIT");
  console.log("✓ WorldSmith store scope and feature flag");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}