import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, CircleDot, Loader2, MapPinned, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import { useEditorialPageFilters } from "./EditorialShell";

interface StoryAct {
  id: string;
  storyId: string;
  actNumber: number;
  title: string;
}
interface Story {
  id: string;
  title: string;
  summary: string;
  status: string;
  acts: StoryAct[];
}

interface CanonRecord {
  id: string;
  name: string;
  canonType: string | null;
  status: string;
}

interface StoryLink {
  storyId: string;
  storyTitle: string;
  canonRecordId: string;
  recordName: string;
  canonType: string | null;
  actId: string | null;
  actNumber: number | null;
  actTitle: string | null;
}

interface ConnectionsResponse {
  stories: Story[];
  canonRecords: CanonRecord[];
  links: StoryLink[];
  totalLinks: number;
  linksTruncated: boolean;
  recordsTruncated: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  character: "#C87560",
  location: "#607A9B",
  object: "#A16A40",
  event: "#8A6FAD",
  lore: "#537761",
  atmosphere: "#9A718A",
  material: "#756B5A",
  relationship: "#A85F67",
  motif: "#B7873B",
};

function StoryMapFilterControls({
  stories,
  selectedStoryId,
  onStoryChange,
}: {
  stories: Story[];
  selectedStoryId: string | "all";
  onStoryChange: (storyId: string | "all") => void;
}) {
  return (
    <div>
      <label htmlFor="story-map-filter-story" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Focus storyline
      </label>
      <select
        id="story-map-filter-story"
        value={selectedStoryId}
        onChange={event => onStoryChange(event.target.value)}
        className="w-full rounded-lg border bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none focus:border-[#C87560]"
        style={{ borderColor: "#E5E7EB" }}
      >
        <option value="all">All storylines</option>
        {stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}
      </select>
    </div>
  );
}

function Node({ link, onUnlink }: { link: StoryLink; onUnlink?: () => void }) {
  const color = TYPE_COLORS[link.canonType ?? ""] ?? "#7D8797";
  return (
    <div className="rounded-xl p-3" style={{ background: "white", border: `1px solid ${color}55`, boxShadow: "0 3px 10px rgba(27,42,74,.05)" }}>
      <Link href={`/super/worldsmith/editorial/canon/${link.canonRecordId}`}>
        <span className="block cursor-pointer transition-transform hover:-translate-y-0.5">
        <span className="flex items-center gap-2">
          <CircleDot className="w-3.5 h-3.5 shrink-0" style={{ color }} />
          <span className="min-w-0">
            <span className="block text-[12.5px] font-semibold truncate" style={{ color: "#1B2A4A" }}>{link.recordName}</span>
            <span className="block mt-0.5 text-[10px] uppercase tracking-[0.11em]" style={{ color }}>{link.canonType ?? "Canon"}</span>
          </span>
        </span>
        {link.actTitle && (
          <span className="mt-2 block text-[10.5px]" style={{ color: "#7D8797" }}>
            Movement {link.actNumber}: {link.actTitle}
          </span>
        )}
        </span>
      </Link>
      {onUnlink && (
        <button onClick={onUnlink} className="mt-2 text-[10px] font-semibold" style={{ color: "#A85F67" }}>
          Remove from storyline
        </button>
      )}
    </div>
  );
}

