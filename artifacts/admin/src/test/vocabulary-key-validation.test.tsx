import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/contexts/EditorialContext", () => ({
  useEditorial: () => ({ selectedWorldId: "world-1", selectedWorld: { name: "Wychcombe" }, worldsLoading: false }),
}));

import Vocabularies from "@/pages/super/worldsmith-editorial/Vocabularies";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Vocabularies />
    </QueryClientProvider>,
  );
}

describe("vocabulary saved key", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string) => {
      if (path.startsWith("/v1/editorial/vocabularies?")) {
        return Promise.resolve({
          vocabularies: [{
            id: "evidence", key: "evidence_type", label: "Evidence type", description: "",
            worldId: "world-1", scope: "world", active: true, version: 1,
          }],
          options: [],
        });
      }
      return Promise.resolve({ option: { id: "documentary" } });
    });
  });

  it("saves Documentary as a lowercase key without changing the display label", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("button-add-option-evidence"));
    fireEvent.change(screen.getByTestId("input-vocabulary-key"), { target: { value: "Documentary" } });
    fireEvent.change(screen.getByTestId("input-vocabulary-label"), { target: { value: "Documentary" } });
    expect(screen.getByTestId("input-vocabulary-key")).toHaveValue("documentary");
    fireEvent.click(screen.getByTestId("button-save-vocabulary"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/vocabulary-management/options",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          world_id: "world-1", vocabulary_id: "evidence",
          key: "documentary", label: "Documentary",
        }),
      }),
    ));
  });

  it("explains unsupported key characters before calling the API", async () => {
    renderPage();
    fireEvent.click(await screen.findByTestId("button-add-option-evidence"));
    fireEvent.change(screen.getByTestId("input-vocabulary-key"), { target: { value: "documentary evidence!" } });
    fireEvent.change(screen.getByTestId("input-vocabulary-label"), { target: { value: "Documentary" } });
    fireEvent.click(screen.getByTestId("button-save-vocabulary"));
    expect(screen.getByTestId("status-vocabulary-form-error")).toHaveTextContent("lowercase letters, numbers, underscores, or hyphens");
    expect(apiFetch).not.toHaveBeenCalledWith("/v1/editorial/vocabulary-management/options", expect.anything());
  });
});