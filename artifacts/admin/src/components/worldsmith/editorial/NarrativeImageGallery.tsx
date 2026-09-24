import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { apiFetch, storageApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface NarrativeImage {
  id: string;
  worldId: string;
  storyId: string;
  actId?: string | null;
  sceneId?: string | null;
  title: string;
  altText: string;
  objectPath: string;
  mimeType?: string | null;
  byteSize?: number | null;
}

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function NarrativeImageGallery({
  worldId,
  storyId,
  targetType,
  targetId,
  title = "Reference images",
  compact = false,
}: {
  worldId: string;
  storyId: string;
  targetType: "story" | "act" | "scene";
  targetId: string;
  title?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const queryKey = ["editorial-narrative-images", worldId, storyId];
  const { data, error: loadError } = useQuery<{ images: NarrativeImage[] }>({
    queryKey,
    queryFn: () => apiFetch(`/v1/editorial/narrative-images?world_id=${encodeURIComponent(worldId)}&story_id=${encodeURIComponent(storyId)}`),
  });
  const images = (data?.images ?? []).filter(image => (
    targetType === "story"
      ? !image.actId && !image.sceneId
      : targetType === "act"
        ? image.actId === targetId
        : image.sceneId === targetId
  ));

  const saveFile = async (file: File, imageTitle?: string) => {
    if (!ACCEPTED_TYPES.has(file.type)) {
      throw new Error("Choose a JPEG, PNG, WebP, GIF, or AVIF image.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Choose an image smaller than 8 MB.");
    }
    let objectPath: string | undefined;
    let linked = false;
    try {
      const uploadTarget = await storageApi.requestUploadUrl(file.name, file.size, file.type);
      objectPath = uploadTarget.objectPath;
      const uploaded = await fetch(uploadTarget.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!uploaded.ok) throw new Error("The image upload was rejected");
      await apiFetch("/v1/editorial/narrative-images", {
        method: "POST",
        body: JSON.stringify({
          world_id: worldId,
          story_id: storyId,
          target_type: targetType,
          target_id: targetId,
          title: imageTitle?.slice(0, 240) || file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Story reference",
          alt_text: "",
          object_path: objectPath,
          mime_type: file.type,
          byte_size: file.size,
        }),
      });
      linked = true;
    } catch (error) {
      if (objectPath && !linked) await storageApi.deleteObject(objectPath).catch(() => undefined);
      throw error;
    }
  };

  const upload = async (files?: FileList | null) => {
    if (!files?.length || busy) return;
    setBusy(true);
    let saved = 0;
    try {
      for (const file of Array.from(files)) {
        await saveFile(file);
        saved++;
      }
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: `${saved} image${saved === 1 ? "" : "s"} uploaded`, description: `Linked to this ${targetType === "act" ? "movement" : targetType}.` });
    } catch (error) {
      if (saved) await queryClient.invalidateQueries({ queryKey });
      toast({ title: "Image upload failed", description: `${saved ? `${saved} image(s) saved. ` : ""}${error instanceof Error ? error.message : "Please try again."}`, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ image_data_url: string }>(
        "/v1/editorial/narrative-images/generate", {
          method: "POST",
          body: JSON.stringify({
            world_id: worldId,
            story_id: storyId,
            target_type: targetType,
            target_id: targetId,
            prompt: imagePrompt.trim(),
          }),
        },
      );
      const response = await fetch(result.image_data_url);
      if (!response.ok) throw new Error("The generated image could not be prepared for saving.");
      const blob = await response.blob();
      const type = blob.type || "image/png";
      const extension = type === "image/jpeg" ? "jpg" : type.split("/")[1] || "png";
      const file = new File([blob], `generated-${targetType}-${Date.now()}.${extension}`, { type });
      await saveFile(file, imagePrompt.trim().slice(0, 240) || `Generated ${targetType === "act" ? "movement" : "storyline"} image`);
      await queryClient.invalidateQueries({ queryKey });
      setImagePrompt("");
      toast({ title: "Image generated and saved", description: `Linked to this ${targetType === "act" ? "movement" : "storyline"}.` });
    } catch (error) {
      toast({ title: "Could not generate image", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (image: NarrativeImage) => {
    setBusy(true);
    try {
      await apiFetch(`/v1/editorial/narrative-images/${image.id}?world_id=${encodeURIComponent(worldId)}`, { method: "DELETE" });
      await storageApi.deleteObject(image.objectPath).catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: "Image removed" });
    } catch (error) {
      toast({ title: "Could not remove image", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? "space-y-3" : "rounded-xl border bg-white p-5 shadow-sm space-y-4"} style={compact ? undefined : { borderColor: "var(--admin-border)" }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          {!compact && <p className="mt-1 text-xs text-gray-500">Upload visual references and keep them attached to this narrative level.</p>}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          data-testid={`button-upload-${targetType}-image-${targetId}`}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-[#1B2A4A] hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Upload image
        </button>
        <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={event => upload(event.target.files)} />
      </div>
      {targetType !== "scene" && <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[160px] flex-1 text-xs text-gray-600">
          Image direction (optional)
          <input
            type="text"
            data-testid={`input-${targetType}-image-prompt-${targetId}`}
            value={imagePrompt}
            onChange={event => setImagePrompt(event.target.value)}
            maxLength={4000}
            placeholder="A scene, place, or motif to depict"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-800"
          />
        </label>
        <button
          type="button"
          data-testid={`button-generate-${targetType}-image-${targetId}`}
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--admin-ink)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Working…" : "Generate image"}
        </button>
      </div>}
      {loadError && <p role="alert" className="text-xs text-red-700">Images could not be loaded. Try reloading this page.</p>}
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map(image => (
            <div key={image.id} className="group relative overflow-hidden rounded-lg border bg-gray-50">
              <img src={`/api/storage${image.objectPath}`} alt={image.altText || image.title} className="aspect-video h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8">
                <span className="truncate text-[11px] font-medium text-white">{image.title}</span>
                <button type="button" aria-label={`Remove ${image.title}`} onClick={() => remove(image)} disabled={busy} className="rounded bg-black/30 p-1 text-white hover:bg-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 px-4 py-5 text-center text-xs text-gray-400">No linked images yet.</div>
      )}
    </div>
  );
}