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
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ world_id: "world-1", force_refresh: true }),
        }),
      );
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/stories/suggest",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ world_id: "world-1", force_refresh: true }),
        }),
      );
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/owner-discoveries/generated",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"story_suggestions":[{"title":"New Story"'),
        }),
      );
    });
    expect(await screen.findByTestId("generated-ideas-result")).toHaveTextContent(
      "2 new ideas added to Discovery Review.",
    );
  });

  it("saves available ideas and reports which suggestion source failed", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/owner-discoveries") return Promise.resolve({ discoveries: [] });
      if (path === "/v1/editorial/canon-records") return Promise.resolve({ canon_records: [] });
      if (path === "/v1/editorial/canon-records/suggest") return Promise.reject(new Error("Canon generation timed out"));
      if (path === "/v1/editorial/stories/suggest") return Promise.resolve({ suggestions: [{ title: "A Story" }] });
      if (path === "/v1/editorial/owner-discoveries/generated") return Promise.resolve({ created_count: 1 });
      return Promise.resolve({});
    });
    renderQueue();
    fireEvent.click(await screen.findByTestId("button-generate-ideas"));
    expect(await screen.findByTestId("generated-ideas-result")).toHaveTextContent("Canon ideas could not be generated");
    expect(apiFetch).toHaveBeenCalledWith("/v1/editorial/owner-discoveries/generated",
      expect.objectContaining({ body: expect.stringContaining('"story_suggestions":[{"title":"A Story"}]') }));
  });

  it("shows the error instead of saving an empty batch when both suggestion sources fail", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/owner-discoveries") return Promise.resolve({ discoveries: [] });
      if (path === "/v1/editorial/canon-records") return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/suggest")) return Promise.reject(new Error("No usable suggestions returned"));
      return Promise.resolve({});
    });
    renderQueue();
    fireEvent.click(await screen.findByTestId("button-generate-ideas"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No usable suggestions returned");
    expect(apiFetch).not.toHaveBeenCalledWith("/v1/editorial/owner-discoveries/generated", expect.anything());
  });

  it("accepts a submitted Canon idea directly and shows where it went", async () => {
    apiFetch.mockImplementation((path: string, options?: { method?: string; body?: string }) => {
      if (path.startsWith("/v1/editorial/owner-discoveries?")) return Promise.resolve({ discoveries: [{
        id: "idea-1", title: "The Glass Orchard", status: "submitted",
        submissionSnapshot: { discovery_kind: "canon_idea", name: "The Glass Orchard", canonType: "location", narrativeDetails: "A place to remember." },
      }] });
      if (path.startsWith("/v1/editorial/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path === "/v1/editorial/owner-discoveries/idea-1/accept") {
        expect(options?.body).toContain('"name":"The Glass Orchard"');
        return Promise.resolve({ discovery: { id: "idea-1", status: "accepted", editorialCanonRecordId: "canon-new" } });
      }
      return Promise.resolve({});
    });
    renderQueue();
    const accept = await screen.findByRole("button", { name: "Accept" });
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/v1/editorial/owner-discoveries/idea-1/accept", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Canon idea accepted and linked to Canon.");
    expect(screen.getByRole("link", { name: "View Canon record" })).toHaveAttribute("href", "/super/worldsmith/editorial/canon/canon-new");
  });

  it("explains why a Canon idea cannot link until a record is selected", async () => {
    renderQueue();
    await screen.findByRole("button", { name: "Accept" });
    fireEvent.change(screen.getByRole("combobox", { name: "Canon acceptance mode" }), { target: { value: "existing" } });
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select an editorial Canon record to link");
    expect(apiFetch).not.toHaveBeenCalledWith("/v1/editorial/owner-discoveries/idea-1/accept", expect.anything());
  });

  it("accepts an idea already in review using its proposed Canon details", async () => {
    renderQueue();
    const accept = await screen.findByRole("button", { name: "Accept" });
    expect(screen.getByTestId("status-selected-discovery")).toHaveTextContent("in review");
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/owner-discoveries/idea-1/accept",
      expect.objectContaining({
        body: expect.stringContaining('"narrative_details":"Silver fruit holds reflections of forgotten visitors."'),
      }),
    ));
  });

  it("saves edits before accepting a submitted storyline idea", async () => {
    const requests: string[] = [];
    apiFetch.mockImplementation((path: string, options?: { body?: string }) => {
      if (path.startsWith("/v1/editorial/owner-discoveries?")) return Promise.resolve({ discoveries: [{
        id: "story-idea", title: "The Old House", status: "submitted",
        submissionSnapshot: { discovery_kind: "storyline_idea", title: "The Old House", narrativePromise: "An old promise.", rationale: "A gap.", recommendedStatus: "draft" },
      }] });
      if (path.startsWith("/v1/editorial/canon-records?")) return Promise.resolve({ canon_records: [] });
      if (path.endsWith("/revise")) {
        requests.push("revise");
        expect(options?.body).toContain('"title":"The New House"');
        return Promise.resolve({ discovery: { status: "in_review" } });
      }
      if (path.endsWith("/accept")) {
        requests.push("accept");
        return Promise.resolve({ discovery: { status: "accepted", storyId: "story-new" } });
      }
      return Promise.resolve({});
    });
    renderQueue();
    const accept = await screen.findByRole("button", { name: "Accept storyline" });
    fireEvent.change(screen.getByDisplayValue("The Old House"), { target: { value: "The New House" } });
    fireEvent.click(accept);
    expect(await screen.findByRole("status")).toHaveTextContent("Storyline idea accepted and added to Storylines.");
    expect(requests).toEqual(["revise", "accept"]);
    expect(screen.getByRole("link", { name: "View storyline" })).toHaveAttribute("href", "/super/worldsmith/editorial/stories/story-new");
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