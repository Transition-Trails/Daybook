import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Collections from "@/pages/super/worldsmith-editorial/Collections";
import { EditorialProvider } from "@/contexts/EditorialContext";

const { apiFetchMock, toastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

function renderCollections() {
  const { hook } = memoryLocation({ path: "/super/worldsmith/editorial/collections", static: false });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={hook}>
        <EditorialProvider>
          <Collections />
        </EditorialProvider>
      </Router>
    </QueryClientProvider>,
  );
}

describe("Collection Production Spec PDF exports", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    apiFetchMock.mockReset();
    toastMock.mockReset();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === "/v1/editorial/worlds") {
        return Promise.resolve({ worlds: [{ id: "world-1", name: "Wychcombe", code: "WYC", status: "active" }] });
      }
      if (path.startsWith("/v1/editorial/collections")) {
        return Promise.resolve({
          collections: [{
            id: "collection-1",
            worldId: "world-1",
            name: "Victorian Garden Journals",
            description: "",
            status: "active",
            updatedAt: "2026-09-18T12:00:00Z",
          }],
        });
      }
      if (path.startsWith("/v1/editorial/volumes")) {
        return Promise.resolve({
          volumes: [{
            id: "volume-1",
            worldId: "world-1",
            collectionId: "collection-1",
            name: "The Curator's Desk",
            code: "V1",
            status: "active",
            description: "",
          }],
        });
      }
      return Promise.resolve({});
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      new Blob(["pdf"], { type: "application/pdf" }),
      {
        status: 200,
        headers: { "Content-Disposition": 'attachment; filename="victorian-garden-journals-production-specifications.pdf"' },
      },
    )));
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:production-spec-export"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("offers whole-collection and per-volume downloads using the correct scope", async () => {
    renderCollections();

    const collectionButton = await screen.findByRole("button", { name: "Download collection PDF" });
    expect(screen.getByRole("button", { name: "Download The Curator's Desk Production Specs PDF" })).toBeInTheDocument();

    fireEvent.click(collectionButton);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/v1/editorial/production-spec-export.pdf?collection_id=collection-1",
      { credentials: "include" },
    ));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ title: "Production Specs PDF downloaded" }));
  });
});