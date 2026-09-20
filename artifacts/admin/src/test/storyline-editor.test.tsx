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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...render(
    <QueryClientProvider client={queryClient}>
      <StorylineEditor storyId={storyId} />
    </QueryClientProvider>,
    ),
    queryClient,
  };
}

describe("StorylineEditor", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    navigate.mockReset();
    useSearch.mockReturnValue("");
  });

  it("prefills and creates a storyline from a suggestion URL", async () => {
    useSearch.mockReturnValue("?title=The+Ashcroft+Lantern&summary=A+keeper+follows+the+light.&status=planned");
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/beats")) return { beats: [] };
      if (path.includes("/reveals")) return { reveals: [] };
      if (path.includes("/vocabularies")) return { vocabularies: [] };
      return { story: { id: "story-2", title: "The Ashcroft Lantern", worldId: "world-wychcombe" } };
    });

    const { queryClient } = renderEditor();
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
          global_metadata: {},
        }),
      }),
    ));

    // Also expects beat / reveal saves
    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/stories/story-2/beats",
      expect.objectContaining({ method: "PUT" })
    );
    expect(navigate).toHaveBeenCalledWith("/super/worldsmith/editorial/stories/story-2");
    expect(queryClient.getQueryData<{ story: { acts?: unknown[] } }>(["editorial-story", "story-2"]))
      .toMatchObject({ story: { acts: [] } });
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
             acts: [{
               id: "act-1",
               storyId: "story-1",
               actNumber: 1,
               title: "The Departure",
               tagline: "",
               narrative: "Move the characters beyond the familiar.",
             }],
          },
        });
      }
      if (path.includes("/beats")) return Promise.resolve({ beats: [] });
      if (path.includes("/reveals")) return Promise.resolve({ reveals: [] });
      return Promise.resolve({ story: { id: "story-1", title: "The First Crossing" } });
    });

    renderEditor("story-1");
    await screen.findByRole("heading", { name: "The First Crossing — Storyline" });
    expect(screen.getByDisplayValue("The Departure")).toBeInTheDocument();
    expect(screen.getByText("Movement / Act purpose")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Move the characters beyond the familiar.")).toBeInTheDocument();
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
          global_metadata: {}
        }),
      }),
    ));

    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/stories/story-1/beats",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("opens a saved storyline when prompt context is returned as a string", async () => {
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
      if (path.includes("/field-context")) {
        return Promise.resolve({
          context: {
            prompt: "A winter crossing shaped by Wychcombe Canon",
            warnings: [],
            attributions: [],
          },
        });
      }
      if (path.includes("/beats")) return Promise.resolve({ beats: [] });
      if (path.includes("/reveals")) return Promise.resolve({ reveals: [] });
      if (path.includes("/scenes")) return Promise.resolve({ scenes: [] });
      if (path.includes("/context-snapshots/")) {
        return Promise.resolve({ status: { status: "not_generated" } });
      }
      return Promise.resolve({});
    });

    renderEditor("story-1");

    expect(await screen.findByRole("heading", { name: "The First Crossing — Storyline" })).toBeInTheDocument();
    expect(screen.getByText("A winter crossing shaped by Wychcombe Canon")).toBeInTheDocument();
  });

  it("reorders scenes within a movement and moves them to another movement", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/stories/story-scenes") {
        return Promise.resolve({
          story: {
            id: "story-scenes",
            worldId: "world-wychcombe",
            title: "The Winter Passage",
            summary: "",
            status: "draft",
            acts: [
              { id: "act-1", storyId: "story-scenes", actNumber: 1, title: "Departure", tagline: "", narrative: "" },
              { id: "act-2", storyId: "story-scenes", actNumber: 2, title: "Arrival", tagline: "", narrative: "" },
            ],
          },
        });
      }
      if (path === "/v1/editorial/stories/story-scenes/scenes") {
        return Promise.resolve({
          scenes: [
            { id: "scene-1", actId: "act-1", storyId: "story-scenes", worldId: "world-wychcombe", sceneNumber: 1, title: "Pack the Cart", body: "", attributes: {}, canonRecords: [] },
            { id: "scene-2", actId: "act-1", storyId: "story-scenes", worldId: "world-wychcombe", sceneNumber: 2, title: "Close the Gate", body: "", attributes: {}, canonRecords: [] },
            { id: "scene-3", actId: "act-2", storyId: "story-scenes", worldId: "world-wychcombe", sceneNumber: 1, title: "Reach the Inn", body: "", attributes: {}, canonRecords: [] },
          ],
        });
      }
      if (path === "/v1/editorial/scenes/scene-2/move" && init?.method === "POST") {
        return Promise.resolve({
          scenes: [
            { id: "scene-2", actId: "act-1", sceneNumber: 1 },
            { id: "scene-1", actId: "act-1", sceneNumber: 2 },
          ],
        });
      }
      if (path === "/v1/editorial/scenes/scene-1/move" && init?.method === "POST") {
        return Promise.resolve({
          scenes: [
            { id: "scene-2", actId: "act-1", sceneNumber: 1 },
            { id: "scene-3", actId: "act-2", sceneNumber: 1 },
            { id: "scene-1", actId: "act-2", sceneNumber: 2 },
          ],
        });
      }
      if (path.includes("/beats")) return Promise.resolve({ beats: [] });
      if (path.includes("/reveals")) return Promise.resolve({ reveals: [] });
      if (path.includes("/context-snapshot")) return Promise.resolve({ snapshot: { status: "not_generated" } });
      if (path.includes("/field-context")) return Promise.resolve({ context: { prompt: "", warnings: [], attributions: [] } });
      return Promise.resolve({});
    });

    renderEditor("story-scenes");

    fireEvent.click(await screen.findByRole("button", { name: "Move Close the Gate up" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/scenes/scene-2/move",
      {
        method: "POST",
        body: JSON.stringify({ act_id: "act-1", scene_number: 1 }),
      },
    ));

    fireEvent.change(screen.getByRole("combobox", { name: "Move Pack the Cart to movement" }), {
      target: { value: "act-2" },
    });
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/scenes/scene-1/move",
      {
        method: "POST",
        body: JSON.stringify({ act_id: "act-2", scene_number: 2 }),
      },
    ));
  });
});