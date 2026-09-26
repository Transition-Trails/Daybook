import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, ArrowUpRight, BookOpen, GitBranch, Info, RefreshCw, ScrollText } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";

export type PlanningEntity = "canon_records" | "storylines" | "beats";
type Lane = "backlog" | "in_progress" | "review" | "ready";

interface PlanningCard {
  id: string;
  title: string;
  subtitle: string;
  lane: Lane;
  revision: number;
  href: string;
  parentTitle?: string;
}

interface PlanningResponse {
  boards: Record<PlanningEntity, PlanningCard[]>;
}

const LANES: Array<{ key: Lane; title: string; note: string; tint: string; ink: string; line: string }> = [
  { key: "backlog", title: "Backlog", note: "Ideas to take shape", tint: "var(--admin-sunken)", ink: "var(--admin-secondary)", line: "var(--admin-faint)" },
  { key: "in_progress", title: "In progress", note: "Work on the desk", tint: "var(--admin-card-subtle)", ink: "var(--admin-clay-hover)", line: "var(--admin-clay)" },
  { key: "review", title: "Review", note: "Ready for a second look", tint: "var(--admin-paper)", ink: "var(--admin-amber)", line: "var(--admin-amber)" },
  { key: "ready", title: "Ready", note: "Planned for the next step", tint: "var(--admin-card-subtle)", ink: "var(--admin-green)", line: "var(--admin-green)" },
];

const BOARD_INFO: Record<PlanningEntity, { title: string; singular: string; description: string; icon: typeof BookOpen; libraryHref: string }> = {
  canon_records: {
    title: "Canon Records",
    singular: "record",
    description: "Plan work on the world's defining details, independently of canon approval.",
    icon: BookOpen,
    libraryHref: "/super/worldsmith/editorial/canon",
  },
  storylines: {
    title: "Storylines",
    singular: "storyline",
    description: "See which narratives are waiting, being written, or ready to carry the world forward.",
    icon: GitBranch,
    libraryHref: "/super/worldsmith/editorial/stories",
  },
  beats: {
    title: "Beats",
    singular: "beat",
    description: "Track the individual moments that give each storyline its shape.",
    icon: ScrollText,
    libraryHref: "/super/worldsmith/editorial/stories",
  },
};

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The change could not be saved.";
}

