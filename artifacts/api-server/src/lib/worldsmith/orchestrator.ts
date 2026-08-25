/**
 * WorldSmith Orchestrator
 * Implements the 22-stage execution pipeline from the CS-000 spec.
 * Compile-only path for MVP; generation stages are stubbed for Phase 2.
 */
import {
  resolveInheritanceChain,
  resolveInheritanceChainLocalWithWorldBible,
  InheritanceError,
} from "./inheritance-resolver";
import { parsePayload } from "./payload-parser";
import { validatePayload } from "./validator";
import { validateCanon } from "./canon-validator";
import { compilePrompt } from "./prompt-compiler";
import { computePromptHash } from "./prompt-hasher";
import { getWorldsmithPreviewGeneration, getWorldsmithProductionGeneration } from "./image-targets";
import { createRun, updateRun, failRun, getRun } from "./run-repository";
import { upsertAsset, getAssetBySpec, buildAssetId, buildFilename } from "./daybook-adapter";
import {
  getPage,
  updatePage,
  createPage,
  richTextProp,
  selectProp,
  relationProp,
  uploadFileToNotion,
  attachUploadToPageProperty,
  _setOnRetry,
  type NotionRetryEvent,
} from "../notion-client";
import type {
  CompileRequest,
  CompileResponse,
  ValidationError,
  ProvenanceRecord,
  InheritanceChain,
  ProductionPackageResult,
} from "./types";
import { logger } from "../logger";
import { generateImage, type ImageGenerationMetadata } from "../ai-proxy";
import { db, worldsmithProductionPackagesTable, worldsmithWorldsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const VISUAL_ASSETS_DB = () => process.env.NOTION_VISUAL_ASSETS_DB_ID ?? "";

export function isLocalResolverEnabled(): boolean {
  const configured = process.env.USE_LOCAL_RESOLVER?.trim().toLowerCase();
  if (configured === "true" || configured === "1") return true;
  if (configured === "false" || configured === "0") return false;
  return process.env.NODE_ENV === "development";
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runCompilation(
  req: CompileRequest,
  initiatedBy?: string,
): Promise<CompileResponse> {
  const specId = req.production_spec_id ?? req.notion_production_spec_id ?? "";
  const { dry_run: dryRun = false } = req;
  const useLocalResolver = isLocalResolverEnabled();

  // ── Stage 1: Authenticate / validate request ─────────────────────────────
  if (!specId || specId.trim() === "") {
    return failResponse("", "request_validation", "MISSING_SPEC_ID", "production_spec_id is required.", [], false, null, null);
  }
  if (!useLocalResolver && !process.env.NOTION_TOKEN) {
    return failResponse(specId, "request_validation", "NOTION_NOT_CONFIGURED", "NOTION_TOKEN is not configured.", [], false, null, null);
  }

  // ── Create run record ────────────────────────────────────────────────────
  const runId = await createRun({ productionSpecId: specId, operation: req.operation, dryRun, initiatedBy });

  // ── Install per-run Notion retry collector ───────────────────────────────
  // Note: _setOnRetry is module-level; concurrent admin compiles are rare but
  // would share the collector. Acceptable for a low-traffic admin tool.
  const notionRetryEvents: NotionRetryEvent[] = [];
  _setOnRetry((event) => {
    logger.warn({ runId, ...event }, "WorldSmith: Notion retry");
    notionRetryEvents.push(event);
  });

  try {
    await updateRun(runId, { status: "compiling" });

    // ── Stage 2 + 3: Fetch and resolve inheritance chain ──────────────────
    let chain;
    try {
      chain = useLocalResolver
          ? await resolveInheritanceChainLocalWithWorldBible(specId)
        : await resolveInheritanceChain(specId);
    } catch (err) {
      if (err instanceof InheritanceError) {
          const inheritanceWarnings: ValidationError[] = [
            {
              code: err.errorCode,
              field: err.stage === "resolve_world_bible" ? "world_bible" : err.stage,
              governing_rule: err.stage === "resolve_world_bible" ? "WS-BIBLE-001" : "CS-000 Inheritance",
              message: err.message,
              recommended_action: useLocalResolver
                ? "Resolve the missing dependency in the Editorial Suite before retrying."
                : "Resolve the missing dependency in Notion before retrying.",
            },
          ];
        await failRun(runId, err.stage, err.errorCode, [
            ...inheritanceWarnings,
          ]);
        // Persist retry events even when inheritance resolution fails
        if (notionRetryEvents.length > 0) {
          await updateRun(runId, {
            retryCount: notionRetryEvents.length,
            notionRetries: notionRetryEvents,
          }).catch(() => { /* best-effort */ });
        }
        return failResponse(specId, err.stage, err.errorCode, err.message, inheritanceWarnings, err.retryable, null, null, runId);
      }
      const msg = String(err);
      await failRun(runId, "inheritance_resolution", "INHERITANCE_ERROR", [
        {
          code: "INHERITANCE_ERROR",
          field: "inheritance_resolution",
          governing_rule: "CS-000",
          message: msg,
          recommended_action: useLocalResolver
            ? "Check the Editorial Suite database connection and local record links."
            : "Check Notion connectivity and page permissions.",
        },
      ]);
      // Persist retry events even on generic inheritance fetch failure
      if (notionRetryEvents.length > 0) {
        await updateRun(runId, {
          retryCount: notionRetryEvents.length,
          notionRetries: notionRetryEvents,
        }).catch(() => { /* best-effort */ });
      }
      return failResponse(specId, "inheritance_resolution", "INHERITANCE_ERROR", msg, [], true, null, null, runId);
    }

    // ── Fetch World Bible fields from local DB ────────────────────────────
    // These are stored in worldsmithWorldsTable, not in Notion, so we resolve
    // them here (after inheritance resolution) and attach them to the chain
    // before prompt compilation.
    let worldBible: InheritanceChain["worldBible"] | undefined = chain.worldBible;
    // Collects system-level warnings (e.g. Bible fetch failures) that are
    // prepended to every subsequent warnings array written to the run record.
    const systemWarnings: ValidationError[] = [];
    if (!useLocalResolver && (chain.productionSpec.worldId || chain.productionSpec.world)) {
      try {
        const bibleQuery = db
          .select({
            visualPalette: worldsmithWorldsTable.visualPalette,
            proseVoice: worldsmithWorldsTable.proseVoice,
            atmosphericNotes: worldsmithWorldsTable.atmosphericNotes,
            materialWorld: worldsmithWorldsTable.materialWorld,
            worldRules: worldsmithWorldsTable.worldRules,
          })
          .from(worldsmithWorldsTable);
        // Local authored specs always resolve by their stored world ID. The
        // name fallback remains only for legacy Notion chains that predate a
        // local world relation, and will disappear with the Notion resolver.
        const [worldRow] = await (chain.productionSpec.worldId
          ? bibleQuery.where(eq(worldsmithWorldsTable.id, chain.productionSpec.worldId)).limit(1)
          : bibleQuery.where(sql`lower(${worldsmithWorldsTable.name}) = lower(${chain.productionSpec.world})`).limit(1));

        if (!worldRow && useLocalResolver) {
          const missingBibleWarning: ValidationError = {
            code: "WORLD_BIBLE_NOT_FOUND",
            field: "world_bible",
            governing_rule: "WS-BIBLE-001",
            message: `The World Bible record for local world "${chain.productionSpec.worldId}" was not found. Compilation was blocked to avoid producing an ungrounded prompt.`,
            recommended_action: "Restore the linked world record or update the Production Specification's world before retrying.",
          };
          systemWarnings.push(missingBibleWarning);
          await failRun(runId, "resolve_world_bible", "WORLD_BIBLE_NOT_FOUND", [missingBibleWarning]);
          return failResponse(
            specId,
            "resolve_world_bible",
            "WORLD_BIBLE_NOT_FOUND",
            missingBibleWarning.message,
            systemWarnings,
            false,
            null,
            null,
            runId,
          );
        }

        if (worldRow) {
          worldBible = {
            visualPalette: worldRow.visualPalette,
            proseVoice: worldRow.proseVoice,
            atmosphericNotes: worldRow.atmosphericNotes,
            materialWorld: worldRow.materialWorld,
            worldRules: worldRow.worldRules ?? [],
          };
        }
      } catch (bibleErr) {
        const errMsg = bibleErr instanceof Error ? bibleErr.message : String(bibleErr);
        if (useLocalResolver) {
          const bibleFetchError: ValidationError = {
            code: "WORLD_BIBLE_FETCH_ERROR",
            field: "world_bible",
            governing_rule: "WS-BIBLE-001",
            message: `World Bible fields could not be fetched for local world "${chain.productionSpec.worldId}": ${errMsg}. Compilation was blocked to avoid producing an ungrounded prompt.`,
            recommended_action: "Check database connectivity and retry. If the problem persists, verify the linked world record.",
          };
          systemWarnings.push(bibleFetchError);
          await failRun(runId, "resolve_world_bible", "WORLD_BIBLE_FETCH_ERROR", [bibleFetchError]);
          return failResponse(
            specId,
            "resolve_world_bible",
            "WORLD_BIBLE_FETCH_ERROR",
            bibleFetchError.message,
            systemWarnings,
            true,
            null,
            null,
            runId,
          );
        }
        // Legacy Notion chains do not always have a local world ID. Retain their
        // existing non-fatal behavior until the temporary resolver flag retires.
        logger.warn({ bibleErr, world: chain.productionSpec.world, worldId: chain.productionSpec.worldId }, "WorldSmith: failed to fetch World Bible fields from DB — continuing without them");
        const bibleFetchWarning: ValidationError = {
          code: "WORLD_BIBLE_FETCH_ERROR",
          field: "world_bible",
          governing_rule: "WS-BIBLE-001",
          message: `World Bible fields could not be fetched for world "${chain.productionSpec.worldId ?? chain.productionSpec.world}": ${errMsg}. The compiled prompt was assembled without aesthetic grounding.`,
          recommended_action: "Check database connectivity and retry the compilation. If the problem persists, verify the world record exists in the WorldSmith worlds registry.",
        };
        systemWarnings.push(bibleFetchWarning);
        // Persist immediately so the warning survives even if a later stage fails.
        await updateRun(runId, { warnings: systemWarnings }).catch(() => { /* best-effort */ });
      }
    }
    const chainWithBible: InheritanceChain = worldBible ? { ...chain, worldBible } : chain;

    // Extend resolvedSourceIds with human-readable names and Notion IDs for World,
    // Collection, and Volume so run history can show them even after the Notion
    // records are renamed.  All three follow the same snapshot-at-compile-time
    // strategy: the name is captured once and displayed with a "captured at
    // compile time" note; the Notion ID is stored so operators can deep-link to
    // verify the current name.
    const extendedSourceIds: Record<string, string | string[]> = {
      ...chain.resolvedSourceIds,
      ...(chain.productionSpec.world       ? { world_name:          chain.productionSpec.world }       : {}),
      ...(chain.productionSpec.worldId     ? { world_id:            chain.productionSpec.worldId }     : {}),
      ...(chain.productionSpec.collection  ? { collection_name:     chain.productionSpec.collection }  : {}),
      ...(chain.productionSpec.collectionId ? { collection_notion_id: chain.productionSpec.collectionId } : {}),
      ...(chain.productionSpec.volume      ? { volume_name:         chain.productionSpec.volume }      : {}),
      ...(chain.productionSpec.volumeId    ? { volume_notion_id:    chain.productionSpec.volumeId }    : {}),
    };
    await updateRun(runId, {
      resolvedSourceIds: extendedSourceIds,
      payloadVersion: chain.productionSpec.payloadVersion,
    });

    const spec = chain.productionSpec;

    // ── Stages 4–8: Parse and validate payload ─────────────────────────────
    const payloadValidation = validatePayload(spec, spec.promptPayload);

    if (!payloadValidation.valid) {
      const isCanonIssue = payloadValidation.errors.some(
        (e) => e.code.startsWith("CANON") || e.code === "MISSING_REQUIRED_CANON" || e.code === "MISSING_CANON_APPROVAL",
      );
      const status = isCanonIssue ? "requires_canon_review" : "validation_failed";
      const compiledStatus = isCanonIssue ? "Requires Canon Review" : "Validation Failed";

      await updateRun(runId, {
        status,
        compiledPromptStatus: compiledStatus,
        errors: payloadValidation.errors,
        warnings: [...systemWarnings, ...payloadValidation.warnings],
        retryCount: notionRetryEvents.length,
        notionRetries: notionRetryEvents.length > 0 ? notionRetryEvents : undefined,
        completedAt: new Date(),
      });

        if (!dryRun && spec.notionPageId) {
          await writeCompiledPromptStatus(spec.notionPageId, compiledStatus);
      }

      return {
        status: isCanonIssue ? "requires_canon_review" : "validation_failed",
        run_id: runId,
        production_spec_id: specId,
        payload_version: spec.payloadVersion,
        compiled_prompt_status: compiledStatus,
        warnings: [...systemWarnings, ...payloadValidation.warnings],
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
        warnings: [...systemWarnings, ...payloadValidation.warnings, ...canonValidation.warnings],
        retryCount: notionRetryEvents.length,
        notionRetries: notionRetryEvents.length > 0 ? notionRetryEvents : undefined,
        completedAt: new Date(),
      });

      if (!dryRun && spec.notionPageId) {
        await writeCompiledPromptStatus(spec.notionPageId, compiledStatus);
      }

      return {
        status: "requires_canon_review",
        run_id: runId,
        production_spec_id: specId,
        payload_version: spec.payloadVersion,
        compiled_prompt_status: compiledStatus,
        warnings: [...systemWarnings, ...payloadValidation.warnings, ...canonValidation.warnings],
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
    const payload =
      payloadValidation.payload ?? parsePayload(spec.promptPayload).payload;
    const compiled = compilePrompt(chainWithBible, payload as Parameters<typeof compilePrompt>[1]);

    // ── Stage 10: Calculate Prompt Hash ──────────────────────────────────
    const { target: generationTarget, metadata: generationMetadata } = await (
      req.operation === "compile_and_generate"
        ? getWorldsmithProductionGeneration(
            spec.componentType,
            spec.orientation,
            req.generation_settings?.quality,
          )
        : getWorldsmithPreviewGeneration(spec.componentType, spec.orientation)
    );
    const promptHash = computePromptHash({
      payload_version: spec.payloadVersion,
      compiled_prompt: compiled.fullPrompt,
      negative_prompt: compiled.negativePrompt,
      generation_provider: generationMetadata.provider,
      model_name: generationMetadata.model,
      model_version: generationMetadata.modelVersion,
      generation_settings: generationMetadata.settings,
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
      provider: generationMetadata.provider,
      modelName: generationMetadata.model,
      modelVersion: generationMetadata.modelVersion,
      generationSettings: {
        ...generationMetadata.settings,
        target: generationTarget,
      },
    });

    // ── Stage 11: Create or update Visual Asset shell in Notion ──────────
    // Reuse the original Visual Asset target before touching Notion on a
    // repeated production request. This preserves the same final artifact as
    // the idempotency record rather than creating an extra shell page.
    const existingProductionPackage = !dryRun && req.operation === "compile_and_generate"
      ? await getExistingProductionPackage({
          productionSpecId: specId,
          promptHash,
          provider: generationMetadata.provider,
          model: generationMetadata.model,
          modelVersion: generationMetadata.modelVersion ?? "",
          effectiveSize: generationMetadata.settings.size,
          quality: generationMetadata.settings.quality,
        })
      : null;

    // Final renders are billable and must come from a human-approved
    // Specification Board. Existing uploaded/status-only work can still be
    // finished after a later status change because those paths do not create a
    // new provider image.
    const mayFinishExistingPackage = existingProductionPackage?.status === "success"
      || existingProductionPackage?.status === "generating"
      || existingProductionPackage?.status === "uploaded_status_pending"
      || (
        existingProductionPackage?.status === "upload_failed"
        && !!existingProductionPackage.notionUploadId
      );
    if (
      req.operation === "compile_and_generate"
      && !isApprovedForFinalArtwork(spec.status)
      && !mayFinishExistingPackage
    ) {
      const approvalError: ValidationError = {
        code: "FINAL_ARTWORK_APPROVAL_REQUIRED",
        field: "status",
        governing_rule: "WS-PRODUCTION-APPROVAL-001",
        message: `Final artwork requires an approved Specification Board. Current status is "${spec.status || "unset"}".`,
        recommended_action: "Approve the concept in Notion, refresh its status in the compiler, and request final artwork again.",
      };
      await updateRun(runId, {
        status: "failed",
        errors: [approvalError],
        warnings: [...systemWarnings, ...payloadValidation.warnings, ...canonValidation.warnings],
        completedAt: new Date(),
      });
      return {
        status: "failed",
        run_id: runId,
        production_spec_id: specId,
        payload_version: spec.payloadVersion,
        compiled_prompt_status: "Compiled",
        warnings: [...systemWarnings, ...payloadValidation.warnings, ...canonValidation.warnings],
        errors: [approvalError],
        next_action: "Approve the Specification Board before requesting final artwork",
        failed_stage: "final_artwork_approval",
        error_code: approvalError.code,
        message: approvalError.message,
        retry_safe: false,
        created_resources: { visual_asset_id: null, drive_file_id: null },
      };
    }
    let visualAssetNotionId: string | null = existingProductionPackage?.visualAssetNotionId ?? null;
    if (!dryRun && spec.notionPageId) {
      try {
        if (!visualAssetNotionId) {
          visualAssetNotionId = await upsertVisualAsset(chain, compiled.fullPrompt, promptHash, assetId, filename);
        }
        await updateRun(runId, { visualAssetNotionId: visualAssetNotionId ?? undefined });
      } catch (err) {
        logger.error({ err, runId }, "Failed to upsert Visual Asset in Notion");
        // Non-fatal for compile-only — continue
      }

      // ── Stage 12: Update Compiled Prompt Status ────────────────────────
      if (spec.notionPageId) {
        await writeCompiledPromptStatus(spec.notionPageId, "Compiled");
      }
    }

    // ── Stages 13–18: Generate, upload, and register final artwork ─────
    // A failed provider call intentionally leaves compilation usable. Upload
    // failures are different: no final-art status can advance until the file
    // is attached to the Visual Asset page.
    let productionPackage: FinalArtworkResult | undefined;
    if (req.operation === "compile_and_generate") {
      productionPackage = await runFinalArtwork({
        runId,
        dryRun,
        productionSpecId: specId,
        promptHash,
        compiledPrompt: compiled.fullPrompt,
        filename,
        visualAssetNotionId,
        target: generationTarget,
        generation: generationMetadata,
      });

      if (productionPackage.fatal) {
        const failure = {
          code: productionPackage.error_code ?? "UPLOAD_FAILED",
          field: "final_artwork_upload",
          governing_rule: "WS-PRODUCTION-001",
          message: productionPackage.error ?? "Final artwork could not be uploaded.",
          recommended_action: "Retry the production package. The production-spec review status was left unchanged.",
        };
        await failRun(runId, "final_artwork_upload", failure.code, [failure]);
        return {
          status: "failed",
          run_id: runId,
          production_spec_id: specId,
          payload_version: spec.payloadVersion,
          compiled_prompt_status: "Compiled",
          prompt_hash: promptHash,
          compiled_prompt: compiled.fullPrompt,
          compiled_sections: compiled.sectionRecords,
          visual_asset_id: visualAssetNotionId ?? undefined,
          warnings: [...systemWarnings, ...payloadValidation.warnings, ...canonValidation.warnings, ...(chain.warnings ?? [])],
          errors: [failure],
          failed_stage: "final_artwork_upload",
          error_code: failure.code,
          message: failure.message,
          retry_safe: true,
          production_package: productionPackage,
        };
      }
    }

    // ── Stage 19: Upsert asset in Daybook ───────────────────────────────
    let daybookAssetId: string | null = null;
    if (!dryRun && spec.notionPageId) {
      try {
        const daybookResult = await upsertAsset({
          asset_id: assetId,
          filename,
          version: assetVersion,
          world: spec.world,
          volume: spec.volume,
          component_type: spec.componentType,
          production_specification_id: spec.notionPageId!,
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
        if (spec.notionPageId) await updatePage(spec.notionPageId, {
          ...(spec.compiledPromptStatus !== "Compiled" ? { "Compiled Prompt Status": selectProp("Compiled") } : {}),
          "Next Action": richTextProp(
            productionPackage?.production_art_status === "artwork_review"
              ? "Review final artwork"
              : "Generate image",
          ),
        });
      } catch (err) {
        logger.warn({ err, specId }, "Could not update Production Specification Next Action — non-fatal");
      }
    }

    // ── Stage 21 + 22: Finalize run and return ───────────────────────────
    const allWarnings = [
      ...systemWarnings,
      ...payloadValidation.warnings,
      ...canonValidation.warnings,
      ...(chain.warnings ?? []),
    ];

    await updateRun(runId, {
      status: productionPackage?.production_art_status === "artwork_review" ? "complete" : "compiled",
      compiledPromptStatus: "Compiled",
      warnings: allWarnings,
      retryCount: notionRetryEvents.length,
      notionRetries: notionRetryEvents.length > 0 ? notionRetryEvents : undefined,
      compiledSections: compiled.sectionRecords.length > 0 ? compiled.sectionRecords : undefined,
      completedAt: new Date(),
    });

    const provenance: ProvenanceRecord = {
      // Human-readable names
      production_spec_title: spec.productionItem || spec.specId,
      component_type: spec.componentType,
      component_set: spec.componentSet,
      world: spec.world,
      world_notion_id: spec.worldId,
      collection: spec.collection,
      collection_notion_id: spec.collectionId,
      volume: spec.volume,
      volume_notion_id: spec.volumeId,
      style_guide: chain.styleGuide?.name,
      component_specification: chain.componentSpec?.name,
      prompt_modules: chain.promptModules.map((m) => m.name),
      canon_records: chain.canonRecords.map((r) => r.name),
      // Run context
      run_id: runId,
      compilation_timestamp: new Date().toISOString(),
      // Notion IDs
      production_spec_notion_id: spec.notionPageId,
      style_guide_notion_id: chain.styleGuide?.notionPageId,
      component_spec_notion_id: chain.componentSpec?.notionPageId,
      prompt_payload_notion_id: spec.promptPayloadId,
      prompt_module_notion_ids: chain.promptModules.flatMap((m) => m.notionPageId ? [m.notionPageId] : []),
      canon_record_notion_ids: chain.canonRecords.flatMap((r) => r.notionPageId ? [r.notionPageId] : []),
      prompt_payload_type: spec.promptPayloadId ? "linked" : "inline",
      // Payload governance
      prompt_hash: promptHash,
      payload_version: spec.payloadVersion,
      payload_format: compiled.isLegacyFormat ? "legacy" : "2.0",
      compiler_version: "2.0.0",
    };

    return {
      status: "compiled",
      run_id: runId,
      production_spec_id: specId,
      payload_version: spec.payloadVersion,
      compiled_prompt_status: "Compiled",
      prompt_hash: promptHash,
      compiled_prompt: compiled.fullPrompt,
      compiled_sections: compiled.sectionRecords,
      provenance,
      visual_asset_id: visualAssetNotionId ?? undefined,
      warnings: allWarnings,
      next_action: productionPackage?.production_art_status === "artwork_review"
        ? "Review final artwork"
        : "Generate image",
      production_package: productionPackage,
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
    // Persist retry events even on failure paths
    if (notionRetryEvents.length > 0) {
      await updateRun(runId, {
        retryCount: notionRetryEvents.length,
        notionRetries: notionRetryEvents,
      }).catch(() => { /* best-effort */ });
    }
    return failResponse(specId, "orchestration", "INTERNAL_ERROR", msg, [], true, null, null, runId);
  } finally {
    _setOnRetry(null);
  }
}

// ── Visual Asset upsert ───────────────────────────────────────────────────────

async function upsertVisualAsset(
  chain: InheritanceChain,
  compiledPrompt: string,
  promptHash: string,
  assetId: string,
  filename: string,
): Promise<string | null> {
  const spec = chain.productionSpec;
  const dbId = VISUAL_ASSETS_DB();
  if (!dbId || !spec.notionPageId) return null;

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

  if (chain.styleGuide?.notionPageId) {
    props["Style Guide"] = relationProp([chain.styleGuide.notionPageId]);
  }
  const canonNotionIds = chain.canonRecords.flatMap((record) => record.notionPageId ? [record.notionPageId] : []);
  if (canonNotionIds.length > 0) {
    props["Canon Record"] = relationProp(canonNotionIds);
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

// ── Final artwork production package ──────────────────────────────────────────

type FinalArtworkResult = ProductionPackageResult & {
  fatal?: boolean;
  error_code?: string;
};

type FinalArtworkInput = {
  runId: string;
  dryRun: boolean;
  productionSpecId: string;
  promptHash: string;
  compiledPrompt: string;
  filename: string;
  visualAssetNotionId: string | null;
  target: {
    size: string;
    dpi: number;
    printWidthIn: number;
    printHeightIn: number;
    orientation: "landscape" | "portrait" | "square";
  };
  generation: ImageGenerationMetadata;
};

type ProductionPackageIdentity = {
  productionSpecId: string;
  promptHash: string;
  provider: string;
  model: string;
  modelVersion: string;
  effectiveSize: string;
  quality: string;
};

function productionPackageIdentity(identity: ProductionPackageIdentity) {
  return and(
    eq(worldsmithProductionPackagesTable.productionSpecId, identity.productionSpecId),
    eq(worldsmithProductionPackagesTable.promptHash, identity.promptHash),
    eq(worldsmithProductionPackagesTable.provider, identity.provider),
    eq(worldsmithProductionPackagesTable.modelName, identity.model),
    eq(worldsmithProductionPackagesTable.modelVersion, identity.modelVersion),
    eq(worldsmithProductionPackagesTable.effectiveSize, identity.effectiveSize),
    eq(worldsmithProductionPackagesTable.quality, identity.quality),
  );
}

async function getExistingProductionPackage(identity: ProductionPackageIdentity) {
  const [row] = await db
    .select()
    .from(worldsmithProductionPackagesTable)
    .where(productionPackageIdentity(identity))
    .limit(1);
  return row ?? null;
}

function configuredProductionEstimate(): { cost: number | null; note?: string } {
  const raw = process.env.WS_IMAGE_ESTIMATED_COST_USD?.trim();
  if (!raw) {
    return {
      cost: null,
      note: "Estimated provider cost is not configured for this environment.",
    };
  }
  const cost = Number(raw);
  return Number.isFinite(cost) && cost >= 0
    ? { cost }
    : { cost: null, note: "Estimated provider cost configuration is invalid." };
}

function isApprovedForFinalArtwork(status: string | undefined): boolean {
  return status?.trim().toLocaleLowerCase() === "approved";
}

function packageResponse(
  row: {
    id: string;
    status: string;
    productionArtStatus: string;
    filename: string;
    notionUploadId: string | null;
    visualAssetNotionId: string | null;
    provider: string;
    modelName: string;
    modelVersion: string;
    effectiveSize: string;
    quality: string;
    estimatedCostUsd: number | null;
    error: string | null;
  },
  target: FinalArtworkInput["target"],
  idempotent: boolean,
): FinalArtworkResult {
  return {
    id: row.id,
    status: row.status as ProductionPackageResult["status"],
    production_art_status: row.productionArtStatus as ProductionPackageResult["production_art_status"],
    idempotent,
    filename: row.filename,
    notion_upload_id: row.notionUploadId ?? undefined,
    visual_asset_id: row.visualAssetNotionId ?? undefined,
    provider: row.provider,
    model: row.modelName,
    model_version: row.modelVersion || undefined,
    effective_size: row.effectiveSize,
    quality: row.quality,
    target: {
      dpi: target.dpi,
      print_width_in: target.printWidthIn,
      print_height_in: target.printHeightIn,
      orientation: target.orientation,
    },
    estimated_cost_usd: row.estimatedCostUsd,
    error: row.error ?? undefined,
  };
}

function decodeGeneratedImage(dataUrl: string): Buffer {
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Image generation returned an unsupported image payload.");
  return Buffer.from(match[1]!, "base64");
}

export async function runFinalArtwork(input: FinalArtworkInput): Promise<FinalArtworkResult> {
  const { target, generation } = input;
  const estimate = configuredProductionEstimate();
  const version = generation.modelVersion ?? "";

  if (input.dryRun) {
    await updateRun(input.runId, {
      status: "compiled",
      generatedFilename: input.filename,
      generationSettings: { ...generation.settings, target, estimated_cost_usd: estimate.cost },
      completedAt: new Date(),
    });
    return {
      id: input.runId,
      status: "dry_run",
      production_art_status: "not_started",
      idempotent: false,
      filename: input.filename,
      provider: generation.provider,
      model: generation.model,
      model_version: generation.modelVersion,
      effective_size: generation.settings.size,
      quality: generation.settings.quality,
      target: {
        dpi: target.dpi,
        print_width_in: target.printWidthIn,
        print_height_in: target.printHeightIn,
        orientation: target.orientation,
      },
      estimated_cost_usd: estimate.cost,
      estimate_note: estimate.note,
    };
  }

  if (!input.visualAssetNotionId) {
    return {
      id: input.runId,
      status: "upload_failed",
      production_art_status: "not_started",
      idempotent: false,
      filename: input.filename,
      provider: generation.provider,
      model: generation.model,
      model_version: generation.modelVersion,
      effective_size: generation.settings.size,
      quality: generation.settings.quality,
      target: {
        dpi: target.dpi,
        print_width_in: target.printWidthIn,
        print_height_in: target.printHeightIn,
        orientation: target.orientation,
      },
      estimated_cost_usd: estimate.cost,
      estimate_note: estimate.note,
      error: "A Notion Visual Asset page is required before final artwork can be generated.",
      error_code: "VISUAL_ASSET_UNAVAILABLE",
      fatal: true,
    };
  }

  const identity = productionPackageIdentity({
    productionSpecId: input.productionSpecId,
    promptHash: input.promptHash,
    provider: generation.provider,
    model: generation.model,
    modelVersion: version,
    effectiveSize: generation.settings.size,
    quality: generation.settings.quality,
  });

  const [created] = await db
    .insert(worldsmithProductionPackagesTable)
    .values({
      id: randomUUID(),
      productionSpecId: input.productionSpecId,
      promptHash: input.promptHash,
      provider: generation.provider,
      modelName: generation.model,
      modelVersion: version,
      effectiveSize: generation.settings.size,
      quality: generation.settings.quality,
      filename: input.filename,
      visualAssetNotionId: input.visualAssetNotionId,
      estimatedCostUsd: estimate.cost,
      status: "generating",
      productionArtStatus: "not_started",
    })
    .onConflictDoNothing()
    .returning();

  let packageRow = created;
  if (!packageRow) {
    const [existing] = await db
      .select()
      .from(worldsmithProductionPackagesTable)
      .where(identity)
      .limit(1);
    if (!existing) throw new Error("Production package identity could not be read after reservation.");
    packageRow = existing;

    if (packageRow.status === "success") {
      await updateRun(input.runId, {
        status: "complete",
        generatedFilename: packageRow.filename,
        notionUploadId: packageRow.notionUploadId ?? undefined,
        providerRequestId: packageRow.providerRequestId ?? undefined,
        costUsd: packageRow.actualCostUsd ?? undefined,
      });
      return packageResponse(packageRow, target, true);
    }

    // A file made it to Notion but the Visual Asset status update failed. Retry
    // that status write only; regenerating here would bill again needlessly.
    if (packageRow.status === "uploaded_status_pending" && packageRow.notionUploadId) {
      try {
        await updatePage(input.visualAssetNotionId, {
          "Status": selectProp("Artwork Review"),
          "Next Action": richTextProp("Review final artwork"),
        });
        const [updated] = await db
          .update(worldsmithProductionPackagesTable)
          .set({ status: "success", productionArtStatus: "artwork_review", error: null, updatedAt: new Date() })
          .where(eq(worldsmithProductionPackagesTable.id, packageRow.id))
          .returning();
        packageRow = updated ?? packageRow;
        await updateRun(input.runId, {
          status: "complete",
          generatedFilename: packageRow.filename,
          notionUploadId: packageRow.notionUploadId ?? undefined,
        });
        return packageResponse(packageRow, target, true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(worldsmithProductionPackagesTable)
          .set({ error: message, updatedAt: new Date() })
          .where(eq(worldsmithProductionPackagesTable.id, packageRow.id));
        return { ...packageResponse(packageRow, target, true), error: message };
      }
    }

    // An upload can fail after Notion has accepted the file but before it was
    // attached to the Visual Asset property. In that case, retrying the package
    // must finish the existing upload rather than paying for another provider
    // image. Only failures with no reusable upload fall through to generation.
    if (packageRow.status === "upload_failed" && packageRow.notionUploadId) {
      try {
        await attachUploadToPageProperty(
          input.visualAssetNotionId,
          "Final Artwork",
          packageRow.notionUploadId,
          packageRow.filename,
        );
        const [uploaded] = await db
          .update(worldsmithProductionPackagesTable)
          .set({ status: "uploaded_status_pending", error: null, updatedAt: new Date() })
          .where(eq(worldsmithProductionPackagesTable.id, packageRow.id))
          .returning();
        packageRow = uploaded ?? packageRow;

        await updatePage(input.visualAssetNotionId, {
          "Status": selectProp("Artwork Review"),
          "Next Action": richTextProp("Review final artwork"),
        });
        const [completed] = await db
          .update(worldsmithProductionPackagesTable)
          .set({ status: "success", productionArtStatus: "artwork_review", error: null, updatedAt: new Date() })
          .where(eq(worldsmithProductionPackagesTable.id, packageRow.id))
          .returning();
        packageRow = completed ?? packageRow;
        await updateRun(input.runId, {
          status: "complete",
          generatedFilename: packageRow.filename,
          notionUploadId: packageRow.notionUploadId ?? undefined,
        });
        return packageResponse(packageRow, target, true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const [updated] = await db
          .update(worldsmithProductionPackagesTable)
          .set({ error: message, updatedAt: new Date() })
          .where(eq(worldsmithProductionPackagesTable.id, packageRow.id))
          .returning();
        return {
          ...packageResponse(updated ?? packageRow, target, true),
          fatal: true,
          error_code: "UPLOAD_FAILED",
        };
      }
    }

    if (packageRow.status === "generating") {
      return {
        ...packageResponse(packageRow, target, true),
        status: "in_progress",
        estimate_note: "An identical final-art request is already in progress.",
      };
    }

    // Failed generation and upload attempts are intentionally retryable. Claim
    // the existing identity atomically so concurrent retries do not double bill.
    const [reclaimed] = await db
      .update(worldsmithProductionPackagesTable)
      .set({ status: "generating", error: null, visualAssetNotionId: input.visualAssetNotionId, updatedAt: new Date() })
      .where(and(
        eq(worldsmithProductionPackagesTable.id, packageRow.id),
        inArray(worldsmithProductionPackagesTable.status, ["generation_failed", "upload_failed"]),
      ))
      .returning();
    if (!reclaimed) {
      return {
        ...packageResponse(packageRow, target, true),
        status: "in_progress",
        estimate_note: "An identical final-art request is already in progress.",
      };
    }
    packageRow = reclaimed;
  }

  await updateRun(input.runId, {
    status: "generating",
    generatedFilename: input.filename,
    provider: generation.provider,
    modelName: generation.model,
    modelVersion: generation.modelVersion,
    generationSettings: { ...generation.settings, target, estimated_cost_usd: estimate.cost },
  });

  // Stage 13: provider generation is deliberately non-fatal to compilation.
  let generated;
  try {
    generated = await generateImage(input.compiledPrompt, generation.settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [updated] = await db
      .update(worldsmithProductionPackagesTable)
      .set({ status: "generation_failed", error: message, updatedAt: new Date() })
      .where(eq(worldsmithProductionPackagesTable.id, packageRow.id))
      .returning();
    return packageResponse(updated ?? packageRow, target, false);
  }

  // Stages 14–16: prepare and attach the artifact before any status transition.
  let uploadId: string | undefined;
  try {
    const imageBuffer = decodeGeneratedImage(generated.dataUrl);
    uploadId = await uploadFileToNotion(imageBuffer, input.filename, "image/png");
    await attachUploadToPageProperty(input.visualAssetNotionId, "Final Artwork", uploadId, input.filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [updated] = await db
      .update(worldsmithProductionPackagesTable)
      .set({
        status: "upload_failed",
        error: message,
        notionUploadId: typeof uploadId === "string" ? uploadId : null,
        providerRequestId: null,
        actualCostUsd: null,
        updatedAt: new Date(),
      })
      .where(eq(worldsmithProductionPackagesTable.id, packageRow.id))
      .returning();
    return {
      ...packageResponse(updated ?? packageRow, target, false),
      fatal: true,
      error_code: "UPLOAD_FAILED",
    };
  }

  const [uploaded] = await db
    .update(worldsmithProductionPackagesTable)
    .set({
      status: "uploaded_status_pending",
      notionUploadId: uploadId,
      providerRequestId: null,
      actualCostUsd: null,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(worldsmithProductionPackagesTable.id, packageRow.id))
    .returning();
  packageRow = uploaded ?? packageRow;
  await updateRun(input.runId, {
    generatedFilename: input.filename,
    notionUploadId: uploadId,
    providerRequestId: undefined,
    costUsd: undefined,
  });

  // Stages 17–18: final-art review is distinct from a concept-board status.
  try {
    await updatePage(input.visualAssetNotionId, {
      "Status": selectProp("Artwork Review"),
      "Next Action": richTextProp("Review final artwork"),
    });
    const [completed] = await db
      .update(worldsmithProductionPackagesTable)
      .set({ status: "success", productionArtStatus: "artwork_review", error: null, updatedAt: new Date() })
      .where(eq(worldsmithProductionPackagesTable.id, packageRow.id))
      .returning();
    return packageResponse(completed ?? packageRow, target, false);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(worldsmithProductionPackagesTable)
      .set({ error: message, updatedAt: new Date() })
      .where(eq(worldsmithProductionPackagesTable.id, packageRow.id));
    return { ...packageResponse(packageRow, target, false), error: message };
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
