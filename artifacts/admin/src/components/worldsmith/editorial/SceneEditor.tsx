import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Image as ImageIcon, Sparkles, X } from "lucide-react";
import { apiFetch, storageApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { EditorialRichTextField } from "@/components/EditorialRichText";

const INK = "var(--admin-ink)";
const CLAY = "var(--admin-clay)";
const BORDER = "var(--admin-border)";

export interface CanonRecord {
  id: string;
  name: string;
  canonType: string;
  status: string;
}

export interface SceneAttributes {
  setting?: string;
  timeOfDay?: string;
  mood?: string;
  lighting?: string;
  weather?: string;
  composition?: string;
  imagePrompt?: string;
}

export interface Scene {
  id: string;
  actId: string;
  storyId: string;
  worldId: string;
  sceneNumber: number;
  title: string;
  body: string;
  attributes: SceneAttributes;
  primaryImageUrl?: string;
  primaryImagePrompt?: string;
  primaryImageMetadata?: Record<string, unknown>;
  canonRecords: CanonRecord[];
}

export function SceneEditor({
  storyId,
  worldId,
  actId,
  sceneId,
  defaultSceneNumber,
  onClose,
}: {
  storyId: string;
  worldId: string;
  actId: string;
  sceneId?: string;
  defaultSceneNumber: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNew = !sceneId;
  const initializedSceneRef = useRef<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    sceneNumber: defaultSceneNumber,
    body: "",
    attributes: {} as SceneAttributes,
    canonRecordIds: [] as string[],
  });

  const { data: recordsData } = useQuery({
    queryKey: ["editorial-canon-records-all", worldId],
    queryFn: () => apiFetch<{ canon_records: CanonRecord[] }>(`/v1/editorial/canon-records?world_id=${worldId}&limit=500`),
    enabled: !!worldId,
    staleTime: 60_000,
  });
  const canonRecords = recordsData?.canon_records ?? [];
  const characters = canonRecords.filter(r => r.canonType === "character");
  const others = canonRecords.filter(r => r.canonType !== "character");

  const { data: scenesData, isLoading: scenesLoading } = useQuery({
    queryKey: ["editorial-scenes", storyId],
    queryFn: () => apiFetch<{ scenes: Scene[] }>(`/v1/editorial/stories/${storyId}/scenes`),
    enabled: !!storyId,
    staleTime: 30_000,
  });
  const scenes = scenesData?.scenes ?? [];
  const scene = sceneId ? scenes.find(s => s.id === sceneId) : undefined;

  useEffect(() => {
    if (scene && initializedSceneRef.current !== scene.id) {
      initializedSceneRef.current = scene.id;
      setForm({
        title: scene.title,
        sceneNumber: scene.sceneNumber,
        body: scene.body || "",
        attributes: scene.attributes || {},
        canonRecordIds: scene.canonRecords?.map(r => r.id) || [],
      });
    }
  }, [scene]);

  const updateAttr = (key: keyof SceneAttributes, val: string) => {
    setForm(prev => ({ ...prev, attributes: { ...prev.attributes, [key]: val } }));
  };

  const toggleRecord = (id: string) => {
    setForm(prev => {
      const ids = prev.canonRecordIds.includes(id)
        ? prev.canonRecordIds.filter(x => x !== id)
        : [...prev.canonRecordIds, id];
      return { ...prev, canonRecordIds: ids };
    });
  };

  const validateScene = () => {
    if (!form.title.trim()) throw new Error("Scene title is required");
    const hasCharacter = form.canonRecordIds.some(id => canonRecords.find(record => record.id === id)?.canonType === "character");
    if (!hasCharacter) throw new Error("A scene must contain at least one character");
  };

  const scenePayload = () => ({
    title: form.title.trim(),
    scene_number: Number(form.sceneNumber) || 1,
    body: form.body,
    attributes: form.attributes,
    canon_record_ids: form.canonRecordIds,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      validateScene();
      const payload = scenePayload();

      if (isNew) {
        return apiFetch<{ scene: Scene }>(`/v1/editorial/acts/${actId}/scenes`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      return apiFetch<{ scene: Scene }>(`/v1/editorial/scenes/${sceneId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["editorial-scenes", storyId] });
      toast({ title: isNew ? "Scene created" : "Scene saved" });
      if (isNew) {
        onClose(); // or navigate to it? for now close and let list show it
      }
    },
    onError: (error: Error) => {
      toast({
        title: isNew ? "Could not create scene" : "Could not save scene",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const [generatingImage, setGeneratingImage] = useState(false);
  const generateImageMutation = useMutation({
    mutationFn: async () => {
      if (!sceneId) throw new Error("Save the scene first before generating an image");
      validateScene();
      setGeneratingImage(true);
      await apiFetch<{ scene: Scene }>(`/v1/editorial/scenes/${sceneId}`, {
        method: "PATCH",
        body: JSON.stringify(scenePayload()),
      });
      const res = await apiFetch<{ image_data_url: string; prompt: string; generation: Record<string, unknown> }>(
        `/v1/editorial/scenes/${sceneId}/generate-image`,
        { method: "POST" }
      );
      
      // Convert data URL to Blob
      const fetchRes = await fetch(res.image_data_url);
      const blob = await fetchRes.blob();
      
      // Upload to storage
      const fileName = `scene-${sceneId}-${Date.now()}.png`;
      const { uploadURL, objectPath } = await storageApi.requestUploadUrl(fileName, blob.size, blob.type);
      
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": blob.type },
      });
      if (!putRes.ok) throw new Error("Failed to upload generated image");
      
      // Save metadata to scene
      const saved = await apiFetch<{ scene: Scene }>(`/v1/editorial/scenes/${sceneId}`, {
        method: "PATCH",
        body: JSON.stringify({
          primary_image_url: objectPath,
          primary_image_prompt: res.prompt,
          primary_image_metadata: res.generation,
        }),
      });
      if (scene?.primaryImageUrl && scene.primaryImageUrl !== objectPath) {
        await storageApi.deleteObject(scene.primaryImageUrl).catch(() => undefined);
      }
      return saved;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<{ scenes: Scene[] }>(["editorial-scenes", storyId], current => {
        if (!current) return current;
        return {
          scenes: current.scenes.map(s => s.id === result.scene.id ? result.scene : s)
        };
      });
      toast({ title: "Image generated and saved" });
    },
    onError: (error: Error) => {
      toast({
        title: "Image generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => setGeneratingImage(false),
  });

  if (sceneId && scenesLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-6 shadow-sm" style={{ borderColor: BORDER }}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5 text-gray-500" />
          </button>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: CLAY }}>
              {isNew ? "New Scene" : `Editing Scene ${scene?.sceneNumber}`}
            </span>
            <span className="text-sm font-semibold" style={{ color: INK }}>{form.title || "Untitled"}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: INK }}
            data-testid="button-save-scene"
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-gray-50/50 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              {/* Main Info */}
              <section className="rounded-xl border bg-white p-6 shadow-sm" style={{ borderColor: BORDER }}>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="sm:col-span-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">Scene Title</span>
                      <input
                        autoFocus={isNew}
                        value={form.title}
                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                        data-testid="input-scene-title"
                      />
                    </label>
                  </div>
                  <div>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-700">Scene #</span>
                      <input
                        type="number"
                        min={1}
                        value={form.sceneNumber}
                        onChange={e => setForm(f => ({ ...f, sceneNumber: Number(e.target.value) }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)]"
                      />
                    </label>
                  </div>
                </div>
                
                <div className="mt-6">
                  <label className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">Scene Body</span>
                  </label>
                  <EditorialRichTextField
                    value={form.body}
                    onChange={v => setForm(f => ({ ...f, body: v }))}
                    placeholder="Write the scene..."
                    minHeight={300}
                  />
                </div>
              </section>

              {/* Attributes */}
              <section className="rounded-xl border bg-white p-6 shadow-sm" style={{ borderColor: BORDER }}>
                <h3 className="mb-4 text-sm font-bold text-gray-800">Scene Attributes</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { key: "setting", label: "Setting / Location" },
                    { key: "timeOfDay", label: "Time of Day" },
                    { key: "weather", label: "Weather" },
                    { key: "mood", label: "Mood / Atmosphere" },
                    { key: "lighting", label: "Lighting" },
                    { key: "composition", label: "Visual Composition" },
                  ].map(({ key, label }) => (
                    <label key={key} className="block">
                      <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">{label}</span>
                      <input
                        value={form.attributes[key as keyof SceneAttributes] || ""}
                        onChange={e => updateAttr(key as keyof SceneAttributes, e.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-[var(--admin-clay)] focus:bg-white"
                      />
                    </label>
                  ))}
                  <div className="sm:col-span-2">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Image Prompt Override</span>
                      <textarea
                        value={form.attributes.imagePrompt || ""}
                        onChange={e => updateAttr("imagePrompt", e.target.value)}
                        placeholder="Optional instructions for the image generator..."
                        className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-[var(--admin-clay)] focus:bg-white"
                        rows={2}
                      />
                    </label>
                  </div>
                </div>
              </section>
            </div>

            <div className="space-y-6">
              {/* Canon Records */}
              <section className="rounded-xl border bg-white p-5 shadow-sm flex flex-col h-[500px]" style={{ borderColor: BORDER }}>
                <div className="mb-3 shrink-0">
                  <h3 className="text-sm font-bold text-gray-800">Canon Connections</h3>
                  <p className="text-[11px] text-gray-500 mt-1">Select the characters and elements present in this scene. At least one character is required.</p>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 mb-2">Characters *</h4>
                    <div className="space-y-1">
                      {characters.map(record => (
                        <label key={record.id} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.canonRecordIds.includes(record.id)}
                            onChange={() => toggleRecord(record.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            data-testid={`checkbox-canon-${record.id}`}
                          />
                          <span className="text-sm text-gray-700">{record.name}</span>
                        </label>
                      ))}
                      {characters.length === 0 && <p className="text-xs text-gray-400 italic">No characters found.</p>}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Other Elements</h4>
                    <div className="space-y-1">
                      {others.map(record => (
                        <label key={record.id} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.canonRecordIds.includes(record.id)}
                            onChange={() => toggleRecord(record.id)}
                            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                            data-testid={`checkbox-canon-${record.id}`}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm text-gray-700 leading-none">{record.name}</span>
                            <span className="text-[10px] text-gray-400">{record.canonType}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Primary Image */}
              {!isNew && (
                <section className="rounded-xl border bg-white p-5 shadow-sm" style={{ borderColor: BORDER }}>
                  <h3 className="mb-3 text-sm font-bold text-gray-800">Scene Visualization</h3>
                  {scene?.primaryImageUrl ? (
                    <div className="space-y-3">
                      <div className="aspect-video w-full overflow-hidden rounded-lg bg-gray-100">
                        <img
                          src={`/api/storage${scene.primaryImageUrl}`}
                          alt="Scene visualization"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <p className="text-xs text-gray-500 italic line-clamp-3" title={scene.primaryImagePrompt}>
                        {scene.primaryImagePrompt}
                      </p>
                    </div>
                  ) : (
                    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400">
                      <ImageIcon className="h-8 w-8 opacity-50" />
                      <span className="text-xs">No image generated</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => generateImageMutation.mutate()}
                    disabled={generatingImage || saveMutation.isPending}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                    style={{ borderColor: BORDER, color: INK }}
                    data-testid="button-generate-scene-image"
                  >
                    {generatingImage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" style={{ color: CLAY }} />
                    )}
                    {scene?.primaryImageUrl ? "Regenerate Image" : "Generate Image"}
                  </button>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
