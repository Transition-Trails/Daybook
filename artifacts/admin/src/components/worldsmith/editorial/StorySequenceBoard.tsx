import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp, BookOpen, GripVertical, Layers2, Link2, Unlink2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type Story = {
  id: string;
  title: string;
  summary: string;
  status: string;
  sortOrder: number;
  acts: Array<unknown>;
};

type SequenceResponse = { stories: Array<{ id: string; sortOrder: number }> };
type Placement = "before" | "after" | "alongside";
type Groups = string[][];

export interface StorySequenceBoardProps {
  worldId: string;
  stories: Story[];
  onOpen: (id: string) => void;
}

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  active: { background: "color-mix(in srgb, var(--admin-green) 13%, var(--admin-card))", color: "var(--admin-green)" },
  draft: { background: "var(--admin-sunken)", color: "var(--admin-secondary)" },
  planned: { background: "color-mix(in srgb, var(--admin-blue) 12%, var(--admin-card))", color: "var(--admin-blue)" },
  archived: { background: "color-mix(in srgb, var(--admin-muted) 12%, var(--admin-card))", color: "var(--admin-muted)" },
};

function groupsFromStories(stories: Story[]): Groups {
  // Existing legacy records have no meaningful sequence. Keep their incoming
  // order, and never accidentally coalesce all the zero-order records.
  const ordered = stories.map((story, index) => ({ story, index }));
  if (ordered.every(({ story }) => story.sortOrder > 0)) {
    ordered.sort((a, b) => a.story.sortOrder - b.story.sortOrder || a.index - b.index);
  }
  const groups: Groups = [];
  let previousOrder: number | null = null;
  for (const { story } of ordered) {
    if (story.sortOrder > 0 && previousOrder === story.sortOrder) {
      groups[groups.length - 1]!.push(story.id);
    } else {
      groups.push([story.id]);
    }
    previousOrder = story.sortOrder > 0 ? story.sortOrder : null;
  }
  return groups;
}

function sameGroups(a: Groups, b: Groups): boolean {
  return a.length === b.length && a.every((group, index) =>
    group.length === b[index]?.length && group.every((id, item) => id === b[index]?.[item]),
  );
}

function moveStory(groups: Groups, storyId: string, targetId: string, placement: Placement): Groups {
  const originalTarget = groups.find(group => group.includes(targetId));
  if (!originalTarget || !groups.some(group => group.includes(storyId))) return groups;
  if (placement === "alongside" && originalTarget.includes(storyId)) return groups;
  const remaining = groups.map(group => group.filter(id => id !== storyId)).filter(group => group.length);
  // A singleton dragged to its own boundary has nowhere to move.
  const anchor = originalTarget.find(id => id !== storyId);
  if (!anchor) return groups;
  const targetIndex = remaining.findIndex(group => group.includes(anchor));
  if (targetIndex < 0) return groups;
  const next = remaining.map(group => [...group]);
  if (placement === "alongside") next[targetIndex]!.push(storyId);
  else next.splice(targetIndex + (placement === "after" ? 1 : 0), 0, [storyId]);
  return next;
}

function insertAtEnd(groups: Groups, storyId: string): Groups {
  if (!groups.some(group => group.includes(storyId))) return groups;
  return [...groups.map(group => group.filter(id => id !== storyId)).filter(group => group.length), [storyId]];
}

