/**
 * WorldSmith Orchestrator
 * Implements the 22-stage execution pipeline from the CS-000 spec.
 * Compile-only path for MVP; generation stages are stubbed for Phase 2.
 */
import { resolveInheritanceChain, InheritanceError } from "./inheritance-resolver";
import { parsePayload } from "./payload-parser";
import { validatePayload } from "./validator";
import { validateCanon } from "./canon-validator";
import { compilePrompt } from "./prompt-compiler";
import { computePromptHash } from "./prompt-hasher";
import { createRun, updateRun, failRun, getRun } from "./run-repository";
import { upsertAsset, getAssetBySpec, buildAssetId, buildFilename } from "./daybook-adapter";
import {
  getPage,
  updatePage,
  createPage,
  richTextProp,
  selectProp,
  relationProp,
} from "../notion-client";
import type { CompileRequest, CompileResponse, ValidationError } from "./types";
import { logger } from "../logger";

const VISUAL_ASSETS_DB = () => process.env.NOTION_VISUAL_ASSETS_DB_ID ?? "";

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runCompilation(
  req: CompileRequest,
  initiatedBy?: string,
): Promise<CompileResponse> {
  const { notion_production_spec_id: specId, dry_run: dryRun = false } = req;

  // ── Stage 1: Authenticate / validate request ─────────────────────────────
  if (!specId || specId.trim() === "") {
    return failResponse("", "request_validation", "MISSING_SPEC_ID", "notion_production_spec_id is required.", [], false, null, null);
  }
  if (!process.env.NOTION_TOKEN) {
    return failResponse(specId, "request_validation", "NOTION_NOT_CONFIGURED", "NOTION_TOKEN is not configured.", [], false, null, null);
  }

  // ── Create run record ────────────────────────────────────────────────────
  const runId = await createRun({ productionSpecId: specId, operation: req.operation, dryRun, initiatedBy });

  try {
    await updateRun(runId, { status: "compiling" });

    // ── Stage 2 + 3: Fetch and resolve inheritance chain ──────────────────
    let chain;
    try {
      chain = await resolveInheritanceChain(specId);
    } catch (err) {
      if (err instanceof InheritanceError) {
        await failRun(runId, err.stage, err.errorCode, [
          {
            code: err.errorCode,
            field: err.stage,
            governing_rule: "CS-000 Inheritance",
            message: err.message,
            recommended_action: "Resolve the missing dependency in Notion before retrying.",
          },
        ]);
        return failResponse(specId, err.stage, err.errorCode, err.message, [], err.retryable, null, null, runId);
      }
      const msg = String(err);
      await failRun(runId, "inheritance_resolution", "INHERITANCE_ERROR", [
        {
          code: "INHERITANCE_ERROR",
          field: "inheritance_resolution",
          governing_rule: "CS-000",
          message: msg,
          recommended_action: "Check Notion connectivity and page permissions.",
        },
      ]);
      return failResponse(specId, "inheritance_resolution", "INHERITANCE_ERROR", msg, [], true, null, null, runId);
    }

    await updateRun(runId, {
      resolvedSourceIds: chain.resolvedSourceIds,
      payloadVersion: chain.productionSpec.payloadVersion,
    });

    const spec = chain.productionSpec;

    // ── Stages 4–8: Parse and validate payload ─────────────────────────────
    const payloadValidation = validatePayload(spec, spec.promptPayload);

    if (!payloadValidation.valid) {
      const isCanonIssue = payloadValidation.errors.some(
        (e) => e.code.startsWith("CANON") || e.code === "MISSING_CANON_RECORD",
      );
      const status = isCanonIssue ? "requires_canon_review" : "validation_failed";
      const compiledStatus = isCanonIssue ? "Requires Canon Review" : "Validation Failed";

      await updateRun(runId, {
        status,
        compiledPromptStatus: compiledStatus,
        errors: payloadValidation.errors,
        warnings: payloadValidation.warnings,
        completedAt: new Date(),
      });

      if (!dryRun) {
        await writeCompiledPromptStatus(specId, compiledStatus);
      }

      return {
        status: isCanonIssue ? "requires_canon_review" : "validation_failed",
        run_id: runId,
        production_spec_id: specId,
        payload_version: spec.payloadVersion,
        compiled_prompt_status: compiledStatus,
        warnings: payloadValidation.warnings,
        errors: payloadValidation.errors,
        next_action: isCanonIssue ? "Complete canon review" : "Fix validation errors",
        failed_stage: "payload_validation",
        error_code: payloadValidation.errors[0]?.code,
        message: payloadValidation.errors[0]?.message,
        retry_safe: true,
        created_resources: { visual_asset_id: null, drive_file_id: null },
      };
    }

    // ── Stage 7: Canon validation ─────────────────────────────────────────
    const canonValidation = validateCanon(spec, chain.canonRecords);

    if (!canonValidation.valid) {
      const compiledStatus = "Requires Canon Review";
      await updateRun(runId, {
        status: "requires_canon_review",
        compiledPromptStatus: compiledStatus,
        errors: canonValidation.errors,
        warnings: [...payloadValidation.warnings, ...canonValidation.warnings],
        completedAt: new Date(),
      });

      if (!dryRun) {
        await writeCompiledPromptStatus(specId, compiledStatus);
      }

      return {
        status: "requires_canon_review",
        run_id: runId,
        production_spec_id: specId,
        payload_version: spec.payloadVersion,
        compiled_prompt_status: compiledStatus,
        warnings: [...payloadValidation.warnings, ...canonValidation.warnings],
        errors: canonValidation.errors,
        next_action: "Complete canon review and obtain Accepted status for all linked Canon Records",
        failed_stage: "canon_validation",
        error_code: canonValidation.errors[0]?.code,
        message: canonValidation.errors[0]?.message,
        retry_safe: true,
        created_resources: { visual_asset_id: null, drive_file_id: null },
      };
    }

    // ── Stage 9: Assemble Compiled Prompt ────────────────────────────────
    const { payload } = parsePayload(spec.promptPayload);
    const compiled = compilePrompt(chain, payload as Parameters<typeof compilePrompt>[1]);

    // ── Stage 10: Calculate Prompt Hash ──────────────────────────────────
    const promptHash = computePromptHash({
      payload_version: spec.payloadVersion,
      compiled_prompt: compiled.fullPrompt,
      negative_prompt: compiled.negativePrompt,
    });

    // ── Derive stable Asset ID and filename ──────────────────────────────
    const assetId = buildAssetId(spec.world, spec.volume, spec.componentType, spec.specId);
    const assetVersion = "v001";
    const filename = buildFilename(spec.world, spec.volume, spec.componentType, spec.specId, "Master", assetVersion);

    await updateRun(runId, {
      compiledPrompt: compiled.fullPrompt,
      promptHash,
      assetId,
      assetVersion,
      compiledPromptStatus: "Compiled",
    });

    // ── Stage 11: Create or update Visual Asset shell in Notion ──────────
    let visualAssetNotionId: string | null = null;
    if (!dryRun) {
      try {
        visualAssetNotionId = await upsertVisualAsset(spec, compiled.fullPrompt, promptHash, assetId, filename);
        await updateRun(runId, { visualAssetNotionId: visualAssetNotionId ?? undefined });
      } catch (err) {
        logger.error({ err, runId }, "Failed to upsert Visual Asset in Notion");
        // Non-fatal for compile-only — continue
      }

      // ── Stage 12: Update Compiled Prompt Status ────────────────────────
      await writeCompiledPromptStatus(specId, "Compiled");
    }

    // ── Stage 19: Upsert asset in Daybook ───────────────────────────────
    let daybookAssetId: string | null = null;
    if (!dryRun) {
      try {
        const daybookResult = await upsertAsset({
          asset_id: assetId,
          filename,
          version: assetVersion,
          world: spec.world,
          volume: spec.volume,
          component_type: spec.componentType,
          production_specification_id: specId,
          visual_asset_id: visualAssetNotionId ?? undefined,
          prompt_hash: promptHash,
          readiness_state: "Under Review",
          updated_at: new Date().toISOString(),
        });
        daybookAssetId = daybookResult.asset_id;
        await updateRun(runId, { daybookAssetId });
      } catch (err) {
        logger.error({ err, runId }, "Daybook upsert failed — compile still succeeds, asset can be recovered");
        // Preserve the successful intermediate work; Daybook failure does not
        // roll back the compiled prompt or Visual Asset
      }
    }

    // ── Stage 20: Update Production Specification status ─────────────────
    if (!dryRun) {
      try {
        await updatePage(specId, {
          ...(spec.compiledPromptStatus !== "Compiled" ? { "Compiled Prompt Status": selectProp("Compiled") } : {}),
          "Next Action": richTextProp("Generate image"),
        });
      } catch (err) {
        logger.warn({ err, specId }, "Could not update Production Specification Next Action — non-fatal");
      }
    }

    // ── Stage 21 + 22: Finalize run and return ───────────────────────────
    await updateRun(runId, {
      status: "compiled",
      compiledPromptStatus: "Compiled",
      warnings: [...payloadValidation.warnings, ...canonValidation.warnings],
      completedAt: new Date(),
    });

    const allWarnings = [...payloadValidation.warnings, ...canonValidation.warnings];

    return {
      status: "compiled",
      run_id: runId,
      production_spec_id: specId,
      payload_version: spec.payloadVersion,
      compiled_prompt_status: "Compiled",
      prompt_hash: promptHash,
      compiled_prompt: compiled.fullPrompt,
      visual_asset_id: visualAssetNotionId ?? undefined,
      warnings: allWarnings,
      next_action: "Generate image",
    };
  } catch (err) {
    const msg = String(err);
    logger.error({ err, runId }, "WorldSmith orchestration error");
    await failRun(runId, "orchestration", "INTERNAL_ERROR", [
      {
        code: "INTERNAL_ERROR",
        field: "orchestration",
        governing_rule: "CS-000",
        message: msg,
        recommended_action: "Check server logs for this run_id and retry.",
      },
    ]);
    return failResponse(specId, "orchestration", "INTERNAL_ERROR", msg, [], true, null, null, runId);
  }
}

