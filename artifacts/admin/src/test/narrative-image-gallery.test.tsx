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

  it("uploads multiple selected images as separate storyline records", async () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NarrativeImageGallery worldId="world-1" storyId="story-1" targetType="story" targetId="story-1" />
      </QueryClientProvider>,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [
        new File(["a"], "first.png", { type: "image/png" }),
        new File(["b"], "second.png", { type: "image/png" }),
      ] },
    });
    await waitFor(() => expect(apiFetch.mock.calls.filter(([path]) => path === "/v1/editorial/narrative-images")).toHaveLength(2));
    const saves = apiFetch.mock.calls.filter(([path]) => path === "/v1/editorial/narrative-images");
    expect(saves.map(([, options]) => JSON.parse(options.body).title)).toEqual(["first", "second"]);
    expect(saves.every(([, options]) => JSON.parse(options.body).target_type === "story")).toBe(true);
  });

  it("generates and saves a movement image using the same durable gallery endpoint", async () => {
    const fileBytes = new Blob(["generated"], { type: "image/png" });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      Promise.resolve(url.startsWith("data:")
        ? { ok: true, blob: () => Promise.resolve(fileBytes) }
        : { ok: true }),
    ));
    apiFetch.mockImplementation((path: string) => {
      if (path.includes("/generate")) return Promise.resolve({ image_data_url: "data:image/png;base64,aW1hZ2U=" });
      return Promise.resolve(path.startsWith("/v1/editorial/narrative-images?") ? { images: [] } : { image: { id: "generated-1" } });
    });
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NarrativeImageGallery worldId="world-1" storyId="story-1" targetType="act" targetId="act-2" />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByTestId("input-act-image-prompt-act-2"), { target: { value: "An amber garden" } });
    fireEvent.click(screen.getByTestId("button-generate-act-image-act-2"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/narrative-images/generate",
      expect.objectContaining({ body: expect.stringContaining('"prompt":"An amber garden"') }),
    ));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/v1/editorial/narrative-images",
      expect.objectContaining({ body: expect.stringContaining('"target_id":"act-2"') }),
    ));
    expect(requestUploadUrl).toHaveBeenCalledOnce();
    expect(screen.getByTestId("input-act-image-prompt-act-2")).toHaveValue("");
  });
});