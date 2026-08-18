import { useState } from "react";
import { Sparkles, Plus, ChevronRight, Link2, Eye, BookOpen, Map, Zap, MoreHorizontal } from "lucide-react";

// ── Tokens ─────────────────────────────────────────────────────────────────
const INK         = "#1B2A4A";
const CLAY        = "#C87560";
const PARCHMENT   = "#EFE9E1";
const WARM_WHITE  = "#FDFAF7";
const WARM_BG     = "#F4EFE8";
const WARM_BORDER = "#DDD4C4";
const AMBER       = "#D97706";
const AMBER_BG    = "#FEF3C7";
const GREEN       = "#16A34A";

// ── Data ────────────────────────────────────────────────────────────────────
const ACTS = [
  {
    id: "act1",
    number: "Act I",
    title: "The Arrival",
    tagline: "A stranger comes to Ashmore. The house has been waiting.",
    pct: 60,
    color: "#3B82F6",
    lightBg: "#EFF6FF",
    locations: ["The Glasshouse", "The East Wing"],
    characters: ["Lady Ashmore", "The Groundskeeper"],
    objects: [{ name: "The Obsidian Mirror", mystery: "What the mirrors remember" }],
    encounters: 2,
    gaps: ["Needs an inciting event", "No motif record yet"],
    journalPrompts: 4,
  },
  {
    id: "act2",
    number: "Act II",
    title: "The Unravelling",
    tagline: "Every room reveals something. Not all of it can be unseen.",
    pct: 15,
    color: CLAY,
    lightBg: "#FFF5F2",
    locations: ["The Black Lake", "Ashmore Village"],
    characters: ["Silas Vance"],
    objects: [{ name: "The Wax Seal Collection", mystery: "The Wychcombe Inheritance" }],
    encounters: 0,
    gaps: ["Lady Ashmore's secret needs a canon record", "No encounter at the Black Lake", "Silas Vance's motivation unknown"],
    journalPrompts: 1,
  },
  {
    id: "act3",
    number: "Act III",
    title: "The Reckoning",
    tagline: "What you choose to do with the truth is your story.",
    pct: 0,
    color: "#8B5CF6",
    lightBg: "#F5F3FF",
    locations: [],
    characters: [],
    objects: [],
    encounters: 0,
    gaps: ["No records yet — this act is empty", "Needs a resolution lore thread", "Ending encounter missing"],
    journalPrompts: 0,
  },
];

const MYSTERY_THREADS = [
  { name: "What the mirrors remember", from: "The Obsidian Mirror", act: "act1", status: "open", chain: ["The Glasshouse", "Lady Ashmore", "The Reckoning?"] },
  { name: "The Wychcombe Inheritance", from: "The Wax Seal Collection", act: "act2", status: "open", chain: ["Lady Ashmore's study", "Ashmore Village", "?"] },
];

