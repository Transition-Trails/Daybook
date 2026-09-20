import { describe, expect, it } from "vitest";
import { editorialRichTextToPlainText } from "../lib/worldsmith/editorial-rich-text";

describe("editorial rich text prompt conversion", () => {
  it("removes Storyline formatting while preserving readable paragraph text", () => {
    const summary = "<p>Elias’s decision becomes real.</p><p><br></p><p>Inheritance is responsibility &amp; trust.</p>";

    const plainText = editorialRichTextToPlainText(summary);

    expect(plainText).toBe("Elias’s decision becomes real.\n\nInheritance is responsibility & trust.");
    expect(plainText).not.toMatch(/<[^>]+>/);
  });
});