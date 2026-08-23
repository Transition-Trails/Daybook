/**
 * Inheritance Resolver
 * Fetches and resolves all governed records from Notion in the correct order:
 * World → Collection → Component Set → Style Guide → Component Spec →
 * Prompt Modules → Prompt Module dependencies → Production Spec →
 * Prompt Payload → Canon Records → Negative constraints → Print requirements
 *
 * The Engine stops at the first unresolved required dependency.
 */
import {
  getPage,
  getPageText,
  extractTitle,
  extractRichText,
  extractSelect,
  extractRelation,
  extractNumber,
  extractUrl,
  type NotionPage,
} from "../notion-client";
import type {
  ProductionSpec,
  StyleGuide,
  ComponentSpec,
  PromptModule,
  PromptModuleSection,
  WorldBible,
  CanonRecord,
  InheritanceChain,
  ValidationError,
} from "./types";
import { isPromptModuleSection } from "./types";
import { logger } from "../logger";
import {
  db,
  worldsmithWorldsTable,
  wsCollectionsTable,
  wsVolumesTable,
  wsStyleGuidesTable,
  wsComponentSpecsTable,
  wsPromptModulesTable,
  wsCanonRecordsTable,
  wsProductionSpecsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

const PRODUCTION_SPEC_DB = () => process.env.NOTION_PRODUCTION_SPEC_DB_ID ?? "";
const VISUAL_ASSETS_DB = () => process.env.NOTION_VISUAL_ASSETS_DB_ID ?? "";
const CANON_DB = () => process.env.NOTION_CANON_DB_ID ?? "";
const STYLE_GUIDES_DB = () => process.env.NOTION_STYLE_GUIDES_DB_ID ?? "";

// ── In-process page cache ─────────────────────────────────────────────────────
// World, collection, and volume pages change infrequently and are often fetched
// repeatedly across successive compiles for the same world.  A 5-minute TTL
// avoids hammering the Notion API and cuts compile latency in batch runs.
//
// Production Spec pages are intentionally NOT cached (they change every draft).
// Style Guide / Component Spec / Prompt Module pages are also not cached because
// their content is the primary variable in day-to-day editorial work.

const PAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _pageCache = new Map<string, { data: NotionPage; expiry: number }>();

async function getCachedPage(pageId: string): Promise<NotionPage> {
  const hit = _pageCache.get(pageId);
  if (hit && Date.now() < hit.expiry) {
    return hit.data;
  }
  const data = await getPage(pageId);
  _pageCache.set(pageId, { data, expiry: Date.now() + PAGE_CACHE_TTL_MS });
  return data;
}

/**
 * Flush the in-process page cache.
 * Call this from tests that need isolation between resolveInheritanceChain runs,
 * or from long-running worker processes that need to force a cache refresh.
 */
export function clearPageCache(): void {
  _pageCache.clear();
}

// ── Production Spec extraction ────────────────────────────────────────────────

function extractProductionSpec(page: NotionPage): ProductionSpec {
  const p = page.properties;

  // Try several possible property name variants for each field
  const productionItem =
    extractTitle(p["Production Item"]) ||
    extractTitle(p["Name"]) ||
    extractRichText(p["Production Item"]);

  const specId =
    extractRichText(p["Spec ID"]) ||
    extractRichText(p["Production Record ID"]) ||
    extractRichText(p["ID"]) ||
    page.id;

  const componentType =
    extractSelect(p["Component Type"]) ||
    extractRichText(p["Component Type"]);

  const componentSet =
    extractRichText(p["Component Set"]) ||
    extractSelect(p["Component Set"]) ||
    extractRelation(p["Component Set"])?.[0];

  const heroFamily =
    extractRichText(p["Hero Family"]) ||
    extractSelect(p["Hero Family"]);

  // Capture the relation page ID separately so the resolver can do a
  // follow-up fetch when the field is stored as a Notion relation.
  const worldId = extractRelation(p["World"])?.[0];
  const world =
    extractRichText(p["World"]) ||
    extractSelect(p["World"]) ||
    "";

  // Collection sits between World and Volume in the inheritance chain.
  // It may be a relation to a Collection record or a plain text / select field.
  const collectionId =
    extractRelation(p["Collection"])?.[0] ||
    extractRelation(p["Collection Record"])?.[0];
  const collection =
    extractRichText(p["Collection"]) ||
    extractSelect(p["Collection"]) ||
    extractRichText(p["Collection Name"]);

  // Capture the relation page ID separately so the resolver can do a
  // follow-up fetch when the field is stored as a Notion relation.
  const volumeId =
    extractRelation(p["Volume"])?.[0] ||
    extractRelation(p["Volume / Collection"])?.[0];
  const volume =
    extractRichText(p["Volume"]) ||
    extractSelect(p["Volume"]) ||
    extractRichText(p["Volume / Collection"]);

  const currentVersion =
    extractRichText(p["Current Version"]) ||
    extractSelect(p["Current Version"]) ||
    "1";

  const designIntent =
    extractRichText(p["Design Intent"]) ||
    extractRichText(p["Intent"]);

  const narrativePurpose =
    extractRichText(p["Narrative Purpose"]) ||
    extractRichText(p["Purpose"]);

  const requiredContent =
    extractRichText(p["Required Content"]) ||
    extractRichText(p["Content"]);

  const reviewCriteria =
    extractRichText(p["Review Criteria"]) ||
    extractRichText(p["Criteria"]);

  const writingSpacePercent = extractNumber(p["Writing Space"]) ?? extractNumber(p["Writing Space %"]);

  const orientation = extractSelect(p["Orientation"]) || extractRichText(p["Orientation"]);
  const frontBackStyle = extractSelect(p["Front/Back Style"]) || extractRichText(p["Front/Back Style"]);

  const payloadVersion =
    extractSelect(p["Payload Version"]) ||
    extractRichText(p["Payload Version"]);

  const promptPayload =
    extractRichText(p["Prompt Payload"]) ||
    extractRichText(p["Payload"]);

  // The Prompt Payload may be a linked database record rather than inline text.
  // If so, capture the relation ID so the resolver can fetch it and read
  // Payload Version (and any other governed fields) from that page.
  const promptPayloadId =
    extractRelation(p["Prompt Payload"])?.[0] ||
    extractRelation(p["Payload"])?.[0];

  const componentSpecificationId =
    extractRelation(p["Component Specification"])?.[0] ||
    extractRelation(p["Component Spec"])?.[0];

  const styleGuideId =
    extractRelation(p["Style Guide"])?.[0];

  const promptModuleIds =
    extractRelation(p["Prompt Modules"]) ||
    extractRelation(p["Modules"]);

  const canonDependency =
    (extractSelect(p["Canon Dependency"]) ||
    extractSelect(p["Canon"]) ||
    "None") as ProductionSpec["canonDependency"];

  const canonRecordIds =
    extractRelation(p["Canon Records"]) ||
    extractRelation(p["Canon"]);

  const status =
    extractSelect(p["Status"]) ||
    extractSelect(p["Workflow Status"]);

  const compiledPromptStatus =
    extractSelect(p["Compiled Prompt Status"]) ||
    extractRichText(p["Compiled Prompt Status"]) ||
    "Not Compiled";

  const nextAction =
    extractSelect(p["Next Action"]) ||
    extractRichText(p["Next Action"]);

  const existingVisualAssetId =
    extractRelation(p["Visual Asset"])?.[0] ||
    extractRelation(p["Existing Visual Asset"])?.[0];

  const googleDriveLink =
    extractUrl(p["Google Drive Link"]) ||
    extractUrl(p["Drive Link"]);

  return {
    sourceId: page.id,
    notionPageId: page.id,
    productionItem,
    specId,
    componentType,
    componentSet,
    heroFamily,
    world,
    worldId: worldId || undefined,
    collection: collection || undefined,
    collectionId: collectionId || undefined,
    volume: volume || undefined,
    volumeId: volumeId || undefined,
    currentVersion,
    designIntent,
    narrativePurpose,
    requiredContent,
    reviewCriteria,
    writingSpacePercent,
    orientation,
    frontBackStyle,
    payloadVersion,
    promptPayload,
    promptPayloadId,
    componentSpecificationId,
    styleGuideId,
    promptModuleIds,
    canonDependency,
    canonRecordIds,
    status,
    compiledPromptStatus,
    nextAction,
    existingVisualAssetId,
    googleDriveLink,
  };
}

// ── Style Guide ───────────────────────────────────────────────────────────────

async function resolveStyleGuide(pageId: string): Promise<StyleGuide> {
  const page = await getPage(pageId);
  const name =
    extractTitle(page.properties["Name"]) ||
    extractTitle(page.properties["Style Guide"]) ||
    pageId;
  const content = await getPageText(pageId);
  return { sourceId: pageId, notionPageId: pageId, name, content };
}

// ── Component Spec ────────────────────────────────────────────────────────────

async function resolveComponentSpec(pageId: string): Promise<ComponentSpec> {
  const page = await getPage(pageId);
  const name =
    extractTitle(page.properties["Name"]) ||
    extractTitle(page.properties["Component Specification"]) ||
    pageId;
  const componentType =
    extractSelect(page.properties["Component Type"]) ||
    extractRichText(page.properties["Component Type"]) ||
    "";
  const content = await getPageText(pageId);
  return { sourceId: pageId, notionPageId: pageId, name, content, componentType };
}

// ── Prompt Module ─────────────────────────────────────────────────────────────

/**
 * Notion modules predate the persisted local routing field. Retain their
 * established placement until they can be authored with an explicit Section
 * property, while keeping all routing inference outside the compiler.
 */
function legacyPromptModuleSection(name: string): PromptModuleSection {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("style") || lowerName.includes("aesthetic")) return "style";
  if (lowerName.includes("world")) return "world";
  return "general";
}

