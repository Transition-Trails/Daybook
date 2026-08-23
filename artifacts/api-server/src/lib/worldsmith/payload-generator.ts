/**
 * PP-2.0 Payload Generator
 *
 * Generates a governed PP-2.0 Prompt Payload from an InheritanceChain.
 * Strategy: deterministic field assembly → component-type template scaffolding
 * → OpenAI synthesis → pre-save validation → Notion write-back with verification.
 */

import type { InheritanceChain, ValidationError } from "./types";
import { callAi } from "../ai-proxy";
import { validateCanonRequirements } from "./canon-validator";
import { isPlaceholder } from "./payload-parser";
import {
  getPage,
  updatePage,
  richTextProp,
  extractRichText,
} from "../notion-client";
import { logger } from "../logger";
import { editorialRichTextToPlainText } from "./editorial-rich-text";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hard cap for serialised payload length — shared by the generator, all save
 *  endpoints, and the frontend character counter so behaviour is consistent. */
export const PAYLOAD_MAX_CHARS = 10_000;

const NEXT_ACTION_AFTER_GENERATE =
  "Review the generated PP-2.0 Prompt Payload, compile the Production Specification, then generate the Specification Board.";

// ── Error codes ───────────────────────────────────────────────────────────────

export const PAYLOAD_GEN_ERROR_CODES = {
  MISSING_REQUIRED_SOURCE_FIELD: "MISSING_REQUIRED_SOURCE_FIELD",
  MISSING_STYLE_GUIDE:           "MISSING_STYLE_GUIDE",
  MISSING_COMPONENT_SPECIFICATION: "MISSING_COMPONENT_SPECIFICATION",
  MISSING_WORLD:                 "MISSING_WORLD",
  MISSING_PROMPT_MODULES:        "MISSING_PROMPT_MODULES",
  MISSING_REQUIRED_CANON:        "MISSING_REQUIRED_CANON",
  UNSUPPORTED_COMPONENT_TYPE:    "UNSUPPORTED_COMPONENT_TYPE",
  INVALID_PP2_PAYLOAD:           "INVALID_PP2_PAYLOAD",
  PAYLOAD_TOO_LARGE:             "PAYLOAD_TOO_LARGE",
  NOTION_WRITE_FAILED:           "NOTION_WRITE_FAILED",
  NOTION_PERSISTENCE_MISMATCH:   "NOTION_PERSISTENCE_MISMATCH",
  PAYLOAD_ALREADY_EXISTS:        "PAYLOAD_ALREADY_EXISTS",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerationRequirementsResult {
  canGenerate: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  /** true when warnings exist but no blocking errors — user must confirm. */
  requiresConfirmation: boolean;
}

export interface PayloadSource {
  specId: string;
  productionItem: string;
  componentType: string;
  designIntent: string;
  narrativePurpose: string;
  requiredContent: string;
  reviewCriteria: string;
  canonDependency: string;
  orientation?: string;
  frontBackStyle?: string;
  writingSpacePercent?: number;
  heroFamily?: string;
  world: string;
  volume?: string;
  collection?: string;
  // Linked record content
  styleGuideName?: string;
  styleGuideContent?: string;
  componentSpecName?: string;
  componentSpecContent?: string;
  promptModuleNames: string[];
  promptModuleContent: string;
  canonRecordNames: string[];
}

export interface PP2Sections {
  shared_prompt: string;
  front_prompt: string;
  back_prompt?: string;
  assembly_prompt?: string;
  negative_prompt: string;
}

export interface GeneratePayloadResult {
  sections: PP2Sections;
  serialized: string;
  preSaveIssues: ValidationError[];
  componentType: string;
  specId: string;
  productionItem: string;
  generatorWarnings: ValidationError[];
}

export interface SavePayloadResult {
  success: boolean;
  specId: string;
  persistenceVerified: boolean;
  mismatch?: string;
  error?: string;
  errorCode?: string;
}

export interface BatchAuditRecord {
  specId: string;
  productionItem: string;
  componentType: string;
  status: "ready" | "warning" | "blocked";
  errors: ValidationError[];
  warnings: ValidationError[];
  draft?: GeneratePayloadResult;
}

export interface BatchGenerateResult {
  worldId: string;
  totalReviewed: number;
  ready: BatchAuditRecord[];
  warning: BatchAuditRecord[];
  blocked: BatchAuditRecord[];
}

// ── Step 1: Check generation requirements ────────────────────────────────────

export function checkGenerationRequirements(
  chain: InheritanceChain,
): GenerationRequirementsResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const spec = chain.productionSpec;

  // Must be PP-2.0
  if (!spec.payloadVersion || spec.payloadVersion.trim() !== "PP-2.0") {
    errors.push({
      code: PAYLOAD_GEN_ERROR_CODES.MISSING_REQUIRED_SOURCE_FIELD,
      field: "Payload Version",
      governing_rule: "CS-000 PP-2.0",
      message: `Payload Version must be PP-2.0 (got: "${spec.payloadVersion ?? "blank"}"). This generator only creates PP-2.0 payloads.`,
      recommended_action: "Set Payload Version to PP-2.0 in the Production Specification in Notion.",
    });
  }

  // Payload must be blank
  if (spec.promptPayload?.trim()) {
    errors.push({
      code: PAYLOAD_GEN_ERROR_CODES.PAYLOAD_ALREADY_EXISTS,
      field: "Prompt Payload",
      governing_rule: "CS-000 PP-2.0",
      message: "Prompt Payload already exists and will not be overwritten. This generator only creates payloads for blank records.",
      recommended_action: "Clear the Prompt Payload in Notion if you want to regenerate from scratch, then retry.",
    });
  }

  // Required spec fields
  const requiredFields: Array<[keyof typeof spec, string]> = [
    ["productionItem", "Production Item"],
    ["componentType",  "Component Type"],
    ["designIntent",   "Design Intent"],
    ["requiredContent","Required Content"],
    ["reviewCriteria", "Review Criteria"],
  ];
  for (const [field, label] of requiredFields) {
    const val = spec[field] as string | undefined;
    if (!val?.trim()) {
      errors.push({
        code: PAYLOAD_GEN_ERROR_CODES.MISSING_REQUIRED_SOURCE_FIELD,
        field: label,
        governing_rule: "CS-000 PP-2.0",
        message: `Required field "${label}" is missing from the Production Specification.`,
        recommended_action: `Add "${label}" to the Production Specification in Notion, then retry.`,
      });
    }
  }

  // Component Specification with content
  if (!chain.componentSpec) {
    errors.push({
      code: PAYLOAD_GEN_ERROR_CODES.MISSING_COMPONENT_SPECIFICATION,
      field: "Component Specification",
      governing_rule: "CS-000 PP-2.0",
      message: "No Component Specification is linked. A Component Specification with content is required for print-rule derivation.",
      recommended_action: "Link a Component Specification record to the Production Specification in Notion.",
    });
  } else if (!chain.componentSpec.content?.trim()) {
    errors.push({
      code: PAYLOAD_GEN_ERROR_CODES.MISSING_COMPONENT_SPECIFICATION,
      field: "Component Specification",
      governing_rule: "CS-000 PP-2.0",
      message: `Component Specification "${chain.componentSpec.name}" has no content. Print-rule derivation requires body content.`,
      recommended_action: "Add content to the Component Specification page in Notion.",
    });
  }

  // Style Guide
  if (!chain.styleGuide) {
    errors.push({
      code: PAYLOAD_GEN_ERROR_CODES.MISSING_STYLE_GUIDE,
      field: "Style Guide",
      governing_rule: "CS-000 PP-2.0",
      message: "No Style Guide is linked. A Style Guide is required as the primary source for visual-language rules.",
      recommended_action: "Link a Style Guide to the Production Specification in Notion.",
    });
  } else if (!chain.styleGuide.content?.trim()) {
    errors.push({
      code: PAYLOAD_GEN_ERROR_CODES.MISSING_STYLE_GUIDE,
      field: "Style Guide",
      governing_rule: "CS-000 PP-2.0",
      message: `Style Guide "${chain.styleGuide.name}" has no content. Visual-language rules cannot be derived.`,
      recommended_action: "Add content to the Style Guide page in Notion.",
    });
  }

  // World (warning — non-blocking)
  if (!spec.world?.trim()) {
    warnings.push({
      code: PAYLOAD_GEN_ERROR_CODES.MISSING_WORLD,
      field: "World",
      governing_rule: "CS-000 PP-2.0",
      message: "No World is linked. The payload will lack world-context constraints and narrative grounding.",
      recommended_action: "Link a World record to the Production Specification.",
    });
  }

  // Prompt Modules (warning — non-blocking)
  if (chain.promptModules.length === 0) {
    warnings.push({
      code: PAYLOAD_GEN_ERROR_CODES.MISSING_PROMPT_MODULES,
      field: "Prompt Modules",
      governing_rule: "CS-000 PP-2.0",
      message: "No Prompt Modules are linked. The payload will lack style-system module constraints.",
      recommended_action: "Link Prompt Modules to the Production Specification.",
    });
  }

  // Canon dependency enforcement — delegated to the shared validator so
  // payload-generator and orchestrator always use identical rules.
  const canonResult = validateCanonRequirements(
    spec.canonDependency ?? "None",
    chain.canonRecords,
  );
  errors.push(...canonResult.errors);
  warnings.push(...canonResult.warnings);

  const canGenerate = errors.length === 0;
  const requiresConfirmation = canGenerate && warnings.length > 0;
  return { canGenerate, errors, warnings, requiresConfirmation };
}

