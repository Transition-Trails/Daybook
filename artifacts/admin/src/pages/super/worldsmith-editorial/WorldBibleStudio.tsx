import { Link } from "wouter";
import { ArrowRight, BookOpen } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { WorldBibleSection, type WsWorld } from "@/pages/super/WorldSmithHome";

export default function WorldBibleStudio() {
  const { selectedWorld, updateWorld } = useEditorial();
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["worldsmith/worlds", "bible-studio"],
    queryFn: () => apiFetch<{ worlds: WsWorld[] }>("/v1/worldsmith/worlds"),
    enabled: !!selectedWorld,
    staleTime: 0,
  });
  const fullWorld = data?.worlds.find(w => w.id === selectedWorld?.id);

  if (!selectedWorld) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: "#7D8797" }}>
        Choose a world to shape its World Bible.
      </div>
    );
  }
  if (isLoading) return <div className="p-8 space-y-4" aria-label="Loading World Bible"><div className="h-8 w-48 animate-pulse rounded bg-muted"/><div className="h-32 max-w-3xl animate-pulse rounded-xl bg-muted"/></div>;
  if (error || !fullWorld) return <div role="alert" className="world-bible-error m-8 rounded-xl border p-6 text-sm">Could not load the current World Bible. <button type="button" onClick={() => refetch()} className="underline">Retry</button></div>;

  return (
    <div className="h-full overflow-y-auto" style={{ background: "var(--admin-card-subtle)" }}>
      <header className="h-12 shrink-0 flex items-center gap-2 px-7 border-b bg-white" style={{ borderColor: "var(--admin-border)" }}>
        <span className="text-[11px]" style={{ color: "#98A2B3" }}>WorldSmith</span>
        <span className="text-[11px]" style={{ color: "#C9BFB2" }}>/</span>
        <span className="text-[11px]" style={{ color: "#667085" }}>{selectedWorld.name}</span>
        <span className="text-[11px]" style={{ color: "#C9BFB2" }}>/</span>
        <span className="text-[11px] font-semibold" style={{ color: "#1B2A4A" }}>World Bible</span>
      </header>

      <div className="w-full px-8 py-8">
        <div className="flex items-start justify-between gap-5 mb-7">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: "#C87560" }}>
              <BookOpen className="w-3.5 h-3.5" />
              Editorial Studio · World identity
            </div>
            <h1 className="mt-2 text-3xl leading-tight" style={{ color: "#1B2A4A", fontFamily: "'Playfair Display', Georgia, serif" }}>
              {selectedWorld.name} — World Bible
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "#667085" }}>
              Define what stories can exist here, how this realm behaves, and the direction every downstream story should respect.
            </p>
          </div>
          <Link href="/super/worldsmith/editorial/board">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer" style={{ color: "#C87560" }}>
              Back to board <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>

        <section className="rounded-2xl p-7" style={{ background: "var(--admin-card)", border: "1px solid var(--admin-border)" }}>
          <WorldBibleSection
            key={fullWorld.id}
            world={fullWorld}
            showCopilot={false}
            onSaved={updatedWorld => {
              queryClient.setQueryData<{ worlds: WsWorld[] }>(["worldsmith/worlds", "bible-studio"], current => current
                ? { ...current, worlds: current.worlds.map(w => w.id === updatedWorld.id ? { ...w, ...updatedWorld } : w) }
                : current);
              updateWorld({ ...selectedWorld, ...updatedWorld });
            }}
          />
        </section>
      </div>
    </div>
  );
}