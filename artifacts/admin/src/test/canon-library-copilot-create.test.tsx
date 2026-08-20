/**
 * CanonLibrary — Suggested-record handoff
 *
 * The persistent editorial co-write panel opens the Canon Library using only
 * query parameters. This must work even when the library is already mounted,
 * because Wouter's useLocation intentionally excludes location.search.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, describe, expect, it, beforeEach } from "vitest";

const { apiFetch, navigate } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
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
  useLocation: () => ["/super/worldsmith/editorial/canon", navigate],
}));

import CanonLibrary from "@/pages/super/worldsmith-editorial/CanonLibrary";

describe("CanonLibrary suggested-record handoff", () => {
  beforeEach(() => {
    navigate.mockReset();
    apiFetch.mockReset();
  });

  it("opens the dedicated new-record page from the library", async () => {
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

    await waitFor(() => expect(screen.getByRole("heading", { name: "Build Your Canon Library" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Location Places, spaces, and geographical features/ }));
    expect(navigate).toHaveBeenCalledWith("/super/worldsmith/editorial/canon/new?type=location");
  });

  it("shows world-aware suggestions above canon cards and lets editors collapse them", async () => {
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

    const suggestionsHeading = screen.getByRole("heading", { name: "Missing pieces for your canon" });
    const record = screen.getByText("Wychcombe Village");
    expect(
      suggestionsHeading.compareDocumentPosition(record) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse suggestions" }));
    expect(screen.queryByText("The Thorn Keeper")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand suggestions" }));
    expect(screen.getByText("The Thorn Keeper")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create record" }));
    expect(navigate).toHaveBeenCalledWith(
      "/super/worldsmith/editorial/canon/new?name=The+Thorn+Keeper&type=character&narrative=A+quiet+archivist+who+tends+the+garden+walls+after+dusk.",
    );
  });
});