// ── Step 2: Build source object ───────────────────────────────────────────────

export function buildSourceObject(chain: InheritanceChain): PayloadSource {
  const spec = chain.productionSpec;
  return {
    specId: spec.sourceId ?? spec.notionPageId ?? spec.specId,
    productionItem: spec.productionItem,
    componentType: spec.componentType,
    designIntent: editorialRichTextToPlainText(spec.designIntent),
    narrativePurpose: editorialRichTextToPlainText(spec.narrativePurpose),
    requiredContent: editorialRichTextToPlainText(spec.requiredContent),
    reviewCriteria: editorialRichTextToPlainText(spec.reviewCriteria),
    canonDependency: spec.canonDependency ?? "None",
    orientation: spec.orientation,
    frontBackStyle: spec.frontBackStyle,
    writingSpacePercent: spec.writingSpacePercent,
    heroFamily: spec.heroFamily,
    world: spec.world,
    volume: spec.volume,
    collection: spec.collection,
    styleGuideName: chain.styleGuide?.name,
    styleGuideContent: editorialRichTextToPlainText(chain.styleGuide?.content),
    componentSpecName: chain.componentSpec?.name,
    componentSpecContent: editorialRichTextToPlainText(chain.componentSpec?.content),
    promptModuleNames: chain.promptModules.map((m) => m.name),
    promptModuleContent: chain.promptModules
      .map((m) => editorialRichTextToPlainText(m.content))
      .filter(Boolean)
      .join("\n\n---\n\n"),
    canonRecordNames: chain.canonRecords.map((r) => r.name),
  };
}

