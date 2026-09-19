import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({ selectedWorldId: "world-1" }),
}));
vi.mock("@/pages/super/worldsmith-editorial/EditorialShell", () => ({
  useEditorialPageFilters: vi.fn(),
}));

import EditorialReviewQueue from "@/pages/super/worldsmith-editorial/EditorialReviewQueue";

function renderQueue() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <EditorialReviewQueue />
    </QueryClientProvider>,
  );
}

describe("EditorialReviewQueue", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path.startsWith("/v1/editorial/owner-discoveries?")) {
        return Promise.resolve({
          discoveries: [{
            id: "idea-1",
            title: "The Glass Orchard",
            status: "in_review",
            storyMoment: "A missing location for the current story.",
            submissionSnapshot: {
              discovery_kind: "canon_idea",
              name: "The Glass Orchard",
              canonType: "location",
              rationale: "The story needs a place where memory becomes visible.",
              narrativeDetails: "Silver fruit holds reflections of forgotten visitors.",
            },
            revisions: [],
          }],
        });
      }
      if (path.startsWith("/v1/editorial/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path === "/v1/editorial/canon-records/suggest") {
        return Promise.resolve({ suggestions: [{ name: "New Canon", canonType: "object" }] });
      }
      if (path === "/v1/editorial/stories/suggest") {
        return Promise.resolve({ suggestions: [{ title: "New Story", recommendedStatus: "draft" }] });
      }
      if (path === "/v1/editorial/owner-discoveries/generated") {
        expect(options?.method).toBe("POST");
        return Promise.resolve({ created_count: 2 });
      }
      return Promise.resolve({ discovery: { id: "idea-1" } });
    });
  });

  it("generates Canon and Storyline ideas only from the central review page", async () => {
    renderQueue();

    fireEvent.click(await screen.findByTestId("button-generate-ideas"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/canon-records/suggest",
        expect.objectContaining({ method: "POST" }),
      );
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/stories/suggest",
        expect.objectContaining({ method: "POST" }),
      );
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/owner-discoveries/generated",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"story_suggestions":[{"title":"New Story"'),
        }),
      );
    });
  });

  it("requires an explanation before a generated idea can be rejected", async () => {
    renderQueue();

    const reject = await screen.findByRole("button", { name: "Reject" });
    expect(reject).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("A reason is required before rejecting this discovery."), {
      target: { value: "It duplicates an established location." },
    });
    expect(reject).toBeEnabled();

    fireEvent.click(reject);
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/owner-discoveries/idea-1/reject",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "It duplicates an established location." }),
        }),
      );
    });
  });
});