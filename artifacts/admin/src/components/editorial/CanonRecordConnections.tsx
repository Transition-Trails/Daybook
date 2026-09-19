import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Link2, BookOpen, Trash2, X, Sparkles, Loader2, ArrowRight
} from "lucide-react";

interface CanonRecord {
  id: string;
  name: string;
  canonType: string | null;
  status: string;
}

interface CanonRelation {
  fromRecordId: string;
  toRecordId: string;
  relationType: string | null;
  targetName: string;
  targetCanonType: string | null;
  targetStatus: string;
  details?: string | null;
}

interface Story {
  id: string;
  title: string;
  summary: string;
  status: string;
}

interface StoryLink {
  storyId: string;
  actId: string | null;
  storyTitle: string | null;
  storyStatus: string | null;
}

interface StorySuggestion {
  title: string;
  rationale: string;
  narrativePromise: string;
  recommendedStatus: string;
}

const CANON_TYPES_ORDER: Record<string, number> = {
  character: 1,
  location: 2,
  event: 3,
};

const RELATION_TYPES = [
  ["related", "Related"],
  ["family", "Family"],
  ["friend", "Friend"],
  ["ally", "Ally"],
  ["rival", "Rival"],
  ["enemy", "Enemy"],
  ["mentor", "Mentor"],
  ["student", "Student"],
  ["romantic", "Romantic"],
  ["protects", "Protects"],
  ["seeks", "Seeks"],
  ["owns", "Owns"],
  ["uses", "Uses"],
  ["involved_in", "Involved in"],
  ["caused", "Caused"],
  ["witnessed", "Witnessed"],
  ["located_at", "Located at"],
  ["precedes", "Precedes"],
  ["follows", "Follows"],
  ["supports", "Supports"],
  ["contradicts", "Contradicts"],
  ["requires", "Requires"],
  ["supersedes", "Supersedes"],
  ["mentions", "Mentions"],
] as const;

function getSortWeight(type: string | null | undefined): number {
  return type && CANON_TYPES_ORDER[type] ? CANON_TYPES_ORDER[type] : 99;
}