// ── Component-type helpers ────────────────────────────────────────────────────

function needsBackPrompt(source: PayloadSource): boolean {
  const ct = source.componentType ?? "";
  const fbs = (source.frontBackStyle ?? "").toLowerCase();

  if (/journal.?card/i.test(ct)) {
    return /back|duplex|two.?sided|double/i.test(fbs);
  }
  // Coordinating Paper, Hero Paper, Ephemera Sheet — omit back
  if (/coordinating.?paper|hero.?paper|ephemera/i.test(ct)) return false;
  // Envelope / Pocket — handled via assembly_prompt
  if (/envelope|pocket/i.test(ct)) return false;

  return false;
}

function needsAssemblyPrompt(source: PayloadSource): boolean {
  return /envelope|pocket/i.test(source.componentType ?? "");
}

// ── Step 3: Template scaffolding ──────────────────────────────────────────────

function buildSharedDraft(source: PayloadSource): string {
  const parts: string[] = [
    `Asset: ${source.productionItem} — ${source.componentType}`,
  ];
  if (source.world) {
    parts.push(
      `World context: ${source.world}` +
        (source.collection ? ` / ${source.collection}` : "") +
        (source.volume ? ` / ${source.volume}` : ""),
    );
  }
  parts.push(`Design intent: ${source.designIntent}`);
  parts.push(`Narrative purpose: ${source.narrativePurpose}`);
  if (source.styleGuideContent) {
    parts.push(
      `Style Guide (${source.styleGuideName ?? ""}): ${source.styleGuideContent.slice(0, 800)}`,
    );
  }
  if (source.promptModuleContent) {
    parts.push(
      `Prompt Module constraints: ${source.promptModuleContent.slice(0, 600)}`,
    );
  }
  if (source.canonRecordNames.length > 0) {
    parts.push(`Canon records: ${source.canonRecordNames.join(", ")}`);
  }
  parts.push(`Canon dependency: ${source.canonDependency}`);
  if (source.heroFamily) parts.push(`Hero family: ${source.heroFamily}`);
  if (source.writingSpacePercent !== undefined) {
    parts.push(`Writing space: ${source.writingSpacePercent}%`);
  }
  return parts.join("\n");
}

