/**
 * WorldsmithCanon — Synthesis design (Daybook creative studio layout).
 *
 * Layout (height: 100dvh):
 *   48px top bar → flex:1 row → [210px record rail | fluid editor | 280px right panel]
 *
 * Three-tab center: Image Ideas | Compose a Scene | Daybook & Game
 * Right panel: Objects & Mystery, Story Arc, Canon Gaps, Record Details (collapsed)
 *
 * All existing mutations (patch, transition, delete, relations, cascade) are preserved
 * in the Record Details accordion in the right panel.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Loader2, AlertCircle, ExternalLink, Lock, Unlock,
  User2, MapPin, Package, CalendarDays, BookMarked, Wind, Layers,
  ChevronRight, Trash2, X, ArrowLeft, Eye, EyeOff,
  GitBranch, Repeat2, Plus, Link2, ChevronDown, ChevronUp,
  Sparkles, BookOpen, Zap, FileText, Upload, ImageIcon, StickyNote,
  Pencil, Save,
} from "lucide-react";
import { apiFetch, storageApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEditorial, type WorldRecord } from "@/contexts/EditorialContext";
import { CopilotPanel } from "@/components/CopilotPanel";
import { REGISTERS } from "./canon-registers";

export { REGISTERS } from "./canon-registers";

// ── Design tokens ──────────────────────────────────────────────────────────────
const INK         = "#1B2A4A";
const CLAY        = "#C87560";
const PARCHMENT   = "#EFE9E1";
const WARM_WHITE  = "#FDFAF7";
const WARM_BG     = "#F4EFE8";
const WARM_BORDER = "#DDD4C4";
const AMBER       = "#D97706";
const AMBER_BG    = "#FEF3C7";

const regMeta = (key: string | null | undefined) =>
  REGISTERS.find(r => r.key === key) ?? null;

// ── Canon-type config ──────────────────────────────────────────────────────────
const CANON_TYPES = [
  { key: "character",    label: "Character",    color: "#8B5CF6", Icon: User2 },
  { key: "location",     label: "Location",     color: "#3B82F6", Icon: MapPin },
  { key: "object",       label: "Object",       color: "#F59E0B", Icon: Package },
  { key: "event",        label: "Event",        color: "#EC4899", Icon: CalendarDays },
  { key: "lore",         label: "Lore",         color: "#10B981", Icon: BookMarked },
  { key: "atmosphere",   label: "Atmosphere",   color: CLAY,      Icon: Wind },
  { key: "material",     label: "Material",     color: "#6B7280", Icon: Layers },
  { key: "relationship", label: "Relationship", color: "#06B6D4", Icon: GitBranch },
  { key: "motif",        label: "Motif",        color: "#A855F7", Icon: Repeat2 },
] as const;

const TYPE_PREFIX: Record<string, string> = {
  character: "CHR", location: "LOC", object: "OBJ", event: "EVT",
  lore: "LOR", atmosphere: "ATM", material: "MAT", relationship: "REL", motif: "MTF",
};

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  proposed:     { label: "Proposed",     color: "#6B7280", bg: "#F3F4F6" },
  under_review: { label: "Under Review", color: "#B45309", bg: "#FEF3C7" },
  accepted:     { label: "Accepted",     color: "#065F46", bg: "#D1FAE5" },
  superseded:   { label: "Superseded",   color: "#6B7280", bg: "#F3F4F6" },
  rejected:     { label: "Rejected",     color: "#9B1C1C", bg: "#FEE2E2" },
};

const RELATION_TYPES = [
  { key: "related",     label: "Related to"   },
  { key: "supports",    label: "Supports"     },
  { key: "contradicts", label: "Contradicts"  },
  { key: "requires",    label: "Requires"     },
  { key: "supersedes",  label: "Supersedes"   },
  { key: "mentions",    label: "Mentions"     },
] as const;
type RelationTypeKey = typeof RELATION_TYPES[number]["key"];

const relTypeMeta = (key: string | null) =>
  RELATION_TYPES.find(r => r.key === key) ?? { key: "related", label: "Related to" };

// ── Data types ─────────────────────────────────────────────────────────────────
interface CanonRecord {
  id: string; worldId: string; name: string; status: string;
  canonType?: string | null; narrativeDetails: string; historicalContext: string;
  visualNotes: string; emotionalRegister?: string | null; sensoryClauses?: string | null;
  registerLocked: boolean; narrativeVisibility?: string | null; temporalScope?: string | null;
  canonStability?: string | null; specRefCount: number; notionPageId?: string | null;
  createdBy?: string | null; createdAt: string; updatedAt: string;
  fromEntityId?: string | null; toEntityId?: string | null; emotionalValence?: string | null;
  portraitUrl?: string | null; notes?: string | null;
}
interface CanonListItem {
  id: string; worldId: string; name: string; status: string;
  canonType?: string | null; emotionalRegister?: string | null;
  registerLocked: boolean; specRefCount: number; narrativeVisibility?: string | null;
  temporalScope?: string | null; canonStability?: string | null;
}
interface LinkedSpec { id: string; productionItem: string; componentType: string; status: string; }
interface CanonRelation {
  fromRecordId: string; toRecordId: string; relationType: string | null;
  createdAt: string; targetName: string; targetCanonType: string | null; targetStatus: string;
}
interface InboundRelation {
  fromRecordId: string; fromName: string; fromCanonType: string | null;
  fromStatus: string; relationType: string | null;
}
interface WsStoryLink { storyId: string; actId: string | null; storyTitle: string | null; storyStatus: string | null; }
interface WsJournalPrompt { id: string; recordId: string; promptText: string; hintLabel: string; sortOrder: number; }
interface WsEncounter { id: string; actId: string; triggerText: string; description: string; rollType: string | null; outcomeText: string; }

// ── Display ID ─────────────────────────────────────────────────────────────────
function displayId(worldCode: string, _id: string, index: number, canonType?: string | null): string {
  const prefix = (canonType && TYPE_PREFIX[canonType]) ?? worldCode;
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

// ── AutoSave textarea ──────────────────────────────────────────────────────────
function AutoField({ label, field, value, placeholder, mono = false, onSave, rows = 4 }:
  { label: string; field: string; value: string; placeholder: string; mono?: boolean; onSave: (f: string, v: string) => void; rows?: number }) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);
  const prev = useRef(value);
  useEffect(() => { if (prev.current !== value && !dirty) { setLocal(value); prev.current = value; } }, [value, dirty]);
  const commit = () => { if (dirty && local !== prev.current) { onSave(field, local); prev.current = local; } setDirty(false); };
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "#9CA3AF" }}>{label}</label>
      <textarea value={local} rows={rows}
        onChange={e => { setLocal(e.target.value); setDirty(true); }}
        onBlur={commit} placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-none focus:outline-none"
        style={{ border: `1px solid ${WARM_BORDER}`, background: WARM_WHITE, color: INK,
          fontFamily: mono ? "'Space Mono', monospace" : "'Spectral', Georgia, serif", fontSize: 13 }} />
    </div>
  );
}

// ── Portrait well ──────────────────────────────────────────────────────────────
function PortraitWell({ portraitUrl, onUpload, isUploading }:
  { portraitUrl?: string | null; onUpload: (file: File) => void; isUploading: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const imgSrc = portraitUrl ? `/api/storage${portraitUrl}` : null;
  return (
    <div onClick={() => !isUploading && fileRef.current?.click()}
      className="relative flex-none rounded-xl overflow-hidden cursor-pointer group"
      style={{ width: 96, height: 114, background: WARM_BG, border: `1.5px dashed ${WARM_BORDER}`, flexShrink: 0 }}>
      {imgSrc ? (
        <img src={imgSrc} alt="Portrait" className="w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-1.5">
          <ImageIcon className="w-5 h-5" style={{ color: "#C9BFB0" }} />
          <span className="text-[9px] font-medium text-center leading-tight px-2" style={{ color: "#C9BFB0" }}>
            Add portrait
          </span>
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: "rgba(27,42,74,0.5)" }}>
        {isUploading
          ? <Loader2 className="w-5 h-5 animate-spin text-white" />
          : <Upload className="w-4 h-4 text-white" />}
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
    </div>
  );
}

// ── Inline markdown render ─────────────────────────────────────────────────────
function applyInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, `<code style="background:#F3F4F6;padding:1px 4px;border-radius:3px;font-size:11px;font-family:monospace">$1</code>`);
}
function renderSimpleMarkdown(md: string): string {
  return md.split("\n").map(line => {
    if (/^### /.test(line)) return `<h4 style="font-size:12px;font-weight:700;margin:8px 0 2px;color:#1B2A4A">${applyInlineMarkdown(line.slice(4))}</h4>`;
    if (/^## /.test(line))  return `<h3 style="font-size:14px;font-weight:700;margin:10px 0 2px;color:#1B2A4A">${applyInlineMarkdown(line.slice(3))}</h3>`;
    if (/^# /.test(line))   return `<h2 style="font-size:16px;font-weight:700;margin:12px 0 4px;color:#1B2A4A">${applyInlineMarkdown(line.slice(2))}</h2>`;
    if (/^[-*] /.test(line)) return `<li style="margin-left:16px;list-style-type:disc;padding-left:2px">${applyInlineMarkdown(line.slice(2))}</li>`;
    if (line.trim() === "") return `<div style="height:6px"></div>`;
    return `<p style="margin:0 0 3px">${applyInlineMarkdown(line)}</p>`;
  }).join("");
}

// ── Notes field ────────────────────────────────────────────────────────────────
function NotesField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [mode, setMode]   = useState<"write" | "preview">("write");
  const [dirty, setDirty] = useState(false);
  const prev    = useRef(value);
  const taRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (prev.current !== value && !dirty) { setLocal(value); prev.current = value; }
  }, [value, dirty]);

  const commit = () => {
    if (dirty && local !== prev.current) { onSave(local); prev.current = local; }
    setDirty(false);
  };
  const switchToPreview = () => { commit(); setMode("preview"); };

  /** Insert or wrap selection with a markdown token. */
  const fmt = (type: "bold" | "italic" | "heading" | "bullet" | "hr") => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const sel   = local.slice(start, end);
    let next = local;
    let cursorOffset = 0;

    if (type === "bold") {
      const wrapped = `**${sel || "bold text"}**`;
      next = local.slice(0, start) + wrapped + local.slice(end);
      cursorOffset = sel ? wrapped.length : 2; // move inside ** if no sel
    } else if (type === "italic") {
      const wrapped = `*${sel || "italic text"}*`;
      next = local.slice(0, start) + wrapped + local.slice(end);
      cursorOffset = sel ? wrapped.length : 1;
    } else if (type === "heading") {
      // Insert at start of line
      const lineStart = local.lastIndexOf("\n", start - 1) + 1;
      const prefix = "## ";
      next = local.slice(0, lineStart) + prefix + local.slice(lineStart);
      cursorOffset = prefix.length + (start - lineStart);
    } else if (type === "bullet") {
      const lineStart = local.lastIndexOf("\n", start - 1) + 1;
      const prefix = "- ";
      next = local.slice(0, lineStart) + prefix + local.slice(lineStart);
      cursorOffset = prefix.length + (start - lineStart);
    } else if (type === "hr") {
      const hr = "\n\n---\n\n";
      next = local.slice(0, start) + hr + local.slice(end);
      cursorOffset = hr.length;
    }

    setLocal(next);
    setDirty(true);
    // Restore focus + cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      if (type === "bold" && !sel) {
        ta.setSelectionRange(start + 2, start + 2 + "bold text".length);
      } else if (type === "italic" && !sel) {
        ta.setSelectionRange(start + 1, start + 1 + "italic text".length);
      } else {
        const pos = start + cursorOffset;
        ta.setSelectionRange(pos, pos);
      }
    });
  };

  const FMT_BUTTONS: { id: "bold"|"italic"|"heading"|"bullet"|"hr"; label: string; title: string }[] = [
    { id: "bold",    label: "B",  title: "Bold (**text**)" },
    { id: "italic",  label: "I",  title: "Italic (*text*)" },
    { id: "heading", label: "H",  title: "Heading (## ...)" },
    { id: "bullet",  label: "•",  title: "Bullet list (- ...)" },
    { id: "hr",      label: "—",  title: "Horizontal rule (---)" },
  ];

  return (
    <div className="mb-8">
      {/* Label row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <StickyNote className="w-3 h-3" style={{ color: "#9CA3AF" }} />
          <label className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "#9CA3AF" }}>Notes</label>
        </div>
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: WARM_BORDER }}>
          {(["write", "preview"] as const).map(m => (
            <button key={m}
              onClick={() => m === "write" ? setMode("write") : switchToPreview()}
              className="px-2.5 py-0.5 text-[10px] font-semibold capitalize"
              style={{ background: mode === m ? INK : "transparent", color: mode === m ? "white" : "#9CA3AF" }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === "write" ? (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${WARM_BORDER}` }}>
          {/* Formatting toolbar */}
          <div
            className="flex items-center gap-0.5 px-2 py-1.5 border-b"
            style={{ borderColor: WARM_BORDER, background: "#F5F0E8" }}
          >
            {FMT_BUTTONS.map(btn => (
              <button
                key={btn.id}
                onMouseDown={e => { e.preventDefault(); fmt(btn.id); }}
                title={btn.title}
                className="w-6 h-6 flex items-center justify-center rounded text-[11px] font-bold transition-colors hover:bg-black/8"
                style={{
                  color: INK,
                  fontStyle: btn.id === "italic" ? "italic" : "normal",
                  fontFamily: btn.id === "bold" || btn.id === "italic" ? "Georgia, serif" : "inherit",
                  letterSpacing: btn.id === "hr" ? "0" : undefined,
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>
          {/* Textarea — resizable */}
          <textarea
            ref={taRef}
            value={local}
            rows={6}
            onChange={e => { setLocal(e.target.value); setDirty(true); }}
            onBlur={commit}
            placeholder={"Write editorial notes here — observations, flags, cross-references, open questions…"}
            className="w-full px-3 py-2.5 leading-relaxed resize-y focus:outline-none"
            style={{
              background: WARM_WHITE,
              color: INK,
              fontFamily: "'Spectral', Georgia, serif",
              fontSize: 13,
              minHeight: 112,
              border: "none",
            }}
          />
        </div>
      ) : (
        <div
          className="w-full rounded-lg px-3 py-2.5 leading-relaxed min-h-[112px]"
          style={{ border: `1px solid ${WARM_BORDER}`, background: WARM_WHITE, color: INK,
            fontFamily: "'Spectral', Georgia, serif", fontSize: 13 }}
          dangerouslySetInnerHTML={{ __html: local.trim()
            ? renderSimpleMarkdown(local)
            : `<span style="color:#C9BFB0;font-style:italic">Nothing written yet.</span>` }}
        />
      )}
    </div>
  );
}

// ── Register picker ────────────────────────────────────────────────────────────
function RegisterPicker({ value, locked, onSelect, onToggleLock }:
  { value: string | null | undefined; locked: boolean; onSelect: (r: string | null) => void; onToggleLock: () => void }) {
  const [open, setOpen] = useState(false);
  const meta = regMeta(value);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button onClick={() => !locked && setOpen(o => !o)} disabled={locked}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium"
          style={meta
            ? { background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }
            : { background: "#FEF2F2", color: "#EF4444", border: "1px dashed #FCA5A5" }}>
          {meta ? meta.key : <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" />NOT SET</span>}
          {!locked && <ChevronRight className="w-3 h-3 opacity-50 ml-1" />}
        </button>
        <button onClick={onToggleLock} className="p-1.5 rounded-lg"
          style={locked ? { background: `${CLAY}18`, color: CLAY } : { background: "#F3F4F6", color: "#9CA3AF" }}>
          {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
        </button>
      </div>
      {open && (
        <div className="rounded-xl overflow-hidden shadow-lg border" style={{ borderColor: WARM_BORDER, background: "white" }}>
          {REGISTERS.map(r => (
            <button key={r.key} onClick={() => { onSelect(r.key); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50"
              style={{ color: r.color }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />{r.key}
            </button>
          ))}
          {value && (
            <button onClick={() => { onSelect(null); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-400 hover:bg-gray-50 border-t"
              style={{ borderColor: "#F3F4F6" }}>
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filter persistence ─────────────────────────────────────────────────────────
const VALID_VISIBILITY = new Set(["background", "hinted", "explicit"]);
const VALID_STABILITY  = new Set(["low", "medium", "high"]);
const VALID_TYPE       = new Set(CANON_TYPES.map(t => t.key));
const VALID_REGISTER   = new Set(REGISTERS.map(r => r.key));
function canonFilterKey(worldId: string) { return `canon-filters-${worldId}`; }
interface PersistedFilters {
  visibility: string | null;
  stability: string | null;
  type: string | null;
  emotionalRegister?: string | null;
}
function loadPersistedFilters(worldId: string): PersistedFilters {
  try {
    const raw = sessionStorage.getItem(canonFilterKey(worldId));
    if (!raw) return { visibility: null, stability: null, type: null, emotionalRegister: null };
    const parsed = JSON.parse(raw);
    return {
      visibility: VALID_VISIBILITY.has(parsed.visibility) ? parsed.visibility : null,
      stability:  VALID_STABILITY.has(parsed.stability)   ? parsed.stability  : null,
      type:       VALID_TYPE.has(parsed.type)             ? parsed.type       : null,
      emotionalRegister: VALID_REGISTER.has(parsed.emotionalRegister) ? parsed.emotionalRegister : null,
    };
  } catch { return { visibility: null, stability: null, type: null, emotionalRegister: null }; }
}
function savePersistedFilters(worldId: string, filters: PersistedFilters) {
  try {
    const existing = sessionStorage.getItem(canonFilterKey(worldId));
    const base = existing ? JSON.parse(existing) : {};
    sessionStorage.setItem(canonFilterKey(worldId), JSON.stringify({ ...base, ...filters }));
  } catch { /* storage full */ }
}

// ── Image idea generator ───────────────────────────────────────────────────────
type ImageIdea = { prompt: string; tags: string[]; object: { name: string; mystery: string } | null };

function generateImageIdeas(record: CanonRecord, world: { visualPalette?: string | null; atmosphericNotes?: string | null } | null): ImageIdea[] {
  const palette = world?.visualPalette ?? "";
  const atmosphere = world?.atmosphericNotes ?? "";
  const type = record.canonType ?? "record";
  const name = record.name;
  const prose = record.narrativeDetails?.slice(0, 120) ?? "";

  const base: ImageIdea[] = [
    {
      prompt: `${name}${prose ? " — " + prose : ""}, ${palette || "Victorian Gothic aesthetic"}, ${atmosphere || "moody and atmospheric"}, detailed illustration`,
      tags: [name, type], object: null,
    },
  ];

  if (type === "location") {
    base.push(
      { prompt: `Interior of ${name}, ${palette || "aged and worn"}, soft light, Pre-Raphaelite oil painting style, quiet and atmospheric`, tags: [name, "atmosphere"], object: null },
      { prompt: `${name} at dusk, ${atmosphere || "fog drifting"}, ${palette || "warm candlelight against cold air"}, Gothic Victorian illustration`, tags: [name, "dusk"], object: null },
    );
  } else if (type === "character") {
    base.push(
      { prompt: `Portrait of ${name}, ${palette || "Victorian dress"}, ${atmosphere || "shadowed and still"}, painted in the style of John Singer Sargent`, tags: [name, "portrait"], object: null },
      { prompt: `${name} in silhouette against a window, ${palette || "dark and introspective"}, ${atmosphere || "gaslight beyond"}, ink wash illustration`, tags: [name, "silhouette"], object: null },
    );
  } else if (type === "object") {
    base.push(
      { prompt: `Close-up of ${name}, ${prose || "ornate and aged"}, ${palette || "rich material detail"}, museum still-life lighting, hyperrealistic`, tags: [name, "still life"], object: null },
      {
        prompt: `${name} in context — ${prose || "placed in a Victorian interior"}, ${atmosphere || "candlelight catching its surface"}, ${palette || ""}, the object commands the scene`,
        tags: [name], object: { name, mystery: record.sensoryClauses ?? "carries its own story" },
      },
    );
  } else {
    base.push(
      { prompt: `${name} — conceptual illustration, ${palette || "rich tonal palette"}, ${atmosphere || "textured and evocative"}, editorial art style`, tags: [name], object: null },
    );
  }

  return base.slice(0, 4);
}

type WorldBibleTextField = "visualPalette" | "proseVoice" | "atmosphericNotes" | "materialWorld";
const VISIBILITY_OPTIONS = [
  { key: "explicit",   label: "Explicit"   },
  { key: "background", label: "Background" },
  { key: "hinted",     label: "Hinted"     },
];
const STABILITY_OPTIONS = [
  { key: "high",   label: "High"   },
  { key: "medium", label: "Medium" },
  { key: "low",    label: "Low"    },
];

function LeftRail({ records, totalCount, recordId, filterType, filterVisibility, filterStability, setFilterType, setFilterVisibility, setFilterStability }:
  { records: CanonListItem[]; totalCount: number; recordId: string; filterType: string | null; filterVisibility: string | null; filterStability: string | null;
    setFilterType: (v: string | null) => void; setFilterVisibility: (v: string | null) => void; setFilterStability: (v: string | null) => void }) {
  const groups = CANON_TYPES.map(ct => ({ ...ct, items: records.filter(r => r.canonType === ct.key) })).filter(g => g.items.length > 0);
  const uncategorised = records.filter(r => !r.canonType);
  const hasFilter = !!(filterType || filterVisibility || filterStability);

  return (
    <div className="flex flex-col flex-none overflow-hidden border-r"
      style={{ width: 210, background: WARM_BG, borderColor: WARM_BORDER }}>
      {/* Filter chips — type (full labels for accessibility) */}
      <div className="px-3 py-2 border-b flex flex-wrap gap-1" style={{ borderColor: WARM_BORDER }}>
        {CANON_TYPES.map(t => {
          const active = filterType === t.key;
          return (
            <button key={t.key} onClick={() => setFilterType(active ? null : t.key)}
              aria-pressed={active}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide"
              style={active ? { background: `${t.color}20`, color: t.color } : { color: "#9CA3AF" }}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filter chips — visibility */}
      <div className="px-3 py-1.5 border-b flex flex-wrap gap-1" style={{ borderColor: WARM_BORDER }}>
        {VISIBILITY_OPTIONS.map(v => {
          const active = filterVisibility === v.key;
          return (
            <button key={v.key} onClick={() => setFilterVisibility(active ? null : v.key)}
              aria-pressed={active}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={active ? { background: `${CLAY}20`, color: CLAY } : { color: "#9CA3AF" }}>
              {v.label}
            </button>
          );
        })}
      </div>

      {/* Filter chips — stability */}
      <div className="px-3 py-1.5 border-b flex flex-wrap gap-1" style={{ borderColor: WARM_BORDER }}>
        {STABILITY_OPTIONS.map(s => {
          const active = filterStability === s.key;
          return (
            <button key={s.key} onClick={() => setFilterStability(active ? null : s.key)}
              aria-pressed={active}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
              style={active ? { background: `${CLAY}20`, color: CLAY } : { color: "#9CA3AF" }}>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Active filter banner — is itself a button so clicking clears all filters */}
      {hasFilter && (
        <button
          onClick={() => { setFilterType(null); setFilterVisibility(null); setFilterStability(null); }}
          className="w-full px-3 py-1.5 border-b text-left"
          style={{ background: `${CLAY}12`, borderColor: WARM_BORDER }}
        >
          <span className="text-[9.5px] font-semibold" style={{ color: CLAY }}>
            Filtered · {records.length}/{totalCount} shown
          </span>
        </button>
      )}

      {/* Record count — standalone count badge so getByText("5") resolves */}
      <div className="px-4 py-2 border-b flex items-center justify-between" style={{ borderColor: WARM_BORDER }}>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>
          Records
        </span>
        <span className="text-[10px] font-bold tabular-nums" style={{ color: "#9CA3AF" }}>
          {hasFilter ? `${records.length}/${totalCount}` : totalCount}
        </span>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto pb-4">
        {groups.map(g => (
          <div key={g.key}>
            <div className="px-4 mt-3 mb-1 text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: "#9CA3AF" }}>
              {g.label}s
            </div>
            {g.items.map(r => (
              <Link key={r.id} href={`/super/worldsmith/editorial/canon/${r.id}`}>
                <span className="flex items-center gap-2 px-4 cursor-pointer"
                  style={{
                    paddingTop: 6, paddingBottom: 6,
                    borderLeft: r.id === recordId ? `2px solid ${CLAY}` : "2px solid transparent",
                    background: r.id === recordId ? "rgba(255,255,255,0.6)" : "transparent",
                    paddingLeft: r.id === recordId ? 14 : 16,
                  }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: g.color, flexShrink: 0 }} />
                  <span className="flex-1 min-w-0 truncate text-xs"
                    style={{ color: r.id === recordId ? INK : "#6B7280", fontWeight: r.id === recordId ? 600 : 400 }}>
                    {r.name}
                  </span>
                  {g.key === "object" && (
                    <span title="Object with mystery" style={{ color: "#F59E0B", fontSize: 9, flexShrink: 0 }}>◆</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        ))}
        {uncategorised.length > 0 && (
          <div>
            <div className="px-4 mt-3 mb-1 text-[9px] font-bold uppercase tracking-[0.1em]" style={{ color: "#9CA3AF" }}>Uncategorised</div>
            {uncategorised.map(r => (
              <Link key={r.id} href={`/super/worldsmith/editorial/canon/${r.id}`}>
                <span className="flex items-center gap-2 px-4 py-1.5 cursor-pointer">
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D1D5DB", flexShrink: 0 }} />
                  <span className="flex-1 min-w-0 truncate text-xs" style={{ color: "#6B7280" }}>{r.name}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link href="/super/worldsmith/editorial/canon">
        <span className="flex-none w-full py-3 text-center text-xs font-semibold border-t cursor-pointer block"
          style={{ borderColor: WARM_BORDER, color: CLAY }}>+ New Record</span>
      </Link>
    </div>
  );
}

// ── Image Ideas Tab ────────────────────────────────────────────────────────────
function ImageIdeasTab({ ideas }: { ideas: ReturnType<typeof generateImageIdeas> }) {
  return (
    <div>
      <p className="text-xs mb-4" style={{ color: "#9CA3AF" }}>
        Based on this record, your world's atmosphere, and any connected objects
      </p>
      <div className="flex flex-col gap-3 mb-4">
        {ideas.map((idea, i) => {
          const isMystery = !!idea.object;
          return (
            <div key={i} className="rounded-xl p-4"
              style={{
                background: isMystery ? "#FFF8ED" : PARCHMENT,
                borderLeft: `4px solid ${isMystery ? AMBER : CLAY}`,
                border: isMystery ? `1px solid ${AMBER}40` : undefined,
              }}>
              {isMystery && (
                <div className="flex items-center gap-1.5 mb-2">
                  <span style={{ fontSize: 10, color: AMBER, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>◆ Object & Mystery</span>
                </div>
              )}
              <p className="font-serif italic leading-relaxed" style={{ fontSize: 13.5, color: INK }}>"{idea.prompt}"</p>
              <div className="flex justify-between items-center mt-3">
                <div className="flex gap-2 flex-wrap">
                  {idea.tags.map(t => <span key={t} style={{ fontSize: 10, color: "#9CA3AF" }}>{t}</span>)}
                </div>
                <button className="rounded-full text-white text-xs font-medium flex-shrink-0 ml-3"
                  style={{ background: isMystery ? AMBER : CLAY, padding: "5px 12px" }}>
                  Use this →
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mb-2">
        <input type="text" placeholder="Or describe your own image idea..."
          className="flex-1 text-sm outline-none rounded-l-lg px-3 py-2"
          style={{ border: `1px solid ${WARM_BORDER}`, borderRight: "none", background: "white" }} />
        <button className="text-sm font-medium text-white rounded-r-lg px-4 py-2" style={{ background: INK }}>
          Generate →
        </button>
      </div>
    </div>
  );
}

// ── Scene Builder Tab ──────────────────────────────────────────────────────────
function SceneBuilderTab({ record, relations }: { record: CanonRecord; relations: CanonRelation[] }) {
  const [selectedLocation, setSelectedLocation] = useState<string | null>(
    record.canonType === "location" ? record.name : null
  );
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const locations = record.canonType === "location"
    ? [record.name]
    : relations.filter(r => r.targetCanonType === "location").map(r => r.targetName);
  const characters = record.canonType === "character"
    ? [record.name]
    : relations.filter(r => r.targetCanonType === "character").map(r => r.targetName);
  const objects = record.canonType === "object"
    ? [{ name: record.name, mystery: record.sensoryClauses ?? "" }]
    : relations.filter(r => r.targetCanonType === "object").map(r => ({ name: r.targetName, mystery: "" }));

  const moods = ["Mysterious & Dark", "Quiet & Beautiful", "Eerie & Unsettling", "Warm & Intimate"];

  const assembledParts = [
    selectedLocation && selectedLocation,
    selectedChar && `${selectedChar} present`,
    selectedObject && `featuring ${selectedObject}`,
    selectedMood && selectedMood.toLowerCase(),
    "Victorian Gothic illustration",
  ].filter(Boolean);

  return (
    <div>
      <p className="text-xs mb-5" style={{ color: "#9CA3AF" }}>Pick what's in your scene — the prompt assembles itself</p>

      {locations.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Place</div>
          <div className="flex gap-2 flex-wrap">
            {locations.map(l => (
              <button key={l} onClick={() => setSelectedLocation(l === selectedLocation ? null : l)}
                className="rounded-full text-xs font-medium px-3 py-1.5"
                style={l === selectedLocation
                  ? { background: "#DBEAFE", color: "#1D4ED8", border: "1px solid #BFDBFE" }
                  : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
                {l === selectedLocation && "✓ "}{l}
              </button>
            ))}
          </div>
        </div>
      )}

      {characters.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Who's there</div>
          <div className="flex gap-2 flex-wrap">
            {characters.map(c => (
              <button key={c} onClick={() => setSelectedChar(c === selectedChar ? null : c)}
                className="rounded-full text-xs font-medium px-3 py-1.5"
                style={c === selectedChar
                  ? { background: "#EDE9FE", color: "#6D28D9", border: "1px solid #DDD6FE" }
                  : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
                {c === selectedChar && "✓ "}{c}
              </button>
            ))}
          </div>
        </div>
      )}

      {objects.length > 0 && (
        <div className="mb-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Object of mystery</div>
          <div className="flex flex-col gap-2">
            {objects.map(obj => (
              <button key={obj.name} onClick={() => setSelectedObject(obj.name === selectedObject ? null : obj.name)}
                className="rounded-xl p-3 text-left"
                style={obj.name === selectedObject
                  ? { background: AMBER_BG, border: `1px solid ${AMBER}` }
                  : { background: "white", border: `1px solid ${WARM_BORDER}` }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span style={{ color: AMBER, fontSize: 10 }}>◆</span>
                  <span className="text-xs font-medium" style={{ color: obj.name === selectedObject ? "#92400E" : INK }}>
                    {obj.name === selectedObject && "✓ "}{obj.name}
                  </span>
                </div>
                {obj.mystery && <p className="text-xs italic" style={{ color: obj.name === selectedObject ? "#B45309" : "#9CA3AF" }}>"{obj.mystery}"</p>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Mood</div>
        <div className="flex gap-2 flex-wrap">
          {moods.map(m => (
            <button key={m} onClick={() => setSelectedMood(m === selectedMood ? null : m)}
              className="rounded-lg text-xs font-medium px-3 py-2"
              style={m === selectedMood
                ? { background: INK, color: "white" }
                : { background: "white", color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
              {m === selectedMood && "✓ "}{m}
            </button>
          ))}
        </div>
      </div>

      {assembledParts.length > 0 && (
        <div className="rounded-xl p-4 mb-4" style={{ background: PARCHMENT, borderLeft: `4px solid ${AMBER}` }}>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Your image prompt</div>
          <p className="font-serif italic text-sm leading-relaxed" style={{ color: INK }}>
            {assembledParts.join(", ")}.
          </p>
        </div>
      )}

      <button disabled={assembledParts.length === 0}
        className="w-full rounded-lg font-semibold text-white text-sm py-3"
        style={{ background: assembledParts.length > 0 ? CLAY : "#D1D5DB", cursor: assembledParts.length > 0 ? "pointer" : "not-allowed" }}>
        Generate Image →
      </button>
    </div>
  );
}

// ── Daybook & Game Tab ─────────────────────────────────────────────────────────
function DaybookGameTab({ record, recordId }:
  { record: CanonRecord; recordId: string }) {
  const { data: storyLinksData } = useQuery<{ story_links: WsStoryLink[] }>({
    queryKey: ["editorial-story-links", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/story-links`),
    staleTime: 30_000,
  });
  const storyLinks = storyLinksData?.story_links ?? [];

  const { data: promptsData } = useQuery<{ journal_prompts: WsJournalPrompt[] }>({
    queryKey: ["editorial-journal-prompts", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/journal-prompts`),
    staleTime: 30_000,
  });
  const journalPrompts = promptsData?.journal_prompts ?? [];

  const { data: encountersData } = useQuery<{ encounters: WsEncounter[] }>({
    queryKey: ["editorial-encounters", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/encounters`),
    enabled: record.canonType === "location",
    staleTime: 30_000,
  });
  const encounters = encountersData?.encounters ?? [];

  return (
    <div>
      <p className="text-xs mb-5" style={{ color: "#9CA3AF" }}>How this record shapes your solo RPG game and its physical Daybook pages</p>

      {/* Story Role */}
      <div className="rounded-xl p-4 mb-4" style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}` }}>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen style={{ width: 14, height: 14, color: CLAY }} />
          <span className="text-sm font-semibold" style={{ color: INK, fontFamily: "'Playfair Display', serif" }}>Story Role</span>
        </div>
        {storyLinks.length === 0 ? (
          <div className="text-center py-3">
            <p className="text-xs italic mb-2" style={{ color: "#9CA3AF" }}>Not placed in any story yet</p>
            <Link href="/super/worldsmith/editorial/connections">
              <span className="text-xs font-medium cursor-pointer" style={{ color: CLAY }}>Add on the Story Map →</span>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {storyLinks.map(link => (
              <div key={link.storyId} className="flex items-center justify-between">
                <span className="text-sm" style={{ color: INK }}>{link.storyTitle ?? "Story"}</span>
                <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: "#E0E7FF", color: "#3730A3" }}>
                  {link.storyStatus ?? "draft"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Encounters (location only) */}
      {record.canonType === "location" && (
        <div className="rounded-xl p-4 mb-4" style={{ background: "#F0FDF4", border: `1px solid #BBF7D0` }}>
          <div className="flex items-center gap-2 mb-3">
            <Zap style={{ width: 14, height: 14, color: "#16A34A" }} />
            <span className="text-sm font-semibold" style={{ color: INK, fontFamily: "'Playfair Display', serif" }}>Encounters at this Location</span>
          </div>
          {encounters.length === 0 ? (
            <p className="text-xs italic" style={{ color: "#9CA3AF" }}>No encounters written yet — encounters describe what happens when a player arrives here</p>
          ) : (
            <div className="flex flex-col gap-3">
              {encounters.map(e => (
                <div key={e.id}>
                  <p className="text-sm italic leading-snug mb-1" style={{ color: "#166534" }}>"{e.description}"</p>
                  {e.rollType && <span className="text-[10px]" style={{ color: "#16A34A" }}>Roll: {e.rollType}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Journal Prompts */}
      <div className="rounded-xl p-4 mb-4" style={{ background: "#FFF8ED", border: `1px solid ${AMBER}40` }}>
        <div className="flex items-center gap-2 mb-3">
          <FileText style={{ width: 14, height: 14, color: AMBER }} />
          <span className="text-sm font-semibold" style={{ color: INK, fontFamily: "'Playfair Display', serif" }}>Session Journal Prompts</span>
          <span style={{ fontSize: 10, color: AMBER, marginLeft: "auto" }}>for the physical Daybook page</span>
        </div>
        {journalPrompts.length === 0 ? (
          <p className="text-xs italic" style={{ color: "#9CA3AF" }}>No journal prompts yet — these become the fill-in questions on a printed Daybook page</p>
        ) : (
          <div className="flex flex-col gap-3">
            {journalPrompts.map((p, i) => (
              <div key={p.id} className="flex gap-3">
                <span className="text-xs font-mono mt-0.5 flex-shrink-0" style={{ color: AMBER }}>{i + 1}.</span>
                <div>
                  <p className="text-sm" style={{ color: INK }}>{p.promptText}</p>
                  {p.hintLabel && <span className="text-[10px]" style={{ color: "#9CA3AF" }}>→ {p.hintLabel}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Physical page preview */}
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1px solid ${WARM_BORDER}` }}>
        <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: INK }}>
          <FileText style={{ width: 13, height: 13, color: "rgba(255,255,255,0.6)" }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.9)", letterSpacing: "0.06em" }}>
            Physical Daybook Page Preview
          </span>
          <span className="ml-auto text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            {record.canonType ?? "record"} · Wychcombe
          </span>
        </div>
        <div className="p-4" style={{ background: "#FDFBF7", fontFamily: "'Spectral', Georgia, serif" }}>
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>{record.name}</span>
            <span className="text-[10px] font-mono" style={{ color: "#D1D5DB" }}>
              {TYPE_PREFIX[record.canonType ?? ""] ?? "REC"}-001
            </span>
          </div>
          <div className="rounded-lg mb-3 flex items-center justify-center"
            style={{ height: 64, background: PARCHMENT, border: `1px dashed ${WARM_BORDER}` }}>
            <span className="text-xs italic" style={{ color: "#9CA3AF" }}>AI image generated from prompt</span>
          </div>
          {journalPrompts.length > 0 ? (
            journalPrompts.slice(0, 2).map((p, i) => (
              <div key={i} className="mb-2">
                <p className="text-[10px] italic mb-1" style={{ color: "#6B7280" }}>{p.promptText}</p>
                <div className="h-px w-full" style={{ background: "#E5E7EB" }} />
              </div>
            ))
          ) : (
            <div>
              <p className="text-[10px] italic mb-1" style={{ color: "#6B7280" }}>What did you notice here?</p>
              <div className="h-px w-full mb-2" style={{ background: "#E5E7EB" }} />
              <div className="h-px w-full" style={{ background: "#E5E7EB" }} />
            </div>
          )}
        </div>
      </div>

      <button className="w-full rounded-lg font-semibold text-white text-sm py-3" style={{ background: INK }}>
        Generate Daybook Pages →
      </button>
    </div>
  );
}

// ── Right Panel ────────────────────────────────────────────────────────────────
function RightPanel({ record, recordId, relations, allRecords, patchMutation, transitionMutation, deleteMutation, setShowDeleteConfirm, cascadeMutation, addRelMutation, removeRelMutation, patchRelTypeMutation, linkedSpecs, worldId }:
  { record: CanonRecord; recordId: string; relations: CanonRelation[]; allRecords: CanonListItem[];
    patchMutation: { mutate: (f: Record<string, unknown>) => void };
    transitionMutation: { mutate: (s: string) => void; isPending: boolean };
    deleteMutation: { isPending: boolean };
    setShowDeleteConfirm: (v: boolean) => void;
    cascadeMutation: { mutate: () => void; isPending: boolean };
    addRelMutation: { mutate: (a: { toId: string; type: string }) => void; isPending: boolean };
    removeRelMutation: { mutate: (id: string) => void };
    patchRelTypeMutation: { mutate: (a: { toId: string; type: string }) => void };
    linkedSpecs: LinkedSpec[];
    worldId: string;
  }) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [showAddRel, setShowAddRel] = useState(false);
  const [addRelSearch, setAddRelSearch] = useState("");
  const [addRelType, setAddRelType] = useState<RelationTypeKey>("related");

  const objectRelations = relations.filter(r => r.targetCanonType === "object");
  const storyLinks: WsStoryLink[] = []; // populated by DaybookGameTab's own query

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    proposed:     ["under_review", "rejected"],
    under_review: ["accepted", "superseded", "rejected", "proposed"],
    accepted:     ["superseded"],
    superseded:   [],
    rejected:     ["proposed"],
  };
  const TRANSITION_LABELS: Record<string, string> = {
    under_review: "Send for Review", accepted: "Accept", superseded: "Supersede",
    rejected: "Reject", proposed: "Reopen",
  };
  const transitions = ALLOWED_TRANSITIONS[record.status ?? "proposed"] ?? [];

  const addRelCandidates = allRecords.filter(r =>
    r.id !== recordId &&
    !relations.some(rel => rel.toRecordId === r.id) &&
    (addRelSearch.trim() === "" || r.name.toLowerCase().includes(addRelSearch.toLowerCase()))
  ).slice(0, 6);

  const regM = regMeta(record.emotionalRegister);

  return (
    <div className="flex-none flex flex-col gap-5 overflow-y-auto p-5"
      style={{ width: 280, background: PARCHMENT, borderLeft: `1px solid ${WARM_BORDER}` }}>

      {/* Objects & Mystery */}
      {objectRelations.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span style={{ color: AMBER, fontSize: 12 }}>◆</span>
            <span className="text-sm font-semibold" style={{ color: INK }}>Objects & Mystery</span>
          </div>
          <div className="flex flex-col gap-2">
            {objectRelations.map(rel => (
              <div key={rel.toRecordId} className="rounded-lg p-3" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F59E0B" }} />
                  <span className="text-xs font-semibold" style={{ color: INK }}>{rel.targetName}</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Eye style={{ width: 9, height: 9, color: AMBER }} />
                  <span style={{ fontSize: 10, color: AMBER }}>carries its own thread</span>
                </div>
              </div>
            ))}
          </div>
          <div className="my-4 border-t" style={{ borderColor: WARM_BORDER }} />
        </div>
      )}

      {/* Canon Gaps */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Sparkles size={12} style={{ color: CLAY }} />
          <span className="text-sm font-semibold" style={{ color: INK }}>Canon Gaps</span>
        </div>
        <div className="flex flex-col gap-2">
          {!record.emotionalRegister && (
            <div className="rounded-lg p-2.5" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
              <div className="text-xs font-semibold mb-0.5" style={{ color: INK }}>No emotional register</div>
              <p className="text-[11px]" style={{ color: "#6B7280" }}>Set via Record Details below</p>
            </div>
          )}
          {!record.narrativeDetails && (
            <div className="rounded-lg p-2.5" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
              <div className="text-xs font-semibold mb-0.5" style={{ color: INK }}>No story prose</div>
              <p className="text-[11px]" style={{ color: "#6B7280" }}>Write it in the main panel</p>
            </div>
          )}
          {objectRelations.length === 0 && record.canonType !== "object" && (
            <div className="rounded-lg p-2.5" style={{ background: "white", border: `1px solid ${WARM_BORDER}` }}>
              <div className="text-xs font-semibold mb-0.5" style={{ color: INK }}>No object connections</div>
              <p className="text-[11px]" style={{ color: "#6B7280" }}>Link an object to add mystery threads</p>
            </div>
          )}
          {(!record.emotionalRegister && !record.narrativeDetails && objectRelations.length > 0) && (
            <p className="text-[11px] italic" style={{ color: "#9CA3AF" }}>Looking good — no obvious gaps</p>
          )}
        </div>
      </div>

      <div className="border-t" style={{ borderColor: WARM_BORDER }} />

      {/* Record Details Accordion */}
      <div>
        <button onClick={() => setAdminOpen(o => !o)}
          className="w-full flex items-center justify-between py-1">
          <span className="text-sm font-semibold" style={{ color: INK }}>Record Details</span>
          {adminOpen ? <ChevronUp size={15} style={{ color: "#9CA3AF" }} /> : <ChevronDown size={15} style={{ color: "#9CA3AF" }} />}
        </button>

        {adminOpen && (
          <div className="mt-3 flex flex-col gap-4">
            {/* Status */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>Status & Transitions</div>
              <div className="flex gap-1.5 flex-wrap">
                {transitions.map(t => (
                  <button key={t} onClick={() => transitionMutation.mutate(t)} disabled={transitionMutation.isPending}
                    className="text-[11px] font-medium rounded-full px-2.5 py-1"
                    style={{ background: PARCHMENT, color: INK, border: `1px solid ${WARM_BORDER}` }}>
                    {TRANSITION_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Emotional Register */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>Emotional Register</div>
              <p className="text-[11px] leading-snug mb-2" style={{ color: "#B0A898" }}>
                The tonal lens this record casts on any scene that references it.
              </p>
              <RegisterPicker
                value={record.emotionalRegister} locked={record.registerLocked}
                onSelect={r => patchMutation.mutate({ emotional_register: r })}
                onToggleLock={() => patchMutation.mutate({ register_locked: !record.registerLocked })}
              />
              {regM && !record.registerLocked && (
                <button onClick={() => cascadeMutation.mutate()}
                  disabled={cascadeMutation.isPending}
                  className="mt-2 text-[11px] font-medium rounded-full px-2.5 py-1 w-full text-center"
                  style={{ background: `${regM.color}14`, color: regM.color, border: `1px solid ${regM.color}30` }}>
                  {cascadeMutation.isPending ? "Propagating…" : "Propagate to related records"}
                </button>
              )}
            </div>

            {/* Sensory Clauses */}
            <AutoField label="Sensory Clauses" field="sensoryClauses"
              value={record.sensoryClauses ?? ""} placeholder="Light, texture, smell…"
              onSave={(f, v) => patchMutation.mutate({ sensory_clauses: v })} rows={3} />

            {/* Visibility */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>Narrative Visibility</div>
              <p className="text-[11px] leading-snug mb-2" style={{ color: "#B0A898" }}>
                How directly this record surfaces in the narrative.
              </p>
              <div className="flex gap-1.5">
                {(["background", "hinted", "explicit"] as const).map(v => {
                  const tips: Record<string, string> = {
                    background: "Never encountered directly — shapes atmosphere and world-feel only",
                    hinted:     "Alluded to or felt; readers sense it without full exposure",
                    explicit:   "Appears openly; characters encounter or interact with it directly",
                  };
                  return (
                    <button key={v}
                      onClick={() => patchMutation.mutate({ narrative_visibility: v === record.narrativeVisibility ? null : v })}
                      title={tips[v]}
                      className="text-[11px] font-medium rounded-full px-2.5 py-1 capitalize"
                      style={v === record.narrativeVisibility
                        ? { background: INK, color: "white" }
                        : { background: PARCHMENT, color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
                      {v}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {(["background", "hinted", "explicit"] as const).map(v => {
                  const desc: Record<string, string> = {
                    background: "Shapes atmosphere only",
                    hinted:     "Felt but not named",
                    explicit:   "Directly encountered",
                  };
                  return (
                    <p key={v} className="text-[10px] text-center leading-tight" style={{ color: "#C4BAB0" }}>
                      {desc[v]}
                    </p>
                  );
                })}
              </div>
            </div>

            {/* Canon Stability */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>Canon Stability</div>
              <p className="text-[11px] leading-snug mb-2" style={{ color: "#B0A898" }}>
                How fixed this record is within the world's canon.
              </p>
              <div className="flex gap-1.5">
                {(["low", "medium", "high"] as const).map(s => {
                  const tips: Record<string, string> = {
                    low:    "Provisional — may change as the story develops",
                    medium: "Established but open to refinement",
                    high:   "Foundational — changes here ripple through the entire world",
                  };
                  return (
                    <button key={s}
                      onClick={() => patchMutation.mutate({ canon_stability: s === record.canonStability ? null : s })}
                      title={tips[s]}
                      className="text-[11px] font-medium rounded-full px-2.5 py-1 capitalize"
                      style={s === record.canonStability
                        ? { background: INK, color: "white" }
                        : { background: PARCHMENT, color: "#6B7280", border: `1px solid ${WARM_BORDER}` }}>
                      {s}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {(["low", "medium", "high"] as const).map(s => {
                  const desc: Record<string, string> = {
                    low:    "Provisional",
                    medium: "Established",
                    high:   "Foundational",
                  };
                  return (
                    <p key={s} className="text-[10px] text-center leading-tight" style={{ color: "#C4BAB0" }}>
                      {desc[s]}
                    </p>
                  );
                })}
              </div>
            </div>

            {/* Historical Context */}
            <AutoField label="Historical Context" field="historicalContext"
              value={record.historicalContext ?? ""} placeholder="Historical or temporal grounding…"
              onSave={(f, v) => patchMutation.mutate({ historical_context: v })} rows={3} />

            {/* Visual Notes */}
            <AutoField label="Visual Notes" field="visualNotes"
              value={record.visualNotes ?? ""} placeholder="What this looks like…"
              onSave={(f, v) => patchMutation.mutate({ visual_notes: v })} rows={3} />

            {/* Relations */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Related Canon</div>
                <button onClick={() => setShowAddRel(o => !o)} className="text-[11px] flex items-center gap-0.5" style={{ color: CLAY }}>
                  <Plus size={10} /> Add
                </button>
              </div>
              {showAddRel && (
                <div className="mb-3">
                  <input value={addRelSearch} onChange={e => setAddRelSearch(e.target.value)}
                    placeholder="Search records…"
                    className="w-full text-xs rounded-lg px-2.5 py-2 mb-2 outline-none"
                    style={{ border: `1px solid ${WARM_BORDER}`, background: "white" }} />
                  <select value={addRelType} onChange={e => setAddRelType(e.target.value as RelationTypeKey)}
                    className="w-full text-xs rounded-lg px-2 py-1.5 mb-2 outline-none"
                    style={{ border: `1px solid ${WARM_BORDER}`, background: "white" }}>
                    {RELATION_TYPES.map(rt => <option key={rt.key} value={rt.key}>{rt.label}</option>)}
                  </select>
                  {addRelCandidates.map(c => (
                    <button key={c.id} onClick={() => { addRelMutation.mutate({ toId: c.id, type: addRelType }); setShowAddRel(false); setAddRelSearch(""); }}
                      className="w-full text-left text-xs px-2.5 py-1.5 rounded-lg mb-1 flex items-center gap-2"
                      style={{ background: PARCHMENT, color: INK }}>
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: CANON_TYPES.find(t => t.key === c.canonType)?.color ?? "#D1D5DB" }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {relations.map(rel => (
                  <div key={rel.toRecordId} className="flex items-center gap-2 text-xs py-1">
                    <Link2 size={9} style={{ color: "#9CA3AF" }} />
                    <span className="flex-1 truncate" style={{ color: INK }}>{rel.targetName}</span>
                    <span style={{ color: "#9CA3AF", fontSize: 10 }}>{relTypeMeta(rel.relationType).label}</span>
                    <button onClick={() => removeRelMutation.mutate(rel.toRecordId)} style={{ color: "#9CA3AF" }}>
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Linked Specs */}
            {linkedSpecs.length > 0 && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#9CA3AF" }}>Linked Specs</div>
                {linkedSpecs.map(s => (
                  <Link key={s.id} href={`/super/worldsmith/editorial/specs/${s.id}`}>
                    <span className="flex items-center gap-2 text-xs py-1 hover:opacity-70 cursor-pointer">
                      <ExternalLink size={9} style={{ color: "#9CA3AF" }} />
                      <span className="truncate" style={{ color: INK }}>{s.productionItem}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {/* Delete */}
            <div className="pt-2 border-t" style={{ borderColor: WARM_BORDER }}>
              <button onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium"
                style={{ color: "#9B1C1C", border: "1px solid #FEE2E2", background: "#FFF5F5" }}>
                <Trash2 size={11} /> Delete record
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function WorldsmithCanon({ recordId }: { recordId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { worlds, selectedWorldId, setSelectedWorldId, updateWorld } = useEditorial();
  const [activeTab, setActiveTab] = useState<"ideas" | "scene" | "daybook">("ideas");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [filterVisibility, setFilterVisibility] = useState<string | null>(null);
  const [filterStability, setFilterStability] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [hydratedWorldId, setHydratedWorldId] = useState<string | null>(null);

  const world = worlds.find(w => w.id === selectedWorldId) ?? worlds[0] ?? null;

  // ── Record ──────────────────────────────────────────────────────────────────
  const { data: recordData, isLoading, error } = useQuery<{ canon_record: CanonRecord }>({
    queryKey: ["editorial-canon-record", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}`),
    staleTime: 30_000,
  });
  const record = recordData?.canon_record ?? null;
  const recordWorld = record ? (worlds.find(w => w.id === record.worldId) ?? null) : world;
  const worldId = record?.worldId ?? selectedWorldId ?? "";

  // ── Record list for rail ────────────────────────────────────────────────────
  const { data: listData } = useQuery<{ canon_records: CanonListItem[] }>({
    queryKey: ["editorial-canon-library", worldId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records?world_id=${worldId}&limit=200`),
    enabled: !!worldId, staleTime: 30_000,
  });
  const allRecords: CanonListItem[] = listData?.canon_records ?? [];
  const filteredRecords = allRecords.filter(r => {
    if (filterVisibility && r.narrativeVisibility !== filterVisibility) return false;
    if (filterStability && r.canonStability !== filterStability) return false;
    if (filterType && r.canonType !== filterType) return false;
    return true;
  });

  // ── Filter persistence ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!worldId || worldId === hydratedWorldId) return;
    const saved = loadPersistedFilters(worldId);
    setFilterVisibility(saved.visibility); setFilterStability(saved.stability); setFilterType(saved.type);
    setHydratedWorldId(worldId);
  }, [worldId, hydratedWorldId]);
  useEffect(() => {
    if (!worldId || worldId !== hydratedWorldId) return;
    savePersistedFilters(worldId, { visibility: filterVisibility, stability: filterStability, type: filterType });
  }, [worldId, hydratedWorldId, filterVisibility, filterStability, filterType]);

  // ── Linked specs ────────────────────────────────────────────────────────────
  const { data: specsData } = useQuery<{ specs: LinkedSpec[] }>({
    queryKey: ["editorial-canon-record-specs", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/specs`),
    enabled: !!record, staleTime: 30_000,
  });
  const linkedSpecs = specsData?.specs ?? [];

  // ── Mutations ───────────────────────────────────────────────────────────────
  const patchMutation = useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}`, {
        method: "PATCH", body: JSON.stringify(fields),
      }),
    onSuccess: (result) => {
      qc.setQueryData(["editorial-canon-record", recordId], { canon_record: result.canon_record });
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const transitionMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}/transition`, {
        method: "POST", body: JSON.stringify({ status }),
      }),
    onSuccess: (result) => {
      qc.setQueryData(["editorial-canon-record", recordId], { canon_record: result.canon_record });
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
      toast({ title: `Moved to ${result.canon_record.status.replace(/_/g, " ")}` });
    },
    onError: () => toast({ title: "Transition failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
      toast({ title: "Canon record deleted" });
      navigate("/super/worldsmith/editorial/canon");
    },
    onError: () => { toast({ title: "Delete failed", variant: "destructive" }); setShowDeleteConfirm(false); },
  });

  // ── Relations ───────────────────────────────────────────────────────────────
  const { data: relationsData } = useQuery<{ relations: CanonRelation[] }>({
    queryKey: ["editorial-canon-record-relations", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/relations`),
    enabled: !!record, staleTime: 30_000,
  });
  const relations: CanonRelation[] = relationsData?.relations ?? [];

  const { data: inboundRelData } = useQuery<{ inbound_relations: InboundRelation[] }>({
    queryKey: ["editorial-canon-record-inbound-relations", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/inbound-relations`),
    enabled: !!record, staleTime: 30_000,
  });

  const addRelMutation = useMutation({
    mutationFn: ({ toId, type }: { toId: string; type: string }) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/relations`, {
        method: "POST", body: JSON.stringify({ to_record_id: toId, relation_type: type }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["editorial-canon-record-relations", recordId] }); },
    onError: () => toast({ title: "Failed to add relation", variant: "destructive" }),
  });

  const patchRelTypeMutation = useMutation({
    mutationFn: ({ toId, type }: { toId: string; type: string }) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/relations/${toId}`, {
        method: "PATCH", body: JSON.stringify({ relation_type: type }),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["editorial-canon-record-relations", recordId] }); },
    onError: () => toast({ title: "Failed to update relation type", variant: "destructive" }),
  });

  const removeRelMutation = useMutation({
    mutationFn: (toId: string) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/relations/${toId}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["editorial-canon-record-relations", recordId] }); },
    onError: () => toast({ title: "Failed to remove relation", variant: "destructive" }),
  });

  const cascadeMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number; skipped_locked: number; register: string }>(
        `/v1/editorial/canon-records/${recordId}/cascade-register`, { method: "POST" }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
      toast({ title: result.updated > 0 ? `Propagated to ${result.updated} record${result.updated !== 1 ? "s" : ""}` : "No related records to update" });
    },
    onError: () => toast({ title: "Cascade failed", variant: "destructive" }),
  });

  const worldBibleMutation = useMutation({
    mutationFn: (fields: {
      visualPalette: string | null;
      proseVoice: string | null;
      atmosphericNotes: string | null;
      materialWorld: string | null;
      worldRules: string[];
    }) =>
      apiFetch<WorldRecord>(`/v1/worldsmith/worlds/${encodeURIComponent(worldId)}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      }),
    onSuccess: (updatedWorld) => {
      updateWorld(updatedWorld);
      toast({ title: "World Bible saved" });
    },
    onError: () => toast({ title: "Failed to save World Bible", variant: "destructive" }),
  });

  // ── Field handler ───────────────────────────────────────────────────────────
  const handleField = useCallback((field: string, value: string) => {
    const map: Record<string, string> = {
      narrativeDetails: "narrative_details",
      historicalContext: "historical_context",
      visualNotes: "visual_notes",
      sensoryClauses: "sensory_clauses",
      notes: "notes",
    };
    patchMutation.mutate({ [map[field] ?? field]: value });
  }, [patchMutation]);

  // ── Copilot ─────────────────────────────────────────────────────────────────
  const [copilotOpen, setCopilotOpen] = useState(false);

  // ── Portrait upload ──────────────────────────────────────────────────────────
  const [portraitUploading, setPortraitUploading] = useState(false);
  const handlePortraitUpload = useCallback(async (file: File) => {
    setPortraitUploading(true);
    try {
      const { uploadURL, objectPath } = await storageApi.requestUploadUrl(file.name, file.size, file.type);
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      patchMutation.mutate({ portrait_url: objectPath });
    } catch {
      toast({ title: "Portrait upload failed", variant: "destructive" });
    } finally {
      setPortraitUploading(false);
    }
  }, [patchMutation, toast]);

  // ── Loading / error ─────────────────────────────────────────────────────────
  if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" style={{ color: CLAY }} /></div>;
  if (error || !record) return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <AlertCircle className="w-7 h-7 opacity-30" style={{ color: INK }} />
      <p className="text-sm" style={{ color: INK }}>Canon record not found.</p>
      <button onClick={() => navigate("/super/worldsmith/editorial/canon")} className="text-sm underline" style={{ color: CLAY }}>Back to library</button>
    </div>
  );

  // ── Derived ─────────────────────────────────────────────────────────────────
  const typeMeta  = CANON_TYPES.find(t => t.key === record.canonType) ?? null;
  const statusMeta = STATUS_META[record.status ?? "proposed"] ?? STATUS_META.proposed;
  const recordIndex = allRecords.findIndex(r => r.id === recordId);
  const idStamp = recordWorld ? displayId(recordWorld.code.toUpperCase(), recordId, Math.max(0, recordIndex), record.canonType) : "—";
  const imageIdeas = generateImageIdeas(record, recordWorld);

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: "ideas",   label: "✦ Image Ideas"     },
    { id: "scene",   label: "Compose a Scene"   },
    { id: "daybook", label: "📖 Daybook & Game"  },
  ];

  return (
    <div className="flex flex-col" style={{ height: "100dvh", background: WARM_WHITE, fontFamily: "'Instrument Sans', sans-serif" }}>

      {/* TOP BAR */}
      <header className="shrink-0 flex items-center px-5 gap-3 border-b"
        style={{ height: 48, background: "white", borderColor: WARM_BORDER }}>
        <button onClick={() => navigate("/super/worldsmith/editorial/canon")}
          className="flex items-center gap-1 text-sm shrink-0" style={{ color: "#9CA3AF" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <select value={selectedWorldId ?? ""} onChange={e => setSelectedWorldId(e.target.value)}
          className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer" style={{ color: INK }}>
          {worlds.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
        </select>
        <span style={{ color: WARM_BORDER }}>/</span>
        <span className="text-sm truncate" style={{ color: "#9CA3AF" }}>{record.name}</span>

        <nav className="flex items-center gap-0.5 mx-auto">
          {(["Canon", "Prompt modules", "Style guides", "Visual assets"] as const).map(tab => {
            const href = {
              "Canon": "/super/worldsmith/editorial/canon",
              "Prompt modules": "/super/worldsmith/editorial/modules",
              "Style guides": "/super/worldsmith/editorial/style-guides",
              "Visual assets": "/super/worldsmith/editorial/board",
            }[tab];
            const active = tab === "Canon";
            return (
              <Link key={tab} href={href}>
                <span className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                  style={{ background: active ? PARCHMENT : "transparent", color: active ? INK : "#9CA3AF" }}>
                  {tab}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {record.notionPageId && (
            <a href={`https://notion.so/${record.notionPageId.replace(/-/g, "")}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium"
              style={{ background: "#EAF5EE", color: "#065F46" }}>
              <ExternalLink className="w-3 h-3" /> Notion
            </a>
          )}
        </div>
      </header>

      {/* BODY */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT RAIL */}
        <LeftRail
          records={filteredRecords} totalCount={allRecords.length} recordId={recordId}
          filterType={filterType} filterVisibility={filterVisibility} filterStability={filterStability}
          setFilterType={setFilterType} setFilterVisibility={setFilterVisibility} setFilterStability={setFilterStability}
        />

        {/* MAIN */}
        <main className="flex-1 overflow-y-auto px-10 py-8" style={{ background: WARM_WHITE }}>
          <div style={{ maxWidth: 680 }}>
            {/* Portrait + name row */}
            <div className="flex items-start gap-5 mb-8">
              <PortraitWell
                portraitUrl={record.portraitUrl}
                onUpload={handlePortraitUpload}
                isUploading={portraitUploading}
              />
              <div className="flex-1 min-w-0">
                <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: INK, fontWeight: 600, marginBottom: 8, lineHeight: 1.15 }}>
                  {record.name}
                </h1>
                {/* Badges row */}
                <div className="flex items-center flex-wrap gap-3">
                  {typeMeta && (
                    <span className="rounded-full text-xs px-2.5 py-0.5 font-medium"
                      style={{ background: `${typeMeta.color}20`, color: typeMeta.color }}>
                      {typeMeta.label}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "'Space Mono', monospace" }}>{idStamp}</span>
                  <span className="rounded-full text-[10px] font-semibold px-2 py-0.5"
                    style={{ background: statusMeta.bg, color: statusMeta.color }}>
                    {statusMeta.label}
                  </span>
                </div>
              </div>
            </div>

            {recordWorld && (
              <WorldBibleStrip
                world={recordWorld}
                onSave={fields => worldBibleMutation.mutateAsync(fields)}
                isSaving={worldBibleMutation.isPending}
              />
            )}

            {/* Prose textarea */}
            <div className="relative group mb-8">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>Narrative</p>
                <button
                  onClick={() => setCopilotOpen(o => !o)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-semibold border transition-colors ${
                    copilotOpen ? "text-white border-transparent" : "border-border hover:border-foreground/30"
                  }`}
                  style={copilotOpen ? { background: INK } : { color: INK }}
                >
                  <Sparkles className="w-3 h-3" /> Co-write
                </button>
              </div>
              <AutoField label="" field="narrativeDetails" value={record.narrativeDetails}
                placeholder="Write this record's story here — how it exists in your world, what it feels like, what it carries…"
                onSave={handleField} rows={5} />
            </div>

            {/* Notes */}
            <NotesField value={record.notes ?? ""} onSave={v => handleField("notes", v)} />

            {/* Tabs */}
            <div className="flex mb-6" style={{ borderBottom: `1px solid ${WARM_BORDER}` }}>
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className="pb-2.5 mr-7 text-sm font-medium"
                  style={{
                    borderBottom: activeTab === tab.id ? `2px solid ${CLAY}` : "2px solid transparent",
                    color: activeTab === tab.id ? CLAY : "#9CA3AF",
                    marginBottom: -1,
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "ideas" && <ImageIdeasTab ideas={imageIdeas} />}
            {activeTab === "scene" && <SceneBuilderTab record={record} relations={relations} />}
            {activeTab === "daybook" && <DaybookGameTab record={record} recordId={recordId} />}
          </div>
        </main>

        {/* RIGHT PANEL / COPILOT */}
        {copilotOpen ? (
          <CopilotPanel
            isOpen
            onClose={() => setCopilotOpen(false)}
            storageKey={`copilot-canon-${record.id}`}
            title="Canon Copilot"
            activeFieldLabel="Narrative"
            greeting={`I'm here to help you write the narrative for ${record.name}. Tell me how this ${(CANON_TYPES.find(t => t.key === record.canonType)?.label ?? "record").toLowerCase()} exists in your world — even a rough impression is enough to start.`}
            onSend={async (message, history) =>
              apiFetch<{ reply: string }>("/v1/worldsmith/copilot", {
                method: "POST",
                body: JSON.stringify({
                  surface: "canon_record",
                  worldId: recordWorld?.id,
                  field: "narrativeDetails",
                  fieldLabel: "Narrative",
                  message,
                  history,
                  context: {
                    recordName: record.name,
                    recordType: record.canonType,
                    draft: {
                      narrativeDetails: record.narrativeDetails ?? "",
                      notes: record.notes ?? "",
                    },
                    // Pass a summary of all records so the copilot can reason
                    // holistically about the world — relationships, consistency, gaps.
                    relatedRecords: allRecords
                      .filter(r => r.id !== record.id)
                      .slice(0, 120)
                      .map(r => ({ name: r.name, type: r.canonType })),
                  },
                }),
              })
            }
            onCaptureTarget={() => ({ key: "narrativeDetails", label: "Narrative" })}
            onApply={(text, key) => handleField(key || "narrativeDetails", text.trim())}
            panelStyle={{ position: "sticky", top: 0, maxHeight: "100dvh", minHeight: "auto", height: "100%", borderRadius: 0, borderLeft: `1px solid ${WARM_BORDER}`, borderTop: "none", borderRight: "none", borderBottom: "none" }}
            className="!rounded-none !border-l !border-t-0 !border-r-0 !border-b-0 !sticky !top-0"
          />
        ) : (
          <RightPanel
            record={record} recordId={recordId} relations={relations} allRecords={allRecords}
            patchMutation={patchMutation} transitionMutation={transitionMutation}
            deleteMutation={deleteMutation} setShowDeleteConfirm={setShowDeleteConfirm}
            cascadeMutation={cascadeMutation} addRelMutation={addRelMutation}
            removeRelMutation={removeRelMutation} patchRelTypeMutation={patchRelTypeMutation}
            linkedSpecs={linkedSpecs} worldId={worldId}
          />
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-2xl p-6 shadow-xl" style={{ background: "white", maxWidth: 360, width: "100%" }}>
            <h3 className="font-semibold mb-2" style={{ color: INK }}>Delete "{record.name}"?</h3>
            <p className="text-sm mb-5" style={{ color: "#6B7280" }}>This cannot be undone. All relations will be removed.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg py-2 text-sm font-medium" style={{ border: `1px solid ${WARM_BORDER}`, color: "#6B7280" }}>
                Cancel
              </button>
              <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                className="flex-1 rounded-lg py-2 text-sm font-medium text-white" style={{ background: "#DC2626" }}>
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorldBibleStrip({
  world,
  onSave,
  isSaving,
}: {
  world: {
    id: string;
    name: string;
    visualPalette?: string | null;
    proseVoice?: string | null;
    atmosphericNotes?: string | null;
    materialWorld?: string | null;
    worldRules?: string[] | null;
  };
  onSave: (fields: {
    visualPalette: string | null;
    proseVoice: string | null;
    atmosphericNotes: string | null;
    materialWorld: string | null;
    worldRules: string[];
  }) => Promise<unknown>;
  isSaving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    visualPalette: world.visualPalette ?? "",
    proseVoice: world.proseVoice ?? "",
    atmosphericNotes: world.atmosphericNotes ?? "",
    materialWorld: world.materialWorld ?? "",
    worldRules: (world.worldRules ?? []).join("\n"),
  }));

  useEffect(() => {
    if (!editing) {
      setForm({
        visualPalette: world.visualPalette ?? "",
        proseVoice: world.proseVoice ?? "",
        atmosphericNotes: world.atmosphericNotes ?? "",
        materialWorld: world.materialWorld ?? "",
        worldRules: (world.worldRules ?? []).join("\n"),
      });
    }
  }, [
    editing,
    world.id,
    world.visualPalette,
    world.proseVoice,
    world.atmosphericNotes,
    world.materialWorld,
    world.worldRules,
  ]);

  const startEditing = () => {
    setForm({
      visualPalette: world.visualPalette ?? "",
      proseVoice: world.proseVoice ?? "",
      atmosphericNotes: world.atmosphericNotes ?? "",
      materialWorld: world.materialWorld ?? "",
      worldRules: (world.worldRules ?? []).join("\n"),
    });
    setEditing(true);
  };

  const save = () => {
    void onSave({
      visualPalette: form.visualPalette.trim() || null,
      proseVoice: form.proseVoice.trim() || null,
      atmosphericNotes: form.atmosphericNotes.trim() || null,
      materialWorld: form.materialWorld.trim() || null,
      worldRules: form.worldRules.split("\n").map(rule => rule.trim()).filter(Boolean),
    }).then(() => setEditing(false)).catch(() => {});
  };

  const hasBibleContent = WORLD_BIBLE_FIELDS.some(({ key }) => !!world[key]?.trim())
    || (world.worldRules?.length ?? 0) > 0;

  return (
    <section className="group rounded-xl p-4 mb-8" style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}` }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5" style={{ color: CLAY }} />
            <h2 className="text-[11px] font-bold uppercase tracking-widest" style={{ color: INK }}>World Bible</h2>
          </div>
          <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
            Aesthetic context for {world.name}
          </p>
        </div>
        {!editing && (
          <button
            onClick={startEditing}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold opacity-75 hover:opacity-100"
            style={{ color: INK, border: `1px solid ${WARM_BORDER}`, background: WARM_WHITE }}
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          {WORLD_BIBLE_FIELDS.map(({ key, label, placeholder }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>{label}</span>
              <textarea
                value={form[key]}
                onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))}
                rows={2}
                placeholder={placeholder}
                className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none"
                style={{ border: `1px solid ${WARM_BORDER}`, background: WARM_WHITE, color: INK, fontFamily: "'Spectral', Georgia, serif" }}
              />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#9CA3AF" }}>World Rules</span>
            <span className="text-[11px]" style={{ color: "#9CA3AF" }}>One rule per line. These constrain every generated output.</span>
            <textarea
              value={form.worldRules}
              onChange={event => setForm(current => ({ ...current, worldRules: event.target.value }))}
              rows={4}
              placeholder="No magic north of the Ridgeline…"
              className="w-full rounded-lg px-3 py-2 text-sm leading-relaxed resize-y focus:outline-none"
              style={{ border: `1px solid ${WARM_BORDER}`, background: WARM_WHITE, color: INK, fontFamily: "'Spectral', Georgia, serif" }}
            />
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => setEditing(false)}
              disabled={isSaving}
              className="rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ color: "#6B7280", border: `1px solid ${WARM_BORDER}`, background: WARM_WHITE }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: INK }}
            >
              <Save className="w-3 h-3" /> {isSaving ? "Saving…" : "Save World Bible"}
            </button>
          </div>
        </div>
      ) : hasBibleContent ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {WORLD_BIBLE_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>{label}</p>
              <p className="text-xs leading-relaxed" style={{ color: INK }}>{world[key] || "—"}</p>
            </div>
          ))}
          {(world.worldRules?.length ?? 0) > 0 && (
            <div className="col-span-2">
              <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "#9CA3AF" }}>World Rules</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {world.worldRules?.map((rule, index) => <li key={`${rule}-${index}`} className="text-xs leading-relaxed" style={{ color: INK }}>{rule}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs italic" style={{ color: "#9CA3AF" }}>No World Bible fields set yet. Click Edit to add the world's visual and tonal rules.</p>
      )}
    </section>
  );
}

const WORLD_BIBLE_FIELDS: { key: WorldBibleTextField; label: string; placeholder: string }[] = [
  { key: "visualPalette", label: "Visual Palette", placeholder: "Colours, lighting, textures…" },
  { key: "proseVoice", label: "Prose Voice", placeholder: "Register, rhythm, vocabulary…" },
  { key: "atmosphericNotes", label: "Atmospheric Notes", placeholder: "Temperature, sound, smell, mood…" },
  { key: "materialWorld", label: "Material World", placeholder: "Textures, surfaces, physical substances…" },
];
