import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SuperHelpCenter from "@/pages/super/HelpCenter";

const { update } = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    helpApi: {
      list: vi.fn().mockResolvedValue([
        {
          id: "h-1",
          title: "Live article",
          body: "Body",
          category: "orders",
          kind: "article",
          scope: "platform",
          status: "live",
          createdBy: "u-1",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "h-2",
          title: "Draft article",
          body: "Body",
          category: "orders",
          kind: "article",
          scope: "platform",
          status: "draft",
          createdBy: "u-1",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
        {
          id: "h-3",
          title: "Live FAQ",
          body: "Body",
          category: "orders",
          kind: "faq",
          scope: "platform",
          status: "live",
          createdBy: "u-1",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        },
      ]),
      update,
      delete: vi.fn(),
    },
  };
});

vi.mock("@/components/help/HelpArticleForm", () => ({
  HelpArticleForm: ({ initial }: { initial?: { title: string } }) => (
    <div data-testid="article-form">{initial?.title ?? "New article"}</div>
  ),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SuperHelpCenter />
    </QueryClientProvider>,
  );
}

describe("SuperHelpCenter navigation", () => {
  beforeEach(() => {
    update.mockReset();
    update.mockResolvedValue({});
  });

  it("keeps filtered tab counts aligned and omits fabricated view analytics", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Live article");

    await user.click(screen.getByRole("button", { name: "live" }));

    expect(screen.getByRole("button", { name: /Articles1/i })).toHaveTextContent(/Articles\s*1/i);
    expect(screen.getByRole("button", { name: /FAQs1/i })).toHaveTextContent(/FAQs\s*1/i);
    expect(screen.queryByText(/Views 30d/i)).not.toBeInTheDocument();
  });

  it("opens the editor from the row while the status control remains independent", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Live article");

    await user.click(screen.getByRole("button", { name: "Unpublish Live article" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith("h-1", { status: "draft" }));
    expect(screen.queryByTestId("article-form")).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Edit Live article" })[0]);
    expect(await screen.findByTestId("article-form")).toHaveTextContent("Live article");
  });
});