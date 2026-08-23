/**
 * WorldSmith Prompt Compiler
 * Assembles the final compiled prompt from the inheritance chain and payload.
 *
 * PP-2.0 (section-based): uses shared_prompt / front_prompt / back_prompt … structure.
 * PP-1.0 (legacy flat):   uses original flat key assembly for backward compat.
 *
 * Both paths produce a deterministic fullPrompt for stable hashing.
 */
import type {
  InheritanceChain,
  ParsedPayload,
  CompiledPrompt,
  CompiledPromptSections,
  CompiledSectionRecord,
} from "./types";
import { worldBibleRichTextToPlainText } from "./world-bible-rich-text";
import { PROMPT_SECTION_ORDER } from "./types";

const SECTION_DIVIDER = "\n\n";
const LEGACY_FONT_REFERENCE_HTML = /<p>\s*Daybook Font:\s*([^<\r\n]+?)\s*<br\s*\/?>\s*Curated roles:\s*[^<\r\n]*(?:\s*<br\s*\/?>\s*Available variants:\s*[^<\r\n]*)?(?:\s*<br\s*\/?>\s*Source notes:\s*[\s\S]*?)?\s*<\/p>/gi;
const LEGACY_FONT_REFERENCE_TEXT = /(?:^|\r?\n)Daybook Font:[ \t]*([^\r\n]+?)[ \t]*\r?\nCurated roles:[ \t]*[^\r\n]*[ \t]*(?:\r?\nAvailable variants:[ \t]*[^\r\n]*[ \t]*)?(?:\r?\nSource notes:[ \t]*[^\r\n]*)?(?=\r?\n|$)/gim;

/**
 * Historical picker metadata remains in editorial prose for manual review, but
 * must never be inherited by an image prompt. Structured typography is the
 * sole permitted source for the [TYPOGRAPHY] section.
 */
