import { useState } from "react";
import {
  Sparkles, Plus, ChevronRight, Link2, Eye,
  Zap, MoreHorizontal, BookOpen, Sticker, Package, Users,
  ChevronDown,
} from "lucide-react";

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
const STORIES = [
  { id: "s1", title: "The Inheritance Mystery", status: "active",  acts: 3, pct: 35 },
  { id: "s2", title: "The Groundskeeper's War", status: "draft",   acts: 0, pct: 0  },
  { id: "s3", title: "Letters from the Dead",   status: "planned", acts: 0, pct: 0  },
];

const PRODUCTS = [
  {
    id: "rpg",
    icon: BookOpen,
    label: "Solo RPG Daybook",
    description: "Session journal · encounters · journal prompts",
    story: "The Inheritance Mystery",
    status: "in-progress",
    statusColor: "#16A34A",
    statusBg: "#D1FAE5",
    pct: 35,
    pages: 0,
    cta: "Continue building",
  },
  {
    id: "junk",
    icon: Package,
    label: "Junk Journal Kit",
    description: "Art pages · ephemera · world textures · collage sheets",
    story: "Any story",
    status: "ready to start",
    statusColor: AMBER,
    statusBg: AMBER_BG,
    pct: 0,
    pages: 0,
    cta: "Start kit",
  },
  {
    id: "sticker",
    icon: Sticker,
    label: "Sticker Kit",
    description: "Die-cut stickers from your characters, objects & locations",
    story: "Any story",
    status: "ready to start",
    statusColor: AMBER,
    statusBg: AMBER_BG,
    pct: 0,
    pages: 0,
    cta: "Start kit",
  },
  {
    id: "membership",
    icon: Users,
    label: "Monthly Membership",
    description: "Unfolding storyline · new chapter each drop · subscriber kit",
    story: "The Inheritance Mystery",
    status: "not started",
    statusColor: "#9CA3AF",
    statusBg: "#F3F4F6",
    pct: 0,
    pages: 0,
    cta: "Set up membership",
  },
];

type StoryAct = {
  id: string;
  number: string;
  title: string;
  tagline: string;
  pct: number;
  color: string;
  lightBg: string;
  locations: string[];
  characters: string[];
  objects: Array<{ name: string; mystery: string }>;
  encounters: number;
  gaps: string[];
  journalPrompts: number;
};

const ACTS_BY_STORY: Record<string, StoryAct[]> = {
  s1: [
    {
      id: "act1", number: "Act I", title: "The Arrival",
      tagline: "A stranger comes to Ashmore. The house has been waiting.",
      pct: 60, color: "#3B82F6", lightBg: "#EFF6FF",
      locations: ["The Glasshouse", "The East Wing"],
      characters: ["Lady Ashmore", "The Groundskeeper"],
      objects: [{ name: "The Obsidian Mirror", mystery: "What the mirrors remember" }],
      encounters: 2, gaps: ["Needs an inciting event", "No motif record yet"], journalPrompts: 4,
    },
    {
      id: "act2", number: "Act II", title: "The Unravelling",
      tagline: "Every room reveals something. Not all of it can be unseen.",
      pct: 15, color: CLAY, lightBg: "#FFF5F2",
      locations: ["The Black Lake", "Ashmore Village"],
      characters: ["Silas Vance"],
      objects: [{ name: "The Wax Seal Collection", mystery: "The Wychcombe Inheritance" }],
      encounters: 0, gaps: ["Lady Ashmore's secret needs a canon record", "No encounter at the Black Lake"], journalPrompts: 1,
    },
    {
      id: "act3", number: "Act III", title: "The Reckoning",
      tagline: "What you choose to do with the truth is your story.",
      pct: 0, color: "#8B5CF6", lightBg: "#F5F3FF",
      locations: [], characters: [], objects: [],
      encounters: 0, gaps: ["No records yet — this act is empty", "Needs a resolution lore thread"], journalPrompts: 0,
    },
  ],
  s2: [],
  s3: [],
};

const ACTS_DATA: StoryAct[] = ACTS_BY_STORY["s1"];

