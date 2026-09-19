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
});