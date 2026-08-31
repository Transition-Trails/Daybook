import type {
  CompiledSectionRecord,
  GenerationPromptPolicy,
  InheritanceChain,
  ParsedPayload,
  ValidationError,
} from "./types";

const PHOTO_TERMS = /\b(?:photos?|photo[- ]?real(?:istic|ism)?|photograph(?:s|ic|y)?|photoreal(?:istic|ism)?|dslr|hyperreal(?:istic|ism)?(?:\s+3d)?|cinematic render(?:ing)?|3d render(?:ing)?|physically based render(?:ing)?|glossy digital render(?:ing)?)\b/i;
const NEGATIVE_CUE = /\b(?:no|not|never|avoid|exclude|prohibit(?:ed|s)?|forbid(?:den)?|must not|do not|without|fails?)\b/i;
const MANDATORY_CUE = /\b(?:mandatory|required|must|shall|non-negotiable|always)\b/i;
const RENDERING_POLICY_TERMS = /\b(?:render(?:ing|ed)?|style|treatment|medium|artwork|illustrat(?:ed|ion|ive)|watercolou?r|gouache|ink|graphite|woodcut|linocut|collage|printmak(?:ing|er)|engraving|paint(?:ed|ing)|drawn|drawing|photograph(?:s|ic|y)?)\b/i;

