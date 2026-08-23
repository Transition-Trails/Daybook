import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("SpecEditor local specification board", () => {
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
        }),
      }),
    );
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
});