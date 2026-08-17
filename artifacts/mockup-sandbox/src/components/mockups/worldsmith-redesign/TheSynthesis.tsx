import { useState } from "react";
import { MoreHorizontal, Sparkles, ChevronDown, Plus, Eye, Link2 } from "lucide-react";

// ── Tokens ────────────────────────────────────────────────────────────────────
const INK          = "#1B2A4A";
const CLAY         = "#C87560";
const PARCHMENT    = "#EFE9E1";
const WARM_WHITE   = "#FDFAF7";
const WARM_BG      = "#F4EFE8";
const WARM_BORDER  = "#DDD4C4";

// ── Data ─────────────────────────────────────────────────────────────────────
const RECORDS = [
  { type: "character", dot: "#8B5CF6",  name: "Lady Ashmore"              },
  { type: "character", dot: "#8B5CF6",  name: "The Groundskeeper"         },
  { type: "character", dot: "#8B5CF6",  name: "Silas Vance"               },
  { type: "location",  dot: "#3B82F6",  name: "The Glasshouse", active: true },
  { type: "location",  dot: "#3B82F6",  name: "The East Wing"             },
  { type: "location",  dot: "#3B82F6",  name: "The Black Lake"            },
  { type: "location",  dot: "#3B82F6",  name: "Ashmore Village"           },
  { type: "object",    dot: "#F59E0B",  name: "The Obsidian Mirror",  mystery: "What the mirrors remember" },
  { type: "object",    dot: "#F59E0B",  name: "The Wax Seal Collection", mystery: "The Wychcombe Inheritance" },
  { type: "atmosphere",dot: CLAY,       name: "Fog & Gaslight"            },
  { type: "atmosphere",dot: CLAY,       name: "Quiet Dread"               },
  { type: "lore",      dot: "#10B981",  name: "What the mirrors remember" },
  { type: "lore",      dot: "#10B981",  name: "The Wychcombe Inheritance" },
];

const IMAGE_IDEAS = [
  {
    prompt: "A crumbling Victorian glasshouse at dusk, iron frames tangled with wisteria, warm lantern light glowing through broken panes, fog drifting along stone floor, moody and atmospheric",
    tags:   ["The Glasshouse", "Fog & Gaslight"],
    object: null,
  },
  {
    prompt: "Lady Ashmore standing in the glasshouse doorway at night, silhouetted against gaslight, looking into fog-covered gardens, Gothic Victorian illustration, quiet and unsettling",
    tags:   ["The Glasshouse", "Lady Ashmore"],
    object: null,
  },
  {
    prompt: "Interior of an abandoned conservatory, overgrown with ferns and moss, shafts of pale light through ironwork ceiling, dust motes suspended, Pre-Raphaelite oil painting style",
    tags:   ["The Glasshouse", "Quiet Dread"],
    object: null,
  },
  {
    // The "object brings mystery" card — this is the new concept
    prompt: "The Obsidian Mirror propped against a glasshouse wall, reflecting a face that does not match Lady Ashmore standing before it, gaslight catching the glass, fog beyond the broken panes, Victorian Gothic horror, cinematic",
    tags:   ["The Glasshouse", "Lady Ashmore"],
    object: { name: "The Obsidian Mirror", mystery: "What the mirrors remember" },
  },
];

// Scene builder state (static for mockup — shows selected state)
const SCENE_PLACE      = "The Glasshouse";
const SCENE_CHARACTERS = ["Lady Ashmore"];
const SCENE_OBJECT     = { name: "The Obsidian Mirror", mystery: "What the mirrors remember", lore: "A face in the glass that does not match" };
const SCENE_MOOD       = "Mysterious & Dark";

const ASSEMBLED_PROMPT =
  `Lady Ashmore standing before the Obsidian Mirror inside The Glasshouse at night — the reflection shows a face that is not hers. Iron frames tangled with wisteria, fog pressing through broken panes, gaslight flickering. Victorian Gothic mood, mysterious and atmospheric.`;

