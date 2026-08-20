import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ReadinessBoard from "@/pages/super/worldsmith-editorial/ReadinessBoard";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId: "world-glasswater",
    selectedCollectionId: null,
    selectedWorld: { id: "world-glasswater", name: "Glasswater" },
  }),
}));

describe("ReadinessBoard", () => {
  it("keeps the readiness columns visible when the selected world has no specs", async () => {
    apiFetchMock.mockResolvedValue({
      board: {},
      summary: { total: 0, errors: 0, awaiting_canon: 0 },
    });
    const { hook: useLocation } = memoryLocation({
      path: "/super/worldsmith/editorial/board",
      static: false,
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Router hook={useLocation}>
          <ReadinessBoard />
        </Router>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Drafts")).toBeVisible();
    expect(screen.getByText("Payload Ready")).toBeVisible();
    expect(screen.getByText("Canon Clear")).toBeVisible();
    expect(screen.queryByText("No specs yet for this world")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create your first spec" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Spec" })).toBeVisible();
  });
});