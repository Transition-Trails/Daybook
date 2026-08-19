/**
 * CanonLibrary — Full-featured canon record management.
 *
 * Two auto-selected modes:
 *   Quick-start  (≤ QUICKSTART_THRESHOLD + no active filters):
 *     Welcoming type-card launcher, onboarding copy, existing records below.
 *   Full library (> threshold OR active search/filter):
 *     Search · type tabs · status chips · card/table toggle · bulk select.
 *
 * Clicking any record navigates to /super/worldsmith/editorial/canon/:id.
 */
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Plus, Search, RefreshCw, Loader2, X, LayoutGrid, Table2,
  User2, MapPin, Package, CalendarDays, BookMarked, Wind, Layers,
  BookOpen, ChevronRight, Clock, Sparkles, CheckCircle2, Download,
  GitBranch, Repeat2, Wand2, RotateCcw,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import { REGISTERS } from "./canon-registers";

// ── Type configuration ────────────────────────────────────────────────────────

interface TypeConfig {
  key: string;
  label: string;
  color: string;
  Icon: React.ElementType;
  desc: string;
  narrativePlaceholder: string;
  historicalPlaceholder: string;
  visualPlaceholder: string;
}

const CANON_TYPES: TypeConfig[] = [
  {
    key: "character", label: "Character", color: "#8B5CF6", Icon: User2,
    desc: "People, beings, and entities who inhabit your world",
    narrativePlaceholder: "Describe their role, motivation, and significance to the world…",
    historicalPlaceholder: "Where do they come from? What shaped them?",
    visualPlaceholder: "How do they appear? Distinctive features, typical dress…",
  },
  {
    key: "location", label: "Location", color: "#3B82F6", Icon: MapPin,
    desc: "Places, spaces, and geographical features",
    narrativePlaceholder: "Describe the place, its atmosphere, and narrative importance…",
    historicalPlaceholder: "How was it built or formed? How has it changed over time?",
    visualPlaceholder: "What does it look like? Light, materials, scale, texture…",
  },
  {
    key: "object", label: "Object", color: "#F59E0B", Icon: Package,
    desc: "Artifacts, tools, and significant items",
    narrativePlaceholder: "Describe the artifact, its purpose, and symbolic meaning…",
    historicalPlaceholder: "Who made it? What is its provenance?",
    visualPlaceholder: "Materials, patina, size, decorative elements…",
  },
  {
    key: "event", label: "Event", color: "#EC4899", Icon: CalendarDays,
    desc: "Historical moments and recurring occasions",
    narrativePlaceholder: "What happened, and why does it still matter?",
    historicalPlaceholder: "When did it occur? Who was involved?",
    visualPlaceholder: "What was the visual scene? Light, crowd, objects present…",
  },
  {
    key: "lore", label: "Lore", color: "#10B981", Icon: BookMarked,
    desc: "Rules, beliefs, and world-building facts",
    narrativePlaceholder: "State the fact, rule, or belief and its implications…",
    historicalPlaceholder: "How did this belief or rule come to be established?",
    visualPlaceholder: "Is there a symbolic visual form for this lore?",
  },
  {
    key: "atmosphere", label: "Atmosphere", color: "#C87560", Icon: Wind,
    desc: "Moods, tones, and sensory qualities",
    narrativePlaceholder: "Describe the mood and the feeling it evokes…",
    historicalPlaceholder: "When and where does this atmosphere occur?",
    visualPlaceholder: "Light quality, colour palette, textures, sounds implied…",
  },
  {
    key: "material", label: "Material", color: "#6B7280", Icon: Layers,
    desc: "Textures, fabrics, and physical substances",
    narrativePlaceholder: "Describe this material and its role in the world…",
    historicalPlaceholder: "Where does it come from? How is it produced or gathered?",
    visualPlaceholder: "Colour, texture, finish, typical application in compositions…",
  },
  {
    key: "relationship", label: "Relationship", color: "#06B6D4", Icon: GitBranch,
    desc: "Bonds and dynamics between entities in your world",
    narrativePlaceholder: "Describe the relationship and how it shapes the story…",
    historicalPlaceholder: "How did this relationship begin? How has it evolved?",
    visualPlaceholder: "How is this relationship expressed visually in the world?",
  },
  {
    key: "motif", label: "Motif", color: "#A855F7", Icon: Repeat2,
    desc: "Recurring symbols, patterns, and thematic elements",
    narrativePlaceholder: "Describe the motif and its symbolic significance…",
    historicalPlaceholder: "Where and when does this motif first appear in the canon?",
    visualPlaceholder: "How does this motif manifest visually across the world?",
  },
];

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "proposed", label: "Proposed" },
  { key: "under_review", label: "Under Review" },
  { key: "accepted", label: "Accepted" },
  { key: "superseded", label: "Superseded" },
  { key: "rejected", label: "Rejected" },
];

const VISIBILITY_OPTIONS = [
  { key: "all",        label: "All Visibility" },
  { key: "background", label: "Background" },
  { key: "hinted",     label: "Hinted" },
  { key: "explicit",   label: "Explicit" },
];

