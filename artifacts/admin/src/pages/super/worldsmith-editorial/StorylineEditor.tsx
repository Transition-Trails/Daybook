import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeft, ArrowUp, BookOpen, ChevronRight, Loader2, Plus, Image as ImageIcon, Trash2 } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { EditorialRichTextField } from "@/components/EditorialRichText";
import { SingleSelect, MultiChipSelect, CanonPicker, StructuredRepeater } from "@/components/worldsmith/editorial/EditorialFields";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { SceneEditor, Scene } from "@/components/worldsmith/editorial/SceneEditor";
import { NarrativeImageGallery } from "@/components/worldsmith/editorial/NarrativeImageGallery";

const INK = "#1B2A4A";
const CLAY = "#C87560";
const BORDER = "var(--admin-border)";
const STORY_STATUSES = ["draft", "planned", "active", "archived"] as const;

function promptPreviewText(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map(item => item.trim())
      .filter(Boolean)
      .join(", ");
  }
  return typeof value === "string" ? value.trim() : "";
}

interface StoryAct {
  id: string;
  storyId: string;
  actNumber: number;
  title: string;
  tagline: string;
  narrative: string;
}

interface Story {
  id: string;
  worldId: string;
  title: string;
  summary: string;
  status: string;
  acts: StoryAct[];
  storySpine?: any[];
  revealArchitecture?: any[];
  globalMetadata?: Record<string, any>;
}

interface StoryForm {
  title: string;
  summary: string;
  status: string;
  storySpine: any[];
  revealArchitecture: any[];
  globalMetadata: Record<string, any>;
}

function createEmptyForm(search: string): StoryForm {
  const params = new URLSearchParams(search);
  return {
    title: params.get("title") ?? "",
    summary: params.get("summary") ?? "",
    status: params.get("status") ?? "draft",
    storySpine: [],
    revealArchitecture: [],
    globalMetadata: {},
  };
}

import { ContextSnapshotStatus } from "@/pages/super/worldsmith-editorial/ContextSnapshotStatus";

