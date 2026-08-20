import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, ChevronRight, Loader2, Plus } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { EditorialRichTextField } from "@/components/EditorialRichText";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

const INK = "#1B2A4A";
const CLAY = "#C87560";
const BORDER = "#E7E0D7";
const STORY_STATUSES = ["draft", "planned", "active", "archived"] as const;

interface StoryAct {
  id: string;
  storyId: string;
  actNumber: number;
  title: string;
  tagline: string;
}

interface Story {
  id: string;
  worldId: string;
  title: string;
  summary: string;
  status: string;
  acts: StoryAct[];
}

interface StoryForm {
  title: string;
  summary: string;
  status: string;
}

function createEmptyForm(search: string): StoryForm {
  const params = new URLSearchParams(search);
  return {
    title: params.get("title") ?? "",
    summary: params.get("summary") ?? "",
    status: params.get("status") ?? "draft",
  };
}

export default function StorylineEditor({ storyId }: { storyId?: string }) {
  const isNew = !storyId;
  const [, navigate] = useLocation();
  const search = useSearch();
  const { selectedWorld, worlds } = useEditorial();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<StoryForm>(() => createEmptyForm(search));
  const [newActTitle, setNewActTitle] = useState("");
  const initializedStoryRef = useRef<string | null>(null);

  const { data, isLoading, isError } = useQuery<{ story: Story }>({
    queryKey: ["editorial-story", storyId],
    queryFn: () => apiFetch(`/v1/editorial/stories/${storyId}`),
    enabled: !!storyId,
    staleTime: 30_000,
  });
  const story = data?.story;
  const recordWorld = story ? worlds.find(world => world.id === story.worldId) : selectedWorld;
  const worldId = story?.worldId ?? selectedWorld?.id;

  useEffect(() => {
    if (story && initializedStoryRef.current !== story.id) {
      initializedStoryRef.current = story.id;
      setForm({
        title: story.title,
        summary: story.summary ?? "",
        status: story.status ?? "draft",
      });
    }
  }, [story]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("A storyline title is required");
      if (isNew) {
        if (!worldId) throw new Error("Choose a world before creating a storyline");
        return apiFetch<{ story: Story }>("/v1/editorial/stories", {
          method: "POST",
          body: JSON.stringify({
            world_id: worldId,
            title: form.title.trim(),
            summary: form.summary,
            status: form.status,
          }),
        });
      }
      return apiFetch<{ story: Story }>(`/v1/editorial/stories/${storyId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title.trim(),
          summary: form.summary,
          status: form.status,
        }),
      });
    },
    onSuccess: result => {
      queryClient.setQueryData(["editorial-story", result.story.id], { story: result.story });
      queryClient.invalidateQueries({ queryKey: ["ws-stories"] });
      toast({ title: isNew ? "Storyline created" : "Storyline saved" });
      navigate("/super/worldsmith/editorial/stories");
    },
    onError: (error: Error) => toast({
      title: isNew ? "Could not create storyline" : "Could not save storyline",
      description: error.message,
      variant: "destructive",
    }),
  });

  const createActMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/editorial/stories/${storyId}/acts`, {
      method: "POST",
      body: JSON.stringify({
        world_id: worldId,
        title: newActTitle.trim(),
        act_number: (story?.acts.length ?? 0) + 1,
      }),
    }),
    onSuccess: () => {
      setNewActTitle("");
      queryClient.invalidateQueries({ queryKey: ["editorial-story", storyId] });
      queryClient.invalidateQueries({ queryKey: ["ws-stories"] });
      toast({ title: "Movement added" });
    },
    onError: () => toast({ title: "Could not add movement", variant: "destructive" }),
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

  return (
    <div className="h-full overflow-y-auto" style={{ background: "#FAF8F3" }}>
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
          <button onClick={() => navigate("/super/worldsmith/editorial/stories")} className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: CLAY }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Storylines
          </button>
        </div>

        <form
          onSubmit={event => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
        >
          <div className="space-y-5">
            <section className="rounded-2xl border p-7" style={{ background: "#FFFCF8", borderColor: BORDER }}>
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

            {!isNew && story && (
              <section className="rounded-2xl border p-6" style={{ background: "white", borderColor: BORDER }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#98A2B3" }}>Movements</p>
                    <p className="mt-1 text-sm" style={{ color: "#667085" }}>Map the journey into distinct acts before connecting it to canon.</p>
                  </div>
                  <Link href="/super/worldsmith/editorial/connections">
                    <span className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold" style={{ color: CLAY }}>
                      View story map <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {story.acts.map(act => (
                    <div key={act.id} className="rounded-xl p-4" style={{ background: "#FAF8F3", border: "1px solid #E7E0D7" }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.13em]" style={{ color: CLAY }}>Movement {act.actNumber}</p>
                      <p className="mt-1 text-sm font-semibold" style={{ color: INK }}>{act.title}</p>
                      {act.tagline && <p className="mt-1 text-xs italic" style={{ color: "#667085" }}>{act.tagline}</p>}
                    </div>
                  ))}
                  <div className="rounded-xl p-4" style={{ border: "1px dashed #C9BFB2" }}>
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
                        placeholder={`Act ${(story.acts.length ?? 0) + 1}`}
                        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                        style={{ color: INK }}
                      />
                      <button
                        type="button"
                        onClick={() => createActMutation.mutate()}
                        disabled={!newActTitle.trim() || createActMutation.isPending}
                        className="inline-flex items-center gap-1 text-xs font-semibold disabled:opacity-40"
                        style={{ color: CLAY }}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4">
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