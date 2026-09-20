import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetch, requestUploadUrl, deleteObject, toast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  requestUploadUrl: vi.fn(),
  deleteObject: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  apiFetch,
  storageApi: { requestUploadUrl, deleteObject },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { NarrativeImageGallery } from "@/components/worldsmith/editorial/NarrativeImageGallery";

describe("NarrativeImageGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiFetch.mockImplementation((path: string) => (
      path.startsWith("/v1/editorial/narrative-images?")
        ? Promise.resolve({ images: [] })
        : Promise.resolve({ image: { id: "image-1" } })
    ));
    requestUploadUrl.mockResolvedValue({
      uploadURL: "https://storage.test/upload",
      objectPath: "/objects/story-reference.png",
    });
    deleteObject.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("uploads an image and relates it to the selected movement", async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NarrativeImageGallery
          worldId="world-1"
          storyId="story-1"
          targetType="act"
          targetId="act-2"
          title="Movement 2 images"
        />
      </QueryClientProvider>,
    );

    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["image"], "winter-crossing.png", { type: "image/png" })] },
    });

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/narrative-images",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"target_type":"act"'),
      }),
    ));
    expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/narrative-images",
      expect.objectContaining({
        body: expect.stringContaining('"target_id":"act-2"'),
      }),
    );
    expect(screen.getByText("Movement 2 images")).toBeInTheDocument();
  });
});