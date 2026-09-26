import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import EditorialShell from "@/pages/super/worldsmith-editorial/EditorialShell";
import CanonLibrary from "@/pages/super/worldsmith-editorial/CanonLibrary";
import SpecsList from "@/pages/super/worldsmith-editorial/SpecsList";
import StoryConnections from "@/pages/super/worldsmith-editorial/StoryConnections";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: apiFetchMock,
}));

const worlds = [
  { id: "world-1", name: "Glasswater", code: "glasswater", status: "active" },
  { id: "world-2", name: "Bramble", code: "bramble", status: "active" },
];

const canonRecords = [
  {
    id: "canon-object",
    worldId: "world-1",
    name: "The Ashcroft Ledger",
    status: "accepted",
    canonType: "object",
    narrativeDetails: "A kept ledger of village histories.",
    historicalContext: "",
    visualNotes: "",
    emotionalRegister: "Reverent",
    narrativeVisibility: "explicit",
    canonStability: "high",
    specRefCount: 0,
    updatedAt: "2026-08-20T12:00:00Z",
  },
  {
    id: "canon-character",
    worldId: "world-1",
    name: "Mara Vale",
    status: "proposed",
    canonType: "character",
    narrativeDetails: "The keeper of the archive.",
    historicalContext: "",
    visualNotes: "",
    emotionalRegister: "Withholding",
    narrativeVisibility: "hinted",
    canonStability: "medium",
    specRefCount: 0,
    updatedAt: "2026-08-20T12:00:00Z",
  },
];

function renderEditorialPage(
  page: "canon" | "specs" | "connections",
  child: React.ReactNode,
) {
  const { hook: useLocation } = memoryLocation({
    path: `/super/worldsmith/editorial/${page === "connections" ? "connections" : page}`,
    static: false,
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={useLocation}>
        <EditorialShell activePage={page}>
          {child}
        </EditorialShell>
      </Router>
    </QueryClientProvider>,
  );
}

describe("WorldSmith Editorial page filter drawer", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/v1/editorial/worlds") return Promise.resolve({ worlds });
      if (path.startsWith("/v1/editorial/collections")) return Promise.resolve({ collections: [] });
      if (path === "/v1/editorial/canon-records/suggest") return Promise.resolve({ suggestions: [] });
      if (path.startsWith("/v1/editorial/canon-records")) {
        return Promise.resolve({
          canon_records: canonRecords,
          total: canonRecords.length,
          by_type: { object: 1, character: 1 },
        });
      }
      if (path.startsWith("/v1/editorial/specs")) {
        return Promise.resolve({
          specs: [
            { id: "spec-draft", productionItem: "Village Letter", componentType: "Letter", status: "draft", readinessScore: 30, updatedAt: "2026-08-20T12:00:00Z", finalArtworkGenerated: false },
            { id: "spec-ready", productionItem: "Archive Card", componentType: "Card", status: "compiled", readinessScore: 88, updatedAt: "2026-08-20T12:00:00Z", previewUrl: "/api/storage/objects/worldsmith/spec-previews/archive-card.png", finalArtworkGenerated: true },
          ],
        });
      }
      if (path.startsWith("/v1/editorial/story-connections")) {
        return Promise.resolve({
          stories: [{ id: "story-1", title: "The Glasswater Archive", summary: "A lost archive returns.", status: "active", acts: [] }],
          canonRecords: [],
          links: [],
          totalLinks: 0,
          linksTruncated: false,
          recordsTruncated: false,
        });
      }
      return Promise.resolve({});
    });
  });

  it("keeps Canon Records filters in the drawer, clears them there, and rehydrates by world", async () => {
    sessionStorage.setItem("canon-filters-world-1", JSON.stringify({
      type: "object",
      status: "all",
      search: "",
      visibility: null,
      stability: null,
      emotionalRegister: null,
    }));
    renderEditorialPage("canon", <CanonLibrary />);

    const drawerFilters = await screen.findByTestId("editorial-page-filters");
    expect(within(drawerFilters).getByRole("heading", { name: "Canon filters" })).toBeInTheDocument();
    await waitFor(() => expect(within(drawerFilters).getByLabelText("Record type")).toHaveValue("object"));
    expect(await screen.findByText("The Ashcroft Ledger")).toBeInTheDocument();
    expect(screen.queryByText("Mara Vale")).not.toBeInTheDocument();
    fireEvent.click(within(drawerFilters).getByRole("button", { name: "Clear all" }));
    expect(within(drawerFilters).getByLabelText("Record type")).toHaveValue("all");
    expect(await screen.findByText("Mara Vale")).toBeInTheDocument();
  });

  it("moves Story Map’s storyline focus filter to the drawer and refetches the selected storyline", async () => {
    renderEditorialPage("connections", <StoryConnections />);

    const drawerFilters = await screen.findByTestId("editorial-page-filters");
    expect(within(drawerFilters).getByRole("heading", { name: "Story Map filters" })).toBeInTheDocument();
    expect(screen.queryByText("Focus on")).not.toBeInTheDocument();

    await screen.findByRole("option", { name: /The Glasswater Archive — Chronological/ });
    fireEvent.change(within(drawerFilters).getByLabelText("Focus storyline"), { target: { value: "story-1" } });
    await waitFor(() => {
      expect(apiFetchMock.mock.calls.some(([path]) => String(path).includes("story_id=story-1"))).toBe(true);
    });
  });
});