export default function PlanningReadinessBoard({ entityType }: { entityType: PlanningEntity }) {
  const { selectedWorldId, selectedWorld } = useEditorial();
  const queryClient = useQueryClient();
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const movingRef = useRef<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dropLane, setDropLane] = useState<Lane | null>(null);
  const info = BOARD_INFO[entityType];
  const Icon = info.icon;
  const queryKey = ["editorial-readiness-planning", selectedWorldId] as const;

  const { data, isLoading, isFetching, error, refetch } = useQuery<PlanningResponse>({
    queryKey,
    queryFn: () => apiFetch<PlanningResponse>(
      `/v1/editorial/readiness-planning?world_id=${encodeURIComponent(selectedWorldId!)}`,
    ),
    enabled: Boolean(selectedWorldId),
    staleTime: 15_000,
    refetchOnMount: "always",
  });

  const move = useMutation({
    mutationFn: ({ worldId, type, card, lane }: {
      worldId: string; type: PlanningEntity; card: PlanningCard; lane: Lane;
    }) => apiFetch<{ card: PlanningCard }>(
      `/v1/editorial/readiness-planning/${type}/${encodeURIComponent(card.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          world_id: worldId,
          lane,
          expected_revision: card.revision,
        }),
      },
    ),
    onSuccess: ({ card: saved }, { worldId, type }) => {
      const key = ["editorial-readiness-planning", worldId];
      // Show the server-owned revision and lane immediately, then reconcile the
      // entire board so concurrent edits in other sessions are picked up.
      queryClient.setQueryData<PlanningResponse>(key, current => current ? {
        ...current,
        boards: {
          ...current.boards,
          [type]: (current.boards[type] ?? []).map(item => item.id === saved.id ? saved : item),
        },
      } : current);
      void queryClient.invalidateQueries({ queryKey: key, exact: true });
      setMoveError(null);
    },
    onError: (failure, { worldId }) => {
      setMoveError(`Move not saved. ${messageFromError(failure)} The board has been refreshed; choose a lane again.`);
      void queryClient.invalidateQueries({ queryKey: ["editorial-readiness-planning", worldId], exact: true });
    },
    onSettled: () => {
      movingRef.current = null;
      setMovingKey(null);
    },
  });

  const cards = data?.boards?.[entityType] ?? [];
  const handleMove = (card: PlanningCard, lane: Lane) => {
    if (!selectedWorldId || card.lane === lane || movingRef.current) return;
    const key = `${entityType}:${card.id}`;
    movingRef.current = key;
    setMovingKey(key);
    setMoveError(null);
    move.mutate({ worldId: selectedWorldId, type: entityType, card, lane });
  };
  const clearDrag = () => {
    setDraggedCardId(null);
    setDropLane(null);
  };

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label={`${info.title} readiness`}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--admin-sunken)] text-[var(--admin-clay)]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <h2 className="text-sm font-semibold text-[var(--admin-ink)]">{info.title}</h2>
              {selectedWorldId && !isLoading && !error && (
                <span data-testid={`count-readiness-${entityType}`} className="rounded-full bg-[var(--admin-sunken)] px-2 py-0.5 text-[10px] font-semibold text-[var(--admin-muted)]">
                  {cards.length} {cards.length === 1 ? info.singular : `${info.singular}s`}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-snug text-[var(--admin-muted)]">{info.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedWorldId && (
            <span className="hidden max-w-[160px] truncate text-xs text-[var(--admin-faint)] lg:inline" title={selectedWorld?.name}>{selectedWorld?.name}</span>
          )}
          <button
            type="button"
            data-testid={`button-refresh-readiness-${entityType}`}
            onClick={() => { setMoveError(null); void refetch(); }}
            disabled={!selectedWorldId || isFetching || Boolean(movingKey)}
            aria-label={`Refresh ${info.title} board`}
            className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-2 text-[var(--admin-muted)] transition-colors hover:bg-[var(--admin-sunken)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-clay)]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
          <Link href={info.libraryHref} data-testid={`link-library-readiness-${entityType}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--admin-ink)] px-3 py-2 text-xs font-semibold text-[var(--admin-card)] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-clay)]">
            Open {entityType === "beats" ? "stories" : entityType === "canon_records" ? "library" : "studio"}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="mx-4 mt-3 flex shrink-0 items-start gap-2.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-subtle)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--admin-secondary)] sm:mx-6" role="note" data-testid="note-readiness-planning-only">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--admin-faint)]" aria-hidden="true" />
        <p><strong className="font-semibold text-[var(--admin-ink)]">Planning only.</strong> Review and Ready are planning lanes. Moving a card here does not approve Canon Records or change editorial status. Drag cards between lanes, or use each card's Move to selector.</p>
      </div>

      {moveError && (
        <div role="alert" data-testid="status-readiness-move-error" className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-[var(--admin-clay)] bg-[var(--admin-card-subtle)] px-3 py-2.5 text-xs text-[var(--admin-clay-hover)] sm:mx-6">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{moveError}</span>
          <button type="button" data-testid="button-dismiss-readiness-error" aria-label="Dismiss error" onClick={() => setMoveError(null)} className="font-semibold underline">Dismiss</button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {!selectedWorldId ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-card)] px-6 text-center">
            <Icon className="mb-3 h-7 w-7 text-[var(--admin-clay)]" aria-hidden="true" />
            <h3 className="text-base font-medium text-[var(--admin-ink)]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Choose a world to begin</h3>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--admin-muted)]">Select a world in the editorial sidebar to see its {info.title.toLowerCase()} readiness.</p>
          </div>
        ) : isLoading ? (
          <div role="status" aria-label={`Loading ${info.title} board`} data-testid="status-readiness-loading" className="grid gap-4 md:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {LANES.map((lane, index) => (
              <div key={lane.key} className="min-h-[230px] animate-pulse rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card-subtle)] p-4">
                <div className="mb-8 h-4 w-24 rounded bg-[var(--admin-sunken)]" />
                {index < 3 && <><div className="mb-3 h-24 rounded-lg bg-[var(--admin-sunken)]" /><div className="h-16 rounded-lg bg-[var(--admin-sunken)]" /></>}
              </div>
            ))}
            <span className="sr-only">Loading board…</span>
          </div>
        ) : error ? (
          <div role="alert" data-testid="status-readiness-load-error" className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-[var(--admin-clay)] bg-[var(--admin-card-subtle)] px-6 text-center">
            <AlertCircle className="mb-3 h-7 w-7 text-[var(--admin-clay)]" aria-hidden="true" />
            <h3 className="text-base font-medium text-[var(--admin-ink)]">The board could not be loaded</h3>
            <p className="mt-1 max-w-sm text-xs text-[var(--admin-muted)]">{messageFromError(error)}</p>
            <button type="button" data-testid="button-retry-readiness" onClick={() => void refetch()} className="mt-4 rounded-lg bg-[var(--admin-ink)] px-4 py-2 text-xs font-semibold text-[var(--admin-card)]">Try again</button>
          </div>
        ) : cards.length === 0 ? (
          <div data-testid={`status-readiness-empty-${entityType}`} className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--admin-border)] bg-[var(--admin-card)] px-6 text-center">
            <Icon className="mb-3 h-7 w-7 text-[var(--admin-clay)]" aria-hidden="true" />
            <h3 className="text-base font-medium text-[var(--admin-ink)]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>An open page</h3>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-[var(--admin-muted)]">No {info.title.toLowerCase()} are on this board yet. Start in the {entityType === "canon_records" ? "canon library" : "stories studio"}; new work will appear here.</p>
            <Link href={info.libraryHref} className="mt-4 text-xs font-semibold text-[var(--admin-clay-hover)] underline underline-offset-4">Go to {entityType === "canon_records" ? "canon library" : "stories studio"}</Link>
          </div>
        ) : (
          <div className="grid items-start gap-4 md:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {LANES.map((lane, laneIndex) => {
              const laneCards = cards.filter(card => card.lane === lane.key);
              return (
                <section
                  key={lane.key}
                  aria-label={`${lane.title}, ${laneCards.length} ${laneCards.length === 1 ? "item" : "items"}`}
                  data-testid={`lane-readiness-${entityType}-${lane.key}`}
                  onDragOver={event => {
                    const dragged = cards.find(card => card.id === draggedCardId);
                    if (!movingRef.current && dragged && dragged.lane !== lane.key) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (dropLane !== lane.key) setDropLane(lane.key);
                    }
                  }}
                  onDragLeave={event => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropLane(null);
                  }}
                  onDrop={event => {
                    event.preventDefault();
                    const dragged = cards.find(card => card.id === draggedCardId);
                    clearDrag();
                    if (dragged && dragged.lane !== lane.key && !movingRef.current) handleMove(dragged, lane.key);
                  }}
                  className={`min-w-0 overflow-hidden rounded-xl border bg-[var(--admin-card-subtle)] transition-colors ${dropLane === lane.key ? "border-[var(--admin-clay)] ring-2 ring-[var(--admin-clay)]/30" : "border-[var(--admin-border)]"}`}
                >
                  <div className="border-b border-[var(--admin-border)] px-3.5 py-3" style={{ backgroundColor: lane.tint }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: lane.line }} />
                        <h3 className="text-xs font-bold tracking-wide" style={{ color: lane.ink }}>{lane.title}</h3>
                      </div>
                      <span data-testid={`count-readiness-${entityType}-${lane.key}`} className="rounded-md bg-[var(--admin-card)]/70 px-2 py-0.5 text-[11px] font-semibold" style={{ color: lane.ink }}>{laneCards.length}</span>
                    </div>
                    <p className="ml-4 mt-0.5 text-[10px] opacity-75" style={{ color: lane.ink }}>{lane.note}</p>
                  </div>
                  <div className="space-y-2 p-2.5">
                    {laneCards.length === 0 ? (
                      <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-[var(--admin-border)] px-3 text-center text-[11px] text-[var(--admin-faint)]">
                        Nothing here yet
                      </div>
                    ) : laneCards.map(card => {
                      const busy = movingKey === `${entityType}:${card.id}`;
                      const editorHref = card.href.startsWith("/super/worldsmith/editorial/") ? card.href : info.libraryHref;
                      return (
                        <article
                          key={card.id}
                          data-testid={`card-readiness-${entityType}-${card.id}`}
                          draggable={!movingKey}
                          onDragStart={event => {
                            if (movingRef.current) { event.preventDefault(); return; }
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", card.id);
                            setDraggedCardId(card.id);
                          }}
                          onDragEnd={clearDrag}
                          className={`rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-3 shadow-sm transition-transform hover:-translate-y-0.5 ${draggedCardId === card.id ? "opacity-50" : ""} ${movingKey ? "cursor-default" : "cursor-grab active:cursor-grabbing"}`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-faint)]">{String(laneIndex + 1).padStart(2, "0")} / 04</span>
                            <span className="text-[10px] text-[var(--admin-faint)]">rev {card.revision}</span>
                          </div>
                          {card.parentTitle && <p className="mb-1 truncate text-[10px] font-medium text-[var(--admin-clay)]" title={card.parentTitle}>{card.parentTitle}</p>}
                          <Link href={editorHref} data-testid={`link-readiness-editor-${entityType}-${card.id}`} className="group inline-flex w-full items-start justify-between gap-2 rounded-sm text-left text-sm font-semibold leading-snug text-[var(--admin-ink)] hover:text-[var(--admin-clay-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-clay)]">
                            <span className="line-clamp-3">{card.title}</span>
                            <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-100" aria-hidden="true" />
                          </Link>
                          {card.subtitle && <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-[var(--admin-muted)]">{card.subtitle}</p>}
                          <div className="mt-3 border-t border-[var(--admin-row-divider)] pt-2.5">
                            <label htmlFor={`move-${entityType}-${card.id}`} className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--admin-faint)]">Move to</label>
                            <select
                              id={`move-${entityType}-${card.id}`}
                              data-testid={`select-readiness-lane-${entityType}-${card.id}`}
                              aria-label={`Move ${card.title} to lane`}
                              value={card.lane}
                              onChange={event => handleMove(card, event.target.value as Lane)}
                              disabled={Boolean(movingKey)}
                              className="w-full rounded-md border border-[var(--admin-border)] bg-[var(--admin-card)] px-2 py-1.5 text-xs font-medium text-[var(--admin-secondary)] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-clay)]"
                            >
                              {LANES.map(option => <option key={option.key} value={option.key}>{option.title}</option>)}
                            </select>
                            {busy && <span role="status" className="mt-1 block text-[10px] text-[var(--admin-clay-hover)]">Saving change…</span>}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}