import { useEffect, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowRight, BookOpen, ChevronRight, Loader2, Plus, RotateCcw, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEditorial } from "@/contexts/EditorialContext";
import { EditorialRichTextField } from "@/components/EditorialRichText";
import { NarrativeImageGallery } from "@/components/worldsmith/editorial/NarrativeImageGallery";
import { StorySequenceBoard } from "@/components/worldsmith/editorial/StorySequenceBoard";

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
  title: string;
  summary: string;
  status: string;
  sortOrder?: number;
  sequenceRole?: "chronological" | "reference";
  acts: StoryAct[];
}

const STORY_STATUSES = ["draft", "planned", "active", "archived"] as const;
type StoryStatusValue = typeof STORY_STATUSES[number];

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  active: { background: "#E4F2EA", color: "#286047" },
  draft: { background: "#EFE9E1", color: "#786D60" },
  planned: { background: "#EAE8F4", color: "#5F558B" },
  archived: { background: "#F1F1F1", color: "#737373" },
};

function StoryStatus({ status }: { status: string }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
      style={STATUS_STYLES[status] ?? STATUS_STYLES.draft}
    >
      {status}
    </span>
  );
}

export default function StoriesStudio() {
  const { selectedWorld, selectedWorldId } = useEditorial();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const isSequenceDeepLink = searchParams.get("view") === "sequence"
    && !!searchParams.get("sequence_id");
  const requestedStoryId = isSequenceDeepLink ? searchParams.get("story_id") : null;
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [storyFilter, setStoryFilter] = useState<"current" | "archived">("current");
  const [summaryDraft, setSummaryDraft] = useState<Record<string, string>>({});
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({});
  const [actTitleDraft, setActTitleDraft] = useState<Record<string, string>>({});
  const [actPurposeDraft, setActPurposeDraft] = useState<Record<string, string>>({});
  const [newActTitle, setNewActTitle] = useState("");
  const [viewMode, setViewMode] = useState<"editor" | "sequence">(() =>
    searchParams.get("view") === "sequence" ? "sequence" : "editor"
  );

  useEffect(() => {
    if (searchParams.get("view") === "sequence") setViewMode("sequence");
    else if (searchParams.get("view") === "editor") setViewMode("editor");
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["ws-stories", selectedWorldId],
    queryFn: () => apiFetch<{ stories: Story[]; sequenceRevision: number }>(`/v1/editorial/stories?world_id=${encodeURIComponent(selectedWorldId!)}`),
    enabled: !!selectedWorldId,
    staleTime: 30_000,
  });
  const stories = data?.stories ?? [];
  const currentStories = stories.filter(story => story.status !== "archived");
  const archivedStories = stories.filter(story => story.status === "archived");
  const visibleStories = storyFilter === "current" ? currentStories : archivedStories;

  useEffect(() => {
    if (visibleStories.length > 0 && !visibleStories.some(story => story.id === selectedStoryId)) {
      setSelectedStoryId(visibleStories[0]!.id);
    }
  }, [visibleStories, selectedStoryId]);

  const selectedStory = visibleStories.find(story => story.id === selectedStoryId) ?? visibleStories[0] ?? null;
  const refreshStories = () => queryClient.invalidateQueries({ queryKey: ["ws-stories", selectedWorldId] });

  const changeStoryStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: StoryStatusValue }) =>
      apiFetch(`/v1/editorial/stories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_result, { id, status }) => {
      queryClient.setQueryData<{ stories: Story[]; sequenceRevision: number }>(
        ["ws-stories", selectedWorldId],
        current => current && {
          ...current,
          stories: current.stories.map(story => story.id === id ? { ...story, status } : story),
        },
      );
      queryClient.setQueryData<{ story: Story }>(["editorial-story", id],
        current => current && { story: { ...current.story, status } });
      void refreshStories();
      void queryClient.invalidateQueries({ queryKey: ["ws-story-connections", selectedWorldId] });
      toast({ title: status === "archived" ? "Storyline archived" : "Storyline status updated" });
    },
    onError: (error: Error) => toast({
      title: "Could not change storyline status",
      description: error.message,
      variant: "destructive",
    }),
  });

  const setStatus = (story: Story, status: StoryStatusValue) => {
    if (status === story.status || changeStoryStatus.isPending) return;
    if (status === "archived" && !window.confirm(
      `Archive "${story.title}"? It will leave the current storyline list, but its content and links will be kept. You can restore it later.`,
    )) return;
    changeStoryStatus.mutate({ id: story.id, status });
  };

  const createAct = useMutation({
    mutationFn: () =>
      apiFetch(`/v1/editorial/stories/${selectedStory!.id}/acts`, {
        method: "POST",
        body: JSON.stringify({
          world_id: selectedWorldId,
          title: newActTitle.trim(),
          act_number: (selectedStory?.acts.length ?? 0) + 1,
        }),
      }),
    onSuccess: () => {
      setNewActTitle("");
      refreshStories();
    },
    onError: () => toast({ title: "Could not add chapter", variant: "destructive" }),
  });

  const updateAct = useMutation({
    mutationFn: ({ actId, title, narrative }: { actId: string; title: string; narrative: string }) => {
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("A movement name is required");
      return apiFetch<{ act: StoryAct }>(`/v1/editorial/acts/${actId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: trimmedTitle, narrative }),
      });
    },
    onSuccess: ({ act }) => {
      setActTitleDraft(current => ({ ...current, [act.id]: act.title }));
      setActPurposeDraft(current => ({ ...current, [act.id]: act.narrative ?? "" }));
      queryClient.setQueryData<{ stories: Story[] }>(["ws-stories", selectedWorldId], current => {
        if (!current) return current;
        return {
          stories: current.stories.map(story => story.id === act.storyId
            ? { ...story, acts: story.acts.map(item => item.id === act.id ? { ...item, ...act } : item) }
            : story),
        };
      });
      queryClient.invalidateQueries({ queryKey: ["editorial-story", act.storyId] });
      queryClient.invalidateQueries({ queryKey: ["ws-story-connections", selectedWorldId] });
      toast({ title: "Movement saved" });
    },
    onError: (error: Error) => toast({
      title: "Could not save movement",
      description: error.message,
      variant: "destructive",
    }),
  });

  const saveStoryField = (story: Story, field: "title" | "summary") => {
    const draft = field === "title" ? titleDraft[story.id] : summaryDraft[story.id];
    if (draft === undefined || draft === story[field]) return;
    apiFetch(`/v1/editorial/stories/${story.id}`, {
      method: "PATCH",
      body: JSON.stringify({ [field]: field === "title" ? draft.trim() : draft }),
    })
      .then(refreshStories)
      .catch(() => toast({ title: `Could not save story ${field}`, variant: "destructive" }));
  };

  if (!selectedWorldId || !selectedWorld) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: "#7D8797" }}>
        Choose a world to begin shaping its stories.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--admin-card-subtle)" }}>
      <div className="w-full px-7 py-7">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-7">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: "#C87560" }}>
              Editorial Studio · {selectedWorld.name}
            </p>
            <h1 className="mt-1 text-3xl leading-tight" style={{ color: "#1B2A4A", fontFamily: "'Playfair Display', Georgia, serif" }}>
              Storylines
            </h1>
            <p className="mt-2 text-sm max-w-xl" style={{ color: "#667085" }}>
              Shape the adventures that give your characters, places, and future physical pieces a reason to exist.
            </p>
          </div>
          <button
            onClick={() => navigate("/super/worldsmith/editorial/stories/new")}
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors"
            style={{ background: "#1B2A4A", color: "white" }}
          >
            <Plus className="w-4 h-4" />
            New storyline
          </button>
        </header>

        <div
          className="rounded-xl px-4 py-3 mb-6 flex gap-3 items-start"
          style={{ background: "#F0E9DF", border: "1px solid #DDD4C4" }}
        >
          <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#C87560" }} />
          <p className="text-[12.5px] leading-relaxed" style={{ color: "#4A5565" }}>
            Your <strong style={{ color: "#1B2A4A" }}>Co-write partner</strong> stays with you throughout Editorial Studio.
            Use it to test an adventure premise, connect a story to canon, or find the physical keepsake a moment could become.
          </p>
        </div>

        <Link href="/super/worldsmith/editorial/discoveries" className="mb-6 flex items-center gap-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-subtle)] px-4 py-3">
          <Sparkles className="h-4 w-4 shrink-0 text-[var(--admin-clay)]" />
          <span className="text-xs text-[var(--admin-muted)]"><strong className="text-[var(--admin-ink)]">Ideas are generated and reviewed in Discovery Review.</strong> Open the queue to review Canon and storyline candidates.</span>
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-[var(--admin-clay)]" />
        </Link>

        {isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C87560" }} /></div>
        ) : stories.length === 0 ? (
          <section className="rounded-2xl px-8 py-14 text-center" style={{ background: "white", border: "1px dashed #C9BFB2" }}>
            <BookOpen className="w-9 h-9 mx-auto mb-3" style={{ color: "#C87560" }} />
            <h2 className="text-lg font-semibold" style={{ color: "#1B2A4A" }}>Give this world its first adventure</h2>
            <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: "#667085" }}>
              A storyline turns your growing canon into a path of discoveries, choices, and objects that can travel into a journal or a printed collection.
            </p>
            <button onClick={() => navigate("/super/worldsmith/editorial/stories/new")} className="mt-5 text-sm font-semibold" style={{ color: "#C87560" }}>
              Start a storyline →
            </button>
          </section>
        ) : (
          <div>
            <div className="mb-5 flex items-center gap-1 rounded-xl border border-[var(--admin-border)] bg-white p-1 w-fit" aria-label="Storylines view">
              <button
                type="button"
                data-testid="button-storylines-editor-view"
                aria-pressed={viewMode === "editor"}
                onClick={() => setViewMode("editor")}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${viewMode === "editor" ? "bg-[var(--admin-ink)] text-white" : "text-[var(--admin-muted)] hover:bg-[var(--admin-card-subtle)]"}`}
              >
                Edit storylines
              </button>
              <button
                type="button"
                data-testid="button-storylines-sequence-view"
                aria-pressed={viewMode === "sequence"}
                onClick={() => setViewMode("sequence")}
                className={`rounded-lg px-4 py-2 text-xs font-semibold ${viewMode === "sequence" ? "bg-[var(--admin-ink)] text-white" : "text-[var(--admin-muted)] hover:bg-[var(--admin-card-subtle)]"}`}
              >
                Sequence board
              </button>
            </div>
            {viewMode === "sequence" ? (
              <>
                {isSequenceDeepLink && !requestedStoryId && (
                  <p
                    role="status"
                    data-testid="sequence-deeplink-unfocused"
                    className="mb-3 text-xs text-[var(--admin-muted)]"
                  >
                    This sequence link has no storyline anchor, so no chronology moment can be focused.
                  </p>
                )}
                {isSequenceDeepLink && requestedStoryId && data && !stories.some(story => story.id === requestedStoryId) && (
                  <p
                    role="status"
                    data-testid="sequence-deeplink-stale"
                    className="mb-3 text-xs text-[var(--admin-muted)]"
                  >
                    This sequence link is stale; its storyline is no longer in this world. Showing the current chronology.
                  </p>
                )}
                <StorySequenceBoard
                  worldId={selectedWorldId}
                  stories={stories.map(story => ({ ...story, sortOrder: story.sortOrder ?? 0, sequenceRole: story.sequenceRole ?? "chronological" }))}
                  revision={data?.sequenceRevision ?? 0}
                  selectedStoryId={isSequenceDeepLink ? requestedStoryId : null}
                  onOpen={id => navigate(`/super/worldsmith/editorial/stories/${id}?world_id=${encodeURIComponent(selectedWorldId)}`)}
                />
              </>
            ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filter storylines">
              <button type="button" onClick={() => setStoryFilter("current")} aria-pressed={storyFilter === "current"}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${storyFilter === "current" ? "bg-[var(--admin-ink)] text-white" : "border border-[var(--admin-border)] bg-white text-[var(--admin-muted)]"}`}>
                Current ({currentStories.length})
              </button>
              <button type="button" onClick={() => setStoryFilter("archived")} aria-pressed={storyFilter === "archived"}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${storyFilter === "archived" ? "bg-[var(--admin-ink)] text-white" : "border border-[var(--admin-border)] bg-white text-[var(--admin-muted)]"}`}>
                Archived ({archivedStories.length})
              </button>
            </div>
            {visibleStories.length === 0 ? (
              <div className="rounded-2xl border border-[var(--admin-border)] bg-white p-8 text-sm text-[var(--admin-muted)]">
                {storyFilter === "archived" ? "No archived storylines in this world." : "No current storylines. Open Archived to restore one or create a new storyline."}
              </div>
            ) : (
          <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-6 items-start">
            <aside className="rounded-2xl p-2.5" style={{ background: "white", border: "1px solid var(--admin-border)" }}>
              <p className="px-2.5 pt-1 pb-2 text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: "#98A2B3" }}>
                In this world
              </p>
              <div className="space-y-1">
                 {visibleStories.map(story => (
                  <button
                    key={story.id}
                    onClick={() => setSelectedStoryId(story.id)}
                    className="w-full text-left rounded-xl p-3 transition-colors"
                    style={story.id === selectedStory?.id
                      ? { background: "#1B2A4A", color: "white" }
                      : { background: "transparent", color: "#344054" }}
                  >
                    <div className="flex items-start gap-2">
                      <BookOpen className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: story.id === selectedStory?.id ? "#DCA28F" : "#C87560" }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-snug break-words">{story.title}</span>
                        <span className="mt-1 flex items-center justify-between">
                          <span className="text-[10.5px]" style={{ color: story.id === selectedStory?.id ? "rgba(255,255,255,.65)" : "#98A2B3" }}>
                            {story.acts.length} movement{story.acts.length === 1 ? "" : "s"}
                          </span>
                          <StoryStatus status={story.status} />
                        </span>
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            {selectedStory && (
              <section className="rounded-2xl p-6" style={{ background: "white", border: "1px solid var(--admin-border)" }}>
                <div className="flex flex-wrap gap-3 items-start justify-between mb-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <StoryStatus status={selectedStory.status} />
                      <span className="text-[11px]" style={{ color: "#98A2B3" }}>Storyline</span>
                    </div>
                    <input
                      aria-label="Story title"
                      value={titleDraft[selectedStory.id] ?? selectedStory.title}
                      onChange={event => setTitleDraft(draft => ({ ...draft, [selectedStory.id]: event.target.value }))}
                      onBlur={() => saveStoryField(selectedStory, "title")}
                      className="mt-2 w-full border-b bg-transparent pb-1 text-2xl outline-none focus:border-[#C87560]"
                      style={{ color: "#1B2A4A", borderColor: "var(--admin-border)", fontFamily: "'Playfair Display', Georgia, serif" }}
                    />
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3 pt-5">
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                      Stage
                      <select
                        aria-label={`Stage for ${selectedStory.title}`}
                        value={selectedStory.status}
                        disabled={changeStoryStatus.isPending}
                        onChange={event => setStatus(selectedStory, event.target.value as StoryStatusValue)}
                        className="rounded-lg border border-[var(--admin-border)] bg-white px-2 py-1.5 text-xs text-[var(--admin-ink)] disabled:opacity-50"
                      >
                        {STORY_STATUSES.map(status => <option key={status} value={status}>{status[0]!.toUpperCase() + status.slice(1)}</option>)}
                      </select>
                    </label>
                    <button type="button" disabled={changeStoryStatus.isPending}
                      onClick={() => setStatus(selectedStory, selectedStory.status === "archived" ? "draft" : "archived")}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-ink)] disabled:opacity-50">
                      {selectedStory.status === "archived" ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                      {selectedStory.status === "archived" ? "Restore to draft" : "Archive storyline"}
                    </button>
                    <Link href={`/super/worldsmith/editorial/connections?story_id=${encodeURIComponent(selectedStory.id)}`}>
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: "#C87560" }}>
                        See its story map <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </Link>
                    <Link href={`/super/worldsmith/editorial/stories/${selectedStory.id}?world_id=${encodeURIComponent(selectedWorldId)}`}>
                      <span className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold" style={{ color: "#1B2A4A" }}>
                        Open story & scenes <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </Link>
                  </div>
                </div>
                <label className="block text-[10px] uppercase tracking-[0.14em] font-bold mb-2" style={{ color: "#98A2B3" }}>
                  The narrative promise
                </label>
                <EditorialRichTextField
                  value={summaryDraft[selectedStory.id] ?? selectedStory.summary ?? ""}
                  onChange={value => setSummaryDraft(draft => ({ ...draft, [selectedStory.id]: value }))}
                  onBlur={() => saveStoryField(selectedStory, "summary")}
                  minHeight={150}
                  placeholder="What is this story about? Who is changed by it, and what will a reader carry into the physical world?"
                />
                <div className="mt-6">
                  <NarrativeImageGallery
                    worldId={selectedWorldId}
                    storyId={selectedStory.id}
                    targetType="story"
                    targetId={selectedStory.id}
                    title="Storyline images"
                  />
                </div>

                <div className="mt-7 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: "#98A2B3" }}>Acts & scenes</p>
                    <p className="mt-1 text-xs" style={{ color: "#667085" }}>Open the story editor to add and edit scenes inside each act.</p>
                  </div>
                  <Link href={`/super/worldsmith/editorial/connections?story_id=${encodeURIComponent(selectedStory.id)}`}>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#1B2A4A" }}>
                      Link canon <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </div>
                <div className="mt-3 grid md:grid-cols-2 gap-3">
                  {selectedStory.acts.map(act => (
                    <div key={act.id} className="rounded-xl p-4" style={{ background: "var(--admin-card-subtle)", border: "1px solid var(--admin-border)" }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-[0.13em] font-bold" style={{ color: "#C87560" }}>Movement {act.actNumber}</p>
                          <label className="mt-2 block">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#786D60" }}>Movement name</span>
                            <input
                              aria-label={`Movement ${act.actNumber} name`}
                              value={actTitleDraft[act.id] ?? act.title}
                              onChange={event => setActTitleDraft(current => ({ ...current, [act.id]: event.target.value }))}
                              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#C87560]"
                              style={{ color: "#1B2A4A", borderColor: "var(--admin-border)" }}
                            />
                          </label>
                          {act.tagline && <p className="mt-1 text-xs italic" style={{ color: "#667085" }}>{act.tagline}</p>}
                          <label className="mt-3 block">
                            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#786D60" }}>Movement / Act purpose</span>
                            <textarea
                              aria-label={`Movement ${act.actNumber} purpose`}
                              value={actPurposeDraft[act.id] ?? act.narrative ?? ""}
                              onChange={event => setActPurposeDraft(current => ({ ...current, [act.id]: event.target.value }))}
                              rows={3}
                              placeholder="Describe what this movement must accomplish in the storyline."
                              className="mt-1 w-full resize-y rounded-lg border bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-[#C87560]"
                              style={{ color: "#1B2A4A", borderColor: "var(--admin-border)" }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => updateAct.mutate({
                              actId: act.id,
                              title: actTitleDraft[act.id] ?? act.title,
                              narrative: actPurposeDraft[act.id] ?? act.narrative ?? "",
                            })}
                            disabled={
                              updateAct.isPending
                              || !(actTitleDraft[act.id] ?? act.title).trim()
                              || (
                                (actTitleDraft[act.id] ?? act.title).trim() === act.title
                                && (actPurposeDraft[act.id] ?? act.narrative ?? "") === (act.narrative ?? "")
                              )
                            }
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold disabled:opacity-40"
                            style={{ color: "#C87560" }}
                          >
                            {updateAct.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                            Save movement
                          </button>
                        </div>
                        <Link href={`/super/worldsmith/editorial/connections?story_id=${encodeURIComponent(selectedStory.id)}&act_id=${encodeURIComponent(act.id)}`}>
                          <span className="inline-flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-semibold" style={{ color: "#1B2A4A" }}>
                            Link canon <ChevronRight className="h-3 w-3" />
                          </span>
                        </Link>
                      </div>
                      <div className="mt-4 border-t border-[var(--admin-border)] pt-4">
                        <NarrativeImageGallery
                          worldId={selectedWorldId}
                          storyId={selectedStory.id}
                          targetType="act"
                          targetId={act.id}
                          title={`Movement ${act.actNumber} images`}
                          compact
                        />
                      </div>
                    </div>
                  ))}
                  <div className="rounded-xl p-4" style={{ border: "1px dashed #C9BFB2" }}>
                    <p className="text-[10px] uppercase tracking-[0.13em] font-bold" style={{ color: "#98A2B3" }}>Add a movement</p>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={newActTitle}
                        onChange={event => setNewActTitle(event.target.value)}
                        onKeyDown={event => event.key === "Enter" && newActTitle.trim() && createAct.mutate()}
                        placeholder={`Act ${(selectedStory.acts.length ?? 0) + 1}`}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        style={{ color: "#1B2A4A" }}
                      />
                      <button
                        onClick={() => createAct.mutate()}
                        disabled={!newActTitle.trim() || createAct.isPending}
                        className="text-xs font-semibold disabled:opacity-30"
                        style={{ color: "#C87560" }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-7 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3" style={{ background: "#F0E9DF" }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "#1B2A4A" }}>From page to physical piece</p>
                    <p className="mt-1 text-xs max-w-lg" style={{ color: "#667085" }}>
                      Once a thread is clear, turn a clue, letter, map, or keepsake into a production piece for a reader to hold.
                    </p>
                  </div>
                  <Link href="/super/worldsmith/editorial/specs/new">
                    <span className="rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer" style={{ background: "#1B2A4A", color: "white" }}>
                      Plan a physical piece
                    </span>
                  </Link>
                </div>
              </section>
            )}
          </div>
            )}
          </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}