async function resolvePromptModule(
  pageId: string,
  visited = new Set<string>(),
  warnings: ValidationError[] = [],
): Promise<PromptModule> {
  if (visited.has(pageId)) {
    return { sourceId: pageId, notionPageId: pageId, name: pageId, content: "", dependencies: [] };
  }
  visited.add(pageId);

  const page = await getPage(pageId);
  const name =
    extractTitle(page.properties["Name"]) ||
    extractTitle(page.properties["Module"]) ||
    pageId;

  const dependencyIds = extractRelation(page.properties["Dependencies"]) || [];
  const content = await getPageText(pageId);
  const configuredSection = extractSelect(page.properties["Section"]);
  const section = isPromptModuleSection(configuredSection)
    ? configuredSection
    : legacyPromptModuleSection(name);

  // Resolve dependencies (one level deep for MVP)
  const resolvedDeps: string[] = [];
  for (const depId of dependencyIds) {
    if (!visited.has(depId)) {
      try {
        const dep = await resolvePromptModule(depId, visited, warnings);
        resolvedDeps.push(dep.content);
      } catch (err) {
        // Non-fatal: log the failure and record a warning so operators can see it
        const msg = String(err);
        logger.warn(
          { err, depId, parentModuleId: pageId },
          "Prompt Module dependency fetch failed — dependency content dropped from compiled prompt",
        );
        // Use error classification to produce an actionable, type-specific recovery message.
        const classified = classifyNotionErr(err);
        const recommendedAction =
          classified?.code === "NOTION_RATE_LIMITED"
            ? "Notion rate-limited: wait 30 seconds and recompile — this is transient and safe to retry."
            : classified?.code === "NOTION_UNREACHABLE"
            ? "Notion is unreachable: confirm network connectivity to Notion, then recompile."
            : "Dependency page not found or access denied: verify the page exists in Notion and the integration has read access, then recompile.";
        warnings.push({
          code: "PROMPT_MODULE_DEP_FETCH_FAILED",
          field: `prompt_module_dependency:${depId}`,
          governing_rule: "CS-000 Inheritance",
          message: `Dependency module ${depId} could not be fetched and was dropped from the compiled prompt: ${msg}`,
          recommended_action: recommendedAction,
        });
      }
    }
  }

  // Prepend dependency content to this module's content
  const fullContent = [...resolvedDeps, content].filter(Boolean).join("\n\n");

  return { sourceId: pageId, notionPageId: pageId, name, section, content: fullContent, dependencies: dependencyIds };
}

