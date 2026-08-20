/**
 * Adds the safe GitHub review metadata used by platform releases.
 *
 * Run: pnpm --filter @workspace/scripts run migrate-release-github-review
 */
import { pool } from "@workspace/db";

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      ALTER TABLE releases
        ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'draft',
        ADD COLUMN IF NOT EXISTS review_branch TEXT,
        ADD COLUMN IF NOT EXISTS pull_request_url TEXT,
        ADD COLUMN IF NOT EXISTS pull_request_number INTEGER,
        ADD COLUMN IF NOT EXISTS review_commit_sha TEXT,
        ADD COLUMN IF NOT EXISTS review_attempt INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS review_error TEXT,
        ADD COLUMN IF NOT EXISTS review_requested_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;
    `);
    await client.query("COMMIT");
    console.log("✓ release GitHub review metadata is ready");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Release GitHub review migration failed:", error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();