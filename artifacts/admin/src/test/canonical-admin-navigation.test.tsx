import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import PlannerLibrary from "@/pages/ink/PlannerLibrary";
import { superOrderHref } from "@/pages/users/detail";
import {
  plannerEditionHref,
  plannerStudioModeHref,
} from "@/pages/studios/PlannerStudioHub";

describe("canonical admin page navigation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens Planner Studio build mode from the canonical Ink library", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    const location = memoryLocation({
      path: "/super/ink",
      record: true,
      static: false,
    });

    render(
      <Router hook={location.hook}>
        <PlannerLibrary />
      </Router>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "New Planner" })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: "New Planner" }));

    expect(location.history?.at(-1)).toBe("/super/studios/planner?mode=build");
  });

  it("keeps user payment links on the canonical super order route", () => {
    expect(superOrderHref("order-123")).toBe("/super/orders/order-123");
  });

  it("keeps Planner Studio modes and edition links under the super prefix", () => {
    expect(plannerStudioModeHref("editions")).toBe("/super/studios/planner?mode=editions");
    expect(plannerEditionHref("edition-123")).toBe("/super/editions/edition-123");
    expect(plannerEditionHref("edition-123", "themes")).toBe("/super/editions/edition-123/themes");
  });
});