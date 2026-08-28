import { Link } from "wouter";
import { ArrowRight, BookOpen } from "lucide-react";
import { useEditorial } from "@/contexts/EditorialContext";
import { WorldBibleSection } from "@/pages/super/WorldSmithHome";

export default function WorldBibleStudio() {
  const { selectedWorld, updateWorld } = useEditorial();

  if (!selectedWorld) {
    return (
      <div className="h-full flex items-center justify-center text-sm" style={{ color: "#7D8797" }}>
        Choose a world to shape its World Bible.
      </div>
    );
  }

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
              Write the visual, tonal, and sensory rules that every story, canon record, and physical piece should carry.
              Your Co-write partner is available in the right drawer whenever you need another creative angle.
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
            key={selectedWorld.id}
            world={selectedWorld}
            showCopilot={false}
            onSaved={updatedWorld => updateWorld({ ...selectedWorld, ...updatedWorld })}
          />
        </section>
      </div>
    </div>
  );
}