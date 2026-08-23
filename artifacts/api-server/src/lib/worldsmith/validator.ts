/**
 * PP-1.0 / PP-2.0 Payload Validator
 * Validates the parsed payload against the CS-000 Production Payload Specification.
 *
 * PP-2.0 (section-based): payload contains shared_prompt → contract-driven section validation.
 * PP-1.0 (legacy flat):   payload lacks shared_prompt → legacy flat-key validation + migration warning.
 */
import type { ParsedPayload, ValidationError, ValidationResult, ProductionSpec } from "./types";
import {
  PP1_REQUIRED_KEYS,
  COMPONENT_KEY_MAP,
  COMPONENT_SECTION_CONTRACT,
  DEFAULT_SECTION_CONTRACT,
} from "./types";
import { parsePayload, isPlaceholder } from "./payload-parser";

const GOVERNING_RULE_LEGACY = "CS-000 PP-1.0";
const GOVERNING_RULE_V2     = "CS-000 PP-2.0";
const SUPPORTED_VERSIONS    = ["PP-1.0", "PP-2.0"];

export function validatePayload(
  spec: ProductionSpec,
  raw: string,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const specId = spec.sourceId ?? spec.notionPageId ?? spec.specId;

  // ── 1. Payload Version ───────────────────────────────────────────────────
  if (!spec.payloadVersion || spec.payloadVersion.trim() === "") {
    errors.push({
      code: "MISSING_PAYLOAD_VERSION",
      field: "Payload Version",
      governing_rule: GOVERNING_RULE_LEGACY,
      message: "Payload Version is blank.",
      recommended_action: "Set Payload Version to PP-1.0 (legacy) or PP-2.0 (section-based) in the Production Specification.",
    });
    return buildResult(specId, spec.payloadVersion, false, errors, warnings);
  }

  if (!SUPPORTED_VERSIONS.includes(spec.payloadVersion.trim())) {
    errors.push({
      code: "UNSUPPORTED_PAYLOAD_VERSION",
      field: "Payload Version",
      governing_rule: GOVERNING_RULE_LEGACY,
      message: `Payload Version "${spec.payloadVersion}" is not supported. Supported: ${SUPPORTED_VERSIONS.join(", ")}.`,
      recommended_action: "Update Payload Version to PP-1.0 or PP-2.0.",
    });
    return buildResult(specId, spec.payloadVersion, false, errors, warnings);
  }

  // ── 2. Required spec fields ──────────────────────────────────────────────
  const requiredSpecFields: Array<[keyof ProductionSpec, string]> = [
    ["productionItem", "Production Item"],
    ["componentType", "Component Type"],
    ["world", "World"],
    ["designIntent", "Design Intent"],
    ["narrativePurpose", "Narrative Purpose"],
    ["requiredContent", "Required Content"],
  ];

  for (const [field, label] of requiredSpecFields) {
    const val = spec[field] as string | undefined;
    if (!val || val.trim() === "") {
      errors.push({
        code: "MISSING_NOTION_PROPERTY",
        field: label,
        governing_rule: GOVERNING_RULE_LEGACY,
        message: `Production Specification is missing "${label}".`,
        recommended_action: `Add "${label}" to the Production Specification in Notion.`,
      });
    }
  }

  // ── 3. Prompt Payload presence ───────────────────────────────────────────
  if (!raw || raw.trim() === "") {
    errors.push({
      code: "MISSING_NOTION_PROPERTY",
      field: "Prompt Payload",
      governing_rule: GOVERNING_RULE_LEGACY,
      message: "Prompt Payload is empty.",
      recommended_action: "Add a PP-1.0 or PP-2.0 payload block to the Prompt Payload field.",
    });
    return buildResult(specId, spec.payloadVersion, false, errors, warnings);
  }

  // ── 4. Parse the payload ─────────────────────────────────────────────────
  const { payload, duplicateKeys } = parsePayload(raw);

  // Duplicate keys
  for (const key of duplicateKeys) {
    errors.push({
      code: "DUPLICATE_PAYLOAD_KEY",
      field: key,
      governing_rule: GOVERNING_RULE_LEGACY,
      message: `Prompt Payload contains duplicate key "${key}".`,
      recommended_action: `Remove the duplicate "${key}" entry, keeping only one.`,
    });
  }

  // ── 5. Detect payload format ─────────────────────────────────────────────
  const isNewFormat = payload.shared_prompt !== undefined;

  if (isNewFormat) {
    // ── PP-2.0 section-based validation ───────────────────────────────────
    validateSectionContract(spec, payload, errors, warnings);
  } else {
    // ── PP-1.0 legacy flat-key validation ─────────────────────────────────
    warnings.push({
      code: "LEGACY_PAYLOAD_FORMAT",
      field: "Prompt Payload",
      governing_rule: GOVERNING_RULE_V2,
      message: "Prompt Payload is in the legacy flat-key format (PP-1.0). It will compile correctly, but migration to the section-based format (PP-2.0) is recommended.",
      recommended_action: "Migrate to PP-2.0 by replacing flat keys with shared_prompt, front_prompt, and negative_prompt sections.",
    });

    // Alias normalisation (applied before required-key check).
    // Add new aliases here whenever an author uses a semantically correct but
    // non-canonical key name (see memory: worldsmith-payload-aliases.md).
    const p = payload as Record<string, string | undefined>;

    // asset_role aliases
    if (!payload.asset_role && p.card_role)  payload.asset_role = p.card_role;
    if (!payload.asset_role && p.paper_role) payload.asset_role = p.paper_role;
    if (!payload.asset_role && p.hero_role)  payload.asset_role = p.hero_role;
    if (!payload.asset_role && p.role)       payload.asset_role = p.role;

    // materials aliases
    if (!payload.materials && p.paper_and_materials) payload.materials = p.paper_and_materials;
    if (!payload.materials && p.medium)              payload.materials = p.medium;
    if (!payload.materials && p.substrate)           payload.materials = p.substrate;
    if (!payload.materials && p.paper_substrate)     payload.materials = p.paper_substrate;

    // composition aliases
    if (!payload.composition) {
      if (payload.front_layout || payload.back_layout) {
        const parts = [payload.front_layout, payload.back_layout].filter(Boolean);
        payload.composition = parts.join(" / ");
      }
      if (!payload.composition && p.pattern_behavior) payload.composition = p.pattern_behavior;
      if (!payload.composition && p.layout)           payload.composition = p.layout;
    }

    // visual_hierarchy aliases (previously had no aliases)
    if (!payload.visual_hierarchy && p.scene_hierarchy)       payload.visual_hierarchy = p.scene_hierarchy;
    if (!payload.visual_hierarchy && p.visual_priority)       payload.visual_hierarchy = p.visual_priority;
    if (!payload.visual_hierarchy && p.compositional_structure) payload.visual_hierarchy = p.compositional_structure;
    if (!payload.visual_hierarchy && p.visual_structure)      payload.visual_hierarchy = p.visual_structure;
    if (!payload.visual_hierarchy && p.composition_hierarchy) payload.visual_hierarchy = p.composition_hierarchy;

    // print_rule aliases (previously had no aliases)
    if (!payload.print_rule && p.print_specifications)   payload.print_rule = p.print_specifications;
    if (!payload.print_rule && p.print_specification)    payload.print_rule = p.print_specification;
    if (!payload.print_rule && p.technical_requirements) payload.print_rule = p.technical_requirements;
    if (!payload.print_rule && p.production_rule)        payload.print_rule = p.production_rule;
    if (!payload.print_rule && p.technical_rule)         payload.print_rule = p.technical_rule;
    if (!payload.print_rule && p.print_notes)            payload.print_rule = p.print_notes;

    // Per-key guidance surfaced in the error card (tells authors exactly what to write)
    const PP1_KEY_HINTS: Record<string, string> = {
      asset_role:        `Describe the functional role of this asset (e.g. "Foundation layer paper · primary scene carrier"). Aliases accepted: paper_role, card_role, hero_role, role.`,
      composition:       `Describe the visual layout / arrangement (e.g. "Full-bleed aged parchment with ink-stain vignette, centred object grouping"). Aliases accepted: front_layout+back_layout, pattern_behavior, layout.`,
      materials:         `Describe the physical material and finish (e.g. "Heavy cotton rag, cold-press texture, natural deckle edge"). Aliases accepted: paper_and_materials, medium, substrate, paper_substrate.`,
      visual_hierarchy:  `Describe focal priority (e.g. "Primary: reading lamp glow · Secondary: stacked leather tomes · Tertiary: scattered letters"). Aliases accepted: scene_hierarchy, visual_priority, compositional_structure, visual_structure, composition_hierarchy.`,
      text_rule:         `State how text should interact (e.g. "Avoid centre of page; ruled lines only on lined variants; no rendered Latin text").`,
      canon_rule:        `State the canon governance relationship (e.g. "No canon-specific artifacts — atmospheric world-consistent only").`,
      print_rule:        `State print / production requirements (e.g. "300 dpi minimum; CMYK-safe palette; 3 mm bleed; no hairlines below 0.5 pt"). Aliases accepted: print_specifications, print_specification, technical_requirements, production_rule, technical_rule, print_notes.`,
      negative_constraints: `List what must NOT appear (e.g. "No digital grain, no neon color, no modern objects, no explicit text blocks").`,
    };

    // Required flat keys
    for (const key of PP1_REQUIRED_KEYS) {
      const val = (payload as Record<string, string | undefined>)[key];
      if (val === undefined || val === null) {
        const hint = PP1_KEY_HINTS[key] ?? `Add "${key}:" to the Prompt Payload.`;
        errors.push({
          code: "MISSING_REQUIRED_KEY",
          field: String(key),
          governing_rule: GOVERNING_RULE_LEGACY,
          message: `Prompt Payload is missing required key "${key}".`,
          recommended_action: hint + " Or migrate to PP-2.0 section format.",
        });
      } else if (isPlaceholder(val)) {
        errors.push({
          code: "EMPTY_PLACEHOLDER_VALUE",
          field: String(key),
          governing_rule: GOVERNING_RULE_LEGACY,
          message: `"${key}" contains a placeholder value: "${val}".`,
          recommended_action: `Replace the placeholder in "${key}" with a real value.`,
        });
      }
    }

    // Component-specific advisory warnings (legacy)
    const componentKeys = COMPONENT_KEY_MAP[spec.componentType] ?? [];
    for (const key of componentKeys) {
      const val = (payload as Record<string, string | undefined>)[key];
      if (val === undefined) {
        warnings.push({
          code: "MISSING_COMPONENT_KEY",
          field: key,
          governing_rule: `CS-000 Component Spec: ${spec.componentType}`,
          message: `Component type "${spec.componentType}" typically requires key "${key}".`,
          recommended_action: `Consider adding "${key}:" to the Prompt Payload, or migrate to PP-2.0 where this becomes front_prompt.`,
        });
      } else if (isPlaceholder(val)) {
        warnings.push({
          code: "EMPTY_PLACEHOLDER_VALUE",
          field: key,
          governing_rule: `CS-000 Component Spec: ${spec.componentType}`,
          message: `"${key}" contains a placeholder value.`,
          recommended_action: `Replace the placeholder in "${key}".`,
        });
      }
    }

    // Print spec checks (legacy)
    validatePrintSpec(spec, payload, warnings);
    validateApprovedText(spec, payload, warnings);
  }

  const valid = errors.length === 0;
  return buildResult(specId, spec.payloadVersion, valid, errors, warnings, payload);
}

