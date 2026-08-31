import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, navigate } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/super/worldsmith/editorial/specs/spec-local", navigate] }));
vi.mock("@/lib/spec-navigation-guard", () => ({
  registerSpecNavigationGuard: () => () => undefined,
  confirmSpecNavigation: () => true,
  bypassNextSpecNavigationGuard: vi.fn(),
}));
vi.mock("@/components/EditorialRichText", () => ({
  EditorialRichTextField: () => <div />,
  EditorialSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  editorialRichTextToPlainText: (value: string) => value,
}));

import SpecEditor from "@/pages/super/worldsmith-editorial/SpecEditor";

const spec = {
  id: "spec-local",
  worldId: "world-1",
  productionItem: "Thornvale Hero Paper",
  componentType: "Hero Paper",
  currentVersion: "1",
  designIntent: "A rain-softened woodland threshold.",
  narrativePurpose: "Set a quiet opening tone.",
  requiredContent: "Ferns and a weathered gate.",
  reviewCriteria: "No text.",
  canonDependency: "Canon Reference",
  canonRecordIds: ["canon-1"],
  payloadVersion: "PP-2.0",
  promptPayload: "shared_prompt: rain-dark woodland",
  promptModuleIds: [],
  status: "draft",
  compiledPromptStatus: "Not Compiled",
  readinessScore: 70,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
};

const approvalReadySpec = {
  ...spec,
  specId: "TH-HRP-001",
  collectionId: "collection-1",
  designIntent: "A rain-softened woodland threshold.",
  narrativePurpose: "Set a quiet opening tone.",
  requiredContent: "Ferns and a weathered gate.",
  reviewCriteria: "No text or modern objects.",
  orientation: "portrait",
  canonDependency: "None",
  canonRecordIds: [],
  payloadVersion: "PP-2.0",
  promptPayload: "shared_prompt: rain-dark woodland threshold with an archival paper texture",
  promptModuleIds: ["module-1"],
  styleGuideId: "style-1",
  componentSpecId: "component-1",
  wizardComplete: true,
  status: "compiled",
  compiledPromptStatus: "Compiled",
};

