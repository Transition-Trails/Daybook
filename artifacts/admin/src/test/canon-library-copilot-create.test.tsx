/**
 * CanonLibrary — Suggested-record handoff
 *
 * The persistent editorial co-write panel opens the Canon Library using only
 * query parameters. This must work even when the library is already mounted,
 * because Wouter's useLocation intentionally excludes location.search.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, describe, expect, it } from "vitest";

const { apiFetch, useSearch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  useSearch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId: "world-wychcombe",
    selectedWorld: { id: "world-wychcombe", name: "Wychcombe" },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/super/worldsmith/editorial/canon", vi.fn()],
  useSearch,
}));

import CanonLibrary from "@/pages/super/worldsmith-editorial/CanonLibrary";

describe("CanonLibrary suggested-record handoff", () => {
  it("opens a prefilled Create Record drawer from the co-write query string", async () => {
    useSearch.mockReturnValue(
      "?new=1&name=The+Ashcroft+Ledger&type=object&narrative=A+weathered+diary+with+family+secrets.",
    );
    apiFetch.mockResolvedValue({
      canon_records: [],
      total: 0,
      by_type: {},
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CanonLibrary />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole("heading", { name: "New Canon Record" })).toBeInTheDocument());
    expect(screen.getByDisplayValue("The Ashcroft Ledger")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A weathered diary with family secrets.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Object/i })).toHaveStyle({ borderColor: "#F59E0B60" });
  });

  it("shows world-aware suggestions below canon cards and opens their prefilled record form", async () => {
    useSearch.mockReturnValue("");
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/canon-records/suggest") {
        return Promise.resolve({
          suggestions: [{
            name: "The Thorn Keeper",
            canonType: "character",
            rationale: "This caretaker connects the village's botanical lore to its hidden history.",
            narrativeDetails: "A quiet archivist who tends the garden walls after dusk.",
          }],
        });
      }
      return Promise.resolve({
        canon_records: [{
          id: "canon-1",
          worldId: "world-wychcombe",
          name: "Wychcombe Village",
          canonType: "location",
          narrativeDetails: "An old village.",
          historicalContext: "",
          visualNotes: "",
          status: "accepted",
          specRefCount: 0,
          updatedAt: "2026-08-20T00:00:00.000Z",
        }],
        total: 1,
        by_type: { location: 1 },
      });
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CanonLibrary />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("Missing pieces for your canon")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("The Thorn Keeper")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Create record" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "New Canon Record" })).toBeInTheDocument());
    expect(screen.getByDisplayValue("The Thorn Keeper")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A quiet archivist who tends the garden walls after dusk.")).toBeInTheDocument();
  });
});