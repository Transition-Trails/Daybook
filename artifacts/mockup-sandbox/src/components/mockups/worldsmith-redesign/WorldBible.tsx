import { useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, Check, Plus, X, Link2, BookOpen, ChevronRight, Zap } from "lucide-react";

// ── Tokens ─────────────────────────────────────────────────────────────────
const INK         = "#1B2A4A";
const CLAY        = "#C87560";
const PARCHMENT   = "#EFE9E1";
const WARM_WHITE  = "#FDFAF7";
const WARM_BG     = "#F4EFE8";
const WARM_BORDER = "#DDD4C4";
const AMBER       = "#D97706";

// ── Bible fields ────────────────────────────────────────────────────────────
interface BibleState {
  worldName: string;
  worldSummary: string;
  visualPalette: string;
  proseVoice: string;
  atmosphericNotes: string;
  materialWorld: string;
  worldRules: string[];
}

const INITIAL: BibleState = {
  worldName: "Wychcombe",
  worldSummary: "A Victorian inheritance mystery set on a fog-bound estate. A new arrival, a mirror that lies, letters addressed to the dead.",
  visualPalette: "Fog grey, amber candlelight, deep forest green, aged parchment, rust-spotted iron.",
  proseVoice: "Close third person. Observational, unhurried. Sentences that hold their breath before the reveal.",
  atmosphericNotes: "The house is never quite warm. Sounds carry strangely. The fog arrives every evening without fail.",
  materialWorld: "Victorian England. Iron and wax. Glass that fogs from the inside. Ink that never quite dries.",
  worldRules: [
    "The mirrors in Ashmore show true reflections — but not of the person standing before them.",
    "No one who leaves the estate remembers exactly why they came.",
  ],
};

// ── Prose suggestion ────────────────────────────────────────────────────────
const SUGGESTIONS: Record<keyof Omit<BibleState, "worldName" | "worldRules" | "worldSummary">, string[]> = {
  visualPalette: [
    "Iron-grey fog. Candlelight amber. The green-black of wet fern. Rust on white iron.",
    "Muted greens and tobacco brown. Tarnished silver. Everything touched by moisture.",
  ],
  proseVoice: [
    "Unreliable, anxious. A narrator who notices too much.",
    "Measured and aristocratic — but the sentences crack near the end.",
  ],
  atmosphericNotes: [
    "Time moves differently here. A day can feel like a week.",
    "The smell of wax and old paper everywhere. Someone is always listening.",
  ],
  materialWorld: [
    "Edwardian twilight. Gas lamps. Motor cars that won't start. Houses that breathe.",
    "The last gasp of the Victorian era. The old ways still hold — for now.",
  ],
};

// ── Prose field ──────────────────────────────────────────────────────────────
function ProseField({
  question,
  hint,
  value,
  field,
  onChange,
  suggestions,
}: {
  question: string;
  hint: string;
  value: string;
  field: string;
  onChange: (v: string) => void;
  suggestions?: string[];
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div className="group" style={{ borderBottom: `1px solid ${WARM_BORDER}`, paddingBottom: 24, marginBottom: 24 }}>
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <label className="block font-serif font-semibold mb-0.5"
            style={{ fontFamily: "'Playfair Display', serif", color: INK, fontSize: 15 }}>
            {question}
          </label>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>{hint}</p>
        </div>
        {suggestions && (
          <button
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1 ml-4 flex-none"
            style={{ background: showSuggestions ? PARCHMENT : "transparent", color: CLAY, border: `1px solid ${CLAY}` }}>
            <Sparkles size={10} />
            Ideas
          </button>
        )}
      </div>

      {showSuggestions && suggestions && (
        <div className="mb-3 flex flex-col gap-2">
          {suggestions.map((s, i) => (
            <button key={i} className="text-left rounded-lg px-3 py-2.5 text-sm italic"
              style={{ background: PARCHMENT, color: "#374151", border: `1px solid ${WARM_BORDER}` }}
              onClick={() => { onChange(s); setShowSuggestions(false); }}>
              "{s}"
            </button>
          ))}
        </div>
      )}

      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={`Write in your own words — ${hint.toLowerCase()}`}
        rows={3}
        className="w-full bg-transparent resize-none outline-none leading-relaxed transition-colors"
        style={{
          fontFamily: "'Spectral', Georgia, serif",
          fontSize: 14.5,
          color: "#374151",
          borderBottom: `1.5px solid ${focused ? CLAY : "transparent"}`,
          paddingBottom: 2,
        }}
      />
    </div>
  );
}

