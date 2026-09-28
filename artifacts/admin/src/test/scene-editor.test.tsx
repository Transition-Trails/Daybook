import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SceneEditor } from "../components/worldsmith/editorial/SceneEditor";

const { apiFetch, storageApi, toast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  storageApi: { requestUploadUrl: vi.fn(), deleteObject: vi.fn() },
  toast: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch, storageApi }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const mockCanonRecords = [
  { id: "char-1", name: "Alice", canonType: "character", status: "active" },
  { id: "char-2", name: "Bob", canonType: "character", status: "active" },
  { id: "loc-1", name: "The Tavern", canonType: "location", status: "active" },
];

function setup(sceneId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });

  // Prime cache
  queryClient.setQueryData(["editorial-canon-records-all", "world-1"], { canon_records: mockCanonRecords });
  queryClient.setQueryData(["editorial-vocabularies", "world-1"], { vocabularies: [], options: [] });
  queryClient.setQueryData(["editorial-scene-anchors", "world-1"], { anchors: [] });
  queryClient.setQueryData(["editorial-narrative-images", "world-1", "story-1"], { images: [] });

  if (sceneId) {
    queryClient.setQueryData(["editorial-scenes", "story-1"], {
      scenes: [
        {
          id: sceneId,
          actId: "act-1",
          storyId: "story-1",
          worldId: "world-1",
          sceneNumber: 1,
          title: "Initial Title",
          body: "Initial body",
          attributes: { setting: "The Tavern", timeOfDay: "Night" },
          canonRecords: [{ id: "char-1", name: "Alice", canonType: "character" }],
          primaryImageUrl: "old.png",
          primaryImagePrompt: "old prompt",
        }
      ]
    });
    queryClient.setQueryData(["editorial-scene-details", sceneId], { scenes: [] });
    queryClient.setQueryData(["worldsmith-context-snapshot", "scenes", sceneId], { status: "not_generated" });
  } else {
    queryClient.setQueryData(["editorial-scenes", "story-1"], { scenes: [] });
  }

  const onClose = vi.fn();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <SceneEditor
        storyId="story-1"
        worldId="world-1"
        actId="act-1"
        sceneId={sceneId}
        defaultSceneNumber={sceneId ? 1 : 2}
        onClose={onClose}
      />
    </QueryClientProvider>
  );

  return { ...utils, onClose, user: userEvent.setup() };
}

describe("SceneEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a title and at least one character canon record to create a scene", async () => {
    const { user } = setup();

    // Attempt save with empty title and no characters
    await user.click(screen.getByTestId("button-save-scene"));

    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/editorial/scenes"),
      expect.anything()
    );
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not create scene",
      description: "Scene title is required",
      variant: "destructive"
    }));

    // Fill title but still no characters
    await user.type(screen.getByTestId("input-scene-title"), "New Adventure");
    await user.click(screen.getByTestId("button-save-scene"));

    expect(apiFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/v1/editorial/scenes"),
      expect.anything()
    );
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Could not create scene",
      description: "A scene must contain at least one character",
      variant: "destructive"
    }));

    // Select a character
    await user.click(screen.getByTestId("checkbox-canon-char-1"));

    // Mock successful creation
    apiFetch.mockResolvedValueOnce({ scene: { id: "new-scene-1" } });

    await user.click(screen.getByTestId("button-save-scene"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/v1/editorial/acts/act-1/scenes", expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"title":"New Adventure"')
      }));
    });
  });

  it("loads existing scene data and supports PATCH updates", async () => {
    const { user } = setup("scene-1");

    // We wait for the scene data to populate since it now uses a useEffect with isPending details check
    await waitFor(() => {
      expect(screen.getByTestId("input-scene-title")).toHaveValue("Initial Title");
    });

    // Verify initial values loaded
    expect(screen.getByTestId("checkbox-canon-char-1")).toBeChecked();
    expect(screen.getByTestId("checkbox-canon-loc-1")).not.toBeChecked();

    // Update data
    await user.clear(screen.getByTestId("input-scene-title"));
    await user.type(screen.getByTestId("input-scene-title"), "Updated Title");
    await user.click(screen.getByTestId("checkbox-canon-loc-1"));

    apiFetch.mockResolvedValueOnce({ scene: { id: "scene-1" } });

    await user.click(screen.getByTestId("button-save-scene"));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/v1/editorial/scenes/scene-1", expect.objectContaining({
        method: "PATCH"
      }));
    });

    const patchCall = apiFetch.mock.calls.find(c => c[0] === "/v1/editorial/scenes/scene-1" && c[1]?.method === "PATCH");
    const callArgs = JSON.parse(patchCall![1].body);
    expect(callArgs.title).toBe("Updated Title");
    expect(callArgs.canon_record_ids).toContain("char-1");
    expect(callArgs.canon_record_ids).toContain("loc-1");
  });

  it("handles image generation and saves the metadata", async () => {
    // Note: JS fetch is not fully mocked out of the box in this simplistic test,
    // so we will mock the global fetch for the data blob request.
    const mockBlob = new Blob(["fake-image"], { type: "image/png" });
    global.fetch = vi.fn().mockImplementation(async (url) => {
      if (url.startsWith("data:image")) {
        return { ok: true, blob: async () => mockBlob };
      }
      if (url === "https://upload-url.example.com") {
        return { ok: true };
      }
      throw new Error(`Unexpected fetch call to ${url}`);
    });

    const { user } = setup("scene-1");

    apiFetch.mockResolvedValueOnce({ scene: { id: "scene-1" } }); // save latest editor state
    apiFetch.mockResolvedValueOnce({
      image_data_url: "data:image/png;base64,fakedata",
      prompt: "Generated prompt text",
      generation: { seed: 1234 }
    });

    storageApi.requestUploadUrl.mockResolvedValueOnce({
      uploadURL: "https://upload-url.example.com",
      objectPath: "scenes/scene-1/img.png"
    });

    apiFetch.mockResolvedValueOnce({ scene: { id: "scene-1" } }); // PATCH response

    await user.click(screen.getByTestId("button-generate-scene-image"));

    await waitFor(() => {
      // 1. The latest editor state is saved before generation.
      expect(apiFetch).toHaveBeenCalledWith("/v1/editorial/scenes/scene-1", expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"canon_record_ids":["char-1"]')
      }));

      // 2. Generation API call
      expect(apiFetch).toHaveBeenCalledWith("/v1/editorial/scenes/scene-1/generate-image", { method: "POST" });

      // 3. Storage API call
      expect(storageApi.requestUploadUrl).toHaveBeenCalledWith(
        expect.stringContaining("scene-scene-1"),
        mockBlob.size,
        "image/png"
      );

      // 4. Image upload fetch
      expect(global.fetch).toHaveBeenCalledWith("https://upload-url.example.com", expect.objectContaining({
        method: "PUT",
        headers: { "Content-Type": "image/png" }
      }));

      // 5. Save metadata back to scene
      expect(apiFetch).toHaveBeenLastCalledWith("/v1/editorial/scenes/scene-1", expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"primary_image_url":"scenes/scene-1/img.png"')
      }));
    });
  });
});
