/**
 * Opt-in, disposable large-world search benchmark. Run against a development
 * database: pnpm --filter @workspace/api-server run benchmark:sequences
 * Never run against production: this inserts 5,000 temporary storylines.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { and, eq } from "drizzle-orm";
import { db, pool, usersTable, wsStoriesTable } from "@workspace/db";
import {
  executeViewTool, SEQUENCE_PAGE_SQL, sequenceRevisionQuery,
} from "../src/lib/worldsmith/mcp-editorial-views.js";

const SIZE = 5_000;
const PAGE_SIZE = 5;
// These bounds allow several times the baseline on a shared dev database,
// but catch a material regression before a five-item page becomes slow.
const MAX_SQL_MS = 250;
const MAX_P95_MS = 500;
const ORIGIN = "https://example.com";

type SearchResult = {
  total: number;
  references_total: number;
  sequences: Array<{ id: string; expected_revision: string }>;
  references: Array<{ id: string }>;
  revision: string;
  next_cursor: string | null;
  has_more: boolean;
};

function percentile95(samples: number[]): number {
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]!;
}

async function measurePlan(label: string, text: string, params: unknown[]) {
  const result = await pool.query<{ "QUERY PLAN": Array<{
    Plan: Record<string, unknown>; "Execution Time": number;
  }> }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${text}`, params);
  const plan = result.rows[0]!["QUERY PLAN"][0]!;
  const nodes: string[] = [];
  let tempBlocks = 0;
  function visit(node: Record<string, unknown>) {
    nodes.push(String(node["Node Type"]));
    tempBlocks += Number(node["Temp Read Blocks"] ?? 0) + Number(node["Temp Written Blocks"] ?? 0);
    for (const child of (node.Plans ?? []) as Record<string, unknown>[]) visit(child);
  }
  visit(plan.Plan);
  console.log(`${label} plan: ${plan["Execution Time"].toFixed(1)}ms, temp blocks ${tempBlocks}, ${[...new Set(nodes)].join(" → ")}`);
  assert.equal(tempBlocks, 0, `${label}: disk spill in grouping/sort/aggregate; inspect EXPLAIN plan`);
  assert.ok(plan["Execution Time"] < MAX_SQL_MS, `${label}: database execution exceeds ${MAX_SQL_MS}ms; inspect EXPLAIN plan`);
}

async function main() {
  assert.ok(process.env.DATABASE_URL, "A development DATABASE_URL is required");
  assert.notEqual(process.env.NODE_ENV, "production", "Do not benchmark against production");
  const [admin] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.platformRole, "super_admin")).limit(1);
  assert.ok(admin, "A seeded development super-admin is required");

  const worldId = `sequence-benchmark-${randomUUID()}`;
  // A temporary world with 500 references, 2,500 chronology groups (some
  // singletons), and 250 matching groups and references.
  try {
    await pool.query(
      "INSERT INTO worldsmith_worlds (id, name, code) VALUES ($1, 'Sequence benchmark', 'BENCH')",
      [worldId],
    );
    await pool.query(`
      INSERT INTO ws_stories (id, world_id, title, summary, sort_order, sequence_role)
      SELECT $1 || '-' || n, $1, 'Story ' || lpad(n::text, 5, '0'),
        CASE WHEN n % 20 IN (0, 1) THEN 'needle: reference context' ELSE 'ordinary context' END,
        (n + 1) / 2, CASE WHEN n % 10 = 0 THEN 'reference' ELSE 'chronological' END
      FROM generate_series(1, $2::int) AS n
    `, [worldId, SIZE]);
    await pool.query("ANALYZE ws_stories");

    const search = (args: Record<string, unknown>) =>
      executeViewTool(admin.id, "search_sequences", { world_id: worldId, limit: PAGE_SIZE, ...args }, ORIGIN) as Promise<SearchResult>;
    const cases = [
      { label: "unfiltered first page", args: {}, total: 2_500, references: 500 },
      { label: "filtered first page", args: { query: "needle" }, total: 250, references: 250 },
    ];
    for (const { label, args, total, references } of cases) {
      // Warm up connection pools and query plans; sample the complete path,
      // including references and the world-wide revision, not just SQL.
      const first = await search(args);
      assert.equal(first.total, total);
      assert.equal(first.references_total, references);
      assert.equal(first.references.length, references);
      assert.equal(first.sequences.length, PAGE_SIZE);
      assert.equal(first.has_more, true);
      const samples: number[] = [];
      for (let i = 0; i < 20; i++) {
        const start = performance.now();
        const result = await search(args);
        samples.push(performance.now() - start);
        assert.equal(result.revision, first.revision);
        assert.equal(result.total, total);
      }
      const cursor = await search({ ...args, after_id: first.next_cursor });
      assert.equal(cursor.total, total);
      assert.equal(cursor.revision, first.revision);
      assert.equal(cursor.sequences.length, PAGE_SIZE);
      assert.ok(cursor.sequences.every(group => !first.sequences.some(previous => previous.id === group.id)));
      assert.ok(cursor.sequences.every(group => group.expected_revision === first.revision));
      const p95 = percentile95(samples);
      console.log(`${label}: p95 ${p95.toFixed(1)}ms (${samples.map(n => n.toFixed(1)).join(", ")}ms), total ${total}, references ${references}`);
      assert.ok(p95 < MAX_P95_MS, `${label}: end-to-end p95 exceeds ${MAX_P95_MS}ms`);
      // A scan of the world is expected: exact totals and group positions
      // require all its stories. Disk spills or a large time increase are not.
      await measurePlan(label, SEQUENCE_PAGE_SQL,
        [worldId, "query" in args ? args.query : null, null, PAGE_SIZE, true]);
    }
    const full = await executeViewTool(admin.id, "search_sequences", { world_id: worldId }, ORIGIN) as SearchResult;
    const paged = await search({});
    assert.equal(full.revision, paged.revision, "Full and paged layout must share a revision");
    assert.equal(full.sequences.length, paged.total);
    assert.equal(full.references.length, paged.references_total);
    const revisionSql = sequenceRevisionQuery(worldId).toSQL();
    await measurePlan("world-wide revision", revisionSql.sql, revisionSql.params);

    // A record outside the first page must invalidate both filtered and
    // unfiltered pages, without changing their totals.
    const before = await search({ query: "needle" });
    await db.update(wsStoriesTable).set({ globalMetadata: { edited: true } })
      .where(and(eq(wsStoriesTable.worldId, worldId), eq(wsStoriesTable.id, `${worldId}-4999`)));
    const after = await search({ query: "needle" });
    assert.equal(after.total, before.total);
    assert.notEqual(after.revision, before.revision);
    console.log("Revision changed after an off-page metadata edit; totals stayed intact.");
  } finally {
    await pool.query("DELETE FROM ws_stories WHERE world_id = $1", [worldId]);
    await pool.query("DELETE FROM worldsmith_worlds WHERE id = $1", [worldId]);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());