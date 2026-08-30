import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, navigate, toast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  navigate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("wouter", () => ({
  useLocation: () => [window.location.pathname + window.location.search, navigate],
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast }),
}));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({
    selectedWorldId: "world-draft",
    selectedCollectionId: "collection-draft",
  }),
}));

import NewSpecFlow from "@/pages/super/worldsmith-editorial/NewSpecFlow";

function renderFlow(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryClientProvider client={client}>
      <NewSpecFlow />
    </QueryClientProvider>,
  );
}

function blankDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "draft-1",
    productionItem: null,
    componentType: null,
    payloadVersion: "PP-2.0",
    canonDependency: "None",
    canonRecordIds: [],
    promptModuleIds: [],
    wizardStep: 0,
    wizardComplete: false,
    ...overrides,
  };
}

describe("NewSpecFlow draft persistence", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/super/worldsmith/editorial/specs/new");
    apiFetch.mockReset();
    navigate.mockReset();
    toast.mockReset();
    apiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/v1/editorial/specs" && options?.method === "POST") {
        return Promise.resolve({ spec: blankDraft() });
      }
      if (path === "/v1/editorial/specs/draft-1" && options?.method === "PATCH") {
        return Promise.resolve({ spec: blankDraft({ wizardStep: 1 }) });
      }
      if (path.startsWith("/v1/editorial/component-sets")) {
        return Promise.resolve({ component_sets: [] });
      }
      return Promise.resolve({});
    });
  });

  it("creates a draft immediately and saves the identity screen before advancing", async () => {
    renderFlow();

    await screen.findByText("Saved as draft");
    expect(window.location.search).toBe("?draft=draft-1");
    fireEvent.change(screen.getByPlaceholderText(/Victorian Garden Journal/), {
      target: { value: "Recoverable Hero Paper" },
    });
    fireEvent.change(screen.getAllByRole("combobox")[0]!, {
      target: { value: "Hero Paper" },
    });
    const next = screen.getByRole("button", { name: "Next" });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);

    await screen.findByText("Creative Direction");
    const patch = apiFetch.mock.calls.find(
      ([path, options]: [string, RequestInit | undefined]) =>
        path === "/v1/editorial/specs/draft-1" && options?.method === "PATCH",
    );
    expect(patch).toBeDefined();
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({
      production_item: "Recoverable Hero Paper",
      component_type: "Hero Paper",
      wizard_step: 1,
      finalize: false,
    });
  });

  it("does not advance when the screen save fails", async () => {
    apiFetch.mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/v1/editorial/specs" && options?.method === "POST") {
        return Promise.resolve({ spec: blankDraft() });
      }
      if (path === "/v1/editorial/specs/draft-1" && options?.method === "PATCH") {
        return Promise.reject(new Error("offline"));
      }
      if (path.startsWith("/v1/editorial/component-sets")) return Promise.resolve({ component_sets: [] });
      return Promise.resolve({});
    });
    renderFlow();

    await screen.findByText("Saved as draft");
    const next = screen.getByRole("button", { name: "Next" });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Draft save failed",
      variant: "destructive",
    })));
    expect(screen.getByRole("heading", { name: "Identity" })).toBeInTheDocument();
  });

  it("restores the saved values and last active screen from a resumable draft", async () => {
    window.history.replaceState({}, "", "/super/worldsmith/editorial/specs/new?draft=draft-1");
    apiFetch.mockImplementation((path: string) => {
      if (path === "/v1/editorial/specs/draft-1") {
        return Promise.resolve({
          spec: blankDraft({
            productionItem: "Restored Hero Paper",
            componentType: "Hero Paper",
            wizardStep: 2,
          }),
        });
      }
      return Promise.resolve({});
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["editorial-spec-draft", "draft-1"], {
      spec: blankDraft(),
    });
    renderFlow(client);

    await screen.findByRole("heading", { name: "Canon & Governance" });
    expect(screen.getByText("Restored Hero Paper")).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(
      ([path, options]: [string, RequestInit | undefined]) =>
        path === "/v1/editorial/specs" && options?.method === "POST",
    )).toBe(false);
  });
});