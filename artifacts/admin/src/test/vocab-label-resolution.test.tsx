import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiFetch }));

import { SingleSelect, useVocabularies } from "@/components/worldsmith/editorial/EditorialFields";

function renderSelect(response: unknown, value = "", vocabKey = "location_scale") {
  apiFetch.mockResolvedValue(response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <SingleSelect
      value={value}
      onChange={vi.fn()}
      options={[{ key: "legacy", label: "Legacy fallback" }]}
      vocabKey={vocabKey}
      worldId="world-1"
    />,
    { wrapper },
  );
}

const openSelect = async () => {
  await waitFor(() => expect(apiFetch).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button"));
};

describe("vocabLabelResolution", () => {
  it("resolves dynamic vocabularies from API", async () => {
    apiFetch.mockResolvedValue({
      vocabularies: [{ id: "v1", key: "location_scale" }],
      options: [
        { vocabularyId: "v1", key: "continent", label: "Continent" },
        { vocabularyId: "v1", key: "planet", label: "Planet" }
      ]
    });

    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useVocabularies(), { wrapper });
    
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.vocabularies?.["location_scale"]?.[0].label).toBe("Continent");
  });

  it("keeps deactivated options displayable but does not offer them", async () => {
    renderSelect({
      vocabularies: [{ id: "v1", key: "location_scale", active: true, scope: "world", worldId: "world-1" }],
      options: [
        { vocabularyId: "v1", key: "continent", label: "Continent", active: true },
        { vocabularyId: "v1", key: "planet", label: "Old planet label", active: false },
      ],
    }, "planet");

    await openSelect();
    expect(screen.getByText("Old planet label")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Old planet label" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Continent" })).toBeTruthy();
    expect(screen.queryByText("Legacy fallback")).toBeNull();
  });

  it("does not offer options when their parent vocabulary is inactive", async () => {
    renderSelect({
      vocabularies: [{ id: "v1", key: "location_scale", active: false, scope: "world", worldId: "world-1" }],
      options: [{ vocabularyId: "v1", key: "continent", label: "Continent", active: true }],
    }, "continent");

    await openSelect();
    expect(screen.getByText("Continent")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Continent" })).toHaveLength(1);
    expect(screen.queryByText("Legacy fallback")).toBeNull();
  });

  it("retains static choices for fields with no configured vocabulary", async () => {
    renderSelect({ vocabularies: [], options: [] }, "", "unconfigured_field");

    await openSelect();
    expect(screen.getByRole("button", { name: "Legacy fallback" })).toBeTruthy();
  });

  it("includes inherited global choices and lets world duplicates override them", async () => {
    renderSelect({
      vocabularies: [
        { id: "global", key: "location_scale", active: true, scope: "global", worldId: null },
        { id: "world", key: "location_scale", active: true, scope: "world", worldId: "world-1" },
      ],
      options: [
        { vocabularyId: "global", key: "continent", label: "Global continent", active: true, worldId: null },
        { vocabularyId: "global", key: "planet", label: "Planet", active: true, worldId: null },
        { vocabularyId: "world", key: "continent", label: "World continent", active: true, worldId: "world-1" },
      ],
    });

    await openSelect();
    expect(screen.getByRole("button", { name: "World continent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Planet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Global continent" })).toBeNull();
    expect(screen.queryByText("Legacy fallback")).toBeNull();
  });
});
