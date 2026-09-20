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
    expect(screen.getByText("Canon images")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate Primary Canon Image" })).toBeInTheDocument();
  });

  it("renders legacy string prompt context without blanking the record editor", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/field-context?world_id=world-wychcombe")) {
        return Promise.resolve({
          context: {
            prompt: "Victorian seed merchant storefront, painted lettering, timber drawers",
            warnings: [],
            attributions: [{ clause: "painted lettering", source: "Visual notes" }],
          },
        });
      }
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.includes("/canon-records/canon-legacy")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-legacy",
            worldId: "world-wychcombe",
            name: "Bellamy & Son, Nurserymen and Seedsmen",
            status: "proposed",
            canonType: "location",
            narrativeDetails: "",
            historicalContext: "",
            visualNotes: "",
            notes: "",
            specRefCount: 0,
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-legacy");

    expect(await screen.findByRole("heading", {
      name: /Bellamy & Son, Nurserymen and Seedsmen — Canon Record/,
    })).toBeInTheDocument();
    expect(screen.getByText("Victorian seed merchant storefront, painted lettering, timber drawers")).toBeInTheDocument();
  });

  it("persists image removal immediately without requiring a separate save", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Remove primary Canon portrait" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"portrait_url":null'),
      }),
    ));
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps the remaining gallery image when one image is removed", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.includes("/canon-records/canon-1")) {
        const submitted = init?.method === "PATCH"
          ? JSON.parse(String(init.body))
          : null;
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "Frederick Ashcroft",
            status: "proposed", canonType: "character", narrativeDetails: "", historicalContext: "",
            visualNotes: "", notes: "", portraitUrl: submitted?.portrait_url ?? "/objects/frederick-primary",
            imageUrls: submitted?.image_urls ?? ["/objects/frederick-primary", "/objects/frederick-study"],
            specRefCount: 0, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-1");
    await waitFor(() => expect(screen.getByAltText("Additional Canon image 1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remove primary Canon portrait" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"image_urls":["/objects/frederick-study"]'),
      }),
    ));
  });

  it("saves names and descriptions for additional Canon images", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.includes("/assets")) {
        return Promise.resolve({
          assets: [
            { recordId: "canon-1", objectPath: "/objects/frederick-primary", title: "Primary Canon portrait", altText: "", role: "primary_portrait" },
            { recordId: "canon-1", objectPath: "/objects/frederick-study", title: "Portrait study", altText: "Early reference." }
          ]
        });
      }
      if (path.includes("/canon-records/canon-1")) {
        const submitted = init?.method === "PATCH" ? JSON.parse(String(init.body)) : null;
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "Frederick Ashcroft",
            status: "proposed", canonType: "character", narrativeDetails: "", historicalContext: "",
            visualNotes: "", notes: "", portraitUrl: "/objects/frederick-primary",
            imageUrls: ["/objects/frederick-primary", "/objects/frederick-study"],
            imageGallery: submitted?.image_gallery ?? [
              { url: "/objects/frederick-primary", name: "Primary Canon portrait", description: "" },
              { url: "/objects/frederick-study", name: "Portrait study", description: "Early reference." },
            ],
            specRefCount: 0, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-1");
    const nameField = await screen.findByDisplayValue("Portrait study");
    const descriptionField = screen.getByDisplayValue("Early reference.");
    fireEvent.change(nameField, { target: { value: "Winter travel attire" } });
    fireEvent.change(descriptionField, { target: { value: "Frederick preparing to cross the northern moor." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/editorial/assets"),
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringMatching(/"title":"Winter travel attire"/),
      }),
    ));
  });

  it("generates a reference from an editor prompt and selected related Canon", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/relations")) {
        return Promise.resolve({
          relations: [{
            toRecordId: "canon-event",
            relationType: "involved_in",
            targetName: "The Winter Crossing",
            targetCanonType: "event",
          }],
        });
      }
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.endsWith("/context-snapshot")) return Promise.resolve({ snapshot: { status: "not_generated" } });
      if (path === "/v1/editorial/canon-records/generate-image" && init?.method === "POST") {
        return new Promise(() => undefined);
      }
      if (path.includes("/canon-records/canon-1")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "Frederick Ashcroft",
            status: "proposed", canonType: "character", narrativeDetails: "", historicalContext: "",
            visualNotes: "", notes: "", portraitUrl: "/objects/frederick-primary.png",
            imageUrls: ["/objects/frederick-primary.png"],
            imageGallery: [{
              url: "/objects/frederick-primary.png",
              name: "Primary Canon portrait",
              description: "Isolated portrait.",
              role: "primary_portrait",
            }],
            specRefCount: 0, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-1");
    const prompt = await screen.findByLabelText("What should this reference show?");
    const relatedCanon = await screen.findByRole("checkbox", { name: /The Winter Crossing/ });
    fireEvent.change(prompt, { target: { value: "Show Frederick preparing at the frozen river." } });
    fireEvent.click(relatedCanon);
    fireEvent.click(screen.getByRole("button", { name: "Generate reference image" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/generate-image",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          world_id: "world-wychcombe",
          name: "Frederick Ashcroft",
          canon_type: "character",
          narrative_details: "",
          historical_context: "",
          visual_notes: "",
           mode: "reference",
          prompt: "Show Frederick preparing at the frozen river.",
          source_record_id: "canon-1",
          related_record_ids: ["canon-event"],
        }),
      }),
    ));
  });

  it("generates the first character image as an isolated Primary Canon Portrait without a prompt", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/relations")) return Promise.resolve({ relations: [] });
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.endsWith("/context-snapshot")) return Promise.resolve({ snapshot: { status: "not_generated" } });
      if (path === "/v1/editorial/canon-records/generate-image" && init?.method === "POST") {
        return new Promise(() => undefined);
      }
      if (path.includes("/canon-records/canon-1")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "Eleanor Harcourt",
            status: "proposed", canonType: "character", narrativeDetails: "", historicalContext: "",
            visualNotes: "", notes: "", portraitUrl: null, imageUrls: [],
            specRefCount: 0, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-1");
    fireEvent.click(await screen.findByRole("button", { name: "Generate Primary Canon Portrait" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/generate-image",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"mode":"primary_portrait"'),
      }),
    ));
  });

  it("loads and saves the character-only rich-text canon sections", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.includes("/canon-records/canon-character")) {
        const submitted = init?.method === "PATCH" ? JSON.parse(String(init.body)) : null;
        return Promise.resolve({
          canon_record: {
            id: "canon-character", worldId: "world-wychcombe", name: "Frederick Ashcroft",
            status: "proposed", canonType: "character", narrativeDetails: "", historicalContext: "",
            visualNotes: "", notes: "", portraitUrl: null, imageUrls: [],
            canonGuardrails: submitted?.canon_guardrails ?? "<p>Never abandons the family archive.</p>",
            relationshipDetails: submitted?.relationship_details ?? "<p>Protective of Eleanor.</p>",
            characterDirection: submitted?.character_direction ?? "<p>Learns to trust the household.</p>",
            confirmedCanon: submitted?.confirmed_canon ?? "<p>Born in Wychcombe.</p>",
            specRefCount: 0, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });

    renderEditor("canon-character");
    expect(await screen.findByText("Canon Guardrails")).toBeInTheDocument();
    expect(screen.getByText("Relationship details")).toBeInTheDocument();
    expect(screen.getByText("Character Direction")).toBeInTheDocument();
    expect(screen.getByText("Confirmed Canon")).toBeInTheDocument();
    expect(screen.getByText("Never abandons the family archive.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-character",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"confirmed_canon":"<p>Born in Wychcombe.</p>"'),
      }),
    ));
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