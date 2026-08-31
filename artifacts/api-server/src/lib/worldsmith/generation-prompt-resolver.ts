import type {
  CompiledSectionRecord,
  GenerationPromptPolicy,
  InheritanceChain,
  ParsedPayload,
  ReadableTextAuthorization,
  ValidationError,
} from "./types";

const PHOTO_TERMS = /\b(?:photos?|photo[- ]?real(?:istic|ism)?|photograph(?:s|ic|y)?|photoreal(?:istic|ism)?|dslr|hyperreal(?:istic|ism)?(?:\s+3d)?|cinematic render(?:ing)?|3d render(?:ing)?|physically based render(?:ing)?|glossy digital render(?:ing)?)\b/i;
const NEGATIVE_CUE = /\b(?:no|not|never|avoid|exclude|prohibit(?:ed|s)?|forbid(?:den)?|must not|do not|without|fails?)\b/i;
const MANDATORY_CUE = /\b(?:mandatory|required|must|shall|non-negotiable|always)\b/i;
const RENDERING_POLICY_TERMS = /\b(?:render(?:ing|ed)?|style|treatment|medium|artwork|illustrat(?:ed|ion|ive)|watercolou?r|gouache|ink|graphite|woodcut|linocut|collage|printmak(?:ing|er)|engraving|paint(?:ed|ing)|drawn|drawing|photograph(?:s|ic|y)?)\b/i;
const READABLE_TEXT_POLICY = /\b(?:(?:do not|must not|never)\s+(?:invent|fabricate|improvise|make up)\s+(?:readable|legible|rendered)?\s*(?:text|wording|words?|writing|lettering|copy)|(?:no|never|avoid|exclude|prohibit(?:ed|s)?|forbid(?:den)?|must not|do not|without)\s+(?:(?:invented|fabricated|made[- ]up|unsupported|unapproved|unsourced|fictional|pseudo)[- ]*)?(?:readable|legible|rendered)?\s*(?:text|wording|words?|writing|lettering|copy|pseudo[- ]?text)|(?:readable|legible|rendered)?\s*(?:text|wording|words?|writing|lettering|copy)\s+(?:is|are|must be|may be)?\s*(?:closed[- ]world|approved only|canon[- ]approved only|exact only|not invented|not fabricated)|only\s+(?:approved|accepted|canon(?:ically)? approved|source[- ]supported|exact)\s+(?:readable\s+)?(?:text|wording|words?|copy)|(?:text|wording|copy)\s+must\s+(?:match|use|come from|be supported by)\s+(?:an?\s+)?(?:approved|accepted|canon|production spec))/i;
const READABLE_REQUEST = /\b(?:(?:readable|legible)\s+(?:text|wording|words?|writing|lettering|copy)|written|handwritten|typed|printed|lettered|inscribed|captioned|named|dated|addressed|signed|initialed|postmark(?:ed)?|botanical identifications?|specimen (?:numbers?|data)|catalog(?:ue)? (?:data|fields?|entries)|correspondence prose|ledger (?:contents?|entries)|map labels?|geographic labels?|historical claims?|signatures?|initials?|institutional (?:names?|information)|label reads?|text reads?|wording reads?)\b/i;
const TEXT_DIRECTIVE = /\b(?:add|include|show|place|feature|render|display|print|write|type|inscribe|engrav(?:e|ed|ing)|caption|title|name|date|sign|initial|label|mark|postmark|bearing|with)\b/i;
const PURE_NEGATIVE_TEXT_DIRECTIVE = /^(?:do not|never|avoid|exclude|forbid|prohibit|without)\s+(?:render|display|print|write|type|inscribe|engrave|caption|include|show|add)\b/i;
const APPROVED_TEXT_MARKER = /\b(?:approved|accepted|authorized|exact|canonical|canon)\s+(?:readable\s+)?(?:text|wording|copy|label|inscription|title)\s*:?\s*(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|([^\n.;]+))/gi;
const CONTEXTUAL_QUOTED_TEXT = /\b(?:readable\s+(?:text|wording|copy)|wording|text|copy|label|caption|title|name|legend|heading|inscription|engraved\s+wording)\s*(?:is|are|reads?|says?)?\s*(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’)/gi;
const DATE_TEXT = /\b(?:(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,\s*)?\d{2,4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\b(?:17|18|19|20)\d{2}\b)/gi;
const DIRECT_READABLE_VALUE = /\b(?:reads?|says?|named|signed|initialed|addressed to|labelled|labeled|marked|inscribed|captioned|titled)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|([A-Z][\p{L}\p{N}'’-]*(?:\s+[A-Z0-9][\p{L}\p{N}'’.-]*){0,5}))/giu;
const RELATIONAL_READABLE_VALUE = /\b(?:letter|correspondence|invoice|telegram|note|signature|map|label|catalog(?:ue)? card|ledger entry)\s+(?:from|to|of|for|by)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|([A-Z][\p{L}\p{N}'’-]*(?:\s+[A-Z0-9][\p{L}\p{N}'’.-]*){0,5}))/giu;
const ACTION_READABLE_VALUE = /(?:^|[,;:]\s*|\b(?:and|then|please|must|should|shall|never|not)\s+)(?:stamp|emboss|monogram|engrave|inscribe|print|write|display|label|mark)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|((?!(?:on|onto|in|at|across|along|for|to|from|with|without)\b)[\p{L}\p{N}'’.-]+(?:\s+(?!(?:on|onto|in|at|across|along|for|to|from|with|without)\b)[\p{L}\p{N}'’.-]+){0,5}))/gimu;
const EMBEDDED_ACTION_READABLE_VALUE = /\b(?:stamped|embossed|monogrammed|engraved|inscribed|printed|written|displayed|labelled|labeled|marked)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|([A-Z][\p{L}\p{N}'’.-]*(?:\s+[A-Z0-9][\p{L}\p{N}'’.-]*){0,5}))/gu;
const TEXT_OBJECT_VALUE = /\b(?:label|plaque|card|tag|sign|heading|legend|caption|title|name|wording|text)\s+(?:reads?|reading|says?|saying)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|((?!(?:on|onto|in|at|across|along|for|to|from|with|without)\b)[\p{L}\p{N}'’.-]+(?:\s+(?!(?:on|onto|in|at|across|along|for|to|from|with|without)\b)[\p{L}\p{N}'’.-]+){0,5}))/giu;
const RENDER_TEXT_OBJECT_VALUE = /\b(?:render|display|show|feature|include|place|add)\s+(?:a\s+|an\s+|the\s+)?(?:name|title|heading|legend|caption|label|wording|text)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|((?!(?:on|onto|in|at|across|along|for|to|from|with|without)\b)[\p{L}\p{N}'’.-]+(?:\s+(?!(?:on|onto|in|at|across|along|for|to|from|with|without)\b)[\p{L}\p{N}'’.-]+){0,5}))/giu;
const PLACED_HEADING_VALUE = /\b(?:title|name|heading|legend)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|((?!(?:on|onto|in|at|across|along)\b)[\p{L}\p{N}'’.-]+(?:\s+(?!(?:on|onto|in|at|across|along)\b)[\p{L}\p{N}'’.-]+){0,5}))\s+(?:on|onto|in|at|across|along)\b/giu;
const OBJECT_READABLE_VALUE = /\b(?:feature|show|place|add|include)\s+(?:the\s+)?(?:title|name|heading|legend|caption|label)\s+(?:"([^"]+)"|'([^']+)'|“([^”]+)”|‘([^’]+)’|((?!(?:on|onto|in|at|across|along|for|to|from|with|without)\b)[\p{L}\p{N}'’.-]+(?:\s+(?!(?:on|onto|in|at|across|along|for|to|from|with|without)\b)[\p{L}\p{N}'’.-]+){0,5}))/giu;
const NON_READABLE_NOUN_PHRASE = new Set([
  "content",
  "details",
  "information",
  "instructions",
  "print requirements",
  "production requirements",
  "requirements",
  "rules",
  "specification",
  "specifications",
  "style",
  "treatment",
]);

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

function readableTextKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
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
    .split(/\n+|\s+#{1,6}\s+|\s+\|\s+|(?<=[.!?])\s+|;\s*|,\s*(?=(?:no|avoid|never|without)\b)/i)
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

function extractMarkedText(value: string | null | undefined): string[] {
  if (!value) return [];
  const found: string[] = [];
  for (const match of value.matchAll(APPROVED_TEXT_MARKER)) {
    const text = clean(match.slice(1).find(Boolean));
    if (text) found.push(text);
  }
  return found;
}

function uniqueExactReadableTexts(values: string[]): string[] {
  const seen = new Set<string>();
  return values.map(clean).filter((value) => {
    const normalized = readableTextKey(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function acceptedCanonRecords(chain: InheritanceChain) {
  return chain.canonRecords.filter((record) => record.status.trim().toLowerCase() === "accepted");
}

function readableTextAuthorizations(
  chain: InheritanceChain,
  payload: ParsedPayload,
): ReadableTextAuthorization[] {
  const entries: ReadableTextAuthorization[] = [];
  const add = (text: string | null | undefined, source: string) => {
    const normalized = clean(text);
    if (normalized) entries.push({ text: normalized, source });
  };

  const specIdentity = chain.productionSpec.sourceId
    ?? chain.productionSpec.notionPageId
    ?? chain.productionSpec.specId;
  add(
    payload.approved_text,
    `Production Specification: ${chain.productionSpec.productionItem} [${specIdentity}] field: approved_text`,
  );
  for (const [field, value] of [
    ["designIntent", chain.productionSpec.designIntent],
    ["narrativePurpose", chain.productionSpec.narrativePurpose],
    ["requiredContent", chain.productionSpec.requiredContent],
    ["reviewCriteria", chain.productionSpec.reviewCriteria],
  ] as const) {
    for (const text of uniqueExactReadableTexts(extractMarkedText(value))) {
      add(
        text,
        `Production Specification: ${chain.productionSpec.productionItem} [${specIdentity}] field: ${field}`,
      );
    }
  }

  for (const record of acceptedCanonRecords(chain)) {
    const recordIdentity = record.sourceId ?? record.notionPageId;
    if (!recordIdentity) continue;
    for (const [field, value] of [
      ["narrativeDetails", record.narrativeDetails],
      ["historicalContext", record.historicalContext],
      ["visualNotes", record.visualNotes],
      ["emotionalRegister", record.emotionalRegister],
      ["sensoryClauses", record.sensoryClauses],
      ["notes", record.notes],
    ] as const) {
      for (const text of uniqueExactReadableTexts(extractMarkedText(value ?? ""))) {
        add(
          text,
          `Accepted Canon Record: ${record.name} [${recordIdentity}] field: ${field}`,
        );
      }
    }
  }

  const seen = new Set<string>();
  return entries.filter(({ text }) => {
    const normalized = readableTextKey(text);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function readableTextGovernance(
  chain: InheritanceChain,
  payload: ParsedPayload,
): Pick<GenerationPromptPolicy, "readableTextClosedWorld" | "readableTextGoverningSources" | "readableTextAuthorizations"> {
  const candidates: Array<{ source: string; value: string | null | undefined }> = [
    { source: `Production Specification: ${chain.productionSpec.productionItem}`, value: chain.productionSpec.designIntent },
    { source: `Production Specification: ${chain.productionSpec.productionItem}`, value: chain.productionSpec.narrativePurpose },
    { source: `Production Specification: ${chain.productionSpec.productionItem}`, value: chain.productionSpec.requiredContent },
    { source: `Production Specification: ${chain.productionSpec.productionItem}`, value: chain.productionSpec.reviewCriteria },
    { source: `Style Guide: ${chain.styleGuide?.name ?? "linked style guide"}`, value: chain.styleGuide?.content },
    ...chain.promptModules.map((module) => ({ source: `Prompt Module: ${module.name}`, value: module.content })),
    ...chain.canonRecords.map((record) => ({
      source: `Canon Record: ${record.name} (${record.status})`,
      value: [
        record.narrativeDetails,
        record.historicalContext,
        record.visualNotes,
        record.emotionalRegister,
        record.sensoryClauses,
        record.notes,
      ].filter(Boolean).join("\n"),
    })),
    { source: "Production Specification prompt payload: text_rule", value: payload.text_rule },
    { source: "Production Specification prompt payload: canon_rule", value: payload.canon_rule },
    { source: "Production Specification prompt payload: negative_prompt", value: payload.negative_prompt },
    { source: "Production Specification prompt payload: negative_constraints", value: payload.negative_constraints },
  ];
  const governingSources = unique(candidates
    .filter(({ value }) => READABLE_TEXT_POLICY.test(clean(value)))
    .map(({ source }) => source));
  return {
    readableTextClosedWorld: governingSources.length > 0,
    readableTextGoverningSources: governingSources,
    readableTextAuthorizations: readableTextAuthorizations(chain, payload),
  };
}

function exactTextIsAuthorized(text: string, authorizations: ReadableTextAuthorization[]): boolean {
  const normalized = readableTextKey(text);
  return authorizations.some((authorization) => readableTextKey(authorization.text) === normalized);
}

function readableCandidates(clause: string): string[] {
  const candidates: string[] = [];
  const addMatches = (
    pattern: RegExp,
    enforceUnquotedProperCase = false,
    enforceActionContext = false,
  ) => {
    for (const match of clause.matchAll(pattern)) {
      if (enforceActionContext) {
        const prefix = clause.slice(0, match.index).trim();
        if (
          prefix
          && !/(?:and|then|must|should|shall|please|do not|never|avoid|exclude|forbid|prohibit|without)$/i.test(prefix)
        ) continue;
      }
      if (
        enforceUnquotedProperCase
        && match[5]
        && !/^(?:\p{Lu}|(?:17|18|19|20)\d{2})/u.test(match[5])
      ) continue;
      const value = clean(match.slice(1).find(Boolean) ?? match[0]);
      if (value && !NON_READABLE_NOUN_PHRASE.has(readableTextKey(value).toLowerCase())) {
        candidates.push(value);
      }
    }
  };
  addMatches(DIRECT_READABLE_VALUE, true);
  addMatches(RELATIONAL_READABLE_VALUE, true);
  addMatches(ACTION_READABLE_VALUE);
  addMatches(EMBEDDED_ACTION_READABLE_VALUE, true);
  addMatches(TEXT_OBJECT_VALUE);
  addMatches(RENDER_TEXT_OBJECT_VALUE);
  addMatches(PLACED_HEADING_VALUE, false, true);
  addMatches(OBJECT_READABLE_VALUE, false, true);
  addMatches(CONTEXTUAL_QUOTED_TEXT);
  if (/\b(?:dated|date|correspondence|letter|ledger|catalog(?:ue)?|specimen)\b/i.test(clause)) {
    addMatches(DATE_TEXT);
  }
  return unique(candidates);
}

function hasUnsupportedReadableRequest(
  clause: string,
  authorizations: ReadableTextAuthorization[],
): boolean {
  if (
    /^Render its content as blank ruled fields, empty label or catalog areas, restrained non-semantic handwriting traces, abstract ink marks, or other non-readable period-appropriate marks\.?$/i.test(clean(clause))
  ) return false;
  const candidates = readableCandidates(clause);
  if (candidates.length > 0) {
    if (PURE_NEGATIVE_TEXT_DIRECTIVE.test(clean(clause))) return false;
    return candidates.some((candidate) => !exactTextIsAuthorized(candidate, authorizations));
  }
  if (NEGATIVE_CUE.test(clause)) return false;
  return READABLE_REQUEST.test(clause);
}

function readableValidationClauses(value: string): string[] {
  return sourceSentences(value)
    .flatMap((clause) => clause.split(
      /\s*,\s*|\s+(?:and|but|then|next|afterward|afterwards)\s+(?=(?:stamp|emboss|monogram|engrave|inscribe|print|write|display|label|mark)\b)/i,
    ))
    .map(clean)
    .filter(Boolean);
}

function closedWorldPositiveClauses(
  value: string | null | undefined,
  policy: GenerationPromptPolicy,
): string {
  const positive = positiveClauses(value, policy.photographyProhibited);
  if (!positive || !policy.readableTextClosedWorld) return positive;
  const authorizations = policy.readableTextAuthorizations ?? [];

  return unique(sourceSentences(positive).map((clause) => {
    if (!hasUnsupportedReadableRequest(clause, authorizations)) {
      return clause;
    }
    const count = clause.match(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)[- ](?:piece|item|element|card|tag|label|sheet|document)s?\b/i)?.[0];
    return [
      count ? `Preserve the ${count} composition and its physical text-bearing objects.` : "Preserve the requested physical text-bearing object or area.",
      "Render its content as blank ruled fields, empty label or catalog areas, restrained non-semantic handwriting traces, abstract ink marks, or other non-readable period-appropriate marks.",
    ].join(" ");
  })).join("\n");
}

function readableTextLock(policy: GenerationPromptPolicy): string | undefined {
  if (!policy.readableTextClosedWorld) return undefined;
  const authorizations = policy.readableTextAuthorizations ?? [];
  return [
    "Readable text is closed-world content. Do not invent, infer, complete, or improvise any readable wording.",
    "Render only exact wording explicitly authorized below by the Production Specification or an Accepted Canon Record.",
    "All unspecified text-bearing areas must be blank ruled fields, empty label areas, empty catalog fields, restrained non-semantic handwriting traces, abstract ink marks, or other non-readable period-appropriate marks.",
    "Do not generate unsupported names, dates, addresses, botanical identifications, specimen numbers, correspondence prose, ledger entries, geographic or map labels, historical claims, signatures, initials, or institutional information.",
    authorizations.length > 0
      ? authorizations.map(({ text, source }) => `"${text}" — authorized by ${source}`).join("\n")
      : "No readable strings are authorized; all text-bearing areas must remain blank or non-readable.",
  ].join("\n");
}

function renderingLock(
  chain: InheritanceChain,
  policy: GenerationPromptPolicy = generationPolicy(chain),
): string | undefined {
  if (!policy.renderingLockRequired) return undefined;
  const governedRequirements = closedWorldPositiveClauses(positiveStyleContent(chain), policy);

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
  policy: GenerationPromptPolicy,
): string {
  const values: string[] = [payload.canon_rule ?? ""];
  if (chain.productionSpec.canonDependency && chain.productionSpec.canonDependency !== "None") {
    values.push(`Canon dependency: ${chain.productionSpec.canonDependency}`);
  }
  for (const record of chain.canonRecords) {
    if (
      policy.readableTextClosedWorld
      && record.status.trim().toLowerCase() !== "accepted"
    ) continue;
    values.push(
      policy.readableTextClosedWorld
        ? `Canon constraint source only; do not render its title: ${record.name} (${record.status})`
        : `Canon Record: ${record.name} (${record.status})`,
    );
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
    !policy.photographyProhibited
    || !PHOTO_TERMS.test(clause)
    || NEGATIVE_CUE.test(clause)
  ).map((clause) =>
    NEGATIVE_CUE.test(clause) ? clause : closedWorldPositiveClauses(clause, policy)
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
  if (
    policy.readableTextClosedWorld
    && (
      !providerPrompt.includes("[GOVERNED READABLE TEXT]")
      || !/Readable text is closed-world content/i.test(providerPrompt)
      || !/blank ruled fields/i.test(providerPrompt)
      || !/non-semantic handwriting traces/i.test(providerPrompt)
    )
  ) {
    errors.push({
      code: "MISSING_READABLE_TEXT_GOVERNANCE",
      field: "compiled_prompt",
      governing_rule: policy.readableTextGoverningSources?.join("; ") || "Inherited readable-text policy",
      message: "Inherited governance prohibits invented readable text, but the provider prompt lacks the closed-world text lock or required blank/non-readable fallback treatments.",
      recommended_action: "Recompile after restoring governed readable-text resolution.",
    });
  }
  for (const authorization of policy.readableTextAuthorizations ?? []) {
    if (
      policy.readableTextClosedWorld
      && !providerPrompt.includes(`"${authorization.text}" — authorized by ${authorization.source}`)
    ) {
      errors.push({
        code: "MISSING_READABLE_TEXT_PROVENANCE",
        field: "compiled_prompt",
        governing_rule: authorization.source,
        message: `Authorized readable text "${authorization.text}" is missing its source provenance in the provider prompt.`,
        recommended_action: "Recompile so every intentionally readable string remains paired with its authorizing source.",
      });
    }
  }
  if (policy.readableTextClosedWorld) {
    const canonicalGovernanceSection = tagged(
      "GOVERNED READABLE TEXT",
      [readableTextLock(policy)],
    );
    const canonicalIndex = providerPrompt.indexOf(canonicalGovernanceSection);
    const withoutCanonicalGovernance = canonicalIndex >= 0
      ? providerPrompt.slice(0, canonicalIndex)
        + providerPrompt.slice(canonicalIndex + canonicalGovernanceSection.length)
      : providerPrompt;
    const canonicalNegativeSection = negativePrompt
      ? `[NEGATIVE CONSTRAINTS / NEGATIVE PROMPT]\n${negativePrompt}`
      : "";
    const unsafeCanonicalNegative = negativePrompt
      ? readableValidationClauses(negativePrompt)
        .find((clause) => {
          const candidates = readableCandidates(clause);
          if (candidates.length === 0) return false;
          if (PURE_NEGATIVE_TEXT_DIRECTIVE.test(clause)) return false;
          return candidates.some((candidate) =>
            !exactTextIsAuthorized(candidate, policy.readableTextAuthorizations ?? [])
          );
        })
      : undefined;
    if (unsafeCanonicalNegative) {
      errors.push({
        code: "UNAUTHORIZED_READABLE_TEXT_REQUEST",
        field: "negative_prompt",
        governing_rule: policy.readableTextGoverningSources?.join("; ") || "Inherited readable-text policy",
        message: `The canonical negative prompt contains an affirmative or inverted request for unsupported readable content: "${unsafeCanonicalNegative}".`,
        recommended_action: "Remove the inverted readable-text instruction or authorize its exact wording from an approved source.",
      });
    }
    const canonicalNegativeIndex = canonicalNegativeSection
      ? withoutCanonicalGovernance.indexOf(canonicalNegativeSection)
      : -1;
    const providerBody = canonicalNegativeIndex >= 0
      ? withoutCanonicalGovernance.slice(0, canonicalNegativeIndex)
        + withoutCanonicalGovernance.slice(canonicalNegativeIndex + canonicalNegativeSection.length)
      : withoutCanonicalGovernance;
    const scannableProviderBody = providerBody
      .split(/(?=\n?\[[A-Z][A-Z /-]*\]\n)/)
      .join("\n");
    const unsupported = readableValidationClauses(scannableProviderBody).find((clause) =>
      hasUnsupportedReadableRequest(clause, policy.readableTextAuthorizations ?? [])
    );
    if (unsupported) {
      errors.push({
        code: "UNAUTHORIZED_READABLE_TEXT_REQUEST",
        field: "compiled_prompt",
        governing_rule: policy.readableTextGoverningSources?.join("; ") || "Inherited readable-text policy",
        message: `The final provider prompt still requests readable content without an approved exact source: "${unsupported}".`,
        recommended_action: "Replace the request with an authorized exact string or a blank/non-readable treatment before generation.",
      });
    }
  }
  return errors;
}

export function resolveGenerationPrompt(
  chain: InheritanceChain,
  payload: ParsedPayload,
  sectionRecords: CompiledSectionRecord[],
): ResolvedGenerationPrompt {
  const spec = chain.productionSpec;
  const policy = {
    ...generationPolicy(chain),
    ...readableTextGovernance(chain, payload),
  };
  const governedPositive = (value: string | null | undefined) =>
    closedWorldPositiveClauses(value, policy);
  const lock = renderingLock(chain, policy);
  const textLock = readableTextLock(policy);
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
    textLock ? tagged("GOVERNED READABLE TEXT", [textLock]) : "",
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
      governedPositive(positiveStyleContent(chain)),
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
    tagged("CANON CONSTRAINTS", [canonContent(chain, payload, policy)]),
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