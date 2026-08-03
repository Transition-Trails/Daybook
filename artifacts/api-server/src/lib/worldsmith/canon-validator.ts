/**
 * Canon Validator
 * Enforces canon dependency rules from the WorldSmith specification (CS-001).
 *
 * Shared validator used by both the payload generator (checkGenerationRequirements)
 * and the compiler orchestrator. Single source of truth for all four branches.
 *
 * Validation rules:
 *   None           → silent pass; Canon Records are never required or warned
 *   Supports Canon → warning CANON_RECORD_RECOMMENDED when records are empty
 *   Canon Reference → blocking MISSING_REQUIRED_CANON when records are empty;
 *                     blocking CANON_NOT_ACCEPTED when a record has a blocking status
 *   Canon Defining  → blocking MISSING_REQUIRED_CANON when records are empty;
 *                     blocking MISSING_CANON_APPROVAL when records exist but none Accepted
 */
import type { ProductionSpec, CanonRecord, ValidationError } from "./types";

const GOVERNING_RULE = "CS-000 Canon Policy";

/** Canon statuses that block compilation when linked via Canon Reference. */
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

// ── Shared validator ──────────────────────────────────────────────────────────
// Called by both payload-generator.ts (checkGenerationRequirements) and
// orchestrator.ts (validateCanon wrapper below).  Returns { errors, warnings }
// only — no side effects, no Notion writes.

export function validateCanonRequirements(
  canonDependency: string,
  canonRecords: CanonRecord[],
): { errors: ValidationError[]; warnings: ValidationError[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const dep = canonDependency ?? "None";

  // ── None ──────────────────────────────────────────────────────────────────
  // Canon Records are not required and not expected.  Empty is always valid.
  if (dep === "None") {
    return { errors, warnings };
  }

  // ── Supports Canon ────────────────────────────────────────────────────────
  // Records are optional.  Warn when blank; do not block on status issues.
  if (dep === "Supports Canon") {
    if (canonRecords.length === 0) {
      warnings.push({
        code: "CANON_RECORD_RECOMMENDED",
        field: "Canon Records",
        governing_rule: GOVERNING_RULE,
        message:
          "Canon Dependency is Supports Canon but no Canon Records are linked. " +
          "The payload will use non-specific language instead of grounded canon details.",
        recommended_action:
          "Link relevant Canon Records, or confirm the payload may remain non-specific before proceeding.",
      });
    }
    return { errors, warnings };
  }

  // ── Canon Reference ───────────────────────────────────────────────────────
  // At least one record required; all linked records must have an Accepted status.
  if (dep === "Canon Reference") {
    if (canonRecords.length === 0) {
      errors.push({
        code: "MISSING_REQUIRED_CANON",
        field: "Canon Records",
        governing_rule: GOVERNING_RULE,
        message:
          "Canon Dependency is Canon Reference but no Canon Records are linked. " +
          "Generation is blocked — canon facts cannot be invented.",
        recommended_action:
          "Link at least one Accepted Canon Record to this Production Specification in Notion.",
      });
    } else {
      // Verify status of each linked record
      for (const record of canonRecords) {
        if (record.status !== "Accepted") {
          if (BLOCKING_STATUSES.has(record.status)) {
            errors.push({
              code: "CANON_NOT_ACCEPTED",
              field: `Canon Record: ${record.name}`,
              governing_rule: GOVERNING_RULE,
              message: `Canon Record "${record.name}" has status "${record.status}" — generation is blocked until this record is Accepted.`,
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
    }
    return { errors, warnings };
  }

  // ── Canon Defining ────────────────────────────────────────────────────────
  // At least one record required AND all records must be Accepted (explicit approval).
  if (dep === "Canon Defining") {
    if (canonRecords.length === 0) {
      errors.push({
        code: "MISSING_REQUIRED_CANON",
        field: "Canon Records",
        governing_rule: GOVERNING_RULE,
        message:
          "Canon Dependency is Canon Defining but no Canon Records are linked. " +
          "Generation is blocked — the compiler must not convert a proposal into production canon.",
        recommended_action:
          "Link the relevant canon decision record(s) to this Production Specification in Notion.",
      });
    } else {
      const notAccepted = canonRecords.filter(r => r.status !== "Accepted");
      if (notAccepted.length > 0) {
        errors.push({
          code: "MISSING_CANON_APPROVAL",
          field: "Canon Records",
          governing_rule: GOVERNING_RULE,
          message:
            `Canon Dependency is Canon Defining but ${notAccepted.length} linked record(s) are not yet Accepted ` +
            `(${notAccepted.map(r => `"${r.name}" [${r.status}]`).join(", ")}). ` +
            "Explicit approval (Accepted status) is required before compilation.",
          recommended_action:
            "Complete the canon review and set all linked Canon Records to Accepted status before compiling.",
        });
      }
    }
    return { errors, warnings };
  }

  // ── Unknown dependency value ──────────────────────────────────────────────
  warnings.push({
    code: "UNKNOWN_CANON_DEPENDENCY",
    field: "Canon Dependency",
    governing_rule: GOVERNING_RULE,
    message: `Unknown Canon Dependency value "${dep}".`,
    recommended_action: "Set Canon Dependency to None, Supports Canon, Canon Reference, or Canon Defining.",
  });
  return { errors, warnings };
}

// ── Orchestrator-facing wrapper ───────────────────────────────────────────────
// Thin adapter so orchestrator.ts can call validateCanon(spec, records) unchanged.

export function validateCanon(
  spec: ProductionSpec,
  canonRecords: CanonRecord[],
): CanonValidationResult {
  const { errors, warnings } = validateCanonRequirements(spec.canonDependency, canonRecords);
  return {
    valid: errors.length === 0,
    requiresCanonReview: errors.length > 0,
    errors,
    warnings,
  };
}
