import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Image as ImageIcon, Sparkles, X } from "lucide-react";
import { apiFetch, storageApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { EditorialRichTextField } from "@/components/EditorialRichText";
import { SingleSelect, CanonPicker, MultiChipSelect } from "@/components/worldsmith/editorial/EditorialFields";
import { NarrativeImageGallery } from "@/components/worldsmith/editorial/NarrativeImageGallery";
import { ContextSnapshotStatus } from "@/pages/super/worldsmith-editorial/ContextSnapshotStatus";

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
  scenePurpose?: string;
  viewpointDistance?: string;
  entranceState?: string;
  exitState?: string;
  immediateGoal?: string;
  conflictSource?: string;
  turnDecision?: string;
  outcome?: string;
  newInformation?: string;
  emotionalValence?: string;
  sensoryAnchors?: string;
  requiredObjects?: string;
  continuityDependencies?: string;
  canonGuardrails?: string;

  // Scene generation anchors
  setting?: string;
  timeOfDay?: string;
  mood?: string;
  lighting?: string;
  weather?: string;
  composition?: string;
  camera?: string;
  medium?: string;
  aspectRatio?: string;
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
    queryFn: () => apiFetch<{ scenes: Scene[] }>(`/v1/editorial/stories/${storyId}/scenes?world_id=${worldId}`),
    enabled: !!storyId,
    staleTime: 30_000,
  });
  const scenes = scenesData?.scenes ?? [];
  const scene = sceneId ? scenes.find(s => s.id === sceneId) : undefined;

  const { data: sceneDetailsData, isPending: isPendingDetails } = useQuery<{ scenes: any[] }>({
    queryKey: ["editorial-scene-details", sceneId],
    queryFn: () => apiFetch<{ scenes: any[] }>(`/v1/editorial/scene-details?world_id=${worldId}`).then(res => ({
      scenes: (res.scenes || []).filter((s: any) => s.sceneId === sceneId)
    })),
    enabled: !!sceneId && !!worldId,
  });

  useEffect(() => {
    if (scene && initializedSceneRef.current !== scene.id) {
      if (sceneId && isPendingDetails) return;
      initializedSceneRef.current = scene.id;

      const loadedDetails = sceneDetailsData?.scenes?.[0]?.details || {};

      setForm({
        title: scene.title,
        sceneNumber: scene.sceneNumber,
        body: scene.body || "",
        attributes: {
          ...(scene.attributes || {}),
          scenePurpose: sceneDetailsData?.scenes?.[0]?.purpose || scene.attributes?.scenePurpose || "",
          viewpointDistance: sceneDetailsData?.scenes?.[0]?.viewpointDistance || scene.attributes?.viewpointDistance || "",
          entranceState: loadedDetails.entrance_state || scene.attributes?.entranceState || "",
          exitState: loadedDetails.exit_state || scene.attributes?.exitState || "",
          immediateGoal: loadedDetails.immediate_goal || scene.attributes?.immediateGoal || "",
          conflictSource: loadedDetails.conflict_source || scene.attributes?.conflictSource || "",
          turnDecision: loadedDetails.turn_decision || scene.attributes?.turnDecision || "",
          outcome: loadedDetails.outcome || scene.attributes?.outcome || "",
          newInformation: loadedDetails.new_information || scene.attributes?.newInformation || "",
          emotionalValence: loadedDetails.emotional_valence || scene.attributes?.emotionalValence || "",
          sensoryAnchors: loadedDetails.sensory_anchors ? (Array.isArray(loadedDetails.sensory_anchors) ? loadedDetails.sensory_anchors.join(', ') : loadedDetails.sensory_anchors) : scene.attributes?.sensoryAnchors || "",
          requiredObjects: loadedDetails.required_objects ? (Array.isArray(loadedDetails.required_objects) ? loadedDetails.required_objects.join(', ') : loadedDetails.required_objects) : scene.attributes?.requiredObjects || "",
          continuityDependencies: loadedDetails.continuity_dependencies ? (Array.isArray(loadedDetails.continuity_dependencies) ? loadedDetails.continuity_dependencies.join(', ') : loadedDetails.continuity_dependencies) : scene.attributes?.continuityDependencies || "",
          canonGuardrails: loadedDetails.canon_guardrails || scene.attributes?.canonGuardrails || "",

          setting: scene.attributes?.setting || "",
          timeOfDay: loadedDetails.time_of_day || scene.attributes?.timeOfDay || "",
          mood: scene.attributes?.mood || "",
          lighting: scene.attributes?.lighting || "",
          weather: loadedDetails.weather || scene.attributes?.weather || "",
          composition: scene.attributes?.composition || "",
          camera: scene.attributes?.camera || "",
          medium: scene.attributes?.medium || "",
          aspectRatio: scene.attributes?.aspectRatio || "",
          imagePrompt: scene.attributes?.imagePrompt || "",
        },
        canonRecordIds: scene.canonRecords?.map(r => r.id) || [],
      });
    }
  }, [scene, sceneDetailsData, isPendingDetails, sceneId]);

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

  const [anchorName, setAnchorName] = useState("");
  const { data: anchorsData } = useQuery<{ anchors: any[] }>({
    queryKey: ["editorial-scene-anchors", worldId],
    queryFn: () => apiFetch<{ anchors: any[] }>(`/v1/editorial/scene-anchors?world_id=${worldId}`)
      .then(res => res || { anchors: [] })
      .catch(() => ({ anchors: [] })),
    enabled: !!worldId,
  });

  const saveAnchor = useMutation({
    mutationFn: (name: string) => apiFetch(`/v1/editorial/scene-anchors`, {
      method: "POST",
      body: JSON.stringify({
        world_id: worldId,
        name,
        details: {
          setting: form.attributes.setting,
          timeOfDay: form.attributes.timeOfDay,
          weather: form.attributes.weather,
          lighting: form.attributes.lighting,
          mood: form.attributes.mood,
          composition: form.attributes.composition,
          imagePrompt: form.attributes.imagePrompt,
          camera: form.attributes.camera,
          medium: form.attributes.medium,
          aspectRatio: form.attributes.aspectRatio
        }
      })
    }),
    onSuccess: () => {
      setAnchorName("");
      toast({ title: "Scene Anchor saved" });
      queryClient.invalidateQueries({ queryKey: ["editorial-scene-anchors", worldId] });
    }
  });

  const applyAnchor = (anchorId: string) => {
    const anchor = anchorsData?.anchors.find(a => a.id === anchorId);
    if (!anchor) return;
    setForm(curr => ({
      ...curr,
      attributes: {
        ...curr.attributes,
        ...anchor.details
      }
    }));
    toast({ title: `Applied anchor: ${anchor.name}` });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      validateScene();
      const payload = scenePayload();

      let savedSceneId = sceneId;
      if (isNew) {
        const res = await apiFetch<{ scene: Scene }>(`/v1/editorial/acts/${actId}/scenes`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        savedSceneId = res.scene.id;
      } else {
        await apiFetch<{ scene: Scene }>(`/v1/editorial/scenes/${sceneId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }

      // Sync scene details (attributes)
      try {
        const structuredDetails: Record<string, any> = {};

        if (form.attributes.entranceState) structuredDetails.entrance_state = form.attributes.entranceState;
        if (form.attributes.exitState) structuredDetails.exit_state = form.attributes.exitState;
        if (form.attributes.immediateGoal) structuredDetails.immediate_goal = form.attributes.immediateGoal;
        if (form.attributes.conflictSource) structuredDetails.conflict_source = form.attributes.conflictSource;
        if (form.attributes.turnDecision) structuredDetails.turn_decision = form.attributes.turnDecision;
        if (form.attributes.outcome) structuredDetails.outcome = form.attributes.outcome;
        if (form.attributes.newInformation) structuredDetails.new_information = form.attributes.newInformation;
        if (form.attributes.emotionalValence) structuredDetails.emotional_valence = form.attributes.emotionalValence;
        if (form.attributes.sensoryAnchors) structuredDetails.sensory_anchors = form.attributes.sensoryAnchors.split(',').map(s => s.trim()).filter(Boolean);
        if (form.attributes.requiredObjects) structuredDetails.required_objects = form.attributes.requiredObjects.split(',').map(s => s.trim()).filter(Boolean);
        if (form.attributes.continuityDependencies) structuredDetails.continuity_dependencies = form.attributes.continuityDependencies.split(',').map(s => s.trim()).filter(Boolean);
        if (form.attributes.canonGuardrails) structuredDetails.canon_guardrails = form.attributes.canonGuardrails;
        if (form.attributes.timeOfDay) structuredDetails.time_of_day = form.attributes.timeOfDay;
        if (form.attributes.weather) structuredDetails.weather = form.attributes.weather;

        const detailsPayload = {
          world_id: worldId,
          scene_id: savedSceneId,
          purpose: form.attributes.scenePurpose || undefined,
          viewpoint_distance: form.attributes.viewpointDistance || undefined,
          details: structuredDetails
        };
        // Check if details exist
        const existsReq = await fetch(`/api/v1/editorial/scene-details/${savedSceneId}?world_id=${worldId}`);
        if (existsReq.ok) {
          await apiFetch(`/v1/editorial/scene-details/${savedSceneId}?world_id=${worldId}`, {
            method: "PATCH",
            body: JSON.stringify(detailsPayload)
          });
        } else {
          await apiFetch(`/v1/editorial/scene-details`, {
            method: "POST",
            body: JSON.stringify(detailsPayload)
          });
        }
      } catch (err) {
        console.error("Failed to sync scene details:", err);
        throw new Error("Failed to sync scene attributes. Scene saved but attributes may be inconsistent.");
      }

      return { scene: { ...(scene || {}), ...payload, id: savedSceneId } as Scene };
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
                <h3 className="mb-4 text-sm font-bold text-gray-800">Scene Craft & Mechanics</h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
                  <MultiChipSelect
                    label="Scene Purpose"
                    vocabKey="scene_purpose"
                    values={form.attributes.scenePurpose ? form.attributes.scenePurpose.split(',') : []}
                    onChange={v => updateAttr("scenePurpose", v.join(','))}
                    options={[
                      { key: "establish", label: "Establish" },
                      { key: "advance_plot", label: "Advance Plot" },
                      { key: "develop_character", label: "Develop Character" },
                      { key: "deepen_relationship", label: "Deepen Relationship" },
                      { key: "reveal", label: "Reveal" },
                      { key: "conceal", label: "Conceal" },
                      { key: "escalate", label: "Escalate" },
                      { key: "reversal", label: "Reversal" },
                      { key: "payoff", label: "Payoff" },
                      { key: "transition", label: "Transition" },
                      { key: "atmosphere", label: "Atmosphere" }
                    ]}
                  />
                  <SingleSelect
                    label="Viewpoint Distance"
                    vocabKey="viewpoint_distance"
                    value={form.attributes.viewpointDistance || ""}
                    onChange={v => updateAttr("viewpointDistance", v)}
                    options={[
                      { key: "distant", label: "Distant" },
                      { key: "standard", label: "Standard" },
                      { key: "close", label: "Close" },
                      { key: "interior", label: "Interior" }
                    ]}
                  />
                  <SingleSelect
                    label="Emotional Valence"
                    vocabKey="emotional_valence"
                    value={form.attributes.emotionalValence || ""}
                    onChange={v => updateAttr("emotionalValence", v)}
                    options={[
                      { key: "positive", label: "Positive" },
                      { key: "negative", label: "Negative" },
                      { key: "mixed", label: "Mixed" },
                      { key: "neutral", label: "Neutral" }
                    ]}
                    allowCustom
                  />
                  <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                    <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Immediate Goal & Conflict</label>
                    <input
                      value={form.attributes.immediateGoal || ""}
                      onChange={e => updateAttr("immediateGoal", e.target.value)}
                      placeholder="What does the POV character want in this scene? vs What stops them?"
                      className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-[var(--admin-clay)] focus:bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                    <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Turn & Outcome</label>
                    <input
                      value={form.attributes.turnDecision || ""}
                      onChange={e => updateAttr("turnDecision", e.target.value)}
                      placeholder="The decision made or action taken, and its result."
                      className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-[var(--admin-clay)] focus:bg-white"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                    <label className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Continuity & Guardrails</label>
                    <input
                      value={form.attributes.continuityDependencies || ""}
                      onChange={e => updateAttr("continuityDependencies", e.target.value)}
                      placeholder="Dependencies on prior scenes, or absolute rules for this one."
                      className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-[var(--admin-clay)] focus:bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 mb-4 border-t pt-6" style={{ borderColor: BORDER }}>
                  <h3 className="text-sm font-bold text-gray-800">Scene Generation Anchors</h3>

                  <div className="flex items-center gap-2">
                    <select
                      className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[var(--admin-clay)]"
                      onChange={e => e.target.value && applyAnchor(e.target.value)}
                      value=""
                    >
                      <option value="" disabled>Load Scene Anchor...</option>
                      {anchorsData?.anchors.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>

                    <input
                      type="text"
                      placeholder="Save current as..."
                      value={anchorName}
                      onChange={e => setAnchorName(e.target.value)}
                      className="w-32 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-clay)]"
                    />
                    <button
                      type="button"
                      disabled={!anchorName.trim() || saveAnchor.isPending}
                      onClick={() => saveAnchor.mutate(anchorName.trim())}
                      className="rounded bg-[var(--admin-clay)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <CanonPicker
                    worldId={worldId}
                    canonType="location"
                    label="Setting / Location"
                    value={form.attributes.setting || ""}
                    onChange={v => updateAttr("setting", v)}
                  />
                  <SingleSelect
                    label="Time of Day"
                    vocabKey="time_of_day"
                    allowCustom
                    value={form.attributes.timeOfDay || ""}
                    onChange={v => updateAttr("timeOfDay", v)}
                    options={[
                      { key: "dawn", label: "Dawn" },
                      { key: "morning", label: "Morning" },
                      { key: "noon", label: "Noon" },
                      { key: "afternoon", label: "Afternoon" },
                      { key: "dusk", label: "Dusk / Sunset" },
                      { key: "evening", label: "Evening" },
                      { key: "night", label: "Night" }
                    ]}
                  />
                  <SingleSelect
                    label="Weather"
                    vocabKey="weather"
                    allowCustom
                    value={form.attributes.weather || ""}
                    onChange={v => updateAttr("weather", v)}
                    options={[
                      { key: "clear", label: "Clear" },
                      { key: "cloudy", label: "Cloudy" },
                      { key: "overcast", label: "Overcast" },
                      { key: "rain", label: "Rain" },
                      { key: "storm", label: "Storm" },
                      { key: "snow", label: "Snow" },
                      { key: "fog", label: "Fog / Mist" }
                    ]}
                  />
                  <SingleSelect
                    label="Lighting"
                    vocabKey="lighting"
                    allowCustom
                    value={form.attributes.lighting || ""}
                    onChange={v => updateAttr("lighting", v)}
                    options={[
                      { key: "natural", label: "Natural Daylight" },
                      { key: "harsh_sun", label: "Harsh Sun" },
                      { key: "dappled", label: "Dappled Light" },
                      { key: "candlelight", label: "Candlelight" },
                      { key: "firelight", label: "Firelight" },
                      { key: "gaslight", label: "Gaslight / Streetlamp" },
                      { key: "dim", label: "Dim / Shadows" }
                    ]}
                  />
                  <SingleSelect
                    label="Mood / Atmosphere"
                    vocabKey="mood_atmosphere"
                    allowCustom
                    value={form.attributes.mood || ""}
                    onChange={v => updateAttr("mood", v)}
                    options={[
                      { key: "tense", label: "Tense" },
                      { key: "melancholic", label: "Melancholic" },
                      { key: "joyful", label: "Joyful" },
                      { key: "peaceful", label: "Peaceful" },
                      { key: "ominous", label: "Ominous" },
                      { key: "romantic", label: "Romantic" }
                    ]}
                  />
                  <SingleSelect
                    label="Visual Composition"
                    vocabKey="visual_composition"
                    allowCustom
                    value={form.attributes.composition || ""}
                    onChange={v => updateAttr("composition", v)}
                    options={[
                      { key: "portrait", label: "Portrait" },
                      { key: "two_shot", label: "Two-Shot" },
                      { key: "group", label: "Group" },
                      { key: "wide_establishing", label: "Wide Establishing" },
                      { key: "detail", label: "Detail / Macro" },
                      { key: "over_shoulder", label: "Over-the-Shoulder" }
                    ]}
                  />
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Image Prompt Override / Generation Notes</span>
                      <textarea
                        value={form.attributes.imagePrompt || ""}
                        onChange={e => updateAttr("imagePrompt", e.target.value)}
                        placeholder="Optional instructions for the image generator, or explicit constraints (e.g., 'No modern buildings')."
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
                <div className="space-y-4">
                <ContextSnapshotStatus entityType="scenes" entityId={sceneId} />
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
                <NarrativeImageGallery
                  worldId={worldId}
                  storyId={storyId}
                  targetType="scene"
                  targetId={sceneId!}
                  title="Scene reference images"
                />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
