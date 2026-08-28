import { describe, expect, it } from "vitest";
import { composeAiUserMessage } from "@/lib/ai";
import { formatPlannerAiContext } from "@/lib/planner-ai-context";

describe("Planner Studio AI context", () => {
  it("describes the live template, page, bounded slots, and build choices", () => {
    const context = formatPlannerAiContext({
      template: {
        id: "template-1",
        name: "Quiet 2027",
        status: "draft",
        productType: "planner",
        editionLinked: true,
        generated: false,
        hasPdf: false,
      },
      canvas: {
        activeTab: "personalization",
        view: "compose",
        page: { position: 3, total: 42, type: "weekly", index: 1, label: "Weekly 2" },
        slots: {
          total: 8,
          available: 6,
          occupied: [{ index: 0, widgetId: "habit-1", widgetName: "Habit tracker" }],
        },
        selectedWidget: { id: "water-1", name: "Water tracker" },
      },
      build: {
        personalization: {
          datingMode: "dated",
          weekStart: "mon",
          orientation: "vertical",
          startMonth: 0,
          startYear: 2027,
          monthCount: 12,
        },
        visualSystem: {
          themeId: "botanical",
          paletteId: "sage",
          tabPosition: "right",
          sections: ["Goals", "Notes"],
          fonts: { heading: "Lora", subheading: "", body: "Lato", accent: "" },
          backgroundId: "paper",
          stickerPackCount: 2,
          insertCount: 1,
          bindingType: "coil",
          bindingFinish: "gold",
          paperColour: "ivory",
        },
        output: { inkFriendly: false, einkDevice: null },
      },
    });

    expect(context).toContain("Quiet 2027");
    expect(context).toContain("Weekly 2");
    expect(context).toContain("weekly");
    expect(context).toContain("1 occupied, 6 available of 8");
    expect(context).toContain("Water tracker");
    expect(context).toContain("theme botanical");
    expect(context).toContain("heading Lora");
    expect(context).toContain("coil binding");
  });

  it("falls back safely when the template and page are unavailable", () => {
    const context = formatPlannerAiContext({ template: null, canvas: null, build: null });

    expect(context).toContain("Template: none selected");
    expect(context).toContain("Active page: none.");
    expect(context).toContain("Widget slots: unavailable.");
    expect(context.length).toBeLessThanOrEqual(6000);
  });

  it("adds context only to the outbound assistant message", () => {
    expect(composeAiUserMessage("What should I change?", "")).toBe("What should I change?");
    const message = composeAiUserMessage("What should I change?", "Active page: Weekly 2.");

    expect(message).toContain("[DAYBOOK_WORKSPACE_CONTEXT]");
    expect(message).toContain("Active page: Weekly 2.");
    expect(message).toContain("User question:\nWhat should I change?");
  });
});