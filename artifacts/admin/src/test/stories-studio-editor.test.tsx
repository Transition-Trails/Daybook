import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, navigate, toast, useSearch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
  useSearch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId: "world-wychcombe",
    selectedWorld: { id: "world-wychcombe", name: "Wychcombe" },
  }),
}));
vi.mock("wouter", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useLocation: () => ["/super/worldsmith/editorial/stories", navigate],
  useSearch,
}));

import StoriesStudio from "@/pages/super/worldsmith-editorial/StoriesStudio";

describe("StoriesStudio editor", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    navigate.mockReset();
    toast.mockReset();
    useSearch.mockReturnValue("");
    apiFetch.mockImplementation((path: string) => {
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

  it("directs editors to Discovery Review instead of generating ideas locally", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Ideas are generated and reviewed in Discovery Review.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Suggested storylines" })).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalledWith("/v1/editorial/stories/suggest", expect.anything());
  });

  it("edits an existing Movement/Act after it has been created", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/acts/act-1" && init?.method === "PATCH") {
        const submitted = JSON.parse(String(init.body));
        return Promise.resolve({
          act: {
            id: "act-1",
            storyId: "story-1",
            actNumber: 1,
            tagline: "",
            title: submitted.title,
            narrative: submitted.narrative,
          },
        });
      }
      return Promise.resolve({
        stories: [{
          id: "story-1",
          title: "The Wychcombe Origin Story",
          summary: "<p>A promise worth keeping.</p>",
          status: "draft",
          acts: [{
            id: "act-1",
            storyId: "story-1",
            actNumber: 1,
            title: "The Departure",
            tagline: "",
            narrative: "Leave the familiar world.",
          }],
        }],
      });
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    const name = await screen.findByRole("textbox", { name: "Movement 1 name" });
    const purpose = screen.getByRole("textbox", { name: "Movement 1 purpose" });
    fireEvent.change(name, { target: { value: "The Crossing" } });
    fireEvent.change(purpose, { target: { value: "Force the household beyond safety." } });
    fireEvent.click(screen.getByRole("button", { name: "Save movement" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/acts/act-1",
      {
        method: "PATCH",
        body: JSON.stringify({
          title: "The Crossing",
          narrative: "Force the household beyond safety.",
        }),
      },
    ));
  });

  it("sequences story cards, groups simultaneous stories, and separates them again", async () => {
    let stories = ["Origin", "Letters", "Return"].map((title, index) => ({
      id: `story-${index + 1}`, title, summary: "<p>At the manor.</p>", status: "draft",
      sortOrder: 0, sequenceRole: "chronological" as const, acts: [],
    }));
    const saves: string[][][] = [];
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/stories/sequence" && init?.method === "POST") {
        const { world_id, groups, references, expected, expected_revision } = JSON.parse(String(init.body));
        expect(world_id).toBe("world-wychcombe");
        expect(references).toEqual([]);
        expect(expected_revision).toBe(saves.length);
        expect(expected).toEqual(expect.arrayContaining(
          stories.map(({ id, sortOrder }) => ({ id, sort_order: sortOrder, sequence_role: "chronological" })),
        ));
        saves.push(groups);
        stories = groups.flatMap((group: string[], index: number) =>
          group.map(id => ({ ...stories.find(story => story.id === id)!, sortOrder: index + 1 })));
        return Promise.resolve({ stories: stories.map(({ id, sortOrder, sequenceRole }) => ({ id, sortOrder, sequenceRole })), revision: saves.length });
      }
      return Promise.resolve({ stories, sequenceRevision: saves.length });
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );
    await screen.findByRole("textbox", { name: "Story title" });
    fireEvent.click(screen.getByTestId("button-storylines-sequence-view"));
    expect(screen.getByTestId("count-sequence-moments")).toHaveTextContent("3 moments");
    fireEvent.click(screen.getByRole("button", { name: "Make Origin simultaneous with next moment" }));
    await waitFor(() => expect(saves).toEqual([[["story-2", "story-1"], ["story-3"]]]));
    await waitFor(() => expect(screen.getByTestId("status-simultaneous-1")).toHaveTextContent("Same time"));
    fireEvent.click(screen.getByRole("button", { name: "Give Origin its own moment" }));
    await waitFor(() => expect(saves[1]).toEqual([["story-2"], ["story-1"], ["story-3"]]));
    await waitFor(() => expect(screen.getByTestId("count-sequence-moments")).toHaveTextContent("3 moments"));
    fireEvent.click(screen.getByRole("button", { name: "Open Return" }));
    expect(navigate).toHaveBeenCalledWith("/super/worldsmith/editorial/stories/story-3?world_id=world-wychcombe");
  });

  it("shows an origin reference outside numbered moments and can return it to chronology", async () => {
    useSearch.mockReturnValue("?view=sequence&sequence_id=legacy-origin&story_id=origin");
    let revision = 4;
    let stories = [
      { id: "survey", title: "The First Harcourt Survey", summary: "", status: "draft", sortOrder: 1, sequenceRole: "chronological", acts: [] },
      { id: "origin", title: "The Wychcombe Origin Story", summary: "<p>Spans eras.</p>", status: "draft", sortOrder: 2, sequenceRole: "reference", acts: [{ id: "act-1" }] },
      { id: "later", title: "Later", summary: "", status: "draft", sortOrder: 3, sequenceRole: "chronological", acts: [] },
    ];
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/stories/sequence" && init?.method === "POST") {
        const { groups, references, expected_revision } = JSON.parse(String(init.body));
        expect(expected_revision).toBe(revision);
        revision += 1;
        stories = stories.map(story => ({
          ...story,
          sequenceRole: references.includes(story.id) ? "reference" : "chronological",
          sortOrder: references.includes(story.id) ? story.sortOrder : groups.findIndex((group: string[]) => group.includes(story.id)) + 1,
        }));
        return Promise.resolve({ stories, revision });
      }
      return Promise.resolve({ stories, sequenceRevision: revision });
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );
    await screen.findByTestId("story-sequence-board");
    expect(screen.getByTestId("count-sequence-moments")).toHaveTextContent("2 moments");
    expect(screen.getByTestId("card-reference-story-origin")).toHaveTextContent("1 movement");
    expect(screen.getByTestId("card-reference-story-origin")).toHaveFocus();
    expect(screen.getByTestId("group-sequence-2")).toHaveTextContent("Later");
    fireEvent.click(screen.getByRole("button", { name: "Return The Wychcombe Origin Story to chronology" }));
    await waitFor(() => expect(screen.getByTestId("count-sequence-moments")).toHaveTextContent("3 moments"));
    expect(screen.getByTestId("group-sequence-3")).toHaveTextContent("The Wychcombe Origin Story");
    fireEvent.click(screen.getByRole("button", { name: "Move The Wychcombe Origin Story to references" }));
    await waitFor(() => expect(screen.getByTestId("card-reference-story-origin")).toBeInTheDocument());
  });

  it("opens the sequence board from an MCP sequence deep link", async () => {
    useSearch.mockReturnValue("?view=sequence&sequence_id=sequence-world-wychcombe-1&story_id=story-1");
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("story-sequence-board")).toBeInTheDocument();
    expect(screen.getByTestId("button-storylines-sequence-view")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("group-sequence-1")).toHaveAttribute("data-selected-sequence-group", "true");
    expect(screen.getByTestId("group-sequence-1")).toHaveFocus();
    expect(screen.getByText(/Moment 01/)).toHaveTextContent("Focused from link");
    expect(screen.queryByText("sequence-world-wychcombe-1")).not.toBeInTheDocument();
  });

  it("gracefully leaves a stale sequence deep link unfocused", async () => {
    useSearch.mockReturnValue("?view=sequence&sequence_id=sequence-deleted&story_id=story-deleted");
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("sequence-deeplink-stale")).toBeInTheDocument();
    expect(screen.getByTestId("group-sequence-1")).not.toHaveAttribute("data-selected-sequence-group");
    expect(screen.getByTestId("button-storylines-sequence-view")).toHaveAttribute("aria-pressed", "true");
  });

  it("reports when a legacy sequence deep link has no focus anchor", async () => {
    useSearch.mockReturnValue("?view=sequence&sequence_id=sequence-without-anchor");
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("sequence-deeplink-unfocused")).toBeInTheDocument();
    expect(screen.getByTestId("group-sequence-1")).not.toHaveAttribute("data-selected-sequence-group");
  });

  it("restores the previous order when a sequence save fails", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/stories/sequence" && init?.method === "POST") {
        return Promise.reject(new Error("Storylines changed. Refresh the board and try again."));
      }
      return Promise.resolve({ stories: [
        { id: "a", title: "A", summary: "", status: "draft", sortOrder: 1, acts: [] },
        { id: "b", title: "B", summary: "", status: "planned", sortOrder: 2, acts: [] },
      ] });
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StoriesStudio />
      </QueryClientProvider>,
    );
    await screen.findByRole("textbox", { name: "Story title" });
    fireEvent.click(screen.getByTestId("button-storylines-sequence-view"));
    fireEvent.click(screen.getByRole("button", { name: "Move A later" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not save story sequence",
      variant: "destructive",
    })));
    expect(screen.getByTestId("group-sequence-1")).toContainElement(screen.getByTestId("card-sequence-story-a"));
    expect(screen.getByTestId("group-sequence-2")).toContainElement(screen.getByTestId("card-sequence-story-b"));
  });
});