// ── Left Rail ────────────────────────────────────────────────────────────────
function LeftRail() {
  const groups: { label: string; type: string }[] = [
    { label: "Characters",  type: "character"  },
    { label: "Locations",   type: "location"   },
    { label: "Objects",     type: "object"     },
    { label: "Atmosphere",  type: "atmosphere" },
    { label: "Lore",        type: "lore"       },
  ];
  return (
    <div className="flex flex-col flex-none overflow-hidden border-r" style={{ width: 220, background: WARM_BG, borderColor: WARM_BORDER }}>
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="px-4 pt-4 pb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Records · 13
        </div>
        {groups.map(g => {
          const rows = RECORDS.filter(r => r.type === g.type);
          return (
            <div key={g.type}>
              <div className="px-4 mt-3 mb-1" style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {g.label}
              </div>
              {rows.map(r => (
                <div
                  key={r.name}
                  className="flex items-center gap-2 px-4 cursor-pointer transition-colors"
                  style={{
                    paddingTop: 7, paddingBottom: 7,
                    borderLeft: r.active ? `2px solid ${CLAY}` : "2px solid transparent",
                    background: r.active ? "rgba(255,255,255,0.6)" : "transparent",
                    fontWeight: r.active ? 600 : 400,
                    color: r.active ? INK : "#6B7280",
                    fontSize: 13,
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.dot, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }} className="truncate">{r.name}</span>
                  {/* Mystery thread indicator on objects */}
                  {"mystery" in r && r.mystery && (
                    <span title={r.mystery} style={{ color: "#F59E0B", fontSize: 9, flexShrink: 0 }}>◆</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <button
        className="flex-none w-full py-3 text-center text-sm font-medium transition-colors"
        style={{ borderTop: `1px solid ${WARM_BORDER}`, color: CLAY }}
      >
        + New Record
      </button>
    </div>
  );
}

// ── Prompt Card ───────────────────────────────────────────────────────────────
function PromptCard({ idea }: { idea: typeof IMAGE_IDEAS[number] }) {
  const isMystery = !!idea.object;
  return (
    <div
      className="rounded-xl shadow-sm p-5"
      style={{
        background: isMystery ? "#F5EEE6" : PARCHMENT,
        borderLeft: `4px solid ${isMystery ? "#F59E0B" : CLAY}`,
        border: isMystery ? `1px solid #F59E0B40` : undefined,
      }}
    >
      {isMystery && (
        <div className="flex items-center gap-1.5 mb-3">
          <span style={{ fontSize: 10, color: "#F59E0B", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            ◆ Object &amp; Mystery
          </span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: "#FEF3C7", color: "#92400E" }}>
            {idea.object!.name}
          </span>
        </div>
      )}
      <p className="font-serif italic leading-relaxed" style={{ fontSize: 14, color: INK }}>
        "{idea.prompt}"
      </p>
      <div className="flex justify-between items-center mt-4">
        <div className="flex flex-wrap gap-1.5">
          {idea.tags.map(t => (
            <span key={t} style={{ fontSize: 10, color: "#9CA3AF" }}>{t}</span>
          ))}
          {idea.tags.length > 1 && <span style={{ fontSize: 10, color: "#9CA3AF" }}>·</span>}
          {isMystery && (
            <span style={{ fontSize: 10, color: "#B45309", fontStyle: "italic" }}>"{idea.object!.mystery}"</span>
          )}
        </div>
        <button
          className="rounded-full text-white text-xs font-medium flex items-center gap-1 transition-colors"
          style={{ background: isMystery ? "#D97706" : CLAY, padding: "6px 14px", whiteSpace: "nowrap" }}
        >
          Use this →
        </button>
      </div>
    </div>
  );
}

// ── Scene Builder (Tab 2) ────────────────────────────────────────────────────
function SceneBuilder() {
  const moods = ["Mysterious & Dark", "Quiet & Beautiful", "Eerie & Unsettling"];
  return (
    <div>
      <div className="text-xs mb-5" style={{ color: "#9CA3AF" }}>
        Pick what's in your scene — the image prompt builds itself
      </div>

      {/* Place */}
      <div className="mb-5">
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Place</div>
        <div className="flex flex-wrap gap-2">
          {["The Glasshouse", "The East Wing", "The Black Lake"].map(p => (
            <button
              key={p}
              className="rounded-full text-xs font-medium px-3 py-1.5 transition-colors"
              style={p === SCENE_PLACE
                ? { background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #BFDBFE" }
                : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}
            >
              {p === SCENE_PLACE && "✓ "}{p}
            </button>
          ))}
        </div>
      </div>

      {/* Who's there */}
      <div className="mb-5">
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Who's there</div>
        <div className="flex flex-wrap gap-2">
          {["Lady Ashmore", "The Groundskeeper", "No one"].map(c => (
            <button
              key={c}
              className="rounded-full text-xs font-medium px-3 py-1.5 transition-colors"
              style={SCENE_CHARACTERS.includes(c)
                ? { background: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE" }
                : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}
            >
              {SCENE_CHARACTERS.includes(c) && "✓ "}{c}
            </button>
          ))}
        </div>
      </div>

      {/* Object of mystery — the key new concept */}
      <div className="mb-5">
        <div className="mb-1" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Object of mystery</div>
        <div className="mb-2 text-xs" style={{ color: "#9CA3AF" }}>Objects carry their own story — they change what the image means</div>
        <div className="flex flex-col gap-2">
          {[
            { name: "The Obsidian Mirror", mystery: "A face in the glass that does not match", lore: "What the mirrors remember" },
            { name: "The Wax Seal Collection", mystery: "Letters never sent — or never received?", lore: "The Wychcombe Inheritance" },
            { name: "Nothing — just the scene", mystery: "", lore: "" },
          ].map(obj => {
            const isSelected = obj.name === SCENE_OBJECT.name;
            return (
              <button
                key={obj.name}
                className="rounded-xl p-3 text-left transition-colors"
                style={isSelected
                  ? { background: "#FEF3C7", border: "1px solid #F59E0B" }
                  : { background: "white", border: `1px solid ${WARM_BORDER}` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {obj.lore && <span style={{ color: "#F59E0B", fontSize: 10 }}>◆</span>}
                  <span className="text-sm font-medium" style={{ color: isSelected ? "#92400E" : INK }}>
                    {isSelected && "✓ "}{obj.name}
                  </span>
                </div>
                {obj.mystery && (
                  <p className="text-xs italic" style={{ color: isSelected ? "#B45309" : "#9CA3AF" }}>
                    "{obj.mystery}"
                  </p>
                )}
                {obj.lore && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <Link2 style={{ width: 9, height: 9, color: "#D97706" }} />
                    <span style={{ fontSize: 10, color: "#D97706" }}>leads to: {obj.lore}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mood */}
      <div className="mb-6">
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Mood</div>
        <div className="flex gap-2 flex-wrap">
          {moods.map(m => (
            <button
              key={m}
              className="rounded-lg text-xs font-medium px-3 py-2 transition-colors"
              style={m === SCENE_MOOD
                ? { background: INK, color: "white" }
                : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}
            >
              {m === SCENE_MOOD && "✓ "}{m}
            </button>
          ))}
        </div>
      </div>

      {/* Assembled prompt */}
      <div className="rounded-xl p-4 mb-4" style={{ background: PARCHMENT, borderLeft: `4px solid #F59E0B` }}>
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Your image prompt</div>
        <p className="font-serif italic text-sm leading-relaxed" style={{ color: INK }}>
          {ASSEMBLED_PROMPT}
        </p>
      </div>

      <button
        className="w-full rounded-lg font-semibold text-white text-sm py-3"
        style={{ background: CLAY }}
      >
        Generate Image →
      </button>
    </div>
  );
}

// ── Right Panel ───────────────────────────────────────────────────────────────
function RightPanel() {
  return (
    <div
      className="flex-none flex flex-col gap-5 overflow-y-auto p-5"
      style={{ width: 288, background: PARCHMENT, borderLeft: `1px solid ${WARM_BORDER}` }}
    >
      {/* Objects & Threads — the new concept */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <span style={{ color: "#F59E0B", fontSize: 12 }}>◆</span>
          <span className="text-sm font-semibold" style={{ color: INK, fontFamily: "'Playfair Display', serif" }}>
            Objects &amp; Mystery
          </span>
        </div>
        <div className="text-xs mb-3" style={{ color: "#9CA3AF" }}>
          Objects in this world carry discovery threads
        </div>
        <div className="flex flex-col gap-2">
          {[
            {
              name: "The Obsidian Mirror",
              dot: "#F59E0B",
              location: "Found in The Glasshouse",
              mystery: "A face in the glass that does not match",
              leads: "What the mirrors remember",
              leadsType: "lore",
            },
            {
              name: "The Wax Seal Collection",
              dot: "#F59E0B",
              location: "Lady Ashmore's study",
              mystery: "Letters sent to no one — or never received",
              leads: "The Wychcombe Inheritance",
              leadsType: "lore",
            },
          ].map(obj => (
            <div
              key={obj.name}
              className="rounded-lg p-3"
              style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: obj.dot, flexShrink: 0 }} />
                <span className="text-xs font-semibold truncate" style={{ color: INK }}>{obj.name}</span>
              </div>
              <div className="text-[10px] mb-1.5" style={{ color: "#9CA3AF" }}>{obj.location}</div>
              <p className="text-xs italic mb-2 leading-snug" style={{ color: "#6B7280" }}>
                "{obj.mystery}"
              </p>
              <div className="flex items-center gap-1">
                <Eye style={{ width: 9, height: 9, color: "#D97706", flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: "#D97706" }}>
                  leads to: <span className="italic">{obj.leads}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* Also in Wychcombe */}
      <div>
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Also in this Scene
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { dot: "#8B5CF6", name: "Lady Ashmore" },
            { dot: CLAY,      name: "Fog & Gaslight" },
            { dot: "#F59E0B", name: "The Obsidian Mirror" },
            { dot: "#64748B", name: "Quiet Dread" },
          ].map(r => (
            <button
              key={r.name}
              className="flex items-center gap-1.5 rounded-full text-xs transition-colors"
              style={{ background: "white", border: `1px solid ${WARM_BORDER}`, padding: "6px 12px", color: "#374151" }}
            >
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.dot, flexShrink: 0 }} />
              {r.name}
            </button>
          ))}
        </div>
        <button className="mt-2 text-xs" style={{ color: CLAY }}>View all →</button>
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* Canon Gaps */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={13} style={{ color: CLAY }} />
          <span className="text-sm font-semibold" style={{ color: INK }}>Canon Gaps</span>
        </div>
        <div className="text-xs mb-3" style={{ color: "#9CA3AF" }}>Ideas to strengthen your world</div>
        <div className="flex flex-col gap-2">
          <div className="rounded-lg p-3" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
            <div className="text-xs font-semibold mb-1" style={{ color: INK }}>No Motif records yet</div>
            <div className="text-[11px] leading-snug mb-2" style={{ color: "#6B7280" }}>
              What symbol keeps appearing in Wychcombe? Mirrors. Fog. Wax. Write it down.
            </div>
            <button className="flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1" style={{ color: CLAY, border: `1px solid ${CLAY}` }}>
              <Plus size={10} /> Add Motif
            </button>
          </div>
          <div className="rounded-lg p-3" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
            <div className="text-xs font-semibold mb-1" style={{ color: INK }}>Lady Ashmore needs an object</div>
            <div className="text-[11px] leading-snug mb-2" style={{ color: "#6B7280" }}>
              Does she own the mirror? Carry a seal? What she holds reveals who she is.
            </div>
            <button className="flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1" style={{ color: CLAY, border: `1px solid ${CLAY}` }}>
              <Plus size={10} /> Explore
            </button>
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* Record Details collapsed */}
      <div className="cursor-pointer">
        <div className="flex items-center justify-between py-1">
          <span className="text-sm" style={{ color: "#6B7280" }}>Record Details</span>
          <ChevronDown size={15} style={{ color: "#9CA3AF" }} />
        </div>
        <div style={{ fontSize: 11, color: "#9CA3AF" }}>Status · Type · Editorial notes</div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function TheSynthesis() {
  const [activeTab, setActiveTab] = useState<"ideas" | "scene">("ideas");

  return (
    <div className="flex flex-col h-screen w-full" style={{ background: WARM_WHITE, color: INK, fontFamily: "'Instrument Sans', sans-serif" }}>

      {/* TOP BAR */}
      <div className="flex-none flex items-center justify-between px-5 border-b" style={{ height: 48, background: WARM_WHITE, borderColor: WARM_BORDER }}>
        <div className="text-sm">
          <span style={{ color: "#9CA3AF" }}>Wychcombe / </span>
          <span style={{ color: INK, fontWeight: 500 }}>The Glasshouse</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full text-xs font-medium px-2.5 py-0.5" style={{ background: "#D1FAE5", color: "#065F46" }}>
            Accepted
          </span>
          <button className="p-1.5 rounded-md transition-colors" style={{ color: "#9CA3AF" }}>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex flex-1 min-h-0">
        <LeftRail />

        {/* MAIN AREA */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div style={{ maxWidth: 680 }}>

            {/* Record header */}
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 40, color: INK, fontWeight: 600, marginBottom: 6 }}>
              The Glasshouse
            </h1>
            <div className="flex items-center gap-3 mb-8">
              <span className="rounded-full text-xs px-2.5 py-0.5" style={{ background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>
                Location
              </span>
              <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "'Space Mono', monospace", letterSpacing: "0.04em" }}>
                WYC-LOC-004
              </span>
            </div>

            {/* Prose — no form fields */}
            <div className="relative group mb-10">
              <div
                className="absolute opacity-0 group-focus-within:opacity-100 transition-opacity"
                style={{ top: -18, left: 0, fontSize: 11, color: "#9CA3AF", fontWeight: 500 }}
              >
                Your story
              </div>
              <textarea
                className="w-full bg-transparent resize-none border-none outline-none leading-relaxed"
                style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 16, color: "#374151", minHeight: 110 }}
                defaultValue="An overgrown Victorian glasshouse at the edge of the estate grounds. Iron frames bow under the weight of wisteria, their joints bleeding rust onto cracked stone pathways. Inside, warm lantern light filters through broken panes, catching dust motes and the pale green of unchecked ferns. Something thrives here still."
              />
            </div>

            {/* Tabs */}
            <div className="flex mb-6" style={{ borderBottom: `1px solid ${WARM_BORDER}` }}>
              {(["ideas", "scene"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="pb-2.5 mr-8 text-sm font-medium transition-colors"
                  style={{
                    borderBottom: activeTab === tab ? `2px solid ${CLAY}` : "2px solid transparent",
                    color: activeTab === tab ? CLAY : "#9CA3AF",
                    marginBottom: -1,
                  }}
                >
                  {tab === "ideas" ? "✦ Image Ideas" : "Compose a Scene"}
                </button>
              ))}
            </div>

            {activeTab === "ideas" ? (
              <div>
                <div className="text-xs mb-5" style={{ color: "#9CA3AF" }}>
                  Based on your world's atmosphere, this place, and objects with mystery threads
                </div>
                <div className="flex flex-col gap-3 mb-5">
                  {IMAGE_IDEAS.map((idea, i) => <PromptCard key={i} idea={idea} />)}
                </div>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Or describe your own image idea..."
                    className="flex-1 text-sm outline-none rounded-l-lg px-4 py-3"
                    style={{ border: `1px solid ${WARM_BORDER}`, borderRight: "none", background: "white" }}
                  />
                  <button
                    className="text-sm font-medium text-white rounded-r-lg px-5 py-3"
                    style={{ background: INK }}
                  >
                    Generate →
                  </button>
                </div>
                <button className="text-xs" style={{ color: CLAY }}>↻ Load more ideas</button>
              </div>
            ) : (
              <SceneBuilder />
            )}
          </div>
        </div>

        <RightPanel />
      </div>
    </div>
  );
}
