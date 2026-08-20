import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, navigate, getWorld } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
  getWorld: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => getWorld(),
}));
vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocation: () => ["/super/worldsmith/editorial/stories", navigate],
}));

import StoriesStudio from "@/pages/super/worldsmith-editorial/StoriesStudio";

describe("Storylines suggestion world switching", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    navigate.mockReset();
    getWorld.mockReturnValue({
      selectedWorldId: "world-a",
      selectedWorld: { id: "world-a", name: "World A" },
    });
  });

  it("does not show a late response from the previous world", async () => {
    let resolveWorldA!: (value: unknown) => void;
    const worldAResponse = new Promise(resolve => { resolveWorldA = resolve; });

    apiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/v1/editorial/stories/suggest") {
        const worldId = JSON.parse(String(options?.body)).world_id;
        if (worldId === "world-a") return worldAResponse;
        return Promise.resolve({
          suggestions: [{
            title: "World B’s Lantern",
            rationale: "Grounded in World B.",
            narrativePromise: "A World B promise.",
            recommendedStatus: "planned",
          }],
        });
      }
      return Promise.resolve({ stories: [] });
    });

    const view = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/stories/suggest",
      expect.objectContaining({ body: JSON.stringify({ world_id: "world-a" }) }),
    ));

    getWorld.mockReturnValue({
      selectedWorldId: "world-b",
      selectedWorld: { id: "world-b", name: "World B" },
    });
    view.rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    expect(screen.queryByText("World A’s Lantern")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("World B’s Lantern")).toBeInTheDocument());

    resolveWorldA({
      suggestions: [{
        title: "World A’s Lantern",
        rationale: "Grounded in World A.",
        narrativePromise: "A World A promise.",
        recommendedStatus: "planned",
      }],
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText("World A’s Lantern")).not.toBeInTheDocument();
  });
});