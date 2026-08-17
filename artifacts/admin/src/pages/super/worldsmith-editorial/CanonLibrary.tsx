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
import { Link, useLocation } from "wouter";
import {
  Plus, Search, RefreshCw, Loader2, X, LayoutGrid, Table2,
  User2, MapPin, Package, CalendarDays, BookMarked, Wind, Layers,
  BookOpen, ChevronRight, Clock, Sparkles, CheckCircle2, Download,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";

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
];

const STATUS_OPTIONS = [
  { key: "all", label: "All" },
  { key: "proposed", label: "Proposed" },
  { key: "under_review", label: "Under Review" },
  { key: "accepted", label: "Accepted" },
  { key: "superseded", label: "Superseded" },
  { key: "rejected", label: "Rejected" },
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
  specRefCount: number;
  notionPageId?: string | null;
  updatedAt: string;
}

interface CanonListResponse {
  canon_records: CanonRecord[];
  total: number;
  by_type: Record<string, number>;
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
        {type && (
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0"
            style={{ background: `${typeColor}18`, color: typeColor }}
          >
            <type.Icon className="w-2.5 h-2.5" />
            {type.label}
          </span>
        )}
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
  onClose,
  onCreated,
}: {
  worldId: string;
  prefilledType: string;
  onClose: () => void;
  onCreated: (record: CanonRecord) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [canonType, setCanonType] = useState(prefilledType);
  const [narrativeDetails, setNarrativeDetails] = useState("");
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
      <div className="w-full max-w-md bg-white flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: "#E5E7EB" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "#1B2A4A" }}>New Canon Record</h2>
            <p className="text-xs text-gray-500 mt-0.5">Add an authoritative entry to your world's canon</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="w-4 h-4" />
          </button>
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

// ── Filter persistence (shared key with WorldsmithCanon) ─────────────────────

/** Must match the key produced by WorldsmithCanon's canonFilterKey helper. */
function canonFilterKey(worldId: string) {
  return `canon-filters-${worldId}`;
}

function loadLibraryFilters(worldId: string): { type: string; status: string; search: string } {
  try {
    const raw = sessionStorage.getItem(canonFilterKey(worldId));
    if (!raw) return { type: "all", status: "all", search: "" };
    const parsed = JSON.parse(raw);
    return {
      type:   typeof parsed.type   === "string" ? parsed.type   : "all",
      status: typeof parsed.status === "string" ? parsed.status : "all",
      search: typeof parsed.search === "string" ? parsed.search : "",
    };
  } catch {
    return { type: "all", status: "all", search: "" };
  }
}

/**
 * Merges type + status back into the stored entry so the detail view's
 * visibility / stability values are not overwritten.
 */
function saveLibraryFilters(worldId: string, type: string, status: string, search: string) {
  try {
    const existing = sessionStorage.getItem(canonFilterKey(worldId));
    const base = existing ? JSON.parse(existing) : {};
    sessionStorage.setItem(canonFilterKey(worldId), JSON.stringify({ ...base, type, status, search }));
  } catch { /* storage full or unavailable — silently skip */ }
}

// ── Main CanonLibrary ────────────────────────────────────────────────────────

export default function CanonLibrary() {
  const { selectedWorldId, selectedWorld } = useEditorial();
  const qc = useQueryClient();
  const { toast } = useToast();

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeType, setActiveType] = useState("all");
  const [activeStatus, setActiveStatus] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Tracks which worldId filters were hydrated from so we don't re-hydrate
  // or persist prematurely (same guard pattern as WorldsmithCanon).
  const [hydratedWorldId, setHydratedWorldId] = useState<string | null>(null);

  // Hydrate type + status + search from sessionStorage when selectedWorldId
  // resolves or changes.  Runs before the persist effect thanks to state sequencing.
  useEffect(() => {
    if (!selectedWorldId || selectedWorldId === hydratedWorldId) return;
    const saved = loadLibraryFilters(selectedWorldId);
    const validType =
      saved.type === "all" || CANON_TYPES.some(t => t.key === saved.type)
        ? saved.type
        : "all";
    const validStatus =
      STATUS_OPTIONS.some(s => s.key === saved.status) ? saved.status : "all";
    setActiveType(validType);
    setActiveStatus(validStatus);
    setSearch(saved.search);
    setHydratedWorldId(selectedWorldId);
  }, [selectedWorldId, hydratedWorldId]);

  // Persist type + status + search whenever they change — only after hydration.
  useEffect(() => {
    if (!selectedWorldId || selectedWorldId !== hydratedWorldId) return;
    saveLibraryFilters(selectedWorldId, activeType, activeStatus, search);
  }, [selectedWorldId, hydratedWorldId, activeType, activeStatus, search]);

  // Selection (table mode)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Create drawer
  const [showCreate, setShowCreate] = useState(false);
  const [prefilledType, setPrefilledType] = useState("location");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset selection when filters change
  useEffect(() => { setSelectedIds(new Set()); }, [activeType, activeStatus, debouncedSearch]);

  const { data, isLoading, refetch } = useQuery<CanonListResponse>({
    queryKey: ["editorial-canon-library", selectedWorldId],
    queryFn: () =>
      apiFetch<CanonListResponse>(`/v1/editorial/canon-records?world_id=${selectedWorldId}`),
    enabled: !!selectedWorldId,
    staleTime: 15_000,
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

  // Client-side filter for search/type/status
  const filtered = allRecords.filter(r => {
    if (activeType !== "all" && r.canonType !== activeType) return false;
    if (activeStatus !== "all" && r.status !== activeStatus) return false;
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

  const isQuickStart =
    total <= QUICKSTART_THRESHOLD &&
    !debouncedSearch.trim() &&
    activeType === "all" &&
    activeStatus === "all";

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
      {isLoading ? (
        <div className="flex flex-col h-full items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
                  <Link key={record.id} href={`/super/worldsmith/editorial/canon/${record.id}`}>
                    <div
                      className="flex items-center gap-3 bg-white rounded-lg border px-4 py-3 hover:shadow-sm transition-all cursor-pointer"
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
                    </div>
                  </Link>
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

            {/* View toggle */}
            <div className="flex items-center rounded-lg border overflow-hidden shrink-0" style={{ borderColor: "#E5E7EB" }}>
              <button
                onClick={() => setViewMode("cards")}
                className="p-1.5 transition-colors"
                style={viewMode === "cards" ? { background: "#1B2A4A", color: "white" } : { color: "#6B7280" }}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
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

          {/* Status chips */}
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
            {(debouncedSearch || activeType !== "all" || activeStatus !== "all") && (
              <span className="text-xs text-gray-400 ml-1">
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
                  onClick={() => { setSearch(""); setActiveType("all"); setActiveStatus("all"); }}
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
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
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
