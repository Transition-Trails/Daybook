import { useState } from "react";
import {
  MoreHorizontal, Sparkles, ChevronDown, Plus, Eye,
  Link2, BookOpen, Scroll, Map, Zap, FileText,
} from "lucide-react";

// ── Tokens ────────────────────────────────────────────────────────────────────
const INK         = "#1B2A4A";
const CLAY        = "#C87560";
const PARCHMENT   = "#EFE9E1";
const WARM_WHITE  = "#FDFAF7";
const WARM_BG     = "#F4EFE8";
const WARM_BORDER = "#DDD4C4";
const AMBER       = "#D97706";
const AMBER_BG    = "#FEF3C7";

// ── Records ───────────────────────────────────────────────────────────────────
const RECORDS = [
  { type: "character",  dot: "#8B5CF6", name: "Lady Ashmore"             },
  { type: "character",  dot: "#8B5CF6", name: "The Groundskeeper"        },
  { type: "character",  dot: "#8B5CF6", name: "Silas Vance"              },
  { type: "location",   dot: "#3B82F6", name: "The Glasshouse", active: true },
  { type: "location",   dot: "#3B82F6", name: "The East Wing"            },
  { type: "location",   dot: "#3B82F6", name: "The Black Lake"           },
  { type: "location",   dot: "#3B82F6", name: "Ashmore Village"          },
  { type: "object",     dot: "#F59E0B", name: "The Obsidian Mirror",   mystery: "What the mirrors remember"   },
  { type: "object",     dot: "#F59E0B", name: "The Wax Seal Collection", mystery: "The Wychcombe Inheritance" },
  { type: "atmosphere", dot: CLAY,      name: "Fog & Gaslight"           },
  { type: "atmosphere", dot: CLAY,      name: "Quiet Dread"              },
  { type: "lore",       dot: "#10B981", name: "What the mirrors remember"},
  { type: "lore",       dot: "#10B981", name: "The Wychcombe Inheritance"},
];

const IMAGE_IDEAS = [
  {
    prompt: "A crumbling Victorian glasshouse at dusk, iron frames tangled with wisteria, warm lantern light glowing through broken panes, fog drifting along stone floor, moody and atmospheric",
    tags: ["The Glasshouse", "Fog & Gaslight"], object: null,
  },
  {
    prompt: "Lady Ashmore standing in the glasshouse doorway at night, silhouetted against gaslight, looking into fog-covered gardens, Gothic Victorian illustration, quiet and unsettling",
    tags: ["The Glasshouse", "Lady Ashmore"], object: null,
  },
  {
    prompt: "Interior of an abandoned conservatory, overgrown with ferns and moss, shafts of pale light through ironwork ceiling, dust motes suspended, Pre-Raphaelite oil painting style",
    tags: ["The Glasshouse", "Quiet Dread"], object: null,
  },
  {
    prompt: "The Obsidian Mirror propped against a glasshouse wall, reflecting a face that does not match Lady Ashmore standing before it, gaslight catching the glass, fog beyond broken panes, Victorian Gothic horror",
    tags: ["The Glasshouse", "Lady Ashmore"],
    object: { name: "The Obsidian Mirror", mystery: "What the mirrors remember" },
  },
];