function promptSafeEditorialText(value: string): string {
  return value
    .replace(LEGACY_FONT_REFERENCE_HTML, "")
    .replace(LEGACY_FONT_REFERENCE_TEXT, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function promptSafeBibleText(value: string): string {
  return promptSafeEditorialText(worldBibleRichTextToPlainText(value));
}

function section(tag: string, content: string): string {
  const trimmed = promptSafeEditorialText(content);
  if (!trimmed) return "";
  return `[${tag}]\n${trimmed}`;
}

function rec(
  key: string,
  label: string,
  content: string,
  source: string,
): CompiledSectionRecord {
  return { key, label, content: promptSafeEditorialText(content), source };
}

function appendCanonRecord(parts: string[], record: InheritanceChain["canonRecords"][number]): void {
  parts.push(`Canon Record: ${record.name} (${record.status})`);
  const fields: Array<[string, string | null | undefined]> = [
    ["Narrative Details", record.narrativeDetails],
    ["Historical Context", record.historicalContext],
    ["Visual Notes", record.visualNotes],
    ["Emotional Register", record.emotionalRegister],
    ["Sensory Clauses", record.sensoryClauses],
    ["Canon Notes", record.notes],
  ];
  for (const [label, value] of fields) {
    const promptSafeValue = value ? promptSafeEditorialText(value) : "";
    if (promptSafeValue) parts.push(`${label}: ${promptSafeValue}`);
  }
}

function typographyContent(chain: InheritanceChain): string {
  const seen = new Set<string>();
  const choices = [
    ...(chain.worldBible?.typography ?? []),
    ...(chain.styleGuide?.typography ?? []),
    ...chain.canonRecords.flatMap((record) => record.typography ?? []),
  ].filter((choice) => {
    if (!choice.fontId || !choice.family || seen.has(choice.fontId)) return false;
    seen.add(choice.fontId);
    return true;
  });

  return choices.map((choice) => {
    const roles = choice.roles
      .filter((role) => role.role.trim())
      .map((role) => `${role.role.trim()}${role.weight?.trim() ? ` ${role.weight.trim()}` : ""}`)
      .join(", ");
    return roles ? `${choice.family} — ${roles}` : choice.family;
  }).join("\n");
}

export function compilePrompt(
  chain: InheritanceChain,
  payload: ParsedPayload,
): CompiledPrompt {
  const isNewFormat = payload.shared_prompt !== undefined;
  return isNewFormat
    ? compileNewFormat(chain, payload)
    : compileLegacyFormat(chain, payload);
}

// ── PP-2.0 section-based compilation ─────────────────────────────────────────

function compileNewFormat(
  chain: InheritanceChain,
  payload: ParsedPayload,
): CompiledPrompt {
  const spec = chain.productionSpec;
  const parts: string[] = [];
  const sectionRecords: CompiledSectionRecord[] = [];

  // ── Inherited context ──────────────────────────────────────────────────────

  // [WORLD AND COLLECTION CONTEXT]
  const worldParts: string[] = [`World: ${spec.world}`];
  if (spec.volume) worldParts.push(`Volume: ${spec.volume}`);
  const worldModules = chain.promptModules.filter((m) => m.section === "world");
  for (const m of worldModules) {
    const promptSafeContent = promptSafeEditorialText(m.content);
    if (promptSafeContent) worldParts.push(promptSafeContent);
  }
  const worldContent = worldParts.join("\n");
  const worldSrc = worldModules.length > 0
    ? `World record + ${worldModules.map((m) => m.name).join(", ")}`
    : "World record";
  pushSection("world_and_collection_context", "WORLD AND COLLECTION CONTEXT", worldContent, worldSrc, parts, sectionRecords);

  // ── World Bible sections ─────────────────────────────────────────────────
  // Injected after the world/collection context and before the style system.
  // Each field is only emitted when non-null and non-empty.
  const bible = chain.worldBible;
  const typography = typographyContent(chain);
  if (bible?.visualPalette?.trim()) {
      pushSection("visual_palette", "VISUAL PALETTE", promptSafeBibleText(bible.visualPalette), "World Bible", parts, sectionRecords);
  }
  if (typography) {
    pushSection("typography", "TYPOGRAPHY", typography, "World Bible, Style Guide, and Canon Records", parts, sectionRecords);
  }
  if (bible) {
    if (bible.proseVoice?.trim()) {
      pushSection("prose_voice", "PROSE VOICE", promptSafeBibleText(bible.proseVoice), "World Bible", parts, sectionRecords);
    }
    if (bible.atmosphericNotes?.trim()) {
      pushSection("atmospheric_notes", "ATMOSPHERIC NOTES", promptSafeBibleText(bible.atmosphericNotes), "World Bible", parts, sectionRecords);
    }
    if (bible.materialWorld?.trim()) {
      pushSection("material_world", "MATERIAL WORLD", promptSafeBibleText(bible.materialWorld), "World Bible", parts, sectionRecords);
    }
  }

  // [STYLE SYSTEM]
  const styleParts: string[] = [];
  if (chain.styleGuide?.content) styleParts.push(promptSafeEditorialText(chain.styleGuide.content));
  const styleModules = chain.promptModules.filter((m) => m.section === "style");
  for (const m of styleModules) {
    const promptSafeContent = promptSafeEditorialText(m.content);
    if (promptSafeContent) styleParts.push(promptSafeContent);
  }
  const styleContent = styleParts.join("\n\n");
  const styleSrc = chain.styleGuide
    ? `Style Guide: ${chain.styleGuide.name}`
    : "No Style Guide linked";
  pushSection("style_system", "STYLE SYSTEM", styleContent, styleSrc, parts, sectionRecords);

  // [COMPONENT REQUIREMENTS]
  const componentParts: string[] = [];
  if (chain.componentSpec?.content) componentParts.push(promptSafeEditorialText(chain.componentSpec.content));
  const componentContent = componentParts.join("\n");
  const componentSrc = chain.componentSpec
    ? `Component Specification: ${chain.componentSpec.name}`
    : "No Component Specification linked";
  pushSection("component_requirements", "COMPONENT REQUIREMENTS", componentContent, componentSrc, parts, sectionRecords);

  // General modules are emitted as their own named compiled sections.
  const additionalModules = chain.promptModules.filter((m) => (m.section ?? "general") === "general");
  for (const m of additionalModules) {
    const promptSafeContent = promptSafeEditorialText(m.content);
    if (promptSafeContent) {
      const tag = m.name.toUpperCase().replace(/\s+/g, " ").trim();
      pushSection(`module_${m.notionPageId}`, tag, promptSafeContent, `Prompt Module: ${m.name}`, parts, sectionRecords);
    }
  }

  // ── Payload sections (PP-2.0 order) ───────────────────────────────────────
  for (const { key, label } of PROMPT_SECTION_ORDER) {
    const content = (payload as Record<string, string | undefined>)[key];
    if (content && content.trim()) {
      pushSection(key, label.toUpperCase(), content, "Prompt Payload", parts, sectionRecords);
    }
  }

  // ── Canon policy ───────────────────────────────────────────────────────────
  const canonParts: string[] = [];
  if (spec.canonDependency && spec.canonDependency !== "None") {
    canonParts.push(`Canon Dependency: ${spec.canonDependency}`);
  }
  for (const rec_ of chain.canonRecords) {
    appendCanonRecord(canonParts, rec_);
  }
  const canonContent = canonParts.join("\n");
  const canonSrc = chain.canonRecords.length > 0
    ? `Canon Records: ${chain.canonRecords.map((r) => r.name).join(", ")}`
    : "No Canon Records linked";
  pushSection("canon_policy", "CANON POLICY", canonContent, canonSrc, parts, sectionRecords);

  // ── Print requirements ─────────────────────────────────────────────────────
  const printParts: string[] = [];
  if (spec.orientation) printParts.push(`Orientation: ${spec.orientation}`);
  if (spec.frontBackStyle) printParts.push(`Front/Back Style: ${spec.frontBackStyle}`);
  if (spec.writingSpacePercent != null) printParts.push(`Writing Space: ${spec.writingSpacePercent}%`);
  if (spec.reviewCriteria) printParts.push(`Review Criteria: ${spec.reviewCriteria}`);
  const printContent = printParts.join("\n");
  pushSection("print_and_output_requirements", "PRINT AND OUTPUT REQUIREMENTS", printContent, "Production Specification", parts, sectionRecords);

  // ── World Rules (hard negatives — always last) ─────────────────────────────
  const worldRules = (chain.worldBible?.worldRules ?? [])
    .map(promptSafeEditorialText)
    .filter(Boolean);
  if (worldRules.length > 0) {
    pushSection("world_rules", "WORLD RULES", worldRules.join("\n"), "World Bible", parts, sectionRecords);
  }

  const fullPrompt = parts.filter(Boolean).join(SECTION_DIVIDER);
  const negativePrompt = (payload.negative_prompt ?? "").trim() || undefined;

  // Build a compatible legacy sections map
  const sections = buildLegacySectionsFromNewFormat(chain, payload);

  return { sections, sectionRecords, fullPrompt, negativePrompt, isLegacyFormat: false };
}

function pushSection(
  key: string,
  tag: string,
  content: string,
  source: string,
  parts: string[],
  sectionRecords: CompiledSectionRecord[],
): void {
  const trimmed = promptSafeEditorialText(content);
  if (!trimmed) return;
  parts.push(section(tag, trimmed));
  sectionRecords.push(rec(key, toTitleCase(tag), trimmed, source));
}

function toTitleCase(upper: string): string {
  return upper
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── PP-1.0 legacy flat compilation ───────────────────────────────────────────

function compileLegacyFormat(
  chain: InheritanceChain,
  payload: ParsedPayload,
): CompiledPrompt {
  const spec = chain.productionSpec;

  // ── [CREATIVE TASK] ─────────────────────────────────────────────────────
  const creativeTask = [
    `Component Type: ${spec.componentType}`,
    spec.componentSet ? `Component Set: ${spec.componentSet}` : null,
    spec.heroFamily ? `Hero Family: ${spec.heroFamily}` : null,
    payload.asset_role ? `Asset Role: ${payload.asset_role}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // ── [WORLD AND COLLECTION CONTEXT] ──────────────────────────────────────
  const worldParts: string[] = [`World: ${spec.world}`];
  if (spec.volume) worldParts.push(`Volume: ${spec.volume}`);
  const worldModules = chain.promptModules.filter((m) => m.section === "world");
  for (const m of worldModules) {
    const promptSafeContent = promptSafeEditorialText(m.content);
    if (promptSafeContent) worldParts.push(promptSafeContent);
  }
  const worldContext = worldParts.join("\n");

  // ── [STYLE SYSTEM] ──────────────────────────────────────────────────────
  const styleParts: string[] = [];
  if (chain.styleGuide?.content) styleParts.push(promptSafeEditorialText(chain.styleGuide.content));
  const styleModules = chain.promptModules.filter((m) => m.section === "style");
  for (const m of styleModules) {
    const promptSafeContent = promptSafeEditorialText(m.content);
    if (promptSafeContent) styleParts.push(promptSafeContent);
  }
  const styleSystem = styleParts.join("\n\n");

  // ── [COMPONENT REQUIREMENTS] ────────────────────────────────────────────
  const componentParts: string[] = [];
  if (chain.componentSpec?.content) componentParts.push(promptSafeEditorialText(chain.componentSpec.content));
  if (payload.paper_role)                   componentParts.push(`Paper Role: ${payload.paper_role}`);
  if (payload.pattern_behavior)             componentParts.push(`Pattern Behavior: ${payload.pattern_behavior}`);
  if (payload.repeat_rule)                  componentParts.push(`Repeat Rule: ${payload.repeat_rule}`);
  if (payload.primary_focal_area)           componentParts.push(`Primary Focal Area: ${payload.primary_focal_area}`);
  if (payload.secondary_narrative_cluster)  componentParts.push(`Secondary Narrative Cluster: ${payload.secondary_narrative_cluster}`);
  if (payload.story_signal)                 componentParts.push(`Story Signal: ${payload.story_signal}`);
  if (payload.card_role)                    componentParts.push(`Card Role: ${payload.card_role}`);
  if (payload.front_layout)                 componentParts.push(`Front Layout: ${payload.front_layout}`);
  if (payload.back_layout)                  componentParts.push(`Back Layout: ${payload.back_layout}`);
  if (payload.front_prompt)                 componentParts.push(`Front Prompt: ${payload.front_prompt}`);
  if (payload.featured_artifact)            componentParts.push(`Featured Artifact: ${payload.featured_artifact}`);
  if (payload.document_type)                componentParts.push(`Document Type: ${payload.document_type}`);
  if (payload.scale_mix)                    componentParts.push(`Scale Mix: ${payload.scale_mix}`);
  if (payload.cutting_rule)                 componentParts.push(`Cutting Rule: ${payload.cutting_rule}`);
  const componentRequirements = componentParts.join("\n");

  // ── [ASSET-SPECIFIC INTENT] ─────────────────────────────────────────────
  const intentParts: string[] = [];
  if (spec.designIntent)     intentParts.push(`Design Intent: ${spec.designIntent}`);
  if (spec.narrativePurpose) intentParts.push(`Narrative Purpose: ${spec.narrativePurpose}`);
  if (spec.requiredContent)  intentParts.push(`Required Content: ${spec.requiredContent}`);
  const assetSpecificIntent = intentParts.join("\n");

  // ── [COMPOSITION AND CONTENT] ────────────────────────────────────────────
  const compositionParts: string[] = [payload.composition ?? ""].filter(Boolean);
  if (payload.visual_hierarchy)  compositionParts.push(`Visual Hierarchy: ${payload.visual_hierarchy}`);
  if (payload.object_rule)       compositionParts.push(`Object Rule: ${payload.object_rule}`);
  if (payload.crop_rule)         compositionParts.push(`Crop Rule: ${payload.crop_rule}`);
  if (payload.supporting_objects) compositionParts.push(`Supporting Objects: ${payload.supporting_objects}`);
  if (payload.writing_space)     compositionParts.push(`Writing Space: ${payload.writing_space}`);
  const compositionAndContent = compositionParts.join("\n");

  // ── [MATERIALS AND LIGHTING] ─────────────────────────────────────────────
  const materialsParts: string[] = [payload.materials ?? ""].filter(Boolean);
  if (payload.lighting)    materialsParts.push(`Lighting: ${payload.lighting}`);
  if (payload.color_rule)  materialsParts.push(`Color Rule: ${payload.color_rule}`);
  const materialsAndLighting = materialsParts.join("\n");

  // ── [TEXT POLICY] ────────────────────────────────────────────────────────
  const textParts: string[] = [payload.text_rule ?? ""].filter(Boolean);
  if (payload.approved_text) textParts.push(`Approved Text: ${payload.approved_text}`);
  const textPolicy = textParts.join("\n");

  // ── [CANON POLICY] ───────────────────────────────────────────────────────
  const canonParts: string[] = [payload.canon_rule ?? ""].filter(Boolean);
  if (spec.canonDependency && spec.canonDependency !== "None") {
    canonParts.push(`Canon Dependency: ${spec.canonDependency}`);
  }
  for (const r of chain.canonRecords) {
    appendCanonRecord(canonParts, r);
  }
  const canonPolicy = canonParts.join("\n");

  // ── [NEGATIVE CONSTRAINTS] ──────────────────────────────────────────────
  const negativeConstraints = payload.negative_constraints ?? "";

  // ── [PRINT AND OUTPUT REQUIREMENTS] ─────────────────────────────────────
  const printParts: string[] = [payload.print_rule ?? ""].filter(Boolean);
  if (spec.orientation)            printParts.push(`Orientation: ${spec.orientation}`);
  if (spec.frontBackStyle)         printParts.push(`Front/Back Style: ${spec.frontBackStyle}`);
  if (spec.writingSpacePercent != null) printParts.push(`Writing Space: ${spec.writingSpacePercent}%`);
  if (spec.reviewCriteria)         printParts.push(`Review Criteria: ${spec.reviewCriteria}`);
  const printAndOutputRequirements = printParts.join("\n");

  // Additional modules
  const additionalModules = chain.promptModules.filter((m) => (m.section ?? "general") === "general");

  const sections: CompiledPromptSections = {
    creative_task: creativeTask,
    world_and_collection_context: worldContext,
    style_system: styleSystem,
    component_requirements: componentRequirements,
    asset_specific_intent: assetSpecificIntent,
    composition_and_content: compositionAndContent,
    materials_and_lighting: materialsAndLighting,
    text_policy: textPolicy,
    canon_policy: canonPolicy,
    negative_constraints: negativeConstraints,
    print_and_output_requirements: printAndOutputRequirements,
    typography: typographyContent(chain),
  };

  const orderedSectionKeys: Array<[keyof CompiledPromptSections, string]> = [
    ["creative_task",               "CREATIVE TASK"],
    ["world_and_collection_context","WORLD AND COLLECTION CONTEXT"],
    ["style_system",                "STYLE SYSTEM"],
    ["component_requirements",      "COMPONENT REQUIREMENTS"],
    ["asset_specific_intent",       "ASSET-SPECIFIC INTENT"],
    ["composition_and_content",     "COMPOSITION AND CONTENT"],
    ["materials_and_lighting",      "MATERIALS AND LIGHTING"],
    ["text_policy",                 "TEXT POLICY"],
    ["canon_policy",                "CANON POLICY"],
    ["negative_constraints",        "NEGATIVE CONSTRAINTS"],
    ["print_and_output_requirements","PRINT AND OUTPUT REQUIREMENTS"],
  ];

  const parts: string[] = [];
  for (const [key, tag] of orderedSectionKeys) {
    const s = section(tag, sections[key] ?? "");
    if (s) parts.push(s);
    // Inject World Bible fields immediately after WORLD AND COLLECTION CONTEXT
    if (key === "world_and_collection_context") {
      const bible = chain.worldBible;
      if (bible?.visualPalette?.trim())    parts.push(section("VISUAL PALETTE",    promptSafeBibleText(bible.visualPalette)));
      if (sections.typography)              parts.push(section("TYPOGRAPHY",        sections.typography));
      if (bible) {
        if (bible.proseVoice?.trim())       parts.push(section("PROSE VOICE",       promptSafeBibleText(bible.proseVoice)));
        if (bible.atmosphericNotes?.trim()) parts.push(section("ATMOSPHERIC NOTES", promptSafeBibleText(bible.atmosphericNotes)));
        if (bible.materialWorld?.trim())    parts.push(section("MATERIAL WORLD",    promptSafeBibleText(bible.materialWorld)));
      }
    }
  }

  // Inject additional modules before negative constraints
  for (const m of additionalModules) {
    const promptSafeContent = promptSafeEditorialText(m.content);
    if (promptSafeContent) {
      const tag = m.name.toUpperCase().replace(/\s+/g, " ").trim();
      parts.splice(parts.length - 2, 0, section(tag, promptSafeContent));
    }
  }

  // ── World Rules (hard negatives — always last) ─────────────────────────────
  const worldRules = (chain.worldBible?.worldRules ?? [])
    .map(promptSafeEditorialText)
    .filter(Boolean);
  if (worldRules.length > 0) {
    parts.push(section("WORLD RULES", worldRules.join("\n")));
  }

  const fullPrompt = parts.join(SECTION_DIVIDER);
  const negativePrompt = negativeConstraints.trim() || undefined;

  // Build sectionRecords from legacy sections for the viewer
  const sectionRecords: CompiledSectionRecord[] = orderedSectionKeys
    .map(([key, label]) => rec(key, toTitleCase(label), sections[key] ?? "", legacySectionSource(key as string, chain)))
    .filter((r) => r.content.length > 0);

  // Append World Bible sectionRecords for the viewer
  const bible = chain.worldBible;
  if (bible?.visualPalette?.trim())    sectionRecords.push(rec("visual_palette",    "Visual Palette",    promptSafeBibleText(bible.visualPalette),    "World Bible"));
  if (sections.typography)              sectionRecords.push(rec("typography",        "Typography",        sections.typography,                               "World Bible, Style Guide, and Canon Records"));
  if (bible) {
    if (bible.proseVoice?.trim())       sectionRecords.push(rec("prose_voice",       "Prose Voice",       promptSafeBibleText(bible.proseVoice),       "World Bible"));
    if (bible.atmosphericNotes?.trim()) sectionRecords.push(rec("atmospheric_notes", "Atmospheric Notes", promptSafeBibleText(bible.atmosphericNotes), "World Bible"));
    if (bible.materialWorld?.trim())    sectionRecords.push(rec("material_world",    "Material World",    promptSafeBibleText(bible.materialWorld),    "World Bible"));
    if (worldRules.length > 0)          sectionRecords.push(rec("world_rules",       "World Rules",       worldRules.join("\n"),  "World Bible"));
  }

  return { sections, sectionRecords, fullPrompt, negativePrompt, isLegacyFormat: true };
}

function legacySectionSource(key: string, chain: InheritanceChain): string {
  if (key === "world_and_collection_context") return "World record + Prompt Modules";
  if (key === "style_system") return chain.styleGuide ? `Style Guide: ${chain.styleGuide.name}` : "No Style Guide";
  if (key === "component_requirements") return chain.componentSpec ? `Component Spec: ${chain.componentSpec.name}` : "Prompt Payload (flat keys)";
  if (key === "canon_policy") return "Canon Records";
  if (key === "print_and_output_requirements") return "Production Specification";
  return "Prompt Payload";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a legacy CompiledPromptSections from a PP-2.0 payload for compat. */
function buildLegacySectionsFromNewFormat(
  chain: InheritanceChain,
  payload: ParsedPayload,
): CompiledPromptSections {
  const spec = chain.productionSpec;
  return {
    creative_task: `Component Type: ${spec.componentType}`,
    world_and_collection_context: `World: ${spec.world}${spec.volume ? `\nVolume: ${spec.volume}` : ""}`,
    style_system: chain.styleGuide?.content ? promptSafeEditorialText(chain.styleGuide.content) : "",
    component_requirements: chain.componentSpec?.content ? promptSafeEditorialText(chain.componentSpec.content) : "",
    asset_specific_intent: [spec.designIntent, spec.narrativePurpose, spec.requiredContent].filter(Boolean).join("\n"),
    // PP-2.0 sections must not be represented under misleading PP-1.0 labels.
    // Keep the legacy keys for callers that expect the shape, but only attach
    // content to accurately named PP-2.0 fields.
    composition_and_content: "",
    materials_and_lighting: "",
    text_policy: "",
    canon_policy: chain.canonRecords.map((r) => `${r.name} (${r.status})`).join("\n"),
    negative_constraints: payload.negative_prompt ?? "",
    print_and_output_requirements: [spec.orientation, spec.frontBackStyle].filter(Boolean).join("\n"),
    typography: "",
    shared_prompt: payload.shared_prompt ?? "",
    front_prompt: payload.front_prompt ?? "",
  };
}