// ── Visual Asset upsert ───────────────────────────────────────────────────────

async function upsertVisualAsset(
  spec: import("./types").ProductionSpec,
  compiledPrompt: string,
  promptHash: string,
  assetId: string,
  filename: string,
): Promise<string | null> {
  const dbId = VISUAL_ASSETS_DB();
  if (!dbId) return null;

  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: spec.productionItem || assetId } }] },
    "Asset Type": selectProp(spec.componentType),
    "World": richTextProp(spec.world),
    "Status": selectProp("In Progress"),
    "Version": richTextProp(spec.currentVersion),
    "Compiled Prompt": richTextProp(compiledPrompt),
    "Prompt Hash": richTextProp(promptHash),
    "Volume I Production Spec": relationProp([spec.notionPageId]),
  };

  if (spec.styleGuideId) {
    props["Style Guide"] = relationProp([spec.styleGuideId]);
  }
  if (spec.canonRecordIds.length > 0) {
    props["Canon Record"] = relationProp(spec.canonRecordIds);
  }
  if (spec.designIntent) {
    props["Visual Summary"] = richTextProp(spec.designIntent);
  }

  // Upsert: check for existing Visual Asset linked to this spec
  if (spec.existingVisualAssetId) {
    try {
      await updatePage(spec.existingVisualAssetId, props);
      return spec.existingVisualAssetId;
    } catch {
      // Fall through to create
    }
  }

  // Create new Visual Asset
  try {
    const newPage = await createPage(dbId, props);
    return newPage.id;
  } catch (err) {
    logger.error({ err }, "Failed to create Visual Asset in Notion");
    return null;
  }
}

// ── Notion status write-back ──────────────────────────────────────────────────

async function writeCompiledPromptStatus(specId: string, status: string): Promise<void> {
  try {
    await updatePage(specId, { "Compiled Prompt Status": selectProp(status) });
  } catch (err) {
    logger.warn({ err, specId, status }, "Could not update Compiled Prompt Status in Notion — non-fatal");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function failResponse(
  specId: string,
  stage: string,
  errorCode: string,
  message: string,
  warnings: ValidationError[],
  retrySafe: boolean,
  visualAssetId: string | null,
  driveFileId: string | null,
  runId?: string,
): CompileResponse {
  return {
    status: "failed",
    run_id: runId ?? "",
    production_spec_id: specId,
    payload_version: "",
    compiled_prompt_status: "Validation Failed",
    warnings,
    errors: [
      {
        code: errorCode,
        field: stage,
        governing_rule: "CS-000",
        message,
        recommended_action: "Resolve the error and retry.",
      },
    ],
    failed_stage: stage,
    error_code: errorCode,
    message,
    retry_safe: retrySafe,
    created_resources: {
      visual_asset_id: visualAssetId,
      drive_file_id: driveFileId,
    },
  };
}