// ── PP-2.0 section contract validation ───────────────────────────────────────

function validateSectionContract(
  spec: ProductionSpec,
  payload: Partial<ParsedPayload>,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  const contract = COMPONENT_SECTION_CONTRACT[spec.componentType] ?? DEFAULT_SECTION_CONTRACT;
  const governing_rule = `CS-000 PP-2.0 / ${spec.componentType || "Component"}`;

  for (const section of contract.required) {
    const val = (payload as Record<string, string | undefined>)[section];
    if (val === undefined || val === null) {
      errors.push({
        code: "MISSING_REQUIRED_SECTION",
        field: section,
        governing_rule,
        message: `Missing Required Payload Section — Component: ${spec.componentType} — Missing Section: ${section}`,
        recommended_action: `Populate ${section} in the linked Prompt Payload.`,
      });
    } else if (isPlaceholder(val)) {
      errors.push({
        code: "EMPTY_PLACEHOLDER_VALUE",
        field: section,
        governing_rule,
        message: `"${section}" contains a placeholder value.`,
        recommended_action: `Replace the placeholder in ${section} with real content.`,
      });
    }
  }

  for (const section of contract.optional) {
    const val = (payload as Record<string, string | undefined>)[section];
    if (val !== undefined && isPlaceholder(val)) {
      warnings.push({
        code: "EMPTY_PLACEHOLDER_VALUE",
        field: section,
        governing_rule,
        message: `Optional section "${section}" contains a placeholder value.`,
        recommended_action: `Replace the placeholder in ${section} or remove the key entirely.`,
      });
    }
  }
}

