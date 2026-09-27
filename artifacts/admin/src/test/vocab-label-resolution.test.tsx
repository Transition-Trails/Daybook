import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiFetch }));

import { CanonVocabularyRecordTypeProvider, SingleSelect, useVocabularies } from "@/components/worldsmith/editorial/EditorialFields";

function renderSelect(
  response: unknown,
  value = "",
  vocabKey = "location_scale",
  options = [{ key: "legacy", label: "Legacy fallback" }],
) {
  apiFetch.mockResolvedValue(response);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <SingleSelect
      value={value}
      onChange={vi.fn()}
      options={options}
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
    expect(screen.getByRole("button", { name: "Legacy fallback" })).toBeTruthy();
  });

  it("extends static defaults with active world choices", async () => {
    renderSelect({
      vocabularies: [{ id: "v1", key: "location_scale", active: true, scope: "world", worldId: "world-1" }],
      options: [{ vocabularyId: "v1", key: "continent", label: "World continent", active: true }],
    }, "", "location_scale", [
      { key: "continent", label: "Static continent" },
      { key: "planet", label: "Planet" },
    ]);

    await openSelect();
    expect(screen.getByRole("button", { name: "World continent" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Planet" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Static continent" })).toBeNull();
  });

  it("keeps a selected inactive world duplicate visible without re-enabling its static default", async () => {
    renderSelect({
      vocabularies: [{ id: "v1", key: "location_scale", active: true, scope: "world", worldId: "world-1" }],
      options: [{ vocabularyId: "v1", key: "continent", label: "Retired continent", active: false }],
    }, "continent", "location_scale", [
      { key: "continent", label: "Static continent" },
      { key: "planet", label: "Planet" },
    ]);

    await openSelect();
    expect(screen.getByRole("button", { name: "Retired continent" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Static continent" })).toBeNull();
    expect(screen.getByRole("button", { name: "Planet" })).toBeTruthy();
  });

  it("does not offer options when their parent vocabulary is inactive", async () => {
    renderSelect({
      vocabularies: [{ id: "v1", key: "location_scale", active: false, scope: "world", worldId: "world-1" }],
      options: [{ vocabularyId: "v1", key: "continent", label: "Continent", active: true }],
    }, "continent", "location_scale", [
      { key: "continent", label: "Static continent" },
      { key: "planet", label: "Planet" },
    ]);

    await openSelect();
    expect(screen.getByText("Continent")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Continent" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Static continent" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Planet" })).toBeNull();
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
    expect(screen.getByRole("button", { name: "Legacy fallback" })).toBeTruthy();
  });

  it("offers only the selected record type's choices and scopes cached data when the type changes", async () => {
    apiFetch.mockResolvedValue({
      vocabularies: [
        { id: "legacy", key: "location_scale", active: true, scope: "world", worldId: "world-1", recordType: null },
        { id: "object", key: "location_scale", active: true, scope: "world", worldId: "world-1", recordType: "object" },
        { id: "location", key: "location_scale", active: true, scope: "world", worldId: "world-1", recordType: "location" },
        { id: "character", key: "pronouns", active: true, scope: "world", worldId: "world-1", recordType: "character" },
      ],
      options: [
        { vocabularyId: "legacy", key: "old", label: "Legacy choice", active: true },
        { vocabularyId: "object", key: "object_only", label: "Object choice", active: true },
        { vocabularyId: "location", key: "location_only", label: "Location choice", active: true },
        { vocabularyId: "character", key: "character_only", label: "Character choice", active: true },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Harness() {
      const [recordType, setRecordType] = useState("object");
      return <CanonVocabularyRecordTypeProvider recordType={recordType}>
        <button type="button" onClick={() => setRecordType("location")}>Switch type</button>
        <SingleSelect value="" onChange={vi.fn()} options={[]} vocabKey="location_scale" worldId="world-1" />
      </CanonVocabularyRecordTypeProvider>;
    }
    render(<Harness />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Select..." }));
    expect(screen.getByRole("button", { name: "Object choice" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Location choice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Legacy choice" })).toBeNull();
    fireEvent.mouseDown(document.body);
    const queryCallCount = apiFetch.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Switch type" }));
    await waitFor(() => expect(apiFetch.mock.calls.length).toBe(queryCallCount));
    fireEvent.click(screen.getByRole("button", { name: "Select..." }));
    expect(await screen.findByRole("button", { name: "Location choice" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Object choice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Character choice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Legacy choice" })).toBeNull();
  });

  it("lets an inactive type-specific vocabulary suppress legacy choices", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <CanonVocabularyRecordTypeProvider recordType="object">{children}</CanonVocabularyRecordTypeProvider>
      </QueryClientProvider>
    );
    apiFetch.mockResolvedValue({
      vocabularies: [
        { id: "legacy", key: "location_scale", active: true, scope: "world", worldId: "world-1", recordType: null },
        { id: "object", key: "location_scale", active: false, scope: "world", worldId: "world-1", recordType: "object" },
      ],
      options: [
        { vocabularyId: "legacy", key: "legacy_choice", label: "Legacy choice", active: true },
        { vocabularyId: "object", key: "inactive_choice", label: "Inactive choice", active: true },
      ],
    });
    render(
      <SingleSelect value="" onChange={vi.fn()} options={[{ key: "legacy", label: "Legacy fallback" }]} vocabKey="location_scale" worldId="world-1" />,
      { wrapper },
    );
    await openSelect();
    expect(screen.queryByRole("button", { name: "Legacy choice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Legacy fallback" })).toBeNull();
  });
});