export default function StorylineEditor({ storyId }: { storyId?: string }) {
  const isNew = !storyId;
  const [, navigate] = useLocation();
  const search = useSearch();
  const { selectedWorld, worlds } = useEditorial();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<StoryForm>(() => createEmptyForm(search));
  const [newActTitle, setNewActTitle] = useState("");
  const [actTitleDrafts, setActTitleDrafts] = useState<Record<string, string>>({});
  const [actPurposeDrafts, setActPurposeDrafts] = useState<Record<string, string>>({});
  const initializedStoryRef = useRef<string | null>(null);

  // Scene Editor state
  const [editingScene, setEditingScene] = useState<{ actId: string, sceneId?: string } | null>(null);

  const { data, isLoading, isError } = useQuery<{ story: Story }>({
    queryKey: ["editorial-story", storyId],
    queryFn: () => apiFetch(`/v1/editorial/stories/${storyId}`),
    enabled: !!storyId,
    staleTime: 30_000,
  });
  const story = data?.story;
  const recordWorld = story ? worlds.find(world => world.id === story.worldId) : selectedWorld;
  const worldId = story?.worldId ?? selectedWorld?.id;

  const { data: fieldContextData, isFetching: isFetchingFieldContext } = useQuery<{ context: any }>({
    queryKey: ["editorial-story-field-context", storyId],
    queryFn: () => apiFetch<{ context: any }>(`/v1/editorial/stories/${storyId}/field-context?world_id=${worldId}`),
    enabled: !!storyId && !!worldId,
  });

  const { data: scenesData } = useQuery({
    queryKey: ["editorial-scenes", storyId],
    queryFn: () => apiFetch<{ scenes: Scene[] }>(`/v1/editorial/stories/${storyId}/scenes`),
    enabled: !!storyId,
    staleTime: 30_000,
  });
  const scenes = scenesData?.scenes ?? [];

  const { data: beatsData, isPending: isPendingBeats } = useQuery({
    queryKey: ["editorial-story-beats", storyId],
    queryFn: () => apiFetch<{ beats: any[] }>(`/v1/editorial/stories/${storyId}/beats?world_id=${worldId}`),
    enabled: !!storyId && !!worldId,
  });

  const { data: revealsData, isPending: isPendingReveals } = useQuery({
    queryKey: ["editorial-story-reveals", storyId],
    queryFn: () => apiFetch<{ reveals: any[] }>(`/v1/editorial/stories/${storyId}/reveals?world_id=${worldId}`),
    enabled: !!storyId && !!worldId,
  });

  useEffect(() => {
    if (story && initializedStoryRef.current !== story.id) {
      if (!!storyId && !!worldId && (isPendingBeats || isPendingReveals)) return;
      initializedStoryRef.current = story.id;

      const storySpine = beatsData?.beats?.map(b => ({
        id: b.id,
        beatType: b.beatType,
        title: b.title,
        summary: b.summary,
        sortOrder: b.sortOrder,
        povCharacter: b.details?.point_of_view_character_id,
        location: b.details?.location_record_id,
        goal: b.details?.character_goal,
        obstacle: b.details?.obstacle,
        choice: b.details?.choice,
        outcome: b.details?.outcome,
        cost: b.details?.cost,
        knowledge: b.details?.knowledge_change,
        relationshipChange: b.details?.relationship_change,
        emotionalMovement: b.details?.emotional_movement,
        setupPayoffLinks: b.details?.setup_payoff_links?.join(', '),
        involvedCharacters: b.details?.involved_character_ids,
        spoilerLevel: b.details?.spoiler_level,
        status: b.status
      })) ?? [];

      const revealArchitecture = revealsData?.reveals?.map(r => ({
        id: r.id,
        title: r.title,
        truth: r.truth,
        audienceState: r.audienceKnowledge,
        firstClue: r.details?.first_clue,
        whoKnowsRecordIds: r.details?.who_knows_record_ids,
        falseBeliefRecordIds: r.details?.false_belief_record_ids,
        reinforcingClues: r.details?.reinforcing_clues?.join(', '),
        redHerrings: r.details?.red_herrings?.join(', '),
        partialReveal: r.details?.partial_reveal,
        fullReveal: r.details?.full_reveal,
        recontextualization: r.details?.recontextualization,
        consequences: r.details?.consequences,
        linkedSceneIds: r.details?.linked_scene_ids?.join(', '),
        linkedRecordIds: r.details?.linked_record_ids?.join(', '),
      })) ?? [];

      setForm({
        title: story.title,
        summary: story.summary ?? "",
        status: story.status ?? "draft",
        storySpine,
        revealArchitecture,
        globalMetadata: story.globalMetadata ?? {},
      });
    }
  }, [story, beatsData, revealsData, isPendingBeats, isPendingReveals, storyId, worldId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("A storyline title is required");

      let savedStoryId = storyId;
      let resultStory = story;

      if (isNew) {
        if (!worldId) throw new Error("Choose a world before creating a storyline");
        const res = await apiFetch<{ story: Story }>("/v1/editorial/stories", {
          method: "POST",
          body: JSON.stringify({
            world_id: worldId,
            title: form.title.trim(),
            summary: form.summary,
            status: form.status,
            global_metadata: form.globalMetadata,
          }),
        });
        savedStoryId = res.story.id;
        resultStory = {
          ...res.story,
          acts: Array.isArray(res.story.acts) ? res.story.acts : [],
        };
      } else {
        const res = await apiFetch<{ story: Story }>(`/v1/editorial/stories/${storyId}`, {
          method: "PATCH",
          body: JSON.stringify({
            title: form.title.trim(),
            summary: form.summary,
            status: form.status,
            global_metadata: form.globalMetadata,
          }),
        });
        resultStory = {
          ...res.story,
          acts: Array.isArray(res.story.acts) ? res.story.acts : (story?.acts ?? []),
        };
      }

      // Sync Beats
      const beats = form.storySpine.map((b: any, idx: number) => ({
        beat_type: b.beatType || "setup",
        title: b.title || `Beat ${idx + 1}`,
        summary: b.summary || "",
        sort_order: idx,
        details: {
          point_of_view_character_id: b.povCharacter || null,
          location_record_id: b.location || null,
          character_goal: b.goal || null,
          obstacle: b.obstacle || null,
          choice: b.choice || null,
          outcome: b.outcome || null,
          cost: b.cost || null,
          knowledge_change: b.knowledge || null,
          relationship_change: b.relationshipChange || null,
          emotional_movement: b.emotionalMovement || null,
          setup_payoff_links: b.setupPayoffLinks ? b.setupPayoffLinks.split(',').map((s: string) => s.trim()) : [],
          involved_character_ids: b.involvedCharacters ? (Array.isArray(b.involvedCharacters) ? b.involvedCharacters : b.involvedCharacters.split(',').map((s: string) => s.trim())) : [],
          spoiler_level: b.spoilerLevel || null
        },
        status: b.status || "draft"
      }));

      await apiFetch(`/v1/editorial/stories/${savedStoryId}/beats`, {
        method: "PUT",
        body: JSON.stringify({ world_id: worldId, beats })
      });

      // Sync Reveals
      const reveals = form.revealArchitecture.map((r: any, idx: number) => ({
        title: r.truth ? r.truth.slice(0, 50) : `Reveal ${idx + 1}`,
        truth: r.truth || "",
        audience_knowledge: r.audienceState || "withheld",
        details: {
          first_clue: r.firstClue || null,
          who_knows_record_ids: r.whoKnowsRecordIds ? (Array.isArray(r.whoKnowsRecordIds) ? r.whoKnowsRecordIds : r.whoKnowsRecordIds.split(',').map((s: string) => s.trim())) : [],
          false_belief_record_ids: r.falseBeliefRecordIds ? (Array.isArray(r.falseBeliefRecordIds) ? r.falseBeliefRecordIds : r.falseBeliefRecordIds.split(',').map((s: string) => s.trim())) : [],
          reinforcing_clues: r.reinforcingClues ? r.reinforcingClues.split(',').map((s: string) => s.trim()) : [],
          red_herrings: r.redHerrings ? r.redHerrings.split(',').map((s: string) => s.trim()) : [],
          partial_reveal: r.partialReveal || null,
          full_reveal: r.fullReveal || null,
          recontextualization: r.recontextualization || null,
          consequences: r.consequences || null,
          linked_scene_ids: r.linkedSceneIds ? r.linkedSceneIds.split(',').map((s: string) => s.trim()) : [],
          linked_record_ids: r.linkedRecordIds ? r.linkedRecordIds.split(',').map((s: string) => s.trim()) : []
        }
      }));

      await apiFetch(`/v1/editorial/stories/${savedStoryId}/reveals`, {
        method: "PUT",
        body: JSON.stringify({ world_id: worldId, reveals })
      });

      return { story: resultStory };
    },
    onSuccess: result => {
      queryClient.setQueryData(["editorial-story", result.story.id], { story: result.story });
      queryClient.invalidateQueries({ queryKey: ["ws-stories"] });
      queryClient.invalidateQueries({ queryKey: ["ws-story-connections", result.story.worldId] });
      queryClient.invalidateQueries({ queryKey: ["editorial-story-beats", result.story.id] });
      queryClient.invalidateQueries({ queryKey: ["editorial-story-reveals", result.story.id] });
      toast({ title: isNew ? "Storyline created" : "Storyline saved" });
      if (isNew) {
        navigate(`/super/worldsmith/editorial/stories/${result.story.id}`);
      } else {
        setForm(current => ({
          ...current,
          title: result.story.title,
          summary: result.story.summary ?? "",
          status: result.story.status ?? "draft",
          globalMetadata: result.story.globalMetadata ?? {},
        }));
      }
    },
    onError: (error: Error) => toast({
      title: isNew ? "Could not create storyline" : "Could not save storyline",
      description: error.message,
      variant: "destructive",
    }),
  });

  const createActMutation = useMutation({
    mutationFn: () => {
      const actNumber = (story?.acts.length ?? 0) + 1;
      return apiFetch<{ act: StoryAct }>(`/v1/editorial/stories/${storyId}/acts`, {
        method: "POST",
        body: JSON.stringify({
          world_id: worldId,
          title: newActTitle.trim() || `Movement ${actNumber}`,
          act_number: actNumber,
        }),
      });
    },
    onSuccess: ({ act }) => {
      setNewActTitle("");
      queryClient.setQueryData<{ story: Story }>(["editorial-story", storyId], current => {
        if (!current) return current;
        return {
          story: {
            ...current.story,
            acts: [...current.story.acts, act].sort((a, b) => a.actNumber - b.actNumber),
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["editorial-story", storyId] });
      queryClient.invalidateQueries({ queryKey: ["ws-stories"] });
      queryClient.invalidateQueries({ queryKey: ["ws-story-connections", worldId] });
      toast({ title: "Movement added" });
    },
    onError: (error: Error) => toast({
      title: "Could not add movement",
      description: error.message,
      variant: "destructive",
    }),
  });

  const saveActPurposeMutation = useMutation({
    mutationFn: ({ actId, purpose }: { actId: string; purpose: string }) =>
      apiFetch<{ act: StoryAct }>(`/v1/editorial/acts/${actId}`, {
        method: "PATCH",
        body: JSON.stringify({ narrative: purpose }),
      }),
    onSuccess: ({ act }) => {
      queryClient.setQueryData<{ story: Story }>(["editorial-story", storyId], current => {
        if (!current) return current;
        return {
          story: {
            ...current.story,
            acts: current.story.acts.map(item => item.id === act.id ? { ...item, ...act } : item),
          },
        };
      });
      setActPurposeDrafts(current => ({ ...current, [act.id]: act.narrative ?? "" }));
      toast({ title: "Movement purpose saved" });
    },
    onError: (error: Error) => toast({
      title: "Could not save movement purpose",
      description: error.message,
      variant: "destructive",
    }),
  });

  const saveActTitleMutation = useMutation({
    mutationFn: ({ actId, title }: { actId: string; title: string }) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("A movement name is required");
      return apiFetch<{ act: StoryAct }>(`/v1/editorial/acts/${actId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmedTitle }),
      });
    },
    onSuccess: ({ act }) => {
      queryClient.setQueryData<{ story: Story }>(["editorial-story", storyId], current => {
        if (!current) return current;
        return {
          story: {
            ...current.story,
            acts: current.story.acts.map(item => item.id === act.id ? { ...item, ...act } : item),
          },
        };
      });
      setActTitleDrafts(current => ({ ...current, [act.id]: act.title }));
      queryClient.invalidateQueries({ queryKey: ["ws-stories"] });
      queryClient.invalidateQueries({ queryKey: ["ws-story-connections", worldId] });
      toast({ title: "Movement name saved" });
    },
    onError: (error: Error) => toast({
      title: "Could not save movement name",
      description: error.message,
      variant: "destructive",
    }),
  });

  const deleteSceneMutation = useMutation({
    mutationFn: (sceneIdToDelete: string) =>
      apiFetch(`/v1/editorial/scenes/${sceneIdToDelete}`, { method: "DELETE" }),
    onSuccess: (_, deletedId) => {
      queryClient.setQueryData<{ scenes: Scene[] }>(["editorial-scenes", storyId], current => {
        if (!current) return current;
        return { scenes: current.scenes.filter(s => s.id !== deletedId) };
      });
      toast({ title: "Scene deleted" });
    },
    onError: (error: Error) => toast({
      title: "Could not delete scene",
      description: error.message,
      variant: "destructive",
    }),
  });

  const moveSceneMutation = useMutation({
    mutationFn: ({ sceneId, actId, sceneNumber }: { sceneId: string; actId: string; sceneNumber: number }) =>
      apiFetch<{ scenes: Array<Pick<Scene, "id" | "actId" | "sceneNumber">> }>(`/v1/editorial/scenes/${sceneId}/move`, {
        method: "POST",
        body: JSON.stringify({ act_id: actId, scene_number: sceneNumber }),
      }),
    onSuccess: ({ scenes: movedScenes }) => {
      const updates = new Map(movedScenes.map(scene => [scene.id, scene]));
      queryClient.setQueryData<{ scenes: Scene[] }>(["editorial-scenes", storyId], current => {
        if (!current) return current;
        return {
          scenes: current.scenes.map(scene => {
            const update = updates.get(scene.id);
            return update ? { ...scene, ...update } : scene;
          }),
        };
      });
      toast({ title: "Scene order updated" });
    },
    onError: (error: Error) => toast({
      title: "Could not move scene",
      description: error.message,
      variant: "destructive",
    }),
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" style={{ color: CLAY }} /></div>;
  }
  if (!isNew && (isError || !story)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <BookOpen className="h-8 w-8" style={{ color: "#9CA3AF" }} />
        <p className="text-sm" style={{ color: INK }}>Storyline not found.</p>
        <button onClick={() => navigate("/super/worldsmith/editorial/stories")} className="text-sm font-semibold hover:underline" style={{ color: CLAY }}>
          Back to Storylines
        </button>
      </div>
    );
  }
  if (isNew && !selectedWorld) {
    return <div className="flex h-full items-center justify-center text-sm" style={{ color: "#7D8797" }}>Choose a world before creating a storyline.</div>;
  }

  const fieldContext = fieldContextData?.context;
  const fieldWarnings = Array.isArray(fieldContext?.warnings) ? fieldContext.warnings : [];
  const fieldNegative = Array.isArray(fieldContext?.negative) ? fieldContext.negative : [];
  const fieldAttributions = Array.isArray(fieldContext?.attributions) ? fieldContext.attributions : [];
  const fieldPrompt = promptPreviewText(fieldContext?.prompt);

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--admin-card-subtle)" }}>
      {editingScene && story && worldId && (
        <SceneEditor
          storyId={story.id}
          worldId={worldId}
          actId={editingScene.actId}
          sceneId={editingScene.sceneId}
          defaultSceneNumber={scenes.filter(scene => scene.actId === editingScene.actId).length + 1}
          onClose={() => setEditingScene(null)}
        />
      )}

      <header className="flex h-12 items-center gap-2 border-b bg-white px-7" style={{ borderColor: BORDER }}>
        <span className="text-[11px]" style={{ color: "#98A2B3" }}>WorldSmith</span>
        <span className="text-[11px]" style={{ color: "#C9BFB2" }}>/</span>
        <span className="text-[11px]" style={{ color: "#667085" }}>{recordWorld?.name ?? "World"}</span>
        <span className="text-[11px]" style={{ color: "#C9BFB2" }}>/</span>
        <Link href="/super/worldsmith/editorial/stories"><span className="cursor-pointer text-[11px]" style={{ color: "#667085" }}>Storylines</span></Link>
        <span className="text-[11px]" style={{ color: "#C9BFB2" }}>/</span>
        <span className="text-[11px] font-semibold" style={{ color: INK }}>{isNew ? "New record" : story?.title}</span>
      </header>

      <div className="w-full px-8 py-8">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: CLAY }}>
              <BookOpen className="h-3.5 w-3.5" />
              Editorial Studio · Storylines
            </div>
            <h1 className="mt-2 text-3xl leading-tight" style={{ color: INK, fontFamily: "'Playfair Display', Georgia, serif" }}>
              {isNew ? "New Storyline" : `${story?.title} — Storyline`}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "#667085" }}>
              {isNew
                ? "Start a new adventure grounded in this world’s canon, atmosphere, and physical keepsakes."
                : "Refine the story promise and movements that connect your canon to a reader’s journey."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isNew && (
              <button
                type="button"
                onClick={() => document.getElementById("story-scenes")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold"
                style={{ color: INK, borderColor: BORDER, background: "white" }}
              >
                Scenes <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => navigate("/super/worldsmith/editorial/stories")} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: CLAY }}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Storylines
            </button>
          </div>
        </div>

        <form
          onSubmit={event => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
        >
          <div className="space-y-5">
            <section className="rounded-2xl border p-7" style={{ background: "var(--admin-card)", borderColor: BORDER }}>
              <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_200px]">
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#786D60" }}>Storyline title</span>
                  <input
                    autoFocus={isNew}
                    value={form.title}
                    onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                    placeholder="Name this adventure"
                    className="mt-2 w-full border-b bg-transparent pb-2 text-2xl font-semibold outline-none focus:border-[#C87560]"
                    style={{ color: INK, borderColor: "#D9CFC3", fontFamily: "'Playfair Display', Georgia, serif" }}
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#786D60" }}>Stage</span>
                  <select
                    value={form.status}
                    onChange={event => setForm(current => ({ ...current, status: event.target.value }))}
                    className="mt-2 w-full rounded-lg border bg-white px-3 py-2.5 text-sm outline-none focus:border-[#C87560]"
                    style={{ color: INK, borderColor: "#D9CFC3" }}
                  >
                    {STORY_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-6">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#786D60" }}>Narrative promise</p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "#667085" }}>
                  Who is changed by this story, what is at stake, and what will a reader carry into the physical world?
                </p>
                <div className="mt-3">
                  <EditorialRichTextField
                    value={form.summary}
                    onChange={summary => setForm(current => ({ ...current, summary }))}
                    minHeight={230}
                    placeholder="Write the promise that pulls a reader into this world."
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
              <h2 className="text-sm font-semibold mb-4" style={{ color: INK }}>Story Attributes</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SingleSelect
                  label="Form"
                  vocabKey="story_form"
                  value={form.globalMetadata.form ?? ""}
                  onChange={v => setForm(current => ({ ...current, globalMetadata: { ...current.globalMetadata, form: v } }))}
                  options={[
                    { key: "novel", label: "Novel" },
                    { key: "novella", label: "Novella" },
                    { key: "short_story", label: "Short Story" },
                    { key: "serial", label: "Serial" },
                    { key: "episode", label: "Episode" },
                    { key: "interactive", label: "Interactive Story" },
                    { key: "campaign", label: "Campaign" },
                    { key: "side_story", label: "Side Story" }
                  ]}
                />
                <SingleSelect
                  label="Scope"
                  vocabKey="story_scope"
                  value={form.globalMetadata.scope ?? ""}
                  onChange={v => setForm(current => ({ ...current, globalMetadata: { ...current.globalMetadata, scope: v } }))}
                  options={[
                    { key: "scene", label: "Scene" },
                    { key: "sequence", label: "Sequence" },
                    { key: "chapter", label: "Chapter" },
                    { key: "subplot", label: "Subplot" },
                    { key: "main_plot", label: "Main Plot" },
                    { key: "volume", label: "Volume" },
                    { key: "series", label: "Series" }
                  ]}
                />
                <MultiChipSelect
                  label="Genre"
                  vocabKey="story_genre"
                  allowCustom
                  values={form.globalMetadata.genre ?? []}
                  onChange={v => setForm(current => ({ ...current, globalMetadata: { ...current.globalMetadata, genre: v } }))}
                  options={[
                    { key: "historical", label: "Historical" },
                    { key: "romance", label: "Romance" },
                    { key: "mystery", label: "Mystery" },
                    { key: "family_drama", label: "Family Drama" },
                    { key: "gothic", label: "Gothic" },
                    { key: "adventure", label: "Adventure" },
                    { key: "social_drama", label: "Social Drama" },
                    { key: "literary", label: "Literary" },
                    { key: "domestic", label: "Domestic" },
                    { key: "speculative", label: "Speculative" }
                  ]}
                />
                <MultiChipSelect
                  label="Point of View"
                  vocabKey="story_pov"
                  values={form.globalMetadata.pov ?? []}
                  onChange={v => setForm(current => ({ ...current, globalMetadata: { ...current.globalMetadata, pov: v } }))}
                  options={[
                    { key: "first_person", label: "First Person" },
                    { key: "close_third", label: "Close Third" },
                    { key: "limited_third", label: "Limited Third" },
                    { key: "omniscient", label: "Omniscient" },
                    { key: "epistolary", label: "Epistolary" },
                    { key: "multiple", label: "Multiple Viewpoint" },
                    { key: "objective", label: "Objective" }
                  ]}
                />
                <SingleSelect
                  label="Tense"
                  vocabKey="story_tense"
                  value={form.globalMetadata.tense ?? ""}
                  onChange={v => setForm(current => ({ ...current, globalMetadata: { ...current.globalMetadata, tense: v } }))}
                  options={[
                    { key: "past", label: "Past" },
                    { key: "present", label: "Present" },
                    { key: "mixed", label: "Mixed or Framed" }
                  ]}
                />
                <SingleSelect
                  label="Arc Shape"
                  vocabKey="story_arc_shape"
                  value={form.globalMetadata.arcShape ?? ""}
                  onChange={v => setForm(current => ({ ...current, globalMetadata: { ...current.globalMetadata, arcShape: v } }))}
                  options={[
                    { key: "quest", label: "Quest" },
                    { key: "mystery", label: "Mystery" },
                    { key: "restoration", label: "Restoration" },
                    { key: "rise", label: "Rise" },
                    { key: "fall", label: "Fall" },
                    { key: "rebirth", label: "Rebirth" },
                    { key: "voyage", label: "Voyage and Return" },
                    { key: "tragedy", label: "Tragedy" },
                    { key: "comedy", label: "Comedy" },
                    { key: "relationship", label: "Relationship" },
                    { key: "ensemble", label: "Ensemble" }
                  ]}
                />
                <MultiChipSelect
                  label="Primary Stakes"
                  vocabKey="story_stakes"
                  values={form.globalMetadata.stakes ?? []}
                  onChange={v => setForm(current => ({ ...current, globalMetadata: { ...current.globalMetadata, stakes: v } }))}
                  options={[
                    { key: "emotional", label: "Emotional" },
                    { key: "relational", label: "Relational" },
                    { key: "financial", label: "Financial" },
                    { key: "reputational", label: "Reputational" },
                    { key: "physical", label: "Physical" },
                    { key: "legal", label: "Legal" },
                    { key: "social", label: "Social" },
                    { key: "moral", label: "Moral" },
                    { key: "community", label: "Community" },
                    { key: "legacy", label: "Legacy" },
                    { key: "existential", label: "Existential" }
                  ]}
                />
                <SingleSelect
                  label="Ending Type"
                  vocabKey="story_ending"
                  value={form.globalMetadata.endingType ?? ""}
                  onChange={v => setForm(current => ({ ...current, globalMetadata: { ...current.globalMetadata, endingType: v } }))}
                  options={[
                    { key: "resolved", label: "Resolved" },
                    { key: "bittersweet", label: "Bittersweet" },
                    { key: "open", label: "Open" },
                    { key: "tragic", label: "Tragic" },
                    { key: "hopeful", label: "Hopeful" },
                    { key: "circular", label: "Circular" },
                    { key: "cliffhanger", label: "Cliffhanger" }
                  ]}
                />
              </div>
            </section>

            <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
              <h2 className="text-sm font-semibold mb-6" style={{ color: INK }}>Core Narrative Elements</h2>
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: INK }}>Premise (Logline)</label>
                  <textarea
                    value={form.globalMetadata.premise || ""}
                    onChange={e => setForm(c => ({ ...c, globalMetadata: { ...c.globalMetadata, premise: e.target.value } }))}
                    className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:border-[#C87560]"
                    style={{ borderColor: BORDER }}
                    rows={2}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: INK }}>Narrative Promise</label>
                  <textarea
                    value={form.globalMetadata.narrativePromise || ""}
                    onChange={e => setForm(c => ({ ...c, globalMetadata: { ...c.globalMetadata, narrativePromise: e.target.value } }))}
                    className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:border-[#C87560]"
                    style={{ borderColor: BORDER }}
                    rows={2}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: INK }}>Thematic Question</label>
                  <textarea
                    value={form.globalMetadata.thematicQuestion || ""}
                    onChange={e => setForm(c => ({ ...c, globalMetadata: { ...c.globalMetadata, thematicQuestion: e.target.value } }))}
                    className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:border-[#C87560]"
                    style={{ borderColor: BORDER }}
                    rows={2}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: INK }}>Central Conflict</label>
                  <textarea
                    value={form.globalMetadata.centralConflict || ""}
                    onChange={e => setForm(c => ({ ...c, globalMetadata: { ...c.globalMetadata, centralConflict: e.target.value } }))}
                    className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:border-[#C87560]"
                    style={{ borderColor: BORDER }}
                    rows={2}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: INK }}>Ending Vision</label>
                  <textarea
                    value={form.globalMetadata.endingVision || ""}
                    onChange={e => setForm(c => ({ ...c, globalMetadata: { ...c.globalMetadata, endingVision: e.target.value } }))}
                    className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:border-[#C87560]"
                    style={{ borderColor: BORDER }}
                    rows={2}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold" style={{ color: INK }}>Reader Experience</label>
                  <textarea
                    value={form.globalMetadata.readerExperience || ""}
                    onChange={e => setForm(c => ({ ...c, globalMetadata: { ...c.globalMetadata, readerExperience: e.target.value } }))}
                    className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:border-[#C87560]"
                    style={{ borderColor: BORDER }}
                    rows={2}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
              <h2 className="text-sm font-semibold mb-2" style={{ color: INK }}>Story Spine</h2>
              <p className="text-xs text-gray-500 mb-6">Represent the story spine as ordered structured beats.</p>

              <StructuredRepeater
                items={form.storySpine ?? []}
                onChange={v => setForm(current => ({ ...current, storySpine: v }))}
                defaultNewItem={() => ({ beatType: "setup", title: "", summary: "" })}
                addButtonLabel="Add Story Beat"
                renderItem={(item, idx, update, remove) => (
                  <div className="flex flex-col gap-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SingleSelect
                        label="Beat Type"
                        value={item.beatType}
                        onChange={v => update({ beatType: v })}
                        options={[
                          { key: "setup", label: "Setup" },
                          { key: "inciting_incident", label: "Inciting Incident" },
                          { key: "first_commitment", label: "First Commitment" },
                          { key: "rising_pressure", label: "Rising Pressure" },
                          { key: "midpoint", label: "Midpoint" },
                          { key: "reversal", label: "Reversal" },
                          { key: "crisis", label: "Crisis" },
                          { key: "climax", label: "Climax" },
                          { key: "resolution", label: "Resolution" },
                          { key: "epilogue", label: "Epilogue" },
                          { key: "custom", label: "Custom" }
                        ]}
                        allowCustom
                      />
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Beat Title</label>
                        <input
                          value={item.title || ""}
                          onChange={e => update({ title: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold" style={{ color: INK }}>Summary</label>
                      <textarea
                        value={item.summary || ""}
                        onChange={e => update({ summary: e.target.value })}
                        className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                        style={{ borderColor: BORDER }}
                        rows={2}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {worldId && (
                        <CanonPicker
                          worldId={worldId}
                          value={item.povCharacter || ""}
                          onChange={v => update({ povCharacter: v })}
                          label="POV Character"
                          canonType="character"
                        />
                      )}
                      {worldId && (
                        <CanonPicker
                          worldId={worldId}
                          value={item.location || ""}
                          onChange={v => update({ location: v })}
                          label="Location"
                          canonType="location"
                        />
                      )}
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Summary</label>
                        <textarea
                          value={item.summary || ""}
                          onChange={e => update({ summary: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                          rows={2}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Goal</label>
                        <input
                          value={item.goal || ""}
                          onChange={e => update({ goal: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Obstacle</label>
                        <input
                          value={item.obstacle || ""}
                          onChange={e => update({ obstacle: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Choice</label>
                        <input
                          value={item.choice || ""}
                          onChange={e => update({ choice: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Outcome</label>
                        <input
                          value={item.outcome || ""}
                          onChange={e => update({ outcome: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Cost</label>
                        <input
                          value={item.cost || ""}
                          onChange={e => update({ cost: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Knowledge Change</label>
                        <input
                          value={item.knowledge || ""}
                          onChange={e => update({ knowledge: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Relationship Change</label>
                        <input
                          value={item.relationshipChange || ""}
                          onChange={e => update({ relationshipChange: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Emotional Movement</label>
                        <input
                          value={item.emotionalMovement || ""}
                          onChange={e => update({ emotionalMovement: e.target.value })}
                          placeholder="- to +"
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Setup / Payoff Links</label>
                        <input
                          value={item.setupPayoffLinks || ""}
                          onChange={e => update({ setupPayoffLinks: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Involved Characters (IDs)</label>
                        <input
                          value={item.involvedCharacters ? item.involvedCharacters.join(',') : ""}
                          onChange={e => update({ involvedCharacters: e.target.value.split(',').map(s => s.trim()) })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none"
                          style={{ borderColor: BORDER }}
                        />
                      </div>

                      <SingleSelect
                        label="Spoiler Level"
                        value={item.spoilerLevel}
                        onChange={v => update({ spoilerLevel: v })}
                        options={[
                          { key: "none", label: "None" },
                          { key: "mild", label: "Mild" },
                          { key: "major", label: "Major" },
                          { key: "ruins_plot", label: "Ruins Plot" }
                        ]}
                      />
                      <SingleSelect
                        label="Status"
                        value={item.status}
                        onChange={v => update({ status: v })}
                        options={[
                          { key: "draft", label: "Draft" },
                          { key: "locked", label: "Locked" },
                          { key: "cut", label: "Cut" }
                        ]}
                      />
                    </div>
                  </div>
                )}
              />
            </section>

            <section className="rounded-2xl border p-7" style={{ background: "white", borderColor: BORDER }}>
              <h2 className="text-sm font-semibold mb-2" style={{ color: INK }}>Reveal Architecture</h2>
              <p className="text-xs text-gray-500 mb-6">Track secrets, mysteries, and delayed information.</p>

              <StructuredRepeater
                items={form.revealArchitecture ?? []}
                onChange={v => setForm(current => ({ ...current, revealArchitecture: v }))}
                defaultNewItem={() => ({ truth: "", audienceState: "withheld", firstClue: "" })}
                addButtonLabel="Add Reveal Track"
                renderItem={(item, idx, update, remove) => (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-semibold" style={{ color: INK }}>The Secret / Truth</label>
                      <input
                        value={item.truth || ""}
                        onChange={e => update({ truth: e.target.value })}
                        className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                        style={{ borderColor: BORDER }}
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SingleSelect
                        label="Audience Knowledge State"
                        value={item.audienceState}
                        onChange={v => update({ audienceState: v })}
                        options={[
                          { key: "withheld", label: "Withheld from Audience" },
                          { key: "hinted", label: "Hinted" },
                          { key: "partially_revealed", label: "Partially Revealed" },
                          { key: "known_to_audience", label: "Known to Audience, Hidden from Characters" },
                          { key: "fully_revealed", label: "Fully Revealed" }
                        ]}
                      />
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>First Clue</label>
                        <input
                          value={item.firstClue || ""}
                          onChange={e => update({ firstClue: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Who Knows? (Character IDs)</label>
                        <input
                          value={item.whoKnowsRecordIds ? (Array.isArray(item.whoKnowsRecordIds) ? item.whoKnowsRecordIds.join(',') : item.whoKnowsRecordIds) : ""}
                          onChange={e => update({ whoKnowsRecordIds: e.target.value.split(',').map(s => s.trim()) })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>False Beliefs (Character IDs)</label>
                        <input
                          value={item.falseBeliefRecordIds ? (Array.isArray(item.falseBeliefRecordIds) ? item.falseBeliefRecordIds.join(',') : item.falseBeliefRecordIds) : ""}
                          onChange={e => update({ falseBeliefRecordIds: e.target.value.split(',').map(s => s.trim()) })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Reinforcing Clues</label>
                        <input
                          value={item.reinforcingClues || ""}
                          onChange={e => update({ reinforcingClues: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Red Herrings</label>
                        <input
                          value={item.redHerrings || ""}
                          onChange={e => update({ redHerrings: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Partial Reveal Details</label>
                        <input
                          value={item.partialReveal || ""}
                          onChange={e => update({ partialReveal: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Full Reveal Details</label>
                        <input
                          value={item.fullReveal || ""}
                          onChange={e => update({ fullReveal: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Recontextualization</label>
                        <input
                          value={item.recontextualization || ""}
                          onChange={e => update({ recontextualization: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Consequences</label>
                        <input
                          value={item.consequences || ""}
                          onChange={e => update({ consequences: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Linked Scene IDs</label>
                        <input
                          value={item.linkedSceneIds || ""}
                          onChange={e => update({ linkedSceneIds: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold" style={{ color: INK }}>Linked Record IDs</label>
                        <input
                          value={item.linkedRecordIds || ""}
                          onChange={e => update({ linkedRecordIds: e.target.value })}
                          className="px-3 py-2 text-sm bg-white border rounded-lg outline-none focus:ring-2 focus:ring-[#C87560]/20"
                          style={{ borderColor: BORDER }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              />
            </section>

            {!isNew && story && (
              <NarrativeImageGallery
                worldId={story.worldId}
                storyId={story.id}
                targetType="story"
                targetId={story.id}
                title="Storyline images"
              />
            )}

            {!isNew && story && (
              <section id="story-scenes" className="scroll-mt-4 rounded-2xl border p-6" style={{ background: "white", borderColor: BORDER }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#98A2B3" }}>Scenes by act</p>
                    <p className="mt-1 text-sm" style={{ color: "#667085" }}>Open a scene below to edit its purpose, participants, setting, continuity, and image.</p>
                  </div>
                  <Link href={`/super/worldsmith/editorial/connections?story_id=${encodeURIComponent(story.id)}`}>
                    <span className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold" style={{ color: CLAY }}>
                      View story map <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </div>
                <div className="mt-6 flex flex-col gap-6">
                  {story.acts.map(act => {
                    const actScenes = scenes.filter(s => s.actId === act.id).sort((a, b) => a.sceneNumber - b.sceneNumber);
                    return (
                      <div key={act.id} className="rounded-xl" style={{ background: "var(--admin-card-subtle)", border: "1px solid var(--admin-border)" }}>
                        <div className="flex items-start justify-between gap-3 p-5 border-b" style={{ borderColor: BORDER }}>
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.13em]" style={{ color: CLAY }}>Movement {act.actNumber}</p>
                             <label className="mt-2 block">
                               <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#786D60" }}>
                                 Movement name
                               </span>
                               <div className="mt-1 flex items-center gap-2">
                                 <input
                                   value={actTitleDrafts[act.id] ?? act.title}
                                   onChange={event => setActTitleDrafts(current => ({
                                     ...current,
                                     [act.id]: event.target.value,
                                   }))}
                                   onKeyDown={event => {
                                     if (event.key === "Enter") {
                                       event.preventDefault();
                                       saveActTitleMutation.mutate({
                                         actId: act.id,
                                         title: actTitleDrafts[act.id] ?? act.title,
                                       });
                                     }
                                   }}
                                   className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#C87560]"
                                   style={{ color: INK, borderColor: BORDER }}
                                 />
                                 <button
                                   type="button"
                                   onClick={() => saveActTitleMutation.mutate({
                                     actId: act.id,
                                     title: actTitleDrafts[act.id] ?? act.title,
                                   })}
                                   disabled={
                                     saveActTitleMutation.isPending
                                     || !(actTitleDrafts[act.id] ?? act.title).trim()
                                     || (actTitleDrafts[act.id] ?? act.title).trim() === act.title
                                   }
                                   className="shrink-0 text-[11px] font-semibold disabled:opacity-40"
                                   style={{ color: CLAY }}
                                 >
                                   {saveActTitleMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save name"}
                                 </button>
                               </div>
                             </label>
                            {act.tagline && <p className="mt-1 text-xs italic" style={{ color: "#667085" }}>{act.tagline}</p>}
                             <label className="mt-3 block">
                               <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#786D60" }}>
                                 Movement / Act purpose
                               </span>
                               <textarea
                                 value={actPurposeDrafts[act.id] ?? act.narrative ?? ""}
                                 onChange={event => setActPurposeDrafts(current => ({
                                   ...current,
                                   [act.id]: event.target.value,
                                 }))}
                                 rows={2}
                                 placeholder="Describe what this movement must accomplish in the storyline."
                                 className="mt-1 w-full resize-y rounded-lg border bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-[#C87560]"
                                 style={{ color: INK, borderColor: BORDER }}
                               />
                               <button
                                 type="button"
                                 onClick={() => saveActPurposeMutation.mutate({
                                   actId: act.id,
                                   purpose: actPurposeDrafts[act.id] ?? act.narrative ?? "",
                                 })}
                                 disabled={
                                   saveActPurposeMutation.isPending
                                   || (actPurposeDrafts[act.id] ?? act.narrative ?? "") === (act.narrative ?? "")
                                 }
                                 className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold disabled:opacity-40"
                                 style={{ color: CLAY }}
                               >
                                 {saveActPurposeMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                                 Save purpose
                               </button>
                             </label>
                          </div>
                          <Link href={`/super/worldsmith/editorial/connections?story_id=${encodeURIComponent(story.id)}&act_id=${encodeURIComponent(act.id)}`}>
                            <span className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-semibold hover:underline" style={{ color: INK }}>
                              Link canon <ChevronRight className="h-3 w-3" />
                            </span>
                          </Link>
                        </div>

                        <div className="p-4 bg-white/50 rounded-b-xl flex flex-col gap-2">
                          <NarrativeImageGallery
                            worldId={story.worldId}
                            storyId={story.id}
                            targetType="act"
                            targetId={act.id}
                            title={`Movement ${act.actNumber} images`}
                            compact
                          />
                          {actScenes.map(scene => (
                            <div
                              key={scene.id}
                              className="group flex items-center justify-between rounded-lg border bg-white p-3 shadow-sm hover:border-[#C87560] hover:shadow transition-all cursor-pointer"
                              style={{ borderColor: "#E5E7EB" }}
                              onClick={() => setEditingScene({ actId: act.id, sceneId: scene.id })}
                              data-testid={`card-scene-${scene.id}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-50 text-xs font-semibold text-gray-500 shrink-0">
                                  {scene.sceneNumber}
                                </div>
                                <div className="min-w-0 flex flex-col">
                                  <span className="text-sm font-semibold truncate" style={{ color: INK }}>
                                    {scene.title || "Untitled Scene"}
                                  </span>
                                  <span className="text-[11px] text-gray-500 truncate">
                                    {scene.canonRecords?.length || 0} canon connections
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center rounded-md border bg-white" style={{ borderColor: BORDER }}>
                                  <button
                                    type="button"
                                    aria-label={`Move ${scene.title} up`}
                                    title="Move scene up"
                                    disabled={moveSceneMutation.isPending || scene.sceneNumber <= 1}
                                    onClick={event => {
                                      event.stopPropagation();
                                      moveSceneMutation.mutate({
                                        sceneId: scene.id,
                                        actId: act.id,
                                        sceneNumber: scene.sceneNumber - 1,
                                      });
                                    }}
                                    className="p-1.5 text-gray-500 hover:text-gray-900 disabled:opacity-30"
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Move ${scene.title} down`}
                                    title="Move scene down"
                                    disabled={moveSceneMutation.isPending || scene.sceneNumber >= actScenes.length}
                                    onClick={event => {
                                      event.stopPropagation();
                                      moveSceneMutation.mutate({
                                        sceneId: scene.id,
                                        actId: act.id,
                                        sceneNumber: scene.sceneNumber + 1,
                                      });
                                    }}
                                    className="p-1.5 text-gray-500 hover:text-gray-900 disabled:opacity-30"
                                  >
                                    <ArrowDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <select
                                  aria-label={`Move ${scene.title} to movement`}
                                  value={scene.actId}
                                  disabled={moveSceneMutation.isPending}
                                  onClick={event => event.stopPropagation()}
                                  onChange={event => {
                                    event.stopPropagation();
                                    const destinationActId = event.target.value;
                                    const destinationCount = scenes.filter(item => item.actId === destinationActId).length;
                                    moveSceneMutation.mutate({
                                      sceneId: scene.id,
                                      actId: destinationActId,
                                      sceneNumber: destinationCount + 1,
                                    });
                                  }}
                                  className="max-w-40 rounded-md border bg-white px-2 py-1.5 text-[11px] outline-none"
                                  style={{ color: INK, borderColor: BORDER }}
                                >
                                  {story.acts.map(movement => (
                                    <option key={movement.id} value={movement.id}>
                                      Movement {movement.actNumber}
                                    </option>
                                  ))}
                                </select>
                                {scene.primaryImageUrl && (
                                  <ImageIcon className="h-4 w-4 text-indigo-400" />
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("Delete this scene?")) {
                                      deleteSceneMutation.mutate(scene.id);
                                    }
                                  }}
                                  disabled={deleteSceneMutation.isPending}
                                  className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Delete Scene"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}

                          <button
                            type="button"
                            onClick={() => setEditingScene({ actId: act.id })}
                            className="mt-1 flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm font-semibold text-gray-500 hover:bg-white hover:text-gray-900 transition-colors"
                            style={{ borderColor: "#D1D5DB" }}
                            data-testid={`button-add-scene-${act.id}`}
                          >
                            <Plus className="h-4 w-4" />
                            Add Scene
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-xl p-5" style={{ border: "1px dashed #C9BFB2" }}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.13em]" style={{ color: "#98A2B3" }}>Add a movement</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={newActTitle}
                        onChange={event => setNewActTitle(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === "Enter" && newActTitle.trim()) {
                            event.preventDefault();
                            createActMutation.mutate();
                          }
                        }}
                        placeholder={`Movement ${(story.acts.length ?? 0) + 1} title (optional)`}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        style={{ color: INK }}
                      />
                      <button
                        type="button"
                        onClick={() => createActMutation.mutate()}
                        disabled={createActMutation.isPending}
                        className="inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
                        style={{ color: CLAY }}
                      >
                        {createActMutation.isPending
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Plus className="h-3.5 w-3.5" />}
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            {!isNew && story && <ContextSnapshotStatus entityType="stories" entityId={story.id} />}
            <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: INK }}>Prompt Preview</h2>
                {isFetchingFieldContext && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
              </div>
              {!fieldContext ? (
                <p className="text-xs text-gray-400">Save the storyline to preview prompt generation context.</p>
              ) : (
                <div className="space-y-4">
                  {fieldWarnings.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 space-y-1">
                      <h3 className="text-[10px] font-bold uppercase tracking-wide text-yellow-800">Warnings</h3>
                      <ul className="list-disc pl-4 text-[11px] text-yellow-900 space-y-0.5">
                        {fieldWarnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#786D60" }}>Generated Prompt</h3>
                    <div className="bg-gray-50 border rounded-lg p-3 text-xs leading-relaxed" style={{ borderColor: BORDER, color: INK }}>
                      {fieldPrompt || "No positive prompt content."}
                    </div>
                  </div>
                  {fieldNegative.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#786D60" }}>Negative Prompt</h3>
                      <div className="bg-red-50 border rounded-lg p-3 text-xs leading-relaxed" style={{ borderColor: "#F4C7C2", color: "#B42318" }}>
                        {fieldNegative.join(", ")}
                      </div>
                    </div>
                  )}
                  {fieldAttributions.length > 0 && (
                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "#786D60" }}>Source Attribution</h3>
                      <ul className="space-y-1.5">
                        {fieldAttributions.map((attr: any, i: number) => (
                          <li key={i} className="text-[10px] leading-tight">
                            <span className="font-semibold" style={{ color: INK }}>{attr.clause}</span>
                            <span className="mx-1 text-gray-400">←</span>
                            <span style={{ color: "#667085" }}>{attr.source}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border p-5" style={{ background: "white", borderColor: BORDER }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#98A2B3" }}>Storyline record</p>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#667085" }}>
                Storylines remain editable drafts. Their narrative promise is safely stored as rich text and reduced to plain text for AI and production context.
              </p>
            </section>
            <button
              type="submit"
              disabled={!form.title.trim() || saveMutation.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-45"
              style={{ background: INK, color: "white" }}
              data-testid="button-save-storyline"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              {isNew ? "Create storyline" : "Save storyline"}
            </button>
            <button type="button" onClick={() => navigate("/super/worldsmith/editorial/stories")} className="w-full py-1.5 text-xs font-semibold" style={{ color: CLAY }}>
              Cancel
            </button>
          </aside>
        </form>
      </div>
    </div>
  );
}