function plainText(html: string): string {
  if (!html) return "";
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const doc = new DOMParser().parseFromString(html.replace(/<(?:br|\/(?:p|div|li|h[1-6]))\b[^>]*>/gi, " "), "text/html");
  doc.querySelectorAll("script, style, template").forEach(node => node.remove());
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function StorySequenceBoard({ worldId, stories, onOpen }: StorySequenceBoardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const incoming = useMemo(() => groupsFromStories(stories), [stories]);
  const [local, setLocal] = useState<{ worldId: string; groups: Groups } | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());
  const worldRef = useRef(worldId);
  worldRef.current = worldId;

  // Local order remains authoritative through the mutation and cache refresh.
  // When the parent eventually delivers the saved order, return to server state.
  useEffect(() => {
    if (local && local.worldId !== worldId) {
      setLocal(null);
    } else if (!inFlight.current.has(worldId) && local?.worldId === worldId && sameGroups(local.groups, incoming)) {
      setLocal(null);
    }
  }, [incoming, local, worldId]);

  useEffect(() => {
    setSaving(inFlight.current.has(worldId));
    setDraggedId(null);
    setDropTarget(null);
  }, [worldId]);

  const groups = local?.worldId === worldId ? local.groups : incoming;
  const storiesById = useMemo(() => new Map(stories.map(story => [story.id, story])), [stories]);
  const storyCount = stories.length;
  const simultaneousCount = groups.filter(group => group.length > 1).length;

  const save = async (next: Groups) => {
    if (inFlight.current.has(worldId) || sameGroups(groups, next)) return;
    const ids = next.flat();
    if (ids.length !== stories.length || new Set(ids).size !== stories.length || ids.some(id => !storiesById.has(id))) return;
    const previous = groups;
    const requestWorld = worldId;
    inFlight.current.add(requestWorld);
    setSaving(true);
    setLocal({ worldId: requestWorld, groups: next });
    try {
      const result = await apiFetch<SequenceResponse>("/v1/editorial/stories/sequence", {
        method: "POST",
        body: JSON.stringify({
          world_id: requestWorld,
          groups: next,
          expected: stories.map(story => ({ id: story.id, sort_order: story.sortOrder })),
        }),
      });
      // Patch the exact cache consumed by StoriesStudio before invalidating it.
      // This prevents a stale parent render from replacing the optimistic board.
      const positions = new Map(result.stories.map(item => [item.id, item.sortOrder]));
      queryClient.setQueryData<{ stories: Story[] }>(["ws-stories", requestWorld], current => {
        if (!current) return current;
        const rank = new Map(ids.map((id, index) => [id, index]));
        return {
          ...current,
          stories: current.stories.map(story => ({
            ...story,
            sortOrder: positions.get(story.id) ?? next.findIndex(group => group.includes(story.id)) + 1,
          })).sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)),
        };
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ws-stories", requestWorld] }),
        queryClient.invalidateQueries({ queryKey: ["ws-story-connections", requestWorld] }),
      ]);
      if (worldRef.current === requestWorld) {
        // The refetch is authoritative: it may reorder siblings within a
        // simultaneous moment or include changes made in another session.
        setLocal(null);
        toast({ title: "Story sequence saved" });
      }
    } catch (error) {
      if (worldRef.current === requestWorld) {
        setLocal({ worldId: requestWorld, groups: previous });
        if (error instanceof Error && "status" in error && error.status === 409) {
          await queryClient.invalidateQueries({ queryKey: ["ws-stories", requestWorld] });
          setLocal(null);
        }
        toast({
          title: "Could not save story sequence",
          description: error instanceof Error ? error.message : "Your previous sequence has been restored. Try again.",
          variant: "destructive",
        });
      }
    } finally {
      inFlight.current.delete(requestWorld);
      if (worldRef.current === requestWorld) setSaving(false);
    }
  };

  const finishDrag = () => {
    setDraggedId(null);
    setDropTarget(null);
  };

  const drop = (event: DragEvent, targetId: string | null, placement: Placement) => {
    event.preventDefault();
    const id = draggedId || event.dataTransfer.getData("text/plain");
    finishDrag();
    if (!id || inFlight.current.has(worldId)) return;
    void save(targetId ? moveStory(groups, id, targetId, placement) : insertAtEnd(groups, id));
  };

  const dropZone = (key: string, label: string, targetId: string | null, placement: Placement) => (
    <div
      key={key}
      data-testid={`drop-sequence-${key}`}
      aria-label={label}
      onDragOver={event => {
        if (!draggedId || saving) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTarget(key);
      }}
      onDragLeave={() => setDropTarget(current => current === key ? null : current)}
      onDrop={event => drop(event, targetId, placement)}
      className={`flex items-center justify-center overflow-hidden rounded-lg border border-dashed transition-opacity duration-150 ${
        draggedId ? "my-2 h-9 opacity-100" : "h-0 border-transparent opacity-0"
      } ${dropTarget === key ? "border-[var(--admin-clay)] bg-[color-mix(in_srgb,var(--admin-clay)_12%,var(--admin-card))]" : "border-[var(--admin-border)] bg-[var(--admin-card-subtle)]"}`}
    >
      <span className="text-[11px] font-semibold text-[var(--admin-clay-hover)]">{label}</span>
    </div>
  );

  return (
    <section data-testid="story-sequence-board" className="w-full rounded-2xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-[0_12px_32px_color-mix(in_srgb,var(--admin-ink)_4%,transparent)] sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--admin-border)] pb-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-clay)]">The narrative order</p>
          <h2 className="mt-1 text-2xl text-[var(--admin-ink)]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Sequence board</h2>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-[var(--admin-muted)]">
            Put storylines in reading order. Stories in the same moment unfold at the same time.
          </p>
        </div>
        <div className="flex gap-4 rounded-xl bg-[var(--admin-sunken)] px-4 py-3 text-xs text-[var(--admin-secondary)]">
          <span data-testid="count-sequence-stories"><strong className="mr-1 text-[var(--admin-ink)]">{storyCount}</strong> stories</span>
          <span data-testid="count-sequence-moments"><strong className="mr-1 text-[var(--admin-ink)]">{groups.length}</strong> moments</span>
          <span data-testid="count-sequence-simultaneous"><strong className="mr-1 text-[var(--admin-ink)]">{simultaneousCount}</strong> shared</span>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--admin-muted)]">
        <span>Drag a card between moments or into a moment to make stories simultaneous.</span>
        <span aria-live="polite" data-testid="status-sequence-save" className="font-semibold text-[var(--admin-clay-hover)]">
          {saving ? "Saving sequence…" : "Changes save automatically"}
        </span>
      </div>

      {groups.length === 0 ? (
        <div data-testid="empty-sequence-board" className="mt-6 rounded-xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-card-subtle)] px-6 py-12 text-center">
          <BookOpen className="mx-auto h-7 w-7 text-[var(--admin-clay)]" />
          <h3 className="mt-3 text-base font-semibold text-[var(--admin-ink)]">No storylines to sequence yet</h3>
          <p className="mt-1 text-xs text-[var(--admin-muted)]">New storylines will appear here as moments to arrange.</p>
        </div>
      ) : (
        <div className="mt-5">
          {groups.map((group, groupIndex) => {
            const anchor = group[0]!;
            return (
              <div key={anchor} data-testid={`group-sequence-${groupIndex + 1}`}>
                {dropZone(`before-${anchor}`, `Place before moment ${groupIndex + 1}`, anchor, "before")}
                <div className="flex gap-3 sm:gap-4">
                  <div className="flex w-9 shrink-0 flex-col items-center pt-3 sm:w-12">
                    <span data-testid={`number-sequence-${groupIndex + 1}`} className="text-lg font-semibold tabular-nums text-[var(--admin-clay)]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                      {String(groupIndex + 1).padStart(2, "0")}
                    </span>
                    {groupIndex < groups.length - 1 && <span className="mt-2 min-h-5 w-px flex-1 bg-[var(--admin-border)]" />}
                  </div>
                  <div className={`mb-3 min-w-0 flex-1 rounded-xl border p-3 sm:p-4 ${group.length > 1 ? "border-[color-mix(in_srgb,var(--admin-clay)_45%,var(--admin-border))] bg-[color-mix(in_srgb,var(--admin-clay)_7%,var(--admin-card))]" : "border-[var(--admin-border)] bg-[var(--admin-card-subtle)]"}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--admin-muted)]">Moment {String(groupIndex + 1).padStart(2, "0")}</p>
                      {group.length > 1 && (
                        <span data-testid={`status-simultaneous-${groupIndex + 1}`} className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--admin-clay)_18%,var(--admin-card))] px-2.5 py-1 text-[10px] font-bold text-[var(--admin-clay-hover)]">
                          <Layers2 className="h-3 w-3" /> Same time · {group.length} stories
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {group.map(id => {
                        const story = storiesById.get(id);
                        if (!story) return null;
                        const statusStyle = STATUS_STYLES[story.status.toLowerCase()] ?? STATUS_STYLES.draft;
                        const summary = plainText(story.summary ?? "");
                        const canMoveEarlier = groupIndex > 0 || group.length > 1;
                        const canMoveLater = groupIndex < groups.length - 1 || group.length > 1;
                        return (
                          <div
                            key={id}
                            data-testid={`card-sequence-story-${id}`}
                            draggable={!saving}
                            onDragStart={event => {
                              event.dataTransfer.setData("text/plain", id);
                              event.dataTransfer.effectAllowed = "move";
                              setDraggedId(id);
                            }}
                            onDragEnd={finishDrag}
                            className={`rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-3 shadow-[0_2px_6px_color-mix(in_srgb,var(--admin-ink)_3%,transparent)] ${draggedId === id ? "opacity-50" : ""}`}
                          >
                            <div className="flex items-start gap-2.5">
                              <GripVertical aria-hidden="true" className="mt-0.5 hidden h-4 w-4 shrink-0 cursor-grab text-[var(--admin-faint)] sm:block" />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 data-testid={`text-sequence-title-${id}`} className="min-w-0 break-words text-sm font-semibold leading-snug text-[var(--admin-ink)]">{story.title || "Untitled storyline"}</h3>
                                  <span data-testid={`status-sequence-story-${id}`} className="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize" style={statusStyle}>{story.status}</span>
                                </div>
                                {summary && <p data-testid={`text-sequence-summary-${id}`} className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--admin-muted)]">{summary}</p>}
                                <p data-testid={`count-sequence-movements-${id}`} className="mt-1.5 text-[10px] text-[var(--admin-faint)]">{story.acts.length} movement{story.acts.length === 1 ? "" : "s"}</p>
                              </div>
                              <button type="button" data-testid={`button-open-sequence-story-${id}`} onClick={() => onOpen(id)} className="shrink-0 rounded-md px-2 py-1.5 text-[11px] font-semibold text-[var(--admin-clay-hover)] hover:bg-[color-mix(in_srgb,var(--admin-clay)_12%,var(--admin-card))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--admin-clay)]" aria-label={`Open ${story.title}`}>
                                <span className="hidden sm:inline">Open</span> <ArrowRight className="inline h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--admin-row-divider)] pt-2">
                              <button type="button" data-testid={`button-earlier-sequence-${id}`} aria-label={`Move ${story.title} earlier`} title="Move earlier" disabled={saving || !canMoveEarlier} onClick={() => void save(moveStory(groups, id, group.length > 1 ? group.find(item => item !== id)! : groups[groupIndex - 1]![0]!, "before"))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--admin-slate)] hover:bg-[var(--admin-sunken)] disabled:cursor-not-allowed disabled:opacity-35"><ArrowUp className="h-3 w-3" /> Earlier</button>
                              <button type="button" data-testid={`button-later-sequence-${id}`} aria-label={`Move ${story.title} later`} title="Move later" disabled={saving || !canMoveLater} onClick={() => void save(group.length > 1 ? moveStory(groups, id, group.find(item => item !== id)!, "after") : groupIndex === groups.length - 2 ? insertAtEnd(groups, id) : moveStory(groups, id, groups[groupIndex + 1]![0]!, "after"))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--admin-slate)] hover:bg-[var(--admin-sunken)] disabled:cursor-not-allowed disabled:opacity-35"><ArrowDown className="h-3 w-3" /> Later</button>
                              <span className="mx-0.5 h-3 w-px bg-[var(--admin-border)]" aria-hidden="true" />
                              <button type="button" data-testid={`button-join-previous-sequence-${id}`} aria-label={`Make ${story.title} simultaneous with previous moment`} disabled={saving || groupIndex === 0} onClick={() => void save(moveStory(groups, id, groups[groupIndex - 1]![0]!, "alongside"))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--admin-clay-hover)] hover:bg-[color-mix(in_srgb,var(--admin-clay)_12%,var(--admin-card))] disabled:cursor-not-allowed disabled:opacity-35"><Link2 className="h-3 w-3" /> Join above</button>
                              <button type="button" data-testid={`button-join-next-sequence-${id}`} aria-label={`Make ${story.title} simultaneous with next moment`} disabled={saving || groupIndex === groups.length - 1} onClick={() => void save(moveStory(groups, id, groups[groupIndex + 1]![0]!, "alongside"))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--admin-clay-hover)] hover:bg-[color-mix(in_srgb,var(--admin-clay)_12%,var(--admin-card))] disabled:cursor-not-allowed disabled:opacity-35"><Link2 className="h-3 w-3" /> Join below</button>
                              {group.length > 1 && <button type="button" data-testid={`button-separate-sequence-${id}`} aria-label={`Give ${story.title} its own moment`} disabled={saving} onClick={() => void save(moveStory(groups, id, group.find(item => item !== id)!, "after"))} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--admin-slate)] hover:bg-[var(--admin-sunken)] disabled:cursor-not-allowed disabled:opacity-35"><Unlink2 className="h-3 w-3" /> Separate</button>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {dropZone(`alongside-${anchor}`, `Add to moment ${groupIndex + 1} · same time`, anchor, "alongside")}
                  </div>
                </div>
              </div>
            );
          })}
          {dropZone("end", "Place at the end", null, "after")}
        </div>
      )}
    </section>
  );
}

export default StorySequenceBoard;