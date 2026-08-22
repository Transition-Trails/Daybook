import { describe, expect, it } from "vitest";
import {
  canonClear,
  readinessChecks,
  readinessScore,
  sectionScore,
  payloadReady,
} from "@workspace/api-zod";
import { computeReadinessScore, derivePipelineStatus } from "../routes/worldsmith-editorial.js";
import { parsePayload } from "../lib/worldsmith/payload-parser.js";

const completeSpec = {
  productionItem: "Library Ephemera",
  specId: "WYC-EPH-001",
  componentType: "Ephemera Sheet",
  worldId: "world-001",
  collectionId: "collection-001",
  designIntent: "A muted archival ephemera sheet.",
  narrativePurpose: "Connects the reader to a lost household record.",
  requiredContent: "Faded receipts, handwriting, and pressed ferns.",
  orientation: "portrait",
  styleGuideId: "guide-001",
  componentSpecId: "component-001",
  canonDependency: "Canon Defining",
  canonRecordIds: ["canon-001"],
  payloadVersion: "PP-2.0",
  promptPayload: "shared_prompt: A long structured prompt that exceeds the minimum content threshold for readiness.",
  promptModuleIds: ["module-001"],
  reviewCriteria: "No contemporary type or objects.",
};

describe("shared WorldSmith readiness", () => {
  it("scores the same spec identically through the server and shared module", () => {
    const checks = readinessChecks(completeSpec);
    expect(computeReadinessScore(completeSpec)).toBe(readinessScore(checks));
    expect(readinessScore(checks)).toBe(100);
    expect(sectionScore(checks, "identity")).toBe(100);
    expect(sectionScore(checks, "creative")).toBe(100);
    expect(sectionScore(checks, "canon")).toBe(100);
    expect(sectionScore(checks, "payload")).toBe(100);
    expect(sectionScore(checks, "review")).toBe(100);
  });

  it("does not credit an empty form for its default canonDependency", () => {
    const checks = readinessChecks({
      canon_dependency: "None",
      payload_version: "PP-2.0",
    });

    expect(checks.find(check => check.id === "canon-dependency")).toBeUndefined();
    // The only defaults that still represent completed work are payloadVersion
    // and the valid "None" canon-record condition. The removed tautological
    // canon-dependency row would have made this 17% under the former 18-row UI.
    expect(readinessScore(checks)).toBe(12);
    expect(readinessScore(checks)).toBeLessThan(17);
  });

  it("reports canonClear false when Canon Defining has no records regardless of high overall readiness", () => {
    const checks = readinessChecks({
      ...completeSpec,
      canonRecordIds: [],
    });

    expect(readinessScore(checks)).toBeGreaterThanOrEqual(90);
    expect(canonClear(checks)).toBe(false);
    expect(payloadReady(checks)).toBe(true);
  });

  it("uses direct payload and canon conditions for pipeline status", () => {
    expect(derivePipelineStatus({
      ...completeSpec,
      canonDependency: "None",
      canonRecordIds: [],
    }, 100)).toBe("canon_clear");

    expect(derivePipelineStatus({
      ...completeSpec,
      canonDependency: "None",
      canonRecordIds: [],
      promptModuleIds: [],
    }, 94)).toBe("draft");
  });

  it("does not mistake prose mentioning a payload key for structured payload data", () => {
    const checks = readinessChecks({
      ...completeSpec,
      promptPayload: "The phrase shared_prompt appears in ordinary prose, not as structured payload data.",
    });

    expect(checks.find(check => check.id === "payload-structure")?.done).toBe(false);
    expect(payloadReady(checks)).toBe(false);
  });

  it("matches the compiler parser for accepted payload structure and key casing", () => {
    const payload = "Shared_Prompt: A normalised key remains valid for the compiler.";
    const checks = readinessChecks({ ...completeSpec, promptPayload: payload });

    expect(parsePayload(payload).payload.shared_prompt).toContain("normalised key");
    expect(checks.find(check => check.id === "payload-structure")?.done).toBe(true);
  });

  it("does not treat JSON as a structured PP payload when the compiler cannot parse it", () => {
    const payload = JSON.stringify({ shared_prompt: "JSON is not the line-based PP payload format." });
    const checks = readinessChecks({ ...completeSpec, promptPayload: payload });

    expect(parsePayload(payload).rawEntries).toEqual([]);
    expect(checks.find(check => check.id === "payload-structure")?.done).toBe(false);
  });
});