function buildFrontDraft(source: PayloadSource): string {
  const parts: string[] = [
    `Required content: ${source.requiredContent}`,
  ];
  if (source.componentSpecContent) {
    parts.push(
      `Component specification: ${source.componentSpecContent.slice(0, 600)}`,
    );
  }
  if (source.orientation) parts.push(`Orientation: ${source.orientation}`);
  if (source.frontBackStyle)
    parts.push(`Front/back style: ${source.frontBackStyle}`);
  if (source.writingSpacePercent !== undefined) {
    parts.push(`Writing space: ${source.writingSpacePercent}%`);
  }
  return parts.join("\n");
}

function buildNegativeDraft(source: PayloadSource): string {
  const parts: string[] = [
    `Review criteria exclusions: ${source.reviewCriteria}`,
    `Canon rule: ${source.canonDependency}`,
  ];
  if (source.canonDependency === "None") {
    parts.push(
      "No invented place names, person names, species, dates, institutions, symbols, or fixed lore.",
    );
  }
  return parts.join("\n");
}

// ── Step 4: AI synthesis ──────────────────────────────────────────────────────
// Routes through the shared ai-proxy so DEFAULT_AI_PROVIDER (default: claude)
// controls which model is used — same as the rest of the platform.

async function synthesizePayloadWithAI(
  source: PayloadSource,
  draft: {
    sharedDraft: string;
    frontDraft: string;
    negativeDraft: string;
    backNeeded: boolean;
    assemblyNeeded: boolean;
  },
): Promise<PP2Sections> {
  const requiredKeys = ["shared_prompt", "front_prompt"];
  if (draft.backNeeded) requiredKeys.push("back_prompt");
  if (draft.assemblyNeeded) requiredKeys.push("assembly_prompt");
  requiredKeys.push("negative_prompt");

  const backInstructions = draft.backNeeded
    ? "\nFor back_prompt: Describe the coordinated back design — duplex alignment requirements, continuation fields, subtle pattern or texture, no unrelated focal elements. Keep it concise."
    : "";
  const assemblyInstructions = draft.assemblyNeeded
    ? "\nFor assembly_prompt: Describe flat-template assembly — panel layout, fold lines, glue tabs, seam logic, printable construction clarity, coordinated decorative placement."
    : "";

  const SYSTEM = `You are a PP-2.0 Prompt Payload generator for the WorldSmith Publishing Engine — a Victorian-themed print journal collection.
Your job: synthesize concise, print-production-ready prompt instructions from governed source data.

Rules:
- Do NOT invent facts, names, places, species, dates, events, institutions, symbols, or canon details not present in the source.
- Do NOT create new canon or introduce lore not supported by the source data.
- Do NOT use placeholder text: TBD, unknown, not specified, [placeholder], etc.
- Keep each section value to 2–5 sentences — specific, actionable, and usable by an image-generation prompt compiler.
- Output ONLY valid YAML-style key:value pairs, one per line, using exactly these keys: ${requiredKeys.join(", ")}.
- Do not add any preamble, explanation, or formatting beyond the key:value pairs.`;

  const USER = `Generate a PP-2.0 Prompt Payload for this Production Specification.

SHARED SOURCE (for shared_prompt):
${draft.sharedDraft}

FRONT SPECIFICS (for front_prompt):
${draft.frontDraft}

NEGATIVE CRITERIA (for negative_prompt):
${draft.negativeDraft}

INSTRUCTIONS BY SECTION:
For shared_prompt: One coherent paragraph covering: asset role and purpose, governing visual language (from Style Guide), palette and material character, composition principles, narrative density, canon constraints, text constraints, and print specification.
For front_prompt: One coherent paragraph covering: layout and focal hierarchy, required objects/fields/motifs/structures, writing-space requirements if applicable, crop tolerance, user functionality, front-specific text rules.${backInstructions}${assemblyInstructions}
For negative_prompt: A specific comma-separated or sentence-style list covering: Review Criteria exclusions, canon restrictions, component failure modes, text and canon restrictions, print-production risks, and common AI-generation artifacts. Must be specific to this record — not a generic list.

Output format (one per line, no blank lines between):
shared_prompt: [value]
front_prompt: [value]
${draft.backNeeded ? "back_prompt: [value]\n" : ""}${draft.assemblyNeeded ? "assembly_prompt: [value]\n" : ""}negative_prompt: [value]`;

  const provider = process.env.DEFAULT_AI_PROVIDER ?? "chatgpt";
  const aiResponse = await callAi(
    [{ role: "user", content: USER }],
    provider,
    SYSTEM,
  );
  const raw = aiResponse.content;

  // Parse AI output into sections
  const result: Partial<Record<string, string>> = {};
  const validKeys = new Set([
    "shared_prompt", "front_prompt", "back_prompt",
    "assembly_prompt", "negative_prompt",
  ]);

  let currentKey: string | null = null;
  let currentValue = "";

  const flush = () => {
    if (currentKey) {
      result[currentKey] = (result[currentKey] ?? "") + currentValue.trim();
      currentKey = null;
      currentValue = "";
    }
  };

  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) { flush(); continue; }
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const candidate = line.slice(0, colonIdx).trim().toLowerCase();
      if (validKeys.has(candidate)) {
        flush();
        currentKey = candidate;
        currentValue = line.slice(colonIdx + 1).trim();
        continue;
      }
    }
    if (currentKey) currentValue += " " + line.trim();
  }
  flush();

  // Fallbacks: if AI omitted a required section, use truncated source data
  const sharedFallback = `${source.productionItem} — ${source.componentType}. ${source.designIntent.slice(0, 250)} ${source.narrativePurpose.slice(0, 150)}`.trim();
  const frontFallback = source.requiredContent.slice(0, 300);
  const negativeFallback = source.reviewCriteria.slice(0, 300);

  return {
    shared_prompt: result["shared_prompt"]?.trim() || sharedFallback,
    front_prompt:  result["front_prompt"]?.trim()  || frontFallback,
    back_prompt:   result["back_prompt"]?.trim()   || undefined,
    assembly_prompt: result["assembly_prompt"]?.trim() || undefined,
    negative_prompt: result["negative_prompt"]?.trim() || negativeFallback,
  };
}