// ── World Rules ──────────────────────────────────────────────────────────────
function WorldRulesField({ rules, onChange }: { rules: string[]; onChange: (r: string[]) => void }) {
  const [newRule, setNewRule] = useState("");
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ borderBottom: `1px solid ${WARM_BORDER}`, paddingBottom: 24, marginBottom: 24 }}>
      <div className="flex items-start justify-between mb-1.5">
        <div>
          <label className="block font-serif font-semibold mb-0.5"
            style={{ fontFamily: "'Playfair Display', serif", color: INK, fontSize: 15 }}>
            What are the rules of this world?
          </label>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>
            Laws of nature that differ from ours — things that always hold true in your world
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1 ml-4 flex-none"
          style={{ color: CLAY, border: `1px solid ${CLAY}` }}>
          <Plus size={10} /> Add rule
        </button>
      </div>

      <div className="flex flex-col gap-2 mb-3">
        {rules.map((rule, i) => (
          <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2.5 group/rule"
            style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}` }}>
            <span style={{ color: CLAY, fontSize: 10, marginTop: 3 }}>◆</span>
            <p className="flex-1 text-sm italic leading-snug" style={{ color: "#374151" }}>{rule}</p>
            <button onClick={() => onChange(rules.filter((_, j) => j !== i))}
              className="opacity-0 group-hover/rule:opacity-100 transition-opacity"
              style={{ color: "#9CA3AF" }}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {adding && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={newRule}
            onChange={e => setNewRule(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && newRule.trim()) {
                onChange([...rules, newRule.trim()]);
                setNewRule("");
                setAdding(false);
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="The rule, stated plainly..."
            className="flex-1 text-sm outline-none rounded-lg px-3 py-2"
            style={{ border: `1px solid ${CLAY}`, fontFamily: "'Spectral', Georgia, serif", fontStyle: "italic" }}
          />
          <button
            onClick={() => { if (newRule.trim()) { onChange([...rules, newRule.trim()]); setNewRule(""); setAdding(false); } }}
            className="rounded-lg px-3 py-2" style={{ background: CLAY, color: "white" }}>
            <Check size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Stories section ──────────────────────────────────────────────────────────
const STORIES_DATA = [
  {
    id: "s1",
    title: "The Inheritance Mystery",
    status: "active",
    statusColor: "#16A34A",
    statusBg: "#D1FAE5",
    summary: "A stranger inherits Ashmore estate. The mirrors show the wrong face. Three acts, two open threads.",
    acts: 3,
    pct: 35,
    products: ["Solo RPG Daybook"],
    sharedWith: [] as string[],
  },
  {
    id: "s2",
    title: "The Groundskeeper's War",
    status: "draft",
    statusColor: AMBER,
    statusBg: "#FEF3C7",
    summary: "A prequel. He arrived long before any of them and knows what is buried under the east wing.",
    acts: 0,
    pct: 0,
    products: [],
    sharedWith: ["The Obsidian Mirror"],
  },
  {
    id: "s3",
    title: "Letters from the Dead",
    status: "planned",
    statusColor: "#6B7280",
    statusBg: "#F3F4F6",
    summary: "An epistolary story. The player finds letters addressed to people who died before they were delivered.",
    acts: 0,
    pct: 0,
    products: [],
    sharedWith: ["The Wax Seal Collection"],
  },
];

const STORY_SUGGESTIONS = [
  {
    title: "The Mirror Collector",
    hook: "Someone has been visiting Ashmore for decades, buying up the mirrors one by one. They're almost done.",
    connects: ["The Obsidian Mirror", "Lady Ashmore"],
    thread: "What the mirrors remember",
    why: "You have 2 mirror-related canon records and an open thread with no resolution. A new story could close it.",
  },
  {
    title: "The Fog Season",
    hook: "Once every generation, the fog doesn't lift. The last time it happened, someone disappeared. That was Lady Ashmore's grandmother.",
    connects: ["Fog & Gaslight", "Quiet Dread", "The Black Lake"],
    thread: "New thread",
    why: "Your atmospheric records are strong but no story leans on them yet. This one is built entirely from mood.",
  },
  {
    title: "The Wychcombe Inquest",
    hook: "An investigator arrives. Not the inheritance kind — the criminal kind. Someone finally sent for help.",
    connects: ["The Groundskeeper's War", "The Inheritance Mystery"],
    thread: "The Wychcombe Inheritance",
    why: "Bridges your two existing stories through a shared character and closes the inheritance thread.",
  },
];

const MYSTERY_CONNECTIONS = [
  {
    thread: "What the mirrors remember",
    stories: ["The Inheritance Mystery", "The Groundskeeper's War"],
    suggestion: "The Groundskeeper was there when the mirror arrived. He is the only one who knows what it showed before Lady Ashmore bought it.",
    type: "shared object",
  },
  {
    thread: "The Wychcombe Inheritance",
    stories: ["The Inheritance Mystery", "Letters from the Dead"],
    suggestion: "The unsealed letters are the legal proof of inheritance. The two stories share the same MacGuffin — one story is looking for it, the other found it first.",
    type: "shared stakes",
  },
];

function StoriesSection() {
  const [showSuggestions, setShowSuggestions] = useState(false);

  return (
    <div style={{ borderTop: `2px solid ${WARM_BORDER}`, paddingTop: 28, marginTop: 8 }}>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="font-serif font-semibold mb-1"
            style={{ fontFamily: "'Playfair Display', serif", color: INK, fontSize: 18 }}>
            Stories in this world
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>
            Each story is a separate narrative arc. All draw from the same canon.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSuggestions(s => !s)}
            className="flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5"
            style={{
              background: showSuggestions ? INK : "transparent",
              color: showSuggestions ? "white" : CLAY,
              border: `1px solid ${showSuggestions ? INK : CLAY}`,
            }}>
            <Sparkles size={10} />
            {showSuggestions ? "Hide ideas" : "Suggest storylines"}
          </button>
          <button className="flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5"
            style={{ color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
            <Plus size={10} /> New story
          </button>
        </div>
      </div>

      {/* Existing stories */}
      <div className="flex flex-col gap-3 mb-6">
        {STORIES_DATA.map(s => (
          <div key={s.id} className="rounded-xl p-4"
            style={{ background: s.status === "active" ? "white" : PARCHMENT, border: `1px solid ${WARM_BORDER}` }}>
            <div className="flex items-start justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <BookOpen size={13} style={{ color: s.status === "active" ? CLAY : "#9CA3AF" }} />
                <span className="font-semibold text-sm" style={{ color: INK }}>{s.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full text-[9px] font-bold px-2 py-0.5 capitalize"
                  style={{ background: s.statusBg, color: s.statusColor }}>{s.status}</span>
                <button className="text-xs flex items-center gap-0.5" style={{ color: CLAY }}>
                  Open <ChevronRight size={11} />
                </button>
              </div>
            </div>

            <p className="text-xs italic leading-snug mb-2.5"
              style={{ color: "#6B7280", fontFamily: "'Spectral', Georgia, serif" }}>
              {s.summary}
            </p>

            <div className="flex items-center gap-4">
              <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
                {s.acts > 0 ? `${s.acts} acts · ${s.pct}% built` : "No acts yet"}
              </span>
              {s.products.length > 0 && (
                <div className="flex gap-1">
                  {s.products.map(p => (
                    <span key={p} className="rounded-full text-[9px] px-2 py-0.5"
                      style={{ background: "#E0E7FF", color: "#3730A3" }}>{p}</span>
                  ))}
                </div>
              )}
              {s.sharedWith.length > 0 && (
                <div className="flex items-center gap-1">
                  <Link2 size={9} style={{ color: AMBER }} />
                  <span className="text-[10px] italic" style={{ color: AMBER }}>
                    shares: {s.sharedWith.join(", ")}
                  </span>
                </div>
              )}
            </div>

            {s.pct > 0 && (
              <div className="mt-2.5 rounded-full overflow-hidden" style={{ height: 2, background: WARM_BORDER }}>
                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: CLAY }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mystery connections */}
      <div className="rounded-xl overflow-hidden mb-6" style={{ border: `1px solid ${WARM_BORDER}` }}>
        <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ background: "#FFF8ED", borderColor: WARM_BORDER }}>
          <span style={{ color: AMBER, fontSize: 12 }}>◆</span>
          <span className="text-sm font-semibold" style={{ color: INK }}>How your stories connect through mystery</span>
        </div>
        <div className="divide-y" style={{ background: "white" }}>
          {MYSTERY_CONNECTIONS.map((mc, i) => (
            <div key={i} className="px-4 py-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={11} style={{ color: AMBER }} />
                <span className="text-xs font-semibold" style={{ color: INK }}>{mc.thread}</span>
                <span className="rounded-full text-[9px] px-2 py-0.5 ml-auto"
                  style={{ background: PARCHMENT, color: "#6B7280" }}>{mc.type}</span>
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {mc.stories.map((st, j) => (
                  <span key={j} className="flex items-center gap-1">
                    <span className="rounded-full text-[10px] px-2.5 py-0.5"
                      style={{ background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                      {st}
                    </span>
                    {j < mc.stories.length - 1 && (
                      <Link2 size={9} style={{ color: "#9CA3AF" }} />
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs italic leading-snug" style={{ color: "#374151", fontFamily: "'Spectral', Georgia, serif" }}>
                "{mc.suggestion}"
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* AI story suggestions */}
      {showSuggestions && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={12} style={{ color: CLAY }} />
            <span className="text-sm font-semibold" style={{ color: INK }}>Storyline suggestions</span>
            <span className="text-xs" style={{ color: "#9CA3AF" }}>— based on your canon records and open threads</span>
          </div>
          <div className="flex flex-col gap-3">
            {STORY_SUGGESTIONS.map((sg, i) => (
              <div key={i} className="rounded-xl p-4"
                style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}`, borderLeft: `3px solid ${CLAY}` }}>
                <div className="flex items-start justify-between mb-1.5">
                  <span className="font-serif font-semibold text-sm" style={{ fontFamily: "'Playfair Display', serif", color: INK }}>
                    {sg.title}
                  </span>
                  <button className="flex-none ml-3 text-[11px] font-medium rounded-full px-2.5 py-1"
                    style={{ background: CLAY, color: "white" }}>
                    Add story
                  </button>
                </div>

                <p className="text-xs italic leading-snug mb-2.5"
                  style={{ color: "#374151", fontFamily: "'Spectral', Georgia, serif" }}>
                  "{sg.hook}"
                </p>

                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Uses:</span>
                    {sg.connects.map(c => (
                      <span key={c} className="rounded-full text-[9px] px-1.5 py-0.5"
                        style={{ background: "white", border: `1px solid ${WARM_BORDER}`, color: "#6B7280" }}>
                        {c}
                      </span>
                    ))}
                  </div>
                  {sg.thread !== "New thread" && (
                    <div className="flex items-center gap-1">
                      <span style={{ color: AMBER, fontSize: 9 }}>◆</span>
                      <span className="text-[10px] italic" style={{ color: AMBER }}>{sg.thread}</span>
                    </div>
                  )}
                </div>

                <p className="mt-2 text-[10px] leading-snug" style={{ color: "#9CA3AF" }}>
                  ↳ {sg.why}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Connections (collapsed) ─────────────────────────────────────────────────