const PHOTO_PRIORITY_NEGATIVES = [
  "photograph",
  "photography",
  "photorealistic",
  "hyperrealistic",
  "DSLR still life",
  "photographic lighting",
  "photographic depth of field",
  "physically based rendering",
  "3D render",
  "cinematic rendering",
  "glossy digital rendering",
  "commercial product photography",
  "museum still-life photography",
  "razor-sharp photographic textures",
] as const;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function key(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:no|not|never|avoid|exclude|prohibited?|forbidden|must|do|without)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  return values.map(clean).filter((value) => {
    if (!value) return false;
    const normalized = key(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function sourceSentences(value: string): string[] {
  return value
    .replace(/\r/g, "\n")
    .split(/\n+|(?<=[.!?])\s+|;\s*|,\s*(?=(?:no|avoid|never|without)\b)/i)
    .map((part) => part.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function negativeClauses(value: string | null | undefined): string[] {
  if (!value) return [];
  return sourceSentences(value)
    .filter((part) => NEGATIVE_CUE.test(part))
    .flatMap((part) => {
      const normalized = part
        .replace(/^(?:negative constraints?|prohibited|avoid|exclusions?)\s*:?\s*/i, "")
        .replace(/^(?:no|not|never|avoid|exclude|prohibit(?:ed)?|forbid(?:den)?|must not|do not|without)\s+/i, "")
        .trim();
      return normalized
        .split(/\s*,\s*/)
        .map((constraint) => constraint.replace(/^(?:and|or)\s+/i, "").replace(/[.;]+$/g, "").trim());
    })
    .filter(Boolean);
}

function positiveClauses(
  value: string | null | undefined,
  photographyProhibited = false,
): string {
  if (!value) return "";
  return unique(sourceSentences(value).filter((part) =>
    !NEGATIVE_CUE.test(part)
    && (!photographyProhibited || !PHOTO_TERMS.test(part))
  )).join("\n");
}

export function styleGuideProhibitsPhotography(chain: InheritanceChain): boolean {
  const style = clean(chain.styleGuide?.content);
  return sourceSentences(style).some((sentence) =>
    PHOTO_TERMS.test(sentence)
    && (
      NEGATIVE_CUE.test(sentence)
      || /\b(?:disallow(?:ed)?|unacceptable|forbidden)\b/i.test(sentence)
    )
  );
}

function styleGuideRequiresRenderingLock(chain: InheritanceChain): boolean {
  const style = clean(chain.styleGuide?.content);
  return styleGuideProhibitsPhotography(chain)
    || sourceSentences(style).some((sentence) =>
      MANDATORY_CUE.test(sentence) && RENDERING_POLICY_TERMS.test(sentence)
    );
}

function generationPolicy(chain: InheritanceChain): GenerationPromptPolicy {
  const styleSentences = sourceSentences(clean(chain.styleGuide?.content));
  const renderingLockRequired = styleGuideRequiresRenderingLock(chain);
  const explicitlyProhibitsPhotography = styleGuideProhibitsPhotography(chain);
  const requiresPhotography = styleSentences.some((sentence) =>
    MANDATORY_CUE.test(sentence)
    && PHOTO_TERMS.test(sentence)
    && !NEGATIVE_CUE.test(sentence)
  );
  return {
    renderingLockRequired,
    photographyProhibited: explicitlyProhibitsPhotography
      || (renderingLockRequired && !requiresPhotography),
    governingStyleGuide: chain.styleGuide?.name,
  };
}

function renderingLock(chain: InheritanceChain): string | undefined {
  const policy = generationPolicy(chain);
  if (!policy.renderingLockRequired) return undefined;
  const governedRequirements = positiveStyleContent(chain);

  return [
    "The governing Style Guide rendering medium is mandatory and overrides lower-priority rendering directions.",
    governedRequirements,
    policy.photographyProhibited
      ? "This must read unmistakably as artwork in the required medium, never as a photograph or photographed still life."
      : "Preserve the required rendering medium throughout the entire image.",
    "Subject realism, plausible materials, detail, and natural lighting describe content within that medium; they never replace the governing medium.",
    policy.photographyProhibited
      ? "If any part of the image reads as photography, DSLR still-life photography, hyperreal 3D, cinematic rendering, or glossy digital realism, the result fails the style requirement."
      : "",
  ].join("\n");
}

function canonContent(
  chain: InheritanceChain,
  payload: ParsedPayload,
  photographyProhibited: boolean,
): string {
  const values: string[] = [payload.canon_rule ?? ""];
  if (chain.productionSpec.canonDependency && chain.productionSpec.canonDependency !== "None") {
    values.push(`Canon dependency: ${chain.productionSpec.canonDependency}`);
  }
  for (const record of chain.canonRecords) {
    values.push(`Canon Record: ${record.name} (${record.status})`);
    values.push(...[
      record.narrativeDetails,
      record.historicalContext,
      record.visualNotes,
      record.emotionalRegister,
      record.sensoryClauses,
      record.notes,
    ].filter((value): value is string => Boolean(clean(value))));
  }
  return unique(values.flatMap(sourceSentences).filter((clause) =>
    !photographyProhibited
    || !PHOTO_TERMS.test(clause)
    || NEGATIVE_CUE.test(clause)
  )).join("\n");
}

function mergedNegativePrompt(chain: InheritanceChain, payload: ParsedPayload): string | undefined {
  const sourceValues = [
    chain.styleGuide?.content,
    chain.componentSpec?.content,
    ...chain.promptModules.map((module) => module.content),
    chain.productionSpec.reviewCriteria,
    chain.productionSpec.requiredContent,
    ...Object.values(payload),
    ...(chain.worldBible?.worldRules ?? []),
    ...chain.canonRecords.flatMap((record) => [
      record.narrativeDetails,
      record.historicalContext,
      record.visualNotes,
      record.emotionalRegister ?? undefined,
      record.sensoryClauses,
      record.notes,
    ]),
  ];
  const photographyProhibited = generationPolicy(chain).photographyProhibited;
  const inherited = sourceValues
    .flatMap((value) => negativeClauses(value))
    .filter((clause) => !photographyProhibited || !PHOTO_TERMS.test(clause));
  const priority = photographyProhibited ? [...PHOTO_PRIORITY_NEGATIVES] : [];
  return unique([...priority, ...inherited]).join(", ") || undefined;
}

function positiveStyleContent(chain: InheritanceChain): string {
  const photographyProhibited = generationPolicy(chain).photographyProhibited;
  const content = [
    chain.styleGuide?.content ?? "",
    ...chain.promptModules.filter((module) => module.section === "style").map((module) => module.content),
  ].flatMap(sourceSentences);
  return unique(content.filter((part) =>
    !NEGATIVE_CUE.test(part)
    && (!photographyProhibited || !PHOTO_TERMS.test(part))
  )).join("\n");
}

function tagged(tag: string, values: Array<string | null | undefined>): string {
  const content = unique(values).join("\n");
  return content ? `[${tag}]\n${content}` : "";
}

export interface ResolvedGenerationPrompt {
  prompt: string;
  providerPrompt: string;
  negativePrompt?: string;
  policy: GenerationPromptPolicy;
  validationErrors: ValidationError[];
}

export function validateProviderPrompt(
  policy: GenerationPromptPolicy,
  providerPrompt: string,
  negativePrompt?: string,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (
    policy.renderingLockRequired
    && (
      !providerPrompt.startsWith("[MANDATORY RENDERING STYLE]")
      || !/governing Style Guide rendering medium is mandatory/i.test(providerPrompt.slice(0, 1600))
    )
  ) {
    errors.push({
      code: "MISSING_MANDATORY_RENDERING_LOCK",
      field: "compiled_prompt",
      governing_rule: `Style Guide: ${policy.governingStyleGuide ?? "linked style guide"}`,
      message: "The governing Style Guide requires a rendering medium, but the provider prompt does not begin with an explicit rendering lock.",
      recommended_action: "Recompile after restoring the mandatory rendering-style resolver.",
    });
  }
  if (
    policy.photographyProhibited
    && (
      !negativePrompt
      || !/\b(?:photo|photograph)/i.test(negativePrompt)
      || !/\bphoto[- ]?real/i.test(negativePrompt)
    )
  ) {
    errors.push({
      code: "MISSING_PHOTOGRAPHY_NEGATIVES",
      field: "negative_prompt",
      governing_rule: `Style Guide: ${policy.governingStyleGuide ?? "linked style guide"}`,
      message: "The governing Style Guide prohibits photography, but the final negative prompt lacks explicit photography and photorealism exclusions.",
      recommended_action: "Recompile after restoring inherited negative-constraint resolution.",
    });
  }
  return errors;
}

export function resolveGenerationPrompt(
  chain: InheritanceChain,
  payload: ParsedPayload,
  sectionRecords: CompiledSectionRecord[],
): ResolvedGenerationPrompt {
  const spec = chain.productionSpec;
  const policy = generationPolicy(chain);
  const governedPositive = (value: string | null | undefined) =>
    positiveClauses(value, policy.photographyProhibited);
  const lock = renderingLock(chain);
  const negativePrompt = mergedNegativePrompt(chain, payload);
  const generalModules = chain.promptModules
    .filter((module) => (module.section ?? "general") === "general")
    .map((module) => governedPositive(module.content));
  const worldModules = chain.promptModules
    .filter((module) => module.section === "world")
    .map((module) => governedPositive(module.content));
  const typography = sectionRecords.find((record) => record.key === "typography")?.content;
  const explicitlyPlacedPayloadKeys = new Set([
    "shared_prompt", "front_prompt", "back_prompt", "inside_prompt", "outside_prompt",
    "assembly_prompt", "negative_prompt", "asset_role", "composition", "materials",
    "visual_hierarchy", "text_rule", "canon_rule", "print_rule", "negative_constraints",
    "lighting", "writing_space", "crop_rule", "object_rule", "color_rule",
    "approved_text", "paper_role", "pattern_behavior", "repeat_rule",
    "primary_focal_area", "secondary_narrative_cluster", "supporting_objects",
    "story_signal", "card_role", "front_layout", "back_layout", "featured_artifact",
    "document_type", "scale_mix", "cutting_rule",
  ]);
  const additionalPayloadRequirements = Object.entries(payload)
    .filter(([field, value]) => !explicitlyPlacedPayloadKeys.has(field) && Boolean(clean(value)))
    .map(([field, value]) => {
      const governed = governedPositive(value);
      return governed ? `${field.replace(/_/g, " ")}: ${governed}` : "";
    })
    .filter(Boolean);
  const prompt = [
    lock ? tagged("MANDATORY RENDERING STYLE", [lock]) : "",
    tagged("ASSET AND SCENE", [
      `Asset: ${spec.productionItem} (${spec.componentType})`,
      `World: ${spec.world}${spec.volume ? `; Volume: ${spec.volume}` : ""}`,
      governedPositive(spec.designIntent),
      governedPositive(spec.narrativePurpose),
      governedPositive(payload.shared_prompt),
      governedPositive(payload.asset_role),
      governedPositive(payload.paper_role),
      governedPositive(payload.card_role),
      ...worldModules,
    ]),
    tagged("COMPOSITION", [
      governedPositive(payload.front_prompt),
      governedPositive(payload.back_prompt),
      governedPositive(payload.inside_prompt),
      governedPositive(payload.outside_prompt),
      governedPositive(payload.assembly_prompt),
      governedPositive(payload.composition),
      governedPositive(payload.visual_hierarchy),
      governedPositive(payload.primary_focal_area),
      governedPositive(payload.secondary_narrative_cluster),
      governedPositive(payload.crop_rule),
      governedPositive(payload.object_rule),
      governedPositive(payload.pattern_behavior),
      governedPositive(payload.repeat_rule),
      governedPositive(payload.front_layout),
      governedPositive(payload.back_layout),
    ]),
    tagged("REQUIRED OBJECTS AND CONTENT", [
      governedPositive(spec.requiredContent),
      governedPositive(chain.componentSpec?.content),
      governedPositive(payload.supporting_objects),
      governedPositive(payload.featured_artifact),
      governedPositive(payload.story_signal),
      governedPositive(payload.document_type),
      governedPositive(payload.scale_mix),
      ...additionalPayloadRequirements,
      ...generalModules,
    ]),
    tagged("ATMOSPHERE AND LIGHTING", [
      governedPositive(chain.worldBible?.proseVoice),
      governedPositive(chain.worldBible?.atmosphericNotes),
      governedPositive(payload.lighting),
    ]),
    tagged("MATERIALS AND PALETTE", [
      positiveStyleContent(chain),
      governedPositive(chain.worldBible?.visualPalette),
      governedPositive(chain.worldBible?.materialWorld),
      governedPositive(payload.materials),
      governedPositive(payload.color_rule),
    ]),
    tagged("NEGATIVE AND WRITING SPACE", [
      spec.writingSpacePercent != null ? `Preserve ${spec.writingSpacePercent}% usable visual space.` : null,
      governedPositive(payload.writing_space),
      governedPositive(payload.text_rule),
      governedPositive(payload.approved_text),
    ]),
    tagged("CANON CONSTRAINTS", [canonContent(chain, payload, policy.photographyProhibited)]),
    tagged("TECHNICAL AND OUTPUT REQUIREMENTS", [
      governedPositive(payload.print_rule),
      governedPositive(payload.cutting_rule),
      spec.orientation ? `Orientation: ${spec.orientation}` : null,
      spec.frontBackStyle ? `Front/Back Style: ${spec.frontBackStyle}` : null,
      typography ? `Typography: ${typography}` : null,
      governedPositive(spec.reviewCriteria),
    ]),
  ].filter(Boolean).join("\n\n");
  const providerPrompt = negativePrompt
    ? `${prompt}\n\n[NEGATIVE CONSTRAINTS / NEGATIVE PROMPT]\n${negativePrompt}`
    : prompt;

  return {
    prompt,
    providerPrompt,
    negativePrompt,
    policy,
    validationErrors: validateProviderPrompt(policy, providerPrompt, negativePrompt),
  };
}