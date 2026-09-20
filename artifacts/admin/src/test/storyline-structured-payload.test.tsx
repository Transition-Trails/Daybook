import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, navigate, useSearch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
  useSearch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorld: { id: "world-wychcombe", name: "Wychcombe", code: "WYC" },
    worlds: [{ id: "world-wychcombe", name: "Wychcombe", code: "WYC" }],
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/super/worldsmith/editorial/stories/new", navigate],
  useSearch,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import StorylineEditor from "@/pages/super/worldsmith-editorial/StorylineEditor";

function renderEditor(storyId?: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StorylineEditor storyId={storyId} />
    </QueryClientProvider>,
  );
}

describe("StorylineEditor - Structured Payload", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    navigate.mockReset();
    useSearch.mockReturnValue("");
  });

  it("persists globalMetadata, storySpine, and revealArchitecture", async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes("/vocabularies")) return { vocabularies: [] };
      if (path.includes("/stories") && !path.includes("/scenes") && !path.includes("/beats") && !path.includes("/reveals")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return {
          story: {
            id: "story-1", 
            worldId: "world-wychcombe", 
            title: body.title || "Test Story",
            status: "draft", 
            summary: "",
            acts: [],
            globalMetadata: body.global_metadata || {},
          },
        };
      }
      if (path.includes("/beats")) return { beats: [] };
      if (path.includes("/reveals")) return { reveals: [] };
      return { scenes: [] };
    });

    renderEditor();

    await waitFor(() => expect(screen.getByText("Add Story Beat")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Name this adventure"), { target: { value: "The Missing Heir" } });
    
    // Add Story Beat
    fireEvent.click(screen.getByText("Add Story Beat"));
    
    // In the repeated item, type a title
    const beatTitleInput = screen.getAllByRole("textbox").find(el => el.previousElementSibling?.textContent === "Beat Title");
    fireEvent.change(beatTitleInput!, { target: { value: "A mysterious letter arrives" } });

    // Add Reveal Track
    fireEvent.click(screen.getByText("Add Reveal Track"));
    
    const truthInput = screen.getAllByRole("textbox").find(el => el.previousElementSibling?.textContent === "The Secret / Truth");
    fireEvent.change(truthInput!, { target: { value: "The heir is alive" } });

    fireEvent.click(screen.getByTestId("button-save-storyline"));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/stories/story-1/beats",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringMatching(/"title":"A mysterious letter arrives"/),
      }),
    ));

    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/stories/story-1/reveals",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringMatching(/"truth":"The heir is alive"/),
      }),
    );
  });
});
