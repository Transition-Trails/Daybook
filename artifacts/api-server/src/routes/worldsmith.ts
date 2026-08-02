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
import { requireSuperAdmin } from "../middleware/requireRole";
import { runCompilation } from "../lib/worldsmith/orchestrator";
import { runSpecPreview, SpecPreviewError } from "../lib/worldsmith/spec-preview-service";
import { getRun, getRunsBySpec, failStaleRunsForSpec } from "../lib/worldsmith/run-repository";
import { getAsset, getAssetBySpec } from "../lib/worldsmith/daybook-adapter";
import { normalizeNotionId } from "../lib/worldsmith/normalize-id";
import { db } from "@workspace/db";
import { worldsmithAssetsTable, worldsmithRunsTable, worldsmithWorldsTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import type { User } from "@workspace/db";
import { logger } from "../lib/logger";
import {
  getPage,
  extractTitle,
  extractRichText,
  extractSelect,
  extractRelation,
  extractNumber,
} from "../lib/notion-client";

const router = Router();

// ── POST /api/v1/prompt-compilations ─────────────────────────────────────────
// validate_and_compile or preview

router.post("/v1/prompt-compilations", requireAuth, async (req: Request, res: Response) => {
  const body = req.body as {
    notion_production_spec_id?: string;
    operation?: string;
    dry_run?: boolean;
  };

  const { notion_production_spec_id: rawSpecId, operation = "validate_and_compile", dry_run = false } = body;

  if (!rawSpecId) {
    res.status(400).json({ error: "notion_production_spec_id is required", code: "MISSING_SPEC_ID" });
    return;
  }

  let notion_production_spec_id: string;
  try {
    notion_production_spec_id = normalizeNotionId(rawSpecId);
  } catch (normErr) {
    res.status(400).json({ error: String(normErr), code: "INVALID_SPEC_ID" });
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
      notion_retries: run.notionRetries ?? [],
      started_at: run.startedAt,
      completed_at: run.completedAt,
    });
  } catch (err) {
    logger.error({ err, run_id }, "Failed to fetch run");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/v1/worldsmith/runs?spec_id=…&status=…&world_id=…  ──────────────
// world_id filters to runs whose asset_id starts with WS-{WORLD_CODE}-
// (falling back to a join through worldsmith_assets.production_spec_notion_id).

router.get("/v1/worldsmith/runs", requireAuth, async (req: Request, res: Response) => {
  const specId = req.query.spec_id as string | undefined;
  const statusFilter = req.query.status as string | undefined;
  const worldId = req.query.world_id as string | undefined;

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
    // world_id filter: resolve the world's CODE, then match runs whose assetId
    // starts with WS-{CODE}- (the canonical asset ID prefix).
    // Also includes runs whose productionSpecId appears in assets for that world.
    if (worldId) {
      const [world] = await db
        .select({ code: worldsmithWorldsTable.code })
        .from(worldsmithWorldsTable)
        .where(eq(worldsmithWorldsTable.id, worldId))
        .limit(1);

      if (!world) {
        // Unknown world — return empty result set
        res.json({ runs: [] });
        return;
      }

      const prefix = `WS-${world.code.toUpperCase()}-`;
      // Find spec IDs from assets that belong to this world
      const worldAssets = await db
        .select({ specId: worldsmithAssetsTable.productionSpecNotionId })
        .from(worldsmithAssetsTable)
        .where(eq(worldsmithAssetsTable.world, world.code.toUpperCase()));
      const specIds = worldAssets
        .map(a => a.specId)
        .filter((s): s is string => Boolean(s));

      // Match by assetId prefix OR by productionSpecId from the world's assets
      const worldConditions: ReturnType<typeof eq>[] = [
        sql`${worldsmithRunsTable.assetId} LIKE ${prefix + "%"}` as unknown as ReturnType<typeof eq>,
      ];
      if (specIds.length > 0) {
        worldConditions.push(inArray(worldsmithRunsTable.productionSpecId, specIds) as unknown as ReturnType<typeof eq>);
      }
      conditions.push(or(...worldConditions));
    }

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

// ── GET /v1/worldsmith/preflight?spec_id=… ───────────────────────────────────
// Lightweight: fetch the Production Spec page only (no full inheritance chain),
// return the summary fields needed to populate the preflight card in the UI.

router.get("/v1/worldsmith/preflight", requireAuth, async (req: Request, res: Response) => {
  const rawId = req.query.spec_id as string | undefined;
  if (!rawId) {
    res.status(400).json({ error: "spec_id is required", code: "MISSING_SPEC_ID" });
    return;
  }

  let specId: string;
  try {
    specId = normalizeNotionId(rawId);
  } catch (normErr) {
    res.status(400).json({ error: String(normErr), code: "INVALID_SPEC_ID" });
    return;
  }

  try {
    const page = await getPage(specId);
    const p = page.properties;

    // Core identity
    const productionSpecification =
      extractTitle(p["Production Item"]) || extractTitle(p["Name"]) || extractRichText(p["Production Item"]) || specId;
    const componentType = extractSelect(p["Component Type"]) || extractRichText(p["Component Type"]) || "";
    const payloadVersion = extractSelect(p["Payload Version"]) || extractRichText(p["Payload Version"]) || "";
    const canonDependency = extractSelect(p["Canon Dependency"]) || extractSelect(p["Canon"]) || "None";
    const compiledPromptStatus =
      extractSelect(p["Compiled Prompt Status"]) || extractRichText(p["Compiled Prompt Status"]) || "Not Compiled";
    const version = extractRichText(p["Current Version"]) || extractSelect(p["Current Version"]) || "1";
    const status = extractSelect(p["Status"]) || extractSelect(p["Workflow Status"]) || "";
    const world = extractRichText(p["World"]) || extractSelect(p["World"]) || "";
    const volume = extractRichText(p["Volume"]) || extractSelect(p["Volume"]) || extractRichText(p["Volume / Collection"]);

    const componentSpecId = extractRelation(p["Component Specification"])?.[0] || extractRelation(p["Component Spec"])?.[0];
    const promptModuleIds = extractRelation(p["Prompt Modules"]) || extractRelation(p["Modules"]) || [];
    const canonRecordIds = extractRelation(p["Canon Records"]) || extractRelation(p["Canon"]) || [];

    // Optionally resolve Component Spec name (one extra fetch, lightweight)
    let componentSpecification: string | null = null;
    if (componentSpecId) {
      try {
        const csPage = await getPage(componentSpecId);
        componentSpecification =
          extractTitle(csPage.properties["Name"]) ||
          extractTitle(csPage.properties["Component Specification"]) ||
          componentSpecId;
      } catch {
        componentSpecification = componentSpecId;
      }
    }

    // Derive generation readiness
    const promptPayload = extractRichText(p["Prompt Payload"]) || extractRichText(p["Payload"]) || "";
    const generationReadiness: string =
      compiledPromptStatus === "Compiled" ? "Compiled"
      : compiledPromptStatus === "Artwork Review" ? "Ready"
      : (canonDependency !== "None" && canonRecordIds.length === 0) ? "Needs Canon Review"
      : (!payloadVersion || !promptPayload) ? "Draft"
      : "Not Compiled";

    res.json({
      spec_id: specId,
      production_specification: productionSpecification,
      component_type: componentType,
      component_specification: componentSpecification,
      payload_version: payloadVersion,
      canon_dependency: canonDependency,
      compiled_prompt_status: compiledPromptStatus,
      generation_readiness: generationReadiness,
      version,
      prompt_module_count: promptModuleIds.length,
      canon_record_count: canonRecordIds.length,
      world,
      volume: volume || undefined,
      status,
    });
  } catch (err) {
    const msg = String(err);
    const isNotFound = /404|not_found|object_not_found/i.test(msg);
    const isUnreachable = /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|AbortError|timeout/i.test(msg);
    const isRateLimited = /429|rate.?limit/i.test(msg);

    if (isNotFound) {
      res.status(404).json({ error: "Production Specification page not found. Check the page ID and that the Notion integration has access.", code: "SPEC_NOT_FOUND" });
    } else if (isRateLimited) {
      res.status(429).json({ error: "Notion rate limit hit. Wait a moment and try again.", code: "NOTION_RATE_LIMITED" });
    } else if (isUnreachable) {
      res.status(503).json({ error: "Notion is unreachable. Check connectivity and retry.", code: "NOTION_UNREACHABLE" });
    } else {
      logger.error({ err, specId }, "WorldSmith preflight error");
      res.status(500).json({ error: "Failed to resolve Production Specification.", code: "PREFLIGHT_ERROR" });
    }
  }
});

// ── POST /v1/worldsmith/spec-preview ─────────────────────────────────────────
// Generate a Product Specification Image, upload to Notion, advance Status to
// "Ready for Review".  Idempotent by (spec_page_id + prompt_hash + template v1)
// unless force_new=true.

router.post("/v1/worldsmith/spec-preview", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const body = req.body as {
    spec_page_id?: string;
    prompt_hash?: string;
    force_new?: boolean;
    dry_run?: boolean;
  };

  const { spec_page_id: rawId, prompt_hash, force_new = false, dry_run = false } = body;

  if (!rawId || !prompt_hash) {
    res.status(400).json({
      error: "spec_page_id and prompt_hash are required",
      code: "MISSING_FIELDS",
    });
    return;
  }

  let spec_page_id: string;
  try {
    spec_page_id = normalizeNotionId(rawId);
  } catch (normErr) {
    res.status(400).json({ error: String(normErr), code: "INVALID_SPEC_ID" });
    return;
  }

  const user = req.user as import("@workspace/db").User;

  try {
    const result = await runSpecPreview({
      spec_page_id,
      prompt_hash,
      force_new,
      dry_run,
      initiatedBy: user?.id ?? "anonymous",
    });

    res.json(result);
  } catch (err) {
    if (err instanceof SpecPreviewError) {
      const httpStatus =
        err.code === "SPEC_NOT_FOUND"     ? 404
        : err.code === "UPLOAD_FAILED"    ? 502
        : err.code === "NOTION_FETCH_FAILED" ? 503
        : 500;
      res.status(httpStatus).json({ error: err.message, code: err.code });
    } else {
      logger.error({ err }, "Spec preview endpoint error");
      res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  }
});

// ── GET /v1/worldsmith/worlds ─────────────────────────────────────────────────
// List all worlds, with computed run/asset stats aggregated.

router.get("/v1/worldsmith/worlds", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const worlds = await db
      .select()
      .from(worldsmithWorldsTable)
      .orderBy(desc(worldsmithWorldsTable.updatedAt));

    // Attach lightweight stats: run counts + asset counts per world code
    const assetCounts = await db
      .select({
        world: worldsmithAssetsTable.world,
        total: sql<number>`count(*)::int`,
        underReview: sql<number>`count(*) filter (where ${worldsmithAssetsTable.readinessState} = 'Under Review')::int`,
      })
      .from(worldsmithAssetsTable)
      .groupBy(worldsmithAssetsTable.world);

    const runCounts = await db
      .select({
        total: sql<number>`count(*)::int`,
        failed: sql<number>`count(*) filter (where ${worldsmithRunsTable.status} = 'failed')::int`,
      })
      .from(worldsmithRunsTable);

    const totalRuns = runCounts[0]?.total ?? 0;
    const failedRuns = runCounts[0]?.failed ?? 0;

    const enriched = worlds.map(w => {
      const codeUpper = w.code.toUpperCase();
      const assetRow = assetCounts.find(
        a => a.world.toUpperCase() === codeUpper || a.world === w.id,
      );
      return {
        id: w.id,
        name: w.name,
        code: w.code,
        description: w.description,
        status: w.status,
        coverColor: w.coverColor,
        coverAccent: w.coverAccent,
        currentCollection: w.currentCollection,
        currentVolume: w.currentVolume,
        owner: w.owner,
        tags: w.tags,
        notionProductionDbId: w.notionProductionDbId,
        driveFolderId: w.driveFolderId,
        imageProvider: w.imageProvider,
        createdAt: w.createdAt,
        updatedAt: w.updatedAt,
        assetCount: assetRow?.total ?? 0,
        reviewCount: assetRow?.underReview ?? 0,
      };
    });

    res.json({ worlds: enriched });
  } catch (err) {
    logger.error({ err }, "Failed to list worlds");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /v1/worldsmith/worlds ────────────────────────────────────────────────
// Create a new world record.

router.post("/v1/worldsmith/worlds", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const body = req.body as {
    id?: string;
    name?: string;
    code?: string;
    description?: string;
    status?: string;
    coverColor?: string;
    coverAccent?: string;
    currentCollection?: string;
    currentVolume?: string;
    owner?: string;
    tags?: string[];
    notionProductionDbId?: string;
    notionCanonDbId?: string;
    notionStyleGuideId?: string;
    driveFolderId?: string;
    imageProvider?: string;
  };

  if (!body.name?.trim() || !body.code?.trim()) {
    res.status(400).json({ error: "name and code are required", code: "MISSING_FIELDS" });
    return;
  }

  const id = (body.id ?? body.code.toLowerCase().replace(/[^a-z0-9-]/g, "-")).slice(0, 64);
  const user = req.user as User;

  try {
    const [world] = await db
      .insert(worldsmithWorldsTable)
      .values({
        id,
        name: body.name.trim(),
        code: body.code.trim().toUpperCase().slice(0, 8),
        description: body.description?.trim() ?? "",
        status: (body.status as "active" | "in_setup" | "archived") ?? "in_setup",
        coverColor: body.coverColor ?? "linear-gradient(135deg, #1B2A4A 0%, #2A4A6A 100%)",
        coverAccent: body.coverAccent ?? "#C87560",
        currentCollection: body.currentCollection?.trim() || null,
        currentVolume: body.currentVolume?.trim() || null,
        owner: body.owner?.trim() ?? "",
        tags: body.tags ?? [],
        notionProductionDbId: body.notionProductionDbId?.trim() || null,
        notionCanonDbId: body.notionCanonDbId?.trim() || null,
        notionStyleGuideId: body.notionStyleGuideId?.trim() || null,
        driveFolderId: body.driveFolderId?.trim() || null,
        imageProvider: body.imageProvider?.trim() || null,
        createdBy: user?.id ?? null,
      })
      .returning();

    res.status(201).json(world);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: `A world with id '${id}' already exists.`, code: "DUPLICATE_ID" });
      return;
    }
    logger.error({ err }, "Failed to create world");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /v1/worldsmith/health ─────────────────────────────────────────────────
// Check health of configured integrations.

router.get("/v1/worldsmith/health", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  const checkedAt = new Date().toISOString();
  const integrations: Array<{
    service: string;
    label: string;
    status: "connected" | "warning" | "failed" | "unknown" | "not_configured";
    message?: string;
    checkedAt: string;
  }> = [];

  // ── Notion ─────────────────────────────────────────────────────────────────
  const notionToken = process.env.NOTION_TOKEN;
  if (!notionToken) {
    integrations.push({ service: "notion", label: "Notion", status: "not_configured", message: "NOTION_TOKEN not set", checkedAt });
  } else {
    try {
      const resp = await fetch("https://api.notion.com/v1/users/me", {
        headers: { Authorization: `Bearer ${notionToken}`, "Notion-Version": "2022-06-28" },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        integrations.push({ service: "notion", label: "Notion", status: "connected", checkedAt });
      } else if (resp.status === 401) {
        integrations.push({ service: "notion", label: "Notion", status: "failed", message: "Invalid token (401)", checkedAt });
      } else {
        integrations.push({ service: "notion", label: "Notion", status: "warning", message: `HTTP ${resp.status}`, checkedAt });
      }
    } catch (err: any) {
      integrations.push({ service: "notion", label: "Notion", status: "failed", message: String(err?.message ?? err), checkedAt });
    }
  }

  // ── Google Drive / OAuth ───────────────────────────────────────────────────
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!googleClientId || !googleClientSecret) {
    integrations.push({ service: "google_drive", label: "Google Drive", status: "not_configured", message: "GOOGLE_CLIENT_ID/SECRET not set", checkedAt });
  } else {
    integrations.push({ service: "google_drive", label: "Google Drive", status: "connected", message: "OAuth credentials present", checkedAt });
  }

  // ── DALL-E / OpenAI ────────────────────────────────────────────────────────
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  integrations.push({
    service: "image_provider",
    label: "AI / Image provider",
    status: anthropicKey ? "connected" : "not_configured",
    message: anthropicKey ? "ANTHROPIC_API_KEY present" : "No AI provider key configured",
    checkedAt,
  });

  res.json({ integrations });
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
