import { describe, expect, it } from "vitest";
import { HELP_CATEGORIES, helpCategoryLabel, isHelpCategory } from "@workspace/api-zod";

describe("canonical help categories", () => {
  it("contains each owner and buyer support-area key", () => {
    expect(HELP_CATEGORIES.map(({ key }) => key)).toEqual([
      "building-planner",
      "stickers-packs",
      "exported-pdf",
      "drive-sync",
      "my-storefront",
      "account-billing",
      "opening-planner",
      "links-not-working",
      "using-stickers",
      "printing-cutting",
      "something-missing",
      "something-else",
    ]);
  });

  it("accepts only canonical category keys and returns their labels", () => {
    expect(isHelpCategory("building-planner")).toBe(true);
    expect(isHelpCategory("Building a planner")).toBe(false);
    expect(isHelpCategory("general")).toBe(false);
    expect(helpCategoryLabel("building-planner")).toBe("Building a planner");
  });
});