// ── Top narrative summary ─────────────────────────────────────────────────
function NarrativeSummary() {
  const [editing, setEditing] = useState(false);
  return (
    <div className="px-10 py-7 border-b" style={{ background: WARM_WHITE, borderColor: WARM_BORDER }}>
      <div className="flex items-start justify-between" style={{ maxWidth: 900 }}>
        <div className="flex-1 mr-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-serif text-2xl font-semibold" style={{ fontFamily: "'Playfair Display', serif", color: INK }}>
              Wychcombe
            </h1>
            <span className="rounded-full text-[10px] font-semibold px-2.5 py-0.5 uppercase tracking-wide"
              style={{ background: "#D1FAE5", color: "#065F46" }}>In Progress</span>
            <span className="text-xs" style={{ color: "#9CA3AF" }}>13 records · 3 acts · 2 open threads</span>
          </div>
          {editing ? (
            <textarea
              autoFocus
              onBlur={() => setEditing(false)}
              className="w-full bg-transparent resize-none outline-none leading-relaxed border-b"
              style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 15, color: "#374151", borderColor: CLAY, minHeight: 60 }}
              defaultValue="A Victorian inheritance mystery set on a fog-bound estate. A new arrival, a mirror that lies, letters addressed to the dead. Three acts: arriving, unravelling, choosing what to do with the truth."
            />
          ) : (
            <p className="cursor-text leading-relaxed" onClick={() => setEditing(true)}
              style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 15, color: "#374151" }}>
              A Victorian inheritance mystery set on a fog-bound estate. A new arrival, a mirror that lies, letters addressed to the dead. Three acts: arriving, unravelling, choosing what to do with the truth.
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-none">
          <button className="rounded-lg text-sm font-medium px-4 py-2"
            style={{ background: PARCHMENT, color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
            Export Outline
          </button>
          <button className="rounded-lg text-sm font-medium px-4 py-2 flex items-center gap-1.5"
            style={{ background: INK, color: "white" }}>
            <Sparkles size={13} />
            Suggest Act III
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Act Column ─────────────────────────────────────────────────────────────
function ActColumn({ act, active, onClick }: { act: typeof ACTS[0]; active: boolean; onClick: () => void }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 cursor-pointer transition-all"
      style={{
        borderRight: `1px solid ${WARM_BORDER}`,
        background: active ? "white" : WARM_BG,
      }}
      onClick={onClick}>
      {/* Act header */}
      <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: WARM_BORDER }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: act.color }}>{act.number}</span>
          {act.pct > 0 && (
            <span className="text-[10px] font-medium rounded-full px-2 py-0.5"
              style={{ background: act.lightBg, color: act.color }}>{act.pct}% built</span>
          )}
        </div>
        <h2 className="font-serif font-semibold mb-1" style={{ fontFamily: "'Playfair Display', serif", color: INK, fontSize: 17 }}>
          {act.title}
        </h2>
        <p className="text-xs italic leading-snug" style={{ color: "#6B7280" }}>"{act.tagline}"</p>
        {act.pct > 0 && (
          <div className="mt-3 rounded-full overflow-hidden" style={{ height: 3, background: WARM_BORDER }}>
            <div className="h-full rounded-full" style={{ width: `${act.pct}%`, background: act.color }} />
          </div>
        )}
      </div>

      {/* Records */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Locations */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>Locations</div>
          {act.locations.length === 0
            ? <div className="text-[11px] italic" style={{ color: "#9CA3AF" }}>None yet</div>
            : act.locations.map(l => (
              <div key={l} className="flex items-center gap-2 py-1">
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#3B82F6", flexShrink: 0 }} />
                <span className="text-xs" style={{ color: INK }}>{l}</span>
                {l === "The Glasshouse" && (
                  <span className="ml-auto text-[9px] rounded-full px-1.5 py-0.5"
                    style={{ background: "#DBEAFE", color: "#1D4ED8" }}>entry</span>
                )}
              </div>
            ))}
          <button className="flex items-center gap-1 text-[11px] mt-1.5" style={{ color: act.color }}>
            <Plus size={9} /> Add location
          </button>
        </div>

        {/* Characters */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>Characters</div>
          {act.characters.length === 0
            ? <div className="text-[11px] italic" style={{ color: "#9CA3AF" }}>None yet</div>
            : act.characters.map(c => (
              <div key={c} className="flex items-center gap-2 py-1">
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#8B5CF6", flexShrink: 0 }} />
                <span className="text-xs" style={{ color: INK }}>{c}</span>
              </div>
            ))}
          <button className="flex items-center gap-1 text-[11px] mt-1.5" style={{ color: act.color }}>
            <Plus size={9} /> Add character
          </button>
        </div>

        {/* Objects */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>Objects of Mystery</div>
          {act.objects.length === 0
            ? <div className="text-[11px] italic" style={{ color: "#9CA3AF" }}>None yet</div>
            : act.objects.map(o => (
              <div key={o.name} className="rounded-lg px-3 py-2 mb-1.5" style={{ background: AMBER_BG, border: `1px solid ${AMBER}30` }}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span style={{ color: AMBER, fontSize: 9 }}>◆</span>
                  <span className="text-xs font-medium" style={{ color: "#92400E" }}>{o.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye size={8} style={{ color: AMBER }} />
                  <span style={{ fontSize: 10, color: "#B45309", fontStyle: "italic" }}>{o.mystery}</span>
                </div>
              </div>
            ))}
          <button className="flex items-center gap-1 text-[11px] mt-1" style={{ color: act.color }}>
            <Plus size={9} /> Add object
          </button>
        </div>

        {/* Encounters */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>Encounters</div>
          {act.encounters === 0
            ? <div className="text-[11px] italic" style={{ color: "#9CA3AF" }}>No encounters written</div>
            : <div className="flex items-center gap-2">
                <Zap size={11} style={{ color: GREEN }} />
                <span className="text-xs" style={{ color: GREEN }}>{act.encounters} encounter{act.encounters > 1 ? "s" : ""} written</span>
              </div>
          }
          <button className="flex items-center gap-1 text-[11px] mt-1.5" style={{ color: act.color }}>
            <Plus size={9} /> Write encounter
          </button>
        </div>

        {/* Gaps */}
        {act.gaps.length > 0 && (
          <div className="rounded-lg p-3" style={{ background: act.pct === 0 ? "#F5F3FF" : "rgba(255,255,255,0.7)", border: `1px solid ${WARM_BORDER}` }}>
            <div className="flex items-center gap-1 mb-2">
              <Sparkles size={10} style={{ color: CLAY }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: CLAY }}>Canon Gaps</span>
            </div>
            {act.gaps.map(g => (
              <div key={g} className="flex items-start gap-1.5 mb-1">
                <span style={{ color: CLAY, fontSize: 10, marginTop: 1 }}>·</span>
                <p className="text-[11px] leading-snug" style={{ color: "#6B7280" }}>{g}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: WARM_BORDER }}>
        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{act.journalPrompts} journal prompts</span>
        <button className="text-xs font-medium flex items-center gap-1" style={{ color: act.color }}>
          Open Act <ChevronRight size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Mystery Thread Bar ────────────────────────────────────────────────────
function MysteryThreads() {
  return (
    <div className="px-8 py-5 border-t" style={{ background: PARCHMENT, borderColor: WARM_BORDER }}>
      <div className="flex items-center gap-2 mb-4">
        <span style={{ color: AMBER, fontSize: 13 }}>◆</span>
        <span className="text-sm font-semibold" style={{ color: INK }}>Mystery Threads — running across all three acts</span>
      </div>
      <div className="flex gap-4">
        {MYSTERY_THREADS.map(t => (
          <div key={t.name} className="flex-1 rounded-xl p-4" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-sm" style={{ color: INK }}>{t.name}</span>
              <span className="rounded-full text-[9px] font-bold px-1.5 py-0.5 uppercase"
                style={{ background: AMBER_BG, color: "#92400E" }}>open</span>
            </div>
            <div className="text-xs mb-2" style={{ color: "#9CA3AF" }}>from: {t.from}</div>
            <div className="flex items-center gap-1 flex-wrap">
              {t.chain.map((step, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="rounded-full text-[10px] px-2 py-0.5"
                    style={{ background: PARCHMENT, color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
                    {step}
                  </span>
                  {i < t.chain.length - 1 && <Link2 size={8} style={{ color: "#9CA3AF" }} />}
                </span>
              ))}
            </div>
          </div>
        ))}
        <button className="flex-none flex flex-col items-center justify-center gap-1 rounded-xl px-8"
          style={{ background: "white", border: `1px dashed ${WARM_BORDER}`, color: "#9CA3AF" }}>
          <Plus size={14} />
          <span className="text-xs">Add thread</span>
        </button>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────
export function StoryOverview() {
  const [activeAct, setActiveAct] = useState("act1");
  const [view, setView] = useState<"acts" | "timeline">("acts");

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden"
      style={{ background: WARM_BG, color: INK, fontFamily: "'Instrument Sans', sans-serif" }}>

      {/* TOP BAR */}
      <div className="flex-none flex items-center justify-between px-5 border-b"
        style={{ height: 48, background: WARM_WHITE, borderColor: WARM_BORDER }}>
        <div className="text-sm flex items-center gap-2">
          <span style={{ color: "#9CA3AF" }}>Wychcombe / </span>
          <span style={{ color: INK, fontWeight: 600 }}>Story Overview</span>
        </div>
        <div className="flex items-center gap-2">
          {(["acts", "timeline"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className="text-xs font-medium rounded-lg px-3 py-1.5 capitalize"
              style={view === v
                ? { background: INK, color: "white" }
                : { background: "transparent", color: "#9CA3AF" }}>
              {v}
            </button>
          ))}
          <div className="w-px h-4 mx-1" style={{ background: WARM_BORDER }} />
          <button className="p-1.5 rounded-md" style={{ color: "#9CA3AF" }}>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* NARRATIVE SUMMARY */}
      <NarrativeSummary />

      {/* ACT COLUMNS */}
      <div className="flex flex-1 min-h-0">
        {ACTS.map(act => (
          <ActColumn key={act.id} act={act} active={activeAct === act.id} onClick={() => setActiveAct(act.id)} />
        ))}
      </div>

      {/* MYSTERY THREADS */}
      <MysteryThreads />
    </div>
  );
}
