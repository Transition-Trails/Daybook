import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, toast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId: "world-wychcombe",
    selectedWorld: { id: "world-wychcombe", name: "Wychcombe" },
  }),
}));
vi.mock("@/pages/super/worldsmith-editorial/EditorialShell", () => ({
  useEditorialPageFilters: vi.fn(),
}));
vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSearch: () => "?story_id=story-1",
}));

import StoryConnections from "@/pages/super/worldsmith-editorial/StoryConnections";

describe("StoryConnections Movement title editing", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    toast.mockReset();
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/acts/act-2" && init?.method === "PATCH") {
        return Promise.resolve({
          act: {
            id: "act-2",
            storyId: "story-1",
            actNumber: 2,
            title: "The Survey Expands",
            narrative: "Move beyond formal architecture.",
          },
        });
      }
      if (path.startsWith("/v1/editorial/story-connections")) {
        return Promise.resolve({
          stories: [{
            id: "story-1",
            title: "The First Harcourt Survey",
            summary: "A young architect arrives.",
            status: "active",
            acts: [{
              id: "act-2",
              storyId: "story-1",
              actNumber: 2,
              title: "Movement 2",
              narrative: "Move beyond formal architecture.",
            }],
          }],
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

  it("edits and saves an existing Movement title from the Story map", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoryConnections />
      </QueryClientProvider>,
    );

    const title = await screen.findByRole("textbox", { name: "Movement 2 title" });
    fireEvent.change(title, { target: { value: "The Survey Expands" } });
    fireEvent.click(screen.getByRole("button", { name: "Save title" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/acts/act-2",
      {
        method: "PATCH",
        body: JSON.stringify({ title: "The Survey Expands" }),
      },
    ));
  });
});