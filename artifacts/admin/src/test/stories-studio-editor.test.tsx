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
});