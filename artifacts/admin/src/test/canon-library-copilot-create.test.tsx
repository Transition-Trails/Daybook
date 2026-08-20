/**
 * CanonLibrary — Suggested-record handoff
 *
 * The persistent editorial co-write panel opens the Canon Library using only
 * query parameters. This must work even when the library is already mounted,
 * because Wouter's useLocation intentionally excludes location.search.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi, describe, expect, it, beforeEach } from "vitest";

const { apiFetch, navigate } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/contexts/EditorialContext", () => ({
  EditorialProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useEditorial: () => ({
    selectedWorldId: "world-wychcombe",
    selectedWorld: { id: "world-wychcombe", name: "Wychcombe" },
    worlds: [{ id: "world-wychcombe", name: "Wychcombe", code: "wychcombe", status: "active" }],
    worldsLoading: false,
    setSelectedWorldId: vi.fn(),
    collections: [],
    collectionsLoading: false,
    selectedCollectionId: null,
    setSelectedCollectionId: vi.fn(),
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/super/worldsmith/editorial/canon", navigate],
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import CanonLibrary from "@/pages/super/worldsmith-editorial/CanonLibrary";
import EditorialShell from "@/pages/super/worldsmith-editorial/EditorialShell";

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
    apiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/v1/editorial/canon-records/suggest") {
        const body = JSON.parse(String(options?.body ?? "{}"));
        return Promise.resolve({
          suggestions: [{
            name: "The Thorn Keeper",
            canonType: body.focus_type ?? "character",
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

  it("regenerates world-aware suggestions for the active record type", async () => {
    const suggestionBodies: Array<Record<string, unknown>> = [];
    apiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/v1/editorial/canon-records/suggest") {
        const body = JSON.parse(String(options?.body ?? "{}"));
        suggestionBodies.push(body);
        return Promise.resolve({
          suggestions: [{
            name: body.focus_type === "object" ? "The Thorn Reliquary" : "The Thorn Keeper",
            canonType: body.focus_type ?? "character",
            rationale: "A world-grounded gap.",
            narrativeDetails: "A detail that belongs to this world.",
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
        <EditorialShell activePage="canon">
          <CanonLibrary />
        </EditorialShell>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("The Thorn Keeper")).toBeInTheDocument());
    expect(suggestionBodies[0]).toEqual({ world_id: "world-wychcombe" });

    const drawerFilters = await screen.findByTestId("editorial-page-filters");
    fireEvent.change(within(drawerFilters).getByLabelText("Record type"), { target: { value: "object" } });

    await waitFor(() => expect(screen.getByText("The Thorn Reliquary")).toBeInTheDocument());
    expect(suggestionBodies.at(-1)).toEqual({
      world_id: "world-wychcombe",
      focus_type: "object",
    });
    expect(screen.getByRole("heading", { name: "Missing object records for your canon" })).toBeInTheDocument();
  });
});