const STABILITY_OPTIONS = [
  { key: "all",    label: "All Stability" },
  { key: "low",    label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high",   label: "High" },
];
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  proposed:     { bg: "bg-gray-100",    text: "text-gray-600" },
  under_review: { bg: "bg-amber-100",   text: "text-amber-700" },
  accepted:     { bg: "bg-emerald-100", text: "text-emerald-700" },
  superseded:   { bg: "bg-gray-100",    text: "text-gray-400" },
  rejected:     { bg: "bg-red-100",     text: "text-red-600" },
};

const QUICKSTART_THRESHOLD = 8;

// ── Data types ────────────────────────────────────────────────────────────────

interface CanonRecord {
  id: string;
  worldId: string;
  name: string;
  status: string;
  canonType?: string | null;
  narrativeDetails: string;
  historicalContext: string;
  visualNotes: string;
  emotionalRegister?: string | null;
  narrativeVisibility?: string | null;
  canonStability?: string | null;
  specRefCount: number;
  notionPageId?: string | null;
  updatedAt: string;
}

interface CanonListResponse {
  canon_records: CanonRecord[];
  total: number;
  by_type: Record<string, number>;
}

function EmotionalRegisterBadge({ register }: { register?: string | null }) {
  const meta = REGISTERS.find(item => item.key === register);
  if (!meta) return null;

  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.key}
    </span>
  );
}

// ── CanonCard ────────────────────────────────────────────────────────────────