// ── Canon Records ─────────────────────────────────────────────────────────────

async function resolveCanonRecord(pageId: string): Promise<CanonRecord> {
  const page = await getPage(pageId);
  const name =
    extractTitle(page.properties["Name"]) ||
    extractTitle(page.properties["Canon Record"]) ||
    pageId;
  const status =
    extractSelect(page.properties["Status"]) ||
    extractSelect(page.properties["Canon Status"]) ||
    "Unknown";
  return { sourceId: pageId, notionPageId: pageId, name, status };
}

// ── Error classification helper ───────────────────────────────────────────────

/**
 * Classify a raw error thrown by the Notion client into one of three buckets:
 *  - NOTION_RATE_LIMITED  (HTTP 429 or rate-limit language in the message)
 *  - NOTION_UNREACHABLE   (AbortError, ETIMEDOUT, ECONNREFUSED, etc.)
 *  - null                 (genuine 404 / page-not-found or unknown)
 *
 * Returns the error code string and its retryable flag, or null when the
 * error should fall through to the caller's generic "_NOT_FOUND" code.
 */
function classifyNotionErr(
  err: unknown,
): { code: "NOTION_RATE_LIMITED" | "NOTION_UNREACHABLE"; retryable: true } | null {
  const msg = String(err);
  const name = err instanceof Error ? err.name : "";

  if (/429|rate.?limit/i.test(msg)) {
    return { code: "NOTION_RATE_LIMITED", retryable: true };
  }
  if (
    name === "AbortError" ||
    /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|network|timeout|unreachable/i.test(msg)
  ) {
    return { code: "NOTION_UNREACHABLE", retryable: true };
  }
  return null;
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export class InheritanceError extends Error {
  constructor(
    message: string,
    public readonly stage: string,
    public readonly errorCode: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "InheritanceError";
  }
}

export async function resolveInheritanceChain(pageId: string): Promise<InheritanceChain> {
  const resolvedSourceIds: Record<string, string | string[]> = {};

  // ── Stage 2: Fetch Production Specification ──────────────────────────────
  let page: NotionPage;
  try {
    page = await getPage(pageId);
  } catch (err) {
    const msg = String(err);
    const errName = (err instanceof Error) ? err.name : "";
    // Distinguish error classes so callers can react appropriately
    if (/429|rate.?limit/i.test(msg)) {
      throw new InheritanceError(
        `Notion rate-limited while fetching Production Specification (page ${pageId}): ${msg}`,
        "fetch_production_spec",
        "NOTION_RATE_LIMITED",
        true,
      );
    }
    if (
      errName === "AbortError" ||
      /ETIMEDOUT|ENOTFOUND|ECONNREFUSED|ECONNRESET|network|timeout|unreachable/i.test(msg)
    ) {
      throw new InheritanceError(
        `Notion is unreachable while fetching Production Specification (page ${pageId}): ${msg}`,
        "fetch_production_spec",
        "NOTION_UNREACHABLE",
        true,
      );
    }
    throw new InheritanceError(
      `Failed to fetch Production Specification (Notion page ${pageId}): ${msg}`,
      "fetch_production_spec",
      "NOTION_PAGE_NOT_FOUND",
      true,
    );
  }

  const productionSpec = extractProductionSpec(page);
  resolvedSourceIds["production_spec"] = pageId;

  // ── Stage 2b: Resolve linked Collection record name ──────────────────────
  // When Collection is stored as a Notion relation (collectionId is set) the
  // inline extractRichText / extractSelect calls above return nothing — the
  // only value captured is the relation page ID.  Follow up with a getPage
  // call to read the Collection record's title into spec.collection so it is
  // available for prompt compilation and the ProvenanceRecord.
  if (productionSpec.collectionId && !productionSpec.collection) {
    try {
      const collectionPage = await getCachedPage(productionSpec.collectionId);
      resolvedSourceIds["collection"] = productionSpec.collectionId;
      const collectionName =
        extractTitle(collectionPage.properties["Name"]) ||
        extractTitle(collectionPage.properties["Collection"]) ||
        extractRichText(collectionPage.properties["Name"]);
      if (collectionName) {
        productionSpec.collection = collectionName;
      }
    } catch (err) {
      // Non-fatal: a missing collection name does not block compilation.
      // Log it so operators can investigate, then continue.
      logger.warn(
        { err, collectionId: productionSpec.collectionId },
        "WorldSmith: Could not resolve linked Collection page — collection name will be blank in provenance",
      );
    }
  }

  // ── Stage 2c: Resolve linked World record name ───────────────────────────
  // When World is stored as a Notion relation the inline extractRichText /
  // extractSelect calls return nothing — only the relation page ID was
  // captured.  Follow up with a getPage call to read the World record's
  // title so it is available for prompt compilation and the ProvenanceRecord.
  if (productionSpec.worldId && !productionSpec.world) {
    try {
      const worldPage = await getCachedPage(productionSpec.worldId);
      resolvedSourceIds["world"] = productionSpec.worldId;
      const worldName =
        extractTitle(worldPage.properties["Name"]) ||
        extractTitle(worldPage.properties["World"]) ||
        extractRichText(worldPage.properties["Name"]);
      if (worldName) {
        productionSpec.world = worldName;
      }
    } catch (err) {
      // Non-fatal: a missing world name does not block compilation.
      // Log it so operators can investigate, then continue.
      logger.warn(
        { err, worldId: productionSpec.worldId },
        "WorldSmith: Could not resolve linked World page — world name will be blank in provenance",
      );
    }
  }

  // ── Stage 2d: Resolve linked Volume record name ──────────────────────────
  // When Volume is stored as a Notion relation the inline extractRichText /
  // extractSelect calls return nothing — only the relation page ID was
  // captured.  Follow up with a getPage call to read the Volume record's
  // title so it is available for prompt compilation and the ProvenanceRecord.
  if (productionSpec.volumeId && !productionSpec.volume) {
    try {
      const volumePage = await getCachedPage(productionSpec.volumeId);
      resolvedSourceIds["volume"] = productionSpec.volumeId;
      const volumeName =
        extractTitle(volumePage.properties["Name"]) ||
        extractTitle(volumePage.properties["Volume"]) ||
        extractRichText(volumePage.properties["Name"]);
      if (volumeName) {
        productionSpec.volume = volumeName;
      }
    } catch (err) {
      // Non-fatal: a missing volume name does not block compilation.
      // Log it so operators can investigate, then continue.
      logger.warn(
        { err, volumeId: productionSpec.volumeId },
        "WorldSmith: Could not resolve linked Volume page — volume name will be blank in provenance",
      );
    }
  }

  // ── Stage 3a: Validate core identity ────────────────────────────────────
  if (!productionSpec.world) {
    throw new InheritanceError(
      "Production Specification is missing required field: World.",
      "resolve_world",
      "MISSING_WORLD",
      false,
    );
  }

  if (!productionSpec.componentType) {
    throw new InheritanceError(
      "Production Specification is missing required field: Component Type.",
      "resolve_component_type",
      "MISSING_COMPONENT_TYPE",
      false,
    );
  }

  // ── Stage 3a-ii: Resolve linked Prompt Payload record ───────────────────
  // If the Production Spec links to a Prompt Payload page via a relation,
  // fetch it and read Payload Version from that record — falling back to any
  // value already extracted inline from the Production Spec itself.
  if (productionSpec.promptPayloadId && !productionSpec.payloadVersion) {
    try {
      const payloadPage = await getPage(productionSpec.promptPayloadId);
      resolvedSourceIds["prompt_payload"] = productionSpec.promptPayloadId;
      const pp = payloadPage.properties;
      // Log all property keys so we can see what's actually on the page
      logger.info({ promptPayloadId: productionSpec.promptPayloadId, propertyKeys: Object.keys(pp) }, "WorldSmith: Prompt Payload page properties");
      const versionFromPayload =
        extractSelect(pp["Payload Version"]) ||
        extractRichText(pp["Payload Version"]) ||
        extractSelect(pp["Version"]) ||
        extractRichText(pp["Version"]);
      if (versionFromPayload) {
        productionSpec.payloadVersion = versionFromPayload;
      }
    } catch (err) {
      const classified = classifyNotionErr(err);
      throw new InheritanceError(
        `Failed to resolve Prompt Payload record (${productionSpec.promptPayloadId}): ${String(err)}`,
        "resolve_prompt_payload",
        classified?.code ?? "PROMPT_PAYLOAD_NOT_FOUND",
        classified?.retryable ?? true,
      );
    }
  }

  if (!productionSpec.payloadVersion) {
    throw new InheritanceError(
      "Payload Version is blank. Set it to PP-1.0 on the linked Prompt Payload record (or directly on the Production Specification if no Prompt Payload is linked).",
      "validate_payload_version",
      "MISSING_PAYLOAD_VERSION",
      false,
    );
  }

  // ── Stage 3b: Resolve Style Guide ────────────────────────────────────────
  let styleGuide: StyleGuide | undefined;
  if (productionSpec.styleGuideId) {
    try {
      styleGuide = await resolveStyleGuide(productionSpec.styleGuideId);
      resolvedSourceIds["style_guide"] = productionSpec.styleGuideId;
    } catch (err) {
      const classified = classifyNotionErr(err);
      throw new InheritanceError(
        `Failed to resolve Style Guide (${productionSpec.styleGuideId}): ${String(err)}`,
        "resolve_style_guide",
        classified?.code ?? "STYLE_GUIDE_NOT_FOUND",
        classified?.retryable ?? true,
      );
    }
  }

  // ── Stage 3c: Resolve Component Specification ────────────────────────────
  let componentSpec: ComponentSpec | undefined;
  if (productionSpec.componentSpecificationId) {
    try {
      componentSpec = await resolveComponentSpec(productionSpec.componentSpecificationId);
      resolvedSourceIds["component_spec"] = productionSpec.componentSpecificationId;
    } catch (err) {
      const classified = classifyNotionErr(err);
      throw new InheritanceError(
        `Failed to resolve Component Specification (${productionSpec.componentSpecificationId}): ${String(err)}`,
        "resolve_component_spec",
        classified?.code ?? "COMPONENT_SPEC_NOT_FOUND",
        classified?.retryable ?? true,
      );
    }
  }

  // ── Stage 3d: Resolve Prompt Modules ────────────────────────────────────
  const promptModules: PromptModule[] = [];
  const visitedModules = new Set<string>();
  const inheritanceWarnings: ValidationError[] = [];
  for (const modId of productionSpec.promptModuleIds) {
    try {
      const mod = await resolvePromptModule(modId, visitedModules, inheritanceWarnings);
      promptModules.push(mod);
    } catch (err) {
      const classified = classifyNotionErr(err);
      throw new InheritanceError(
        `Failed to resolve Prompt Module (${modId}): ${String(err)}`,
        "resolve_prompt_modules",
        classified?.code ?? "PROMPT_MODULE_NOT_FOUND",
        classified?.retryable ?? true,
      );
    }
  }
  if (productionSpec.promptModuleIds.length > 0) {
    resolvedSourceIds["prompt_modules"] = productionSpec.promptModuleIds;
  }

  // ── Stage 3e: Resolve Canon Records ─────────────────────────────────────
  const canonRecords: CanonRecord[] = [];
  for (const recId of productionSpec.canonRecordIds) {
    try {
      const rec = await resolveCanonRecord(recId);
      canonRecords.push(rec);
    } catch (err) {
      const classified = classifyNotionErr(err);
      throw new InheritanceError(
        `Failed to resolve Canon Record (${recId}): ${String(err)}`,
        "resolve_canon_records",
        classified?.code ?? "CANON_RECORD_NOT_FOUND",
        classified?.retryable ?? true,
      );
    }
  }
  if (productionSpec.canonRecordIds.length > 0) {
    resolvedSourceIds["canon_records"] = productionSpec.canonRecordIds;
  }

  return {
    productionSpec,
    styleGuide,
    componentSpec,
    promptModules,
    canonRecords,
    resolvedSourceIds,
    warnings: inheritanceWarnings,
  };
}

// ── Local Editorial resolver ──────────────────────────────────────────────────

function localDependencyError(
  message: string,
  stage: string,
  errorCode: string,
): InheritanceError {
  return new InheritanceError(message, stage, errorCode, false);
}

/**
 * Resolve the authored Editorial Suite records that define a compilation.
 *
 * The result deliberately matches the existing Notion resolver contract so the
 * validator and compiler can consume either source. `sourceId` always contains
 * the local record ID for this path; `notionPageId` is populated only when a
 * record has been published to Notion.
 */
export async function resolveInheritanceChainLocal(specId: string): Promise<InheritanceChain> {
  const [localSpec] = await db
    .select()
    .from(wsProductionSpecsTable)
    .where(eq(wsProductionSpecsTable.id, specId))
    .limit(1);

  if (!localSpec) {
    throw localDependencyError(
      `Local Production Specification ${specId} was not found.`,
      "fetch_production_spec",
      "LOCAL_SPEC_NOT_FOUND",
    );
  }

  const [world] = await db
    .select()
    .from(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, localSpec.worldId))
    .limit(1);
  if (!world) {
    throw localDependencyError(
      `Local Production Specification ${specId} points to missing world ${localSpec.worldId}.`,
      "resolve_world",
      "LOCAL_WORLD_NOT_FOUND",
    );
  }

  const resolvedSourceIds: Record<string, string | string[]> = {
    production_spec: localSpec.id,
    world: world.id,
  };
  const warnings: ValidationError[] = [];

  let collectionName: string | undefined;
  if (localSpec.collectionId) {
    const [collection] = await db
      .select()
      .from(wsCollectionsTable)
      .where(eq(wsCollectionsTable.id, localSpec.collectionId))
      .limit(1);
    if (!collection || collection.worldId !== localSpec.worldId) {
      throw localDependencyError(
        `Local Collection ${localSpec.collectionId} is missing or belongs to a different world.`,
        "resolve_collection",
        "LOCAL_COLLECTION_NOT_FOUND",
      );
    }
    collectionName = collection.name;
    resolvedSourceIds.collection = collection.id;
  }

  let volumeName: string | undefined;
  if (localSpec.volumeId) {
    const [volume] = await db
      .select()
      .from(wsVolumesTable)
      .where(eq(wsVolumesTable.id, localSpec.volumeId))
      .limit(1);
    if (!volume || volume.worldId !== localSpec.worldId) {
      throw localDependencyError(
        `Local Volume ${localSpec.volumeId} is missing or belongs to a different world.`,
        "resolve_volume",
        "LOCAL_VOLUME_NOT_FOUND",
      );
    }
    volumeName = volume.name;
    resolvedSourceIds.volume = volume.id;
  }

  if (!localSpec.componentType) {
    throw localDependencyError(
      "Local Production Specification is missing required field: Component Type.",
      "resolve_component_type",
      "MISSING_COMPONENT_TYPE",
    );
  }
  if (!localSpec.payloadVersion) {
    throw localDependencyError(
      "Local Production Specification is missing required field: Payload Version.",
      "validate_payload_version",
      "MISSING_PAYLOAD_VERSION",
    );
  }

  const productionSpec: ProductionSpec = {
    sourceId: localSpec.id,
    notionPageId: localSpec.notionPageId ?? undefined,
    productionItem: localSpec.productionItem,
    specId: localSpec.specId ?? localSpec.id,
    componentType: localSpec.componentType,
    componentSet: localSpec.componentSet ?? undefined,
    heroFamily: localSpec.heroFamily ?? undefined,
    world: world.name,
    worldId: world.id,
    collection: collectionName,
    collectionId: localSpec.collectionId ?? undefined,
    volume: volumeName,
    volumeId: localSpec.volumeId ?? undefined,
    currentVersion: localSpec.currentVersion,
    designIntent: localSpec.designIntent,
    narrativePurpose: localSpec.narrativePurpose,
    requiredContent: localSpec.requiredContent,
    reviewCriteria: localSpec.reviewCriteria,
    writingSpacePercent: localSpec.writingSpacePercent ?? undefined,
    orientation: localSpec.orientation ?? undefined,
    frontBackStyle: localSpec.frontBackStyle ?? undefined,
    payloadVersion: localSpec.payloadVersion,
    promptPayload: localSpec.promptPayload,
    componentSpecificationId: localSpec.componentSpecId ?? undefined,
    styleGuideId: localSpec.styleGuideId ?? undefined,
    promptModuleIds: localSpec.promptModuleIds,
    canonDependency: localSpec.canonDependency,
    canonRecordIds: localSpec.canonRecordIds,
    status: localSpec.status,
    compiledPromptStatus: localSpec.compiledPromptStatus,
  };

  let styleGuide: StyleGuide | undefined;
  if (localSpec.styleGuideId) {
    const [row] = await db
      .select()
      .from(wsStyleGuidesTable)
      .where(eq(wsStyleGuidesTable.id, localSpec.styleGuideId))
      .limit(1);
    if (!row || row.worldId !== localSpec.worldId) {
      throw localDependencyError(
        `Local Style Guide ${localSpec.styleGuideId} is missing or belongs to a different world.`,
        "resolve_style_guide",
        "LOCAL_STYLE_GUIDE_NOT_FOUND",
      );
    }
    styleGuide = {
      sourceId: row.id,
      notionPageId: row.notionPageId ?? undefined,
      name: row.name,
      content: row.content,
    };
    resolvedSourceIds.style_guide = row.id;
  }

  let componentSpec: ComponentSpec | undefined;
  if (localSpec.componentSpecId) {
    const [row] = await db
      .select()
      .from(wsComponentSpecsTable)
      .where(eq(wsComponentSpecsTable.id, localSpec.componentSpecId))
      .limit(1);
    if (!row || row.worldId !== localSpec.worldId) {
      throw localDependencyError(
        `Local Component Specification ${localSpec.componentSpecId} is missing or belongs to a different world.`,
        "resolve_component_spec",
        "LOCAL_COMPONENT_SPEC_NOT_FOUND",
      );
    }
    componentSpec = {
      sourceId: row.id,
      notionPageId: row.notionPageId ?? undefined,
      name: row.name,
      content: row.content,
      componentType: row.componentType,
    };
    resolvedSourceIds.component_spec = row.id;
  }

  const visitedModules = new Set<string>();
  async function resolveLocalPromptModule(moduleId: string): Promise<PromptModule> {
    if (visitedModules.has(moduleId)) {
      return { sourceId: moduleId, name: moduleId, section: "general", content: "", dependencies: [] };
    }
    visitedModules.add(moduleId);

    const [row] = await db
      .select()
      .from(wsPromptModulesTable)
      .where(eq(wsPromptModulesTable.id, moduleId))
      .limit(1);
    if (!row || row.worldId !== localSpec.worldId) {
      throw localDependencyError(
        `Local Prompt Module ${moduleId} is missing or belongs to a different world.`,
        "resolve_prompt_modules",
        "LOCAL_PROMPT_MODULE_NOT_FOUND",
      );
    }

    const dependencyContent: string[] = [];
    for (const dependencyId of row.dependencyIds) {
      try {
        const dependency = await resolveLocalPromptModule(dependencyId);
        if (dependency.content) dependencyContent.push(dependency.content);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push({
          code: "PROMPT_MODULE_DEP_FETCH_FAILED",
          field: `prompt_module_dependency:${dependencyId}`,
          governing_rule: "CS-000 Inheritance",
          message: `Local dependency module ${dependencyId} could not be resolved and was dropped from the compiled prompt: ${message}`,
          recommended_action: "Restore the local dependency or remove the dependency link, then compile again.",
        });
      }
    }

    return {
      sourceId: row.id,
      notionPageId: row.notionPageId ?? undefined,
      name: row.name,
      section: isPromptModuleSection(row.section) ? row.section : "general",
      content: [...dependencyContent, row.content].filter(Boolean).join("\n\n"),
      dependencies: row.dependencyIds,
    };
  }

  const promptModules: PromptModule[] = [];
  for (const moduleId of localSpec.promptModuleIds) {
    promptModules.push(await resolveLocalPromptModule(moduleId));
  }
  if (localSpec.promptModuleIds.length > 0) {
    resolvedSourceIds.prompt_modules = localSpec.promptModuleIds;
  }

  const canonRecords: CanonRecord[] = [];
  for (const recordId of localSpec.canonRecordIds) {
    const [row] = await db
      .select()
      .from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, recordId))
      .limit(1);
    if (!row || row.worldId !== localSpec.worldId) {
      throw localDependencyError(
        `Local Canon Record ${recordId} is missing or belongs to a different world.`,
        "resolve_canon_records",
        "LOCAL_CANON_RECORD_NOT_FOUND",
      );
    }
    canonRecords.push({
      sourceId: row.id,
      notionPageId: row.notionPageId ?? undefined,
      name: row.name,
      status: row.status,
      narrativeDetails: row.narrativeDetails,
      historicalContext: row.historicalContext,
      visualNotes: row.visualNotes,
      emotionalRegister: row.emotionalRegister,
      sensoryClauses: row.sensoryClauses,
      notes: row.notes,
    });
  }
  if (localSpec.canonRecordIds.length > 0) {
    resolvedSourceIds.canon_records = localSpec.canonRecordIds;
  }

  return {
    productionSpec,
    styleGuide,
    componentSpec,
    promptModules,
    canonRecords,
    resolvedSourceIds,
    warnings,
  };
}