export function CanonRecordConnections({
  recordId,
  worldId,
}: {
  recordId: string;
  worldId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  // Modals / forms state
  const [relToId, setRelToId] = useState("");
  const [relType, setRelType] = useState("related");
  const [relDetails, setRelDetails] = useState("");
  
  const [storyId, setStoryId] = useState("");
  
  const [newStoryTitle, setNewStoryTitle] = useState("");
  const [newStorySummary, setNewStorySummary] = useState("");
  
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<StorySuggestion[]>([]);

  // Queries
  const { data: recordsData } = useQuery<{ canon_records: CanonRecord[] }>({
    queryKey: ["ws-canon-records", worldId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records?world_id=${encodeURIComponent(worldId)}&limit=500`),
    enabled: !!worldId,
  });

  const { data: relationsData } = useQuery<{ relations: CanonRelation[] }>({
    queryKey: ["editorial-canon-record-relations", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/relations`),
    enabled: !!recordId,
  });

  const { data: storiesData } = useQuery<{ stories: Story[] }>({
    queryKey: ["ws-stories", worldId],
    queryFn: () => apiFetch(`/v1/editorial/stories?world_id=${encodeURIComponent(worldId)}`),
    enabled: !!worldId,
  });

  const { data: storyLinksData } = useQuery<{ story_links: StoryLink[] }>({
    queryKey: ["editorial-story-links", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/story-links`),
    enabled: !!recordId,
  });

  const allRecords = recordsData?.canon_records ?? [];
  const relations = relationsData?.relations ?? [];
  const stories = storiesData?.stories ?? [];
  const storyLinks = storyLinksData?.story_links ?? [];

  const availableRecordsToLink = useMemo(() => {
    const existingIds = new Set(relations.map(r => r.toRecordId));
    return allRecords
      .filter(r => r.id !== recordId && !existingIds.has(r.id))
      .sort((a, b) => {
        const wA = getSortWeight(a.canonType);
        const wB = getSortWeight(b.canonType);
        if (wA !== wB) return wA - wB;
        return a.name.localeCompare(b.name);
      });
  }, [allRecords, relations, recordId]);

  const availableStoriesToLink = useMemo(() => {
    const existingIds = new Set(storyLinks.map(l => l.storyId));
    return stories.filter(s => !existingIds.has(s.id));
  }, [stories, storyLinks]);

  // Mutations
  const addRelMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/relations`, {
        method: "POST",
        body: JSON.stringify({ to_record_id: relToId, relation_type: relType, details: relDetails }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-canon-record-relations", recordId] });
      toast({ title: "Relationship created" });
      setRelToId("");
      setRelType("related");
      setRelDetails("");
    },
    onError: (e: Error) => toast({ title: "Could not add relationship", description: e.message, variant: "destructive" }),
  });

  const removeRelMutation = useMutation({
    mutationFn: (toId: string) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/relations/${toId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["editorial-canon-record-relations", recordId] }),
    onError: (e: Error) => toast({ title: "Could not remove relationship", description: e.message, variant: "destructive" }),
  });

  const linkStoryMutation = useMutation({
    mutationFn: (sId: string) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/story-links`, {
        method: "POST",
        body: JSON.stringify({ story_id: sId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-story-links", recordId] });
      qc.invalidateQueries({ queryKey: ["ws-story-connections", worldId] });
      toast({ title: "Connected to storyline" });
      setStoryId("");
    },
    onError: (e: Error) => toast({ title: "Could not connect storyline", description: e.message, variant: "destructive" }),
  });

  const unlinkStoryMutation = useMutation({
    mutationFn: (sId: string) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/story-links/${sId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-story-links", recordId] });
      qc.invalidateQueries({ queryKey: ["ws-story-connections", worldId] });
    },
    onError: (e: Error) => toast({ title: "Could not remove connection", description: e.message, variant: "destructive" }),
  });

  const createStoryMutation = useMutation({
    mutationFn: (data: { title: string; summary: string; status: string }) =>
      apiFetch<{ story: Story }>("/v1/editorial/stories", {
        method: "POST",
        body: JSON.stringify({
          world_id: worldId,
          title: data.title,
          summary: data.summary,
          status: data.status,
        }),
      }),
    onSuccess: (data) => {
      setNewStoryTitle("");
      setNewStorySummary("");
      setSuggestions([]);
      qc.invalidateQueries({ queryKey: ["ws-stories", worldId] });
      linkStoryMutation.mutate(data.story.id);
    },
    onError: (e: Error) => toast({ title: "Could not create storyline", description: e.message, variant: "destructive" }),
  });

  const generateSuggestions = async () => {
    setIsSuggesting(true);
    try {
      const res = await apiFetch<{ suggestions: StorySuggestion[] }>("/v1/editorial/stories/suggest", {
        method: "POST",
        body: JSON.stringify({ world_id: worldId }),
      });
      setSuggestions((res.suggestions || []).slice(0, 4));
    } catch (error) {
      toast({
        title: "Failed to generate suggestions",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <div className="mt-8 space-y-6">
      {/* Canon Relationships Section */}
      <section className="rounded-2xl border p-5 bg-white" style={{ borderColor: "var(--admin-border)" }}>
        <div className="flex items-center gap-2 mb-4">
          <Link2 className="h-4 w-4" style={{ color: "var(--admin-ink)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--admin-ink)" }}>Canon Relationships</h2>
        </div>

        {relations.length > 0 ? (
          <div className="mb-5 grid sm:grid-cols-2 gap-3">
            {relations.map(rel => (
                <div key={rel.toRecordId} className="group relative flex flex-col justify-between rounded-xl border p-3" style={{ borderColor: "var(--admin-border)", background: "var(--admin-card-subtle)" }}>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/super/worldsmith/editorial/canon/${rel.toRecordId}`} className="text-xs font-semibold hover:underline" style={{ color: "var(--admin-ink)" }}>
                        {rel.targetName}
                      </Link>
                      <span className="text-[9px] uppercase tracking-wider font-bold" style={{ color: "var(--admin-clay)" }}>
                        {rel.targetCanonType || "Canon"}
                      </span>
                    </div>
                    {rel.relationType && <div className="mt-1 text-[11px] font-medium" style={{ color: "var(--admin-muted)" }}>{rel.relationType.replace(/_/g, " ")}</div>}
                    {rel.details && <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: "var(--admin-muted)" }}>{rel.details}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRelMutation.mutate(rel.toRecordId)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-red-500 hover:bg-red-50 rounded"
                    title="Remove relationship"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
            ))}
          </div>
        ) : (
          <p className="mb-5 text-xs" style={{ color: "var(--admin-muted)" }}>No relationships established yet.</p>
        )}

        <div className="flex flex-wrap items-end gap-3 rounded-xl border p-4 bg-[var(--admin-card-subtle)]" style={{ borderColor: "var(--admin-border)" }}>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="canon-relation-target" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--admin-muted)]">Select record</label>
            <select
              id="canon-relation-target"
              value={relToId}
              onChange={e => setRelToId(e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-ink)]"
              style={{ borderColor: "var(--admin-border)" }}
            >
              <option value="">Choose a canon record...</option>
              {availableRecordsToLink.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.canonType || "Canon"})
                </option>
              ))}
            </select>
          </div>
          <div className="w-36">
            <label htmlFor="canon-relation-type" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--admin-muted)]">Relationship</label>
            <select
              id="canon-relation-type"
              value={relType}
              onChange={e => setRelType(e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-ink)]"
              style={{ borderColor: "var(--admin-border)" }}
            >
              {RELATION_TYPES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="canon-relation-details" className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--admin-muted)]">Details (Optional)</label>
            <input
              id="canon-relation-details"
              value={relDetails}
              onChange={e => setRelDetails(e.target.value)}
              placeholder="Context about this relationship"
              className="w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-ink)]"
              style={{ borderColor: "var(--admin-border)" }}
            />
          </div>
          <button
            type="button"
            disabled={!relToId || addRelMutation.isPending}
            onClick={() => addRelMutation.mutate()}
            className="rounded-md bg-[var(--admin-ink)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 h-[30px]"
          >
            {addRelMutation.isPending ? "Adding..." : "Add relation"}
          </button>
        </div>
      </section>

      {/* Storylines Section */}
      <section className="rounded-2xl border p-5 bg-white" style={{ borderColor: "var(--admin-border)" }}>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="h-4 w-4" style={{ color: "var(--admin-ink)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--admin-ink)" }}>Connected Storylines</h2>
        </div>

        {storyLinks.length > 0 ? (
          <div className="mb-5 space-y-2">
            {storyLinks.map(link => (
              <div key={link.storyId} className="flex items-center justify-between rounded-xl border p-3" style={{ borderColor: "var(--admin-border)", background: "var(--admin-card-subtle)" }}>
                <div>
                  <Link href={`/super/worldsmith/editorial/stories/${link.storyId}`} className="text-sm font-semibold hover:underline" style={{ color: "var(--admin-ink)" }}>
                    {link.storyTitle || "Untitled Story"}
                  </Link>
                  {link.storyStatus && (
                    <span className="ml-3 text-[10px] uppercase font-bold tracking-wider text-[var(--admin-muted)]">
                      {link.storyStatus}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => unlinkStoryMutation.mutate(link.storyId)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-5 text-xs" style={{ color: "var(--admin-muted)" }}>Not connected to any storylines.</p>
        )}

        <div className="grid lg:grid-cols-2 gap-4">
          {/* Link Existing Story */}
          <div className="rounded-xl border p-4 bg-[var(--admin-card-subtle)] flex flex-col" style={{ borderColor: "var(--admin-border)" }}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--admin-ink)]">Connect to existing</h3>
            <div className="flex gap-2 items-start mt-auto">
              <select
                value={storyId}
                onChange={e => setStoryId(e.target.value)}
                className="flex-1 rounded-md border px-2 py-2 text-xs outline-none focus:border-[var(--admin-ink)]"
                style={{ borderColor: "var(--admin-border)" }}
              >
                <option value="">Select a storyline...</option>
                {availableStoriesToLink.map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!storyId || linkStoryMutation.isPending}
                onClick={() => linkStoryMutation.mutate(storyId)}
                className="rounded-md bg-[var(--admin-ink)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 shrink-0"
              >
                {linkStoryMutation.isPending ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>

          {/* Create New Story */}
          <div className="rounded-xl border p-4 bg-[var(--admin-card-subtle)] flex flex-col" style={{ borderColor: "var(--admin-border)" }}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--admin-ink)]">Start new storyline</h3>
            <div className="space-y-2 mt-auto">
              <input
                value={newStoryTitle}
                onChange={e => setNewStoryTitle(e.target.value)}
                placeholder="Story title"
                className="w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-ink)]"
                style={{ borderColor: "var(--admin-border)" }}
              />
              <div className="flex gap-2">
                <input
                  value={newStorySummary}
                  onChange={e => setNewStorySummary(e.target.value)}
                  placeholder="Summary or premise..."
                  className="flex-1 rounded-md border px-2 py-1.5 text-xs outline-none focus:border-[var(--admin-ink)]"
                  style={{ borderColor: "var(--admin-border)" }}
                />
                <button
                  type="button"
                  disabled={!newStoryTitle || createStoryMutation.isPending}
                  onClick={() => createStoryMutation.mutate({ title: newStoryTitle, summary: newStorySummary, status: "draft" })}
                  className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 shrink-0 h-[30px]"
                  style={{ background: "var(--admin-clay)" }}
                >
                  {createStoryMutation.isPending ? "Creating..." : "Create & Link"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Story Suggestions */}
        <div className="mt-5 border-t pt-5" style={{ borderColor: "var(--admin-border)" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--admin-clay)" }}>
                <Sparkles className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                Co-write Suggestions
              </h3>
              <p className="mt-0.5 text-[11px] text-[var(--admin-muted)]">Generate story opportunities and connect this record in one step.</p>
            </div>
            <button
              type="button"
              onClick={generateSuggestions}
              disabled={isSuggesting}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: "var(--admin-border)", color: "var(--admin-clay)" }}
            >
              {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {suggestions.length ? "Regenerate ideas" : "Generate ideas"}
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              {suggestions.map((sug, i) => (
                <div key={`${sug.title}-${i}`} className="flex flex-col rounded-xl border bg-[var(--admin-card-subtle)] p-4" style={{ borderColor: "var(--admin-border)" }}>
                  <h4 className="text-sm font-semibold" style={{ color: "var(--admin-ink)" }}>{sug.title}</h4>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--admin-muted)]">{sug.rationale}</p>
                  <p className="mt-2 line-clamp-2 text-[11px] italic text-[var(--admin-muted)]">{sug.narrativePromise}</p>
                  <button
                    type="button"
                    onClick={() => createStoryMutation.mutate({
                      title: sug.title,
                      summary: sug.narrativePromise,
                      status: sug.recommendedStatus
                    })}
                    disabled={createStoryMutation.isPending}
                    className="mt-4 inline-flex self-start items-center text-xs font-semibold text-[var(--admin-clay)] hover:underline"
                  >
                    Create & Link <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
