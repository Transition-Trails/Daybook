import { describe, expect, it } from "vitest";
import { editorialSnapshotPath, renderEditorialSnapshot } from "../lib/worldsmith/context-snapshot";

const records = [
  ["production-specs", "production spec", "worlds/w-1/context/production-specs/spec-1-card.md"],
  ["component-specs", "component spec", "worlds/w-1/context/component-specs/component-1-card.md"],
  ["style-guides", "style guide", "worlds/w-1/context/style-guides/style-1-card.md"],
  ["prompt-modules", "prompt module", "worlds/w-1/context/prompt-modules/module-1-card.md"],
  ["collections", "collection", "worlds/w-1/context/collections/collection-1-card.md"],
  ["volumes", "volume", "worlds/w-1/context/volumes/volume-1-card.md"],
  ["production-profiles", "production profile", "global/context/production-profiles/profile-1-card.md"],
  ["punch-templates", "punch template", "global/context/punch-templates/punch-1-card.md"],
] as const;

describe("WorldSmith editorial context snapshot renderers", () => {
  it.each(records)("renders the %s path deterministically", (_resource, kind, expectedPath) => {
    const record = { id: expectedPath.split("/").at(-1)!.replace(/-card\.md$/, ""), name: "Card", worldId: kind.includes("profile") || kind.includes("punch") ? null : "w-1", status: "draft", empty: "" };
    expect(editorialSnapshotPath(kind, record)).toBe(expectedPath);
    const markdown = renderEditorialSnapshot(kind, record, [{ label: "World", id: "w-1", name: "Wychcombe" }], new Date("2026-01-01T00:00:00.000Z"));
    expect(markdown).toContain(`# Card`);
    expect(markdown).toContain(`**Type:** ${kind}`);
    expect(markdown).toContain("## Status");
    expect(markdown).toContain("## Relationships");
    expect(markdown).not.toContain("## Empty");
  });

  it("sorts fields and relationships without summarizing or inferring", () => {
    const markdown = renderEditorialSnapshot("style guide", {
      id: "style-1", name: "Guide", worldId: "w-1", zulu: "verbatim <b>HTML</b>",
      alpha: "first", blank: null,
    }, [{ label: "B", id: "2", name: "Second" }, { label: "A", id: "1", name: "First" }],
    new Date("2026-01-01T00:00:00.000Z"));
    expect(markdown.indexOf("## Alpha")).toBeLessThan(markdown.indexOf("## Zulu"));
    expect(markdown.indexOf("First")).toBeLessThan(markdown.indexOf("Second"));
    expect(markdown).toContain("verbatim HTML");
    expect(markdown).not.toContain("blank");
    expect(markdown).toContain("Record ID: style-1");
  });
});