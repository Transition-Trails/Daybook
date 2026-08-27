import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { describe, expect, it } from "vitest";
import { PlannerInkButton } from "@/pages/planners/builder";

describe("Planner Builder Ink navigation", () => {
  it("escapes the legacy /daybook router base", async () => {
    const location = memoryLocation({
      path: "/daybook/planners/builder",
      record: true,
      static: false,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <Router hook={location.hook} base="/daybook">
          <PlannerInkButton plannerId="planner-123" />
        </Router>
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /open in ink/i }));

    expect(location.history?.at(-1)).toBe("/super/ink/planner-123");
  });
});