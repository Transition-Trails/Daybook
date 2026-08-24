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
import { requireStoreAccess, requireSuperAdmin } from "../middleware/requireRole";
import { runCompilation } from "../lib/worldsmith/orchestrator";
import {
  getLatestLocalSpecPreview,
  runSpecPreview,
  retrySpecPreviewStatus,
  SpecPreviewError,
} from "../lib/worldsmith/spec-preview-service";
import { getRun, getRunsBySpec, failStaleRunsForSpec, updateRun } from "../lib/worldsmith/run-repository";
import { getAsset, getAssetBySpec } from "../lib/worldsmith/daybook-adapter";
import { normalizeNotionId } from "../lib/worldsmith/normalize-id";
import { db } from "@workspace/db";
import {
  fontsTable, palettesTable, storeFlagsTable, storesTable, worldsmithAssetsTable,
  worldsmithRunsTable, worldsmithWorldsTable,
  wsCanonRecordsTable, wsComponentSpecsTable, wsPromptModulesTable, wsStyleGuidesTable,
} from "@workspace/db";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { Request, Response } from "express";
import type { User } from "@workspace/db";
import { logger } from "../lib/logger";
import { callAi } from "../lib/ai-proxy";
import {
  getPage,
  extractTitle,
  extractRichText,
  extractSelect,
  extractRelation,
  extractNumber,
  richTextProp,
  queryDatabase,
} from "../lib/notion-client";
import {
  checkGenerationRequirements,
  buildSourceObject,
  generatePayloadDraft,
  writePayloadToNotion,
  parseAndValidateSerializedPayload,
  PAYLOAD_MAX_CHARS,
  PAYLOAD_GEN_ERROR_CODES,
} from "../lib/worldsmith/payload-generator";
import { resolveInheritanceChain, InheritanceError } from "../lib/worldsmith/inheritance-resolver";
import { normalizeNotionId as normalizeId } from "../lib/worldsmith/normalize-id";
import { sanitizeWorldBibleRichText, worldBibleRichTextToPlainText } from "../lib/worldsmith/world-bible-rich-text";
import { resolveTypographyChoices, TypographyValidationError } from "../lib/worldsmith/typography";
import { filterEntitled, type EntitlementContext } from "../lib/entitlement";

const router = Router();

function scopedStoreId(req: Request): string | null {
  return req.actor?.storeId ?? null;
}

/**
 * Store-scoped WorldSmith routes always receive an authenticated store context.
 * A super admin without a store context is using the platform oversight console
 * and remains able to view the complete portfolio.
 */
async function requireWorldsmithEnabled(
  req: Request,
  res: Response,
  next: import("express").NextFunction,
): Promise<void> {
  const storeId = scopedStoreId(req);
  if (!storeId) {
    next();
    return;
  }

  const [flags] = await db
    .select({ worldsmithEnabled: storeFlagsTable.worldsmithEnabled })
    .from(storeFlagsTable)
    .where(eq(storeFlagsTable.storeId, storeId))
    .limit(1);

  if (!flags?.worldsmithEnabled) {
    res.status(403).json({ error: "WorldSmith is not enabled for this store", code: "WORLDSMITH_DISABLED" });
    return;
  }
  next();
}

async function storeEntitlementContext(storeId: string): Promise<EntitlementContext> {
  const [store] = await db
    .select({ subscriptionActive: storesTable.subscriptionActive })
    .from(storesTable)
    .where(eq(storesTable.id, storeId))
    .limit(1);

  return {
    storeId,
    // A missing store cannot safely receive licensed content. Membership checks
    // normally make this impossible, but fail closed if an orphaned membership exists.
    subscriptionActive: store?.subscriptionActive ?? false,
  };
}

// ── World Bible supporting libraries ─────────────────────────────────────────
// Store-facing alternatives to the platform Editorial library routes. These
// retain the same world scope as the World Bible write path.

