import { afterEach, describe, expect, it } from "vitest";
import { collectEinkViolations } from "../lib/eink-checker";
import { EINK_RULES } from "../lib/eink-presets";
import { getLegacyEinkMargin } from "../lib/pdf-generator";

const originalRules = structuredClone(EINK_RULES);

afterEach(() => {
  for (const key of Object.keys(EINK_RULES)) delete EINK_RULES[key];
  Object.assign(EINK_RULES, structuredClone(originalRules));
});

describe("database-backed e-ink enforcement cache", () => {
  it("uses the current contrast threshold instead of a hardcoded value", () => {
    EINK_RULES.contrast_floor.threshold = 0.5;
    const violations = collectEinkViolations({
      originalAccentHex: "#999999",
      bufferBytes: 100,
      deviceKey: "remarkable",
    });
    expect(violations.some((message) => message.includes("Accent colour"))).toBe(true);
  });

  it("uses the current file-weight budget and honors a disabled rule", () => {
    EINK_RULES.file_weight.threshold = 1;
    const failing = collectEinkViolations({
      originalAccentHex: "#222222",
      bufferBytes: 2 * 1024 * 1024,
      deviceKey: "remarkable",
    });
    expect(failing.some((message) => message.includes("exceeds the 1 MB"))).toBe(true);

    EINK_RULES.file_weight.enabled = false;
    const passing = collectEinkViolations({
      originalAccentHex: "#222222",
      bufferBytes: 2 * 1024 * 1024,
      deviceKey: "remarkable",
    });
    expect(passing).toEqual([]);
  });

  it("rejects an unconfigured device instead of silently using standard trim", () => {
    expect(collectEinkViolations({
      originalAccentHex: "#222222",
      bufferBytes: 100,
      deviceKey: "missing-device",
    })[0]).toContain("Unknown e-ink device profile");
  });

  it("applies the live toolbar-margin threshold to legacy planner rendering", () => {
    EINK_RULES.toolbar_margin.threshold = 64;
    expect(getLegacyEinkMargin("remarkable")).toBe(64);

    EINK_RULES.toolbar_margin.enabled = false;
    expect(getLegacyEinkMargin("remarkable")).toBe(40);
  });
});