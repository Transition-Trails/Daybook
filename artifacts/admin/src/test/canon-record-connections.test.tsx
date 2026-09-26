import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, toast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { CanonRecordConnections } from "@/components/editorial/CanonRecordConnections";

function renderConnections() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CanonRecordConnections recordId="canon-current" worldId="world-1" />
    </QueryClientProvider>,
  );
}

describe("CanonRecordConnections", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.mockReset();
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/canon-records?")) {
        return Promise.resolve({
          canon_records: [
            { id: "object-1", name: "Compass", canonType: "object", status: "accepted" },
            { id: "event-1", name: "Winter Crossing", canonType: "event", status: "accepted" },
            { id: "location-1", name: "Ashcroft Hall", canonType: "location", status: "accepted" },
            { id: "character-1", name: "Frederick", canonType: "character", status: "accepted" },
          ],
        });
      }
      if (path.endsWith("/relations") && !init) return Promise.resolve({ relations: [] });
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      return Promise.resolve({});
    });
  });

  it("prioritizes characters, locations, and events and creates a valid typed relationship", async () => {
    renderConnections();

    const recordSelect = await screen.findByLabelText("Select record");
    await waitFor(() => {
      const options = within(recordSelect).getAllByRole("option").map(option => option.textContent);
      expect(options).toEqual([
        "Choose a canon record...",
        "Frederick (character)",
        "Ashcroft Hall (location)",
        "Winter Crossing (event)",
        "Compass (object)",
      ]);
    });

    fireEvent.change(recordSelect, { target: { value: "character-1" } });
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "rival" } });
    fireEvent.change(screen.getByLabelText("Details (Optional)"), { target: { value: "Competing heirs" } });
    fireEvent.click(screen.getByRole("button", { name: "Add relation" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-current/relations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          to_record_id: "character-1",
          relation_type: "rival",
          details: "Competing heirs",
        }),
      }),
    ));
  });

  it("creates a suggested storyline and links it to the current Canon record", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/relations") && !init) return Promise.resolve({ relations: [] });
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      if (path === "/v1/editorial/stories/suggest") {
        return Promise.resolve({
          suggestions: [{
            title: "The Winter Ledger",
            rationale: "The missing ledger connects several unresolved records.",
            narrativePromise: "Frederick must recover the ledger before the crossing.",
            recommendedStatus: "planned",
          }],
        });
      }
      if (path === "/v1/editorial/stories" && init?.method === "POST") {
        return Promise.resolve({
          story: { id: "story-new", title: "The Winter Ledger", summary: "", status: "planned" },
        });
      }
      if (path.endsWith("/story-links") && init?.method === "POST") return Promise.resolve({ ok: true });
      return Promise.resolve({});
    });

    renderConnections();
    fireEvent.click(await screen.findByRole("button", { name: "Generate ideas" }));
    const suggestionCard = (await screen.findByText("The Winter Ledger")).closest("div");
    expect(suggestionCard).not.toBeNull();
    fireEvent.click(within(suggestionCard as HTMLElement).getByRole("button", { name: /Create & Link/ }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/stories",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          world_id: "world-1",
          title: "The Winter Ledger",
          summary: "Frederick must recover the ledger before the crossing.",
          status: "planned",
        }),
      }),
    ));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-current/story-links",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ story_id: "story-new" }),
      }),
    ));
  });

  it("only requests relationship suggestions on demand and adds one proposal without removing others", async () => {
    const candidates = [
      {
        toRecordId: "character-1",
        targetName: "Frederick",
        targetCanonType: "character",
        relationType: "rival",
        details: "Competing for the same inheritance.",
        rationale: "Their records describe conflicting claims.",
        sourceVersion: 3,
        targetVersion: 7,
        storyId: "story-ledger",
        sourceEvidence: "Frederick claims the inheritance.",
        targetEvidence: "The other heir disputes the claim.",
      },
      {
        toRecordId: "location-1",
        targetName: "Ashcroft Hall",
        targetCanonType: "location",
        relationType: "located_at",
        details: "The event takes place there.",
        rationale: "The event entry names this location.",
        storyTitle: "The Winter Ledger",
        sourceVersion: 3,
        targetVersion: 2,
        storyId: "story-ledger",
        sourceEvidence: "The event occurs at Ashcroft Hall.",
        targetEvidence: "Ashcroft Hall is the winter meeting place.",
      },
      {
        toRecordId: "event-1",
        targetName: "Winter Crossing",
        targetCanonType: "event",
        relationType: "involved_in",
        details: "Frederick took part in the crossing.",
        rationale: "Both records refer to the same journey.",
        sourceVersion: 3,
        targetVersion: 4,
        storyId: "story-ledger",
        sourceEvidence: "Frederick joined the crossing.",
        targetEvidence: "The winter crossing was a journey.",
      },
      {
        toRecordId: "object-1",
        targetName: "Compass",
        targetCanonType: null,
        relationType: "uses",
        details: "A fourth proposal should be omitted.",
        rationale: "The compass appears in the character's notes.",
        sourceVersion: 3,
        targetVersion: 1,
        storyId: "story-ledger",
        sourceEvidence: "Frederick's notes mention a compass.",
        targetEvidence: "The compass was found nearby.",
      },
    ];
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/relations") && !init) return Promise.resolve({ relations: [] });
      if (path.endsWith("/relations/suggest") && init?.method === "POST") {
        return Promise.resolve({ suggestions: candidates });
      }
      if (path.endsWith("/relations") && init?.method === "POST") return Promise.resolve({ ok: true });
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      return Promise.resolve({});
    });

    renderConnections();
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-current/relations/suggest",
      expect.anything(),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Suggest relationships" }));

    const firstCard = await screen.findByTestId("card-canon-relation-suggestion-character-1");
    expect(within(firstCard).getByText("Proposed: rival")).toBeInTheDocument();
    expect(within(firstCard).getByText(/Their records describe conflicting claims/)).toBeInTheDocument();
    expect(within(firstCard).getByText(/Frederick claims the inheritance/)).toBeInTheDocument();
    expect(await screen.findByTestId("card-canon-relation-suggestion-event-1")).toBeInTheDocument();
    expect(screen.queryByTestId("card-canon-relation-suggestion-object-1")).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-current/relations/suggest",
      { method: "POST" },
    );
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-current/relations",
      expect.objectContaining({ method: "POST" }),
    );

    fireEvent.click(within(await screen.findByTestId("card-canon-relation-suggestion-location-1"))
      .getByRole("button", { name: "Add" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-current/relations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          to_record_id: "location-1",
          relation_type: "located_at",
          details: "The event takes place there.",
          create_only: true,
          expected_source_version: 3,
          expected_target_version: 2,
          story_id: "story-ledger",
        }),
      }),
    ));
    await waitFor(() => expect(screen.queryByTestId("card-canon-relation-suggestion-location-1")).not.toBeInTheDocument());
    expect(screen.getByTestId("card-canon-relation-suggestion-character-1")).toBeInTheDocument();
    expect(screen.getByTestId("card-canon-relation-suggestion-event-1")).toBeInTheDocument();
    await waitFor(() => expect(
      apiFetch.mock.calls.filter(([path, init]) =>
        path === "/v1/editorial/canon-records/canon-current/relations" && !init,
      ).length,
    ).toBe(2));
  });

  it("does not offer a suggestion that is already related", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/relations") && !init) {
        return Promise.resolve({
          relations: [{
            fromRecordId: "canon-current",
            toRecordId: "character-1",
            relationType: "related",
            targetName: "Frederick",
            targetCanonType: "character",
            targetStatus: "accepted",
          }],
        });
      }
      if (path.endsWith("/relations/suggest")) {
        return Promise.resolve({
          suggestions: [{
            toRecordId: "character-1",
            targetName: "Frederick",
            targetCanonType: "character",
            relationType: "rival",
            details: "Already linked.",
            rationale: "This is already connected.",
            sourceVersion: 1,
            targetVersion: 2,
            storyId: "story-ledger",
            sourceEvidence: "Already related source.",
            targetEvidence: "Already related target.",
          }],
        });
      }
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      return Promise.resolve({});
    });

    renderConnections();
    fireEvent.click(await screen.findByRole("button", { name: "Suggest relationships" }));
    await waitFor(() => expect(screen.queryByTestId("card-canon-relation-suggestion-character-1")).not.toBeInTheDocument());
    expect(screen.getByTestId("status-canon-relation-suggestions-already-related")).toBeInTheDocument();
    expect(screen.queryByTestId("button-add-suggested-relation-character-1")).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-current/relations",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("discards late suggestions when the record or world changes", async () => {
    let resolveOldSuggestion: ((value: { suggestions: Array<Record<string, unknown>> }) => void) | undefined;
    const lateResponse = new Promise<{ suggestions: Array<Record<string, unknown>> }>(resolve => {
      resolveOldSuggestion = resolve;
    });
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/relations/suggest")) return lateResponse;
      if (path.includes("/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/relations") && !init) return Promise.resolve({ relations: [] });
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      return Promise.resolve({});
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <CanonRecordConnections recordId="canon-current" worldId="world-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Suggest relationships" }));
    expect(await screen.findByTestId("status-canon-relation-suggestions-loading")).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={queryClient}>
        <CanonRecordConnections recordId="canon-next" worldId="world-2" />
      </QueryClientProvider>,
    );
    resolveOldSuggestion?.({
      suggestions: [{
        toRecordId: "stale-record",
        targetName: "Stale record",
        targetCanonType: "character",
        relationType: "related",
        details: "Old details",
        rationale: "Old rationale",
        sourceVersion: 1,
        targetVersion: 2,
        storyId: "story-ledger",
        sourceEvidence: "Old source excerpt.",
        targetEvidence: "Old target excerpt.",
      }],
    });

    await waitFor(() => expect(screen.queryByText("Stale record")).not.toBeInTheDocument());
    expect(screen.getByTestId("status-canon-relation-suggestions-empty")).toBeInTheDocument();
  });

  it("distinguishes the initial state from a generated empty result", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/relations") && !init) return Promise.resolve({ relations: [] });
      if (path.endsWith("/relations/suggest") && init?.method === "POST") {
        return Promise.resolve({ suggestions: [] });
      }
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      return Promise.resolve({});
    });

    renderConnections();
    expect(await screen.findByTestId("status-canon-relation-suggestions-empty")).toHaveTextContent("Choose Suggest relationships");
    fireEvent.click(screen.getByRole("button", { name: "Suggest relationships" }));
    expect(await screen.findByTestId("status-canon-relation-suggestions-no-strong-links"))
      .toHaveTextContent("No strong links found. Connect this record to a storyline first");
    expect(screen.queryByTestId("status-canon-relation-suggestions-empty")).not.toBeInTheDocument();
  });

  it("removes stale proposals and refreshes relationships after a version conflict", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/relations") && !init) return Promise.resolve({ relations: [] });
      if (path.endsWith("/relations/suggest") && init?.method === "POST") {
        return Promise.resolve({
          suggestions: [{
            toRecordId: "character-1",
            targetName: "Frederick",
            targetCanonType: "character",
            relationType: "rival",
            details: "Competing heirs.",
            rationale: "Their goals conflict.",
            sourceVersion: 5,
            targetVersion: 8,
            storyId: "story-ledger",
            sourceEvidence: "Source excerpt.",
            targetEvidence: "Target excerpt.",
          }],
        });
      }
      if (path.endsWith("/relations") && init?.method === "POST") {
        return Promise.reject(Object.assign(new Error("Record version changed"), { status: 409 }));
      }
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      return Promise.resolve({});
    });

    renderConnections();
    fireEvent.click(await screen.findByRole("button", { name: "Suggest relationships" }));
    const card = await screen.findByTestId("card-canon-relation-suggestion-character-1");
    fireEvent.click(within(card).getByRole("button", { name: "Add" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-current/relations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          to_record_id: "character-1",
          relation_type: "rival",
          details: "Competing heirs.",
          create_only: true,
          expected_source_version: 5,
          expected_target_version: 8,
          story_id: "story-ledger",
        }),
      }),
    ));
    expect(await screen.findByTestId("status-canon-relation-suggestions-error"))
      .toHaveTextContent("Relationships were refreshed; generate new suggestions before adding it.");
    expect(screen.queryByTestId("card-canon-relation-suggestion-character-1")).not.toBeInTheDocument();
    await waitFor(() => expect(
      apiFetch.mock.calls.filter(([path, init]) =>
        path === "/v1/editorial/canon-records/canon-current/relations" && !init,
      ).length,
    ).toBe(2));
  });

  it("shows suggestion and add errors without silently losing the proposal", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/relations") && !init) return Promise.resolve({ relations: [] });
      if (path.endsWith("/relations/suggest") && init?.method === "POST") {
        return Promise.resolve({
          suggestions: [{
            toRecordId: "character-1",
            targetName: "Frederick",
            targetCanonType: "character",
            relationType: "rival",
            details: "Competing heirs.",
            rationale: "Their goals conflict.",
          }],
        });
      }
      if (path.endsWith("/relations") && init?.method === "POST") {
        return Promise.reject(new Error("Permission denied"));
      }
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      return Promise.resolve({});
    });

    const firstRender = renderConnections();
    fireEvent.click(await screen.findByRole("button", { name: "Suggest relationships" }));
    const suggestion = await screen.findByTestId("card-canon-relation-suggestion-character-1");
    fireEvent.click(within(suggestion).getByRole("button", { name: "Add" }));
    expect(await within(suggestion).findByRole("alert")).toHaveTextContent("Permission denied");
    expect(screen.getByTestId("card-canon-relation-suggestion-character-1")).toBeInTheDocument();

    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.includes("/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/relations") && !init) return Promise.resolve({ relations: [] });
      if (path.endsWith("/relations/suggest")) return Promise.reject(new Error("Suggestion service unavailable"));
      if (path.includes("/stories?")) return Promise.resolve({ stories: [] });
      if (path.endsWith("/story-links") && !init) return Promise.resolve({ story_links: [] });
      return Promise.resolve({});
    });

    firstRender.unmount();
    // A fresh render isolates the request failure from the previous proposal state.
    renderConnections();
    fireEvent.click(await screen.findByRole("button", { name: "Suggest relationships" }));
    expect(await screen.findByTestId("status-canon-relation-suggestions-error")).toHaveTextContent("Suggestion service unavailable");
  });
});