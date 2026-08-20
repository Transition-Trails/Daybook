import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, ChevronRight, Loader2, Plus, RotateCcw, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEditorial } from "@/contexts/EditorialContext";
import { EditorialRichTextField } from "@/components/EditorialRichText";

interface StoryAct {
  id: string;
  storyId: string;
  actNumber: number;
  title: string;
  tagline: string;
}

interface Story {
  id: string;
  title: string;
  summary: string;
  status: string;
  acts: StoryAct[];
}

interface StorySuggestion {
  title: string;
  rationale: string;
  narrativePromise: string;
  recommendedStatus: string;
}

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

function SuggestedStorylines({
  suggestions,
  loading,
  error,
  onRefresh,
  onCreate,
}: {
  suggestions: StorySuggestion[];
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
  onCreate: (suggestion: StorySuggestion) => void;
}) {
  return (
    <section
      className="mb-6 rounded-2xl p-5"
      style={{ background: "#FFFCF8", border: "1px solid #DDD4C4" }}
      aria-labelledby="storyline-suggestions-heading"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(200,117,96,0.12)" }}>
            <Sparkles className="h-4 w-4" style={{ color: "#C87560" }} />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#C87560" }}>World-aware suggestions</p>
            <h2 id="storyline-suggestions-heading" className="mt-0.5 text-base font-semibold" style={{ color: "#1B2A4A" }}>
              Suggested storylines
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed" style={{ color: "#667085" }}>
              These story opportunities draw on the World Bible, current canon, and the adventures already taking shape. Open one to refine it before saving.
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50"
          style={{ borderColor: "#D9C9BA", color: "#9D5B49" }}
        >
          <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh ideas
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: "#786D60" }}>
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#C87560" }} />
          Reading your world and canon…
        </div>
      ) : error ? (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FFF7ED", color: "#9A3412" }}>
          We couldn’t create story ideas just now. Refresh to try again.
        </div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-xl px-4 py-5 text-center text-sm" style={{ background: "#F7F3EE", color: "#786D60" }}>
          No new story ideas yet. Add more World Bible or canon detail, then refresh.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(245px, 1fr))" }}>
          {suggestions.map(suggestion => (
            <article
              key={suggestion.title}
              className="flex min-h-[224px] flex-col rounded-xl border p-4"
              style={{ background: "white", borderColor: "#E7DED4" }}
            >
              <div className="flex items-center justify-between gap-2">
                <StoryStatus status={suggestion.recommendedStatus} />
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#98A2B3" }}>Storyline</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold" style={{ color: "#1B2A4A" }}>{suggestion.title}</h3>
              <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed" style={{ color: "#667085" }}>{suggestion.rationale}</p>
              <p className="mt-2 line-clamp-3 text-[11.5px] italic leading-relaxed" style={{ color: "#8A7B6A" }}>{suggestion.narrativePromise}</p>
              <button
                onClick={() => onCreate(suggestion)}
                className="mt-auto inline-flex self-start pt-3 text-xs font-semibold hover:underline"
                style={{ color: "#C87560" }}
              >
                Create record <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function StoriesStudio() {
  const { selectedWorld, selectedWorldId } = useEditorial();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<Record<string, string>>({});
  const [titleDraft, setTitleDraft] = useState<Record<string, string>>({});
  const [newActTitle, setNewActTitle] = useState("");
  const [suggestions, setSuggestions] = useState<StorySuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suggestionsWorldId, setSuggestionsWorldId] = useState<string | null>(null);
  const suggestionsRequestRef = useRef(0);

  const { data, isLoading } = useQuery({
    queryKey: ["ws-stories", selectedWorldId],
    queryFn: () => apiFetch<{ stories: Story[] }>(`/v1/editorial/stories?world_id=${encodeURIComponent(selectedWorldId!)}`),
    enabled: !!selectedWorldId,
    staleTime: 30_000,
  });
  const stories = data?.stories ?? [];

  useEffect(() => {
    if (stories.length > 0 && !stories.some(story => story.id === selectedStoryId)) {
      setSelectedStoryId(stories[0]!.id);
    }
  }, [stories, selectedStoryId]);

  const selectedStory = stories.find(story => story.id === selectedStoryId) ?? null;
  const refreshStories = () => queryClient.invalidateQueries({ queryKey: ["ws-stories", selectedWorldId] });

  const generateSuggestions = useCallback(async () => {
    const requestWorldId = selectedWorldId;
    if (!requestWorldId) {
      suggestionsRequestRef.current += 1;
      setSuggestions([]);
      setSuggestionsWorldId(null);
      setSuggestionsLoading(false);
      return;
    }
    const requestId = ++suggestionsRequestRef.current;
    setSuggestions([]);
    setSuggestionsWorldId(null);
    setSuggestionsLoading(true);
    setSuggestionsError(false);
    try {
      const result = await apiFetch<{ suggestions: StorySuggestion[] }>("/v1/editorial/stories/suggest", {
        method: "POST",
        body: JSON.stringify({ world_id: requestWorldId }),
      });
      if (requestId !== suggestionsRequestRef.current) return;
      setSuggestions(result.suggestions ?? []);
      setSuggestionsWorldId(requestWorldId);
    } catch {
      if (requestId !== suggestionsRequestRef.current) return;
      setSuggestionsError(true);
      setSuggestions([]);
    } finally {
      if (requestId === suggestionsRequestRef.current) setSuggestionsLoading(false);
    }
  }, [selectedWorldId]);

  useEffect(() => {
    void generateSuggestions();
  }, [generateSuggestions]);

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
    <div className="h-full overflow-y-auto" style={{ background: "#FAF8F3" }}>
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

        <SuggestedStorylines
          suggestions={suggestionsWorldId === selectedWorldId ? suggestions : []}
          loading={suggestionsLoading}
          error={suggestionsError}
          onRefresh={() => { void generateSuggestions(); }}
          onCreate={suggestion => navigate(
            `/super/worldsmith/editorial/stories/new?title=${encodeURIComponent(suggestion.title)}&summary=${encodeURIComponent(suggestion.narrativePromise)}&status=${encodeURIComponent(suggestion.recommendedStatus)}`,
          )}
        />

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
          <div className="grid lg:grid-cols-[250px_minmax(0,1fr)] gap-6 items-start">
            <aside className="rounded-2xl p-2.5" style={{ background: "white", border: "1px solid #E7E0D7" }}>
              <p className="px-2.5 pt-1 pb-2 text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: "#98A2B3" }}>
                In this world
              </p>
              <div className="space-y-1">
                {stories.map(story => (
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
                        <span className="block text-sm font-semibold truncate">{story.title}</span>
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
              <section className="rounded-2xl p-6" style={{ background: "white", border: "1px solid #E7E0D7" }}>
                <div className="flex flex-wrap gap-3 items-start justify-between mb-5">
                  <div>
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
                      style={{ color: "#1B2A4A", borderColor: "#E7E0D7", fontFamily: "'Playfair Display', Georgia, serif" }}
                    />
                  </div>
                  <Link href="/super/worldsmith/editorial/connections">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: "#C87560" }}>
                      See its story map <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                  <Link href={`/super/worldsmith/editorial/stories/${selectedStory.id}`}>
                    <span className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold" style={{ color: "#1B2A4A" }}>
                      Open full editor <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
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

                <div className="mt-7 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: "#98A2B3" }}>Movements</p>
                    <p className="mt-1 text-xs" style={{ color: "#667085" }}>Use acts to make the reader’s journey tangible.</p>
                  </div>
                  <Link href="/super/worldsmith/editorial/connections">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold cursor-pointer" style={{ color: "#1B2A4A" }}>
                      Link canon <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </div>
                <div className="mt-3 grid md:grid-cols-2 gap-3">
                  {selectedStory.acts.map(act => (
                    <div key={act.id} className="rounded-xl p-4" style={{ background: "#FAF8F3", border: "1px solid #E7E0D7" }}>
                      <p className="text-[10px] uppercase tracking-[0.13em] font-bold" style={{ color: "#C87560" }}>Movement {act.actNumber}</p>
                      <p className="mt-1 text-sm font-semibold" style={{ color: "#1B2A4A" }}>{act.title}</p>
                      {act.tagline && <p className="mt-1 text-xs italic" style={{ color: "#667085" }}>{act.tagline}</p>}
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
      </div>
    </div>
  );
}