// ── Step 5: Serialize payload ─────────────────────────────────────────────────

export function serializePayload(sections: PP2Sections): string {
  const order: Array<keyof PP2Sections> = [
    "shared_prompt", "front_prompt", "back_prompt",
    "assembly_prompt", "negative_prompt",
  ];
  const lines: string[] = [];
  for (const key of order) {
    const val = sections[key];
    if (val?.trim()) lines.push(`${key}: ${val.trim()}`);
  }
  return lines.join("\n");
}

// ── Step 6: Pre-save validation ───────────────────────────────────────────────

export function validateGeneratedPayload(
  sections: PP2Sections,
  source: PayloadSource,
): ValidationError[] {
  const issues: ValidationError[] = [];
  const rule = `CS-000 PP-2.0 / ${source.componentType}`;

  if (!sections.shared_prompt?.trim()) {
    issues.push({
      code: PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD,
      field: "shared_prompt",
      governing_rule: rule,
      message: "shared_prompt is empty — this section is always required.",
      recommended_action: "Regenerate the payload.",
    });
  }
  if (!sections.front_prompt?.trim()) {
    issues.push({
      code: PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD,
      field: "front_prompt",
      governing_rule: rule,
      message: "front_prompt is empty — this section is always required.",
      recommended_action: "Regenerate the payload.",
    });
  }
  if (!sections.negative_prompt?.trim()) {
    issues.push({
      code: PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD,
      field: "negative_prompt",
      governing_rule: rule,
      message: "negative_prompt is empty — this section is always required.",
      recommended_action: "Regenerate the payload.",
    });
  }

  // Back prompt when required
  if (needsBackPrompt(source) && !sections.back_prompt?.trim()) {
    issues.push({
      code: PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD,
      field: "back_prompt",
      governing_rule: rule,
      message: `back_prompt is required for ${source.componentType} with Front/Back Style "${source.frontBackStyle ?? ""}".`,
      recommended_action: "Regenerate — back_prompt was expected based on Front/Back Style.",
    });
  }

  // Assembly prompt when required
  if (needsAssemblyPrompt(source) && !sections.assembly_prompt?.trim()) {
    issues.push({
      code: PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD,
      field: "assembly_prompt",
      governing_rule: rule,
      message: `assembly_prompt is required for ${source.componentType}.`,
      recommended_action: "Regenerate — assembly_prompt is required for Envelope and Pocket types.",
    });
  }

  // Placeholder check
  for (const [key, val] of Object.entries(sections) as Array<[string, string | undefined]>) {
    if (val && isPlaceholder(val)) {
      issues.push({
        code: PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD,
        field: key,
        governing_rule: rule,
        message: `"${key}" contains a placeholder value: "${val.slice(0, 40)}".`,
        recommended_action: `Replace the placeholder in ${key} or regenerate.`,
      });
    }
  }

  // Payload size
  const serialized = serializePayload(sections);
  if (serialized.length > PAYLOAD_MAX_CHARS) {
    issues.push({
      code: PAYLOAD_GEN_ERROR_CODES.PAYLOAD_TOO_LARGE,
      field: "Prompt Payload",
      governing_rule: rule,
      message: `Generated payload is ${serialized.length.toLocaleString()} chars — exceeds the ${PAYLOAD_MAX_CHARS.toLocaleString()} char limit.`,
      recommended_action: "Shorten each section value and regenerate.",
    });
  }

  return issues;
}

