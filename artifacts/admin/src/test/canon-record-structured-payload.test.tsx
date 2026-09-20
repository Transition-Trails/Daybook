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

describe("CanonRecordEditor - Structured Payload", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    storageApi.requestUploadUrl.mockReset();
    storageApi.deleteObject.mockClear();
    navigate.mockReset();
    useSearch.mockReturnValue("?type=character");
  });

  it("persists globalMetadata, structuredProfile, and generationProfile", async () => {
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes("/canon-records")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return {
          canon_record: {
            id: "canon-2", 
            worldId: "world-wychcombe", 
            name: body.name || "Test Character",
            status: "draft", 
            canonType: "character",
            globalMetadata: body.global_metadata || {},
            structuredProfile: body.structured_profile || {},
            generationProfile: body.generation_profile || {},
          },
        };
      }
      return {};
    });

    renderEditor();

    await waitFor(() => expect(screen.getByPlaceholderText("Name this canonical record")).toBeInTheDocument());

    // Select character identity attributes
    fireEvent.change(screen.getByPlaceholderText("Name this canonical record"), { target: { value: "Lady Montrose" } });
    
    // The SingleSelect component renders the label and button
    const pronounsLabel = screen.getByText("Pronouns");
    const pronounsContainer = pronounsLabel.parentElement;
    const pronounsBtn = pronounsContainer!.querySelector("button");
    fireEvent.click(pronounsBtn!);
    fireEvent.click(screen.getByText("She/Her"));

    fireEvent.click(screen.getByRole("button", { name: "Create record" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/canon-records",
      expect.objectContaining({
        method: "POST",
        body: expect.stringMatching(/"structured_profile":\{"pronouns":"she_her"\}/),
      }),
    ));
  });
});
