/**
 * WorldSmith Prompt Compiler
 * Assembles the final compiled prompt from the inheritance chain and payload.
 * Sections are always produced in the same order so identical inputs produce
 * identical prompts (deterministic for hashing).
 */
import type {
  InheritanceChain,
  ParsedPayload,
  CompiledPrompt,
  CompiledPromptSections,
} from "./types";

const SECTION_DIVIDER = "\n\n";

function section(tag: string, content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  return `[${tag}]\n${trimmed}`;
}

export function compilePrompt(
  chain: InheritanceChain,
  payload: ParsedPayload,
): CompiledPrompt {
  const spec = chain.productionSpec;

  // ── [CREATIVE TASK] ───────────────────────────────────────────────────────
  const creativeTask = [
    `Component Type: ${spec.componentType}`,
    spec.componentSet ? `Component Set: ${spec.componentSet}` : null,
    spec.heroFamily ? `Hero Family: ${spec.heroFamily}` : null,
    `Asset Role: ${payload.asset_role}`,
  ]
    .filter(Boolean)
    .join("\n");

  // ── [WORLD AND COLLECTION CONTEXT] ────────────────────────────────────────
  const worldParts: string[] = [`World: ${spec.world}`];
  if (spec.volume) worldParts.push(`Volume: ${spec.volume}`);

  // Inject collection/world context from prompt modules tagged as world context
  const worldModules = chain.promptModules.filter((m) =>
    m.name.toLowerCase().includes("world") || m.name.toLowerCase().includes("collection"),
  );
  for (const m of worldModules) {
    if (m.content.trim()) worldParts.push(m.content.trim());
  }

  const worldContext = worldParts.join("\n");

  // ── [STYLE SYSTEM] ────────────────────────────────────────────────────────
  const styleParts: string[] = [];
  if (chain.styleGuide?.content) {
    styleParts.push(chain.styleGuide.content.trim());
  }

  const styleModules = chain.promptModules.filter((m) =>
    m.name.toLowerCase().includes("style") || m.name.toLowerCase().includes("aesthetic"),
  );
  for (const m of styleModules) {
    if (m.content.trim()) styleParts.push(m.content.trim());
  }

  const styleSystem = styleParts.join("\n\n");

  // ── [COMPONENT REQUIREMENTS] ──────────────────────────────────────────────
  const componentParts: string[] = [];
  if (chain.componentSpec?.content) {
    componentParts.push(chain.componentSpec.content.trim());
  }

  // Component-specific payload keys
  if (payload.paper_role) componentParts.push(`Paper Role: ${payload.paper_role}`);
  if (payload.pattern_behavior) componentParts.push(`Pattern Behavior: ${payload.pattern_behavior}`);
  if (payload.repeat_rule) componentParts.push(`Repeat Rule: ${payload.repeat_rule}`);
  if (payload.primary_focal_area) componentParts.push(`Primary Focal Area: ${payload.primary_focal_area}`);
  if (payload.secondary_narrative_cluster) componentParts.push(`Secondary Narrative Cluster: ${payload.secondary_narrative_cluster}`);
  if (payload.story_signal) componentParts.push(`Story Signal: ${payload.story_signal}`);
  if (payload.card_role) componentParts.push(`Card Role: ${payload.card_role}`);
  if (payload.front_layout) componentParts.push(`Front Layout: ${payload.front_layout}`);
  if (payload.back_layout) componentParts.push(`Back Layout: ${payload.back_layout}`);
  if (payload.front_prompt) componentParts.push(`Front Prompt: ${payload.front_prompt}`);
  if (payload.featured_artifact) componentParts.push(`Featured Artifact: ${payload.featured_artifact}`);
  if (payload.document_type) componentParts.push(`Document Type: ${payload.document_type}`);
  if (payload.scale_mix) componentParts.push(`Scale Mix: ${payload.scale_mix}`);
  if (payload.cutting_rule) componentParts.push(`Cutting Rule: ${payload.cutting_rule}`);

  const componentRequirements = componentParts.join("\n");

  // ── [ASSET-SPECIFIC INTENT] ───────────────────────────────────────────────
  const intentParts: string[] = [];
  if (spec.designIntent) intentParts.push(`Design Intent: ${spec.designIntent}`);
  if (spec.narrativePurpose) intentParts.push(`Narrative Purpose: ${spec.narrativePurpose}`);
  if (spec.requiredContent) intentParts.push(`Required Content: ${spec.requiredContent}`);

  const assetSpecificIntent = intentParts.join("\n");

  // ── [COMPOSITION AND CONTENT] ─────────────────────────────────────────────
  const compositionParts: string[] = [payload.composition];
  if (payload.visual_hierarchy) compositionParts.push(`Visual Hierarchy: ${payload.visual_hierarchy}`);
  if (payload.object_rule) compositionParts.push(`Object Rule: ${payload.object_rule}`);
  if (payload.crop_rule) compositionParts.push(`Crop Rule: ${payload.crop_rule}`);
  if (payload.supporting_objects) compositionParts.push(`Supporting Objects: ${payload.supporting_objects}`);
  if (payload.writing_space) compositionParts.push(`Writing Space: ${payload.writing_space}`);

  const compositionAndContent = compositionParts.filter(Boolean).join("\n");

  // ── [MATERIALS AND LIGHTING] ──────────────────────────────────────────────
  const materialsParts: string[] = [payload.materials];
  if (payload.lighting) materialsParts.push(`Lighting: ${payload.lighting}`);
  if (payload.color_rule) materialsParts.push(`Color Rule: ${payload.color_rule}`);

  const materialsAndLighting = materialsParts.filter(Boolean).join("\n");

  // ── [TEXT POLICY] ─────────────────────────────────────────────────────────
  const textParts: string[] = [payload.text_rule];
  if (payload.approved_text) textParts.push(`Approved Text: ${payload.approved_text}`);

  const textPolicy = textParts.filter(Boolean).join("\n");

  // ── [CANON POLICY] ────────────────────────────────────────────────────────
  const canonParts: string[] = [payload.canon_rule];
  if (spec.canonDependency && spec.canonDependency !== "None") {
    canonParts.push(`Canon Dependency: ${spec.canonDependency}`);
  }
  for (const rec of chain.canonRecords) {
    canonParts.push(`Canon Record: ${rec.name} (${rec.status})`);
  }

  const canonPolicy = canonParts.filter(Boolean).join("\n");

  // ── [NEGATIVE CONSTRAINTS] ────────────────────────────────────────────────
  const negativeConstraints = payload.negative_constraints;

  // ── [PRINT AND OUTPUT REQUIREMENTS] ──────────────────────────────────────
  const printParts: string[] = [payload.print_rule];
  if (spec.orientation) printParts.push(`Orientation: ${spec.orientation}`);
  if (spec.frontBackStyle) printParts.push(`Front/Back Style: ${spec.frontBackStyle}`);
  if (spec.writingSpacePercent != null) printParts.push(`Writing Space: ${spec.writingSpacePercent}%`);
  if (spec.reviewCriteria) printParts.push(`Review Criteria: ${spec.reviewCriteria}`);

  const printAndOutputRequirements = printParts.filter(Boolean).join("\n");

  // ── Additional prompt modules (non-world, non-style) ─────────────────────
  const additionalModules = chain.promptModules.filter(
    (m) =>
      !m.name.toLowerCase().includes("world") &&
      !m.name.toLowerCase().includes("collection") &&
      !m.name.toLowerCase().includes("style") &&
      !m.name.toLowerCase().includes("aesthetic"),
  );

  // ── Assemble full prompt ──────────────────────────────────────────────────
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
  };

  const orderedSectionKeys: Array<[keyof CompiledPromptSections, string]> = [
    ["creative_task", "CREATIVE TASK"],
    ["world_and_collection_context", "WORLD AND COLLECTION CONTEXT"],
    ["style_system", "STYLE SYSTEM"],
    ["component_requirements", "COMPONENT REQUIREMENTS"],
    ["asset_specific_intent", "ASSET-SPECIFIC INTENT"],
    ["composition_and_content", "COMPOSITION AND CONTENT"],
    ["materials_and_lighting", "MATERIALS AND LIGHTING"],
    ["text_policy", "TEXT POLICY"],
    ["canon_policy", "CANON POLICY"],
    ["negative_constraints", "NEGATIVE CONSTRAINTS"],
    ["print_and_output_requirements", "PRINT AND OUTPUT REQUIREMENTS"],
  ];

  const parts: string[] = [];

  for (const [key, tag] of orderedSectionKeys) {
    const s = section(tag, sections[key]);
    if (s) parts.push(s);
  }

  // Inject additional modules before negative constraints
  for (const mod of additionalModules) {
    if (mod.content.trim()) {
      const tag = mod.name.toUpperCase().replace(/\s+/g, " ").trim();
      parts.splice(parts.length - 2, 0, section(tag, mod.content));
    }
  }

  const fullPrompt = parts.join(SECTION_DIVIDER);

  // Negative prompt is extracted separately from the negative_constraints section
  const negativePrompt = negativeConstraints.trim() || undefined;

  return { sections, fullPrompt, negativePrompt };
}
