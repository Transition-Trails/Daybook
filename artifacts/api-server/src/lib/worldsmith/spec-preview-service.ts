/**
 * WorldSmith Spec Preview Service
 *
 * Generates a lightweight Product Specification Image for human review after a
 * successful compile.  The image is uploaded to the Notion record and the
 * record's Status is advanced to "Ready for Review".
 *
 * This is Phase 1.5 — it produces only a review artifact, not final artwork.
 */

import { randomUUID } from "crypto";
import sharp from "sharp";
import { db } from "@workspace/db";
import { worldsmithRunsTable, worldsmithSpecPreviewsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import {
  getPage,
  getPageText,
  updatePage,
  uploadFileToNotion,
  attachUploadToPageProperty,
  selectProp,
  richTextProp,
  extractTitle,
  extractRichText,
  extractSelect,
  extractRelation,
  extractNumber,
  type NotionPage,
} from "../notion-client";
import { callDallE } from "../ai-proxy";
import {
  renderSpecBoardToPng,
  CONCEPT_IMAGE_AREA,
  DETAIL_CROP_SOURCE_RECTS,
  DETAIL_CROP_DEST_AREAS,
  TEMPLATE_VERSION,
} from "./spec-board-template";
import { parsePayload } from "./payload-parser";
import { logger } from "../logger";
import { resolveInheritanceChainLocalWithWorldBible, InheritanceError } from "./inheritance-resolver";
import { objectStorageClient, ObjectStorageService } from "../objectStorage";
import type { CompiledSectionRecord, InheritanceChain, SpecBoardData, SpecPreviewResult, SpecPreviewRequest } from "./types";

// ── Configuration ─────────────────────────────────────────────────────────────

function getPreviewConfig(): { provider: string; model: string; size: "1024x1024" | "1792x1024" | "1024x1792"; quality: "standard" | "hd" } {
  return {
    provider: process.env.SPEC_PREVIEW_PROVIDER ?? "dall-e-3",
    model:    process.env.SPEC_PREVIEW_MODEL    ?? "dall-e-3",
    size:     (process.env.SPEC_PREVIEW_SIZE    ?? "1024x1024") as "1024x1024" | "1792x1024" | "1024x1792",
    quality:  (process.env.SPEC_PREVIEW_QUALITY ?? "standard") as "standard" | "hd",
  };
}

// ── Custom error ─────────────────────────────────────────────────────────────

export class SpecPreviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SpecPreviewError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function notionPageUrl(specPageId: string): string {
  return `https://notion.so/${specPageId.replace(/-/g, "")}`;
}

function buildPreviewFilename(data: SpecBoardData): string {
  const slug = (data.productionItem || "spec")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `wm-spec-preview-${slug}-${ts}.png`;
}

const objectStorageService = new ObjectStorageService();

/**
 * Store a local board in the private App Storage namespace. The matching
 * serving route requires a platform admin, unlike the public background assets.
 */
async function storeLocalPreviewBoard(boardPng: Buffer, filename: string): Promise<string> {
  const privateDir = objectStorageService.getPrivateObjectDir().replace(/^\/+|\/+$/g, "");
  const [bucketName, ...prefix] = privateDir.split("/");
  if (!bucketName) {
    throw new Error("PRIVATE_OBJECT_DIR does not contain an App Storage bucket.");
  }

  const entityPath = `worldsmith/spec-previews/${randomUUID()}-${filename}`;
  const objectName = [...prefix, entityPath].filter(Boolean).join("/");
  await objectStorageClient.bucket(bucketName).file(objectName).save(boardPng, {
    resumable: false,
    metadata: {
      contentType: "image/png",
      contentDisposition: `inline; filename="${filename}"`,
      cacheControl: "private, max-age=3600",
    },
  });
  return `/objects/${entityPath}`;
}

function localPreviewUrl(objectPath: string): string {
  return `/api/storage${objectPath}`;
}

// Victorian hand-illustrated style preamble prepended to every prompt (V3 spec requirement)
const VICTORIAN_STYLE_PREAMBLE =
  "Hand-illustrated Victorian archival artwork. " +
  "Medium: watercolour washes, gouache highlights, fine ink linework, and graphite construction lines. " +
  "Surface: aged rag paper with visible tooth, restrained foxing, and subtle water staining. " +
  "Rendering: softened edges, layered pigment, tactile illustrated materials, muted and authentically aged palette. " +
  "Strictly NO photorealism, NO cinematic depth of field, NO glossy digital painting, " +
  "NO razor-sharp focus, NO modern objects, NO high-contrast commercial lighting. " +
  "Style must read as hand-made illustration, never as a photograph or 3D render.";

/** Derive a DALL-E prompt for the central concept visual using Victorian archival style. */
function buildConceptDallePrompt(data: SpecBoardData): string {
  const isConstruction = /pocket|envelope|tag\b|tab\b|label|tuck/i.test(data.componentType);

  if (isConstruction) {
    const parts = [
      VICTORIAN_STYLE_PREAMBLE,
      `Flat technical illustration for a ${data.componentType}.`,
      data.composition ? data.composition : "",
      data.printRule ? data.printRule : "",
      "Clean hand-drawn engineering-style diagram on aged paper. Ink fold lines, cut marks, assembly guide.",
    ].filter(Boolean);
    return parts.join(" ").slice(0, 3800);
  }

  const scene = data.illustratedNarrative || data.designIntent || `${data.componentType} scene`;
  const bible = data.worldBible;
  const parts = [
    VICTORIAN_STYLE_PREAMBLE,
    scene,
    data.composition ? `Composition: ${data.composition}.` : "",
    data.materials ? `Visual materials: ${data.materials}.` : "",
    bible?.visualPalette ? `World palette: ${bible.visualPalette}.` : "",
    bible?.atmosphericNotes ? `World atmosphere: ${bible.atmosphericNotes}.` : "",
    bible?.materialWorld ? `World materials: ${bible.materialWorld}.` : "",
    data.requiredContent ? `Include: ${data.requiredContent}.` : "",
    `Context: ${data.componentType} for the ${data.world}${data.volume ? " " + data.volume : ""} collection.`,
    "Concept preview for editorial review — not final artwork.",
  ].filter(Boolean);
  return parts.join(" ").slice(0, 3800);
}

async function getCompiledSectionsForLocalPreview(
  productionSpecId: string,
  promptHash: string,
): Promise<CompiledSectionRecord[]> {
  const runs = await db
    .select({ compiledSections: worldsmithRunsTable.compiledSections })
    .from(worldsmithRunsTable)
    .where(and(
      eq(worldsmithRunsTable.productionSpecId, productionSpecId),
      eq(worldsmithRunsTable.promptHash, promptHash),
    ))
    .orderBy(desc(worldsmithRunsTable.startedAt))
    .limit(10);

  const sectionRecords = runs.find((run) => Array.isArray(run.compiledSections) && run.compiledSections.length > 0)
    ?.compiledSections;
  if (!sectionRecords) {
    throw new SpecPreviewError(
      "COMPILED_SECTIONS_NOT_FOUND",
      "No compiled section records were found for this local specification and prompt hash. Compile the specification again before generating a preview.",
    );
  }
  return sectionRecords;
}

function compiledSectionContent(
  sectionRecords: CompiledSectionRecord[],
  ...keys: string[]
): string {
  for (const key of keys) {
    const content = sectionRecords.find((record) => record.key === key)?.content.trim();
    if (content) return content;
  }
  return "";
}

/** Map compiled section records and required local grounding into the spec-board contract. */
function extractLocalBoardData(
  chain: InheritanceChain,
  specId: string,
  promptHash: string,
  sectionRecords: CompiledSectionRecord[],
): SpecBoardData {
  const spec = chain.productionSpec;
  const bible = chain.worldBible;
  const creativeTask = compiledSectionContent(sectionRecords, "creative_task");
  const worldContext = compiledSectionContent(sectionRecords, "world_and_collection_context");
  const componentRequirements = compiledSectionContent(sectionRecords, "component_requirements");
  const intent = compiledSectionContent(sectionRecords, "asset_specific_intent");
  const composition = compiledSectionContent(sectionRecords, "front_prompt", "composition_and_content");
  const materials = compiledSectionContent(sectionRecords, "material_world", "materials_and_lighting");
  const textPolicy = compiledSectionContent(sectionRecords, "text_policy");
  const canonPolicy = compiledSectionContent(sectionRecords, "canon_policy");
  const printRequirements = compiledSectionContent(sectionRecords, "print_and_output_requirements");
  const negativeConstraints = compiledSectionContent(sectionRecords, "negative_prompt", "negative_constraints");

  return {
    specPageId: specId,
    productionItem: spec.productionItem,
    specId: spec.specId,
    world: spec.world,
    volume: spec.volume,
    collection: spec.collection,
    componentType: spec.componentType,
    payloadVersion: spec.payloadVersion,
    currentVersion: spec.currentVersion,
    status: spec.status,
    designIntent: intent,
    narrativePurpose: worldContext,
    requiredContent: componentRequirements,
    reviewCriteria: printRequirements,
    assetRole: creativeTask,
    composition,
    materials,
    visualHierarchy: "",
    textRule: textPolicy,
    canonRule: canonPolicy,
    printRule: printRequirements,
    negativeConstraints,
    illustratedNarrative: composition.slice(0, 900) || undefined,
    focalHierarchy: [composition, "", materials, negativeConstraints].filter(Boolean),
    componentSpecName: chain.componentSpec?.name,
    componentSpecContent: chain.componentSpec?.content.slice(0, 600),
    styleGuideName: chain.styleGuide?.name,
    styleGuideContent: chain.styleGuide?.content.slice(0, 900),
    promptModuleCount: chain.promptModules.length,
    canonDependency: spec.canonDependency,
    canonRecordCount: chain.canonRecords.length,
    canonNames: chain.canonRecords.slice(0, 5).map((record) => record.name),
    promptHash,
    worldBible: bible,
    usesCompiledSections: true,
  };
}

/** Extract SpecBoardData from a raw Notion page. */
function extractBoardData(page: NotionPage, specPageId: string, promptHash: string): SpecBoardData & {
  styleGuideId?: string;
  componentSpecId?: string;
  canonRecordIds: string[];
  collectionId?: string;
} {
  const p = page.properties;

  const productionItem =
    extractTitle(p["Production Item"]) ||
    extractTitle(p["Name"]) ||
    extractRichText(p["Production Item"]) ||
    specPageId;

  const specId =
    extractRichText(p["Spec ID"]) ||
    extractRichText(p["ID"]) ||
    specPageId.slice(0, 8).toUpperCase();

  const componentType   = extractSelect(p["Component Type"])  || extractRichText(p["Component Type"]) || "";
  const payloadVersion  = extractSelect(p["Payload Version"]) || extractRichText(p["Payload Version"]) || "";
  const currentVersion  = extractRichText(p["Current Version"]) || extractSelect(p["Current Version"]) || "1";
  const status          = extractSelect(p["Status"]) || extractSelect(p["Workflow Status"]) || "";
  const world           = extractRichText(p["World"]) || extractSelect(p["World"]) || "";
  const volume          = extractRichText(p["Volume"]) || extractSelect(p["Volume"]) ||
                          extractRichText(p["Volume / Collection"]) || undefined;

  // Collection — may be stored as rich text, select, or a Notion relation
  const collectionId =
    extractRelation(p["Collection"])?.[0] ||
    extractRelation(p["Collection Record"])?.[0] ||
    undefined;
  const collection =
    extractRichText(p["Collection"]) ||
    extractSelect(p["Collection"]) ||
    extractRichText(p["Collection Name"]) ||
    undefined;

  const designIntent    = extractRichText(p["Design Intent"])    || extractRichText(p["Intent"]) || "";
  const narrativePurpose= extractRichText(p["Narrative Purpose"]) || extractRichText(p["Narrative"]) || "";
  const requiredContent = extractRichText(p["Required Content"]) || extractRichText(p["Content"]) || "";
  const reviewCriteria  = extractRichText(p["Review Criteria"])  || extractRichText(p["Criteria"]) || "";

  // Parse prompt payload to extract PP-1.0 / PP-2.0 keys
  const rawPayload = extractRichText(p["Prompt Payload"]) || extractRichText(p["Payload"]) || "";
  const parsedPayload = rawPayload ? parsePayload(rawPayload).payload : {};

  const assetRole           = parsedPayload.asset_role           || "";
  const composition         = parsedPayload.composition          || "";
  const materials           = parsedPayload.materials            || "";
  const visualHierarchy     = parsedPayload.visual_hierarchy     || "";
  const textRule            = parsedPayload.text_rule            || "";
  const canonRule           = parsedPayload.canon_rule           || "";
  const printRule           = parsedPayload.print_rule           || "";
  const negativeConstraints = parsedPayload.negative_constraints || "";

  // Illustrated narrative — the visual scene description for Section 3 of the spec board.
  // PP-2.0 front_prompt is the best source; fall back to PP-1.0 world_and_collection_context,
  // then the structured narrativePurpose field.
  const illustratedNarrative = (
    parsedPayload.front_prompt ||
    (parsedPayload as Record<string, string | undefined>).world_and_collection_context ||
    ""
  ).slice(0, 900) || narrativePurpose || undefined;

  const canonDependency = extractSelect(p["Canon Dependency"]) || "None";
  const canonRecordIds  = extractRelation(p["Canon Records"]) || extractRelation(p["Canon"]) || [];
  const promptModuleIds = extractRelation(p["Prompt Modules"]) || extractRelation(p["Modules"]) || [];

  const styleGuideId    = extractRelation(p["Style Guide"])?.[0] ||
                          extractRelation(p["Style Guides"])?.[0] || undefined;
  const componentSpecId = extractRelation(p["Component Specification"])?.[0] ||
                          extractRelation(p["Component Spec"])?.[0] || undefined;

  // Focal hierarchy — up to 4 labels for the V3 detail-crop captions.
  // Drawn from PP-1.0 hero-paper keys; fall back to composition fragments.
  const focalHierarchy: string[] = [
    (parsedPayload as Record<string, string | undefined>).primary_focal_area || composition || "",
    (parsedPayload as Record<string, string | undefined>).secondary_narrative_cluster || visualHierarchy || "",
    (parsedPayload as Record<string, string | undefined>).supporting_objects || materials || "",
    (parsedPayload as Record<string, string | undefined>).story_signal || negativeConstraints || "",
  ].map(s => s.trim()).filter(Boolean);

  return {
    specPageId,
    productionItem,
    specId,
    world,
    volume,
    collection,
    componentType,
    payloadVersion,
    currentVersion,
    status,
    designIntent,
    narrativePurpose,
    requiredContent,
    reviewCriteria,
    assetRole,
    composition,
    materials,
    visualHierarchy,
    textRule,
    canonRule,
    printRule,
    negativeConstraints,
    illustratedNarrative,
    focalHierarchy: focalHierarchy.length > 0 ? focalHierarchy : undefined,
    promptModuleCount: promptModuleIds.length,
    canonDependency,
    canonRecordCount: canonRecordIds.length,
    promptHash,
    // These will be populated below after fetching related pages
    styleGuideId,
    componentSpecId,
    canonRecordIds,
    collectionId,
  };
}

/** Look up the most recent successful non-dry-run preview for idempotency. */
async function findExistingPreview(specPageId: string, promptHash: string) {
  const rows = await db
    .select()
    .from(worldsmithSpecPreviewsTable)
    .where(
      and(
        eq(worldsmithSpecPreviewsTable.specPageId, specPageId),
        eq(worldsmithSpecPreviewsTable.promptHash, promptHash),
        eq(worldsmithSpecPreviewsTable.templateVersion, TEMPLATE_VERSION),
        eq(worldsmithSpecPreviewsTable.status, "success"),
        // Dry-run records must never satisfy the idempotency gate for real previews
        eq(worldsmithSpecPreviewsTable.dryRun, false),
      ),
    )
    .orderBy(desc(worldsmithSpecPreviewsTable.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

/** Return the newest retrievable local board so an editor can see it after reload. */
export async function getLatestLocalSpecPreview(specPageId: string): Promise<SpecPreviewResult | null> {
  const rows = await db
    .select()
    .from(worldsmithSpecPreviewsTable)
    .where(
      and(
        eq(worldsmithSpecPreviewsTable.specPageId, specPageId),
        eq(worldsmithSpecPreviewsTable.status, "success"),
        eq(worldsmithSpecPreviewsTable.dryRun, false),
      ),
    )
    .orderBy(desc(worldsmithSpecPreviewsTable.createdAt))
    .limit(1);
  const preview = rows[0];
  if (!preview?.previewObjectPath) return null;

  return {
    status: "success",
    source: "local",
    production_item: preview.productionItem ?? "",
    spec_page_id: specPageId,
    preview_filename: preview.previewFilename ?? undefined,
    preview_object_path: preview.previewObjectPath,
    preview_url: localPreviewUrl(preview.previewObjectPath),
    provider: preview.provider ?? undefined,
    model: preview.model ?? undefined,
    prompt_hash: preview.promptHash,
    previous_status: preview.previousStatus ?? undefined,
    new_status: preview.newStatus ?? undefined,
    upload_status: "skipped",
    dalle_skipped: true,
  };
}

/** Persist a preview audit record. */
async function savePreviewRecord(fields: {
  specPageId: string;
  promptHash: string;
  status: string;
  previewFilename?: string;
  previewObjectPath?: string;
  provider?: string;
  model?: string;
  notionUploadId?: string;
  productionItem?: string;
  previousStatus?: string;
  newStatus?: string;
  notionPageUrl?: string;
  error?: string;
  dryRun?: boolean;
}): Promise<void> {
  try {
    await db.insert(worldsmithSpecPreviewsTable).values({
      id: randomUUID(),
      specPageId: fields.specPageId,
      promptHash: fields.promptHash,
      templateVersion: TEMPLATE_VERSION,
      status: fields.status,
      previewFilename: fields.previewFilename ?? null,
      previewObjectPath: fields.previewObjectPath ?? null,
      provider: fields.provider ?? null,
      model: fields.model ?? null,
      notionUploadId: fields.notionUploadId ?? null,
      productionItem: fields.productionItem ?? null,
      previousStatus: fields.previousStatus ?? null,
      newStatus: fields.newStatus ?? null,
      notionPageUrl: fields.notionPageUrl ?? null,
      error: fields.error ?? null,
      dryRun: fields.dryRun ?? false,
    });
  } catch (err) {
    logger.warn({ err }, "Could not save spec preview audit record — non-fatal");
  }
}

async function runLocalSpecPreview(
  options: SpecPreviewRequest & { initiatedBy?: string },
): Promise<SpecPreviewResult> {
  const specPageId = options.production_spec_id?.trim();
  const promptHash = options.prompt_hash;
  const forceNew = options.force_new ?? false;
  const dryRun = options.dry_run ?? false;

  if (!specPageId) {
    throw new SpecPreviewError("MISSING_SPEC_ID", "production_spec_id is required for a local spec preview.");
  }

  let chain: InheritanceChain;
  try {
    chain = await resolveInheritanceChainLocalWithWorldBible(specPageId);
  } catch (err) {
    if (err instanceof InheritanceError) {
      throw new SpecPreviewError(err.errorCode, err.message);
    }
    throw new SpecPreviewError(
      "LOCAL_INHERITANCE_FAILED",
      `Could not resolve local Editorial Suite records: ${String(err)}`,
    );
  }

  const sectionRecords = await getCompiledSectionsForLocalPreview(specPageId, promptHash);

  if (!forceNew && !dryRun) {
    const existing = await findExistingPreview(specPageId, promptHash);
    if (existing?.previewObjectPath) {
      return {
        status: "success",
        source: "local",
        production_item: existing.productionItem ?? "",
        spec_page_id: specPageId,
        preview_filename: existing.previewFilename ?? undefined,
        preview_object_path: existing.previewObjectPath,
        preview_url: localPreviewUrl(existing.previewObjectPath),
        provider: existing.provider ?? undefined,
        model: existing.model ?? undefined,
        prompt_hash: promptHash,
        previous_status: existing.previousStatus ?? undefined,
        new_status: existing.newStatus ?? undefined,
        upload_status: "skipped",
        dalle_skipped: true,
      };
    }
  }

  const boardData = extractLocalBoardData(chain, specPageId, promptHash, sectionRecords);
  const localStatusNote = "Preview generated from Editorial Suite; publish the Production Specification to attach it in Notion.";

  if (dryRun) {
    const dryPayload: Record<string, string> = {
      "Production Item": boardData.productionItem,
      "Component Type": boardData.componentType,
      "Design Intent": boardData.designIntent,
      "Composition": boardData.composition,
      "Materials": boardData.materials,
      "Negative Constraints": boardData.negativeConstraints,
      "Print Rule": boardData.printRule,
      "Canon Dependency": boardData.canonDependency,
      "Style Guide": boardData.styleGuideName ?? "—",
      "Component Spec": boardData.componentSpecName ?? "—",
      "World Bible": [
        boardData.worldBible?.visualPalette,
        boardData.worldBible?.proseVoice,
        boardData.worldBible?.atmosphericNotes,
        boardData.worldBible?.materialWorld,
      ].filter(Boolean).join(" · ") || "—",
      "Template Version": TEMPLATE_VERSION,
    };
    await savePreviewRecord({
      specPageId,
      promptHash,
      status: "dry_run",
      productionItem: boardData.productionItem,
      dryRun: true,
      previousStatus: boardData.status,
      newStatus: boardData.status,
    });
    return {
      status: "dry_run",
      source: "local",
      production_item: boardData.productionItem,
      spec_page_id: specPageId,
      prompt_hash: promptHash,
      previous_status: boardData.status,
      new_status: boardData.status,
      upload_status: "skipped",
      dry_run_payload: dryPayload,
      proposed_status_change: { from: boardData.status, to: boardData.status },
    };
  }

  let boardPng: Buffer;
  try {
    boardPng = await renderSpecBoardToPng(boardData);
  } catch (err) {
    await savePreviewRecord({
      specPageId,
      promptHash,
      status: "failed",
      productionItem: boardData.productionItem,
      error: `SVG render failed: ${String(err)}`,
    });
    throw new SpecPreviewError("GENERATION_FAILED", `Spec board render failed: ${String(err)}`);
  }

  // An unpublished Editorial Suite spec has no safe Notion target for an image
  // attachment or workflow transition. Persist it in protected App Storage
  // instead, while keeping all Notion writes deferred until publication.
  const filename = buildPreviewFilename(boardData);
  let previewObjectPath: string;
  try {
    previewObjectPath = await storeLocalPreviewBoard(boardPng, filename);
  } catch (err) {
    await savePreviewRecord({
      specPageId,
      promptHash,
      status: "failed",
      previewFilename: filename,
      productionItem: boardData.productionItem,
      previousStatus: boardData.status,
      newStatus: boardData.status,
      error: `App Storage upload failed: ${String(err)}`,
    });
    throw new SpecPreviewError("PREVIEW_STORAGE_FAILED", `Could not store the local spec board: ${String(err)}`);
  }
  await savePreviewRecord({
    specPageId,
    promptHash,
    status: "success",
    previewFilename: filename,
    previewObjectPath,
    provider: "local",
    model: "spec-board",
    productionItem: boardData.productionItem,
    previousStatus: boardData.status,
    newStatus: boardData.status,
    error: localStatusNote,
  });
  logger.info(
    { specPageId, promptHash, filename, previewObjectPath, bytes: boardPng.length },
    "WorldSmith local spec preview stored without Notion write-back",
  );

  return {
    status: "success",
    source: "local",
    production_item: boardData.productionItem,
    spec_page_id: specPageId,
    preview_filename: filename,
    preview_object_path: previewObjectPath,
    preview_url: localPreviewUrl(previewObjectPath),
    provider: "local",
    model: "spec-board",
    prompt_hash: promptHash,
    previous_status: boardData.status,
    new_status: boardData.status,
    upload_status: "skipped",
    dalle_skipped: true,
  };
}

// ── Main service function ─────────────────────────────────────────────────────

export async function runSpecPreview(
  options: SpecPreviewRequest & { initiatedBy?: string },
): Promise<SpecPreviewResult> {
  if (options.production_spec_id?.trim()) {
    return runLocalSpecPreview(options);
  }

  const { spec_page_id: specPageId, prompt_hash: promptHash, force_new = false, dry_run = false } = options;
  if (!specPageId) {
    throw new SpecPreviewError("MISSING_SPEC_ID", "spec_page_id is required for a Notion-backed spec preview.");
  }
  const pageUrl = notionPageUrl(specPageId);

  // ── 1. Idempotency ──────────────────────────────────────────────────────
  if (!force_new && !dry_run) {
    const existing = await findExistingPreview(specPageId, promptHash);
    if (existing) {
      logger.info({ specPageId, promptHash }, "Spec preview: returning existing result (idempotent)");
      return {
        status: "success",
        source: "notion",
        production_item: existing.productionItem ?? "",
        spec_page_id: specPageId,
        notion_page_id: specPageId,
        notion_page_url: existing.notionPageUrl ?? pageUrl,
        preview_filename: existing.previewFilename ?? undefined,
        provider: existing.provider ?? undefined,
        model: existing.model ?? undefined,
        prompt_hash: promptHash,
        previous_status: existing.previousStatus ?? undefined,
        new_status: existing.newStatus ?? undefined,
        upload_status: "success",
        notion_upload_id: existing.notionUploadId ?? undefined,
      };
    }
  }

  // ── 2. Fetch spec from Notion ────────────────────────────────────────────
  let page: NotionPage;
  try {
    page = await getPage(specPageId);
  } catch (err) {
    const msg = String(err);
    const isNotFound = /404|not_found|object_not_found/i.test(msg);
    throw new SpecPreviewError(
      isNotFound ? "SPEC_NOT_FOUND" : "NOTION_FETCH_FAILED",
      isNotFound
        ? `Production Specification page not found: ${specPageId}`
        : `Could not fetch Notion page: ${msg}`,
    );
  }

  const boardData = extractBoardData(page, specPageId, promptHash);

  // ── 3. Fetch related pages (style guide, component spec, collection, canon records) ─
  const { styleGuideId, componentSpecId, canonRecordIds, collectionId, ...safeBoardData } = boardData as typeof boardData;

  // Fetch all related pages concurrently — each is non-fatal
  await Promise.all([
    // Style guide
    styleGuideId
      ? (async () => {
          try {
            const sgPage = await getPage(styleGuideId);
            safeBoardData.styleGuideName =
              extractTitle(sgPage.properties["Name"]) ||
              extractTitle(sgPage.properties["Style Guide Name"]) || styleGuideId;
            const sgText = await getPageText(styleGuideId);
            safeBoardData.styleGuideContent = sgText.slice(0, 900);

            // Collect up to 4 image file URLs from any "files"-type property on the page
            const refUrls: string[] = [];
            for (const prop of Object.values(sgPage.properties)) {
              const p = prop as {
                type?: string;
                files?: Array<{
                  type: string;
                  file?: { url: string };
                  external?: { url: string };
                }>;
              };
              if (p.type === "files" && Array.isArray(p.files)) {
                for (const f of p.files) {
                  const url = f.type === "file" ? f.file?.url : f.external?.url;
                  if (url && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) {
                    refUrls.push(url);
                    if (refUrls.length >= 4) break;
                  }
                }
              }
              if (refUrls.length >= 4) break;
            }
            if (refUrls.length > 0) {
              safeBoardData.referenceImageUrls = refUrls;
            }
          } catch { /* non-fatal */ }
        })()
      : Promise.resolve(),

    // Component spec
    componentSpecId
      ? (async () => {
          try {
            const csPage = await getPage(componentSpecId);
            safeBoardData.componentSpecName =
              extractTitle(csPage.properties["Name"]) ||
              extractTitle(csPage.properties["Component Specification"]) || componentSpecId;
            const csText = await getPageText(componentSpecId);
            safeBoardData.componentSpecContent = csText.slice(0, 600);
          } catch { /* non-fatal */ }
        })()
      : Promise.resolve(),

    // Collection name (only needed when stored as a relation, not plain text)
    !safeBoardData.collection && collectionId
      ? (async () => {
          try {
            const colPage = await getPage(collectionId);
            const name =
              extractTitle(colPage.properties["Name"]) ||
              extractTitle(colPage.properties["Collection"]) ||
              extractRichText(colPage.properties["Collection Name"]);
            if (name) safeBoardData.collection = name;
          } catch { /* non-fatal */ }
        })()
      : Promise.resolve(),

    // Canon record names (up to 5, for Section 13 bullet list) + fallback reference images
    canonRecordIds.length > 0
      ? (async () => {
          const names: string[] = [];
          const canonRefUrls: string[] = [];
          await Promise.all(
            canonRecordIds.slice(0, 5).map(async (id) => {
              try {
                const cPage = await getPage(id);
                const name =
                  extractTitle(cPage.properties["Name"]) ||
                  extractTitle(cPage.properties["Canon Record"]) ||
                  extractTitle(cPage.properties["Canon Name"]) ||
                  extractRichText(cPage.properties["Name"]);
                if (name) names.push(name);

                // Collect image file URLs for reference thumbnail fallback
                if (canonRefUrls.length < 4) {
                  for (const prop of Object.values(cPage.properties)) {
                    const p = prop as {
                      type?: string;
                      files?: Array<{
                        type: string;
                        file?: { url: string };
                        external?: { url: string };
                      }>;
                    };
                    if (p.type === "files" && Array.isArray(p.files)) {
                      for (const f of p.files) {
                        const url = f.type === "file" ? f.file?.url : f.external?.url;
                        if (url && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) {
                          canonRefUrls.push(url);
                          if (canonRefUrls.length >= 4) break;
                        }
                      }
                    }
                    if (canonRefUrls.length >= 4) break;
                  }
                }
              } catch { /* non-fatal */ }
            }),
          );
          if (names.length > 0) safeBoardData.canonNames = names;
          // Only use canon images if the style guide provided none
          if (canonRefUrls.length > 0 && !safeBoardData.referenceImageUrls?.length) {
            safeBoardData.referenceImageUrls = canonRefUrls.slice(0, 4);
          }
        })()
      : Promise.resolve(),
  ]);

  const finalBoardData: SpecBoardData = safeBoardData;

  // ── 4. Dry run: return text payload without generating/uploading ─────────
  if (dry_run) {
    const dryPayload: Record<string, string> = {
      "Production Item":            finalBoardData.productionItem,
      "Component Type":             finalBoardData.componentType,
      "Design Intent":              finalBoardData.designIntent,
      "Composition":                finalBoardData.composition,
      "Materials":                  finalBoardData.materials,
      "Negative Constraints":       finalBoardData.negativeConstraints,
      "Print Rule":                 finalBoardData.printRule,
      "Canon Dependency":           finalBoardData.canonDependency,
      "Style Guide":                finalBoardData.styleGuideName ?? "—",
      "Component Spec":             finalBoardData.componentSpecName ?? "—",
      "Proposed Status Change":     `${finalBoardData.status || "Active"} → Ready for Review`,
      "Template Version":           TEMPLATE_VERSION,
    };
    await savePreviewRecord({
      specPageId, promptHash,
      // Store dry runs with a distinct status so they can never satisfy
      // the idempotency gate (which only accepts status="success" + dryRun=false)
      status: "dry_run",
      productionItem: finalBoardData.productionItem,
      notionPageUrl: pageUrl,
      dryRun: true,
      previousStatus: finalBoardData.status,
      newStatus: "Ready for Review",
    });
    return {
      status: "dry_run",
      source: "notion",
      production_item: finalBoardData.productionItem,
      spec_page_id: specPageId,
      notion_page_id: specPageId,
      notion_page_url: pageUrl,
      prompt_hash: promptHash,
      previous_status: finalBoardData.status,
      new_status: "Ready for Review",
      upload_status: "skipped",
      dry_run_payload: dryPayload,
      proposed_status_change: {
        from: finalBoardData.status || "Active",
        to: "Ready for Review",
      },
    };
  }

  // ── 5. Generate spec board PNG ────────────────────────────────────────────
  const cfg = getPreviewConfig();
  let boardPng: Buffer;
  try {
    boardPng = await renderSpecBoardToPng(finalBoardData);
  } catch (svgErr) {
    await savePreviewRecord({
      specPageId, promptHash,
      status: "failed",
      productionItem: finalBoardData.productionItem,
      notionPageUrl: pageUrl,
      error: `SVG render failed: ${String(svgErr)}`,
    });
    throw new SpecPreviewError("GENERATION_FAILED", `Spec board render failed: ${String(svgErr)}`);
  }

  // ── 6. Generate and composite central concept visual via DALL-E ───────────
  let finalPng = boardPng;
  let dalleApplied = false;
  let dalleErrorMsg: string | undefined;

  try {
    if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
      dalleErrorMsg = "No OpenAI API key configured — set OPENAI_API_KEY or run the Replit AI integration setup.";
      logger.warn({ specPageId }, dalleErrorMsg);
    } else {
      const dallePrompt = buildConceptDallePrompt(finalBoardData);
      logger.info({ specPageId, promptLength: dallePrompt.length }, "Calling DALL-E for concept visual");

      const b64DataUrl = await callDallE(dallePrompt, {
        size: cfg.size,
        quality: cfg.quality,
        // 'style' intentionally omitted — some API configurations reject it
      });

      // Decode base64 → buffer
      const b64 = b64DataUrl.replace(/^data:image\/[a-z+]+;base64,/, "");
      const dalleBuffer = Buffer.from(b64, "base64");

      // Resize to fit the concept image area, maintaining aspect ratio
      const { x, y, width, height } = CONCEPT_IMAGE_AREA;
      const resized = await sharp(dalleBuffer)
        .resize(width - 10, height - 10, {
          fit: "inside",
          withoutEnlargement: false,
        })
        .png()
        .toBuffer();

      // Center the resized image in the concept area
      const meta = await sharp(resized).metadata();
      const imgW = meta.width ?? width;
      const imgH = meta.height ?? height;
      const left = x + Math.floor((width - imgW) / 2);
      const top  = y + Math.floor((height - imgH) / 2);

      // Composite over the spec board
      finalPng = await sharp(boardPng)
        .composite([{ input: resized, left, top, blend: "over" }])
        .png()
        .toBuffer();

      // Overlay the "CONCEPT PREVIEW" label on top of the composited image
      const labelSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28">
          <rect width="${width}" height="28" fill="rgba(27,42,74,0.72)"/>
          <text x="${width / 2}" y="19" text-anchor="middle"
            font-family="sans-serif" font-size="11" font-weight="bold"
            fill="#FFFFFF" letter-spacing="1.5">CONCEPT PREVIEW · FOR HUMAN REVIEW</text>
        </svg>`,
      );
      finalPng = await sharp(finalPng)
        .composite([{ input: labelSvg, left: x, top: y + height - 28, blend: "over" }])
        .png()
        .toBuffer();

      dalleApplied = true;
      logger.info({ specPageId }, "DALL-E concept visual composited successfully");
    }
  } catch (dalleErr) {
    dalleErrorMsg = String(dalleErr);
    logger.warn({ err: dalleErr, specPageId }, "DALL-E concept visual failed — using spec board without central image");
    // Non-fatal: continue with the plain spec board (placeholder remains)
    finalPng = boardPng;
  }

  // ── 6b. Auto-crop detail references from the DALL-E image ──────────────────
  // Crop 4 regions from the concept image area in the board and composite them
  // into the DETAIL_CROP_DEST_AREAS in the bottom technical strip.
  if (dalleApplied) {
    try {
      const composites: Array<{ input: Buffer; left: number; top: number; blend: "over" }> = [];
      await Promise.all(
        DETAIL_CROP_SOURCE_RECTS.map(async (src, i) => {
          const dest = DETAIL_CROP_DEST_AREAS[i];
          if (!dest) return;
          try {
            const cropped = await sharp(finalPng)
              .extract({ left: src.x, top: src.y, width: src.width, height: src.height })
              .resize(dest.width - 4, dest.height - 4, { fit: "cover", position: "centre" })
              .png()
              .toBuffer();
            composites.push({ input: cropped, left: dest.x + 2, top: dest.y + 2, blend: "over" });
          } catch (cropErr) {
            logger.warn({ err: cropErr, index: i, specPageId }, "Detail crop failed — skipping thumbnail");
          }
        }),
      );
      if (composites.length > 0) {
        finalPng = await sharp(finalPng)
          .composite(composites)
          .png()
          .toBuffer();
        logger.info({ specPageId, count: composites.length }, "Detail reference crops composited into spec board");
      }
    } catch (cropErr) {
      logger.warn({ err: cropErr, specPageId }, "Detail crop compositing failed — non-fatal, continuing");
    }
  }

  // Enforce max file size (4 MB). Reduce PNG compression if needed.
  if (finalPng.length > 4 * 1024 * 1024) {
    try {
      finalPng = await sharp(finalPng)
        .resize(1400, undefined, { withoutEnlargement: true })
        .png({ compressionLevel: 9, quality: 80 })
        .toBuffer();
    } catch {
      // Use as-is
    }
  }

  // ── 7. Upload to Notion ───────────────────────────────────────────────────
  const filename = buildPreviewFilename(finalBoardData);
  let uploadId: string;
  try {
    uploadId = await uploadFileToNotion(finalPng, filename, "image/png");
    await attachUploadToPageProperty(
      specPageId,
      "Product Specification Image",
      uploadId,
      filename,
    );
  } catch (uploadErr) {
    await savePreviewRecord({
      specPageId, promptHash,
      status: "upload_failed",
      productionItem: finalBoardData.productionItem,
      notionPageUrl: pageUrl,
      provider: cfg.provider,
      model: cfg.model,
      error: String(uploadErr),
    });
    throw new SpecPreviewError("UPLOAD_FAILED", `Notion upload failed: ${String(uploadErr)}`);
  }

  // ── 8. Update Notion Status and Next Action (only after upload) ───────────
  const previousStatus = finalBoardData.status;
  let statusUpdateFailed = false;
  try {
    await updatePage(specPageId, {
      "Status": selectProp("Ready for Review"),
      "Next Action": richTextProp(
        "Review the Product Specification Image, confirm the specification and visual direction, then approve or return for revision.",
      ),
    });
  } catch (statusErr) {
    logger.warn(
      { err: statusErr, specPageId },
      "Could not update Status to Ready for Review — image was uploaded successfully",
    );
    statusUpdateFailed = true;
  }

  // ── 9. Persist audit record ───────────────────────────────────────────────
  // Use "success_placeholder" when DALL-E was skipped/failed so the idempotency
  // check (which only matches "success") won't block future regeneration attempts.
  // This means every call will retry DALL-E until it actually succeeds.
  const finalStatus = statusUpdateFailed
    ? "status_update_failed"
    : dalleApplied
      ? "success"
      : "success_placeholder";
  const newStatus = statusUpdateFailed ? (previousStatus || "") : "Ready for Review";

  await savePreviewRecord({
    specPageId,
    promptHash,
    status: finalStatus,
    previewFilename: filename,
    provider: cfg.provider,
    model: cfg.model,
    notionUploadId: uploadId,
    productionItem: finalBoardData.productionItem,
    previousStatus,
    newStatus,
    notionPageUrl: pageUrl,
    error: dalleApplied ? undefined : dalleErrorMsg,
  });

  logger.info(
    { specPageId, promptHash, filename, uploadId, previousStatus, newStatus, dalleApplied },
    "WorldSmith spec preview complete",
  );

  return {
    status: statusUpdateFailed ? "upload_success_status_failed" : "success",
    source: "notion",
    production_item: finalBoardData.productionItem,
    spec_page_id: specPageId,
    notion_page_id: specPageId,
    notion_page_url: pageUrl,
    preview_filename: filename,
    provider: cfg.provider,
    model: cfg.model,
    prompt_hash: promptHash,
    previous_status: previousStatus,
    new_status: newStatus,
    upload_status: "success",
    notion_upload_id: uploadId,
    dalle_skipped: !dalleApplied,
    dalle_error: dalleApplied ? undefined : dalleErrorMsg,
  };
}

// ── Retry status-only update ──────────────────────────────────────────────────

/**
 * Re-attempt only the Notion status write for a spec preview whose image was
 * already uploaded successfully but whose status transition failed
 * (upload_success_status_failed).  Skips DALL-E generation and Notion upload
 * entirely — zero additional cost.
 */
export async function retrySpecPreviewStatus(
  specPageId: string,
  promptHash: string,
): Promise<SpecPreviewResult> {
  const pageUrl = notionPageUrl(specPageId);

  // Find the most recent audit record for this spec+hash that has status_update_failed
  const rows = await db
    .select()
    .from(worldsmithSpecPreviewsTable)
    .where(
      and(
        eq(worldsmithSpecPreviewsTable.specPageId, specPageId),
        eq(worldsmithSpecPreviewsTable.promptHash, promptHash),
        eq(worldsmithSpecPreviewsTable.status, "status_update_failed"),
        eq(worldsmithSpecPreviewsTable.dryRun, false),
      ),
    )
    .orderBy(desc(worldsmithSpecPreviewsTable.createdAt))
    .limit(1);

  const existingRecord = rows[0];
  if (!existingRecord) {
    throw new SpecPreviewError(
      "NO_FAILED_STATUS_RECORD",
      "No upload_success_status_failed record found for this spec and prompt hash. " +
      "Nothing to retry — the status may have already been updated.",
    );
  }

  // Re-attempt the Notion status write
  try {
    await updatePage(specPageId, {
      "Status": selectProp("Ready for Review"),
      "Next Action": richTextProp(
        "Review the Product Specification Image, confirm the specification and visual direction, then approve or return for revision.",
      ),
    });
  } catch (statusErr) {
    throw new SpecPreviewError(
      "STATUS_UPDATE_FAILED",
      `Notion status update failed again: ${String(statusErr)}`,
    );
  }

  // Persist a new success audit record so the idempotency gate will return
  // a clean "success" on the next regular generatePreview call.
  await savePreviewRecord({
    specPageId,
    promptHash,
    status: "success",
    previewFilename: existingRecord.previewFilename ?? undefined,
    provider: existingRecord.provider ?? undefined,
    model: existingRecord.model ?? undefined,
    notionUploadId: existingRecord.notionUploadId ?? undefined,
    productionItem: existingRecord.productionItem ?? undefined,
    previousStatus: existingRecord.previousStatus ?? undefined,
    newStatus: "Ready for Review",
    notionPageUrl: existingRecord.notionPageUrl ?? pageUrl,
  });

  logger.info(
    { specPageId, promptHash },
    "WorldSmith spec preview status retry succeeded",
  );

  return {
    status: "success",
    production_item: existingRecord.productionItem ?? "",
    spec_page_id: specPageId,
    notion_page_id: specPageId,
    notion_page_url: existingRecord.notionPageUrl ?? pageUrl,
    preview_filename: existingRecord.previewFilename ?? undefined,
    provider: existingRecord.provider ?? undefined,
    model: existingRecord.model ?? undefined,
    prompt_hash: promptHash,
    previous_status: existingRecord.previousStatus ?? undefined,
    new_status: "Ready for Review",
    upload_status: "success",
    notion_upload_id: existingRecord.notionUploadId ?? undefined,
  };
}
