import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, describe, expect, it, vi } from "vitest";
import StoreStudioPicker from "@/pages/store/StudioPicker";

function renderPicker(
  flags: { aiEnabled: boolean; worldsmithEnabled: boolean } | null,
  role = "store_owner",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (flags) {
    queryClient.setQueryData(["store-flags", "store-test"], {
      storeId: "store-test",
      customDomain: false,
      editionsCap: 10,
      storageQuota: 100,
      inkEnabled: false,
      ...flags,
    });
  }
  const { hook } = memoryLocation({ path: "/store/store-test/studios", static: true });
  render(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>
        <StoreStudioPicker storeId="store-test" role={role} />
      </Router>
    </QueryClientProvider>,
  );
}

describe("StoreStudioPicker", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows AI studios and omits WorldSmith when only AI is enabled", () => {
    renderPicker({ aiEnabled: true, worldsmithEnabled: false });

    expect(screen.getByRole("link", { name: /Planner Studio/i })).toHaveAttribute(
      "href",
      "/store/store-test/studios/planners",
    );
    expect(screen.getByRole("link", { name: /Product Builder/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WorldSmith Studio/i })).not.toBeInTheDocument();
  });

  it("shows only WorldSmith when the general AI studio flag is off", () => {
    renderPicker({ aiEnabled: false, worldsmithEnabled: true });

    expect(screen.getByRole("link", { name: /WorldSmith Studio/i })).toHaveAttribute(
      "href",
      "/store/store-test/worldsmith",
    );
    expect(screen.queryByRole("link", { name: /Planner Studio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Theme Studio/i })).not.toBeInTheDocument();
  });

  it("keeps all studios usable for a super admin when the store flags are disabled", () => {
    renderPicker({ aiEnabled: false, worldsmithEnabled: false }, "super_admin");

    expect(screen.getByRole("link", { name: /Planner Studio/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WorldSmith Studio/i })).toBeInTheDocument();
  });

  it("keeps all studios usable for a super admin when the flags request fails", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    renderPicker(null, "super_admin");

    expect(screen.getByRole("link", { name: /Planner Studio/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WorldSmith Studio/i })).toBeInTheDocument();
  });

  it("shows no studio cards to an owner when no studio flag is enabled", () => {
    renderPicker({ aiEnabled: false, worldsmithEnabled: false });

    expect(screen.getByText("No studios enabled")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Planner Studio/i })).not.toBeInTheDocument();
  });
});