import { describe, expect, it } from "vitest";
import { toggleTypographyChoice, type DaybookFont } from "../components/FontLibraryPicker";

describe("FontLibraryPicker structured selection", () => {
  it("toggles a font by fontId and restores the original empty selection", () => {
    const font: DaybookFont = {
      id: "font-lora",
      familyName: "Lora",
      variants: ["400", "700"],
      notes: "This must stay out of selections",
      curatedPairings: [{ role: "body", family: "Lora", weight: "400" }],
      status: "live",
    };

    const selected = toggleTypographyChoice([], font);
    expect(selected).toEqual([{
      fontId: "font-lora",
      family: "Lora",
      roles: [{ role: "body", weight: "400" }],
    }]);
    expect(toggleTypographyChoice(selected, font)).toEqual([]);
  });
});