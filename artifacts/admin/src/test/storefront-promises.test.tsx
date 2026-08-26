import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { navigate, fetchMock } = vi.hoisted(() => ({
  navigate: vi.fn(),
  fetchMock: vi.fn(),
}));

const homeData = {
  store: { id: "store-1", name: "Quiet Pages", slug: "quiet-pages", plan: "pro", status: "active" },
  editions: [{
    id: "edition-1",
    name: "Everyday Planner",
    tier: "classic",
    digitalPriceCents: 1200,
    sections: ["Months", "Weeks"],
    themes: ["theme-1"],
    packs: ["pack-1"],
    inserts: [],
  }],
  themes: [{ id: "theme-1", name: "Garden", colors: ["#112233", "#445566"], price: 4 }],
  packs: [{ id: "pack-1", name: "Planning basics", tags: ["dates", "notes"], price: 3 }],
};

const editionData = {
  store: homeData.store,
  edition: homeData.editions[0],
  themes: [{ id: "theme-1", name: "Garden", colors: ["#112233", "#445566"], palettes: [], backgrounds: [] }],
  packs: [{ id: "pack-1", name: "Planning basics" }],
  inserts: [],
};

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
      if (queryKey[0] === "shop-me") {
        return { data: { id: "buyer-1", name: "Buyer", email: "buyer@example.com" }, isLoading: false };
      }
      if (queryKey[0] === "ink/enabled") {
        return { data: { enabled: false }, isLoading: false };
      }
      if (queryKey[0] === "shop" && queryKey.length === 2) {
        return { data: homeData, isLoading: false, error: null };
      }
      if (queryKey[0] === "shop" && queryKey[2] === "edition") {
        return { data: editionData, isLoading: false, error: null };
      }
      return { data: undefined, isLoading: false, error: null };
    },
  };
});

vi.mock("wouter", () => ({
  useParams: () => ({ storeSlug: "quiet-pages", editionId: "edition-1" }),
  useLocation: () => ["/", navigate],
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  inkApi: { enabled: vi.fn().mockResolvedValue({ enabled: false }) },
}));

import StoreBuilder from "@/pages/shop/StoreBuilder";
import StorefrontHome from "@/pages/shop/StorefrontHome";

describe("public storefront promises", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    navigate.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows themes and packs as unpriced showcases and has no staff sign-in link", () => {
    render(<StorefrontHome />);

    expect(screen.getByText("Garden")).toBeVisible();
    expect(screen.getByText("Planning basics")).toBeVisible();
    expect(screen.getByText("Colour palette")).toBeVisible();
    expect(screen.queryByText("$4.00")).not.toBeInTheDocument();
    expect(screen.queryByText("$3.00")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
    expect(screen.getByText(/generate a personalised PDF planner for your life/i)).toBeVisible();
  });

  it("keeps Drive optional and exposes a direct PDF download after generation", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/planners/preview") {
        return { ok: true, blob: async () => new Blob(["preview"], { type: "application/pdf" }) };
      }
      if (url === "/api/planners") {
        const body = JSON.parse(String(init?.body));
        expect(body.output.saveToDrive).toBe(false);
        return {
          ok: true,
          json: async () => ({
            id: "planner-1",
            pageCount: 12,
            downloadUrl: "/api/planners/planner-1/download",
            drive: { pdfFileId: null, configFileId: null },
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<StoreBuilder />);

    const driveOption = screen.getByRole("checkbox", { name: /also save a copy to Google Drive/i });
    expect(driveOption).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Generate planner" }));

    const download = await screen.findByRole("link", { name: "Download PDF" });
    expect(download).toHaveAttribute("href", "/api/planners/planner-1/download");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/planners",
      expect.objectContaining({ method: "POST" }),
    ));
  });
});