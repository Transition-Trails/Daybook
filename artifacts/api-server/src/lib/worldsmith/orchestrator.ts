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
import { createRun, updateRun, failRun, getRun } from "./run-repository";
import { upsertAsset, getAssetBySpec, buildAssetId, buildFilename } from "./daybook-adapter";
import {
  getPage,
  updatePage,
  createPage,
  richTextProp,
  selectProp,
  relationProp,
  _setOnRetry,
  type NotionRetryEvent,
} from "../notion-client";
import type { CompileRequest, CompileResponse, ValidationError, ProvenanceRecord, InheritanceChain } from "./types";
import { logger } from "../logger";
import { db } from "@workspace/db";
import { worldsmithWorldsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

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
    if (!dryRun && spec.notionPageId) {
      try {
          visualAssetNotionId = await upsertVisualAsset(chain, compiled.fullPrompt, promptHash, assetId, filename);
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
          "Next Action": richTextProp("Generate image"),
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
      status: "compiled",
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
