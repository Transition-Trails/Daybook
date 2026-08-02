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
  CanonRecord,
  InheritanceChain,
} from "./types";

const PRODUCTION_SPEC_DB = () => process.env.NOTION_PRODUCTION_SPEC_DB_ID ?? "";
const VISUAL_ASSETS_DB = () => process.env.NOTION_VISUAL_ASSETS_DB_ID ?? "";
const CANON_DB = () => process.env.NOTION_CANON_DB_ID ?? "";
const STYLE_GUIDES_DB = () => process.env.NOTION_STYLE_GUIDES_DB_ID ?? "";

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

  const world =
    extractRichText(p["World"]) ||
    extractSelect(p["World"]) ||
    extractRelation(p["World"])?.[0] ||
    "";

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
    notionPageId: page.id,
    productionItem,
    specId,
    componentType,
    componentSet,
    heroFamily,
    world,
    volume,
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
  return { notionPageId: pageId, name, content };
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
  return { notionPageId: pageId, name, content, componentType };
}

// ── Prompt Module ─────────────────────────────────────────────────────────────

async function resolvePromptModule(pageId: string, visited = new Set<string>()): Promise<PromptModule> {
  if (visited.has(pageId)) {
    return { notionPageId: pageId, name: pageId, content: "", dependencies: [] };
  }
  visited.add(pageId);

  const page = await getPage(pageId);
  const name =
    extractTitle(page.properties["Name"]) ||
    extractTitle(page.properties["Module"]) ||
    pageId;

  const dependencyIds = extractRelation(page.properties["Dependencies"]) || [];
  const content = await getPageText(pageId);

  // Resolve dependencies (one level deep for MVP)
  const resolvedDeps: string[] = [];
  for (const depId of dependencyIds) {
    if (!visited.has(depId)) {
      try {
        const dep = await resolvePromptModule(depId, visited);
        resolvedDeps.push(dep.content);
      } catch {
        // Non-fatal: log dependency resolution failure as a warning
      }
    }
  }

  // Prepend dependency content to this module's content
  const fullContent = [...resolvedDeps, content].filter(Boolean).join("\n\n");

  return { notionPageId: pageId, name, content: fullContent, dependencies: dependencyIds };
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
  return { notionPageId: pageId, name, status };
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

  if (!productionSpec.payloadVersion) {
    throw new InheritanceError(
      "Payload Version is blank. Set it to PP-1.0 in the Production Specification.",
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
      throw new InheritanceError(
        `Failed to resolve Style Guide (${productionSpec.styleGuideId}): ${String(err)}`,
        "resolve_style_guide",
        "STYLE_GUIDE_NOT_FOUND",
        true,
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
      throw new InheritanceError(
        `Failed to resolve Component Specification (${productionSpec.componentSpecificationId}): ${String(err)}`,
        "resolve_component_spec",
        "COMPONENT_SPEC_NOT_FOUND",
        true,
      );
    }
  }

  // ── Stage 3d: Resolve Prompt Modules ────────────────────────────────────
  const promptModules: PromptModule[] = [];
  const visitedModules = new Set<string>();
  for (const modId of productionSpec.promptModuleIds) {
    try {
      const mod = await resolvePromptModule(modId, visitedModules);
      promptModules.push(mod);
    } catch (err) {
      throw new InheritanceError(
        `Failed to resolve Prompt Module (${modId}): ${String(err)}`,
        "resolve_prompt_modules",
        "PROMPT_MODULE_NOT_FOUND",
        true,
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
      throw new InheritanceError(
        `Failed to resolve Canon Record (${recId}): ${String(err)}`,
        "resolve_canon_records",
        "CANON_RECORD_NOT_FOUND",
        true,
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
  };
}