// ── Left Rail ─────────────────────────────────────────────────────────────────
function LeftRail() {
  const groups = [
    { label: "Characters",  type: "character"  },
    { label: "Locations",   type: "location"   },
    { label: "Objects",     type: "object"     },
    { label: "Atmosphere",  type: "atmosphere" },
    { label: "Lore",        type: "lore"       },
  ];
  return (
    <div className="flex flex-col flex-none overflow-hidden border-r"
      style={{ width: 210, background: WARM_BG, borderColor: WARM_BORDER }}>
      <div className="flex-1 overflow-y-auto pb-4">
        <div className="px-4 pt-4 pb-2"
          style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Records · 13
        </div>
        {groups.map(g => {
          const rows = RECORDS.filter(r => r.type === g.type);
          return (
            <div key={g.type}>
              <div className="px-4 mt-3 mb-1"
                style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {g.label}
              </div>
              {rows.map(r => (
                <div key={r.name} className="flex items-center gap-2 px-4 cursor-pointer"
                  style={{
                    paddingTop: 6, paddingBottom: 6,
                    borderLeft: r.active ? `2px solid ${CLAY}` : "2px solid transparent",
                    background: r.active ? "rgba(255,255,255,0.6)" : "transparent",
                    fontWeight: r.active ? 600 : 400,
                    color: r.active ? INK : "#6B7280",
                    fontSize: 13,
                  }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: r.dot, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }} className="truncate">{r.name}</span>
                  {"mystery" in r && r.mystery && (
                    <span title={r.mystery} style={{ color: "#F59E0B", fontSize: 9, flexShrink: 0 }}>◆</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <button className="flex-none w-full py-3 text-center text-sm font-medium"
        style={{ borderTop: `1px solid ${WARM_BORDER}`, color: CLAY }}>
        + New Record
      </button>
    </div>
  );
}

// ── Prompt Card ───────────────────────────────────────────────────────────────
function PromptCard({ idea }: { idea: typeof IMAGE_IDEAS[number] }) {
  const isMystery = !!idea.object;
  return (
    <div className="rounded-xl shadow-sm p-4"
      style={{
        background: isMystery ? "#FFF8ED" : PARCHMENT,
        borderLeft: `4px solid ${isMystery ? AMBER : CLAY}`,
        border: isMystery ? `1px solid ${AMBER}40` : undefined,
      }}>
      {isMystery && (
        <div className="flex items-center gap-1.5 mb-2">
          <span style={{ fontSize: 10, color: AMBER, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>◆ Object &amp; Mystery</span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: AMBER_BG, color: "#92400E" }}>{idea.object!.name}</span>
        </div>
      )}
      <p className="font-serif italic leading-relaxed" style={{ fontSize: 13.5, color: INK }}>"{idea.prompt}"</p>
      <div className="flex justify-between items-center mt-3">
        <div className="flex gap-2 flex-wrap">
          {idea.tags.map(t => <span key={t} style={{ fontSize: 10, color: "#9CA3AF" }}>{t}</span>)}
          {isMystery && <span style={{ fontSize: 10, color: "#B45309", fontStyle: "italic" }}>· "{idea.object!.mystery}"</span>}
        </div>
        <button className="rounded-full text-white text-xs font-medium flex-shrink-0 ml-3"
          style={{ background: isMystery ? AMBER : CLAY, padding: "5px 12px" }}>
          Use this →
        </button>
      </div>
    </div>
  );
}

// ── Scene Builder (Tab 2) ─────────────────────────────────────────────────────
function SceneBuilder() {
  return (
    <div>
      <p className="text-xs mb-5" style={{ color: "#9CA3AF" }}>Pick what's in your scene — the prompt builds itself</p>
      <div className="mb-4">
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Place</div>
        <div className="flex gap-2 flex-wrap">
          {["The Glasshouse", "The East Wing", "The Black Lake"].map(p => (
            <button key={p} className="rounded-full text-xs font-medium px-3 py-1.5"
              style={p === "The Glasshouse"
                ? { background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #BFDBFE" }
                : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
              {p === "The Glasshouse" && "✓ "}{p}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Who's there</div>
        <div className="flex gap-2 flex-wrap">
          {["Lady Ashmore", "The Groundskeeper", "No one"].map(c => (
            <button key={c} className="rounded-full text-xs font-medium px-3 py-1.5"
              style={c === "Lady Ashmore"
                ? { background: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE" }
                : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
              {c === "Lady Ashmore" && "✓ "}{c}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <div className="mb-1" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Object of mystery</div>
        <p className="text-xs mb-2" style={{ color: "#9CA3AF" }}>Objects carry their own story — they change what the image means</p>
        <div className="flex flex-col gap-2">
          {[
            { name: "The Obsidian Mirror", mystery: "A face in the glass that does not match", lore: "What the mirrors remember", selected: true },
            { name: "The Wax Seal Collection", mystery: "Letters sent to no one — or never received", lore: "The Wychcombe Inheritance", selected: false },
            { name: "Nothing — just the scene", mystery: "", lore: "", selected: false },
          ].map(obj => (
            <button key={obj.name} className="rounded-xl p-3 text-left"
              style={obj.selected
                ? { background: AMBER_BG, border: `1px solid ${AMBER}` }
                : { background: "white", border: `1px solid ${WARM_BORDER}` }}>
              <div className="flex items-center gap-2 mb-1">
                {obj.lore && <span style={{ color: AMBER, fontSize: 10 }}>◆</span>}
                <span className="text-sm font-medium" style={{ color: obj.selected ? "#92400E" : INK }}>
                  {obj.selected && "✓ "}{obj.name}
                </span>
              </div>
              {obj.mystery && <p className="text-xs italic" style={{ color: obj.selected ? "#B45309" : "#9CA3AF" }}>"{obj.mystery}"</p>}
              {obj.lore && (
                <div className="mt-1.5 flex items-center gap-1">
                  <Link2 style={{ width: 9, height: 9, color: AMBER }} />
                  <span style={{ fontSize: 10, color: AMBER }}>leads to: {obj.lore}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="mb-5">
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Mood</div>
        <div className="flex gap-2 flex-wrap">
          {["Mysterious & Dark", "Quiet & Beautiful", "Eerie & Unsettling"].map(m => (
            <button key={m} className="rounded-lg text-xs font-medium px-3 py-2"
              style={m === "Mysterious & Dark"
                ? { background: INK, color: "white" }
                : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
              {m === "Mysterious & Dark" && "✓ "}{m}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl p-4 mb-4" style={{ background: PARCHMENT, borderLeft: `4px solid ${AMBER}` }}>
        <div className="mb-2" style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Your image prompt</div>
        <p className="font-serif italic text-sm leading-relaxed" style={{ color: INK }}>
          Lady Ashmore standing before the Obsidian Mirror inside The Glasshouse at night — the reflection shows a face that is not hers. Iron frames tangled with wisteria, fog pressing through broken panes, gaslight flickering. Victorian Gothic mood, mysterious and atmospheric.
        </p>
      </div>
      <button className="w-full rounded-lg font-semibold text-white text-sm py-3" style={{ background: CLAY }}>
        Generate Image →
      </button>
    </div>
  );
}

// ── Daybook RPG Tab (Tab 3) ───────────────────────────────────────────────────
function DaybookRPG() {
  return (
    <div>
      <p className="text-xs mb-5" style={{ color: "#9CA3AF" }}>
        How this record shapes your solo RPG game and its physical Daybook pages
      </p>

      {/* Story Arc */}
      <div className="rounded-xl p-4 mb-4" style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Scroll style={{ width: 14, height: 14, color: CLAY }} />
          <span className="text-sm font-semibold" style={{ color: INK, fontFamily: "'Playfair Display', serif" }}>Story Role</span>
          <span className="rounded-full text-[10px] font-medium px-2 py-0.5 ml-auto" style={{ background: "#E0E7FF", color: "#3730A3" }}>Act I · The Arrival</span>
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "#374151" }}>
          The Glasshouse is the <strong>first discovery location</strong> — where the player character realises the estate is not what it appears. The Obsidian Mirror is found here and opens the central mystery.
        </p>
        <div className="flex gap-2 flex-wrap">
          {["First clue here", "Mirror discovery", "Lady Ashmore encounter"].map(tag => (
            <span key={tag} className="rounded-full text-[10px] px-2.5 py-1"
              style={{ background: "white", border: `1px solid ${WARM_BORDER}`, color: "#6B7280" }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Encounter */}
      <div className="rounded-xl p-4 mb-4" style={{ background: "#F0FDF4", border: `1px solid #BBF7D0` }}>
        <div className="flex items-center gap-2 mb-3">
          <Zap style={{ width: 14, height: 14, color: "#16A34A" }} />
          <span className="text-sm font-semibold" style={{ color: INK, fontFamily: "'Playfair Display', serif" }}>Encounter at this Location</span>
        </div>
        <p className="text-sm leading-relaxed mb-3 font-serif italic" style={{ color: "#166534" }}>
          "You push open the glasshouse door. Wisteria has sealed the frame from outside; it groans but yields. Inside, something catches the lantern light — a mirror, propped against the far wall. Your reflection appears a half-second before you do."
        </p>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 11, color: "#16A34A" }}>Roll: Perception or Unease</span>
          <button className="rounded-full text-xs font-medium px-3 py-1.5" style={{ background: "#16A34A", color: "white" }}>
            Use this →
          </button>
        </div>
      </div>

      {/* Journal Prompts */}
      <div className="rounded-xl p-4 mb-4" style={{ background: "#FFF8ED", border: `1px solid ${AMBER}40` }}>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen style={{ width: 14, height: 14, color: AMBER }} />
          <span className="text-sm font-semibold" style={{ color: INK, fontFamily: "'Playfair Display', serif" }}>Session Journal Prompts</span>
          <span style={{ fontSize: 10, color: AMBER, marginLeft: "auto" }}>for the physical Daybook page</span>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { q: "What did your character notice first about the glasshouse?", hint: "sensory detail" },
            { q: "When you saw the reflection — what did the face look like?", hint: "mystery" },
            { q: "What did you take with you when you left?", hint: "inventory" },
          ].map((p, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-xs font-mono mt-0.5 flex-shrink-0" style={{ color: AMBER }}>{i + 1}.</span>
              <div>
                <p className="text-sm" style={{ color: INK }}>{p.q}</p>
                <span className="text-[10px]" style={{ color: "#9CA3AF" }}>→ {p.hint}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Physical product preview */}
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1px solid ${WARM_BORDER}` }}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: INK }}>
          <FileText style={{ width: 13, height: 13, color: "rgba(255,255,255,0.6)" }} />
          <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.9)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Physical Daybook Page Preview
          </span>
          <span className="ml-auto text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>Location · Act I</span>
        </div>
        {/* Simulated physical page layout */}
        <div className="p-4" style={{ background: "#FDFBF7", fontFamily: "'Spectral', Georgia, serif" }}>
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>The Glasshouse</span>
            <span className="text-[10px]" style={{ color: "#D1D5DB" }}>WYC · LOC · 004</span>
          </div>
          {/* Image placeholder */}
          <div className="rounded-lg mb-3 flex items-center justify-center"
            style={{ height: 72, background: PARCHMENT, border: `1px dashed ${WARM_BORDER}` }}>
            <span className="text-xs italic" style={{ color: "#9CA3AF" }}>AI image generated from prompt</span>
          </div>
          {/* Journal lines */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] italic mb-1" style={{ color: "#6B7280" }}>What did you notice first?</p>
            {[1, 2].map(i => (
              <div key={i} className="h-px w-full" style={{ background: "#E5E7EB" }} />
            ))}
            <p className="text-[10px] italic mt-2 mb-1" style={{ color: "#6B7280" }}>What you found here:</p>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border" style={{ borderColor: WARM_BORDER }} />
              <span className="text-[10px]" style={{ color: "#9CA3AF" }}>The Obsidian Mirror</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border" style={{ borderColor: WARM_BORDER }} />
              <span className="text-[10px]" style={{ color: "#9CA3AF" }}>_________________</span>
            </div>
          </div>
        </div>
      </div>

      <button className="w-full rounded-lg font-semibold text-white text-sm py-3" style={{ background: INK }}>
        Generate Daybook Pages for Act I →
      </button>
    </div>
  );
}

// ── Right Panel ───────────────────────────────────────────────────────────────
function RightPanel() {
  return (
    <div className="flex-none flex flex-col gap-5 overflow-y-auto p-5"
      style={{ width: 280, background: PARCHMENT, borderLeft: `1px solid ${WARM_BORDER}` }}>

      {/* Objects & Threads */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <span style={{ color: AMBER, fontSize: 12 }}>◆</span>
          <span className="text-sm font-semibold" style={{ color: INK, fontFamily: "'Playfair Display', serif" }}>Objects &amp; Mystery</span>
        </div>
        <p className="text-xs mb-3" style={{ color: "#9CA3AF" }}>Objects carry discovery threads through the story</p>
        <div className="flex flex-col gap-2">
          {[
            { name: "The Obsidian Mirror", location: "Found here", mystery: "A face in the glass that does not match", leads: "What the mirrors remember" },
            { name: "The Wax Seal Collection", location: "Lady Ashmore's study", mystery: "Letters sent to no one", leads: "The Wychcombe Inheritance" },
          ].map(obj => (
            <div key={obj.name} className="rounded-lg p-3" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B", flexShrink: 0 }} />
                <span className="text-xs font-semibold truncate" style={{ color: INK }}>{obj.name}</span>
              </div>
              <div className="text-[10px] mb-1" style={{ color: "#9CA3AF" }}>{obj.location}</div>
              <p className="text-xs italic mb-2 leading-snug" style={{ color: "#6B7280" }}>"{obj.mystery}"</p>
              <div className="flex items-center gap-1">
                <Eye style={{ width: 9, height: 9, color: AMBER, flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: AMBER }}>leads to: <em>{obj.leads}</em></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* Story Arc progress */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Map style={{ width: 13, height: 13, color: CLAY }} />
          <span className="text-sm font-semibold" style={{ color: INK }}>Story Arc</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {[
            { act: "Act I", title: "The Arrival", active: true, pct: 60 },
            { act: "Act II", title: "The Unravelling", active: false, pct: 0 },
            { act: "Act III", title: "The Reckoning", active: false, pct: 0 },
          ].map(a => (
            <div key={a.act} className="rounded-lg p-2.5" style={{
              background: a.active ? "white" : "transparent",
              border: a.active ? `1px solid ${WARM_BORDER}` : "1px solid transparent",
            }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold" style={{ color: a.active ? INK : "#9CA3AF" }}>{a.act} · {a.title}</span>
                {a.active && <span className="text-[10px]" style={{ color: CLAY }}>{a.pct}% built</span>}
              </div>
              {a.active && (
                <div className="rounded-full overflow-hidden" style={{ height: 3, background: WARM_BORDER }}>
                  <div className="h-full rounded-full" style={{ width: `${a.pct}%`, background: CLAY }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* Canon Gaps */}
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={13} style={{ color: CLAY }} />
          <span className="text-sm font-semibold" style={{ color: INK }}>Canon Gaps</span>
        </div>
        <p className="text-xs mb-3" style={{ color: "#9CA3AF" }}>Records your story still needs</p>
        <div className="flex flex-col gap-2">
          {[
            { title: "No Motif records yet", body: "What symbol repeats in Wychcombe? Mirrors. Fog. Wax. Name it.", cta: "Add Motif" },
            { title: "Act II needs a Reveal", body: "Lady Ashmore's secret has no canon record yet. What did she do?", cta: "Add Event" },
          ].map(g => (
            <div key={g.title} className="rounded-lg p-3" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
              <div className="text-xs font-semibold mb-1" style={{ color: INK }}>{g.title}</div>
              <p className="text-[11px] leading-snug mb-2" style={{ color: "#6B7280" }}>{g.body}</p>
              <button className="flex items-center gap-1 text-[11px] font-medium rounded-full px-2.5 py-1"
                style={{ color: CLAY, border: `1px solid ${CLAY}` }}>
                <Plus size={10} /> {g.cta}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${WARM_BORDER}` }} />

      {/* Record details collapsed */}
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
  const [activeTab, setActiveTab] = useState<"ideas" | "scene" | "daybook">("ideas");

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: "ideas",   label: "✦ Image Ideas"     },
    { id: "scene",   label: "Compose a Scene"   },
    { id: "daybook", label: "📖 Daybook & Game"  },
  ];

  return (
    <div className="flex flex-col h-screen w-full"
      style={{ background: WARM_WHITE, color: INK, fontFamily: "'Instrument Sans', sans-serif" }}>

      {/* TOP BAR */}
      <div className="flex-none flex items-center justify-between px-5 border-b"
        style={{ height: 48, background: WARM_WHITE, borderColor: WARM_BORDER }}>
        <div className="text-sm">
          <span style={{ color: "#9CA3AF" }}>Wychcombe / </span>
          <span style={{ color: INK, fontWeight: 500 }}>The Glasshouse</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full text-xs font-medium px-2.5 py-0.5"
            style={{ background: "#D1FAE5", color: "#065F46" }}>Accepted</span>
          <button className="p-1.5 rounded-md" style={{ color: "#9CA3AF" }}>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex flex-1 min-h-0">
        <LeftRail />

        {/* MAIN */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div style={{ maxWidth: 680 }}>

            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, color: INK, fontWeight: 600, marginBottom: 6 }}>
              The Glasshouse
            </h1>
            <div className="flex items-center gap-3 mb-8">
              <span className="rounded-full text-xs px-2.5 py-0.5"
                style={{ background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #BFDBFE" }}>Location</span>
              <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "'Space Mono', monospace", letterSpacing: "0.04em" }}>WYC-LOC-004</span>
              <span className="rounded-full text-[10px] px-2 py-0.5 font-medium"
                style={{ background: "#E0E7FF", color: "#3730A3" }}>Act I · The Arrival</span>
            </div>

            {/* Prose */}
            <div className="relative group mb-8">
              <textarea
                className="w-full bg-transparent resize-none border-none outline-none leading-relaxed"
                style={{ fontFamily: "'Spectral', Georgia, serif", fontSize: 16, color: "#374151", minHeight: 96 }}
                defaultValue="An overgrown Victorian glasshouse at the edge of the estate grounds. Iron frames bow under the weight of wisteria, their joints bleeding rust onto cracked stone pathways. Inside, warm lantern light filters through broken panes, catching dust motes and the pale green of unchecked ferns. Something thrives here still."
              />
            </div>

            {/* Tabs */}
            <div className="flex mb-6" style={{ borderBottom: `1px solid ${WARM_BORDER}` }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="pb-2.5 mr-7 text-sm font-medium transition-colors"
                  style={{
                    borderBottom: activeTab === tab.id ? `2px solid ${CLAY}` : "2px solid transparent",
                    color: activeTab === tab.id ? CLAY : "#9CA3AF",
                    marginBottom: -1,
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "ideas" && (
              <div>
                <p className="text-xs mb-4" style={{ color: "#9CA3AF" }}>
                  Based on this place, your world's atmosphere, and objects with mystery threads
                </p>
                <div className="flex flex-col gap-3 mb-4">
                  {IMAGE_IDEAS.map((idea, i) => <PromptCard key={i} idea={idea} />)}
                </div>
                <div className="flex gap-2 mb-3">
                  <input type="text" placeholder="Or describe your own image idea..."
                    className="flex-1 text-sm outline-none rounded-l-lg px-4 py-2.5"
                    style={{ border: `1px solid ${WARM_BORDER}`, borderRight: "none", background: "white" }} />
                  <button className="text-sm font-medium text-white rounded-r-lg px-5 py-2.5" style={{ background: INK }}>
                    Generate →
                  </button>
                </div>
                <button className="text-xs" style={{ color: CLAY }}>↻ Load more ideas</button>
              </div>
            )}

            {activeTab === "scene" && <SceneBuilder />}
            {activeTab === "daybook" && <DaybookRPG />}
          </div>
        </div>

        <RightPanel />
      </div>
    </div>
  );
}