const MYSTERY_THREADS = [
  { name: "What the mirrors remember", from: "The Obsidian Mirror", chain: ["The Glasshouse", "Lady Ashmore", "The Reckoning?"] },
  { name: "The Wychcombe Inheritance", from: "The Wax Seal Collection", chain: ["Lady Ashmore's study", "Ashmore Village", "?"] },
];

// ── Story Picker ────────────────────────────────────────────────────────────
function StoryPicker({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = STORIES.find(s => s.id === active)!;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium"
        style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}`, color: INK }}>
        <span className="text-xs font-bold uppercase tracking-wide" style={{ color: CLAY }}>Story</span>
        {current.title}
        <ChevronDown size={13} style={{ color: "#9CA3AF" }} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 rounded-xl overflow-hidden shadow-lg z-10"
          style={{ background: "white", border: `1px solid ${WARM_BORDER}`, minWidth: 260 }}>
          {STORIES.map(s => (
            <button key={s.id}
              onClick={() => { onChange(s.id); setOpen(false); }}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50"
              style={{ borderBottom: `1px solid ${WARM_BORDER}` }}>
              <div>
                <div className="text-sm font-medium" style={{ color: INK }}>{s.title}</div>
                <div className="text-[10px] capitalize" style={{ color: "#9CA3AF" }}>
                  {s.status} · {s.acts} acts · {s.pct}% built
                </div>
              </div>
              {s.id === active && <span className="ml-auto text-[10px]" style={{ color: CLAY }}>✓</span>}
            </button>
          ))}
          <button className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm"
            style={{ color: CLAY }}>
            <Plus size={12} /> New story in Wychcombe
          </button>
        </div>
      )}
    </div>
  );
}

// ── Act Column ─────────────────────────────────────────────────────────────
function ActColumn({ act }: { act: typeof ACTS_DATA[0] }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 border-r" style={{ borderColor: WARM_BORDER, background: WARM_WHITE }}>
      <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: WARM_BORDER }}>
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: act.color }}>{act.number}</span>
          {act.pct > 0 && (
            <span className="text-[10px] font-medium rounded-full px-2 py-0.5"
              style={{ background: act.lightBg, color: act.color }}>{act.pct}% built</span>
          )}
        </div>
        <h2 className="font-serif font-semibold mb-0.5"
          style={{ fontFamily: "'Playfair Display', serif", color: INK, fontSize: 16 }}>
          {act.title}
        </h2>
        <p className="text-[11px] italic leading-snug" style={{ color: "#6B7280" }}>"{act.tagline}"</p>
        {act.pct > 0 && (
          <div className="mt-2.5 rounded-full overflow-hidden" style={{ height: 3, background: WARM_BORDER }}>
            <div className="h-full rounded-full" style={{ width: `${act.pct}%`, background: act.color }} />
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
        <Section label="Locations" dot="#3B82F6" items={act.locations} addLabel="Add location" color={act.color} />
        <Section label="Characters" dot="#8B5CF6" items={act.characters} addLabel="Add character" color={act.color} />
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#9CA3AF" }}>Objects of Mystery</div>
          {act.objects.length === 0
            ? <div className="text-[11px] italic" style={{ color: "#9CA3AF" }}>None yet</div>
            : act.objects.map(o => (
              <div key={o.name} className="rounded-lg px-2.5 py-2 mb-1" style={{ background: AMBER_BG, border: `1px solid ${AMBER}30` }}>
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
        {act.encounters === 0
          ? <div className="text-[11px] italic" style={{ color: "#9CA3AF" }}>No encounters yet <button className="not-italic ml-1" style={{ color: act.color }}>+ Write one</button></div>
          : <div className="flex items-center gap-1.5"><Zap size={10} style={{ color: GREEN }} /><span className="text-[11px]" style={{ color: GREEN }}>{act.encounters} encounter{act.encounters > 1 ? "s" : ""}</span></div>
        }
        {act.gaps.length > 0 && (
          <div className="rounded-lg p-2.5" style={{ background: act.pct === 0 ? "#F5F3FF" : PARCHMENT, border: `1px solid ${WARM_BORDER}` }}>
            <div className="flex items-center gap-1 mb-1.5">
              <Sparkles size={9} style={{ color: CLAY }} />
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: CLAY }}>Gaps</span>
            </div>
            {act.gaps.map(g => (
              <div key={g} className="flex items-start gap-1.5 mb-1">
                <span style={{ color: CLAY, fontSize: 10 }}>·</span>
                <p className="text-[10px] leading-snug" style={{ color: "#6B7280" }}>{g}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="px-5 py-2.5 border-t flex items-center justify-between" style={{ borderColor: WARM_BORDER }}>
        <span className="text-[10px]" style={{ color: "#9CA3AF" }}>{act.journalPrompts} journal prompts</span>
        <button className="text-[11px] font-medium flex items-center gap-1" style={{ color: act.color }}>
          Open Act <ChevronRight size={10} />
        </button>
      </div>
    </div>
  );
}

function Section({ label, dot, items, addLabel, color }: {
  label: string; dot: string; items: string[]; addLabel: string; color: string;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>{label}</div>
      {items.length === 0
        ? <div className="text-[11px] italic" style={{ color: "#9CA3AF" }}>None yet</div>
        : items.map(item => (
          <div key={item} className="flex items-center gap-1.5 py-0.5">
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: dot, flexShrink: 0 }} />
            <span className="text-xs" style={{ color: INK }}>{item}</span>
          </div>
        ))}
      <button className="flex items-center gap-1 text-[11px] mt-1" style={{ color }}><Plus size={9} />{addLabel}</button>
    </div>
  );
}

// ── Products section ────────────────────────────────────────────────────────
function ProductsSection() {
  return (
    <div className="border-t" style={{ background: WARM_BG, borderColor: WARM_BORDER }}>
      <div className="px-8 py-4 flex items-center justify-between border-b" style={{ borderColor: WARM_BORDER }}>
        <div className="flex items-center gap-2">
          <Package size={14} style={{ color: CLAY }} />
          <span className="text-sm font-semibold" style={{ color: INK }}>Products from Wychcombe</span>
          <span className="text-xs" style={{ color: "#9CA3AF" }}>— one world, many outputs</span>
        </div>
        <button className="flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1"
          style={{ color: CLAY, border: `1px solid ${CLAY}` }}>
          <Plus size={10} /> Add product type
        </button>
      </div>
      <div className="px-8 py-4 flex gap-3 overflow-x-auto">
        {PRODUCTS.map(p => {
          const Icon = p.icon;
          return (
            <div key={p.id} className="rounded-xl p-4 flex-none"
              style={{ width: 240, background: "white", border: `1px solid ${WARM_BORDER}` }}>
              <div className="flex items-start justify-between mb-2">
                <div className="rounded-lg p-2" style={{ background: PARCHMENT }}>
                  <Icon size={14} style={{ color: CLAY }} />
                </div>
                <span className="rounded-full text-[9px] font-semibold px-2 py-0.5 capitalize"
                  style={{ background: p.statusBg, color: p.statusColor }}>
                  {p.status}
                </span>
              </div>
              <div className="text-sm font-semibold mb-0.5" style={{ color: INK }}>{p.label}</div>
              <div className="text-[11px] leading-snug mb-3" style={{ color: "#9CA3AF" }}>{p.description}</div>
              {p.pct > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px]" style={{ color: "#9CA3AF" }}>Built</span>
                    <span className="text-[10px] font-bold" style={{ color: CLAY }}>{p.pct}%</span>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 3, background: WARM_BORDER }}>
                    <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: CLAY }} />
                  </div>
                </div>
              )}
              {p.story !== "Any story" && (
                <div className="text-[10px] mb-3 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
                  <BookOpen size={9} />
                  <span>{p.story}</span>
                </div>
              )}
              <button className="w-full rounded-lg text-xs font-medium py-1.5"
                style={p.pct > 0
                  ? { background: INK, color: "white" }
                  : { background: PARCHMENT, color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
                {p.cta}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mystery Threads ────────────────────────────────────────────────────────
function MysteryThreads() {
  return (
    <div className="px-8 py-4 border-t flex items-start gap-4" style={{ background: PARCHMENT, borderColor: WARM_BORDER }}>
      <div className="flex items-center gap-1.5 flex-none pt-0.5">
        <span style={{ color: AMBER, fontSize: 12 }}>◆</span>
        <span className="text-xs font-semibold" style={{ color: INK }}>Open threads</span>
      </div>
      <div className="flex gap-3 flex-1 overflow-x-auto">
        {MYSTERY_THREADS.map(t => (
          <div key={t.name} className="rounded-xl px-3 py-2.5 flex-none"
            style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-medium text-xs" style={{ color: INK }}>{t.name}</span>
              <span className="rounded-full text-[9px] font-bold px-1.5 py-0.5"
                style={{ background: AMBER_BG, color: "#92400E" }}>open</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {t.chain.map((step, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="rounded-full text-[10px] px-2 py-0.5"
                    style={{ background: PARCHMENT, color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
                    {step}
                  </span>
                  {i < t.chain.length - 1 && <Link2 size={7} style={{ color: "#9CA3AF" }} />}
                </span>
              ))}
            </div>
          </div>
        ))}
        <button className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs flex-none"
          style={{ border: `1px dashed ${WARM_BORDER}`, color: "#9CA3AF" }}>
          <Plus size={11} /> Add thread
        </button>
      </div>
    </div>
  );
}

// ── Narrative summary ──────────────────────────────────────────────────────
function NarrativeSummary({ storyId }: { storyId: string }) {
  const story = STORIES.find(s => s.id === storyId)!;
  const summaries: Record<string, string> = {
    s1: "A stranger inherits Ashmore estate. Every room hides something. The mirrors never show what's really there.",
    s2: "A prequel — the Groundskeeper arrived long before any of them. He knows what's buried.",
    s3: "An epistolary story: the player finds a cache of letters written to people who died before they could be delivered.",
  };
  return (
    <p className="text-sm italic leading-relaxed cursor-text"
      style={{ fontFamily: "'Spectral', Georgia, serif", color: "#374151", maxWidth: 600 }}>
      {summaries[storyId]}
    </p>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────
export function StoryOverview() {
  const [activeStory, setActiveStory] = useState("s1");
  const acts = ACTS_BY_STORY[activeStory] ?? [];

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden"
      style={{ background: WARM_BG, color: INK, fontFamily: "'Instrument Sans', sans-serif" }}>

      {/* TOP BAR */}
      <div className="flex-none flex items-center justify-between px-5 border-b"
        style={{ height: 48, background: WARM_WHITE, borderColor: WARM_BORDER }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold" style={{ color: "#9CA3AF" }}>Wychcombe</span>
          <span style={{ color: WARM_BORDER }}>/</span>
          <StoryPicker active={activeStory} onChange={setActiveStory} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "#9CA3AF" }}>13 canon records · 2 open threads</span>
          <div className="w-px h-4 mx-1" style={{ background: WARM_BORDER }} />
          <button className="flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5"
            style={{ background: INK, color: "white" }}>
            <Sparkles size={11} /> Suggest Act III
          </button>
          <button className="p-1.5" style={{ color: "#9CA3AF" }}>
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>

      {/* STORY SUMMARY */}
      <div className="flex-none px-8 py-3 border-b flex items-center gap-4"
        style={{ background: WARM_WHITE, borderColor: WARM_BORDER }}>
        <NarrativeSummary storyId={activeStory} />
        <button className="ml-auto flex-none text-xs rounded-lg px-3 py-1.5"
          style={{ border: `1px solid ${WARM_BORDER}`, color: "#6B7280" }}>
          Export Outline
        </button>
      </div>

      {/* ACTS — middle section */}
      {acts.length > 0 ? (
        <div className="flex flex-1 min-h-0">
          {acts.map(act => <ActColumn key={act.id} act={act} />)}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-4"
          style={{ background: WARM_WHITE }}>
          <p className="text-sm italic" style={{ color: "#9CA3AF" }}>This story has no acts yet.</p>
          <button className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white"
            style={{ background: CLAY }}>
            <Plus size={14} /> Add Act I
          </button>
        </div>
      )}

      {/* MYSTERY THREADS */}
      {acts.length > 0 && <MysteryThreads />}

      {/* PRODUCTS */}
      <ProductsSection />
    </div>
  );
}
