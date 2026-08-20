import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, navigate } = vi.hoisted(() => ({ apiFetch: vi.fn(), navigate: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId: "world-wychcombe",
    selectedWorld: { id: "world-wychcombe", name: "Wychcombe" },
  }),
}));
vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocation: () => ["/super/worldsmith/editorial/stories", navigate],
}));

import StoriesStudio from "@/pages/super/worldsmith-editorial/StoriesStudio";

describe("StoriesStudio editor", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    navigate.mockReset();
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/stories/suggest") {
        return Promise.resolve({
          suggestions: [{
            title: "The Ashcroft Lantern",
            rationale: "A lost light exposes a hidden path through Wychcombe.",
            narrativePromise: "A reluctant keeper must carry a dangerous lantern before the town’s oldest secret consumes it.",
            recommendedStatus: "planned",
          }],
        });
      }
      return Promise.resolve({
        stories: [{
          id: "story-1",
          title: "The Wychcombe Origin Story",
          summary: "<p>A promise <em>worth keeping</em>.</p>",
          status: "draft",
          acts: [],
        }],
      });
    });
  });

  it("allows the title and narrative promise to be edited and saved", async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    const title = await screen.findByRole("textbox", { name: "Story title" });
    expect(container.querySelector(".w-full.px-7.py-7")).toBeInTheDocument();
    expect(title).toHaveClass("w-full");
    expect(screen.getByText("The Wychcombe Origin Story")).toHaveClass("break-words");

    fireEvent.change(title, { target: { value: "The Wychcombe Inheritance" } });
    fireEvent.blur(title);

    const narrative = screen.getAllByRole("textbox").find(field => field.getAttribute("contenteditable") === "true");
    expect(narrative).toBeDefined();
    narrative!.innerHTML = "<p>Readers inherit <strong>a living mystery</strong>.</p>";
    fireEvent.input(narrative!);
    fireEvent.blur(narrative!);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/stories/story-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ title: "The Wychcombe Inheritance" }),
        }),
      );
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/stories/story-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ summary: "<p>Readers inherit <strong>a living mystery</strong>.</p>" }),
        }),
      );
    });
  });

  it("opens a prefilled full-page editor from a suggested storyline card", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Suggested storylines" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Create record/ }));

    expect(navigate).toHaveBeenCalledWith(
      "/super/worldsmith/editorial/stories/new?title=The%20Ashcroft%20Lantern&summary=A%20reluctant%20keeper%20must%20carry%20a%20dangerous%20lantern%20before%20the%20town%E2%80%99s%20oldest%20secret%20consumes%20it.&status=planned",
    );
  });
});