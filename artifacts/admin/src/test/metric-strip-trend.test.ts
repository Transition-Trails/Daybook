import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { MetricStrip, metricTrendTone } from "@/components/shared";

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

  it("renders one sparkline for each of the five dashboard cells", () => {
    const { container } = render(
      createElement(MetricStrip, { metrics: [
        { label: "MRR", value: "$100", delta: "+$10", values: [50, 60, 70, 80, 90, 100], desirable: true },
        { label: "Trial → paid", value: "40%", delta: "+2 pts", values: [30, 31, 32, 35, 38, 40], desirable: true },
        { label: "New stores", value: 4, delta: "+1", values: [0, 1, 1, 2, 3, 4], desirable: true },
        { label: "Completed builds", value: 8, delta: "+2", values: [2, 3, 4, 5, 6, 8], desirable: true },
        { label: "Failed builds", value: 1, delta: "-1", values: [3, 3, 2, 2, 2, 1], desirable: false },
      ] }),
    );

    expect(container.querySelectorAll('[data-testid="metric-strip-cell"]')).toHaveLength(5);
    expect(container.querySelectorAll("svg")).toHaveLength(5);
    expect(container.textContent).not.toContain("Trend unavailable");
  });

  it("colors failed-build sparklines green when falling, red when rising, and neutral when flat", () => {
    const { container } = render(
      createElement(MetricStrip, { metrics: [
        { label: "Failed builds falling", value: 1, delta: "-1", values: [4, 3, 2, 2, 2, 1], desirable: false },
        { label: "Failed builds rising", value: 4, delta: "+1", values: [1, 2, 2, 3, 3, 4], desirable: false },
        { label: "Failed builds flat", value: 2, delta: "0", values: [2, 2, 2, 2, 2, 2], desirable: false },
      ] }),
    );

    expect(Array.from(container.querySelectorAll("polyline"), (line) => line.getAttribute("stroke"))).toEqual([
      "#3F7A5E",
      "#A85B48",
      "#8A7A66",
    ]);
  });
});