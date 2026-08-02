/**
 * Canon Validator
 * Enforces canon dependency rules from the WorldSmith specification.
 * Must run AFTER payload validation passes.
 */
import type { ProductionSpec, CanonRecord, ValidationError } from "./types";

const GOVERNING_RULE = "CS-000 Canon Policy";

/** Canon statuses that block compilation */
const BLOCKING_STATUSES = new Set([
  "Proposed",
  "Under Review",
  "Superseded",
  "Rejected",
  "Conflicted",
  "Malformed",
  "Placeholder",
]);

export interface CanonValidationResult {
  valid: boolean;
  requiresCanonReview: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function validateCanon(
  spec: ProductionSpec,
  canonRecords: CanonRecord[],
): CanonValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const dep = spec.canonDependency;

  // ── None ──────────────────────────────────────────────────────────────────
  if (dep === "None") {
    // No canon records should be linked; if they are, warn but don't block
    if (spec.canonRecordIds.length > 0) {
      warnings.push({
        code: "UNEXPECTED_CANON_RECORDS",
        field: "Canon Records",
        governing_rule: GOVERNING_RULE,
        message:
          "Canon Dependency is None but Canon Records are linked. The asset must remain generic.",
        recommended_action:
          "Remove linked Canon Records, or change Canon Dependency to Supports Canon or Canon Reference.",
      });
    }
    return { valid: true, requiresCanonReview: false, errors, warnings };
  }

  // ── Supports Canon ────────────────────────────────────────────────────────
  if (dep === "Supports Canon") {
    // Canon Records are optional but if linked, must be Accepted
    for (const record of canonRecords) {
      if (record.status !== "Accepted") {
        errors.push({
          code: "CANON_NOT_ACCEPTED",
          field: `Canon Record: ${record.name}`,
          governing_rule: GOVERNING_RULE,
          message: `Linked Canon Record "${record.name}" has status "${record.status}" — only Accepted records may be used for generation.`,
          recommended_action: "Resolve the Canon Record to Accepted status, or unlink it.",
        });
      }
    }
    const valid = errors.length === 0;
    return { valid, requiresCanonReview: !valid, errors, warnings };
  }

  // ── Canon Reference ────────────────────────────────────────────────────────
  if (dep === "Canon Reference") {
    // At least one canon record is required
    if (spec.canonRecordIds.length === 0 || canonRecords.length === 0) {
      errors.push({
        code: "MISSING_CANON_RECORD",
        field: "Canon Records",
        governing_rule: GOVERNING_RULE,
        message: "Canon Dependency is Canon Reference but no Canon Records are linked.",
        recommended_action: "Link at least one Accepted Canon Record to this Production Specification.",
      });
    }

    // All linked records must be Accepted
    for (const record of canonRecords) {
      if (record.status !== "Accepted") {
        if (BLOCKING_STATUSES.has(record.status)) {
          errors.push({
            code: "CANON_NOT_ACCEPTED",
            field: `Canon Record: ${record.name}`,
            governing_rule: GOVERNING_RULE,
            message: `Canon Record "${record.name}" has status "${record.status}" — generation is blocked until this is Accepted.`,
            recommended_action: `Complete canon review for "${record.name}" and set status to Accepted.`,
          });
        } else {
          warnings.push({
            code: "CANON_STATUS_UNKNOWN",
            field: `Canon Record: ${record.name}`,
            governing_rule: GOVERNING_RULE,
            message: `Canon Record "${record.name}" has unexpected status "${record.status}".`,
            recommended_action: "Verify the canon record status and set to Accepted if appropriate.",
          });
        }
      }
    }

    const valid = errors.length === 0;
    return { valid, requiresCanonReview: !valid, errors, warnings };
  }

  // ── Canon Defining ────────────────────────────────────────────────────────
  if (dep === "Canon Defining") {
    // Generation is blocked until all canon decisions are Accepted
    errors.push({
      code: "CANON_DEFINING_BLOCKED",
      field: "Canon Dependency",
      governing_rule: GOVERNING_RULE,
      message:
        "Canon Dependency is Canon Defining — generation remains blocked until the relevant canon decision is explicitly Accepted. The compiler must not convert a proposal into production canon.",
      recommended_action:
        "Complete the canon review and Acceptance process before compiling this Production Specification.",
    });
    return { valid: false, requiresCanonReview: true, errors, warnings };
  }

  // ── Unknown dependency value ──────────────────────────────────────────────
  warnings.push({
    code: "UNKNOWN_CANON_DEPENDENCY",
    field: "Canon Dependency",
    governing_rule: GOVERNING_RULE,
    message: `Unknown Canon Dependency value "${dep}".`,
    recommended_action: "Set Canon Dependency to None, Supports Canon, Canon Reference, or Canon Defining.",
  });
  return { valid: true, requiresCanonReview: false, errors, warnings };
}