/**
 * Resolve a local Editorial Suite spec together with its required World Bible
 * grounding. Local compilation and preview generation must use this entry point
 * so unpublished records never produce an ungrounded result.
 */
export async function resolveInheritanceChainLocalWithWorldBible(
  specId: string,
): Promise<InheritanceChain> {
  const chain = await resolveInheritanceChainLocal(specId);
  const worldId = chain.productionSpec.worldId;

  if (!worldId) {
    throw localDependencyError(
      "The local Production Specification has no world ID, so World Bible grounding cannot be resolved.",
      "resolve_world_bible",
      "WORLD_BIBLE_WORLD_ID_MISSING",
    );
  }

  let worldBibleRow: {
    visualPalette: string | null;
    proseVoice: string | null;
    atmosphericNotes: string | null;
    materialWorld: string | null;
    worldRules: string[] | null;
  } | undefined;
  try {
    [worldBibleRow] = await db
      .select({
        visualPalette: worldsmithWorldsTable.visualPalette,
        proseVoice: worldsmithWorldsTable.proseVoice,
        atmosphericNotes: worldsmithWorldsTable.atmosphericNotes,
        materialWorld: worldsmithWorldsTable.materialWorld,
        worldRules: worldsmithWorldsTable.worldRules,
      })
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, worldId))
      .limit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw localDependencyError(
      `World Bible fields could not be fetched for local world "${worldId}": ${message}. Compilation was blocked to avoid producing an ungrounded prompt.`,
      "resolve_world_bible",
      "WORLD_BIBLE_FETCH_ERROR",
    );
  }

  if (!worldBibleRow) {
    throw localDependencyError(
      `The World Bible record for local world "${worldId}" was not found. Compilation was blocked to avoid producing an ungrounded prompt.`,
      "resolve_world_bible",
      "WORLD_BIBLE_NOT_FOUND",
    );
  }

  return {
    ...chain,
    worldBible: {
      visualPalette: worldBibleRow.visualPalette,
      proseVoice: worldBibleRow.proseVoice,
      atmosphericNotes: worldBibleRow.atmosphericNotes,
      materialWorld: worldBibleRow.materialWorld,
      worldRules: worldBibleRow.worldRules ?? [],
    },
  };
}

