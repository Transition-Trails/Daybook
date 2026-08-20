/**
 * smoke-test-worldsmith
 *
 * End-to-end smoke test for the WorldSmith prompt compiler.
 *
 * Fetches the first live page from NOTION_PRODUCTION_SPEC_DB_ID and runs a full
 * validate_and_compile pass, confirming the worldsmith_runs row is persisted
 * with a non-null prompt_hash (for a successful compile) or a clear structured
 * error response (not an unhandled 500).
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run smoke-test:worldsmith
 *
 * Override the page ID (skip DB lookup):
 *   SMOKE_PAGE_ID=<notion-page-id> pnpm --filter @workspace/api-server run smoke-test:worldsmith
 */
import { pool } from "@workspace/db";
import { runCompilation } from "../src/lib/worldsmith/orchestrator.js";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/** Fetch just the first page from a Notion database (page_size=1). */
async function fetchFirstSpecPage(databaseId: string): Promise<{ id: string; url: string } | null> {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN is not set");

  const res = await fetch(`${NOTION_API}/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ page_size: 1 }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion DB query failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { results: Array<{ id: string; url: string }> };
  return data.results[0] ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.NOTION_TOKEN) {
    console.error("❌  NOTION_TOKEN is not set");
    process.exit(1);
  }

  // Allow overriding the page ID via env var (useful when the integration lacks
  // DB-level access but has page-level access, or for targeted testing).
  let specPageId = process.env.SMOKE_PAGE_ID ?? "";
  let pageUrl = "";

  if (specPageId) {
    console.log(`1. Using SMOKE_PAGE_ID override: ${specPageId}`);
  } else {
    const dbId = process.env.NOTION_PRODUCTION_SPEC_DB_ID;
    if (!dbId) {
      console.error("❌  NOTION_PRODUCTION_SPEC_DB_ID is not set");
      process.exit(1);
    }

    console.log("1. Querying Production Spec DB for first page…");
    console.log(`   DB ID: ${dbId}`);
    try {
      const firstPage = await fetchFirstSpecPage(dbId);
      if (!firstPage) {
        console.error("❌  No pages found in NOTION_PRODUCTION_SPEC_DB_ID — database appears empty");
        process.exit(1);
      }
      specPageId = firstPage.id;
      pageUrl = firstPage.url;
    } catch (err) {
      console.error("❌  Failed to query Notion database:", String(err));
      console.error("");
      console.error("    The Notion integration may not have access to this database.");
      console.error("    Share the database with the integration in Notion, then re-run.");
      console.error("    Or run with SMOKE_PAGE_ID=<page-id> to test a specific page directly.");
      process.exit(1);
    }
  }

  console.log(`   Page ID:  ${specPageId}`);
  if (pageUrl) console.log(`   Page URL: ${pageUrl}`);

  // ── Step 2: Run compilation ─────────────────────────────────────────────────
  console.log("\n2. Running validate_and_compile…");
  const result = await runCompilation(
    {
      notion_production_spec_id: specPageId,
      operation: "validate_and_compile",
      dry_run: false,
    },
    "smoke-test",
  );

  // ── Step 3: Print result ────────────────────────────────────────────────────
  console.log("\n3. Compilation result:");
  console.log(`   status:                 ${result.status}`);
  console.log(`   run_id:                 ${result.run_id}`);
  console.log(`   payload_version:        ${result.payload_version || "(empty)"}`);
  console.log(`   compiled_prompt_status: ${result.compiled_prompt_status}`);

  if (result.prompt_hash) {
    console.log(`   prompt_hash:            ${result.prompt_hash}`);
  }
  if (result.failed_stage) {
    console.log(`   failed_stage:           ${result.failed_stage}`);
    console.log(`   error_code:             ${result.error_code}`);
    console.log(`   message:                ${result.message}`);
  }
  if (result.warnings?.length) {
    console.log(`\n   warnings (${result.warnings.length}):`);
    for (const w of result.warnings) {
      console.log(`     ⚠  [${w.code}] ${w.message}`);
      if (w.recommended_action) console.log(`        → ${w.recommended_action}`);
    }
  }
  if (result.errors?.length) {
    console.log(`\n   errors (${result.errors.length}):`);
    for (const e of result.errors) {
      console.log(`     ✗  [${e.code}] field=${e.field}`);
      console.log(`        ${e.message}`);
      if (e.recommended_action) console.log(`        → ${e.recommended_action}`);
    }
  }

  // ── Step 4: Verify DB persistence ──────────────────────────────────────────
  if (result.run_id) {
    console.log("\n4. Verifying worldsmith_runs row in database…");
    const { rows } = await pool.query<{
      id: string;
      status: string;
      prompt_hash: string | null;
      compiled_prompt_status: string | null;
    }>(
      `SELECT id, status, prompt_hash, compiled_prompt_status
         FROM worldsmith_runs
        WHERE id = $1`,
      [result.run_id],
    );

    if (!rows.length) {
      console.error(`❌  No row found in worldsmith_runs for run_id=${result.run_id}`);
      process.exit(1);
    }

    const row = rows[0];
    console.log(`   ✓ Row found in worldsmith_runs`);
    console.log(`   DB status:               ${row.status}`);
    console.log(`   DB compiled_prompt_status: ${row.compiled_prompt_status ?? "(null)"}`);
    console.log(`   DB prompt_hash:           ${row.prompt_hash ?? "(null)"}`);

    if (result.status === "compiled" && !row.prompt_hash) {
      console.error("❌  Compilation succeeded but prompt_hash is NULL in worldsmith_runs");
      process.exit(1);
    }
  }

  // ── Final verdict ───────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────────────");
  const TERMINAL_STATUSES = ["compiled", "validation_failed", "requires_canon_review", "failed"];

  if (!TERMINAL_STATUSES.includes(result.status)) {
    console.error(`❌  FAILED — unexpected terminal status: ${result.status}`);
    console.error("    This may indicate an unhandled exception in the pipeline.");
    process.exit(1);
  }

  if (result.status === "compiled") {
    console.log("✅  PASSED — compile completed end-to-end with prompt_hash persisted.");
    process.exit(0);
  }

  if (result.status === "failed") {
    const code = result.error_code ?? "";
    // Notion access errors (page not found, permission denied) are expected in
    // environments where the integration has not been granted DB access.  The
    // pipeline returned a structured error — not an unhandled 500 — which is
    // the behaviour this test verifies.
    const isNotionAccess = code === "NOTION_PAGE_NOT_FOUND" || code === "NOTION_NOT_CONFIGURED" || code === "INHERITANCE_ERROR";
    if (isNotionAccess) {
      console.log("⚠️   PIPELINE OK — Notion returned a page-not-found / permission error.");
      console.log("    The compiler surfaced this as a structured run failure (not an unhandled 500).");
      console.log("    A run row was persisted in worldsmith_runs.");
      console.log("");
      console.log("    To reach 'compiled' status:");
      console.log("    1. Share the Production Spec database with the Daybook Replit integration in Notion.");
      console.log("    2. Re-run this script (without SMOKE_PAGE_ID) to pick up a real spec page.");
    } else {
      // Any other structured failure is fine — the pipeline is working correctly
      console.log(`⚠️   PIPELINE OK — compile ended with structured failure (code=${code}).`);
      console.log("    This is a clear non-500 error from the pipeline.");
    }
    process.exit(0);
  }

  // validation_failed or requires_canon_review
  console.log(`⚠️   PIPELINE OK — compilation ended with expected validation status: ${result.status}`);
  console.log("    The compiler returned a structured error, not an unhandled 500.");
  console.log("    Fix the Notion spec fields listed above, then re-run to reach 'compiled'.");
  process.exit(0);
}

main()
  .catch((err) => {
    console.error("❌  Unhandled error:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end().catch(() => {/* ignore pool shutdown errors */});
  });
