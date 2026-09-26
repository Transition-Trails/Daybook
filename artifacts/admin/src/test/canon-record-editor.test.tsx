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
            version: 1,
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

  it("shows MCP-saved Location metadata even when a legacy Location Profile row is empty", async () => {
    const structuredProfile = {
      locationScale: "property",
      primaryFunction: ["commercial", "agricultural"],
      ownership: "family",
      condition: "well_kept",
      access: "public_limits",
      populationDensity: "busy",
      settingCharacter: ["industrious"],
      dominantMaterials: ["stone", "brick", "timber", "iron", "glass", "plant"],
    };
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/canon-records/canon-bellamy") {
        return Promise.resolve({
          canon_record: {
            id: "canon-bellamy", version: init?.method === "PATCH" ? 10 : 9,
            worldId: "world-wychcombe", name: "Bellamy & Son, Nurserymen and Seedsmen",
            canonType: "location", status: "proposed", structuredProfile,
          },
        });
      }
      if (path.includes("/v1/editorial/profiles/location/canon-bellamy")) {
        return Promise.resolve({ profile: { profile: {} } });
      }
      if (path.includes("/v1/editorial/vocabularies")) {
        return Promise.resolve({ vocabularies: [], options: [] });
      }
      if (path.startsWith("/v1/editorial/assets?")) return Promise.resolve({ assets: [] });
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      return Promise.resolve({});
    });

    renderEditor("canon-bellamy");
    expect(await screen.findByRole("button", { name: "Property" })).toBeInTheDocument();
    for (const label of ["Commercial", "Agricultural", "Family", "Well-Kept", "Public with Limits", "Busy", "Industrious", "Local Stone", "Brick", "Timber", "Iron", "Glass", "Living Plant Material"]) {
      expect(screen.getAllByText(label).some(element => element.tagName !== "OPTION")).toBe(true);
    }

    fireEvent.click(screen.getByTestId("canon-top-save"));
    await waitFor(() => {
      const save = apiFetch.mock.calls.find(([path, init]) =>
        path === "/v1/editorial/canon-records/canon-bellamy" && init?.method === "PATCH");
      expect(save).toBeDefined();
      expect(JSON.parse(save![1].body as string).structured_profile).toEqual(structuredProfile);
    });
  });

  it("saves an existing Canon reference from the top of the page", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path === "/v1/editorial/canon-records/canon-top") {
        return Promise.resolve({
          canon_record: {
            id: "canon-top", version: init?.method === "PATCH" ? 2 : 1,
            worldId: "world-wychcombe", name: "Elias Ashcroft",
            status: "proposed", canonType: "object", narrativeDetails: "",
            historicalContext: "", visualNotes: "", notes: "",
          },
        });
      }
      return Promise.resolve({ assets: [] });
    });
    renderEditor("canon-top");
    await screen.findByRole("heading", { name: "Elias Ashcroft — Canon Record" });

    const topSave = screen.getByTestId("canon-top-save");
    expect(topSave).toHaveAttribute("form", "canon-record-form");
    fireEvent.change(screen.getByPlaceholderText("Name this canonical record"), { target: { value: "Elias Ashcroft II" } });
    fireEvent.click(topSave);

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-top",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"name":"Elias Ashcroft II"'),
      }),
    ));
  });

  it("makes an additional image primary without removing the other images", async () => {
    let gallery = [
      { url: "/objects/first.png", name: "Original image", description: "Original", role: "primary" },
      { url: "/objects/second.png", name: "Second image", description: "Alternate", role: "alternate" },
    ];
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path === "/v1/editorial/canon-records/canon-primary") {
        if (init?.method === "PATCH") gallery = JSON.parse(init.body as string).image_gallery;
        return Promise.resolve({
          canon_record: {
            id: "canon-primary", version: init?.method === "PATCH" ? 2 : 1,
            worldId: "world-wychcombe", name: "Two Views", status: "proposed",
            canonType: "object", narrativeDetails: "", historicalContext: "", visualNotes: "",
            notes: "", portraitUrl: gallery[0].url, imageUrls: gallery.map(image => image.url),
            imageGallery: gallery, specRefCount: 0,
          },
        });
      }
      return Promise.resolve({ assets: [] });
    });
    const editor = renderEditor("canon-primary");
    await screen.findByRole("heading", { name: "Two Views — Canon Record" });
    fireEvent.click(screen.getByRole("button", { name: "Make Second image primary" }));
    expect(screen.getByAltText("Primary Canon image")).toHaveAttribute("src", "/api/storage/objects/second.png");
    expect(screen.getByRole("button", { name: "Make Original image primary" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("canon-top-save"));
    await waitFor(() => {
      const save = apiFetch.mock.calls.find(([path, init]) =>
        path === "/v1/editorial/canon-records/canon-primary" && init?.method === "PATCH");
      expect(save).toBeDefined();
      const body = JSON.parse(save![1].body);
      expect(body.portrait_url).toBe("/objects/second.png");
      expect(body.image_urls).toEqual(["/objects/second.png", "/objects/first.png"]);
      expect(body.image_gallery).toEqual([
        expect.objectContaining({ url: "/objects/second.png", role: "primary" }),
        expect.objectContaining({ url: "/objects/first.png", role: "reference" }),
      ]);
    });
    expect(storageApi.deleteObject).not.toHaveBeenCalled();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/assets", expect.objectContaining({ method: "POST" }),
    ));
    editor.unmount();
    renderEditor("canon-primary");
    await screen.findByRole("heading", { name: "Two Views — Canon Record" });
    expect(screen.getByAltText("Primary Canon image")).toHaveAttribute("src", "/api/storage/objects/second.png");
    expect(screen.getByRole("button", { name: "Make Original image primary" })).toBeInTheDocument();
  });

  it("auto-syncs a saved primary only after its approval and role asset write finishes", async () => {
    let finishAsset!: () => void;
    const assetWrite = new Promise<void>(resolve => { finishAsset = resolve; });
    const gallery = [{
      url: "/objects/approved-primary.png", name: "Approved primary", description: "",
      role: "primary", workflowStatus: "approved", canonicalStrength: "canonical",
    }];
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/canon-records/approved-editor") {
        return Promise.resolve({ canon_record: {
          id: "approved-editor", version: init?.method === "PATCH" ? 2 : 1,
          worldId: "world-wychcombe", name: "Approved Editor", status: "accepted",
          canonType: "location", imageGallery: gallery, portraitUrl: gallery[0].url,
        } });
      }
      if (path === "/v1/editorial/assets" && init?.method === "POST") return assetWrite;
      if (path.startsWith("/v1/editorial/assets?")) return Promise.resolve({ assets: [] });
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.endsWith("/context-snapshot/auto-sync")) return Promise.resolve({ context_snapshot_status: "current" });
      return Promise.resolve({});
    });
    renderEditor("approved-editor");
    await screen.findByRole("heading", { name: "Approved Editor — Canon Record" });
    await screen.findByAltText("Primary Canon image");
    fireEvent.click(screen.getByTestId("canon-top-save"));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/assets",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"approval_status":"approved"') }),
    ));
    const patch = apiFetch.mock.calls.find(([path, init]) =>
      path === "/v1/editorial/canon-records/approved-editor" && init?.method === "PATCH");
    expect(JSON.parse(patch![1].body).defer_auto_snapshot).toBe(true);
    expect(apiFetch.mock.calls.some(([path]) => path.endsWith("/context-snapshot/auto-sync"))).toBe(false);

    finishAsset();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/approved-editor/context-snapshot/auto-sync",
      { method: "POST", body: JSON.stringify({ expected_version: 2 }) },
    ));
  });

  it("persists image removal immediately without requiring a separate save", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.includes("/canon-records/canon-1")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-1", worldId: "world-wychcombe", name: "The Ashcroft Ledger",
            version: 1,
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
            version: 1,
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
    fireEvent.click(screen.getByRole("button", { name: "Make image 2 primary" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Asset" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"image_urls":["/objects/frederick-study"]'),
      }),
    ));
  });

  it("keeps the gallery primary authoritative when asset metadata calls it a reference", async () => {
    let savedPayload: any;
    const canonRecord = {
      id: "canon-glasshouse",
      version: 1,
      worldId: "world-wychcombe",
      name: "The Glasshouse Repair Sample Board",
      status: "proposed",
      canonType: "object",
      narrativeDetails: "",
      historicalContext: "",
      visualNotes: "",
      notes: "",
      portraitUrl: "/objects/glasshouse-primary",
      imageUrls: ["/objects/glasshouse-primary", "/objects/glasshouse-detail"],
      imageGallery: [
        { url: "/objects/glasshouse-primary", name: "Primary Canon image", description: "", role: "primary" },
        { url: "/objects/glasshouse-detail", name: "Repair detail", description: "A supporting repair detail.", role: "reference" },
      ],
      specRefCount: 0,
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    };
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path === "/v1/editorial/assets?world_id=world-wychcombe") {
        return Promise.resolve({
          assets: [{
            id: "asset-primary",
            recordId: "canon-glasshouse",
            objectPath: "/objects/glasshouse-primary",
            title: "Primary Canon image",
            altText: "",
            role: "reference",
          }, {
            id: "asset-detail",
            recordId: "canon-glasshouse",
            objectPath: "/objects/glasshouse-detail",
            title: "Repair detail",
            altText: "A supporting repair detail.",
            role: "reference",
          }],
        });
      }
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.endsWith("/relations")) return Promise.resolve({ relations: [] });
      if (path.endsWith("/context-snapshot")) return Promise.resolve({ snapshot: { status: "not_generated" } });
      if (path === "/v1/editorial/canon-records/canon-glasshouse" && init?.method === "PATCH") {
        savedPayload = JSON.parse(String(init.body));
        return Promise.resolve({ canon_record: canonRecord });
      }
      if (path === "/v1/editorial/canon-records/canon-glasshouse") {
        return Promise.resolve({ canon_record: canonRecord });
      }
      if (path.includes("/profiles/object/")) return Promise.resolve({ profile: { profile: {} } });
      return Promise.resolve({});
    });

    renderEditor("canon-glasshouse");
    const roleSelect = await screen.findByRole("combobox", { name: "Additional image 1 asset role" });
    expect(roleSelect).toHaveValue("reference");
    expect(screen.queryByRole("option", { name: "Primary Portrait" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(savedPayload?.image_gallery?.[0]?.role).toBe("primary"));
    expect(savedPayload.image_gallery[1].role).toBe("reference");
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
            version: 1,
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
    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/canon-1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"expected_version":1'),
      }),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/profiles/character/canon-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"expected_version":1'),
      }),
    );
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
            version: 1,
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
            version: 1,
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

  it("generates the first non-character image without a description and defaults its saved description", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/relations")) return Promise.resolve({ relations: [] });
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.endsWith("/context-snapshot")) return Promise.resolve({ snapshot: { status: "not_generated" } });
      if (path === "/v1/editorial/canon-records/generate-image" && init?.method === "POST") {
        return Promise.resolve({
          image_data_url: "data:image/png;base64,cHJpbWFyeQ==",
          generation: { model: "gpt-image-2" },
        });
      }
      if (path.includes("/canon-records/canon-publication")) {
        return Promise.resolve({
          canon_record: {
            id: "canon-publication",
            version: 1,
            worldId: "world-wychcombe",
            name: "The Stationery House’s First Useful Publication",
            status: "proposed",
            canonType: "object",
            narrativeDetails: "",
            historicalContext: "",
            visualNotes: "",
            notes: "",
            portraitUrl: null,
            imageUrls: [],
            specRefCount: 0,
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:00:00.000Z",
          },
        });
      }
      return Promise.resolve({});
    });
    storageApi.requestUploadUrl.mockResolvedValue({
      uploadURL: "https://storage.example/upload",
      objectPath: "/objects/stationery-house-publication.png",
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(new Blob(["primary"], { type: "image/png" }), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 })));

    renderEditor("canon-publication");
    fireEvent.click(await screen.findByRole("button", { name: "Generate Primary Canon Image" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records/generate-image",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"mode":"primary_portrait"'),
      }),
    ));
    expect(await screen.findByDisplayValue("Primary Canon Image")).toBeInTheDocument();
  });

  it("loads and saves the character-only rich-text canon sections", async () => {
    apiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.includes("/canon-records/canon-character")) {
        const submitted = init?.method === "PATCH" ? JSON.parse(String(init.body)) : null;
        return Promise.resolve({
          canon_record: {
            id: "canon-character", worldId: "world-wychcombe", name: "Frederick Ashcroft",
            version: 1,
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
    // The heading renders from the query before the editable form is hydrated.
    await waitFor(() => expect(screen.getByDisplayValue("Frederick Ashcroft")).toBeInTheDocument());

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
            version: 1,
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
            version: 1,
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

  it("does not mislabel reference images as primary and guides editors when snapshot images are blocked", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path.endsWith("/specs")) return Promise.resolve({ specs: [] });
      if (path.endsWith("/context-snapshot")) return Promise.resolve({
        snapshot: {
          status: "blocked", githubPath: "worlds/wyc/context/canon/locations/canon-1-nursery.md",
          autoSync: false, autoSyncUnaccepted: false,
          imageIssue: { recordId: "canon-1", recordName: "Nursery", message: "Multiple Canon images require one image designated as primary." },
        },
      });
      if (path.includes("/canon-records/canon-1")) return Promise.resolve({
        canon_record: {
          id: "canon-1", worldId: "world-wychcombe", name: "Nursery", version: 1,
          status: "accepted", canonType: "location", narrativeDetails: "", historicalContext: "",
          visualNotes: "", notes: "", portraitUrl: null, specRefCount: 0,
          imageGallery: [
            { url: "/objects/one", role: "reference", name: "One", description: "" },
            { url: "/objects/two", role: "reference", name: "Two", description: "" },
          ],
          createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-09-18T00:00:00.000Z",
        },
      });
      return Promise.resolve({});
    });
    renderEditor("canon-1");
    expect(await screen.findByText("blocked")).toBeInTheDocument();
    expect(screen.getByText(/No primary image is designated/)).toBeInTheDocument();
    expect(screen.getByText(/Snapshot updates are blocked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Context Snapshot" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Make Two primary" }));
    expect(screen.queryByText(/No primary image is designated/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Primary Canon image" })).toBeInTheDocument();
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
            version: 1,
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