function ConnectionsPanel({ open, toggle }: { open: boolean; toggle: () => void }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${WARM_BORDER}` }}>
      <button className="w-full flex items-center justify-between px-4 py-3"
        style={{ background: open ? PARCHMENT : "white" }}
        onClick={toggle}>
        <div className="flex items-center gap-2">
          <Link2 size={13} style={{ color: "#9CA3AF" }} />
          <span className="text-sm font-medium" style={{ color: "#6B7280" }}>Data connections</span>
          <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: "#D1FAE5", color: "#065F46" }}>
            2 connected
          </span>
        </div>
        {open ? <ChevronUp size={14} style={{ color: "#9CA3AF" }} /> : <ChevronDown size={14} style={{ color: "#9CA3AF" }} />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3" style={{ background: "white" }}>
          {[
            { label: "Notion Canon DB", id: "a1b2c3d4e5f6...", status: "ok" },
            { label: "Notion Production DB", id: "f6e5d4c3b2...", status: "ok" },
            { label: "Google Drive Folder", id: "—", status: "missing" },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-3">
              <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                background: c.status === "ok" ? "#22C55E" : "#F59E0B" }} />
              <span className="text-xs font-medium flex-1" style={{ color: INK }}>{c.label}</span>
              <span className="text-[10px] font-mono" style={{ color: "#9CA3AF" }}>{c.id}</span>
              <button className="text-[11px]" style={{ color: CLAY }}>Edit</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Completeness score ───────────────────────────────────────────────────────
function CompletenessBar({ bible }: { bible: BibleState }) {
  const fields = [bible.visualPalette, bible.proseVoice, bible.atmosphericNotes, bible.materialWorld];
  const filled = fields.filter(f => f.trim().length > 0).length + (bible.worldRules.length > 0 ? 1 : 0);
  const total = fields.length + 1;
  const pct = Math.round((filled / total) * 100);
  return (
    <div className="px-8 py-4 border-b flex items-center gap-4" style={{ background: WARM_WHITE, borderColor: WARM_BORDER }}>
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-xs font-medium" style={{ color: INK }}>World Bible completeness</span>
          <span className="text-xs font-bold" style={{ color: CLAY }}>{pct}%</span>
        </div>
        <div className="rounded-full overflow-hidden" style={{ height: 4, background: WARM_BORDER }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: CLAY }} />
        </div>
      </div>
      <p className="text-xs flex-none" style={{ color: "#9CA3AF" }}>
        {filled}/{total} sections complete · {total - filled === 0 ? "Ready to generate" : `${total - filled} to go`}
      </p>
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ bible }: { bible: BibleState }) {
  return (
    <div className="flex-none flex flex-col gap-5 overflow-y-auto p-5"
      style={{ width: 260, background: PARCHMENT, borderLeft: `1px solid ${WARM_BORDER}` }}>
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: "#9CA3AF" }}>
          World at a glance
        </div>
        <p className="text-xs italic leading-relaxed" style={{ color: "#374151", fontFamily: "'Spectral', Georgia, serif" }}>
          {bible.worldSummary || "No summary yet — write it in the main panel."}
        </p>
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* Quick stats */}
      <div className="flex flex-col gap-2">
        {[
          { label: "Canon records", value: "13" },
          { label: "Acts", value: "3" },
          { label: "Open threads", value: "2" },
          { label: "Encounters written", value: "2" },
        ].map(s => (
          <div key={s.label} className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "#6B7280" }}>{s.label}</span>
            <span className="text-xs font-semibold" style={{ color: INK }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* AI suggestions */}
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles size={12} style={{ color: CLAY }} />
          <span className="text-xs font-semibold" style={{ color: INK }}>Bible gaps</span>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { title: "No prose voice set", body: "How your narrator speaks shapes every image prompt.", field: "proseVoice" },
            { title: "Drive folder not linked", body: "Generated assets have nowhere to save.", field: "drive" },
          ].map(g => (
            <div key={g.title} className="rounded-lg p-3" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
              <div className="text-xs font-semibold mb-1" style={{ color: INK }}>{g.title}</div>
              <p className="text-[11px] leading-snug" style={{ color: "#6B7280" }}>{g.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* Image style preview */}
      <div>
        <div className="text-xs font-semibold mb-2" style={{ color: INK }}>How this guides prompts</div>
        <div className="rounded-lg p-3" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
          <p className="text-[11px] italic leading-snug" style={{ color: "#6B7280", fontFamily: "'Spectral', Georgia, serif" }}>
            "…fog grey, amber light, Victorian Gothic, prose-illustration style, close and observational…"
          </p>
          <p className="text-[10px] mt-1.5" style={{ color: "#9CA3AF" }}>auto-injected from your World Bible</p>
        </div>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function WorldBible() {
  const [bible, setBible] = useState<BibleState>(INITIAL);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = (field: keyof BibleState) => (v: string) =>
    setBible(b => ({ ...b, [field]: v }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden"
      style={{ background: WARM_WHITE, color: INK, fontFamily: "'Instrument Sans', sans-serif" }}>

      {/* TOP BAR */}
      <div className="flex-none flex items-center justify-between px-5 border-b"
        style={{ height: 48, background: WARM_WHITE, borderColor: WARM_BORDER }}>
        <div className="text-sm">
          <span style={{ color: "#9CA3AF" }}>Wychcombe / </span>
          <span style={{ color: INK, fontWeight: 600 }}>World Bible</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-xs font-medium rounded-lg px-3 py-1.5"
            style={{ color: "#9CA3AF", border: `1px solid ${WARM_BORDER}` }}>
            Discard
          </button>
          <button onClick={handleSave}
            className="text-xs font-semibold rounded-lg px-4 py-1.5 flex items-center gap-1.5 transition-colors"
            style={{ background: saved ? "#16A34A" : INK, color: "white" }}>
            {saved ? <><Check size={12} /> Saved</> : "Save Bible"}
          </button>
        </div>
      </div>

      {/* COMPLETENESS */}
      <CompletenessBar bible={bible} />

      {/* BODY */}
      <div className="flex flex-1 min-h-0">

        {/* MAIN SCROLL */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div style={{ maxWidth: 620 }}>

            {/* World name + summary */}
            <div className="mb-8">
              <input
                value={bible.worldName}
                onChange={e => setBible(b => ({ ...b, worldName: e.target.value }))}
                className="bg-transparent outline-none w-full font-serif font-semibold mb-2"
                style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: INK, borderBottom: "1.5px solid transparent" }}
              />
              <textarea
                value={bible.worldSummary}
                onChange={e => setBible(b => ({ ...b, worldSummary: e.target.value }))}
                placeholder="One or two sentences — the seed of your world"
                rows={2}
                className="w-full bg-transparent resize-none outline-none leading-relaxed"
                style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 15, color: "#374151", borderBottom: `1px solid ${WARM_BORDER}` }}
              />
            </div>

            <ProseField
              question="What does this world look like?"
              hint="Colour palette, light quality, visual references that always feel right"
              value={bible.visualPalette}
              field="visualPalette"
              onChange={update("visualPalette")}
              suggestions={SUGGESTIONS.visualPalette}
            />

            <ProseField
              question="How does your narrator speak?"
              hint="POV, sentence rhythm, what they notice and what they leave unsaid"
              value={bible.proseVoice}
              field="proseVoice"
              onChange={update("proseVoice")}
              suggestions={SUGGESTIONS.proseVoice}
            />

            <ProseField
              question="What does the air feel like?"
              hint="Sensory atmosphere — temperature, sound, smell, what the body knows"
              value={bible.atmosphericNotes}
              field="atmosphericNotes"
              onChange={update("atmosphericNotes")}
              suggestions={SUGGESTIONS.atmosphericNotes}
            />

            <ProseField
              question="What is this world made of?"
              hint="Era, materials, technology, the texture of everyday life here"
              value={bible.materialWorld}
              field="materialWorld"
              onChange={update("materialWorld")}
              suggestions={SUGGESTIONS.materialWorld}
            />

            <WorldRulesField
              rules={bible.worldRules}
              onChange={r => setBible(b => ({ ...b, worldRules: r }))}
            />

            {/* Stories in this world */}
            <StoriesSection />

            {/* Data connections — collapsed by default */}
            <ConnectionsPanel
              open={connectionsOpen}
              toggle={() => setConnectionsOpen(o => !o)}
            />
          </div>
        </div>

        <Sidebar bible={bible} />
      </div>
    </div>
  );
}
