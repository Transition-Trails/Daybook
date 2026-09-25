import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { creativeDraft, moveEra } from "@/lib/worldsmith/world-editor-types";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch, storageApi: {}, storesApi: { flags: { get: vi.fn() } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/PaletteLibraryPicker", () => ({ PaletteLibraryPicker: () => null, paletteReferenceText: () => "" }));
vi.mock("@/components/FontLibraryPicker", () => ({ FontLibraryPicker: () => null }));
import { FocusedWorldView, WorldBibleSection, type WsWorld } from "@/pages/super/WorldSmithHome";

const world = { id: "realm-1", name: "The Salt Archive", revision: 7, visualPalette: null, proseVoice: null, atmosphericNotes: null, materialWorld: null, typography: [], worldRules: ["Keep the gates closed"], status: "active" as const };
const mount = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WorldBibleSection world={world} showCopilot={false}/></QueryClientProvider>);

describe("Creative Director World Bible", () => {
  beforeEach(() => { apiFetch.mockReset(); vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("era-alpha").mockReturnValueOnce("era-beta") }); });

  it("normalizes legacy worlds without mutating status or missing fields", () => {
    expect(creativeDraft({}).historicalEras).toEqual([]);
    expect(creativeDraft({}).worldPremise).toBeNull();
    expect(creativeDraft({}).openQuestions).toEqual([]);
    const a = { id: "a", name: "First", summary: "", order: 0 };
    const b = { id: "b", name: "Second", summary: "", order: 1 };
    expect(moveEra([a, b], 1, -1)).toEqual([{ ...b, order: 0 }, { ...a, order: 1 }]);
  });

  it("persists editorial fields with stable era IDs and expected revision while keeping status out of PATCH", async () => {
    apiFetch.mockResolvedValue({ ...world, revision: 8 });
    mount();
    fireEvent.change(screen.getByTestId("input-worldPremise"), { target: { value: "An archive built on tides." } });
    fireEvent.click(screen.getByTestId("button-add-narrativePillars"));
    fireEvent.change(screen.getByTestId("input-narrativePillars-name-era-alpha"), { target: { value: "Memory as labor" } });
    fireEvent.click(screen.getByTestId("button-section-reality"));
    fireEvent.click(screen.getByTestId("button-add-historicalEras"));
    fireEvent.change(screen.getByTestId("input-historicalEras-name-era-beta"), { target: { value: "Before the breakwater" } });
    fireEvent.click(screen.getByRole("button", { name: "Save World Bible" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const payload = JSON.parse(apiFetch.mock.calls[0][1].body);
    expect(payload.expected_revision).toBe(7);
    expect(payload.status).toBeUndefined();
    expect(payload.worldPremise).toBe("An archive built on tides.");
    expect(payload.narrativePillars[0]).toMatchObject({ id: "era-alpha", name: "Memory as labor" });
    expect(payload.historicalEras[0]).toMatchObject({ id: "era-beta", name: "Before the breakwater", order: 0 });
    expect(payload.openQuestions).toEqual([]);
    expect(payload.worldRules).toEqual(["Keep the gates closed"]);
  });

  it("surfaces stale revisions without clearing local edits", async () => {
    apiFetch.mockRejectedValue(Object.assign(new Error("Revision mismatch"), { status: 409 }));
    mount();
    fireEvent.change(screen.getByTestId("input-worldPremise"), { target: { value: "Keep this local draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save World Bible" }));
    await waitFor(() => expect(screen.getByTestId("status-world-bible-save-error")).toHaveTextContent("another session"));
    expect(screen.getByTestId("input-worldPremise")).toHaveValue("Keep this local draft");
    expect(screen.queryByTestId("button-reload-world-bible")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-show-world-bible-draft"));
    const exportField = screen.getByTestId("input-unsaved-world-bible-draft");
    expect((exportField as HTMLTextAreaElement).value).toContain("Keep this local draft");
    expect(exportField).toHaveAttribute("readonly");
    fireEvent.click(screen.getByTestId("button-copy-world-bible-draft"));
    await waitFor(() => expect(screen.getByTestId("status-copy-world-bible-draft")).toHaveTextContent(/copied|copy it manually/i));
    expect(screen.getByTestId("input-worldPremise")).toHaveValue("Keep this local draft");
    expect(screen.getByRole("button", { name: "Save World Bible" })).toBeEnabled();
  });

  it("preserves drafts across tabs but remounts the Bible for a different focused world", async () => {
    const first: WsWorld = { ...world, code: "SA", description: "An archive", coverColor: "#304050", coverAccent: "#805060", owner: "owner", tags: [], createdAt: "", updatedAt: "", assetCount: 0, reviewCount: 0 };
    const second: WsWorld = { ...first, id: "realm-2", name: "The Other Archive", worldPremise: "A separate premise" };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (selected: WsWorld) => <QueryClientProvider client={client}><FocusedWorldView world={selected} assets={[]} integrations={[]} storeId="store-1" canEditWorldRules onBack={() => {}}/></QueryClientProvider>;
    const { rerender } = render(view(first));
    fireEvent.click(screen.getByRole("button", { name: "World Bible" }));
    fireEvent.change(screen.getByTestId("input-worldPremise"), { target: { value: "An unsaved first-world premise" } });
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "World Bible" }));
    expect(screen.getByTestId("input-worldPremise")).toHaveValue("An unsaved first-world premise");
    rerender(view(second));
    await waitFor(() => expect(screen.getByTestId("input-worldPremise")).toHaveValue("A separate premise"));
  });
});