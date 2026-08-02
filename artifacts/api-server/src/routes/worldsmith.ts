/**
 * WorldSmith Prompt Compiler API
 *
 * POST /api/v1/prompt-compilations          validate_and_compile | preview
 * POST /api/v1/production-packages          compile_and_generate (Phase 2)
 * GET  /api/v1/runs/:run_id                 run status
 * GET  /api/v1/worldsmith/assets            list Daybook asset registry
 * GET  /api/v1/worldsmith/assets/:assetId   single asset
 */
import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware";
import { runCompilation } from "../lib/worldsmith/orchestrator";
import { getRun, getRunsBySpec, failStaleRunsForSpec } from "../lib/worldsmith/run-repository";
import { getAsset, getAssetBySpec } from "../lib/worldsmith/daybook-adapter";
import { db } from "@workspace/db";
import { worldsmithAssetsTable, worldsmithRunsTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Request, Response } from "express";
import type { User } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

// ── POST /api/v1/prompt-compilations ─────────────────────────────────────────
// validate_and_compile or preview

router.post("/v1/prompt-compilations", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as {
    notion_production_spec_id?: string;
    operation?: string;
    dry_run?: boolean;
  };

  const { notion_production_spec_id, operation = "validate_and_compile", dry_run = false } = body;

  if (!notion_production_spec_id) {
    res.status(400).json({
      error: "notion_production_spec_id is required",
      code: "MISSING_SPEC_ID",
    });
    return;
  }

  const validOps = ["validate_and_compile", "preview"];
  if (!validOps.includes(operation)) {
    res.status(400).json({
      error: `operation must be one of: ${validOps.join(", ")}`,
      code: "INVALID_OPERATION",
    });
    return;
  }

  const user = req.user as User;

  try {
    // Fail any run for this spec that is still stuck in 'compiling' or 'pending'
    // from a previous server instance so the UI never shows a perpetual spinner.
    const recovered = await failStaleRunsForSpec(notion_production_spec_id);
    if (recovered > 0) {
      logger.warn({ specId: notion_production_spec_id, recovered }, "WorldSmith: failed stale in-progress run before starting new compile");
    }

    const result = await runCompilation(
      {
        notion_production_spec_id,
        operation: operation as "validate_and_compile" | "preview",
        dry_run,
      },
      user?.id ?? "anonymous",
    );

    // "failed" with retry_safe=false means a client-fixable data problem (422).
    // "failed" with retry_safe=true means a dependency/server error (503).
    const httpStatus =
      result.status === "compiled" ? 200
      : result.status === "validation_failed" ? 422
      : result.status === "requires_canon_review" ? 422
      : result.status === "failed" && result.retry_safe === false ? 422
      : result.status === "failed" ? 503
      : 500;

    res.status(httpStatus).json(result);
  } catch (err) {
    logger.error({ err }, "WorldSmith compile endpoint error");
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// ── POST /api/v1/production-packages ─────────────────────────────────────────
// compile_and_generate — Phase 2 stub

router.post("/v1/production-packages", requireAuth, async (_req: Request, res: Response) => {
  res.status(501).json({
    error: "compile_and_generate (image generation) is not yet implemented. Use validate_and_compile first.",
    code: "NOT_IMPLEMENTED",
    next_action: "POST /api/v1/prompt-compilations with operation: validate_and_compile",
  });
});

// ── GET /api/v1/runs/:run_id ──────────────────────────────────────────────────

router.get("/v1/runs/:run_id", requireAuth, async (req: Request, res: Response) => {
  const run_id = req.params.run_id as string;

  try {
    const run = await getRun(run_id);
    if (!run) {
      res.status(404).json({ error: "Run not found", run_id });
      return;
    }

    res.json({
      run_id: run.id,
      status: run.status,
      production_spec_id: run.productionSpecId,
      operation: run.operation,
      dry_run: run.dryRun,
      payload_version: run.payloadVersion,
      compiled_prompt_status: run.compiledPromptStatus,
      prompt_hash: run.promptHash,
      compiled_prompt: run.compiledPrompt ?? null,
      asset_id: run.assetId,
      asset_version: run.assetVersion,
      visual_asset_id: run.visualAssetNotionId,
      drive_file_id: run.driveFileId,
      drive_url: run.driveUrl,
      errors: run.errors ?? [],
      warnings: run.warnings ?? [],
      failed_stage: run.failedStage,
      error_code: run.errorCode,
      resolved_source_ids: run.resolvedSourceIds,
      retry_count: run.retryCount,
      started_at: run.startedAt,
      completed_at: run.completedAt,
    });
  } catch (err) {
    logger.error({ err, run_id }, "Failed to fetch run");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/v1/worldsmith/runs?spec_id=…&status=…  ─────────────────────────

router.get("/v1/worldsmith/runs", requireAuth, async (req: Request, res: Response) => {
  const specId = req.query.spec_id as string | undefined;
  const statusFilter = req.query.status as string | undefined;

  // Build where conditions
  const conditions = [];

  if (specId) {
    conditions.push(eq(worldsmithRunsTable.productionSpecId, specId));
  }

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "interrupted") {
      // interrupted = failed rows whose error_code is 'INTERRUPTED'
      conditions.push(
        and(
          eq(worldsmithRunsTable.status, "failed"),
          eq(worldsmithRunsTable.errorCode, "INTERRUPTED"),
        ),
      );
    } else if (statusFilter === "in_progress") {
      conditions.push(inArray(worldsmithRunsTable.status, ["pending", "compiling"]));
    } else if (statusFilter === "failed") {
      // "failed" excludes interrupted so both filter options are mutually exclusive
      conditions.push(
        and(
          eq(worldsmithRunsTable.status, "failed"),
          or(
            isNull(worldsmithRunsTable.errorCode),
            ne(worldsmithRunsTable.errorCode, "INTERRUPTED"),
          ),
        ),
      );
    } else {
      conditions.push(eq(worldsmithRunsTable.status, statusFilter));
    }
  }

  try {
    const rawRuns = await db
      .select()
      .from(worldsmithRunsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(worldsmithRunsTable.startedAt))
      .limit(50);

    const runs = rawRuns.map((run) => ({
      run_id: run.id,
      status: run.status,
      production_spec_id: run.productionSpecId,
      operation: run.operation,
      dry_run: run.dryRun,
      payload_version: run.payloadVersion,
      compiled_prompt_status: run.compiledPromptStatus,
      prompt_hash: run.promptHash,
      asset_id: run.assetId,
      asset_version: run.assetVersion,
      visual_asset_id: run.visualAssetNotionId,
      drive_file_id: run.driveFileId,
      drive_url: run.driveUrl,
      errors: run.errors ?? [],
      warnings: run.warnings ?? [],
      failed_stage: run.failedStage,
      error_code: run.errorCode,
      retry_count: run.retryCount,
      initiated_by: run.initiatedBy,
      started_at: run.startedAt,
      completed_at: run.completedAt,
    }));
    res.json({ runs });
  } catch (err) {
    logger.error({ err }, "Failed to list runs");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/v1/worldsmith/assets ─────────────────────────────────────────────

router.get("/v1/worldsmith/assets", requireAuth, async (_req: Request, res: Response) => {
  try {
    const assets = await db
      .select()
      .from(worldsmithAssetsTable)
      .orderBy(desc(worldsmithAssetsTable.updatedAt))
      .limit(100);
    res.json({ assets });
  } catch (err) {
    logger.error({ err }, "Failed to list assets");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/v1/worldsmith/assets/:assetId ────────────────────────────────────

router.get("/v1/worldsmith/assets/:assetId", requireAuth, async (req: Request, res: Response) => {
  const assetId = req.params.assetId as string;
  try {
    const asset = await getAsset(assetId);
    if (!asset) {
      res.status(404).json({ error: "Asset not found", asset_id: assetId });
      return;
    }
    res.json(asset);
  } catch (err) {
    logger.error({ err, assetId }, "Failed to fetch asset");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