// ── Server-side save validation ───────────────────────────────────────────────

/**
 * Parse a serialised PP-2.0 payload string and validate its section structure.
 * Used by save endpoints so that operator edits to the raw text are still
 * validated before reaching Notion.  Does NOT require the originating source
 * object — only the text and the invariants that hold for every PP-2.0 record.
 */
export function parseAndValidateSerializedPayload(serialized: string): {
  sections: PP2Sections | null;
  issues: ValidationError[];
} {
  const issues: ValidationError[] = [];
  const rule = "CS-000 PP-2.0";

  // Size guard (same threshold as the generator)
  if (serialized.length > PAYLOAD_MAX_CHARS) {
    issues.push({
      code: PAYLOAD_GEN_ERROR_CODES.PAYLOAD_TOO_LARGE,
      field: "Prompt Payload",
      governing_rule: rule,
      message: `Payload is ${serialized.length.toLocaleString()} chars — exceeds the ${PAYLOAD_MAX_CHARS.toLocaleString()} char limit.`,
      recommended_action: "Shorten each section value before saving.",
    });
  }

  // Parse section keys using the same YAML-style parser logic
  const valid = new Set(["shared_prompt", "front_prompt", "back_prompt", "assembly_prompt", "negative_prompt"]);
  const parsed: Partial<Record<string, string>> = {};

  let currentKey: string | null = null;
  let currentValue = "";

  const flush = () => {
    if (currentKey) {
      parsed[currentKey] = ((parsed[currentKey] ?? "") + " " + currentValue).trim();
      currentKey = null;
      currentValue = "";
    }
  };

  for (const line of serialized.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) { flush(); continue; }
    if ((line.startsWith(" ") || line.startsWith("\t")) && currentKey) {
      currentValue += " " + line.trim();
      continue;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const candidate = line.slice(0, colonIdx).trim().toLowerCase();
      if (valid.has(candidate)) {
        flush();
        currentKey = candidate;
        currentValue = line.slice(colonIdx + 1).trim();
        continue;
      }
    }
    if (currentKey) currentValue += " " + line.trim();
  }
  flush();

  // Required sections
  for (const key of ["shared_prompt", "front_prompt", "negative_prompt"] as const) {
    if (!parsed[key]?.trim()) {
      issues.push({
        code: PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD,
        field: key,
        governing_rule: rule,
        message: `Required section "${key}" is missing or empty.`,
        recommended_action: `Add a "${key}: ..." line to the payload before saving.`,
      });
    }
  }

  // Placeholder check across all present sections
  for (const [key, val] of Object.entries(parsed)) {
    if (val && isPlaceholder(val)) {
      issues.push({
        code: PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD,
        field: key,
        governing_rule: rule,
        message: `Section "${key}" contains a placeholder value: "${val.slice(0, 40)}".`,
        recommended_action: `Replace the placeholder in "${key}" before saving.`,
      });
    }
  }

  const hasBlockingIssues = issues.some(
    (i) => i.code === PAYLOAD_GEN_ERROR_CODES.INVALID_PP2_PAYLOAD || i.code === PAYLOAD_GEN_ERROR_CODES.PAYLOAD_TOO_LARGE,
  );

  const sections: PP2Sections | null = hasBlockingIssues ? null : {
    shared_prompt:   parsed["shared_prompt"]!,
    front_prompt:    parsed["front_prompt"]!,
    back_prompt:     parsed["back_prompt"] || undefined,
    assembly_prompt: parsed["assembly_prompt"] || undefined,
    negative_prompt: parsed["negative_prompt"]!,
  };

  return { sections, issues };
}

