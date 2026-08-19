import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, ChevronRight, Loader2, Plus, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEditorial } from "@/contexts/EditorialContext";

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
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const [newStatus, setNewStatus] = useState("draft");
  const [summaryDraft, setSummaryDraft] = useState<Record<string, string>>({});
  const [newActTitle, setNewActTitle] = useState("");

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

  const createStory = useMutation({
    mutationFn: () =>
      apiFetch<{ story: Story }>("/v1/editorial/stories", {
        method: "POST",
        body: JSON.stringify({
          world_id: selectedWorldId,
          title: newTitle.trim(),
          summary: newSummary.trim(),
          status: newStatus,
        }),
      }),
    onSuccess: ({ story }) => {
      refreshStories();
      setSelectedStoryId(story.id);
      setComposerOpen(false);
      setNewTitle("");
      setNewSummary("");
      setNewStatus("draft");
      toast({ title: "Storyline created" });
    },
    onError: () => toast({ title: "Could not create storyline", variant: "destructive" }),
  });

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

  const saveSummary = (story: Story) => {
    const summary = summaryDraft[story.id];
    if (summary === undefined || summary === story.summary) return;
    apiFetch(`/v1/editorial/stories/${story.id}`, {
      method: "PATCH",
      body: JSON.stringify({ summary }),
    })
      .then(refreshStories)
      .catch(() => toast({ title: "Could not save story summary", variant: "destructive" }));
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
      <div className="max-w-6xl mx-auto px-7 py-7">
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
            onClick={() => setComposerOpen(open => !open)}
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

        {composerOpen && (
          <section className="rounded-2xl p-5 mb-6" style={{ background: "#FFFCF8", border: "1px solid #DDD4C4" }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: "#C87560" }}>New storyline</p>
                <p className="mt-1 text-sm" style={{ color: "#667085" }}>Start with a promise, a conflict, or one unforgettable image.</p>
              </div>
              <button onClick={() => setComposerOpen(false)} className="text-xs font-medium" style={{ color: "#667085" }}>Cancel</button>
            </div>
            <div className="grid md:grid-cols-[1.4fr_0.7fr] gap-4">
              <label className="text-xs font-semibold" style={{ color: "#344054" }}>
                Working title
                <input
                  value={newTitle}
                  onChange={event => setNewTitle(event.target.value)}
                  placeholder="The Wychcombe Inheritance"
                  className="mt-1.5 w-full rounded-lg bg-white px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1px solid #DDD4C4", color: "#1B2A4A" }}
                />
              </label>
              <label className="text-xs font-semibold" style={{ color: "#344054" }}>
                Stage
                <select
                  value={newStatus}
                  onChange={event => setNewStatus(event.target.value)}
                  className="mt-1.5 w-full rounded-lg bg-white px-3 py-2.5 text-sm outline-none"
                  style={{ border: "1px solid #DDD4C4", color: "#1B2A4A" }}
                >
                  {["draft", "planned", "active", "archived"].map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-xs font-semibold mt-4" style={{ color: "#344054" }}>
              What pulls us in?
              <textarea
                value={newSummary}
                onChange={event => setNewSummary(event.target.value)}
                rows={3}
                placeholder="A short premise — who wants what, what complicates it, and why it matters in this world."
                className="mt-1.5 w-full resize-y rounded-lg bg-white px-3 py-2.5 text-sm leading-relaxed outline-none"
                style={{ border: "1px solid #DDD4C4", color: "#1B2A4A" }}
              />
            </label>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => createStory.mutate()}
                disabled={!newTitle.trim() || createStory.isPending}
                className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
                style={{ background: "#C87560", color: "white" }}
              >
                {createStory.isPending ? "Creating…" : "Create storyline"}
              </button>
            </div>
          </section>
        )}

        {isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C87560" }} /></div>
        ) : stories.length === 0 ? (
          <section className="rounded-2xl px-8 py-14 text-center" style={{ background: "white", border: "1px dashed #C9BFB2" }}>
            <BookOpen className="w-9 h-9 mx-auto mb-3" style={{ color: "#C87560" }} />
            <h2 className="text-lg font-semibold" style={{ color: "#1B2A4A" }}>Give this world its first adventure</h2>
            <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: "#667085" }}>
              A storyline turns your growing canon into a path of discoveries, choices, and objects that can travel into a journal or a printed collection.
            </p>
            <button onClick={() => setComposerOpen(true)} className="mt-5 text-sm font-semibold" style={{ color: "#C87560" }}>
              Start a storyline →
            </button>
          </section>
        ) : (
          <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6 items-start">
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
                    <h2 className="mt-2 text-2xl" style={{ color: "#1B2A4A", fontFamily: "'Playfair Display', Georgia, serif" }}>
                      {selectedStory.title}
                    </h2>
                  </div>
                  <Link href="/super/worldsmith/editorial/connections">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: "#C87560" }}>
                      See its story map <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                </div>
                <label className="block text-[10px] uppercase tracking-[0.14em] font-bold mb-2" style={{ color: "#98A2B3" }}>
                  The narrative promise
                </label>
                <textarea
                  rows={4}
                  value={summaryDraft[selectedStory.id] ?? selectedStory.summary ?? ""}
                  onChange={event => setSummaryDraft(draft => ({ ...draft, [selectedStory.id]: event.target.value }))}
                  onBlur={() => saveSummary(selectedStory)}
                  placeholder="What is this story about? Who is changed by it, and what will a reader carry into the physical world?"
                  className="w-full resize-y rounded-xl p-4 text-sm leading-relaxed outline-none"
                  style={{ background: "#FFFCF8", border: "1px solid #E7E0D7", color: "#344054", fontFamily: "'Spectral', Georgia, serif" }}
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