import { describe, expect, it } from "vitest";
import { metricTrendTone } from "@/components/shared";

describe("metric trend direction", () => {
  it("treats rising good metrics and falling bad metrics as positive", () => {
    expect(metricTrendTone([2, 4], true)).toBe("positive");
    expect(metricTrendTone([4, 2], false)).toBe("positive");
  });

  it("treats falling good metrics and rising bad metrics as negative", () => {
    expect(metricTrendTone([4, 2], true)).toBe("negative");
    expect(metricTrendTone([2, 4], false)).toBe("negative");
  });

  it("keeps flat metrics neutral", () => {
    expect(metricTrendTone([2, 2], true)).toBe("neutral");
    expect(metricTrendTone([2, 2], false)).toBe("neutral");
  });

  it("preserves missing periods while comparing the latest scored values", () => {
    expect(metricTrendTone([20, null, 30, null], true)).toBe("positive");
  });
});