import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

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
}));

import StoriesStudio from "@/pages/super/worldsmith-editorial/StoriesStudio";

describe("StoriesStudio editor", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockResolvedValue({
      stories: [{
        id: "story-1",
        title: "The Wychcombe Origin Story",
        summary: "<p>A promise <em>worth keeping</em>.</p>",
        status: "draft",
        acts: [],
      }],
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
});