function CanonCard({ record }: { record: CanonRecord }) {
  const [, navigate] = useLocation();
  const type = CANON_TYPES.find(t => t.key === record.canonType);
  const typeColor = type?.color ?? "#9CA3AF";
  const status = STATUS_STYLES[record.status] ?? STATUS_STYLES.proposed;

  const ago = (() => {
    const diff = Date.now() - new Date(record.updatedAt).getTime();
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    return "just now";
  })();

  return (
    <button
      onClick={() => navigate(`/super/worldsmith/editorial/canon/${record.id}`)}
      className="group w-full text-left bg-white rounded-xl border p-4 hover:shadow-md transition-all"
      style={{ borderColor: "#E5E7EB" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {type && (
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0"
              style={{ background: `${typeColor}18`, color: typeColor }}
            >
              <type.Icon className="w-2.5 h-2.5" />
              {type.label}
            </span>
          )}
          <EmotionalRegisterBadge register={record.emotionalRegister} />
        </div>
        <ChevronRight
          className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
          style={{ color: "#C87560" }}
        />
      </div>

      <p className="text-sm font-semibold leading-snug mb-1.5" style={{ color: "#1B2A4A" }}>
        {record.name}
      </p>

      {record.narrativeDetails && (
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-3">
          {record.narrativeDetails}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${status.bg} ${status.text}`}>
          {record.status.replace("_", " ")}
        </span>
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          {record.specRefCount > 0 && (
            <span className="bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 font-medium">
              {record.specRefCount} spec{record.specRefCount !== 1 ? "s" : ""}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" />
            {ago}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── CanonTableRow ────────────────────────────────────────────────────────────

function CanonTableRow({ record, selected, onToggle }: {
  record: CanonRecord;
  selected: boolean;
  onToggle: () => void;
}) {
  const [, navigate] = useLocation();
  const type = CANON_TYPES.find(t => t.key === record.canonType);
  const typeColor = type?.color ?? "#9CA3AF";
  const status = STATUS_STYLES[record.status] ?? STATUS_STYLES.proposed;

  return (
    <tr
      className="border-b hover:bg-gray-50 cursor-pointer group"
      style={{ borderColor: "#F3F4F6" }}
      onClick={() => navigate(`/super/worldsmith/editorial/canon/${record.id}`)}
    >
      <td className="pl-4 pr-2 py-3" onClick={e => { e.stopPropagation(); onToggle(); }}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="rounded border-gray-300 cursor-pointer"
          onClick={e => e.stopPropagation()}
        />
      </td>
      <td className="px-3 py-3 w-28">
        {type && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 whitespace-nowrap"
            style={{ background: `${typeColor}18`, color: typeColor }}
          >
            <type.Icon className="w-2.5 h-2.5" />
            {type.label}
          </span>
        )}
      </td>
      <td className="px-3 py-3 font-medium text-sm" style={{ color: "#1B2A4A" }}>
        {record.name}
      </td>
      <td className="px-3 py-3 max-w-xs">
        <p className="text-xs text-gray-500 line-clamp-1">{record.narrativeDetails}</p>
      </td>
      <td className="px-3 py-3">
        <EmotionalRegisterBadge register={record.emotionalRegister} />
      </td>
      <td className="px-3 py-3">
        <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${status.bg} ${status.text}`}>
          {record.status.replace("_", " ")}
        </span>
      </td>
      <td className="px-3 py-3 text-center">
        {record.specRefCount > 0 && (
          <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{record.specRefCount}</span>
        )}
      </td>
      <td className="px-3 py-3">
        <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#C87560" }} />
      </td>
    </tr>
  );
}

// ── QuickStartTypeCard ───────────────────────────────────────────────────────

function QuickStartTypeCard({ type, onClick }: { type: TypeConfig; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-xl border p-4 hover:shadow-md transition-all"
      style={{ background: "white", borderColor: "#E5E7EB", borderLeftWidth: 3, borderLeftColor: type.color }}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${type.color}18` }}
        >
          <type.Icon className="w-3.5 h-3.5" style={{ color: type.color }} />
        </span>
        <span className="font-semibold text-sm" style={{ color: "#1B2A4A" }}>{type.label}</span>
        <ChevronRight
          className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: type.color }}
        />
      </div>
      <p className="text-xs text-gray-500 leading-relaxed pl-9">{type.desc}</p>
    </button>
  );
}

// ── CreateDrawer ────────────────────────────────────────────────────────────

function CreateDrawer({
  worldId,
  prefilledType,
  prefilledName,
  prefilledNarrative,
  onClose,
  onCreated,
}: {
  worldId: string;
  prefilledType: string;
  prefilledName?: string;
  prefilledNarrative?: string;
  onClose: () => void;
  onCreated: (record: CanonRecord) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(prefilledName ?? "");
  const [canonType, setCanonType] = useState(prefilledType);
  const [narrativeDetails, setNarrativeDetails] = useState(prefilledNarrative ?? "");
  const [historicalContext, setHistoricalContext] = useState("");
  const [visualNotes, setVisualNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const type = CANON_TYPES.find(t => t.key === canonType) ?? CANON_TYPES[0]!;

  useEffect(() => {
    setCanonType(prefilledType);
  }, [prefilledType]);

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 100);
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const result = await apiFetch<{ canon_record: CanonRecord }>("/v1/editorial/canon-records", {
        method: "POST",
        body: JSON.stringify({
          world_id: worldId,
          name: name.trim(),
          canon_type: canonType,
          narrative_details: narrativeDetails,
          historical_context: historicalContext,
          visual_notes: visualNotes,
        }),
      });
      toast({ title: `${type.label} "${name.trim()}" created` });
      onCreated(result.canon_record);
      onClose();
    } catch {
      toast({ title: "Failed to create canon record", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />

      {/* Drawer panel */}
      <div
        className="w-full bg-white flex shadow-2xl overflow-hidden"
        style={{ maxWidth: 448 }}
      >
        {/* ── Form side (always visible) ── */}
        <div className="w-full max-w-md flex flex-col shrink-0" style={{ width: 448 }}>
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "#E5E7EB" }}>
            <div>
              <h2 className="text-base font-semibold" style={{ color: "#1B2A4A" }}>New Canon Record</h2>
              <p className="text-xs text-gray-500 mt-0.5">Add an authoritative entry to your world's canon</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 ml-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Type selector */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-2">
                Canon Type
              </label>
              <div className="flex flex-wrap gap-2">
                {CANON_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setCanonType(t.key)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all"
                    style={
                      canonType === t.key
                        ? { background: `${t.color}18`, color: t.color, borderColor: `${t.color}60` }
                        : { color: "#6B7280", borderColor: "#E5E7EB", background: "white" }
                    }
                  >
                    <t.Icon className="w-3 h-3" />
                    {t.label}
                  </button>
                ))}
              </div>
              {type && (
                <p className="text-xs text-gray-400 mt-2 pl-0.5">{type.desc}</p>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                ref={nameRef}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && name.trim()) handleCreate(); }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none transition-colors"
                style={{ borderColor: "#E5E7EB" }}
                placeholder={`e.g. ${type?.key === "character" ? "Lady Arabella Montrose" : type?.key === "location" ? "The Botanical Library" : type?.key === "object" ? "The Brass Sextant" : "Add a name…"}`}
              />
            </div>

            <>
                {/* Narrative Details */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">
                    Narrative Details
                  </label>
                  <textarea
                    value={narrativeDetails}
                    onChange={e => setNarrativeDetails(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                    style={{ borderColor: "#E5E7EB" }}
                    rows={3}
                    placeholder={type?.narrativePlaceholder}
                  />
                </div>

                {/* Historical Context */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">
                    Historical Context
                  </label>
                  <textarea
                    value={historicalContext}
                    onChange={e => setHistoricalContext(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                    style={{ borderColor: "#E5E7EB" }}
                    rows={2}
                    placeholder={type?.historicalPlaceholder}
                  />
                </div>

                {/* Visual Notes */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1.5">
                    Visual Notes
                  </label>
                  <textarea
                    value={visualNotes}
                    onChange={e => setVisualNotes(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                    style={{ borderColor: "#E5E7EB" }}
                    rows={2}
                    placeholder={type?.visualPlaceholder}
                  />
                </div>
            </>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t flex items-center justify-between shrink-0" style={{ borderColor: "#E5E7EB" }}>
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || saving}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50 transition-opacity"
              style={{ background: "#1B2A4A" }}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? "Creating…" : "Create Record"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── BulkBar ──────────────────────────────────────────────────────────────────

function BulkBar({ count, onTransition, onClear }: {
  count: number;
  onTransition: (status: string) => void;
  onClear: () => void;
}) {
  const actions = [
    { label: "Send for Review", status: "under_review" },
    { label: "Accept", status: "accepted" },
    { label: "Reject", status: "rejected" },
  ];
  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl z-40"
      style={{ background: "#1B2A4A", color: "white", minWidth: 360 }}
    >
      <span className="text-sm font-medium mr-1">{count} selected</span>
      <div className="w-px h-4 bg-white/20" />
      {actions.map(a => (
        <button
          key={a.status}
          onClick={() => onTransition(a.status)}
          className="text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
        >
          {a.label}
        </button>
      ))}
      <button onClick={onClear} className="ml-auto p-1 hover:bg-white/10 rounded-lg">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── SuggestionsPanel ─────────────────────────────────────────────────────────

interface CanonSuggestion {
  name: string;
  canonType: string;
  rationale: string;
  narrativeDetails: string;
}

function SuggestionsPanel({
  worldId,
  worldName,
  onClose,
  onAdd,
}: {
  worldId: string;
  worldName: string;
  onClose: () => void;
  onAdd: (s: CanonSuggestion) => void;
}) {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<CanonSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusType, setFocusType] = useState("all");
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());

  const generate = async (type?: string) => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setAdded(new Set());
    try {
      const result = await apiFetch<{ suggestions: CanonSuggestion[] }>(
        "/v1/editorial/canon-records/suggest",
        {
          method: "POST",
          body: JSON.stringify({ world_id: worldId, focus_type: type && type !== "all" ? type : undefined }),
        },
      );
      setSuggestions(result.suggestions ?? []);
    } catch {
      setError("Couldn't generate suggestions. Check your world has a World Bible set, then try again.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-generate on mount
  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (s: CanonSuggestion) => {
    if (adding.has(s.name) || added.has(s.name)) return;
    setAdding(prev => new Set([...prev, s.name]));
    try {
      await apiFetch("/v1/editorial/canon-records", {
        method: "POST",
        body: JSON.stringify({
          world_id: worldId,
          name: s.name,
          canon_type: s.canonType,
          narrative_details: s.narrativeDetails,
        }),
      });
      setAdded(prev => new Set([...prev, s.name]));
      toast({ title: `"${s.name}" added to Canon Library` });
      onAdd(s);
    } catch {
      toast({ title: "Failed to add record", variant: "destructive" });
    } finally {
      setAdding(prev => { const n = new Set(prev); n.delete(s.name); return n; });
    }
  };

  const filtered = focusType === "all" ? suggestions : suggestions.filter(s => s.canonType === focusType);
  const suggestedTypes = [...new Set(suggestions.map(s => s.canonType))];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div
        className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden"
        style={{ borderLeft: "1px solid #E5E7EB" }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "#E5E7EB" }}>
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(200,117,96,0.12)" }}>
              <Wand2 className="w-3.5 h-3.5" style={{ color: "#C87560" }} />
            </span>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "#1B2A4A" }}>Suggested Records</h2>
              <p className="text-[11px] text-gray-400">AI-generated gaps for {worldName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => generate(focusType !== "all" ? focusType : undefined)}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-40"
              title="Regenerate suggestions"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Type filter pills */}
        {suggestions.length > 0 && (
          <div className="px-5 py-2.5 border-b flex items-center gap-1.5 overflow-x-auto shrink-0" style={{ borderColor: "#F3F4F6", background: "#FAFAFA" }}>
            {["all", ...suggestedTypes].map(t => {
              const cfg = CANON_TYPES.find(c => c.key === t);
              const active = focusType === t;
              return (
                <button
                  key={t}
                  onClick={() => setFocusType(t)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap shrink-0"
                  style={
                    active
                      ? { background: cfg?.color ?? "#1B2A4A", color: "white", borderColor: cfg?.color ?? "#1B2A4A" }
                      : { background: "white", color: "#6B7280", borderColor: "#E5E7EB" }
                  }
                >
                  {cfg?.Icon && <cfg.Icon className="w-2.5 h-2.5" />}
                  {t === "all" ? "All" : (cfg?.label ?? t)}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#C87560" }} />
              <p className="text-sm text-gray-500">Analysing your canon for gaps…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-16 text-center">
              <p className="text-sm text-gray-500">{error}</p>
              <button
                onClick={() => generate()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-white"
                style={{ background: "#1B2A4A" }}
              >
                <RotateCcw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          )}

          {!loading && !error && filtered.length === 0 && suggestions.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full py-16">
              <p className="text-sm text-gray-400">No suggestions yet.</p>
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="p-4 space-y-3">
              {filtered.map(s => {
                const cfg = CANON_TYPES.find(c => c.key === s.canonType);
                const isAdding = adding.has(s.name);
                const isAdded = added.has(s.name);
                return (
                  <div
                    key={s.name}
                    className="rounded-xl border p-4 transition-all"
                    style={{
                      borderColor: isAdded ? "#10B981" : "#E5E7EB",
                      background: isAdded ? "#F0FDF4" : "white",
                    }}
                  >
                    {/* Type badge */}
                    {cfg && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 mb-2"
                        style={{ background: `${cfg.color}18`, color: cfg.color }}
                      >
                        <cfg.Icon className="w-2.5 h-2.5" />
                        {cfg.label}
                      </span>
                    )}
                    <p className="text-sm font-semibold mb-1" style={{ color: "#1B2A4A" }}>{s.name}</p>
                    {s.rationale && (
                      <p className="text-[12px] text-gray-500 leading-relaxed mb-2">{s.rationale}</p>
                    )}
                    {s.narrativeDetails && (
                      <p className="text-[11.5px] text-gray-400 italic leading-relaxed mb-3 line-clamp-3">
                        {s.narrativeDetails}
                      </p>
                    )}
                    <button
                      onClick={() => handleAdd(s)}
                      disabled={isAdding || isAdded}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-60"
                      style={
                        isAdded
                          ? { background: "#10B98118", color: "#065F46" }
                          : { background: "#1B2A4A", color: "white" }
                      }
                    >
                      {isAdding ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : isAdded ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <Plus className="w-3 h-3" />
                      )}
                      {isAdded ? "Added" : isAdding ? "Adding…" : "Add to Library"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filter persistence (shared key with WorldsmithCanon) ─────────────────────

/** Must match the key produced by WorldsmithCanon's canonFilterKey helper. */
function canonFilterKey(worldId: string) {
  return `canon-filters-${worldId}`;
}

interface LibraryFilters {
  type: string;
  status: string;
  search: string;
  visibility: string;
  stability: string;
  emotionalRegister: string;
}
function loadLibraryFilters(worldId: string): LibraryFilters {
  try {
    const raw = sessionStorage.getItem(canonFilterKey(worldId));
    if (!raw) return { type: "all", status: "all", search: "", visibility: "all", stability: "all", emotionalRegister: "all" };
    const parsed = JSON.parse(raw);
    return {
      type:       typeof parsed.type       === "string" ? parsed.type       : "all",
      status:     typeof parsed.status     === "string" ? parsed.status     : "all",
      search:     typeof parsed.search     === "string" ? parsed.search     : "",
      // visibility / stability stored by detail view as null or a real value;
      // map null → "all" for the library's "no filter" sentinel
      visibility: typeof parsed.visibility === "string" ? parsed.visibility : "all",
      stability:  typeof parsed.stability  === "string" ? parsed.stability  : "all",
      emotionalRegister: typeof parsed.emotionalRegister === "string" ? parsed.emotionalRegister : "all",
    };
  } catch {
    return { type: "all", status: "all", search: "", visibility: "all", stability: "all", emotionalRegister: "all" };
  }
}

/**
 * Merges all five library filters back into the stored entry so the detail
 * view's own keys (emotionalRegister etc.) are not overwritten.
 * visibility / stability are stored as the raw value or null so the detail
 * view can read them; "all" is translated to null on write.
 */
function saveLibraryFilters(worldId: string, filters: LibraryFilters) {
  try {
    const existing = sessionStorage.getItem(canonFilterKey(worldId));
    const base = existing ? JSON.parse(existing) : {};
    sessionStorage.setItem(
      canonFilterKey(worldId),
      JSON.stringify({
        ...base,
        type:       filters.type,
        status:     filters.status,
        search:     filters.search,
        visibility: filters.visibility === "all" ? null : filters.visibility,
        stability:  filters.stability  === "all" ? null : filters.stability,
        emotionalRegister: filters.emotionalRegister === "all" ? null : filters.emotionalRegister,
      }),
    );
  } catch { /* storage full or unavailable — silently skip */ }
}

// ── Main CanonLibrary ────────────────────────────────────────────────────────

export default function CanonLibrary() {
  const { selectedWorldId, selectedWorld } = useEditorial();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [activeStatus, setActiveStatus] = useState("all");
  const [activeVisibility, setActiveVisibility] = useState("all");
  const [activeStability, setActiveStability] = useState("all");
  const [activeEmotionalRegister, setActiveEmotionalRegister] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Tracks which worldId filters were hydrated from so we don't re-hydrate
  // or persist prematurely (same guard pattern as WorldsmithCanon).
  const [hydratedWorldId, setHydratedWorldId] = useState<string | null>(null);

  // Hydrate all six filters from sessionStorage when selectedWorldId resolves
  // or changes.  Runs before the persist effect thanks to state sequencing.
  useEffect(() => {
    if (!selectedWorldId || selectedWorldId === hydratedWorldId) return;
    const saved = loadLibraryFilters(selectedWorldId);
    const validType =
      saved.type === "all" || CANON_TYPES.some(t => t.key === saved.type)
        ? saved.type
        : "all";
    const validStatus =
      STATUS_OPTIONS.some(s => s.key === saved.status) ? saved.status : "all";
    const validVisibility =
      VISIBILITY_OPTIONS.some(v => v.key === saved.visibility) ? saved.visibility : "all";
    const validStability =
      STABILITY_OPTIONS.some(s => s.key === saved.stability) ? saved.stability : "all";
    const validEmotionalRegister =
      saved.emotionalRegister === "all" || REGISTERS.some(r => r.key === saved.emotionalRegister)
        ? saved.emotionalRegister
        : "all";
    setActiveType(validType);
    setActiveStatus(validStatus);
    setSearch(saved.search);
    setActiveVisibility(validVisibility);
    setActiveStability(validStability);
    setActiveEmotionalRegister(validEmotionalRegister);
    setHydratedWorldId(selectedWorldId);
  }, [selectedWorldId, hydratedWorldId]);

  // Persist all six filters whenever they change — only after hydration.
  useEffect(() => {
    if (!selectedWorldId || selectedWorldId !== hydratedWorldId) return;
    saveLibraryFilters(selectedWorldId, {
      type:       activeType,
      status:     activeStatus,
      search,
      visibility: activeVisibility,
      stability:  activeStability,
      emotionalRegister: activeEmotionalRegister,
    });
  }, [selectedWorldId, hydratedWorldId, activeType, activeStatus, search, activeVisibility, activeStability, activeEmotionalRegister]);

  // Selection (table mode)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Create drawer
  const [showCreate, setShowCreate] = useState(false);
  const [prefilledType, setPrefilledType] = useState("location");
  const [prefilledName, setPrefilledName] = useState("");
  const [prefilledNarrative, setPrefilledNarrative] = useState("");

  // Auto-open the create drawer when navigated here with ?new=1&name=…&type=…&narrative=…
  // (e.g. from the editorial co-write panel's "Create record" button).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setPrefilledName(params.get("name") ?? "");
      setPrefilledType(params.get("type") ?? "location");
      setPrefilledNarrative(params.get("narrative") ?? "");
      setShowCreate(true);
      // Clean the URL so a refresh doesn't re-trigger the drawer
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Suggestions panel
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset selection when filters change
  useEffect(() => { setSelectedIds(new Set()); }, [activeType, activeStatus, activeVisibility, activeStability, activeEmotionalRegister, debouncedSearch]);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<CanonListResponse>({
    queryKey: ["editorial-canon-library", selectedWorldId],
    queryFn: () =>
      apiFetch<CanonListResponse>(`/v1/editorial/canon-records?world_id=${selectedWorldId}`),
    enabled: !!selectedWorldId,
    staleTime: 15_000,
    // The library is the source of truth for an editor's existing canon. Do not
    // leave a cached empty result on screen when returning to this route.
    refetchOnMount: "always",
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      apiFetch("/v1/editorial/canon-records/bulk-transition", {
        method: "POST",
        body: JSON.stringify({ ids, status }),
      }),
    onSuccess: (_d, vars) => {
      toast({ title: `${vars.ids.length} record${vars.ids.length !== 1 ? "s" : ""} moved to ${vars.status.replace("_", " ")}` });
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
    },
    onError: () => toast({ title: "Bulk update failed", variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ synced: number; created: number; updated: number; skipped: number }>(
        "/v1/editorial/canon-records/sync-notion",
        { method: "POST", body: JSON.stringify({ world_id: selectedWorldId }) },
      ),
    onSuccess: (d) => {
      toast({
        title: `Notion sync complete — ${d.created} new, ${d.updated} updated`,
        description: d.skipped > 0 ? `${d.skipped} page${d.skipped !== 1 ? "s" : ""} skipped (no name)` : undefined,
      });
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
    },
    onError: (err: Error) =>
      toast({
        title: "Notion sync failed",
        description: err.message ?? "Check that the world has a Notion Canon DB configured.",
        variant: "destructive",
      }),
  });

  const allRecords = data?.canon_records ?? [];
  const total = data?.total ?? 0;
  const byType = data?.by_type ?? {};

  // Client-side filter for search/type/status/visibility/stability/register
  const filtered = allRecords.filter(r => {
    if (activeType !== "all" && r.canonType !== activeType) return false;
    if (activeStatus !== "all" && r.status !== activeStatus) return false;
    if (activeVisibility !== "all" && r.narrativeVisibility !== activeVisibility) return false;
    if (activeStability !== "all" && r.canonStability !== activeStability) return false;
    if (activeEmotionalRegister !== "all" && r.emotionalRegister !== activeEmotionalRegister) return false;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.narrativeDetails?.toLowerCase().includes(q) ||
        r.historicalContext?.toLowerCase().includes(q) ||
        r.visualNotes?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const hasActiveFilter =
    !!debouncedSearch.trim() ||
    activeType !== "all" ||
    activeStatus !== "all" ||
    activeVisibility !== "all" ||
    activeStability !== "all" ||
    activeEmotionalRegister !== "all";

  // Quick-start is onboarding only — once any record exists, always show the
  // full library so deleting a record never flips the UI back to the launcher.
  const isQuickStart =
    !!data &&
    !isFetching &&
    total === 0 &&
    !hasActiveFilter;

  const openCreate = (type = "location") => {
    setPrefilledType(type);
    setShowCreate(true);
  };

  const handleCreated = () => {
    qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(r => r.id)));
  };

  if (!selectedWorldId) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-400">
        <BookOpen className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">Select a world to open the Canon Library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-6 py-3 flex items-center justify-between gap-4 shrink-0" style={{ borderColor: "#E5E7EB" }}>
        <div className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
          <span className="text-gray-400">WorldSmith</span>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-700 truncate">{selectedWorld?.name ?? "—"}</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 font-medium">Canon Library</span>
          {total > 0 && (
            <span className="text-[11px] bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium ml-1">
              {total}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => refetch()}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Refresh"
            disabled={syncMutation.isPending}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Pull records from your Notion canon database"
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            {syncMutation.isPending ? "Syncing…" : "Sync from Notion"}
          </button>
          <button
            onClick={() => setShowSuggestions(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors"
            style={
              showSuggestions
                ? { background: "#C87560", color: "white", borderColor: "#C87560" }
                : { background: "white", color: "#C87560", borderColor: "#C87560" }
            }
            title="AI-suggested records to fill gaps in your world's canon"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Suggest
          </button>
          <button
            onClick={() => openCreate()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
            style={{ background: "#1B2A4A" }}
          >
            <Plus className="w-4 h-4" />
            New Record
          </button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {isLoading || (!data && isFetching) ? (
        <div className="flex flex-col h-full items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : isError && !data ? (
        <div className="flex flex-col h-full items-center justify-center px-6 text-center">
          <BookOpen className="w-9 h-9 mb-3 text-gray-300" />
          <h1 className="text-base font-semibold" style={{ color: "#1B2A4A" }}>
            We couldn’t load your canon records.
          </h1>
          <p className="mt-1 max-w-sm text-sm text-gray-500">
            Your records have not been removed. Try loading the library again.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: "#1B2A4A" }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : isQuickStart ? (
        /* ── Quick-start ─────────────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto px-6 py-8 max-w-4xl mx-auto w-full">
          {/* Intro */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(200,117,96,0.12)" }}>
                <Sparkles className="w-4 h-4" style={{ color: "#C87560" }} />
              </div>
              <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#1B2A4A" }}>
                Build Your Canon Library
              </h1>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xl pl-11">
              Canon records are the authoritative reference that grounds every production spec in your
              world's truth. Start by choosing the type of record you'd like to add first.
            </p>
          </div>

          {/* Type starter cards */}
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
            Start with a type
          </p>
          <div className="grid grid-cols-2 gap-3 mb-8">
            {CANON_TYPES.map(type => (
              <QuickStartTypeCard
                key={type.key}
                type={type}
                onClick={() => openCreate(type.key)}
              />
            ))}
          </div>

          {/* Existing records (if any) */}
          {allRecords.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
                Existing records
              </p>
              <div className="space-y-2">
                {allRecords.map(record => (
                  <button
                    key={record.id}
                    onClick={() => navigate(`/super/worldsmith/editorial/canon/${record.id}`)}
                    className="w-full text-left flex items-center gap-3 bg-white rounded-lg border px-4 py-3 hover:shadow-sm transition-all"
                    style={{ borderColor: "#E5E7EB" }}
                  >
                    {(() => {
                      const t = CANON_TYPES.find(t => t.key === record.canonType);
                      return t ? (
                        <span
                          className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                          style={{ background: `${t.color}18` }}
                        >
                          <t.Icon className="w-3 h-3" style={{ color: t.color }} />
                        </span>
                      ) : null;
                    })()}
                    <span className="flex-1 text-sm font-medium" style={{ color: "#1B2A4A" }}>{record.name}</span>
                    <span className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${STATUS_STYLES[record.status]?.bg} ${STATUS_STYLES[record.status]?.text}`}>
                      {record.status.replace("_", " ")}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Full library ─────────────────────────────────────────────────── */
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Toolbar */}
          <div className="px-6 py-3 border-b bg-white flex flex-wrap items-center gap-3 shrink-0" style={{ borderColor: "#F3F4F6" }}>
            {/* Search */}
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-[#C87560]"
                style={{ borderColor: "#E5E7EB" }}
                placeholder="Search name, narrative, notes…"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Active filter indicator */}
            {(() => {
              const activeCount =
                (search.trim() ? 1 : 0) +
                (activeType !== "all" ? 1 : 0) +
                (activeStatus !== "all" ? 1 : 0) +
                (activeVisibility !== "all" ? 1 : 0) +
                (activeStability !== "all" ? 1 : 0) +
                (activeEmotionalRegister !== "all" ? 1 : 0);
              if (activeCount === 0) return null;
              return (
                <button
                  onClick={() => {
                    setSearch("");
                    setActiveType("all");
                    setActiveStatus("all");
                    setActiveVisibility("all");
                    setActiveStability("all");
                    setActiveEmotionalRegister("all");
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all shrink-0"
                  style={{ background: "#FEF3C7", borderColor: "#F59E0B", color: "#92400E" }}
                  title="Clear all active filters"
                >
                  <span
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: "#F59E0B", color: "white" }}
                  >
                    {activeCount}
                  </span>
                  Clear filters
                  <X className="w-3 h-3 opacity-70" />
                </button>
              );
            })()}

            {/* View toggle */}
            <div className="flex items-center rounded-lg border overflow-hidden shrink-0 ml-auto" style={{ borderColor: "#E5E7EB" }}>
              <button
                onClick={() => setViewMode("cards")}
                aria-label="Show card view"
                className="p-1.5 transition-colors"
                style={viewMode === "cards" ? { background: "#1B2A4A", color: "white" } : { color: "#6B7280" }}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                aria-label="Show table view"
                className="p-1.5 transition-colors"
                style={viewMode === "table" ? { background: "#1B2A4A", color: "white" } : { color: "#6B7280" }}
              >
                <Table2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Type tabs */}
          <div
            className="px-6 border-b flex items-center gap-1 overflow-x-auto shrink-0"
            style={{ borderColor: "#F3F4F6", background: "#FAFAFA" }}
          >
            {[{ key: "all", label: "All", color: "#6B7280" }, ...CANON_TYPES].map(t => {
              const count = t.key === "all" ? total : (byType[t.key] ?? 0);
              const active = activeType === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveType(t.key)}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors"
                  style={{
                    borderBottomColor: active ? ("color" in t ? t.color : "#C87560") : "transparent",
                    color: active ? ("color" in t ? t.color : "#C87560") : "#6B7280",
                  }}
                >
                  {"Icon" in t && <t.Icon className="w-3 h-3" />}
                  {t.label}
                  {count > 0 && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px]"
                      style={{
                        background: active ? `${"color" in t ? t.color : "#C87560"}18` : "#E5E7EB",
                        color: active ? ("color" in t ? t.color : "#C87560") : "#9CA3AF",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Status chips + Visibility / Stability dropdowns */}
          <div className="px-6 py-2 border-b flex items-center gap-2 overflow-x-auto shrink-0" style={{ borderColor: "#F3F4F6" }}>
            {STATUS_OPTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => setActiveStatus(s.key)}
                className="text-xs font-medium px-2.5 py-1 rounded-full border transition-all whitespace-nowrap"
                style={
                  activeStatus === s.key
                    ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" }
                    : { color: "#6B7280", borderColor: "#E5E7EB", background: "white" }
                }
              >
                {s.label}
              </button>
            ))}

            {/* Divider */}
            <div className="w-px h-4 bg-gray-200 shrink-0 mx-1" />

            {/* Visibility dropdown */}
            <select
              value={activeVisibility}
              onChange={e => setActiveVisibility(e.target.value)}
              className="text-xs font-medium border rounded-full px-2.5 py-1 focus:outline-none cursor-pointer transition-colors"
              style={
                activeVisibility !== "all"
                  ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" }
                  : { color: "#6B7280", borderColor: "#E5E7EB", background: "white" }
              }
            >
              {VISIBILITY_OPTIONS.map(v => (
                <option key={v.key} value={v.key}>{v.label}</option>
              ))}
            </select>

            {/* Stability dropdown */}
            <select
              value={activeStability}
              onChange={e => setActiveStability(e.target.value)}
              className="text-xs font-medium border rounded-full px-2.5 py-1 focus:outline-none cursor-pointer transition-colors"
              style={
                activeStability !== "all"
                  ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" }
                  : { color: "#6B7280", borderColor: "#E5E7EB", background: "white" }
              }
            >
              {STABILITY_OPTIONS.map(s => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>

            {/* Emotional register dropdown */}
            <select
              value={activeEmotionalRegister}
              onChange={e => setActiveEmotionalRegister(e.target.value)}
              className="text-xs font-medium border rounded-full px-2.5 py-1 focus:outline-none cursor-pointer transition-colors"
              style={
                activeEmotionalRegister !== "all"
                  ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" }
                  : { color: "#6B7280", borderColor: "#E5E7EB", background: "white" }
              }
            >
              <option value="all">All Registers</option>
              {REGISTERS.map(r => (
                <option key={r.key} value={r.key}>{r.key}</option>
              ))}
            </select>

            {hasActiveFilter && (
              <span className="text-xs text-gray-400 ml-1 whitespace-nowrap">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Records */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 py-16">
                <BookOpen className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm">No canon records match these filters.</p>
                <button
                  onClick={() => {
                    setSearch("");
                    setActiveType("all");
                    setActiveStatus("all");
                    setActiveVisibility("all");
                    setActiveStability("all");
                    setActiveEmotionalRegister("all");
                  }}
                  className="mt-3 text-xs underline hover:no-underline"
                >
                  Clear filters
                </button>
              </div>
            ) : viewMode === "cards" ? (
              <div className="p-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
                {filtered.map(record => (
                  <CanonCard key={record.id} record={record} />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b text-xs font-semibold uppercase tracking-wide text-gray-400" style={{ borderColor: "#F3F4F6" }}>
                      <th className="pl-4 pr-2 py-2.5 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === filtered.length && filtered.length > 0}
                          onChange={toggleAll}
                          className="rounded border-gray-300"
                        />
                      </th>
                      <th className="px-3 py-2.5 w-28">Type</th>
                      <th className="px-3 py-2.5">Name</th>
                      <th className="px-3 py-2.5 max-w-xs">Narrative</th>
                      <th className="px-3 py-2.5 w-32">Register</th>
                      <th className="px-3 py-2.5 w-32">Status</th>
                      <th className="px-3 py-2.5 text-center w-16">Specs</th>
                      <th className="px-3 py-2.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(record => (
                      <CanonTableRow
                        key={record.id}
                        record={record}
                        selected={selectedIds.has(record.id)}
                        onToggle={() => toggleSelect(record.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Create drawer ───────────────────────────────────────────────────── */}
      {showCreate && selectedWorldId && (
        <CreateDrawer
          worldId={selectedWorldId}
          prefilledType={prefilledType}
          prefilledName={prefilledName}
          prefilledNarrative={prefilledNarrative}
          onClose={() => { setShowCreate(false); setPrefilledName(""); setPrefilledNarrative(""); }}
          onCreated={handleCreated}
        />
      )}

      {/* ── Suggestions panel ────────────────────────────────────────────────── */}
      {showSuggestions && selectedWorldId && (
        <SuggestionsPanel
          worldId={selectedWorldId}
          worldName={selectedWorld?.name ?? "your world"}
          onClose={() => setShowSuggestions(false)}
          onAdd={() => qc.invalidateQueries({ queryKey: ["editorial-canon-library"] })}
        />
      )}

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <BulkBar
          count={selectedIds.size}
          onTransition={status => bulkMutation.mutate({ ids: Array.from(selectedIds), status })}
          onClear={() => setSelectedIds(new Set())}
        />
      )}
    </div>
  );
}
