/**
 * Shared WorldSmith Production Spec readiness definition.
 *
 * This deliberately scores authored-spec completeness only. Compile-run outcome
 * readiness has different inputs and remains owned by WorldSmithCompiler.
 */

export const MIN_PAYLOAD_CHARS = 30;

export const BANDS = {
  canonClear: 60,
  payloadReady: 30,
} as const;

export type SectionId = "identity" | "creative" | "canon" | "payload" | "review";

export interface ReadinessCheck {
  /** Stable identifier for tests and UI state; labels may change independently. */
  id: string;
  label: string;
  section: SectionId;
  done: boolean;
}

/**
 * Accepts persisted production-spec records, API-shaped data, and in-progress
 * NewSpecFlow form state. Both camelCase and snake_case field names are
 * supported so consumers normalize only at this boundary.
 */
export interface SpecLike {
  productionItem?: string | null;
  production_item?: string | null;
  specId?: string | null;
  spec_id?: string | null;
  componentType?: string | null;
  component_type?: string | null;
  worldId?: string | null;
  world_id?: string | null;
  collectionId?: string | null;
  collection_id?: string | null;
  volumeId?: string | null;
  volume_id?: string | null;
  designIntent?: string | null;
  design_intent?: string | null;
  narrativePurpose?: string | null;
  narrative_purpose?: string | null;
  requiredContent?: string | null;
  required_content?: string | null;
  orientation?: string | null;
  payloadVersion?: string | null;
  payload_version?: string | null;
  promptPayload?: string | null;
  prompt_payload?: string | null;
  canonDependency?: string | null;
  canon_dependency?: string | null;
  canonRecordIds?: string[] | null;
  canon_record_ids?: string[] | null;
  styleGuideId?: string | null;
  style_guide_id?: string | null;
  componentSpecId?: string | null;
  component_spec_id?: string | null;
  promptModuleIds?: string[] | null;
  prompt_module_ids?: string[] | null;
  reviewCriteria?: string | null;
  review_criteria?: string | null;
}

/** Only these component types have a meaningful orientation field. */
export const ORIENTATION_AWARE_TYPES: ReadonlySet<string> = new Set([
  "Hero Paper",
  "Decorative Paper",
  "Journal Card",
  "Coordinating Paper",
  "Ephemera Sheet",
  "Notepaper",
  "Endpaper",
]);

/**
 * Return orientation-aware component types that do not have an explicit print
 * size in the supplied catalog. Image generation must not infer a square size
 * for these types because their orientation may change the target dimensions.
 */
export function missingOrientationAwarePrintSizes(
  printSizes: Readonly<Record<string, readonly [number, number]>>,
): string[] {
  return [...ORIENTATION_AWARE_TYPES].filter((componentType) => !Object.hasOwn(printSizes, componentType));
}

function value(spec: SpecLike, camel: keyof SpecLike, snake: keyof SpecLike): string {
  const raw = spec[camel] ?? spec[snake];
  return typeof raw === "string" ? raw : "";
}

