import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import EditorialShell from "@/pages/super/worldsmith-editorial/EditorialShell";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

const worlds = [
  { id: "world-glasswater", name: "Glasswater", code: "glasswater", status: "active" },
  { id: "world-bramble", name: "Bramble", code: "bramble", status: "active" },
];

function renderShell(path = "/super/worldsmith/editorial/stories", activePage: "stories" | "canon" = "stories") {
  const { hook: useLocation } = memoryLocation({ path, static: false });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={useLocation}>
        <EditorialShell activePage={activePage}>
          <div data-testid="editorial-workspace">Editorial workspace</div>
        </EditorialShell>
      </Router>
    </QueryClientProvider>,
  );
}

describe("EditorialShell drawer", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/v1/editorial/worlds") return Promise.resolve({ worlds });
      if (path.startsWith("/v1/editorial/collections")) {
        return Promise.resolve({
          collections: [{ id: "collection-1", worldId: "world-glasswater", name: "Field Notes", status: "active" }],
        });
      }
      if (path.startsWith("/v1/editorial/canon-records")) return Promise.resolve({ canon_records: [] });
      return Promise.resolve({});
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: () => undefined,
    });
  });

  it("keeps navigation, world context, and Co-write usable after collapsing and remounting", async () => {
    const firstRender = renderShell();

    await screen.findByRole("button", { name: "Select world · Glasswater" });
    expect(screen.getByRole("link", { name: "Storylines" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("editorial-drawer")).toHaveStyle({ width: "260px" });

    const worldSelector = screen.getByRole("button", { name: "Select world · Glasswater" });
    fireEvent.keyDown(worldSelector, { key: "ArrowDown" });
    expect(screen.getByRole("menu", { name: "Worlds" })).toBeVisible();
    expect(screen.getByRole("menuitemradio", { name: "Glasswater" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu", { name: "Worlds" }), { key: "Escape" });
    expect(worldSelector).toHaveFocus();
    expect(worldSelector).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(worldSelector);
    expect(worldSelector).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(worldSelector);
    expect(worldSelector).toHaveAttribute("aria-expanded", "false");

    const collectionSelector = await screen.findByRole("button", { name: "Select collection · All collections" });
    fireEvent.click(collectionSelector);
    expect(collectionSelector).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collectionSelector);
    expect(collectionSelector).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: "Collapse editorial navigation" }));

    expect(screen.getByRole("button", { name: "Reopen editorial navigation" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("editorial-drawer")).toHaveStyle({ width: "72px" });
    expect(screen.getByRole("link", { name: "Storylines" })).toHaveAttribute("title", "Storylines");
    expect(screen.getByTestId("editorial-workspace")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Select world · Glasswater" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Bramble" }));
    await screen.findByRole("button", { name: "Select world · Bramble" });

    fireEvent.click(screen.getByRole("button", { name: "Open holistic co-write" }));
    await screen.findByText("Co-write partner");

    await waitFor(() => {
      expect(localStorage.getItem("ws:editorial:drawer-collapsed")).toBe("true");
      expect(localStorage.getItem("ws:editorial:world")).toBe("world-bramble");
    });

    firstRender.unmount();
    renderShell("/super/worldsmith/editorial/canon", "canon");

    await screen.findByRole("button", { name: "Select world · Bramble" });
    expect(screen.getByRole("button", { name: "Reopen editorial navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Canon Records" })).toHaveAttribute("aria-current", "page");
  });
});