import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, storageApi, navigate, useSearch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  storageApi: { requestUploadUrl: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined) },
  navigate: vi.fn(),
  useSearch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch, storageApi }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorld: { id: "world-wychcombe", name: "Wychcombe", code: "WYC" },
    worlds: [{ id: "world-wychcombe", name: "Wychcombe", code: "WYC" }],
  }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/super/worldsmith/editorial/canon/new", navigate],
  useSearch,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import CanonRecordEditor from "@/pages/super/worldsmith-editorial/CanonRecordEditor";

function renderEditor(recordId?: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CanonRecordEditor recordId={recordId} />
    </QueryClientProvider>,
  );
}

describe("CanonRecordEditor", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    storageApi.requestUploadUrl.mockReset();
    storageApi.deleteObject.mockClear();
    navigate.mockReset();
    useSearch.mockReturnValue("");
  });

  it("prefills the dedicated full-page create form from a suggestion URL", () => {
    useSearch.mockReturnValue("?name=The+Ashcroft+Ledger&type=object&narrative=A+weathered+diary+with+family+secrets.");
    renderEditor();

    expect(screen.getByRole("heading", { name: "New Canon Record" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("The Ashcroft Ledger")).toBeInTheDocument();
    expect(screen.getByText(/^Selected:/)).toHaveTextContent("Selected: Object");
    expect(screen.getAllByRole("textbox").some(field => field.textContent === "A weathered diary with family secrets.")).toBe(true);
    expect(screen.getByText("Record image")).toBeInTheDocument();
  });

  it("persists image removal when an existing record is saved", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.includes("/canon-records/canon-1")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "The Ashcroft Ledger",
            status: "proposed", canonType: "object", narrativeDetails: "", historicalContext: "",
            visualNotes: "", notes: "", portraitUrl: "/objects/portrait-1", specRefCount: 0,
            createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: /The Ashcroft Ledger — Canon Record/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"portrait_url":null'),
      }),
    ));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps an unsaved rich-text draft when workflow status changes", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.includes("/canon-records/canon-1")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "The Ashcroft Ledger",
            status: path.endsWith("/transition") ? "under_review" : "proposed", canonType: "object",
            narrativeDetails: "<p>Server narrative</p>", historicalContext: "", visualNotes: "",
            notes: "", portraitUrl: null, specRefCount: 0,
            createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: /The Ashcroft Ledger — Canon Record/ })).toBeInTheDocument());
    const narrativeEditor = screen.getAllByRole("textbox").find(field => field.getAttribute("contenteditable") === "true");
    expect(narrativeEditor).toBeDefined();
    narrativeEditor!.innerHTML = "<p>Unsaved editorial draft</p>";
    fireEvent.input(narrativeEditor!);
    fireEvent.click(screen.getByRole("button", { name: "Send for review" }));

    await waitFor(() => expect(screen.getByText("Unsaved editorial draft")).toBeInTheDocument());
  });

  it("shows and updates an out-of-date Context Snapshot", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.endsWith("/context-snapshot")) {
        return Promise.resolve({
          snapshot: {
            status: init?.method === "POST" ? "current" : "out_of_date",
            githubPath: "worlds/wychcombe/context/canon/locations/canon-1-stationery-house.md",
            lastSnapshotAt: "2026-09-17T12:00:00.000Z",
            autoSync: false,
          },
        });
      }
      if (path.includes("/canon-records/canon-1")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "Stationery House",
            status: "accepted", canonType: "location", narrativeDetails: "", historicalContext: "",
            visualNotes: "", notes: "", portraitUrl: null, specRefCount: 0,
            createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-1");
    expect(await screen.findByText("out of date")).toBeInTheDocument();
    expect(screen.getByText(/worlds\/wychcombe\/context\/canon/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Update Context Snapshot" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-1/context-snapshot",
      { method: "POST" },
    ));
    await waitFor(() => expect(screen.getByText("current")).toBeInTheDocument());
  });

  it("lets operators enable accepted-only automatic snapshot updates", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.endsWith("/context-snapshot")) {
        const requestedPolicy = init?.method === "PATCH"
          ? JSON.parse(String(init.body))
          : { auto_sync: false, auto_sync_unaccepted: false };
        return Promise.resolve({
          snapshot: {
            status: "current",
            githubPath: "worlds/wychcombe/context/canon/locations/canon-1-stationery-house.md",
            autoSync: requestedPolicy.auto_sync,
            autoSyncUnaccepted: requestedPolicy.auto_sync_unaccepted,
          },
        });
      }
      if (path.includes("/canon-records/canon-1")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "Stationery House",
            status: "accepted", canonType: "location", narrativeDetails: "", historicalContext: "",
            visualNotes: "", notes: "", portraitUrl: null, specRefCount: 0,
            createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-1");
    const toggle = await screen.findByRole("checkbox", { name: /Update automatically after saves/ });
    fireEvent.click(toggle);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-1/context-snapshot",
      {
        method: "PATCH",
        body: JSON.stringify({ auto_sync: true, auto_sync_unaccepted: false }),
      },
    ));
    await waitFor(() => expect(toggle).toBeChecked());
  });
});