router.get("/v1/worldsmith/worlds/:id/palette-library", requireStoreAccess("store_staff"), requireWorldsmithEnabled, async (req: Request, res: Response): Promise<void> => {
  const worldId = req.params.id as string;
  const storeId = scopedStoreId(req);

  try {
    const [world] = await db
      .select({ storeId: worldsmithWorldsTable.storeId })
      .from(worldsmithWorldsTable)
      .where(storeId
        ? and(eq(worldsmithWorldsTable.id, worldId), eq(worldsmithWorldsTable.storeId, storeId))
        : eq(worldsmithWorldsTable.id, worldId))
      .limit(1);

    if (!world) {
      res.status(404).json({ error: "World not found", code: "NOT_FOUND" });
      return;
    }

    const palettes = await db
      .select({
        id: palettesTable.id,
        name: palettesTable.name,
        colors: palettesTable.colors,
        status: palettesTable.status,
      })
      .from(palettesTable)
      .where(world.storeId
        ? and(
            eq(palettesTable.origin, "owned"),
            eq(palettesTable.authoredByStoreId, world.storeId),
            ne(palettesTable.status, "deleted"),
          )
        : ne(palettesTable.status, "deleted"))
      .orderBy(desc(palettesTable.updatedAt));

    res.json({ source: world.storeId ? "store" : "platform", palettes });
  } catch (err) {
    req.log.error({ err, worldId }, "WorldSmith palette library lookup failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/v1/worldsmith/worlds/:id/font-library", requireStoreAccess("store_staff"), requireWorldsmithEnabled, async (req: Request, res: Response): Promise<void> => {
  const worldId = req.params.id as string;
  const storeId = scopedStoreId(req);

  try {
    const [world] = await db
      .select({ storeId: worldsmithWorldsTable.storeId })
      .from(worldsmithWorldsTable)
      .where(storeId
        ? and(eq(worldsmithWorldsTable.id, worldId), eq(worldsmithWorldsTable.storeId, storeId))
        : eq(worldsmithWorldsTable.id, worldId))
      .limit(1);

    if (!world) {
      res.status(404).json({ error: "World not found", code: "NOT_FOUND" });
      return;
    }

    const fonts = await db
      .select({
        id: fontsTable.id,
        familyName: fontsTable.familyName,
        variants: fontsTable.variants,
        notes: fontsTable.notes,
        curatedPairings: fontsTable.curatedPairings,
        status: fontsTable.status,
        globalAvailable: fontsTable.globalAvailable,
        origin: fontsTable.origin,
        authoredByStoreId: fontsTable.authoredByStoreId,
      })
      .from(fontsTable)
      .where(ne(fontsTable.status, "deleted"))
      .orderBy(fontsTable.createdAt);

    const visibleFonts = world.storeId
      ? filterEntitled(
          fonts.filter((font) =>
            font.origin === "owned" || (font.status === "live" && font.globalAvailable),
          ),
          await storeEntitlementContext(world.storeId),
        )
      : fonts;

    res.json({ source: world.storeId ? "store" : "platform", fonts: visibleFonts });
  } catch (err) {
    req.log.error({ err, worldId }, "WorldSmith font library lookup failed");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/v1/prompt-compilations ─────────────────────────────────────────
// validate_and_compile or preview

router.post("/v1/prompt-compilations", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const body = req.body as {
    production_spec_id?: string;
    notion_production_spec_id?: string;
    operation?: string;
    dry_run?: boolean;
  };

  const {
    production_spec_id: localSpecId,
    notion_production_spec_id: legacyNotionSpecId,
    operation = "validate_and_compile",
    dry_run = false,
  } = body;

  if (!localSpecId && !legacyNotionSpecId) {
    res.status(400).json({ error: "production_spec_id is required", code: "MISSING_SPEC_ID" });
    return;
  }

  let production_spec_id: string | undefined;
  let notion_production_spec_id: string | undefined;
  if (localSpecId) {
    production_spec_id = localSpecId.trim();
  } else if (legacyNotionSpecId) {
    try {
      notion_production_spec_id = normalizeNotionId(legacyNotionSpecId);
    } catch (normErr) {
      res.status(400).json({ error: String(normErr), code: "INVALID_SPEC_ID" });
      return;
    }
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
    const resolvedSpecId = production_spec_id ?? notion_production_spec_id!;
    const recovered = await failStaleRunsForSpec(resolvedSpecId);
    if (recovered > 0) {
      logger.warn({ specId: resolvedSpecId, recovered }, "WorldSmith: failed stale in-progress run before starting new compile");
    }

    const result = await runCompilation(
      {
        production_spec_id,
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

router.post("/v1/production-packages", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  res.status(501).json({
    error: "compile_and_generate (image generation) is not yet implemented. Use validate_and_compile first.",
    code: "NOT_IMPLEMENTED",
    next_action: "POST /api/v1/prompt-compilations with operation: validate_and_compile",
  });
});

// ── GET /api/v1/runs/:run_id ──────────────────────────────────────────────────

router.get("/v1/runs/:run_id", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
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
      compiled_sections: run.compiledSections ?? [],
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

router.get("/v1/worldsmith/runs", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
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

router.get("/v1/worldsmith/preflight", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
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
    const collection =
      extractRichText(p["Collection"]) ||
      extractSelect(p["Collection"]) ||
      extractRichText(p["Collection Name"]);
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

    // Derive generation readiness.
    // Only Canon Reference and Canon Defining actually require records;
    // Canon Dependency = None or Supports Canon with no records is not a blocker.
    const promptPayload = extractRichText(p["Prompt Payload"]) || extractRichText(p["Payload"]) || "";
    const canonBlocksReadiness =
      (canonDependency === "Canon Reference" || canonDependency === "Canon Defining") &&
      canonRecordIds.length === 0;
    const generationReadiness: string =
      compiledPromptStatus === "Compiled" ? "Compiled"
      : compiledPromptStatus === "Artwork Review" ? "Ready"
      : canonBlocksReadiness ? "Needs Canon Review"
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
      collection: collection || undefined,
      volume: volume || undefined,
      status,
      // PP-2.0 payload generation gate: true = payload is blank and generation is possible
      prompt_payload_blank: payloadVersion === "PP-2.0" && !promptPayload.trim(),
    });
  } catch (err) {
    const msg = String(err);
    // Notion uses both 404 (missing or not shared) and 403 (integration
    // cannot access the page) for page lookup failures.  The client preserves
    // the status when available; retain the message fallback for mocked or
    // older callers that throw a plain Error.
    const notionStatus = (
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      typeof err.status === "number"
    ) ? err.status : undefined;
    const isNotFound =
      notionStatus === 400 ||
      notionStatus === 403 ||
      notionStatus === 404 ||
      /404|not_found|object_not_found/i.test(msg);
    const isUnreachable = /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|AbortError|timeout/i.test(msg);
    const isRateLimited = /429|rate.?limit/i.test(msg);

    if (isNotFound) {
      res.status(404).json({
        error: "Production Specification page could not be resolved. Check that the page ID is correct and that the Notion integration has access.",
        code: "SPEC_NOT_FOUND",
      });
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
// Generate a Product Specification Image. Editorial Suite specs are resolved
// locally and never write to Notion until they have been published; legacy
// spec_page_id requests retain the Notion upload/status-transition behavior.

router.get("/v1/worldsmith/spec-preview/local/:productionSpecId", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const productionSpecId = (req.params.productionSpecId as string | undefined)?.trim();
  if (!productionSpecId) {
    res.status(400).json({ error: "production_spec_id is required", code: "MISSING_SPEC_ID" });
    return;
  }

  try {
    const preview = await getLatestLocalSpecPreview(productionSpecId);
    res.json({ preview });
  } catch (err) {
    logger.error({ err, productionSpecId }, "WorldSmith local spec preview lookup failed");
    res.status(500).json({ error: "Failed to load local specification board", code: "PREVIEW_LOOKUP_FAILED" });
  }
});

router.post("/v1/worldsmith/spec-preview", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const body = req.body as {
    production_spec_id?: string;
    spec_page_id?: string;
    prompt_hash?: string;
    force_new?: boolean;
    dry_run?: boolean;
  };

  const {
    production_spec_id: localSpecId,
    spec_page_id: rawId,
    prompt_hash,
    force_new = false,
    dry_run = false,
  } = body;

  if ((!localSpecId && !rawId) || !prompt_hash) {
    res.status(400).json({
      error: "production_spec_id (local) or spec_page_id (Notion), and prompt_hash are required",
      code: "MISSING_FIELDS",
    });
    return;
  }

  let production_spec_id: string | undefined;
  let spec_page_id: string | undefined;
  if (localSpecId?.trim()) {
    production_spec_id = localSpecId.trim();
  } else if (rawId) {
    try {
      spec_page_id = normalizeNotionId(rawId);
    } catch (normErr) {
      res.status(400).json({ error: String(normErr), code: "INVALID_SPEC_ID" });
      return;
    }
  }

  const user = req.user as import("@workspace/db").User;

  try {
    const result = await runSpecPreview({
      production_spec_id,
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
        err.code === "SPEC_NOT_FOUND" || err.code === "LOCAL_SPEC_NOT_FOUND" ? 404
        : err.code === "WORLD_BIBLE_NOT_FOUND" || err.code === "WORLD_BIBLE_WORLD_ID_MISSING" ? 422
        : err.code === "UPLOAD_FAILED"    ? 502
        : err.code === "NOTION_FETCH_FAILED" || err.code === "WORLD_BIBLE_FETCH_ERROR" ? 503
        : 500;
      res.status(httpStatus).json({ error: err.message, code: err.code });
    } else {
      logger.error({ err }, "Spec preview endpoint error");
      res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  }
});

// ── POST /v1/worldsmith/spec-preview/retry-status ────────────────────────────
// Re-attempt only the Notion status write for a preview whose image was already
// uploaded.  Skips DALL-E generation and Notion upload entirely — no extra cost.

router.post("/v1/worldsmith/spec-preview/retry-status", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const body = req.body as {
    spec_page_id?: string;
    prompt_hash?: string;
  };

  const { spec_page_id: rawId, prompt_hash } = body;

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

  try {
    const result = await retrySpecPreviewStatus(spec_page_id, prompt_hash);
    res.json(result);
  } catch (err) {
    if (err instanceof SpecPreviewError) {
      const httpStatus =
        err.code === "NO_FAILED_STATUS_RECORD" ? 404
        : err.code === "STATUS_UPDATE_FAILED"  ? 502
        : 500;
      res.status(httpStatus).json({ error: err.message, code: err.code });
    } else {
      logger.error({ err }, "Spec preview retry-status endpoint error");
      res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  }
});

// ── World enrichment helper ───────────────────────────────────────────────────
// Exported so tests can assert the real mapping rather than a copied literal.

export type AssetCountRow = { world: string; total: number; underReview: number };

export function buildEnrichedWorld(
  w: typeof worldsmithWorldsTable.$inferSelect,
  assetCounts: AssetCountRow[],
) {
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
    // World Bible aesthetic identity fields
    visualPalette: w.visualPalette,
    proseVoice: w.proseVoice,
    atmosphericNotes: w.atmosphericNotes,
    materialWorld: w.materialWorld,
    worldRules: w.worldRules,
    typography: w.typography,
    coverImageUrl: w.coverImageUrl ?? null,
  };
}

// ── GET /v1/worldsmith/worlds ─────────────────────────────────────────────────
// List all worlds, with computed run/asset stats aggregated.

router.get("/v1/worldsmith/worlds", requireStoreAccess("store_staff"), requireWorldsmithEnabled, async (req: Request, res: Response) => {
  try {
    const storeId = scopedStoreId(req);
    const worlds = await db
      .select()
      .from(worldsmithWorldsTable)
      .where(storeId ? eq(worldsmithWorldsTable.storeId, storeId) : undefined)
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

    // Store-scoped clients never receive asset totals derived from the shared
    // asset registry. The platform console retains those portfolio metrics.
    const enriched = worlds.map(w => buildEnrichedWorld(w, storeId ? [] : assetCounts));

    res.json({
      worlds: enriched,
      permissions: {
        canEditWorldRules: req.actor?.isSuperAdmin === true || req.actor?.storeRole === "store_owner",
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to list worlds");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /v1/worldsmith/worlds ────────────────────────────────────────────────
// Create a new world record.

router.post("/v1/worldsmith/worlds", requireStoreAccess("store_staff"), requireWorldsmithEnabled, async (req: Request, res: Response) => {
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

  const requestedId = (body.id ?? body.code.toLowerCase().replace(/[^a-z0-9-]/g, "-")).slice(0, 64);
  const storeId = scopedStoreId(req);
  // Store teams may use the same human-facing code as another store. The
  // database id remains globally unique while `code` stays readable in the UI.
  const id = storeId ? `${storeId}--${requestedId}` : requestedId;
  const user = req.user as User;

  try {
    const [world] = await db
      .insert(worldsmithWorldsTable)
      .values({
        id,
        storeId,
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
// Check health of configured integrations, including per-world Notion DB access.

router.get("/v1/worldsmith/health", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  const checkedAt = new Date().toISOString();
  const integrations: Array<{
    service: string;
    label: string;
    status: "connected" | "warning" | "failed" | "unknown" | "not_configured";
    message?: string;
    checkedAt: string;
    worldId?: string;
  }> = [];

  // ── Notion token ───────────────────────────────────────────────────────────
  const notionToken = process.env.NOTION_TOKEN;
  let notionTokenOk = false;
  if (!notionToken) {
    integrations.push({ service: "notion", label: "Notion", status: "not_configured", message: "NOTION_TOKEN not set", checkedAt });
  } else {
    try {
      const resp = await fetch("https://api.notion.com/v1/users/me", {
        headers: { Authorization: `Bearer ${notionToken}`, "Notion-Version": "2022-06-28" },
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        notionTokenOk = true;
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

  // ── Per-world Notion Production DB probes ──────────────────────────────────
  // Only probe if the token itself is valid — no point if the token is broken.
  if (notionTokenOk && notionToken) {
    try {
      const worlds = await db
        .select({
          id: worldsmithWorldsTable.id,
          name: worldsmithWorldsTable.name,
          notionProductionDbId: worldsmithWorldsTable.notionProductionDbId,
        })
        .from(worldsmithWorldsTable);

      const worldsWithDb = worlds.filter(w => w.notionProductionDbId);

      const dbProbes = await Promise.allSettled(
        worldsWithDb.map(async (w) => {
          const dbId = w.notionProductionDbId as string;
          const resp = await fetch(`https://api.notion.com/v1/databases/${dbId}`, {
            headers: { Authorization: `Bearer ${notionToken}`, "Notion-Version": "2022-06-28" },
            signal: AbortSignal.timeout(5000),
          });
          return { world: w, status: resp.status, ok: resp.ok };
        }),
      );

      dbProbes.forEach((result, idx) => {
        const w = worldsWithDb[idx];
        if (result.status === "fulfilled") {
          const { status, ok } = result.value;
          if (ok) {
            integrations.push({
              service: `notion_db_${w.id}`,
              label: `${w.name} — Production DB`,
              status: "connected",
              message: "Database accessible",
              checkedAt,
              worldId: w.id,
            });
          } else if (status === 404) {
            integrations.push({
              service: `notion_db_${w.id}`,
              label: `${w.name} — Production DB`,
              status: "warning",
              message: "Database not found (404) — check the DB ID or integration access",
              checkedAt,
              worldId: w.id,
            });
          } else if (status === 403) {
            integrations.push({
              service: `notion_db_${w.id}`,
              label: `${w.name} — Production DB`,
              status: "warning",
              message: "Integration not authorised for this database (403) — share the DB with the integration",
              checkedAt,
              worldId: w.id,
            });
          } else if (status === 401) {
            integrations.push({
              service: `notion_db_${w.id}`,
              label: `${w.name} — Production DB`,
              status: "failed",
              message: `Unauthorised (401)`,
              checkedAt,
              worldId: w.id,
            });
          } else {
            integrations.push({
              service: `notion_db_${w.id}`,
              label: `${w.name} — Production DB`,
              status: "warning",
              message: `Unexpected HTTP ${status}`,
              checkedAt,
              worldId: w.id,
            });
          }
        } else {
          // Promise rejected (network error / timeout)
          const errMsg = String((result as PromiseRejectedResult).reason?.message ?? (result as PromiseRejectedResult).reason);
          integrations.push({
            service: `notion_db_${w.id}`,
            label: `${w.name} — Production DB`,
            status: "failed",
            message: errMsg,
            checkedAt,
            worldId: w.id,
          });
        }
      });
    } catch (dbErr) {
      logger.error({ err: dbErr }, "WorldSmith health: failed to probe per-world Notion databases");
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

// ── POST /v1/worldsmith/copilot ──────────────────────────────────────────────
// Generic creative-writing copilot for any WorldSmith prose surface.
// surface: "story" | "canon_record" | "style_guide" | "spec" | "prompt_module"
// worldId: optional — if supplied the world's Bible is fetched for grounding.
// context: surface-specific object assembled by the client.

router.post("/v1/worldsmith/copilot", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const body = req.body as {
    surface?: string;
    worldId?: string;
    field?: string;
    fieldLabel?: string;
    message?: string;
    history?: { role: string; content: string }[];
    context?: Record<string, unknown>;
    summary?: boolean;
    attachmentDataUrl?: string;
    attachmentMediaType?: string;
    attachmentKind?: "image" | "document";
    attachmentName?: string;
  };

  const {
    surface,
    worldId,
    field,
    fieldLabel: rawFieldLabel = field ?? "this field",
    message,
    history,
    context,
    summary,
    attachmentDataUrl,
    attachmentMediaType,
    attachmentKind,
    attachmentName,
  } = body;
  const fieldLabel = typeof rawFieldLabel === "string" ? rawFieldLabel.trim().slice(0, 160) || "this field" : "this field";

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required", code: "MISSING_MESSAGE" });
    return;
  }
  if (!surface) {
    res.status(400).json({ error: "surface is required", code: "MISSING_SURFACE" });
    return;
  }
  const VALID_SURFACES = ["story", "canon_record", "style_guide", "spec", "prompt_module", "editorial"];
  if (!VALID_SURFACES.includes(surface)) {
    res.status(400).json({ error: `surface must be one of: ${VALID_SURFACES.join(", ")}`, code: "INVALID_SURFACE" });
    return;
  }

  const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const MAX_DOCUMENT_CHARS = 50_000;
  let imageBase64: string | null = null;
  let documentText: string | null = null;

  if (attachmentKind && !attachmentDataUrl) {
    res.status(400).json({ error: "attachmentDataUrl is required with an attachment", code: "INVALID_ATTACHMENT" });
    return;
  }
  if (attachmentDataUrl && attachmentKind !== "image" && attachmentKind !== "document") {
    res.status(400).json({ error: "attachmentKind must be image or document", code: "INVALID_ATTACHMENT" });
    return;
  }

  if (attachmentDataUrl && attachmentKind === "image") {
    const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/s.exec(attachmentDataUrl);
    const dataUrlMediaType = dataUrlMatch?.[1]?.toLowerCase();
    const requestedMediaType = attachmentMediaType?.toLowerCase();
    if (
      !dataUrlMatch ||
      !dataUrlMediaType ||
      !requestedMediaType ||
      !IMAGE_MEDIA_TYPES.has(dataUrlMediaType) ||
      requestedMediaType !== dataUrlMediaType
    ) {
      res.status(400).json({ error: "Unsupported image media type", code: "INVALID_ATTACHMENT_MEDIA_TYPE" });
      return;
    }
    imageBase64 = dataUrlMatch[2];
    if (!imageBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(imageBase64) || imageBase64.length % 4 === 1) {
      res.status(400).json({ error: "Image attachment must contain valid base64 data", code: "INVALID_ATTACHMENT" });
      return;
    }
    const imageBytes = Buffer.from(imageBase64, "base64");
    if (imageBytes.length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: "Image attachment must be 4 MB or smaller", code: "ATTACHMENT_TOO_LARGE" });
      return;
    }
  }

  if (attachmentDataUrl && attachmentKind === "document") {
    const dataUrlMatch = /^data:text\/plain;base64,(.*)$/s.exec(attachmentDataUrl);
    if (!dataUrlMatch || (attachmentMediaType && attachmentMediaType !== "text/plain")) {
      res.status(400).json({ error: "Document attachment must be text/plain base64 data", code: "INVALID_ATTACHMENT_MEDIA_TYPE" });
      return;
    }
    const encodedText = dataUrlMatch[1];
    if (!encodedText || !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedText) || encodedText.length % 4 === 1) {
      res.status(400).json({ error: "Document attachment must contain valid base64 data", code: "INVALID_ATTACHMENT" });
      return;
    }
    documentText = Buffer.from(encodedText, "base64").toString("utf8");
    if (documentText.length > MAX_DOCUMENT_CHARS) {
      res.status(400).json({ error: "Document text must be 50,000 characters or less", code: "ATTACHMENT_TOO_LARGE" });
      return;
    }
  }

  try {
    // Optionally fetch World Bible for grounding
    let worldBibleLines = "";
    if (worldId) {
      const [world] = await db
        .select()
        .from(worldsmithWorldsTable)
        .where(eq(worldsmithWorldsTable.id, worldId))
        .limit(1);
      if (world) {
        worldBibleLines = [
          `World: ${world.name}${world.description ? ` — ${world.description.slice(0, 1200)}` : ""}`,
          `Visual Palette: ${worldBibleRichTextToPlainText(world.visualPalette).slice(0, 700) || "(not set)"}`,
          `Prose Voice: ${worldBibleRichTextToPlainText(world.proseVoice).slice(0, 700) || "(not set)"}`,
          `Atmospheric Notes: ${worldBibleRichTextToPlainText(world.atmosphericNotes).slice(0, 700) || "(not set)"}`,
          `Material World: ${worldBibleRichTextToPlainText(world.materialWorld).slice(0, 700) || "(not set)"}`,
          Array.isArray(world.worldRules) && world.worldRules.length > 0
            ? `World Rules:\n${(world.worldRules as unknown[]).filter((rule): rule is string => typeof rule === "string").slice(0, 10).map(rule => `  - ${rule.trim().slice(0, 400)}`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n");
      }
    }

    let systemPrompt = "";

    if (surface === "story") {
      const { storyTitle, storyActs, draft, worldName, brainstorm } = (context ?? {}) as {
        storyTitle?: string;
        storyActs?: { actNumber: number; title: string; tagline?: string }[];
        draft?: Record<string, string>;
        worldName?: string;
        brainstorm?: boolean;
      };
      const isBrainstorm = brainstorm || (!storyTitle && fieldLabel === "Title");
      systemPrompt = [
        isBrainstorm
          ? `You are a WorldSmith Story Brainstorm Copilot — a creative collaborator helping develop NEW story ideas for this world. Your primary job is to listen to rough ideas and help shape them into a compelling story concept, then propose a specific, evocative title.`
          : `You are a WorldSmith Story Copilot — a creative collaborator helping develop narrative prose for this story.`,
        worldBibleLines ? `\n## World Context\n${worldBibleLines}` : (worldName ? `\n## World\n${worldName}` : ""),
        !isBrainstorm ? `\n## Story` : "",
        storyTitle ? `Title: ${storyTitle}` : "",
        storyActs?.length
          ? `Acts:\n${storyActs.map(a => `  Act ${a.actNumber}: ${a.title}${a.tagline ? ` — ${a.tagline}` : ""}`).join("\n")}`
          : "",
        draft?.summary ? `\nCurrent summary:\n${draft.summary.slice(0, 3000)}` : "",
        `\n## Focus\nHelping with: ${fieldLabel}`,
        `\n## Guidelines`,
        isBrainstorm ? "- Accept any seed — a character name, a mood, a conflict, an image — and develop it into a story concept" : "",
        isBrainstorm ? "- Ask one focused follow-up question to deepen the concept if it's very rough" : "",
        isBrainstorm ? "- Once the concept has enough shape, propose 2–3 specific, evocative story TITLES — short, memorable, world-grounded. Format them on separate lines, each starting with '✦ '" : "",
        isBrainstorm ? "- When the user picks or approves a title, reply with only that title as plain text so it can be applied directly" : "",
        !isBrainstorm ? "- Ground all suggestions in the world's established voice and rules" : "",
        !isBrainstorm ? "- Offer specific, concrete prose — not vague thematic statements" : "",
        !isBrainstorm ? "- When asked for a draft, write a polished paragraph ready to use" : "",
        "- Keep conversational replies short (2–4 sentences); only go longer for title proposals or a requested draft",
      ].filter(Boolean).join("\n");

    } else if (surface === "canon_record") {
      const { recordName, recordType, draft } = (context ?? {}) as {
        recordName?: string;
        recordType?: string;
        draft?: Record<string, string>;
      };
      const draftLines = draft
        ? Object.entries(draft)
            .filter(([, v]) => typeof v === "string" && (v as string).trim())
            .map(([k, v]) => `${k}:\n${(v as string).slice(0, 2000)}`)
            .join("\n\n")
        : "";
      systemPrompt = [
        `You are a WorldSmith Canon Copilot — a creative editor helping write the prose and context for a canon record.`,
        worldBibleLines ? `\n## World Context\n${worldBibleLines}` : "",
        `\n## Record\nName: ${recordName ?? "Unknown"}\nType: ${recordType ?? "Unknown"}`,
        draftLines ? `\nCurrent content:\n${draftLines}` : "",
        `\n## Focus\nHelping with: ${fieldLabel}`,
        `\n## Guidelines`,
        "- Every detail must cohere with the World Bible above — this record exists inside that world",
        "- Be specific: names, textures, sensory details, history — avoid generalities",
        "- When writing prose, match the world's established voice exactly",
        "- Consider how this record relates to others in the world — it should feel placed",
        "- Keep conversational replies short (2–4 sentences); only go longer for a requested draft",
      ].filter(Boolean).join("\n");

    } else if (surface === "editorial") {
      const { worldName, worldBible, recordsByType, totalRecords, currentPage } = (context ?? {}) as {
        worldName?: string;
        worldBible?: {
          description?: string | null;
          visualPalette?: string | null;
          proseVoice?: string | null;
          atmosphericNotes?: string | null;
          materialWorld?: string | null;
          worldRules?: string[] | null;
        };
        recordsByType?: Record<string, string[]>;
        totalRecords?: number;
        currentPage?: string;
      };

      const bibleLines: string[] = [];
      if (worldBible?.description)      bibleLines.push(`Description: ${worldBible.description.slice(0, 800)}`);
      if (worldBible?.visualPalette)    bibleLines.push(`Visual Palette: ${worldBibleRichTextToPlainText(worldBible.visualPalette).slice(0, 400)}`);
      if (worldBible?.proseVoice)       bibleLines.push(`Prose Voice: ${worldBibleRichTextToPlainText(worldBible.proseVoice).slice(0, 400)}`);
      if (worldBible?.atmosphericNotes) bibleLines.push(`Atmospheric Notes: ${worldBibleRichTextToPlainText(worldBible.atmosphericNotes).slice(0, 400)}`);
      if (worldBible?.materialWorld)    bibleLines.push(`Material World: ${worldBibleRichTextToPlainText(worldBible.materialWorld).slice(0, 400)}`);
      if (worldBible?.worldRules?.length) {
        bibleLines.push(`World Rules:\n${worldBible.worldRules.slice(0, 10).map(r => `  - ${r}`).join("\n")}`);
      }

      const rosterLines = Object.entries(recordsByType ?? {}).map(([type, names]) => {
        const label = type.charAt(0).toUpperCase() + type.slice(1);
        const list = (names as string[]).slice(0, 30).join(", ");
        const extra = (names as string[]).length > 30 ? ` (+${(names as string[]).length - 30} more)` : "";
        return `${label}s (${(names as string[]).length}): ${list}${extra}`;
      });

      systemPrompt = [
        `You are the WorldSmith Editorial Copilot for ${worldName ?? "this world"} — a knowledgeable creative collaborator with full awareness of the entire world and all its canon records.`,
        bibleLines.length ? `\n## World Bible\n${bibleLines.join("\n")}` : "",
        rosterLines.length
          ? `\n## Canon Roster (${totalRecords ?? rosterLines.length} records total)\n${rosterLines.join("\n")}`
          : "",
        currentPage ? `\n## Current Editorial Page\n${currentPage}` : "",
        `\n## Your Role`,
        "- Think holistically across the entire world — spot inconsistencies, suggest connections between records",
        "- Identify records that are underdeveloped given the world's established voice",
        "- Flag canon gaps: missing character types, unexplored locations, under-explained lore",
        "- Help plan story arcs and narrative threads connecting characters, locations, and objects",
        "- Draft or improve prose for any record — narrative, notes, visual descriptions — grounded in the world's established voice",
        "- Maintain strict internal consistency across all records",
        "- When asked about a specific record, reference the world context to give richer, more specific advice",
        "- Keep replies focused and actionable (2–4 sentences unless drafting content)",
        "- When asked to draft content, write polished, world-grounded prose ready to use",
        `\n## Suggesting new canon records`,
        "- Whenever the conversation reveals that a new character, location, object, faction, creature, or concept would meaningfully enrich the world, suggest it as a new record.",
        "- A single conversation can spawn multiple suggestions — e.g. discussing a heist story might reveal a fence character AND a hidden warehouse location.",
        "- At the END of any response where you identify one or more records worth creating, append a structured block in EXACTLY this format (do not include it if you have no suggestions):",
        "```",
        "[RECORD_SUGGESTIONS]",
        `[{"name":"<record name>","canonType":"<character|location|object|faction|creature|concept>","narrative":"<1-2 sentence world-grounded narrative description>"}]`,
        "[/RECORD_SUGGESTIONS]",
        "```",
        "- The block must be valid JSON — an array, even for a single suggestion.",
        "- canonType must be one of: character, location, object, faction, creature, concept.",
        "- Do NOT mention the block or the format in the conversational part of your reply.",
      ].filter(Boolean).join("\n");

    } else if (surface === "spec") {
      const { draft, linkedAssets, section } = (context ?? {}) as {
        draft?: Record<string, unknown>;
        linkedAssets?: {
          canonRecordIds?: string[];
          styleGuideId?: string | null;
          componentSpecId?: string | null;
          promptModuleIds?: string[];
        };
        linkedAssetSummaries?: string[];
        section?: string;
      };
      const safeIds = (value: unknown) => Array.isArray(value)
        ? value.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200).slice(0, 20)
        : [];
      const canonIds = safeIds(linkedAssets?.canonRecordIds);
      const moduleIds = safeIds(linkedAssets?.promptModuleIds);
      const styleGuideIds = safeIds(linkedAssets?.styleGuideId ? [linkedAssets.styleGuideId] : []);
      const componentSpecIds = safeIds(linkedAssets?.componentSpecId ? [linkedAssets.componentSpecId] : []);
      const [canonRecords, styleGuides, componentSpecs, promptModules] = worldId
        ? await Promise.all([
            canonIds.length ? db.select({ id: wsCanonRecordsTable.id, name: wsCanonRecordsTable.name, status: wsCanonRecordsTable.status }).from(wsCanonRecordsTable).where(and(eq(wsCanonRecordsTable.worldId, worldId), inArray(wsCanonRecordsTable.id, canonIds))) : Promise.resolve([]),
            styleGuideIds.length ? db.select({ id: wsStyleGuidesTable.id, name: wsStyleGuidesTable.name }).from(wsStyleGuidesTable).where(and(eq(wsStyleGuidesTable.worldId, worldId), inArray(wsStyleGuidesTable.id, styleGuideIds))) : Promise.resolve([]),
            componentSpecIds.length ? db.select({ id: wsComponentSpecsTable.id, name: wsComponentSpecsTable.name }).from(wsComponentSpecsTable).where(and(eq(wsComponentSpecsTable.worldId, worldId), inArray(wsComponentSpecsTable.id, componentSpecIds))) : Promise.resolve([]),
            moduleIds.length ? db.select({ id: wsPromptModulesTable.id, name: wsPromptModulesTable.name }).from(wsPromptModulesTable).where(and(eq(wsPromptModulesTable.worldId, worldId), inArray(wsPromptModulesTable.id, moduleIds))) : Promise.resolve([]),
          ])
        : [[], [], [], []];
      const draftLines = draft
        ? Object.entries(draft)
            .filter(([, value]) => typeof value === "string" && value.trim())
            .slice(0, 10)
            .map(([key, value]) => `${key.slice(0, 80)}:\n${(value as string).slice(0, 1200)}`)
            .join("\n\n")
        : "";
      const relationshipLines = [
        ...styleGuides.map(guide => `Style guide: ${guide.name}`),
        ...componentSpecs.map(component => `Component spec: ${component.name}`),
        ...canonRecords.map(record => `Canon (${record.status}): ${record.name}`),
        ...promptModules.map(module => `Prompt module: ${module.name}`),
      ].filter(Boolean).join("\n");
      systemPrompt = [
        `You are a WorldSmith Production Spec Copilot — a creative producer helping editorial teams create and refine production specs.`,
        `Production specs define printable components: hero papers, journal cards, ephemera sheets, decorative papers, coordinating papers, and more.`,
        worldBibleLines ? `\n## World Context\n${worldBibleLines}` : "",
        typeof section === "string" && section.trim() ? `\n## Active section\n${section.trim().slice(0, 160)}` : "",
        draftLines ? `\n## Current draft\n${draftLines}` : "",
        relationshipLines ? `\n## Linked editorial assets\n${relationshipLines}` : "",
        `\n## Focus\nHelping with: ${fieldLabel}`,
        `\n## Your role`,
        "- Ground every recommendation in the World Context and the linked editorial assets",
        "- Help with drafts, revisions, constraints, examples, canon consistency, payload structure, and review criteria",
        "- For a request to draft or revise the active field, return only finished, paste-ready content for that field",
        "- Do not invent accepted canon facts; flag uncertainty and recommend an explicit canon decision",
        "- Keep conversational replies short (2–4 sentences); only go longer for requested field-ready content",
      ].filter(Boolean).join("\n");

    } else if (surface === "prompt_module") {
      const { draft, section } = (context ?? {}) as {
        draft?: Record<string, unknown>;
        section?: string;
      };
      const draftLines = draft
        ? Object.entries(draft)
            .filter(([, value]) => typeof value === "string" && value.trim())
            .slice(0, 10)
            .map(([key, value]) => `${key.slice(0, 80)}:\n${(value as string).slice(0, 1200)}`)
            .join("\n\n")
        : "";
      systemPrompt = [
        `You are a WorldSmith Prompt Module Copilot — a prompt editor helping create reusable, precise production modules.`,
        worldBibleLines ? `\n## World Context\n${worldBibleLines}` : "",
        typeof section === "string" && section.trim() ? `\n## Active section\n${section.trim().slice(0, 160)}` : "",
        draftLines ? `\n## Module draft\n${draftLines}` : "",
        `\n## Focus\nHelping with: ${fieldLabel}`,
        `\n## Guidelines`,
        "- Keep prompt content concrete, composable, and directly usable in a compiled prompt",
        "- Help distinguish visual direction, targeting, canon constraints, injection priority, and observable quality checks",
        "- Flag likely conflicts with other modules or production constraints when the draft suggests one",
        "- For a request to draft or revise the active field, return only finished, paste-ready content for that field",
        "- Keep conversational replies short (2–4 sentences); only go longer for requested field-ready content",
      ].filter(Boolean).join("\n");

    } else {
      // style_guide
      const { guideName, guideType, draft } = (context ?? {}) as {
        guideName?: string;
        guideType?: string;
        draft?: Record<string, string>;
      };
      const filledFields = draft
        ? Object.entries(draft)
            .filter(([, v]) => typeof v === "string" && (v as string).trim())
            .slice(0, 10)
            .map(([k, v]) => `${k.slice(0, 80)}:\n${(v as string).slice(0, 1200)}`)
            .join("\n\n")
        : "";
      systemPrompt = [
        `You are a WorldSmith Style Guide Copilot — an expert creative director helping write a ${guideType || "style"} guide.`,
        `\n## Guide Context\nName: ${guideName ?? "Untitled"}\nType: ${guideType ?? "General"}`,
        worldBibleLines ? `\n## World Context\n${worldBibleLines}` : "",
        filledFields ? `\n## Guide content so far\n${filledFields}` : "",
        `\n## Focus\nHelping with: ${fieldLabel}`,
        `\n## Guidelines`,
        "- Style guide prose must be precise and immediately actionable — avoid vague aesthetic language",
        "- For visual fields (palette, illustration, texture): give measurable specifications alongside evocative language",
        "- For voice/tone fields: provide example phrases and concrete rules, not generalities",
        "- Ensure consistency with the rest of the guide content above",
        "- When asked for a draft, write complete, production-ready copy",
        "- Keep conversational replies short (2–4 sentences); only go longer for a requested draft",
      ].filter(Boolean).join("\n");
    }

    const summaryMode = summary === true;
    if (summaryMode) {
      systemPrompt = [
        systemPrompt,
        `\n## Conversation summary task`,
        "Turn the conversation below into concise working notes for an editor returning after changing editorial actions.",
        "- Use short headings for: Key ideas, Confirmed decisions, Open questions, and Next steps.",
        "- Keep facts tied to the supplied world and conversation; do not invent decisions or canon.",
        "- Include only a heading when it has useful content, and keep the result easy to copy into working notes.",
        "- Do not add record-suggestion markup or speak directly to the editor outside the notes.",
      ].join("\n");
    }

    const safeHistory = (Array.isArray(history) ? history : [])
      .filter((m): m is { role: "user" | "assistant"; content: string } =>
        (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
      .map(m => ({ ...m, content: m.content.trim().slice(0, summaryMode ? 2000 : 1500) }))
      .filter(m => m.content.length > 0)
      .slice(summaryMode ? -20 : -10);

    // Normalize: Anthropic requires conversations to start with a user message.
    // Drop all leading assistant messages (e.g. synthetic greeting from client state).
    // When firstUserIdx is -1 the history is all-assistant → drop everything.
    const firstUserIdx = safeHistory.findIndex(m => m.role === "user");
    const normalizedHistory = firstUserIdx < 0 ? [] : safeHistory.slice(firstUserIdx);

    // Build the user turn — multimodal when an image attachment is present.
    const trimmedMessage = message.trim().slice(0, 3000);
    // Image turns are deliberately routed to Claude. The Co-write attachment
    // contract promises vision grounding, and this content shape is the Claude
    // Messages format already used by planner hotspots. Document-only and
    // text-only turns continue to honour the configured default provider.
    const messageProvider = imageBase64
      ? "claude"
      : process.env.DEFAULT_AI_PROVIDER ?? "claude";

    let userTurn: { role: "user"; content: string } | { role: "user"; content: unknown };

    if (imageBase64 && attachmentMediaType) {
      // Claude multimodal format (same pattern as planner-hotspots.ts:316-339).
      // messageProvider is forced to "claude" above for this branch.
      userTurn = {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: attachmentMediaType.toLowerCase(),
              data: imageBase64,
            },
          },
          {
            type: "text",
            text: trimmedMessage,
          },
        ],
      };
    } else if (documentText) {
      const docLabel = attachmentName
        ? `[Attached document: "${attachmentName.slice(0, 200)}"]\n`
        : "[Attached document]\n";
      const combinedContent = `${docLabel}${documentText.slice(0, MAX_DOCUMENT_CHARS)}\n\n---\n\n${trimmedMessage}`;
      userTurn = { role: "user", content: combinedContent };
    } else {
      userTurn = { role: "user", content: trimmedMessage };
    }

    const result = await callAi(
      [...normalizedHistory, userTurn] as Parameters<typeof callAi>[0],
      messageProvider,
      systemPrompt,
    );

    // Parse record suggestions embedded by the model for the "editorial" surface.
    let replyText = result.content;
    let suggestions: { name: string; canonType: string; narrative?: string }[] | undefined;
    if (surface === "editorial" && !summaryMode) {
      const suggestMatch = replyText.match(/\[RECORD_SUGGESTIONS\]\s*([\s\S]*?)\s*\[\/RECORD_SUGGESTIONS\]/);
      if (suggestMatch) {
        try {
          const parsed = JSON.parse(suggestMatch[1]!.trim());
          if (Array.isArray(parsed) && parsed.length > 0) suggestions = parsed;
        } catch { /* malformed JSON — ignore */ }
        // Strip the block (and surrounding blank lines) from the visible reply
        replyText = replyText
          .replace(/\n?\[RECORD_SUGGESTIONS\][\s\S]*?\[\/RECORD_SUGGESTIONS\]\n?/, "")
          .trim();
      }
    }

    res.json({ reply: replyText, suggestions, provider: result.provider, model: result.model });
  } catch (err) {
    logger.error({ err }, "WorldSmith copilot failed");
    res.status(502).json({ error: "The copilot couldn't respond. Try again.", code: "AI_ERROR" });
  }
});

// ── POST /v1/worldsmith/worlds/:id/bible-copilot ─────────────────────────────
// Conversational creative partner for drafting World Bible fields.
// Grounded on the world's full Bible content + the active field.

const BIBLE_COPILOT_FIELDS: Record<string, string> = {
  visualPalette: "Visual Palette (what the world looks like — colours, lighting, textures)",
  proseVoice: "Prose Voice (how the world speaks — register, rhythm, vocabulary)",
  atmosphericNotes: "Atmospheric Notes (what the world feels like — temperature, sound, smell, mood)",
  materialWorld: "Material World (tactile qualities and sensory anchors)",
};

router.post("/v1/worldsmith/worlds/:id/bible-copilot", requireStoreAccess("store_staff"), requireWorldsmithEnabled, async (req: Request, res: Response) => {
  const worldId = req.params.id as string;
  const body = req.body as {
    field?: string;
    message?: string;
    history?: { role: string; content: string }[];
    draft?: Partial<Record<string, string>>;
    attachmentDataUrl?: string;
    attachmentMediaType?: string;
    attachmentKind?: "image" | "document";
    attachmentName?: string;
  };

  const {
    field,
    message,
    history,
    draft,
    attachmentDataUrl,
    attachmentMediaType,
    attachmentKind,
    attachmentName,
  } = body;

  if (!message || typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required", code: "MISSING_MESSAGE" });
    return;
  }
  if (field && !BIBLE_COPILOT_FIELDS[field]) {
    res.status(400).json({
      error: `field must be one of: ${Object.keys(BIBLE_COPILOT_FIELDS).join(", ")}`,
      code: "INVALID_FIELD",
    });
    return;
  }

  const IMAGE_MEDIA_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
  const MAX_DOCUMENT_CHARS = 50_000;
  let imageBase64: string | null = null;
  let documentText: string | null = null;

  if (attachmentKind && !attachmentDataUrl) {
    res.status(400).json({ error: "attachmentDataUrl is required with an attachment", code: "INVALID_ATTACHMENT" });
    return;
  }
  if (attachmentDataUrl && attachmentKind !== "image" && attachmentKind !== "document") {
    res.status(400).json({ error: "attachmentKind must be image or document", code: "INVALID_ATTACHMENT" });
    return;
  }
  if (attachmentDataUrl && attachmentKind === "image") {
    const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/s.exec(attachmentDataUrl);
    const dataUrlMediaType = dataUrlMatch?.[1]?.toLowerCase();
    const requestedMediaType = attachmentMediaType?.toLowerCase();
    if (
      !dataUrlMatch ||
      !dataUrlMediaType ||
      !requestedMediaType ||
      !IMAGE_MEDIA_TYPES.has(dataUrlMediaType) ||
      requestedMediaType !== dataUrlMediaType
    ) {
      res.status(400).json({ error: "Unsupported image media type", code: "INVALID_ATTACHMENT_MEDIA_TYPE" });
      return;
    }
    imageBase64 = dataUrlMatch[2];
    if (!imageBase64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(imageBase64) || imageBase64.length % 4 === 1) {
      res.status(400).json({ error: "Image attachment must contain valid base64 data", code: "INVALID_ATTACHMENT" });
      return;
    }
    if (Buffer.from(imageBase64, "base64").length > MAX_IMAGE_BYTES) {
      res.status(400).json({ error: "Image attachment must be 4 MB or smaller", code: "ATTACHMENT_TOO_LARGE" });
      return;
    }
  }
  if (attachmentDataUrl && attachmentKind === "document") {
    const dataUrlMatch = /^data:text\/plain;base64,(.*)$/s.exec(attachmentDataUrl);
    if (!dataUrlMatch || (attachmentMediaType && attachmentMediaType !== "text/plain")) {
      res.status(400).json({ error: "Document attachment must be text/plain base64 data", code: "INVALID_ATTACHMENT_MEDIA_TYPE" });
      return;
    }
    const encodedText = dataUrlMatch[1];
    if (!encodedText || !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedText) || encodedText.length % 4 === 1) {
      res.status(400).json({ error: "Document attachment must contain valid base64 data", code: "INVALID_ATTACHMENT" });
      return;
    }
    documentText = Buffer.from(encodedText, "base64").toString("utf8");
    if (documentText.length > MAX_DOCUMENT_CHARS) {
      res.status(400).json({ error: "Document text must be 50,000 characters or less", code: "ATTACHMENT_TOO_LARGE" });
      return;
    }
  }

  try {
    const [world] = await db
      .select()
      .from(worldsmithWorldsTable)
      .where(scopedStoreId(req)
        ? and(eq(worldsmithWorldsTable.id, worldId), eq(worldsmithWorldsTable.storeId, scopedStoreId(req)!))
        : eq(worldsmithWorldsTable.id, worldId))
      .limit(1);

    if (!world) {
      res.status(404).json({ error: "World not found", code: "NOT_FOUND" });
      return;
    }

    // Prefer the caller's unsaved draft over the persisted row so suggestions
    // reflect what's currently on screen. Bounded to keep the prompt sane.
    const pick = (key: "visualPalette" | "proseVoice" | "atmosphericNotes" | "materialWorld"): string => {
      const d = draft && typeof draft[key] === "string" ? (draft[key] as string) : undefined;
      const v = worldBibleRichTextToPlainText(d !== undefined ? d : (world[key] as string | null) ?? "");
      return v ? v.slice(0, 4000) : "(not yet written)";
    };

    const bibleLines = [
      `Visual Palette: ${pick("visualPalette")}`,
      `Prose Voice: ${pick("proseVoice")}`,
      `Atmospheric Notes: ${pick("atmosphericNotes")}`,
      `Material World: ${pick("materialWorld")}`,
      `World Rules: ${Array.isArray(world.worldRules) && world.worldRules.length > 0 ? (world.worldRules as string[]).map(r => `\n  - ${r}`).join("") : "(none defined)"}`,
    ].join("\n");

    const systemPrompt = [
      `You are the WorldSmith Bible Copilot — a thoughtful creative editor helping a world-builder write the World Bible for "${world.name}"${world.description ? ` (${world.description})` : ""}.`,
      "",
      "## The World Bible so far",
      bibleLines,
      "",
      field
        ? `## Current focus\nThe user is working on the "${BIBLE_COPILOT_FIELDS[field]}" field. Ground your suggestions in the rest of the Bible so the world stays coherent.`
        : "## Current focus\nNo specific field is focused; help with whichever aspect the user raises.",
      "",
      "## How to behave",
      "- You are a creative collaborator, not a generic assistant. Ask clarifying questions when the direction is vague.",
      "- Offer concrete example phrases, contrasting directions, and sensory specifics — never vague platitudes.",
      "- When the user wants a draft, produce a polished paragraph they can drop straight into the field: evocative, specific, and consistent with the world's established voice.",
      "- Never break the World Rules listed above.",
      "- Keep conversational replies short (2-5 sentences). Only go longer when producing a requested draft.",
      "- Respond in plain prose. No markdown headings, no bullet lists unless the user asks for options.",
    ].join("\n");

    // Sanitise history: only user/assistant roles, cap at last 20 turns.
    // Then normalize: Anthropic requires conversations to start with a user message.
    // Drop leading assistant messages (e.g. synthetic greeting injected client-side).
    const safeHistory = (Array.isArray(history) ? history : [])
      .filter((m): m is { role: "user" | "assistant"; content: string } =>
        (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
      .slice(-20);

    const firstUserIdx = safeHistory.findIndex(m => m.role === "user");
    const normalizedHistory = firstUserIdx < 0 ? [] : safeHistory.slice(firstUserIdx);

    const trimmedMessage = message.trim().slice(0, 3000);
    const provider = imageBase64 ? "claude" : process.env.DEFAULT_AI_PROVIDER ?? "claude";
    const userTurn = imageBase64 && attachmentMediaType
      ? {
          role: "user" as const,
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: attachmentMediaType.toLowerCase(),
                data: imageBase64,
              },
            },
            { type: "text", text: trimmedMessage },
          ],
        }
      : {
          role: "user" as const,
          content: documentText
            ? `${attachmentName ? `[Attached document: "${attachmentName.slice(0, 200)}"]\n` : "[Attached document]\n"}${documentText.slice(0, MAX_DOCUMENT_CHARS)}\n\n---\n\n${trimmedMessage}`
            : trimmedMessage,
        };

    const result = await callAi(
      [...normalizedHistory, userTurn] as Parameters<typeof callAi>[0],
      provider,
      systemPrompt,
    );

    res.json({ reply: result.content, provider: result.provider, model: result.model });
  } catch (err) {
    logger.error({ err, worldId }, "Bible copilot failed");
    res.status(502).json({ error: "The copilot couldn't respond. Try again.", code: "AI_ERROR" });
  }
});

// ── PATCH /v1/worldsmith/worlds/:id ──────────────────────────────────────────
// Update mutable world settings in-place (no delete + recreate needed).
// Accepts a partial set of fields; only supplied keys are updated.

router.patch("/v1/worldsmith/worlds/:id", requireStoreAccess("store_staff"), requireWorldsmithEnabled, async (req: Request, res: Response) => {
  const worldId = req.params.id as string;

  const body = req.body as {
    notionProductionDbId?: unknown;
    notionCanonDbId?: unknown;
    driveFolderId?: unknown;
    imageProvider?: unknown;
    status?: string;
    currentCollection?: unknown;
    currentVolume?: unknown;
    worldRules?: unknown;
    // World Bible fields
    visualPalette?: unknown;
    proseVoice?: unknown;
    atmosphericNotes?: unknown;
    materialWorld?: unknown;
    coverImageUrl?: unknown;
    typography?: unknown;
  };

  if (
    "worldRules" in body &&
    req.actor?.isSuperAdmin !== true &&
    req.actor?.storeRole !== "store_owner"
  ) {
    res.status(403).json({
      error: "Forbidden: worldRules can only be updated by a store owner or super admin",
      code: "WORLD_RULES_OWNER_REQUIRED",
      field: "worldRules",
    });
    return;
  }

  // Build a patch object with only the keys the caller supplied
  const patch: Record<string, unknown> = {};
  const addNullableText = (requestKey: string, dbKey: string, richText = false) => {
    if (!(requestKey in body)) return true;
    const value = body[requestKey as keyof typeof body];
    if (value !== null && typeof value !== "string") {
      res.status(400).json({ error: `${requestKey} must be a string or null`, code: "INVALID_FIELD" });
      return false;
    }
    const normalized = typeof value === "string"
      ? (richText ? sanitizeWorldBibleRichText(value) : value.trim())
      : null;
    patch[dbKey] = normalized || null;
    return true;
  };

  const nullableTextFields: Array<[string, string, boolean?]> = [
    ["notionProductionDbId", "notionProductionDbId"],
    ["notionCanonDbId", "notionCanonDbId"],
    ["driveFolderId", "driveFolderId"],
    ["imageProvider", "imageProvider"],
    ["currentCollection", "currentCollection"],
    ["currentVolume", "currentVolume"],
    ["visualPalette", "visualPalette", true],
    ["proseVoice", "proseVoice", true],
    ["atmosphericNotes", "atmosphericNotes", true],
    ["materialWorld", "materialWorld", true],
    ["coverImageUrl", "coverImageUrl"],
  ];
  for (const [requestKey, dbKey, richText] of nullableTextFields) {
    if (!addNullableText(requestKey, dbKey, richText)) return;
  }

  if ("status" in body) {
    const validStatuses = ["active", "in_setup", "archived"];
    if (!validStatuses.includes(body.status as string)) {
      res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}`, code: "INVALID_STATUS" });
      return;
    }
    patch.status = body.status;
  }
  if ("worldRules" in body) {
    if (!Array.isArray(body.worldRules) && body.worldRules !== null) {
      res.status(400).json({ error: "worldRules must be an array of strings or null", code: "INVALID_WORLD_RULES" });
      return;
    }
    if (Array.isArray(body.worldRules) && body.worldRules.some(rule => typeof rule !== "string")) {
      res.status(400).json({ error: "worldRules must be an array of strings or null", code: "INVALID_WORLD_RULES" });
      return;
    }
    // Sanitise: trim each rule and drop blank entries
    patch.worldRules = body.worldRules
      ? body.worldRules.map((r: string) => r.trim()).filter(Boolean)
      : [];
  }
  if ("typography" in body) {
    try {
      const requestStoreId = scopedStoreId(req);
      const [world] = await db
        .select({ storeId: worldsmithWorldsTable.storeId })
        .from(worldsmithWorldsTable)
        .where(requestStoreId
          ? and(eq(worldsmithWorldsTable.id, worldId), eq(worldsmithWorldsTable.storeId, requestStoreId))
          : eq(worldsmithWorldsTable.id, worldId))
        .limit(1);

      if (!world) {
        res.status(404).json({ error: "World not found", code: "NOT_FOUND" });
        return;
      }

      patch.typography = await resolveTypographyChoices(
        body.typography,
        world.storeId ? await storeEntitlementContext(world.storeId) : undefined,
      );
    } catch (err) {
      const message = err instanceof TypographyValidationError ? err.message : "Invalid typography selection.";
      res.status(400).json({ error: message, code: "INVALID_TYPOGRAPHY" });
      return;
    }
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "No updatable fields provided", code: "MISSING_FIELDS" });
    return;
  }

  patch.updatedAt = new Date();

  try {
    const [updated] = await db
      .update(worldsmithWorldsTable)
      .set(patch)
      .where(scopedStoreId(req)
        ? and(eq(worldsmithWorldsTable.id, worldId), eq(worldsmithWorldsTable.storeId, scopedStoreId(req)!))
        : eq(worldsmithWorldsTable.id, worldId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "World not found", code: "NOT_FOUND" });
      return;
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err, worldId }, "Failed to update world");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /v1/worldsmith/runs/:runId/refresh-collection-name ──────────────────
// Fetch the current Notion page title for the stored collection ID and patch
// resolved_source_ids.collection_name without requiring a full recompile.

router.post("/v1/worldsmith/runs/:runId/refresh-collection-name", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const runId = req.params.runId as string;

  try {
    const run = await getRun(runId);
    if (!run) {
      res.status(404).json({ error: "Run not found", code: "RUN_NOT_FOUND" });
      return;
    }

    const src = (run.resolvedSourceIds ?? {}) as Record<string, string | string[]>;
    // collection_notion_id is the preferred key; fall back to legacy "collection" key
    const collectionId =
      typeof src.collection_notion_id === "string" ? src.collection_notion_id
      : typeof src.collection === "string" ? src.collection
      : null;

    if (!collectionId) {
      res.status(400).json({ error: "No collection Notion ID stored for this run", code: "NO_COLLECTION_ID" });
      return;
    }

    // Fetch current title from Notion
    const page = await getPage(collectionId);
    const p = page.properties;
    const newName =
      extractTitle(p["Name"]) ||
      extractTitle(p["Collection"]) ||
      extractTitle(p["Title"]) ||
      collectionId;

    // Patch resolved_source_ids, preserving all existing keys
    const updated: Record<string, string | string[]> = { ...src, collection_name: newName };
    await updateRun(runId, { resolvedSourceIds: updated });

    res.json({ collection_name: newName, run_id: runId });
  } catch (err) {
    const msg = String(err);
    const isNotFound = /404|not_found|object_not_found/i.test(msg);
    const isRateLimited = /429|rate.?limit/i.test(msg);
    const isUnreachable = /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|AbortError|timeout/i.test(msg);

    if (isNotFound) {
      res.status(404).json({ error: "Notion page not found. The collection page may have been deleted.", code: "NOTION_NOT_FOUND" });
    } else if (isRateLimited) {
      res.status(429).json({ error: "Notion rate limit hit. Wait a moment and try again.", code: "NOTION_RATE_LIMITED" });
    } else if (isUnreachable) {
      res.status(503).json({ error: "Notion is unreachable. Check connectivity and retry.", code: "NOTION_UNREACHABLE" });
    } else {
      logger.error({ err, runId }, "Failed to refresh collection name");
      res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
    }
  }
});

// ── POST /v1/worldsmith/generate-payload ─────────────────────────────────────
// Preview-only: resolve the InheritanceChain, check requirements, synthesize a
// PP-2.0 payload draft using OpenAI, and return it WITHOUT writing to Notion.

router.post("/v1/worldsmith/generate-payload", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const { spec_id: rawSpecId, confirm_warnings = false } = req.body as {
    spec_id?: string;
    confirm_warnings?: boolean;
  };

  if (!rawSpecId?.trim()) {
    res.status(400).json({ error: "spec_id is required", code: "MISSING_FIELDS" });
    return;
  }

  const specId = normalizeId(rawSpecId);

  try {
    // Resolve full inheritance chain
    const chain = await resolveInheritanceChain(specId);

    // Check requirements
    const reqCheck = checkGenerationRequirements(chain);

    if (!reqCheck.canGenerate) {
      res.status(422).json({
        error: "Generation requirements not met",
        code: "REQUIREMENTS_NOT_MET",
        errors: reqCheck.errors,
        warnings: reqCheck.warnings,
      });
      return;
    }

    if (reqCheck.requiresConfirmation && !confirm_warnings) {
      res.status(200).json({
        requires_confirmation: true,
        errors: reqCheck.errors,
        warnings: reqCheck.warnings,
        code: "CONFIRM_WARNINGS_REQUIRED",
      });
      return;
    }

    // Generate draft
    const draft = await generatePayloadDraft(chain);

    res.json({
      spec_id: specId,
      production_item: draft.productionItem,
      component_type: draft.componentType,
      sections: draft.sections,
      serialized: draft.serialized,
      pre_save_issues: draft.preSaveIssues,
      generator_warnings: draft.generatorWarnings,
      warnings: reqCheck.warnings,
    });
  } catch (err) {
    if (err instanceof InheritanceError) {
      res.status(422).json({
        error: err.message,
        code: "INHERITANCE_ERROR",
        details: (err as InheritanceError & { details?: unknown }).details,
      });
      return;
    }
    const msg = String(err);
    const isNotFound  = /404|not_found|object_not_found/i.test(msg);
    const isRateLimit = /429|rate.?limit/i.test(msg);
    const isOpenAI    = /openai|openai api error/i.test(msg);
    const isTimeout   = /timeout|AbortError/i.test(msg);

    if (isNotFound)  { res.status(404).json({ error: "Notion page not found.", code: "NOTION_NOT_FOUND" }); return; }
    if (isRateLimit) { res.status(429).json({ error: "Notion rate limit hit.", code: "NOTION_RATE_LIMITED" }); return; }
    if (isOpenAI)    { res.status(502).json({ error: `AI synthesis failed: ${msg}`, code: "AI_SYNTHESIS_ERROR" }); return; }
    if (isTimeout)   { res.status(504).json({ error: "Request timed out while generating payload.", code: "TIMEOUT" }); return; }

    logger.error({ err, specId }, "generate-payload error");
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// ── POST /v1/worldsmith/save-payload ─────────────────────────────────────────
// Write a previously-previewed PP-2.0 payload to Notion (Prompt Payload + Next
// Action only).  Validates pre-save constraints, verifies persistence, then
// re-runs compilation.  Refuses to overwrite a non-blank Prompt Payload.

router.post("/v1/worldsmith/save-payload", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const { spec_id: rawSpecId, serialized_payload, skip_recompile = false } = req.body as {
    spec_id?: string;
    serialized_payload?: string;
    skip_recompile?: boolean;
  };

  if (!rawSpecId?.trim() || !serialized_payload?.trim()) {
    res.status(400).json({ error: "spec_id and serialized_payload are required", code: "MISSING_FIELDS" });
    return;
  }

  const specId = normalizeId(rawSpecId);

  // Server-side PP-2.0 structure validation — enforced even when the operator
  // has manually edited the serialized text in the UI before saving.
  const { sections: parsedSections, issues: validationIssues } = parseAndValidateSerializedPayload(serialized_payload);
  if (validationIssues.length > 0 || !parsedSections) {
    res.status(422).json({
      error: "Payload failed pre-save validation — fix the issues and retry.",
      code: "PAYLOAD_VALIDATION_FAILED",
      validation_issues: validationIssues,
    });
    return;
  }

  try {
    const saveResult = await writePayloadToNotion(specId, serialized_payload);

    if (!saveResult.success) {
      const status = saveResult.errorCode === PAYLOAD_GEN_ERROR_CODES.PAYLOAD_ALREADY_EXISTS ? 409 : 500;
      res.status(status).json({
        error: saveResult.error,
        code: saveResult.errorCode ?? "SAVE_FAILED",
      });
      return;
    }

    // Re-run compilation unless caller opted out
    let compilationResult: unknown = null;
    if (!skip_recompile) {
      try {
        const chain = await resolveInheritanceChain(specId);
        compilationResult = { started: true, spec_id: specId };
        // Fire and forget — don't block the save response on compilation
        // The caller can poll /v1/worldsmith/runs to see the result
        logger.info({ specId }, "save-payload: triggering background recompile");
        void (async () => {
          try {
            const { runCompilation } = await import("../lib/worldsmith/orchestrator");
            await runCompilation({
              notion_production_spec_id: specId,
              operation: "validate_and_compile",
              dry_run: false,
            });
          } catch (compileErr) {
            logger.warn({ err: compileErr, specId }, "Post-save recompile failed (non-blocking)");
          }
        })();
      } catch (chainErr) {
        logger.warn({ err: chainErr, specId }, "Could not resolve chain for post-save recompile");
        compilationResult = { started: false, error: String(chainErr) };
      }
    }

    res.json({
      success: true,
      spec_id: specId,
      persistence_verified: saveResult.persistenceVerified,
      mismatch: saveResult.mismatch ?? null,
      recompile: compilationResult,
    });
  } catch (err) {
    logger.error({ err, specId }, "save-payload error");
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// ── POST /v1/worldsmith/batch-generate-payloads ───────────────────────────────
// Audit a world's Notion Production DB for PP-2.0 records with blank payloads.
// Groups results into ready / warning / blocked WITHOUT writing or generating AI
// content — the operator reviews the audit before triggering per-record generation.

router.post("/v1/worldsmith/batch-generate-payloads", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  const { world_id: rawWorldId, limit = 60 } = req.body as {
    world_id?: string;
    limit?: number;
  };

  if (!rawWorldId?.trim()) {
    res.status(400).json({ error: "world_id is required", code: "MISSING_FIELDS" });
    return;
  }

  const safeLimit = Math.min(Number(limit) || 60, 100);

  try {
    // Look up the world to get its Notion Production DB ID
    const [world] = await db
      .select()
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, rawWorldId))
      .limit(1);

    if (!world) {
      res.status(404).json({ error: "World not found", code: "NOT_FOUND" });
      return;
    }

    const dbId = world.notionProductionDbId;
    if (!dbId) {
      res.status(422).json({
        error: "This world has no Notion Production DB configured. Set it in world settings.",
        code: "NO_NOTION_DB",
      });
      return;
    }

    // Query the Notion DB — fetch PP-2.0 records (client-side filter for blank payload).
    // queryDatabase paginates automatically; we limit by slicing the result array.
    let pages: Awaited<ReturnType<typeof queryDatabase>>;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pages = await queryDatabase(dbId, { property: "Payload Version", select: { equals: "PP-2.0" } } as any);
    } catch (notionErr) {
      const msg = String(notionErr);
      const isRateLimit = /429|rate.?limit/i.test(msg);
      const isNotFound  = /404|not_found|object_not_found/i.test(msg);
      if (isRateLimit) {
        res.status(429).json({ error: "Notion rate limit hit.", code: "NOTION_RATE_LIMITED" });
      } else if (isNotFound) {
        res.status(404).json({ error: "Notion DB not found — check the Production DB ID in world settings.", code: "NOTION_DB_NOT_FOUND" });
      } else {
        res.status(503).json({ error: `Could not query Notion DB: ${msg}`, code: "NOTION_QUERY_FAILED" });
      }
      return;
    }

    // Filter client-side for blank Prompt Payload, then cap at safeLimit
    const pp2Pages = pages.filter((p: { properties: Record<string, unknown> }) => {
      const payload = extractRichText(p.properties["Prompt Payload"]) || extractRichText(p.properties["Payload"]) || "";
      return !payload.trim();
    });
    const truncated = pp2Pages.length > safeLimit;
    const results = pp2Pages.slice(0, safeLimit);

    const ready:   Array<{ specId: string; productionItem: string; componentType: string; missingFields: string[] }> = [];
    const warning: Array<{ specId: string; productionItem: string; componentType: string; warnings: string[] }> = [];
    const blocked: Array<{ specId: string; productionItem: string; componentType: string; errors: string[] }> = [];

    for (const page of results) {
      const p = (page as { id: string; properties: Record<string, unknown> }).properties;
      const specId = (page as { id: string }).id;

      const productionItem =
        extractTitle(p["Production Item"]) || extractTitle(p["Name"]) || specId;
      const componentType =
        extractSelect(p["Component Type"]) || extractRichText(p["Component Type"]) || "";
      const payloadVersion =
        extractSelect(p["Payload Version"]) || extractRichText(p["Payload Version"]) || "";

      // Only process PP-2.0 with blank payload (filter should handle this, but re-check)
      const promptPayload =
        extractRichText(p["Prompt Payload"]) || extractRichText(p["Payload"]) || "";
      if (payloadVersion !== "PP-2.0" || promptPayload.trim()) continue;

      // Lightweight field check — no network calls per record
      const fieldErrors: string[] = [];
      const fieldWarnings: string[] = [];

      const designIntent    = extractRichText(p["Design Intent"]) || "";
      const requiredContent = extractRichText(p["Required Content"]) || "";
      const reviewCriteria  = extractRichText(p["Review Criteria"]) || extractRichText(p["Review Criteria / Constraints"]) || "";
      const canonDependency = extractSelect(p["Canon Dependency"]) || "None";

      if (!designIntent.trim()) fieldErrors.push("Design Intent");
      if (!requiredContent.trim()) fieldErrors.push("Required Content");
      if (!reviewCriteria.trim()) fieldErrors.push("Review Criteria");

      // Component Spec relation
      const componentSpecIds = extractRelation(p["Component Specification"]) || extractRelation(p["Component Spec"]) || [];
      if (componentSpecIds.length === 0) fieldErrors.push("Component Specification");

      // Style Guide relation
      const styleGuideIds = extractRelation(p["Style Guide"]) || extractRelation(p["Style Guides"]) || [];
      if (styleGuideIds.length === 0) fieldErrors.push("Style Guide");

      // Canon enforcement — matches validateCanonRequirements() four-branch logic.
      // Canon Dependency = None is always valid with empty records (no error, no warning).
      const canonRecordIds = extractRelation(p["Canon Records"]) || extractRelation(p["Canon"]) || [];
      if (
        (canonDependency === "Canon Reference" || canonDependency === "Canon Defining") &&
        canonRecordIds.length === 0
      ) {
        fieldErrors.push(`Canon Records required (Canon Dependency: "${canonDependency}")`);
      } else if (canonDependency === "Supports Canon" && canonRecordIds.length === 0) {
        fieldWarnings.push(`Canon Records recommended (Canon Dependency: "Supports Canon")`);
      }

      // Prompt Modules
      const promptModuleIds = extractRelation(p["Prompt Modules"]) || extractRelation(p["Modules"]) || [];
      if (promptModuleIds.length === 0) fieldWarnings.push("No Prompt Modules linked");

      // World
      const worldVal = extractRichText(p["World"]) || extractSelect(p["World"]) || "";
      if (!worldVal.trim()) fieldWarnings.push("No World linked");

      if (fieldErrors.length > 0) {
        blocked.push({ specId, productionItem, componentType, errors: fieldErrors });
      } else if (fieldWarnings.length > 0) {
        warning.push({ specId, productionItem, componentType, warnings: fieldWarnings });
      } else {
        ready.push({ specId, productionItem, componentType, missingFields: [] });
      }
    }

    res.json({
      world_id: rawWorldId,
      world_name: world.name,
      total_reviewed: results.length,
      truncated,
      ready,
      warning,
      blocked,
    });
  } catch (err) {
    logger.error({ err, worldId: rawWorldId }, "batch-generate-payloads error");
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// ── POST /v1/worldsmith/batch-save-payload ────────────────────────────────────
// Save a single pre-generated payload from the batch UI.  This is intentionally
// the same logic as /save-payload — called per-record from the batch tab so the
// operator can review and confirm each one individually.

router.post("/v1/worldsmith/batch-save-payload", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  // Delegates to the same save logic — just a named alias for the batch UI
  const { spec_id: rawSpecId, serialized_payload, skip_recompile = true } = req.body as {
    spec_id?: string;
    serialized_payload?: string;
    skip_recompile?: boolean;
  };

  if (!rawSpecId?.trim() || !serialized_payload?.trim()) {
    res.status(400).json({ error: "spec_id and serialized_payload are required", code: "MISSING_FIELDS" });
    return;
  }

  const specId = normalizeId(rawSpecId);

  // Same server-side PP-2.0 structure validation as /save-payload
  const { sections: parsedSections2, issues: validationIssues2 } = parseAndValidateSerializedPayload(serialized_payload);
  if (validationIssues2.length > 0 || !parsedSections2) {
    res.status(422).json({
      error: "Payload failed pre-save validation — fix the issues and retry.",
      code: "PAYLOAD_VALIDATION_FAILED",
      validation_issues: validationIssues2,
    });
    return;
  }

  try {
    const saveResult = await writePayloadToNotion(specId, serialized_payload);

    if (!saveResult.success) {
      const status = saveResult.errorCode === PAYLOAD_GEN_ERROR_CODES.PAYLOAD_ALREADY_EXISTS ? 409 : 500;
      res.status(status).json({ error: saveResult.error, code: saveResult.errorCode ?? "SAVE_FAILED" });
      return;
    }

    if (!skip_recompile) {
      try {
        const chain = await resolveInheritanceChain(specId);
        const { runCompilation } = await import("../lib/worldsmith/orchestrator");
        void runCompilation({ notion_production_spec_id: specId, operation: "validate_and_compile", dry_run: false });
      } catch {
        // Non-blocking
      }
    }

    res.json({ success: true, spec_id: specId, persistence_verified: saveResult.persistenceVerified, mismatch: saveResult.mismatch ?? null });
  } catch (err) {
    logger.error({ err, specId }, "batch-save-payload error");
    res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
  }
});

// ── GET /api/v1/worldsmith/assets ─────────────────────────────────────────────

router.get("/v1/worldsmith/assets", requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
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

router.get("/v1/worldsmith/assets/:assetId", requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
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