// ── Shared supplemental checks ────────────────────────────────────────────────

function validatePrintSpec(
  spec: ProductionSpec,
  payload: Partial<ParsedPayload>,
  warnings: ValidationError[],
): void {
  const writingSpaceTypes = ["Journal Card", "Decorative Paper", "Coordinating Paper"];
  if (writingSpaceTypes.includes(spec.componentType)) {
    if (!spec.writingSpacePercent && spec.writingSpacePercent !== 0) {
      warnings.push({
        code: "PRINT_SPEC_MISMATCH",
        field: "Writing Space",
        governing_rule: GOVERNING_RULE_LEGACY,
        message: `Component type "${spec.componentType}" usually includes a Writing Space percentage.`,
        recommended_action: "Add Writing Space % to the Production Specification.",
      });
    }
    if (!payload.writing_space) {
      warnings.push({
        code: "MISSING_COMPONENT_KEY",
        field: "writing_space",
        governing_rule: GOVERNING_RULE_LEGACY,
        message: `"writing_space" is expected in the payload for "${spec.componentType}".`,
        recommended_action: "Add writing_space: to the Prompt Payload.",
      });
    }
  }
}

function validateApprovedText(
  spec: ProductionSpec,
  payload: Partial<ParsedPayload>,
  warnings: ValidationError[],
): void {
  if (
    (spec.canonDependency === "Canon Reference" || spec.canonDependency === "Canon Defining") &&
    !payload.approved_text
  ) {
    warnings.push({
      code: "MISSING_APPROVED_TEXT",
      field: "approved_text",
      governing_rule: GOVERNING_RULE_LEGACY,
      message:
        "Canon Reference or Canon Defining assets with readable narrative text require approved_text in the payload.",
      recommended_action:
        "Add approved_text: to the Prompt Payload if any readable text will appear in the generated asset.",
    });
  }
}

// ── Result builder ────────────────────────────────────────────────────────────

function buildResult(
  specId: string,
  payloadVersion: string,
  valid: boolean,
  errors: ValidationError[],
  warnings: ValidationError[],
  payload?: Partial<ParsedPayload>,
): ValidationResult {
  const compiledPromptStatus = valid
    ? "Ready to Compile"
    : errors.some((e) => e.code.startsWith("CANON"))
    ? "Requires Canon Review"
    : "Validation Failed";

  return {
    production_spec_id: specId,
    payload_version: payloadVersion ?? "",
    valid,
    compiled_prompt_status: compiledPromptStatus,
    errors,
    warnings,
    payload,
  };
}
