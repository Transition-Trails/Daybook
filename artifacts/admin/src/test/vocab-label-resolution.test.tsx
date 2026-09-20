import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiFetch }));

import { useVocabularies } from "@/components/worldsmith/editorial/EditorialFields";

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
});