describe("SpecEditor local specification board", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/specs/spec-local") {
        return Promise.resolve({
          spec,
          relationships: {
            style_guide: null,
            component_spec: null,
            canon_records: [],
            prompt_modules: [],
          },
        });
      }
      if (path === "/v1/editorial/component-sets?world_id=world-1") {
        return Promise.resolve({ component_sets: [] });
      }
      if (path === "/v1/worldsmith/spec-preview/local/spec-local") {
        return Promise.resolve({ preview: null });
      }
      if (path === "/v1/production-packages?production_spec_id=spec-local") {
        return Promise.resolve({ package: null, last_successful: null });
      }
      if (path === "/v1/prompt-compilations") {
        return Promise.resolve({ status: "compiled", prompt_hash: "local-hash" });
      }
      if (path === "/v1/worldsmith/spec-preview") {
        return Promise.resolve({
          status: "success",
          source: "local",
          production_item: spec.productionItem,
          preview_filename: "wm-spec-preview-thornvale.png",
          preview_object_path: "/objects/worldsmith/spec-previews/preview.png",
          preview_url: "/api/storage/objects/worldsmith/spec-previews/preview.png",
        });
      }
      return Promise.resolve({});
    });
  });

  it("uses the local Production Spec ID and displays the stored board", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SpecEditor specId="spec-local" />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Generate specification board" }));

    await waitFor(() => {
      expect(screen.getByAltText("Specification board for Thornvale Hero Paper")).toHaveAttribute(
        "src",
        "/api/storage/objects/worldsmith/spec-previews/preview.png",
      );
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/prompt-compilations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          production_spec_id: "spec-local",
          operation: "validate_and_compile",
          dry_run: false,
        }),
      }),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/worldsmith/spec-preview",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          production_spec_id: "spec-local",
          prompt_hash: "local-hash",
          force_new: true,
        }),
      }),
    );
  });

  it("unlocks board approval immediately after a successful regeneration", async () => {
    const needsCompilation = {
      ...approvalReadySpec,
      status: "canon_clear",
      compiledPromptStatus: "Not Compiled",
    };
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/specs/spec-local") {
        return Promise.resolve({
          spec: needsCompilation,
          relationships: { style_guide: null, component_spec: null, canon_records: [], prompt_modules: [] },
        });
      }
      if (path === "/v1/editorial/component-sets?world_id=world-1") {
        return Promise.resolve({ component_sets: [] });
      }
      if (path === "/v1/worldsmith/spec-preview/local/spec-local") {
        return Promise.resolve({ preview: null });
      }
      if (path === "/v1/production-packages?production_spec_id=spec-local") {
        return Promise.resolve({ package: null, last_successful: null });
      }
      if (path === "/v1/prompt-compilations") {
        return Promise.resolve({ status: "compiled", prompt_hash: "regenerated-hash" });
      }
      if (path === "/v1/worldsmith/spec-preview") {
        return Promise.resolve({
          status: "success",
          source: "local",
          production_item: needsCompilation.productionItem,
          preview_filename: "regenerated-board.png",
          preview_object_path: "/objects/worldsmith/spec-previews/regenerated.png",
          preview_url: "/api/storage/objects/worldsmith/spec-previews/regenerated.png",
        });
      }
      return Promise.resolve({});
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SpecEditor specId="spec-local" />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("button", { name: "Approve Specification Board" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Generate specification board" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Approve Specification Board" })).toBeEnabled();
    });
  });

  it("restores the latest local board after the editor reloads", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/specs/spec-local") {
        return Promise.resolve({
          spec,
          relationships: { style_guide: null, component_spec: null, canon_records: [], prompt_modules: [] },
        });
      }
      if (path === "/v1/editorial/component-sets?world_id=world-1") {
        return Promise.resolve({ component_sets: [] });
      }
      if (path === "/v1/worldsmith/spec-preview/local/spec-local") {
        return Promise.resolve({
          preview: {
            status: "success",
            source: "local",
            production_item: spec.productionItem,
            preview_object_path: "/objects/worldsmith/spec-previews/existing.png",
            preview_url: "/api/storage/objects/worldsmith/spec-previews/existing.png",
          },
        });
      }
      return Promise.resolve({});
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SpecEditor specId="spec-local" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Specification board for Thornvale Hero Paper")).toHaveAttribute(
        "src",
        "/api/storage/objects/worldsmith/spec-previews/existing.png",
      );
    });
  });

  it("generates final artwork from the local spec and displays its protected image", async () => {
    const approvedSpec = { ...spec, status: "approved" };
    apiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/editorial/specs/spec-local") {
        return Promise.resolve({
          spec: approvedSpec,
          relationships: { style_guide: null, component_spec: null, canon_records: [], prompt_modules: [] },
        });
      }
      if (path === "/v1/editorial/component-sets?world_id=world-1") {
        return Promise.resolve({ component_sets: [] });
      }
      if (path === "/v1/worldsmith/spec-preview/local/spec-local") {
        return Promise.resolve({ preview: null });
      }
      if (path === "/v1/production-packages?production_spec_id=spec-local") {
        return Promise.resolve({ package: null, last_successful: null });
      }
      if (path === "/v1/production-packages" && options?.method === "POST") {
        return Promise.resolve({
          production_package: {
            id: "package-local",
            status: "success",
            production_art_status: "artwork_review",
            filename: "thornvale-final.png",
            artwork_url: "/api/storage/objects/worldsmith/final-artwork/thornvale-final.png",
            provider: "replit_ai_integrations",
            model: "gpt-image-2",
            effective_size: "1440x1440",
            quality: "medium",
          },
        });
      }
      return Promise.resolve({});
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SpecEditor specId="spec-local" />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Generate final artwork" }));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/production-packages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            production_spec_id: "spec-local",
            force_new: false,
          }),
        }),
      );
    });
  });

  it("submits a focused revision as a new artwork without editing the spec", async () => {
    const approvedSpec = { ...spec, status: "approved" };
    const successfulPackage = {
      id: "package-existing",
      status: "success",
      production_art_status: "artwork_review",
      filename: "existing-final.png",
      artwork_url: "/api/storage/objects/worldsmith/final-artwork/existing-final.png",
      provider: "replit_ai_integrations",
      model: "gpt-image-2",
      effective_size: "1440x1440",
      quality: "medium",
    };
    apiFetch.mockImplementation((path: string, options?: { method?: string; body?: string }) => {
      if (path === "/v1/editorial/specs/spec-local") {
        return Promise.resolve({
          spec: approvedSpec,
          relationships: { style_guide: null, component_spec: null, canon_records: [], prompt_modules: [] },
        });
      }
      if (path === "/v1/editorial/component-sets?world_id=world-1") {
        return Promise.resolve({ component_sets: [] });
      }
      if (path === "/v1/worldsmith/spec-preview/local/spec-local") {
        return Promise.resolve({ preview: null });
      }
      if (path === "/v1/production-packages?production_spec_id=spec-local") {
        return Promise.resolve({ package: successfulPackage, last_successful: successfulPackage });
      }
      if (path === "/v1/production-packages" && options?.method === "POST") {
        return Promise.resolve({
          production_package: { ...successfulPackage, id: "package-revised", filename: "revised-final.png" },
        });
      }
      return Promise.resolve({});
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SpecEditor specId="spec-local" />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Revise prompt & regenerate" }));
    fireEvent.change(screen.getByLabelText("What should change?"), {
      target: { value: "Make the botanical border lighter and leave more breathing room." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Generate revision" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/production-packages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            production_spec_id: "spec-local",
            force_new: true,
            revision_prompt: "Make the botanical border lighter and leave more breathing room.",
          }),
        }),
      );
    });
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/v1/editorial/specs/spec-local",
      expect.objectContaining({ method: expect.stringMatching(/PATCH|PUT/) }),
    );
  });

  it("keeps board approval disabled while prerequisites are incomplete", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SpecEditor specId="spec-local" />
      </QueryClientProvider>,
    );

    const approveButton = await screen.findByRole("button", { name: "Approve Specification Board" });
    expect(approveButton).toBeDisabled();
    expect(screen.getByText("Complete the Production Spec record before approving the board.")).toBeInTheDocument();
  });

  it("confirms approval, persists the returned record in the editor, and unlocks final artwork", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    apiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === "/v1/editorial/specs/spec-local" && !options?.method) {
        return Promise.resolve({
          spec: approvalReadySpec,
          relationships: { style_guide: null, component_spec: null, canon_records: [], prompt_modules: [] },
        });
      }
      if (path === "/v1/editorial/specs/spec-local/approve" && options?.method === "POST") {
        return Promise.resolve({
          spec: { ...approvalReadySpec, status: "approved" },
          already_approved: false,
        });
      }
      if (path === "/v1/editorial/component-sets?world_id=world-1") {
        return Promise.resolve({ component_sets: [] });
      }
      if (path === "/v1/worldsmith/spec-preview/local/spec-local") {
        return Promise.resolve({ preview: null });
      }
      if (path === "/v1/production-packages?production_spec_id=spec-local") {
        return Promise.resolve({ package: null, last_successful: null });
      }
      return Promise.resolve({});
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SpecEditor specId="spec-local" />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Approve Specification Board" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/v1/editorial/specs/spec-local/approve",
        { method: "POST", body: JSON.stringify({}) },
      );
    });
    expect(confirmSpy).toHaveBeenCalledWith(
      "Approve this Specification Board? This will unlock final artwork generation.",
    );
    expect(await screen.findByText("Specification Board approved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate final artwork" })).toBeEnabled();
  });

  it("does not approve when the confirmation is declined", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/specs/spec-local") {
        return Promise.resolve({
          spec: approvalReadySpec,
          relationships: { style_guide: null, component_spec: null, canon_records: [], prompt_modules: [] },
        });
      }
      if (path === "/v1/editorial/component-sets?world_id=world-1") {
        return Promise.resolve({ component_sets: [] });
      }
      if (path === "/v1/worldsmith/spec-preview/local/spec-local") {
        return Promise.resolve({ preview: null });
      }
      if (path === "/v1/production-packages?production_spec_id=spec-local") {
        return Promise.resolve({ package: null, last_successful: null });
      }
      return Promise.resolve({});
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SpecEditor specId="spec-local" />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Approve Specification Board" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/v1/editorial/specs/spec-local/approve",
      expect.anything(),
    );
  });
});