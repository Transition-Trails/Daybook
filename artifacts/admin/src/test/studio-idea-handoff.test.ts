import { beforeEach, describe, expect, it } from "vitest";
import { consumeStudioIdea } from "@/lib/studio/ideaHandoff";

describe("studio idea handoff", () => {
  beforeEach(() => sessionStorage.clear());

  it("delivers a Trend Research idea once, then clears it", () => {
    sessionStorage.setItem("studioIdea", "Cosy autumn study stickers");

    expect(consumeStudioIdea()).toBe("Cosy autumn study stickers");
    expect(sessionStorage.getItem("studioIdea")).toBeNull();
    expect(consumeStudioIdea()).toBe("");
  });
});