// ── Main generate function ────────────────────────────────────────────────────

export async function generatePayloadDraft(
  chain: InheritanceChain,
): Promise<GeneratePayloadResult> {
  const source = buildSourceObject(chain);
  const backNeeded = needsBackPrompt(source);
  const assemblyNeeded = needsAssemblyPrompt(source);

  const sections = await synthesizePayloadWithAI(source, {
    sharedDraft:    buildSharedDraft(source),
    frontDraft:     buildFrontDraft(source),
    negativeDraft:  buildNegativeDraft(source),
    backNeeded,
    assemblyNeeded,
  });

  const serialized = serializePayload(sections);
  const preSaveIssues = validateGeneratedPayload(sections, source);

  return {
    sections,
    serialized,
    preSaveIssues,
    componentType: source.componentType,
    specId: source.specId,
    productionItem: source.productionItem,
    generatorWarnings: [],
  };
}

// ── Notion write-back ─────────────────────────────────────────────────────────

export async function writePayloadToNotion(
  specId: string,
  serialized: string,
): Promise<SavePayloadResult> {
  // Safety: never overwrite an existing payload
  let currentPayload: string;
  try {
    const page = await getPage(specId);
    currentPayload =
      extractRichText(page.properties["Prompt Payload"]) ||
      extractRichText(page.properties["Payload"]) ||
      "";
  } catch (err) {
    return {
      success: false,
      specId,
      persistenceVerified: false,
      error: `Could not read current Prompt Payload before writing: ${String(err)}`,
      errorCode: PAYLOAD_GEN_ERROR_CODES.NOTION_WRITE_FAILED,
    };
  }

  if (currentPayload.trim()) {
    return {
      success: false,
      specId,
      persistenceVerified: false,
      error: "Prompt Payload is already populated — refusing to overwrite.",
      errorCode: PAYLOAD_GEN_ERROR_CODES.PAYLOAD_ALREADY_EXISTS,
    };
  }

  // Write only Prompt Payload + Next Action
  try {
    await updatePage(specId, {
      "Prompt Payload": richTextProp(serialized),
      "Next Action":    richTextProp(NEXT_ACTION_AFTER_GENERATE),
    });
  } catch (err) {
    return {
      success: false,
      specId,
      persistenceVerified: false,
      error: `Notion write failed: ${String(err)}`,
      errorCode: PAYLOAD_GEN_ERROR_CODES.NOTION_WRITE_FAILED,
    };
  }

  // Re-fetch and verify persistence
  try {
    const refetched = await getPage(specId);
    const saved =
      extractRichText(refetched.properties["Prompt Payload"]) ||
      extractRichText(refetched.properties["Payload"]) ||
      "";

    const normalise = (s: string) => s.replace(/\s+/g, " ").trim();
    const match = normalise(saved) === normalise(serialized);

    if (!match) {
      logger.warn(
        { specId, savedLen: saved.length, submittedLen: serialized.length },
        "PayloadGenerator: persistence mismatch after write",
      );
      return {
        success: true,
        specId,
        persistenceVerified: false,
        mismatch: `Saved text differs from submitted. Saved: ${saved.length} chars, submitted: ${serialized.length} chars.`,
      };
    }
    return { success: true, specId, persistenceVerified: true };
  } catch (err) {
    // Write likely succeeded but re-fetch failed
    return {
      success: true,
      specId,
      persistenceVerified: false,
      mismatch: `Could not re-fetch page to verify persistence: ${String(err)}`,
    };
  }
}
