import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, navigate, useSearch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
  useSearch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorld: { id: "world-wychcombe", name: "Wychcombe", code: "WYC" },
    worlds: [{ id: "world-wychcombe", name: "Wychcombe", code: "WYC" }],
  }),
}));
vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocation: () => ["/super/worldsmith/editorial/stories/new", navigate],
  useSearch,
}));

import StorylineEditor from "@/pages/super/worldsmith-editorial/StorylineEditor";

function renderEditor(storyId?: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <StorylineEditor storyId={storyId} />
    </QueryClientProvider>,
  );
}

describe("StorylineEditor", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    navigate.mockReset();
    useSearch.mockReturnValue("");
  });

  it("prefills and creates a storyline from a suggestion URL", async () => {
    useSearch.mockReturnValue("?title=The+Ashcroft+Lantern&summary=A+keeper+follows+the+light.&status=planned");
    apiFetch.mockResolvedValue({ story: { id: "story-2", title: "The Ashcroft Lantern" } });

    renderEditor();
    expect(screen.getByRole("heading", { name: "New Storyline" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("The Ashcroft Lantern")).toBeInTheDocument();
    expect(screen.getByDisplayValue("planned")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create storyline" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/stories",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          world_id: "world-wychcombe",
          title: "The Ashcroft Lantern",
          summary: "A keeper follows the light.",
          status: "planned",
        }),
      }),
    ));
    expect(navigate).toHaveBeenCalledWith("/super/worldsmith/editorial/stories");
  });

  it("loads an existing storyline and persists the rich narrative promise", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/stories/story-1") {
        return Promise.resolve({
          story: {
            id: "story-1",
            worldId: "world-wychcombe",
            title: "The First Crossing",
            summary: "<p>Existing promise</p>",
            status: "draft",
            acts: [],
          },
        });
      }
      return Promise.resolve({ story: { id: "story-1", title: "The First Crossing" } });
    });

    renderEditor("story-1");
    await screen.findByRole("heading", { name: "The First Crossing — Storyline" });
    const narrative = screen.getAllByRole("textbox").find(field => field.getAttribute("contenteditable") === "true");
    expect(narrative).toBeDefined();
    narrative!.innerHTML = "<p>A <strong>new</strong> promise.</p>";
    fireEvent.input(narrative!);
    fireEvent.click(screen.getByRole("button", { name: "Save storyline" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/stories/story-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "The First Crossing",
          summary: "<p>A <strong>new</strong> promise.</p>",
          status: "draft",
        }),
      }),
    ));
  });
});