function ids(spec: SpecLike, camel: keyof SpecLike, snake: keyof SpecLike): string[] {
  const raw = spec[camel] ?? spec[snake];
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

/** Rich-text editor values may contain safe markup; readiness is based on prose. */
function plainText(raw: string): string {
  return raw
    .replace(/<br\b[^>]*>/gi, "\n")
    .replace(/<\/?(?:p|div|h2|h3|h4|blockquote|li|ul|ol)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0?39;/gi, "'")
    .trim();
}

/**
 * Shared PP payload line parser. The compiler's parsePayload() uses this exact
 * routine, so readiness cannot accept a structure the compiler will reject.
 */
export function parsePayloadEntries(raw: string): {
  duplicateKeys: string[];
  rawEntries: Array<[string, string]>;
} {
  const rawEntries: Array<[string, string]> = [];
  const duplicateKeys: string[] = [];
  const seen = new Set<string>();
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  let currentKey: string | null = null;
  let currentValue = "";

  const flush = () => {
    if (currentKey !== null) {
      const value = currentValue.trim();
      rawEntries.push([currentKey, value]);
      if (seen.has(currentKey)) {
        duplicateKeys.push(currentKey);
      } else {
        seen.add(currentKey);
      }
      currentKey = null;
      currentValue = "";
    }
  };

  for (const line of lines) {
    if (!line.trim()) {
      flush();
      continue;
    }

    if ((line.startsWith(" ") || line.startsWith("\t")) && currentKey !== null) {
      currentValue += ` ${line.trim()}`;
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) {
      if (currentKey !== null) currentValue += ` ${line.trim()}`;
      continue;
    }

    const candidate = line.slice(0, colonIndex).trim().toLowerCase();
    if (/^[a-z][a-z0-9_]*$/.test(candidate)) {
      flush();
      currentKey = candidate;
      currentValue = line.slice(colonIndex + 1).trim();
    } else if (currentKey !== null) {
      currentValue += ` ${line.trim()}`;
    }
  }

  flush();
  return { duplicateKeys, rawEntries };
}

function hasStructuredPayload(raw: string): boolean {
  return parsePayloadEntries(raw).rawEntries
    .some(([key]) => key === "shared_prompt" || key === "asset_role");
}

export function readinessChecks(spec: SpecLike): ReadinessCheck[] {
  const productionItem = value(spec, "productionItem", "production_item");
  const specId = value(spec, "specId", "spec_id");
  const componentType = value(spec, "componentType", "component_type");
  const worldId = value(spec, "worldId", "world_id");
  const collectionId = value(spec, "collectionId", "collection_id");
  const volumeId = value(spec, "volumeId", "volume_id");
  const designIntent = plainText(value(spec, "designIntent", "design_intent"));
  const narrativePurpose = plainText(value(spec, "narrativePurpose", "narrative_purpose"));
  const requiredContent = plainText(value(spec, "requiredContent", "required_content"));
  const orientation = value(spec, "orientation", "orientation");
  const payloadVersion = value(spec, "payloadVersion", "payload_version");
  const promptPayload = value(spec, "promptPayload", "prompt_payload");
  const canonDependency = value(spec, "canonDependency", "canon_dependency") || "None";
  const canonRecordIds = ids(spec, "canonRecordIds", "canon_record_ids");
  const styleGuideId = value(spec, "styleGuideId", "style_guide_id");
  const componentSpecId = value(spec, "componentSpecId", "component_spec_id");
  const promptModuleIds = ids(spec, "promptModuleIds", "prompt_module_ids");
  const reviewCriteria = plainText(value(spec, "reviewCriteria", "review_criteria"));
  const needsOrientation = ORIENTATION_AWARE_TYPES.has(componentType);

  return [
    { id: "production-item", label: "Production item name", section: "identity", done: !!productionItem.trim() },
    { id: "component-type", label: "Component type", section: "identity", done: !!componentType.trim() },
    { id: "world-linked", label: "World linked", section: "identity", done: !!worldId.trim() },
    { id: "collection-or-volume", label: "Collection or volume linked", section: "identity", done: !!(collectionId.trim() || volumeId.trim()) },
    { id: "spec-id", label: "Spec ID", section: "identity", done: !!specId.trim() },
    { id: "design-intent", label: "Design intent", section: "creative", done: !!designIntent },
    { id: "narrative-purpose", label: "Narrative purpose", section: "creative", done: !!narrativePurpose },
    { id: "required-content", label: "Required content", section: "creative", done: !!requiredContent },
    {
      id: "orientation",
      label: "Orientation",
      section: "creative",
      done: !!componentType.trim() && (!needsOrientation || !!orientation.trim()),
    },
    { id: "style-guide", label: "Style guide linked", section: "canon", done: !!styleGuideId.trim() },
    { id: "canon-records", label: "Canon records linked (if required)", section: "canon", done: canonDependency === "None" || canonRecordIds.length > 0 },
    { id: "component-spec", label: "Component spec linked", section: "canon", done: !!componentSpecId.trim() },
    { id: "payload-version", label: "Payload version", section: "payload", done: !!payloadVersion.trim() },
    { id: "payload-content", label: "Prompt payload content", section: "payload", done: promptPayload.trim().length > MIN_PAYLOAD_CHARS },
    { id: "payload-structure", label: "Payload structure", section: "payload", done: hasStructuredPayload(promptPayload) },
    { id: "prompt-modules", label: "Prompt modules linked", section: "payload", done: promptModuleIds.length > 0 },
    { id: "review-criteria", label: "Review criteria", section: "review", done: !!reviewCriteria },
  ];
}

export function readinessScore(checks: ReadinessCheck[]): number {
  if (checks.length === 0) return 0;
  return Math.round((checks.filter(check => check.done).length / checks.length) * 100);
}

export function sectionScore(checks: ReadinessCheck[], section: SectionId): number {
  return readinessScore(checks.filter(check => check.section === section));
}

/** True only when the explicit canon-record requirement is satisfied. */
export function canonClear(checks: ReadinessCheck[]): boolean {
  return checks.find(check => check.id === "canon-records")?.done ?? false;
}

/** True only when every authored payload check is satisfied. */
export function payloadReady(checks: ReadinessCheck[]): boolean {
  const payloadChecks = checks.filter(check => check.section === "payload");
  return payloadChecks.length > 0 && payloadChecks.every(check => check.done);
}