import { describe, expect, it } from "vitest";
import {
  validateWorldEditorialFields,
  worldEditorialFieldNames,
} from "../lib/worldsmith/world-editorial-fields";

describe("World Creative Director field validation", () => {
  it("accepts legacy worlds with no new editorial values", () => {
    expect(validateWorldEditorialFields({})).toEqual({ valid: true });
    expect(worldEditorialFieldNames).toContain("worldPremise");
    expect(worldEditorialFieldNames).toContain("historicalEras");
  });

  it("accepts typed structured collections with stable IDs and preserved reorder", () => {
    const eras = [
      { id: "era-later", name: "Later", order: 2, summary: "Later period" },
      { id: "era-earlier", name: "Earlier", order: 1, summary: "Earlier period", approximatePeriod: null },
    ];
    expect(validateWorldEditorialFields({
      narrativePillars: [{ id: "pillar-one", name: "Stewardship", description: "Care through use." }],
      historicalEras: eras,
      institutions: [{ id: "institution-one", name: "Archive", description: "Keeps records." }],
      continuityAnchors: [{ id: "anchor-one", label: "Village", statement: "The village has its own identity.", severity: "critical" }],
      openQuestions: [{ id: "question-one", question: "Who remembers?", status: "open" }],
    })).toEqual({ valid: true });
    expect(eras.map(era => era.id)).toEqual(["era-later", "era-earlier"]);
  });

  it("rejects duplicate child IDs, invalid typed enums, and oversized fields", () => {
    expect(validateWorldEditorialFields({
      narrativePillars: [
        { id: "same-id", name: "First", description: "" },
        { id: "same-id", name: "Second", description: "" },
      ],
    }).valid).toBe(false);
    expect(validateWorldEditorialFields({
      continuityAnchors: [{ id: "anchor", label: "Label", statement: "Text", severity: "mandatory" }],
    }).valid).toBe(false);
    expect(validateWorldEditorialFields({ worldPremise: "x".repeat(10_001) }).valid).toBe(false);
    expect(validateWorldEditorialFields({ coreThemes: Array.from({ length: 51 }, () => "theme") }).valid).toBe(false);
  });
});