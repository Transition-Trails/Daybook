/**
 * PP-1.0 Payload Validator
 * Validates the parsed payload against the CS-000 Production Payload Specification.
 * Returns structured errors and warnings.
 */
import type { ParsedPayload, ValidationError, ValidationResult, ProductionSpec } from "./types";
import { PP1_REQUIRED_KEYS, COMPONENT_KEY_MAP } from "./types";
import { parsePayload, isPlaceholder } from "./payload-parser";

const GOVERNING_RULE = "CS-000 PP-1.0";
const SUPPORTED_VERSIONS = ["PP-1.0"];

export function validatePayload(
  spec: ProductionSpec,
  raw: string,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const specId = spec.notionPageId;

  // ── 1. Payload Version ───────────────────────────────────────────────────
  if (!spec.payloadVersion || spec.payloadVersion.trim() === "") {
    errors.push({
      code: "MISSING_PAYLOAD_VERSION",
      field: "Payload Version",
      governing_rule: GOVERNING_RULE,
      message: "Payload Version is blank.",
      recommended_action: "Set Payload Version to PP-1.0 in the Production Specification.",
    });
    return buildResult(specId, spec.payloadVersion, false, errors, warnings);
  }

  if (!SUPPORTED_VERSIONS.includes(spec.payloadVersion.trim())) {
    errors.push({
      code: "UNSUPPORTED_PAYLOAD_VERSION",
      field: "Payload Version",
      governing_rule: GOVERNING_RULE,
      message: `Payload Version "${spec.payloadVersion}" is not supported. Supported: ${SUPPORTED_VERSIONS.join(", ")}.`,
      recommended_action: "Update Payload Version to PP-1.0.",
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
        governing_rule: GOVERNING_RULE,
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
      governing_rule: GOVERNING_RULE,
      message: "Prompt Payload is empty.",
      recommended_action: "Add a PP-1.0 payload block to the Prompt Payload field.",
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
      governing_rule: GOVERNING_RULE,
      message: `Prompt Payload contains duplicate key "${key}".`,
      recommended_action: `Remove the duplicate "${key}" entry, keeping only one.`,
    });
  }

  // ── 5. Required keys ─────────────────────────────────────────────────────
  for (const key of PP1_REQUIRED_KEYS) {
    const val = payload[key];
    if (val === undefined || val === null) {
      errors.push({
        code: "MISSING_REQUIRED_KEY",
        field: String(key),
        governing_rule: GOVERNING_RULE,
        message: `Prompt Payload is missing required key "${key}".`,
        recommended_action: `Add "${key}:" to the Prompt Payload.`,
      });
    } else if (isPlaceholder(val)) {
      errors.push({
        code: "EMPTY_PLACEHOLDER_VALUE",
        field: String(key),
        governing_rule: GOVERNING_RULE,
        message: `"${key}" contains a placeholder value: "${val}".`,
        recommended_action: `Replace the placeholder in "${key}" with a real value.`,
      });
    }
  }

  // ── 6. Component-specific required keys ─────────────────────────────────
  const componentKeys = COMPONENT_KEY_MAP[spec.componentType] ?? [];
  for (const key of componentKeys) {
    const val = payload[key];
    if (val === undefined) {
      warnings.push({
        code: "MISSING_COMPONENT_KEY",
        field: key,
        governing_rule: `CS-000 Component Spec: ${spec.componentType}`,
        message: `Component type "${spec.componentType}" typically requires key "${key}".`,
        recommended_action: `Consider adding "${key}:" to the Prompt Payload for this component type.`,
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

  // ── 7. Print specification checks ────────────────────────────────────────
  const writingSpaceTypes = ["Journal Card", "Decorative Paper", "Coordinating Paper"];
  if (writingSpaceTypes.includes(spec.componentType)) {
    if (!spec.writingSpacePercent && spec.writingSpacePercent !== 0) {
      warnings.push({
        code: "PRINT_SPEC_MISMATCH",
        field: "Writing Space",
        governing_rule: GOVERNING_RULE,
        message: `Component type "${spec.componentType}" usually includes a Writing Space percentage.`,
        recommended_action: "Add Writing Space % to the Production Specification.",
      });
    }
    // If writing_space key also expected in payload
    if (!payload.writing_space) {
      warnings.push({
        code: "MISSING_COMPONENT_KEY",
        field: "writing_space",
        governing_rule: GOVERNING_RULE,
        message: `"writing_space" is expected in the payload for "${spec.componentType}".`,
        recommended_action: "Add writing_space: to the Prompt Payload.",
      });
    }
  }

  // ── 8. approved_text rule ────────────────────────────────────────────────
  // If canon dependency is Canon Reference or Canon Defining, approved_text
  // is required when readable narrative text is present (we can only warn here;
  // the canon validator handles the blocking check).
  if (
    (spec.canonDependency === "Canon Reference" || spec.canonDependency === "Canon Defining") &&
    !payload.approved_text
  ) {
    warnings.push({
      code: "MISSING_APPROVED_TEXT",
      field: "approved_text",
      governing_rule: GOVERNING_RULE,
      message:
        "Canon Reference or Canon Defining assets with readable narrative text require approved_text in the payload.",
      recommended_action:
        "Add approved_text: to the Prompt Payload if any readable text will appear in the generated asset.",
    });
  }

  const valid = errors.length === 0;
  return buildResult(specId, spec.payloadVersion, valid, errors, warnings);
}

function buildResult(
  specId: string,
  payloadVersion: string,
  valid: boolean,
  errors: ValidationError[],
  warnings: ValidationError[],
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
  };
}