export default function StoryConnections() {
  const { selectedWorld, selectedWorldId } = useEditorial();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedStoryId, setSelectedStoryId] = useState<string | "all">("all");
  const [showUnlinked, setShowUnlinked] = useState(true);
  const [selectedActId, setSelectedActId] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["ws-story-connections", selectedWorldId, selectedStoryId],
    queryFn: () => apiFetch<ConnectionsResponse>(
      `/v1/editorial/story-connections?world_id=${encodeURIComponent(selectedWorldId!)}&limit=80${selectedStoryId === "all" ? "" : `&story_id=${encodeURIComponent(selectedStoryId)}`}`,
    ),
    enabled: !!selectedWorldId,
    staleTime: 20_000,
  });

  const stories = data?.stories ?? [];
  const canonRecords = data?.canonRecords ?? [];
  const links = data?.links ?? [];
  const totalLinks = data?.totalLinks ?? 0;

  useEffect(() => {
    // Keep the current focus while its scoped query is loading. Resetting from
    // the temporary empty query result made a newly selected storyline snap
    // back to "all" before its request completed.
    if (data && selectedStoryId !== "all" && !stories.some(story => story.id === selectedStoryId)) {
      setSelectedStoryId("all");
    }
  }, [data, stories, selectedStoryId]);

  const visibleLinks = useMemo(
    () => selectedStoryId === "all" ? links : links.filter(link => link.storyId === selectedStoryId),
    [links, selectedStoryId],
  );
  const linkedRecordIds = new Set(visibleLinks.map(link => link.canonRecordId));
  const unlinkedRecords = canonRecords.filter(record => !linkedRecordIds.has(record.id));
  const selectedStory = stories.find(story => story.id === selectedStoryId) ?? null;
  const refreshMap = () => queryClient.invalidateQueries({ queryKey: ["ws-story-connections", selectedWorldId] });

  useEffect(() => {
    setSelectedActId("");
  }, [selectedStoryId]);

  const storyFilterContent = useMemo(() => (
    <StoryMapFilterControls
      stories={stories}
      selectedStoryId={selectedStoryId}
      onStoryChange={setSelectedStoryId}
    />
  ), [selectedStoryId, stories]);
  const storyPageFilters = useMemo(() => ({
    label: "Story Map filters",
    activeCount: selectedStoryId === "all" ? 0 : 1,
    content: storyFilterContent,
    onClear: () => setSelectedStoryId("all"),
  }), [selectedStoryId, storyFilterContent]);

  useEditorialPageFilters(storyPageFilters);

  const linkRecord = useMutation({
    mutationFn: (recordId: string) => apiFetch(`/v1/editorial/canon-records/${recordId}/story-links`, {
      method: "POST",
      body: JSON.stringify({ story_id: selectedStory!.id, act_id: selectedActId || null }),
    }),
    onSuccess: () => {
      refreshMap();
      toast({ title: "Canon record connected to storyline" });
    },
    onError: () => toast({ title: "Could not connect canon record", variant: "destructive" }),
  });
  const unlinkRecord = useMutation({
    mutationFn: (link: StoryLink) => apiFetch(`/v1/editorial/canon-records/${link.canonRecordId}/story-links/${link.storyId}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshMap();
      toast({ title: "Connection removed" });
    },
    onError: () => toast({ title: "Could not remove connection", variant: "destructive" }),
  });

  if (!selectedWorldId || !selectedWorld) {
    return <div className="h-full flex items-center justify-center text-sm" style={{ color: "#7D8797" }}>Choose a world to view its story map.</div>;
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--admin-card-subtle)" }}>
      <div className="max-w-6xl mx-auto px-7 py-7">
        <header className="flex flex-wrap items-start justify-between gap-4 mb-7">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: "#C87560" }}>
              Editorial Studio · {selectedWorld.name}
            </p>
            <h1 className="mt-1 text-3xl leading-tight" style={{ color: "#1B2A4A", fontFamily: "'Playfair Display', Georgia, serif" }}>
              Story map
            </h1>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: "#667085" }}>
              See which people, places, and objects carry each adventure—and what still needs a story to connect it.
            </p>
          </div>
          <Link href="/super/worldsmith/editorial/stories">
            <span className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold cursor-pointer" style={{ background: "#1B2A4A", color: "white" }}>
              <BookOpen className="w-4 h-4" />
              Storylines
            </span>
          </Link>
        </header>

        {isLoading ? (
          <div className="py-20 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: "#C87560" }} /></div>
        ) : stories.length === 0 ? (
          <section className="rounded-2xl px-8 py-14 text-center" style={{ background: "white", border: "1px dashed #C9BFB2" }}>
            <MapPinned className="w-9 h-9 mx-auto mb-3" style={{ color: "#C87560" }} />
            <h2 className="text-lg font-semibold" style={{ color: "#1B2A4A" }}>A map starts with a storyline</h2>
            <p className="mt-2 text-sm max-w-md mx-auto" style={{ color: "#667085" }}>
              Create an adventure, then tie your canon to its moments so the larger story becomes visible.
            </p>
            <Link href="/super/worldsmith/editorial/stories">
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold cursor-pointer" style={{ color: "#C87560" }}>
                Create a storyline <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </section>
        ) : (
          <>
            {selectedStory && (
              <section className="rounded-xl px-4 py-3 mb-5 flex flex-wrap items-center gap-3" style={{ background: "#F0E9DF", border: "1px solid #DDD4C4" }}>
                <p className="text-xs font-semibold" style={{ color: "#1B2A4A" }}>Connect canon to {selectedStory.title}</p>
                {selectedStory.acts.length > 0 && (
                  <select
                    value={selectedActId}
                    onChange={event => setSelectedActId(event.target.value)}
                    className="rounded-lg bg-white px-2.5 py-1.5 text-xs outline-none"
                    style={{ border: "1px solid #D8CFC3", color: "#475467" }}
                  >
                    <option value="">Whole storyline</option>
                    {selectedStory.acts.map(act => (
                      <option key={act.id} value={act.id}>Movement {act.actNumber}: {act.title}</option>
                    ))}
                  </select>
                )}
                <span className="text-[11px]" style={{ color: "#667085" }}>
                  Choose an open thread below to connect it.
                </span>
              </section>
            )}

            <div className="grid xl:grid-cols-[minmax(270px,.72fr)_minmax(0,1.5fr)_minmax(230px,.7fr)] gap-5 items-start">
              <section className="rounded-2xl p-5" style={{ background: "#1B2A4A", color: "white" }}>
                <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: "#DCA28F" }}>
                  Narrative focus
                </p>
                {selectedStory ? (
                  <>
                    <h2 className="mt-3 text-xl leading-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{selectedStory.title}</h2>
                    <p className="mt-3 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,.68)" }}>
                      {selectedStory.summary || "This storyline is waiting for its narrative promise."}
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-3 text-xl leading-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>The larger world</h2>
                    <p className="mt-3 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,.68)" }}>
                      {stories.length} storylines are carrying {totalLinks} saved canon connections.
                    </p>
                  </>
                )}
                <div className="mt-6 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,.14)" }}>
                  <p className="text-[10px] uppercase tracking-[0.13em] font-bold" style={{ color: "rgba(255,255,255,.5)" }}>Creative question</p>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,.8)" }}>
                    Which object, location, or person should a reader meet next—and could it become a letter, map, or keepsake?
                  </p>
                </div>
              </section>

              <section className="rounded-2xl p-5" style={{ background: "var(--admin-card)", border: "1px solid var(--admin-border)" }}>
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: "#C87560" }}>Connected canon</p>
                    <h2 className="mt-1 text-lg font-semibold" style={{ color: "#1B2A4A" }}>
                      {visibleLinks.length ? `${totalLinks} story connection${totalLinks === 1 ? "" : "s"}` : "No saved connections yet"}
                    </h2>
                  </div>
                  <span className="text-[11px] rounded-full px-2 py-1" style={{ background: "#EFE9E1", color: "#786D60" }}>
                    {selectedStory ? selectedStory.title : "All stories"}
                  </span>
                </div>
                {visibleLinks.length === 0 ? (
                  <div className="rounded-xl p-6 text-center" style={{ background: "white", border: "1px dashed #C9BFB2" }}>
                    <p className="text-sm font-semibold" style={{ color: "#1B2A4A" }}>This thread needs its cast and landmarks.</p>
                    <p className="mt-1.5 text-xs" style={{ color: "#667085" }}>
                      Select this storyline, then connect an open canon thread from the column beside it.
                    </p>
                    <Link href="/super/worldsmith/editorial/canon">
                      <span className="mt-3 inline-flex text-xs font-semibold cursor-pointer" style={{ color: "#C87560" }}>Browse canon →</span>
                    </Link>
                  </div>
                ) : (
                  <div className="relative grid sm:grid-cols-2 gap-3">
                    <div className="hidden sm:block absolute left-1/2 top-6 bottom-6 w-px" style={{ background: "var(--admin-border)" }} />
                    {visibleLinks.map(link => (
                      <Node
                        key={`${link.storyId}-${link.canonRecordId}`}
                        link={link}
                        onUnlink={selectedStory ? () => unlinkRecord.mutate(link) : undefined}
                      />
                    ))}
                  </div>
                )}
                {data?.linksTruncated && (
                  <p className="mt-3 text-[11px]" style={{ color: "#98A2B3" }}>
                    Showing the first {links.length} of {totalLinks} links. Focus on one storyline to work in a smaller view.
                  </p>
                )}
              </section>

              <section className="rounded-2xl p-5" style={{ background: "white", border: "1px solid var(--admin-border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] font-bold" style={{ color: "#98A2B3" }}>Open threads</p>
                    <h2 className="mt-1 text-sm font-semibold" style={{ color: "#1B2A4A" }}>
                      {unlinkedRecords.length} canon record{unlinkedRecords.length === 1 ? "" : "s"} not in view
                    </h2>
                  </div>
                  <button onClick={() => setShowUnlinked(show => !show)} className="text-[11px] font-semibold" style={{ color: "#C87560" }}>
                    {showUnlinked ? "Hide" : "Show"}
                  </button>
                </div>
                {showUnlinked && (
                  <div className="mt-4 space-y-2">
                    {unlinkedRecords.slice(0, 8).map(record => (
                      <div key={record.id} className="rounded-lg px-2.5 py-2" style={{ border: "1px solid #F0ECE6" }}>
                        <Link href={`/super/worldsmith/editorial/canon/${record.id}`}>
                          <span className="block cursor-pointer hover:bg-[var(--admin-card-subtle)]">
                          <span className="block text-xs font-semibold truncate" style={{ color: "#344054" }}>{record.name}</span>
                          <span className="block mt-0.5 text-[10px] capitalize" style={{ color: TYPE_COLORS[record.canonType ?? ""] ?? "#98A2B3" }}>
                            {record.canonType ?? "Canon record"}
                          </span>
                          </span>
                        </Link>
                        {selectedStory && (
                          <button
                            onClick={() => linkRecord.mutate(record.id)}
                            disabled={linkRecord.isPending}
                            className="mt-1.5 text-[10px] font-semibold disabled:opacity-40"
                            style={{ color: "#C87560" }}
                          >
                            Connect to storyline
                          </button>
                        )}
                      </div>
                    ))}
                    {unlinkedRecords.length > 8 && (
                      <p className="pt-1 text-[11px]" style={{ color: "#98A2B3" }}>+ {unlinkedRecords.length - 8} more waiting for a story</p>
                    )}
                    {data?.recordsTruncated && (
                      <p className="pt-1 text-[11px]" style={{ color: "#98A2B3" }}>Showing the first 160 records. Use Canon Records to browse the full library.</p>
                    )}
                  </div>
                )}
              </section>
            </div>

            <section className="mt-6 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4" style={{ background: "#F0E9DF", border: "1px solid #DDD4C4" }}>
              <div className="flex gap-3">
                <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#C87560" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#1B2A4A" }}>Let the narrative become something to hold.</p>
                  <p className="mt-1 text-xs" style={{ color: "#667085" }}>Ask Co-write to turn a connected moment into a printed clue, journal page, letter, or ephemera sheet.</p>
                </div>
              </div>
              <Link href="/super/worldsmith/editorial/specs/new">
                <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer" style={{ background: "#1B2A4A", color: "white" }}>
                  Start a production piece <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </Link>
            </section>
          </>
        )}
      </div>
    </div>
  );
}