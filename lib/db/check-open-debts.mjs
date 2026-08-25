#!/usr/bin/env node
/**
 * Answers the review questions that the repository cannot answer.
 *
 * Several open findings depend on the state of the RUNNING database rather than
 * on the code — most importantly D110, where a unique index lives inside the
 * migration that created its table, so whether it exists depends on when that
 * migration was applied. Reading the SQL file proves nothing.
 *
 * Run:  DATABASE_URL=... node lib/db/check-open-debts.mjs
 *
 * Exit 0 = nothing to do. Exit 1 = at least one item needs action; the exact
 * corrective SQL is printed. Read-only: this script never writes.
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(2);
}

const results = [];
function record(id, title, status, detail, fix) {
  results.push({ id, title, status, detail, fix });
}

const client = new Client({ connectionString: url });

try {
  await client.connect();

  // ── D110 — the planner interior version unique constraint ─────────────────
  // Check by COLUMNS, not by name. An equivalent constraint under a different
  // name still satisfies the invariant; a same-named index on the wrong columns
  // does not.
  const versionIndex = await client.query(`
    SELECT i.relname AS index_name, ix.indisunique AS is_unique
    FROM pg_class t
    JOIN pg_index ix        ON ix.indrelid = t.oid
    JOIN pg_class i         ON i.oid = ix.indexrelid
    WHERE t.relname = 'planner_interior_versions'
      AND ix.indisunique
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM pg_attribute a
        WHERE a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      ) = ARRAY['interior_id','version']::name[]
  `);

  if (versionIndex.rowCount > 0) {
    record(
      "D110",
      "planner_interior_versions unique (interior_id, version)",
      "OK",
      `present as "${versionIndex.rows[0].index_name}"`,
    );
  } else {
    record(
      "D110",
      "planner_interior_versions unique (interior_id, version)",
      "ACTION",
      "MISSING — createInteriorVersion's retry has no constraint behind it, so two "
        + "concurrent saves can both claim the same version number",
      `-- new numbered migration, NOT an edit to 0016
CREATE UNIQUE INDEX IF NOT EXISTS "planner_interior_versions_interior_version_uq"
  ON "planner_interior_versions" ("interior_id", "version");`,
    );
  }

  // Duplicates would block the index above, so report them together.
  if (versionIndex.rowCount === 0) {
    const dupes = await client.query(`
      SELECT interior_id, version, count(*) AS n
      FROM planner_interior_versions
      GROUP BY interior_id, version HAVING count(*) > 1
    `);
    if (dupes.rowCount > 0) {
      record(
        "D110b",
        "Duplicate version numbers already in the table",
        "ACTION",
        `${dupes.rowCount} (interior_id, version) pair(s) are duplicated — the index will "
          + "fail until these are resolved`,
        "-- inspect, then renumber the later row of each pair:\n"
          + "SELECT * FROM planner_interior_versions WHERE (interior_id, version) IN (…) ORDER BY created_at;",
      );
    }
  }

  // ── 0023 — confirm users.role is actually gone ────────────────────────────
  // Same class of question as D110: the migration exists in the repo, but only
  // the live schema knows whether it ran.
  const legacyRole = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  `);
  record(
    "W12",
    "users.role dropped (migration 0023)",
    legacyRole.rowCount === 0 ? "OK" : "ACTION",
    legacyRole.rowCount === 0
      ? "column absent — the legacy ladder is gone from the database too"
      : "column still present — 0023 has not been applied to this database",
    legacyRole.rowCount === 0 ? undefined : "pnpm --filter @workspace/db run migrate",
  );

  // ── D122 — how many editions are actually priced at zero ──────────────────
  // The decision is cheap either way; knowing the count tells you whether it is
  // urgent or theoretical.
  const prices = await client.query(`
    SELECT
      count(*) FILTER (WHERE digital_price_cents = 0)   AS zero,
      count(*) FILTER (WHERE digital_price_cents IS NULL) AS unpriced,
      count(*) FILTER (WHERE digital_price_cents > 0)   AS priced
    FROM editions
  `);
  const { zero, unpriced, priced } = prices.rows[0];
  record(
    "D122",
    "Editions priced at zero",
    Number(zero) > 0 ? "ACTION" : "OK",
    `${zero} at zero, ${unpriced} unpriced (not purchasable), ${priced} priced`,
    Number(zero) > 0
      ? "Each zero-priced edition currently shows a buy affordance and fails at Stripe's\n"
        + "minimum-charge floor. Either exclude zero in isPurchasableCatalogItem:\n"
        + "  typeof price === \"number\" && Number.isInteger(price) && price > 0\n"
        + "or give free items a claim path that writes the order without Stripe."
      : "No zero-priced editions exist, so the guard is preventative. Still worth deciding:\n"
        + "  price > 0 in isPurchasableCatalogItem is a one-word change.",
  );

  // ── D120 — did the house store get a real owner back ──────────────────────
  const houseOwner = await client.query(`
    SELECT s.owner_user_id, u.provider, u.platform_role
    FROM stores s LEFT JOIN users u ON u.id = s.owner_user_id
    WHERE s.id = 'store-house'
  `);
  if (houseOwner.rowCount === 0) {
    record("D120", "store-house owner", "OK", "no store-house row on this database");
  } else {
    const row = houseOwner.rows[0];
    const synthetic = row.owner_user_id === "user-platform-system" || row.provider === "system";
    record(
      "D120",
      "store-house owner can sign in",
      synthetic ? "ACTION" : "OK",
      synthetic
        ? `owned by ${row.owner_user_id} (provider: ${row.provider}) — a synthetic account`
        : `owned by ${row.owner_user_id} (platform_role: ${row.platform_role ?? "none"})`,
      synthetic
        ? `UPDATE stores SET owner_user_id = (
  SELECT id FROM users WHERE platform_role = 'super_admin' ORDER BY created_at, id LIMIT 1
) WHERE id = 'store-house' AND owner_user_id = 'user-platform-system';`
        : undefined,
    );
  }

  // ── Orphaned orders — residue from the 'platform' store-id era ────────────
  const orphanOrders = await client.query(`
    SELECT count(*) AS n FROM orders o
    LEFT JOIN stores s ON s.id = o.store_id
    WHERE s.id IS NULL
  `);
  record(
    "D112",
    "Orders pointing at a store that does not exist",
    Number(orphanOrders.rows[0].n) === 0 ? "OK" : "ACTION",
    `${orphanOrders.rows[0].n} orphaned order(s)`,
    Number(orphanOrders.rows[0].n) === 0
      ? undefined
      : "These predate the foreign key. Repoint them at store-platform or delete them,\n"
        + "then confirm orders_store_id_stores_id_fk exists.",
  );

  // ── Unswept checkout intents ──────────────────────────────────────────────
  const staleIntents = await client.query(`
    SELECT count(*) AS n FROM checkout_intents WHERE expires_at < now()
  `);
  record(
    "W9",
    "Expired checkout_intents never swept",
    Number(staleIntents.rows[0].n) > 1000 ? "ACTION" : "OK",
    `${staleIntents.rows[0].n} expired row(s)`,
    Number(staleIntents.rows[0].n) > 1000
      ? "DELETE FROM checkout_intents WHERE expires_at < now() - interval '7 days';\n"
        + "-- then schedule it; the expires_at index already supports this."
      : undefined,
  );
} catch (err) {
  console.error("\nCheck failed:", err.message);
  console.error("(A missing table means the migration for it has not been applied here.)");
  process.exit(2);
} finally {
  await client.end();
}

// ── Report ──────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const action = results.filter((r) => r.status === "ACTION");

console.log("\nDaybook — open-debt check\n" + "=".repeat(60));
for (const r of results) {
  console.log(`${r.status === "OK" ? "  ok  " : " ACTION"}  ${pad(r.id, 6)} ${r.title}`);
  console.log(`          ${r.detail}`);
}

if (action.length === 0) {
  console.log("\nAll clear. Record this run in github.md so the questions stop being open.\n");
  process.exit(0);
}

console.log("\n" + "=".repeat(60));
console.log(`${action.length} item(s) need action:\n`);
for (const r of action) {
  console.log(`── ${r.id} ${r.title} ─────────────`);
  if (r.fix) console.log(r.fix);
  console.log("");
}
console.log("Paste the output above into github.md — a written answer closes the finding.\n");
process.exit(1);