/**
 * Resolve only the immutable local specification identity and its mandatory
 * World Bible. Preview boards consume persisted compiler records for all
 * authored content, so they must not re-resolve mutable inheritance links.
 */
export async function resolveLocalPreviewContextWithWorldBible(
  specId: string,
): Promise<{ productionSpec: ProductionSpec; worldBible: WorldBible }> {
  const [localSpec] = await db
    .select()
    .from(wsProductionSpecsTable)
    .where(eq(wsProductionSpecsTable.id, specId))
    .limit(1);
  if (!localSpec) {
    throw localDependencyError(
      `Local Production Specification ${specId} was not found.`,
      "fetch_production_spec",
      "LOCAL_SPEC_NOT_FOUND",
    );
  }

  let world: {
    id: string;
    name: string;
    visualPalette: string | null;
    proseVoice: string | null;
    atmosphericNotes: string | null;
    materialWorld: string | null;
    worldRules: string[] | null;
  } | undefined;
  try {
    [world] = await db
      .select({
        id: worldsmithWorldsTable.id,
        name: worldsmithWorldsTable.name,
        visualPalette: worldsmithWorldsTable.visualPalette,
        proseVoice: worldsmithWorldsTable.proseVoice,
        atmosphericNotes: worldsmithWorldsTable.atmosphericNotes,
        materialWorld: worldsmithWorldsTable.materialWorld,
        worldRules: worldsmithWorldsTable.worldRules,
      })
      .from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, localSpec.worldId))
      .limit(1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw localDependencyError(
      `World Bible fields could not be fetched for local world "${localSpec.worldId}": ${message}. Preview generation was blocked to avoid producing an ungrounded board.`,
      "resolve_world_bible",
      "WORLD_BIBLE_FETCH_ERROR",
    );
  }
  if (!world) {
    throw localDependencyError(
      `The World Bible record for local world "${localSpec.worldId}" was not found. Preview generation was blocked to avoid producing an ungrounded board.`,
      "resolve_world_bible",
      "WORLD_BIBLE_NOT_FOUND",
    );
  }

  return {
    productionSpec: {
      sourceId: localSpec.id,
      notionPageId: localSpec.notionPageId ?? undefined,
      productionItem: localSpec.productionItem,
      specId: localSpec.specId ?? localSpec.id,
      componentType: localSpec.componentType,
      componentSet: localSpec.componentSet ?? undefined,
      heroFamily: localSpec.heroFamily ?? undefined,
      world: world.name,
      worldId: world.id,
      collectionId: localSpec.collectionId ?? undefined,
      volumeId: localSpec.volumeId ?? undefined,
      currentVersion: localSpec.currentVersion,
      designIntent: localSpec.designIntent,
      narrativePurpose: localSpec.narrativePurpose,
      requiredContent: localSpec.requiredContent,
      reviewCriteria: localSpec.reviewCriteria,
      writingSpacePercent: localSpec.writingSpacePercent ?? undefined,
      orientation: localSpec.orientation ?? undefined,
      frontBackStyle: localSpec.frontBackStyle ?? undefined,
      payloadVersion: localSpec.payloadVersion ?? "PP-2.0",
      promptPayload: localSpec.promptPayload,
      componentSpecificationId: localSpec.componentSpecId ?? undefined,
      styleGuideId: localSpec.styleGuideId ?? undefined,
      promptModuleIds: localSpec.promptModuleIds,
      canonDependency: localSpec.canonDependency,
      canonRecordIds: localSpec.canonRecordIds,
      status: localSpec.status,
      compiledPromptStatus: localSpec.compiledPromptStatus,
    },
    worldBible: {
      visualPalette: world.visualPalette,
      proseVoice: world.proseVoice,
      atmosphericNotes: world.atmosphericNotes,
      materialWorld: world.materialWorld,
      worldRules: world.worldRules ?? [],
    },
  };
}
