import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CompositionWorkspace from "../pages/store/studios/CompositionWorkspace";
import { storePlannersApi } from "../lib/api";

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual("../lib/api");
  return {
    ...actual,
    widgetsApi: {
      list: vi.fn().mockResolvedValue([]),
    },
    storePlannersApi: {
      getComposition: vi.fn().mockResolvedValue({ version: 1, placements: [] }),
      saveComposition: vi.fn().mockResolvedValue({ version: 1, placements: [] }),
      get: vi.fn().mockResolvedValue({ id: "planner-1", setup: { type: "notebook" }, style: {} }),
      worldsmithAssets: {
        listSource: vi.fn().mockResolvedValue({ assets: [] }),
        listLibrary: vi.fn().mockResolvedValue({ assets: [] }),
        import: vi.fn().mockResolvedValue({ assets: [] }),
        checkUpdate: vi.fn().mockResolvedValue({ updateAvailable: false }),
        replace: vi.fn().mockResolvedValue({ asset: {}, replaced: true }),
      },
    },
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("CompositionWorkspace WorldSmith Integration", () => {
  beforeEach(() => {
    window.Element.prototype.setPointerCapture = vi.fn();
    window.Element.prototype.releasePointerCapture = vi.fn();
    vi.clearAllMocks();
  });

  const planner = { id: "planner-1", setup: { type: "notebook" }, style: {} } as any;

  it("can open WorldSmith browser, use filters, and multi-select import", async () => {
    vi.mocked(storePlannersApi.worldsmithAssets.listSource).mockResolvedValue({
      assets: [
        { id: "ws-1", name: "Floral Washi", componentType: "washi", version: 1, sourceRenderUrl: "", world: { id: "w1", name: "World" } },
        { id: "ws-2", name: "Floral Cover", componentType: "cover", version: 1, sourceRenderUrl: "", world: { id: "w1", name: "World" } },
      ] as any,
    });

    render(<CompositionWorkspace storeId="s1" planner={planner} onSaved={vi.fn()} />, { wrapper: createWrapper() });

    // Switch to Project Assets tab
    fireEvent.click(await screen.findByTestId("tab-project-assets"));
    
    // Open dialog
    fireEvent.click(await screen.findByTestId("button-add-worldsmith"));

    // Check filters
    expect(await screen.findByTestId("filter-category-washi")).toBeInTheDocument();
    // Select Washi, then go back to All
    fireEvent.click(screen.getByTestId("filter-category-washi"));
    fireEvent.click(screen.getByTestId("filter-category-all"));
    fireEvent.change(screen.getByTestId("input-worldsmith-search"), { target: { value: "Floral" } });

    expect(storePlannersApi.worldsmithAssets.listSource).toHaveBeenCalledWith("s1", "planner-1", expect.objectContaining({
      search: "Floral",
    }));

    // Multi-select
    fireEvent.click(await screen.findByTestId("worldsmith-asset-ws-1"));
    fireEvent.click(screen.getByTestId("worldsmith-asset-ws-2"));

    // Import
    fireEvent.change(screen.getByTestId("select-usage-kind"), { target: { value: "artwork" } });
    fireEvent.click(screen.getByTestId("button-import-assets"));

    await waitFor(() => {
      expect(storePlannersApi.worldsmithAssets.import).toHaveBeenCalledWith("s1", "planner-1", {
        assetIds: ["ws-1", "ws-2"],
        usageKind: "artwork",
      });
    });
  });

  it("places a managed asset on canvas and saves with project-asset:<id> payload", async () => {
    vi.mocked(storePlannersApi.worldsmithAssets.listLibrary).mockResolvedValue({
      assets: [
        { id: "pa-1", displayName: "Floral Washi", componentType: "washi", modified: false } as any
      ]
    });

    render(<CompositionWorkspace storeId="s1" planner={planner} onSaved={vi.fn()} />, { wrapper: createWrapper() });

    fireEvent.click(await screen.findByTestId("tab-project-assets"));
    
    // Place asset (simulate click since drag-drop is mocked out by JS DOM anyway)
    const placeBtn = await screen.findByTestId("button-place-project-asset-pa-1");
    fireEvent.click(placeBtn);

    // Save
    fireEvent.click(screen.getByTestId("button-save-composition"));

    await waitFor(() => {
      expect(storePlannersApi.saveComposition).toHaveBeenCalledWith("s1", "planner-1", expect.objectContaining({
        placements: expect.arrayContaining([
          expect.objectContaining({ widgetId: "project-asset:pa-1" })
        ])
      }));
    });
  });

  it("shows update status and allows replacing an asset", async () => {
    vi.mocked(storePlannersApi.getComposition).mockResolvedValue({
      version: 1,
      placements: [{ id: "p1", widgetId: "project-asset:pa-1", pageType: "cover", pageIndex: 0, x: 0.1, y: 0.1, w: 0.2, h: 0.2, scope: "page" }]
    });

    vi.mocked(storePlannersApi.worldsmithAssets.listLibrary).mockResolvedValue({
      assets: [{ id: "pa-1", displayName: "Floral Washi", componentType: "washi", modified: false, worldId: "w1", sourceAssetVersion: 1 }] as any
    });

    vi.mocked(storePlannersApi.worldsmithAssets.checkUpdate).mockResolvedValue({
      updateAvailable: true,
      currentVersion: "1",
      latestVersion: "2"
    });

    render(<CompositionWorkspace storeId="s1" planner={planner} onSaved={vi.fn()} />, { wrapper: createWrapper() });

    // Select the placement on canvas by finding it in the DOM (we know it's rendered if we click the handle or mock pointer event)
    // Actually it's easier to just find the text "Floral Washi" since it's injected
    // But it's selected when clicked. Let's trigger a pointer down on it.
    // The placement div has a label span "Floral Washi"
    const label = await screen.findByText("Floral Washi", { selector: "span.absolute" });
    fireEvent.pointerDown(label.parentElement!);

    // Inspector should show the title
    expect(await screen.findByTestId("text-inspector-title")).toHaveTextContent("Floral Washi");

    // Click preview
    fireEvent.click(await screen.findByTestId("button-preview-update"));

    // Click replace
    fireEvent.click(await screen.findByTestId("button-replace-asset"));

    await waitFor(() => {
      expect(storePlannersApi.worldsmithAssets.replace).toHaveBeenCalledWith("s1", "planner-1", "pa-1", { confirm: true });
    });
  });
});
