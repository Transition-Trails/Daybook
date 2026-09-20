import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
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
  const queryKey = ["editorial-narrative-images", storyId];
  const { data } = useQuery<{ images: NarrativeImage[] }>({
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

  const upload = async (file?: File) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.has(file.type)) {
      toast({ title: "Use an image file", description: "Choose a JPEG, PNG, WebP, GIF, or AVIF image.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ title: "Image is too large", description: "Choose an image smaller than 8 MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    let objectPath: string | undefined;
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
          title: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Story reference",
          alt_text: "",
          object_path: objectPath,
          mime_type: file.type,
          byte_size: file.size,
        }),
      });
      await queryClient.invalidateQueries({ queryKey });
      toast({ title: "Image uploaded", description: `Linked to this ${targetType === "act" ? "movement" : targetType}.` });
    } catch (error) {
      if (objectPath) await storageApi.deleteObject(objectPath).catch(() => undefined);
      toast({ title: "Image upload failed", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
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
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-[#1B2A4A] hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          Upload image
        </button>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" onChange={event => upload(event.target.files?.[0])} />
      </div>
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