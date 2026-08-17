/**
 * WorldsmithCanon — Three-column Canon Records screen (Step 2: read + edit).
 *
 * Layout  (height: 100dvh):
 *   52px top bar → flex:1 row → [236px record rail | fluid editor | 352px margin rail]
 *
 * Design contract:
 *   • EMOTIONAL REGISTER / SENSORY CLAUSES must be above the fold at 1080p.
 *   • Fonts: Spectral (display), Instrument Sans (body), Space Mono (mono).
 *   • Tokens: INK #1B2A4A  CLAY #C87560  PARCHMENT #EFE9E1  WARM_WHITE #FDFAF7
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Loader2, AlertCircle, ExternalLink, Lock, Unlock,
  User2, MapPin, Package, CalendarDays, BookMarked, Wind, Layers,
  ChevronRight, FileText, Trash2, X, ArrowLeft, Share2, Eye, EyeOff,
  GitBranch, Repeat2, Plus, Link2, AlertTriangle, ChevronDown,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEditorial } from "@/contexts/EditorialContext";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK       = "#1B2A4A";
const CLAY      = "#C87560";
const PARCHMENT = "#EFE9E1";
const WARM_WHITE = "#FDFAF7";
const WARM_BG   = "#F4EFE8";
const WARM_BORDER = "#DDD4C4";
const DASHED_BORDER = "#DCCFBB";
const MARGIN_BG = "#FAF7F3";

// ── Register palette ──────────────────────────────────────────────────────────
const REGISTERS = [
  { key: "Withholding", color: "#4A5E78", bg: "#EAF0F7" },
  { key: "Intimate",    color: "#A85C6E", bg: "#F7EAF0" },
  { key: "Guarded",     color: "#3D7A5C", bg: "#EAF5EE" },
  { key: "Trespass",    color: "#8B6220", bg: "#F5EDDB" },
  { key: "Absence",     color: "#6B7C8C", bg: "#EFF3F6" },
  { key: "Confidence",  color: CLAY,      bg: "#F7EDE8" },
] as const;
type RegisterKey = typeof REGISTERS[number]["key"];

const regMeta = (key: string | null | undefined) =>
  REGISTERS.find(r => r.key === key) ?? null;

// ── Canon-type config ─────────────────────────────────────────────────────────
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
  character:    "CHR",
  location:     "LOC",
  object:       "OBJ",
  event:        "EVT",
  lore:         "LOR",
  atmosphere:   "ATM",
  material:     "MAT",
  relationship: "REL",
  motif:        "MTF",
};
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  proposed:     { label: "Proposed",     color: "#6B7280", bg: "#F3F4F6" },
  under_review: { label: "Under Review", color: "#B45309", bg: "#FEF3C7" },
  accepted:     { label: "Accepted",     color: "#065F46", bg: "#D1FAE5" },
  superseded:   { label: "Superseded",   color: "#6B7280", bg: "#F3F4F6" },
  rejected:     { label: "Rejected",     color: "#9B1C1C", bg: "#FEE2E2" },
};

const CONFIDENCE_FROM_STATUS: Record<string, { label: string; color: string }> = {
  proposed:     { label: "Low",    color: "#9CA3AF" },
  under_review: { label: "Medium", color: "#B45309" },
  accepted:     { label: "High",   color: "#065F46" },
  superseded:   { label: "—",      color: "#9CA3AF" },
  rejected:     { label: "—",      color: "#9CA3AF" },
};

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
  sensoryClauses?: string | null;
  registerLocked: boolean;
  narrativeVisibility?: string | null;
  temporalScope?: string | null;
  canonStability?: string | null;
  specRefCount: number;
  notionPageId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  // REL-specific
  fromEntityId?: string | null;
  toEntityId?: string | null;
  emotionalValence?: string | null;
}

interface CanonListItem {
  id: string;
  worldId: string;
  name: string;
  status: string;
  canonType?: string | null;
  emotionalRegister?: string | null;
  registerLocked: boolean;
  specRefCount: number;
  narrativeVisibility?: string | null;
  temporalScope?: string | null;
  canonStability?: string | null;
}

interface LinkedSpec {
  id: string;
  productionItem: string;
  componentType: string;
  status: string;
}

interface CanonRelation {
  fromRecordId: string;
  toRecordId: string;
  relationType: string | null;
  createdAt: string;
  targetName: string;
  targetCanonType: string | null;
  targetStatus: string;
}
/** Deterministic 3-digit display ID from UUID.
 *  Uses the canon-type prefix when available (e.g. REL-001, MTF-002),
 *  falling back to the world code otherwise. */
function displayId(
  worldCode: string,
  _recordId: string,
  index: number,
  canonType?: string | null,
): string {
  const prefix = (canonType && TYPE_PREFIX[canonType]) ?? worldCode;
  return `${prefix}-${String(index + 1).padStart(3, "0")}`;
}

// ── AutoSave textarea ─────────────────────────────────────────────────────────
function AutoField({
  label, field, value, placeholder, mono = false,
  onSave, rows = 5,
}: {
  label: string; field: string; value: string; placeholder: string;
  mono?: boolean; onSave: (f: string, v: string) => void; rows?: number;
}) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value && !dirty) { setLocal(value); prev.current = value; }
  }, [value, dirty]);

  const commit = () => {
    if (dirty && local !== prev.current) { onSave(field, local); prev.current = local; }
    setDirty(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="text-[10px] font-semibold tracking-widest uppercase"
        style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
      >
        {label}
      </label>
      <textarea
        value={local}
        rows={rows}
        onChange={e => { setLocal(e.target.value); setDirty(true); }}
        onBlur={commit}
        placeholder={placeholder}
        className="w-full rounded-xl px-4 py-3 text-sm leading-relaxed resize-none focus:outline-none transition-colors"
        style={{
          border: `1px solid ${WARM_BORDER}`,
          background: WARM_WHITE,
          color: INK,
          fontFamily: mono ? "'Space Mono', monospace" : "'Instrument Sans', sans-serif",
          fontSize: mono ? "12px" : "14px",
        }}
      />
    </div>
  );
}

// ── Register picker ───────────────────────────────────────────────────────────
function RegisterPicker({
  value, locked, onSelect, onToggleLock,
}: {
  value: string | null | undefined;
  locked: boolean;
  onSelect: (r: string | null) => void;
  onToggleLock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = regMeta(value);

  return (
    <div className="flex flex-col gap-2">
      {/* Current value + lock */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => !locked && setOpen(o => !o)}
          disabled={locked}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          style={
            meta
              ? { background: meta.bg, color: meta.color, border: `1px solid ${meta.color}30` }
              : { background: "#FEF2F2", color: "#EF4444", border: "1px dashed #FCA5A5" }
          }
        >
          {meta ? meta.key : (
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              NOT SET
            </span>
          )}
          {!locked && <ChevronRight className="w-3 h-3 opacity-50 ml-1" />}
        </button>

        <button
          onClick={onToggleLock}
          title={locked ? "Unlock — allow cascade" : "Lock — stop cascade here"}
          className="p-1.5 rounded-lg transition-colors"
          style={
            locked
              ? { background: `${CLAY}18`, color: CLAY }
              : { background: "#F3F4F6", color: "#9CA3AF" }
          }
        >
          {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="rounded-xl overflow-hidden shadow-lg border"
          style={{ borderColor: WARM_BORDER, background: "white" }}
        >
          {REGISTERS.map(r => (
            <button
              key={r.key}
              onClick={() => { onSelect(r.key); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-gray-50"
              style={{ color: r.color }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: r.color }}
              />
              {r.key}
            </button>
          ))}
          {value && (
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-gray-400 hover:bg-gray-50 border-t"
              style={{ borderColor: "#F3F4F6" }}
            >
              <X className="w-3.5 h-3.5" /> Clear register
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section divider ───────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[10px] font-semibold tracking-widest uppercase mb-3"
      style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
    >
      {children}
    </p>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// ── Filter persistence helpers ────────────────────────────────────────────────
function canonFilterKey(worldId: string) {
  return `canon-filters-${worldId}`;
}

interface PersistedFilters {
  visibility: string | null;
  stability: string | null;
  type: string | null;
}

function loadPersistedFilters(worldId: string): PersistedFilters {
  try {
    const raw = sessionStorage.getItem(canonFilterKey(worldId));
    if (!raw) return { visibility: null, stability: null, type: null };
    const parsed = JSON.parse(raw);
    return {
      visibility: typeof parsed.visibility === "string" ? parsed.visibility : null,
      stability:  typeof parsed.stability  === "string" ? parsed.stability  : null,
      type:       typeof parsed.type       === "string" ? parsed.type       : null,
    };
  } catch {
    return { visibility: null, stability: null, type: null };
  }
}

function savePersistedFilters(worldId: string, filters: PersistedFilters) {
  try {
    // Merge so any extra keys written by CanonLibrary (e.g. status) are
    // preserved — we must not clobber them when the detail view saves.
    const existing = sessionStorage.getItem(canonFilterKey(worldId));
    const base = existing ? JSON.parse(existing) : {};
    sessionStorage.setItem(canonFilterKey(worldId), JSON.stringify({ ...base, ...filters }));
  } catch { /* storage full or unavailable — silently skip */ }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function WorldsmithCanon({ recordId }: { recordId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { worlds, selectedWorldId, setSelectedWorldId } = useEditorial();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ── Filter state: starts null; hydrated once authoritative worldId is known ─
  const [filterVisibility, setFilterVisibility] = useState<string | null>(null);
  const [filterStability, setFilterStability] = useState<string | null>(null);
  const [filterType, setFilterType]            = useState<string | null>(null);
  // Tracks which worldId the current filter values were loaded from.
  // null means "not yet hydrated" — saves are blocked until this matches worldId.
  const [hydratedWorldId, setHydratedWorldId] = useState<string | null>(null);

  const world = worlds.find(w => w.id === selectedWorldId) ?? worlds[0] ?? null;

  // ── Load the current record ────────────────────────────────────────────────
  const { data: recordData, isLoading, error } = useQuery<{ canon_record: CanonRecord }>({
    queryKey: ["editorial-canon-record", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}`),
    staleTime: 30_000,
  });
  const record = recordData?.canon_record ?? null;

  // ── Load record list for rail (all records for the selected world) ─────────
  // The record's own worldId is authoritative once loaded; fall back to context.
  const worldId = record?.worldId ?? selectedWorldId ?? "";
  const { data: listData } = useQuery<{ canon_records: CanonListItem[] }>({
    queryKey: ["editorial-canon-library", worldId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records?world_id=${worldId}&limit=200`),
    enabled: !!worldId,
    staleTime: 30_000,
  });
  const allRecords: CanonListItem[] = listData?.canon_records ?? [];

  const filteredRecords = allRecords.filter(r => {
    if (filterVisibility && r.narrativeVisibility !== filterVisibility) return false;
    if (filterStability && r.canonStability !== filterStability) return false;
    if (filterType && r.canonType !== filterType) return false;
    return true;
  });

  // ── Hydrate filters from sessionStorage when authoritative worldId is known ─
  // Fires when worldId resolves (e.g. record load, context switch) and hasn't
  // been hydrated for this worldId yet.  Runs before any persistence effect.
  useEffect(() => {
    if (!worldId || worldId === hydratedWorldId) return;
    const saved = loadPersistedFilters(worldId);
    setFilterVisibility(saved.visibility);
    setFilterStability(saved.stability);
    setFilterType(saved.type);
    setHydratedWorldId(worldId);
  }, [worldId, hydratedWorldId]);

  // ── Persist filters to sessionStorage — only after hydration is complete ───
  // Gating on hydratedWorldId === worldId prevents overwriting stored state
  // with the initial null defaults before the load effect above has run.
  useEffect(() => {
    if (!worldId || worldId !== hydratedWorldId) return;
    savePersistedFilters(worldId, {
      visibility: filterVisibility,
      stability:  filterStability,
      type:       filterType,
    });
  }, [worldId, hydratedWorldId, filterVisibility, filterStability, filterType]);

  // ── Load linked specs ──────────────────────────────────────────────────────
  const { data: specsData } = useQuery<{ specs: LinkedSpec[] }>({
    queryKey: ["editorial-canon-record-specs", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/specs`),
    enabled: !!record,
    staleTime: 30_000,
  });
  const linkedSpecs = specsData?.specs ?? [];

  // ── PATCH mutation ─────────────────────────────────────────────────────────
  const patchMutation = useMutation({
    mutationFn: (fields: Record<string, unknown>) =>
      apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      }),
    onSuccess: (result) => {
      qc.setQueryData(["editorial-canon-record", recordId], { canon_record: result.canon_record });
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  // ── Transition mutation ────────────────────────────────────────────────────
  const transitionMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (result) => {
      qc.setQueryData(["editorial-canon-record", recordId], { canon_record: result.canon_record });
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
      toast({ title: `Moved to ${result.canon_record.status.replace(/_/g, " ")}` });
    },
    onError: () => toast({ title: "Transition failed", variant: "destructive" }),
  });

  // ── Delete mutation ────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
      toast({ title: "Canon record deleted" });
      navigate("/super/worldsmith/editorial/canon");
    },
    onError: () => { toast({ title: "Delete failed", variant: "destructive" }); setShowDeleteConfirm(false); },
  });

  // ── Relations ─────────────────────────────────────────────────────────────
  const { data: relationsData, isLoading: relLoading } = useQuery<{ relations: CanonRelation[] }>({
    queryKey: ["editorial-canon-record-relations", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/relations`),
    enabled: !!record,
    staleTime: 30_000,
  });
  const relations: CanonRelation[] = relationsData?.relations ?? [];

  const { data: inboundRelData } = useQuery<{ inbound_relations: InboundRelation[] }>({
    queryKey: ["editorial-canon-record-inbound-relations", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/inbound-relations`),
    enabled: !!record,
    staleTime: 30_000,
  });
  const inboundRelations: InboundRelation[] = inboundRelData?.inbound_relations ?? [];
  const contradictionsIn = inboundRelations.filter(r => r.relationType === "contradicts");

  // Add-relation panel state
  const [showAddRel, setShowAddRel] = useState(false);
  const [addRelSearch, setAddRelSearch] = useState("");
  const [addRelType, setAddRelType] = useState<RelationTypeKey>("related");

  const addRelMutation = useMutation({
    mutationFn: ({ toId, type }: { toId: string; type: string }) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/relations`, {
        method: "POST",
        body: JSON.stringify({ to_record_id: toId, relation_type: type }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-canon-record-relations", recordId] });
      qc.invalidateQueries({ queryKey: ["editorial-canon-record-inbound-relations"] });
      setShowAddRel(false);
      setAddRelSearch("");
      setAddRelType("related");
    },
    onError: () => toast({ title: "Failed to add relation", variant: "destructive" }),
  });

  const patchRelTypeMutation = useMutation({
    mutationFn: ({ toId, type }: { toId: string; type: string }) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/relations/${toId}`, {
        method: "PATCH",
        body: JSON.stringify({ relation_type: type }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-canon-record-relations", recordId] });
      qc.invalidateQueries({ queryKey: ["editorial-canon-record-inbound-relations"] });
    },
    onError: () => toast({ title: "Failed to update relation type", variant: "destructive" }),
  });

  const removeRelMutation = useMutation({
    mutationFn: (toId: string) =>
      apiFetch(`/v1/editorial/canon-records/${recordId}/relations/${toId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-canon-record-relations", recordId] });
      qc.invalidateQueries({ queryKey: ["editorial-canon-record-inbound-relations"] });
    },
    onError: () => toast({ title: "Failed to remove relation", variant: "destructive" }),
  });

  // Filtered candidates for the add-relation search
  const addRelCandidates = allRecords.filter(r =>
    r.id !== recordId &&
    !relations.some(rel => rel.toRecordId === r.id) &&
    (addRelSearch.trim() === "" || r.name.toLowerCase().includes(addRelSearch.toLowerCase()))
  ).slice(0, 8);

  // ── Cascade register mutation ──────────────────────────────────────────────
  const [cascadeResult, setCascadeResult] = useState<{ updated: number; skipped_locked: number } | null>(null);
  const [temporalScopeDraft, setTemporalScopeDraft] = useState(record?.temporalScope ?? "");
  useEffect(() => { setTemporalScopeDraft(record?.temporalScope ?? ""); }, [record?.temporalScope]);
  const cascadeMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ updated: number; skipped_locked: number; register: string }>(
        `/v1/editorial/canon-records/${recordId}/cascade-register`,
        { method: "POST" },
      ),
    onSuccess: (result) => {
      setCascadeResult({ updated: result.updated, skipped_locked: result.skipped_locked });
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
      toast({
        title: result.updated > 0
          ? `Propagated to ${result.updated} record${result.updated !== 1 ? "s" : ""}`
          : "No related records to update",
      });
    },
    onError: () => toast({ title: "Cascade failed", variant: "destructive" }),
  });

  const handleField = useCallback((field: string, value: string) => {
    const map: Record<string, string> = {
      narrativeDetails: "narrative_details",
      historicalContext: "historical_context",
      visualNotes: "visual_notes",
      sensoryClauses: "sensory_clauses",
    };
    patchMutation.mutate({ [map[field] ?? field]: value });
  }, [patchMutation]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const typeMeta  = CANON_TYPES.find(t => t.key === record?.canonType) ?? null;
  const statusMeta = STATUS_META[record?.status ?? "proposed"] ?? STATUS_META.proposed;
  const confMeta  = CONFIDENCE_FROM_STATUS[record?.status ?? "proposed"] ?? CONFIDENCE_FROM_STATUS.proposed;
  const regM      = regMeta(record?.emotionalRegister);
  const recordIndex = allRecords.findIndex(r => r.id === recordId);
  const idStamp   = world ? displayId(world.code.toUpperCase(), recordId, Math.max(0, recordIndex), record?.canonType) : "—";

  // Narrative visibility + canon stability metadata
  const NV_META: Record<string, { label: string; color: string }> = {
    background: { label: "Background", color: "#6B7280" },
    hinted:     { label: "Hinted",     color: "#B45309" },
    explicit:   { label: "Explicit",   color: "#065F46" },
  };
  const nvMeta = NV_META[record?.narrativeVisibility ?? ""] ?? null;

  const CS_META: Record<string, { label: string; color: string }> = {
    low:    { label: "Low",    color: "#9CA3AF" },
    medium: { label: "Medium", color: "#B45309" },
    high:   { label: "High",   color: "#065F46" },
  };
  const csMeta = CS_META[record?.canonStability ?? ""] ?? null;

  // Readiness: % of records with emotionalRegister set
  const readyCount = allRecords.filter(r => r.emotionalRegister).length;
  const readyPct   = allRecords.length > 0 ? Math.round((readyCount / allRecords.length) * 100) : 0;

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    proposed:     ["under_review", "rejected"],
    under_review: ["accepted", "superseded", "rejected", "proposed"],
    accepted:     ["superseded"],
    superseded:   [],
    rejected:     ["proposed"],
  };
  const TRANSITION_LABELS: Record<string, string> = {
    under_review: "Send for Review",
    accepted:     "Accept",
    superseded:   "Supersede",
    rejected:     "Reject",
    proposed:     "Reopen",
  };
  const transitions = ALLOWED_TRANSITIONS[record?.status ?? "proposed"] ?? [];

  // ── Loading / error ────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: CLAY }} />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <AlertCircle className="w-8 h-8 opacity-30" style={{ color: INK }} />
        <p className="text-sm" style={{ color: INK, fontFamily: "'Instrument Sans', sans-serif" }}>
          Canon record not found.
        </p>
        <button
          onClick={() => navigate("/super/worldsmith/editorial/canon")}
          className="text-sm underline"
          style={{ color: CLAY }}
        >
          Back to library
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col" style={{ height: "100dvh", background: WARM_WHITE }}>

      {/* ════════════════════════════════════ TOP BAR (52px) ════════════════ */}
      <header
        className="shrink-0 flex items-center px-5 gap-4"
        style={{
          height: 52,
          background: "white",
          borderBottom: `1px solid ${WARM_BORDER}`,
        }}
      >
        {/* Left: back + world */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/super/worldsmith/editorial/canon")}
            className="flex items-center gap-1.5 shrink-0 text-sm transition-colors"
            style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
            onMouseEnter={e => (e.currentTarget.style.color = INK)}
            onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* World selector */}
          <select
            value={selectedWorldId ?? ""}
            onChange={e => {
              setSelectedWorldId(e.target.value);
              // Hydration effect re-fires when worldId changes, so no manual
              // filter manipulation needed here.
            }}
            className="text-sm font-semibold focus:outline-none bg-transparent border-none cursor-pointer"
            style={{ color: INK, fontFamily: "'Instrument Sans', sans-serif" }}
          >
            {worlds.map(w => (
              <option key={w.id} value={w.id}>{w.code} · {w.name}</option>
            ))}
          </select>
        </div>

        {/* Center: tabs */}
        <nav className="flex items-center gap-1 mx-auto">
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
                <a
                  className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    background: active ? PARCHMENT : "transparent",
                    color: active ? INK : "#9CA3AF",
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                >
                  {tab}
                </a>
              </Link>
            );
          })}
        </nav>

        {/* Right: readiness + sync chip */}
        <div className="flex items-center gap-3 shrink-0 ml-auto">
          {/* Readiness track */}
          <div className="flex items-center gap-2">
            <div
              className="rounded-full overflow-hidden"
              style={{ width: 72, height: 5, background: "#E5E7EB" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${readyPct}%`, background: CLAY }}
              />
            </div>
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: INK, fontFamily: "'Space Mono', monospace", minWidth: 28 }}
            >
              {readyPct}
            </span>
            <span className="text-xs font-medium" style={{ color: "#9CA3AF" }}>READY</span>
          </div>

          {/* Notion synced chip */}
          {record.notionPageId && (
            <a
              href={`https://notion.so/${record.notionPageId.replace(/-/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-opacity hover:opacity-70"
              style={{
                background: "#EAF5EE", color: "#065F46",
                fontFamily: "'Instrument Sans', sans-serif",
              }}
            >
              <ExternalLink className="w-3 h-3" />
              NOTION SYNCED
            </a>
          )}

          {/* Generate (disabled for Step 2) */}
          <button
            disabled
            className="px-4 py-1.5 rounded-lg text-sm font-medium opacity-40 cursor-not-allowed"
            style={{
              background: INK, color: "white",
              fontFamily: "'Instrument Sans', sans-serif",
            }}
          >
            Generate
          </button>
        </div>
      </header>

      {/* ════════════════════════════════════ BODY ══════════════════════════ */}
      <div className="flex flex-1 min-h-0">

        {/* ══════════════ LEFT RAIL (236px) ══════════════════════════════════ */}
        <aside
          className="shrink-0 flex flex-col"
          style={{
            width: 236,
            borderRight: `1px solid ${WARM_BORDER}`,
            background: WARM_BG,
          }}
        >
          {/* World header */}
          <div
            className="shrink-0 px-4 pt-5 pb-4"
            style={{ borderBottom: `1px solid ${WARM_BORDER}` }}
          >
            {/* Code circle */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center mb-3 text-xs font-bold"
              style={{
                background: INK, color: "white",
                fontFamily: "'Space Mono', monospace",
              }}
            >
              {world?.code?.slice(0, 2).toUpperCase() ?? "WS"}
            </div>
            <p
              className="text-sm font-semibold leading-tight mb-1"
              style={{ color: INK, fontFamily: "'Instrument Sans', sans-serif" }}
            >
              {world?.name ?? "—"}
            </p>
            {world && (
              <p
                className="text-[11px] leading-snug"
                style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
              >
                {world.code} · Canon
              </p>
            )}
          </div>

          {/* Records list header */}
          <div
            className="shrink-0 flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: `1px solid ${WARM_BORDER}` }}
          >
            <span
              className="text-[10px] font-semibold tracking-widest uppercase"
              style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
            >
              Records
            </span>
            <span
              className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded"
              style={{ background: PARCHMENT, color: INK }}
            >
              {(filterVisibility || filterStability || filterType)
                ? `${filteredRecords.length}/${allRecords.length}`
                : allRecords.length}
            </span>
          </div>

          {/* Active-filter banner — shown only when at least one filter is on */}
          {(filterVisibility || filterStability || filterType) && (
            <button
              onClick={() => {
                setFilterVisibility(null);
                setFilterStability(null);
                setFilterType(null);
              }}
              className="shrink-0 w-full flex items-center justify-between px-4 py-1.5 transition-colors"
              style={{
                background: `${CLAY}14`,
                borderBottom: `1px solid ${CLAY}30`,
              }}
            >
              <span
                className="text-[10px] font-semibold tracking-wide"
                style={{ color: CLAY, fontFamily: "'Instrument Sans', sans-serif" }}
              >
                Filtered · {filteredRecords.length}/{allRecords.length} shown
              </span>
              <span
                className="text-[10px] font-medium flex items-center gap-0.5"
                style={{ color: CLAY, fontFamily: "'Instrument Sans', sans-serif" }}
              >
                <X className="w-2.5 h-2.5" />
                clear
              </span>
            </button>
          )}

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {filteredRecords.map((r, i) => {
              const active = r.id === recordId;
              const rm = regMeta(r.emotionalRegister);

              // Stability dot
              const stabMap: Record<string, { char: string; color: string }> = {
                low:    { char: "●", color: "#9CA3AF" },
                medium: { char: "◐", color: "#B45309" },
                high:   { char: "●", color: "#065F46" },
              };
              const stabDot = stabMap[r.canonStability ?? ""] ?? null;

              // Visibility icon
              const visIconProps = (() => {
                if (r.narrativeVisibility === "background") return { Icon: EyeOff, color: "#9CA3AF", opacity: 1 };
                if (r.narrativeVisibility === "hinted")     return { Icon: Eye,    color: "#B45309", opacity: 0.55 };
                if (r.narrativeVisibility === "explicit")   return { Icon: Eye,    color: "#065F46", opacity: 1 };
                return null;
              })();

              return (
                <Link key={r.id} href={`/super/worldsmith/editorial/canon/${r.id}`}>
                  <a
                    className="flex items-start gap-2 px-4 py-2.5 transition-colors group"
                    style={{
                      borderLeft: active ? `3px solid ${CLAY}` : "3px solid transparent",
                      background: active ? PARCHMENT : "transparent",
                      paddingLeft: "13px",
                    }}
                  >
                    {/* Dots column: register + stability stacked */}
                    <div className="shrink-0 flex flex-col items-center gap-0.5 mt-0.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: rm ? rm.color : "#D1D5DB" }}
                      />
                      {stabDot ? (
                        <span
                          style={{
                            fontSize: 7,
                            lineHeight: 1,
                            color: stabDot.color,
                            fontFamily: "sans-serif",
                          }}
                        >
                          {stabDot.char}
                        </span>
                      ) : (
                        <span className="w-1.5 h-1.5" />
                      )}
                    </div>

                    {/* Name + temporal scope */}
                    <div className="flex-1 min-w-0">
                      <span
                        className="block text-xs leading-snug truncate"
                        style={{
                          color: active ? INK : "#6B7280",
                          fontWeight: active ? 600 : 400,
                          fontFamily: "'Instrument Sans', sans-serif",
                        }}
                      >
                        {r.name}
                      </span>
                      {r.temporalScope && (
                        <span
                          className="block text-[10px] leading-snug truncate mt-0.5"
                          style={{
                            color: "#9CA3AF",
                            fontFamily: "'Instrument Sans', sans-serif",
                          }}
                        >
                          {r.temporalScope}
                        </span>
                      )}
                    </div>

                    {/* Visibility icon */}
                    {visIconProps ? (
                      <visIconProps.Icon
                        className="shrink-0 mt-0.5"
                        style={{ width: 10, height: 10, color: visIconProps.color, opacity: visIconProps.opacity }}
                      />
                    ) : (
                      <span className="shrink-0 w-2.5" />
                    )}

                    {/* ID right-aligned */}
                    <span
                      className="shrink-0 text-[10px] tabular-nums mt-0.5"
                      style={{
                        color: active ? "#9CA3AF" : "#D1D5DB",
                        fontFamily: "'Space Mono', monospace",
                      }}
                    >
                      {String(i + 1).padStart(3, "0")}
                    </span>
                  </a>
                </Link>
              );
            })}
          </div>
        </aside>

        {/* ══════════════ RECORD EDITOR (fluid) ══════════════════════════════ */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: WARM_WHITE }}
        >
          <div className="max-w-2xl mx-auto px-8 py-7 pb-20">

            {/* ID stamp + pills ─────────────────────────────────────────── */}
            <div className="flex items-center gap-2.5 mb-4">
              <span
                className="text-[11px] font-bold tracking-wider px-2.5 py-1 rounded"
                style={{
                  background: PARCHMENT,
                  color: INK,
                  fontFamily: "'Space Mono', monospace",
                }}
              >
                {idStamp}
              </span>

              {typeMeta && (
                <span
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: `${typeMeta.color}18`, color: typeMeta.color }}
                >
                  {typeMeta.label}
                </span>
              )}

              {record.specRefCount > 0 && (
                <span
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: "#F3F4F6", color: "#6B7280" }}
                >
                  {record.specRefCount} spec{record.specRefCount !== 1 ? "s" : ""}
                </span>
              )}

              {record.registerLocked && (
                <span
                  className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: `${CLAY}18`, color: CLAY }}
                >
                  <Lock className="w-2.5 h-2.5" />
                  Locked
                </span>
              )}
            </div>

            {/* Record title ─────────────────────────────────────────────── */}
            <h1
              className="mb-5 leading-tight"
              style={{
                fontFamily: "'Spectral', Georgia, serif",
                fontWeight: 600,
                fontSize: 29,
                color: INK,
              }}
            >
              {record.name}
            </h1>

            {/* Status / Confidence / Source card ───────────────────────── */}
            <div
              className="grid grid-cols-3 rounded-xl mb-6 overflow-hidden"
              style={{ border: `1px solid ${WARM_BORDER}` }}
            >
              {[
                {
                  label: "Status",
                  value: (
                    <span
                      className="text-sm font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: statusMeta.bg, color: statusMeta.color }}
                    >
                      {statusMeta.label}
                    </span>
                  ),
                },
                {
                  label: "Confidence",
                  value: (
                    <span
                      className="text-sm font-semibold"
                      style={{ color: confMeta.color }}
                    >
                      {confMeta.label}
                    </span>
                  ),
                },
                {
                  label: "Source",
                  value: record.notionPageId ? (
                    <a
                      href={`https://notion.so/${record.notionPageId.replace(/-/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm font-medium"
                      style={{ color: CLAY }}
                    >
                      Notion <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-sm" style={{ color: "#9CA3AF" }}>Local</span>
                  ),
                },
              ].map(cell => (
                <div key={cell.label} className="flex flex-col gap-1.5 px-5 py-3.5">
                  <span
                    className="text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                  >
                    {cell.label}
                  </span>
                  {cell.value}
                </div>
              ))}
            </div>

            {/* Narrative Visibility / Temporal Scope / Canon Stability ──── */}
            <div
              className="grid grid-cols-3 rounded-xl mb-6 overflow-hidden"
              style={{ border: `1px solid ${WARM_BORDER}` }}
            >
              {/* Narrative Visibility */}
              <div
                className="flex flex-col gap-1.5 px-5 py-3.5"
                style={{ borderRight: `1px solid ${WARM_BORDER}` }}
              >
                <span
                  className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                >
                  Visibility
                </span>
                <select
                  value={record.narrativeVisibility ?? ""}
                  onChange={e => patchMutation.mutate({ narrative_visibility: e.target.value || null })}
                  className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer"
                  style={{
                    color: nvMeta ? nvMeta.color : "#D1D5DB",
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                >
                  <option value="">— not set —</option>
                  <option value="background">Background</option>
                  <option value="hinted">Hinted</option>
                  <option value="explicit">Explicit</option>
                </select>
                <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                  {nvMeta?.label === "Background" && "Never stated — shapes the world silently"}
                  {nvMeta?.label === "Hinted" && "Implied through sensory or contextual detail"}
                  {nvMeta?.label === "Explicit" && "Named or stated directly in the text"}
                  {!nvMeta && "How directly this fact surfaces in prose"}
                </p>
              </div>

              {/* Temporal Scope */}
              <div
                className="flex flex-col gap-1.5 px-5 py-3.5"
                style={{ borderRight: `1px solid ${WARM_BORDER}` }}
              >
                <span
                  className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                >
                  Temporal Scope
                </span>
                <input
                  value={temporalScopeDraft}
                  onChange={e => setTemporalScopeDraft(e.target.value)}
                  onBlur={() => {
                    const trimmed = temporalScopeDraft.trim();
                    const prev = record.temporalScope ?? "";
                    if (trimmed !== prev) {
                      patchMutation.mutate({ temporal_scope: trimmed || null });
                    }
                  }}
                  onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder="e.g. Victorian era"
                  className="text-sm font-semibold bg-transparent border-none outline-none"
                  style={{
                    color: temporalScopeDraft ? INK : "#D1D5DB",
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                />
                <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                  Era or phase when this record applies
                </p>
              </div>

              {/* Canon Stability */}
              <div className="flex flex-col gap-1.5 px-5 py-3.5">
                <span
                  className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                >
                  Stability
                </span>
                <select
                  value={record.canonStability ?? ""}
                  onChange={e => patchMutation.mutate({ canon_stability: e.target.value || null })}
                  className="text-sm font-semibold bg-transparent border-none outline-none cursor-pointer"
                  style={{
                    color: csMeta ? csMeta.color : "#D1D5DB",
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                >
                  <option value="">— not set —</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                  {csMeta?.label === "Low" && "Provisional — may be retconned"}
                  {csMeta?.label === "Medium" && "Settled but could evolve"}
                  {csMeta?.label === "High" && "Load-bearing — treat as fixed"}
                  {!csMeta && "How likely this is to change"}
                </p>
              </div>
            </div>

            {/* ═══ RELATIONSHIP ENTITY PICKERS (REL only) ════════════════
                 Shown only when canonType === "relationship".
                 Lets editors wire a bond between two canon records.
            ═══════════════════════════════════════════════════════════════ */}
            {record.canonType === "relationship" && (
              <div
                className="rounded-xl overflow-hidden mb-6"
                style={{ border: `1px solid #06B6D440` }}
              >
                {/* Header */}
                <div
                  className="px-5 py-3 flex items-center gap-2"
                  style={{ background: "#ECFEFF", borderBottom: `1px solid #06B6D430` }}
                >
                  <GitBranch className="w-3.5 h-3.5" style={{ color: "#06B6D4" }} />
                  <span
                    className="text-[10px] font-semibold tracking-widest uppercase"
                    style={{ color: "#06B6D4", fontFamily: "'Instrument Sans', sans-serif" }}
                  >
                    Relational Bond
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-0">
                  {/* From entity */}
                  <div
                    className="px-5 py-4 flex flex-col gap-2"
                    style={{ borderRight: `1px solid ${WARM_BORDER}` }}
                  >
                    <label
                      className="text-[10px] font-semibold tracking-widest uppercase"
                      style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                    >
                      From
                    </label>
                    <select
                      value={record.fromEntityId ?? ""}
                      onChange={e =>
                        patchMutation.mutate({ from_entity_id: e.target.value || null })
                      }
                      className="text-sm font-medium bg-transparent border rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
                      style={{
                        borderColor: WARM_BORDER,
                        color: record.fromEntityId ? INK : "#9CA3AF",
                        fontFamily: "'Instrument Sans', sans-serif",
                      }}
                    >
                      <option value="">— select entity —</option>
                      {allRecords
                        .filter(r => r.id !== recordId)
                        .map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                    {record.fromEntityId && (
                      <span
                        className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full w-fit"
                        style={{ background: "#06B6D418", color: "#06B6D4", fontFamily: "'Instrument Sans', sans-serif" }}
                      >
                        <GitBranch className="w-3 h-3" />
                        {allRecords.find(r => r.id === record.fromEntityId)?.name ?? record.fromEntityId.slice(0, 8)}
                      </span>
                    )}
                  </div>

                  {/* To entity */}
                  <div className="px-5 py-4 flex flex-col gap-2">
                    <label
                      className="text-[10px] font-semibold tracking-widest uppercase"
                      style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                    >
                      To
                    </label>
                    <select
                      value={record.toEntityId ?? ""}
                      onChange={e =>
                        patchMutation.mutate({ to_entity_id: e.target.value || null })
                      }
                      className="text-sm font-medium bg-transparent border rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
                      style={{
                        borderColor: WARM_BORDER,
                        color: record.toEntityId ? INK : "#9CA3AF",
                        fontFamily: "'Instrument Sans', sans-serif",
                      }}
                    >
                      <option value="">— select entity —</option>
                      {allRecords
                        .filter(r => r.id !== recordId)
                        .map(r => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                    </select>
                    {record.toEntityId && (
                      <span
                        className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full w-fit"
                        style={{ background: "#06B6D418", color: "#06B6D4", fontFamily: "'Instrument Sans', sans-serif" }}
                      >
                        <GitBranch className="w-3 h-3" />
                        {allRecords.find(r => r.id === record.toEntityId)?.name ?? record.toEntityId.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Emotional valence row */}
                <div
                  className="px-5 py-3 flex items-center gap-4"
                  style={{ borderTop: `1px solid ${WARM_BORDER}`, background: WARM_WHITE }}
                >
                  <label
                    className="text-[10px] font-semibold tracking-widest uppercase shrink-0"
                    style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                  >
                    Emotional Valence
                  </label>
                  <select
                    value={record.emotionalValence ?? ""}
                    onChange={e =>
                      patchMutation.mutate({ emotional_valence: e.target.value || null })
                    }
                    className="text-sm font-medium bg-transparent border rounded-lg px-3 py-1.5 focus:outline-none cursor-pointer"
                    style={{
                      borderColor: WARM_BORDER,
                      color: record.emotionalValence ? INK : "#9CA3AF",
                      fontFamily: "'Instrument Sans', sans-serif",
                    }}
                  >
                    <option value="">— not set —</option>
                    <option value="admiration">Admiration</option>
                    <option value="affection">Affection</option>
                    <option value="rivalry">Rivalry</option>
                    <option value="estrangement">Estrangement</option>
                    <option value="dependency">Dependency</option>
                    <option value="betrayal">Betrayal</option>
                    <option value="grief">Grief</option>
                    <option value="obligation">Obligation</option>
                    <option value="ambivalence">Ambivalence</option>
                  </select>
                  <p
                    className="text-[10px] leading-snug"
                    style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                  >
                    The felt quality of the bond — compiles into sensory grounding
                  </p>
                </div>
              </div>
            )}

            {/* ═══ EMOTIONAL REGISTER / SENSORY CLAUSES ══════════════════
                 This block MUST be above the fold at 1080p — keep it here,
                 before the narrative/historical text blocks.
            ═══════════════════════════════════════════════════════════════ */}
            <div
              className="rounded-xl overflow-hidden mb-6"
              style={{ border: `1px solid ${regM ? regM.color + "40" : "#FCA5A5"}` }}
            >
              {/* Header bar */}
              <div
                className="px-5 py-3 flex items-center justify-between"
                style={{
                  background: regM ? regM.bg : "#FEF2F2",
                  borderBottom: `1px solid ${regM ? regM.color + "30" : "#FCA5A5"}`,
                }}
              >
                <span
                  className="text-[10px] font-semibold tracking-widest uppercase"
                  style={{
                    color: regM ? regM.color : "#EF4444",
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                >
                  Emotional Register
                </span>
                <span
                  className="text-[10px] tracking-wide"
                  style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                >
                  {record.registerLocked ? "Cascade locked" : "Cascade on"}
                </span>
              </div>

              <div className="grid grid-cols-2" style={{ borderTop: `1px solid ${WARM_BORDER}30` }}>
                {/* Left: register picker */}
                <div className="px-5 py-4 flex flex-col gap-3">
                  <RegisterPicker
                    value={record.emotionalRegister}
                    locked={record.registerLocked}
                    onSelect={val => patchMutation.mutate({ emotional_register: val })}
                    onToggleLock={() => patchMutation.mutate({ register_locked: !record.registerLocked })}
                  />

                  {/* Transition controls live here */}
                  {transitions.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-1">
                      <span
                        className="text-[10px] font-semibold tracking-widest uppercase"
                        style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                      >
                        Workflow
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {transitions.map(t => (
                          <button
                            key={t}
                            onClick={() => transitionMutation.mutate(t)}
                            disabled={transitionMutation.isPending}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all hover:shadow-sm disabled:opacity-50"
                            style={{ borderColor: WARM_BORDER, color: INK, background: "white" }}
                          >
                            {transitionMutation.isPending
                              ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              : <ChevronRight className="w-2.5 h-2.5" />}
                            {TRANSITION_LABELS[t] ?? t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: sensory clauses */}
                <div className="px-5 py-4">
                  <AutoField
                    label="Sensory Clauses"
                    field="sensoryClauses"
                    value={record.sensoryClauses ?? ""}
                    placeholder={"One clause per line.\nCompiled verbatim into the prompt."}
                    mono
                    onSave={handleField}
                    rows={4}
                  />
                </div>
              </div>
            </div>

            {/* Narrative divider */}
            <div
              className="flex items-center gap-3 mb-5"
              style={{ color: "#D1D5DB" }}
            >
              <div className="flex-1 h-px" style={{ background: WARM_BORDER }} />
              <span
                className="text-[10px] font-semibold tracking-widest uppercase"
                style={{ color: "#D1D5DB", fontFamily: "'Instrument Sans', sans-serif" }}
              >
                Narrative
              </span>
              <div className="flex-1 h-px" style={{ background: WARM_BORDER }} />
            </div>

            {/* Summary (Narrative Details) ─────────────────────────────── */}
            <div className="mb-5">
              <AutoField
                label="Summary"
                field="narrativeDetails"
                value={record.narrativeDetails}
                placeholder={
                  record.canonType === "character"    ? "Role, motivation, significance…"
                  : record.canonType === "location"     ? "Place, atmosphere, narrative importance…"
                  : record.canonType === "atmosphere"   ? "Mood and feeling…"
                  : record.canonType === "relationship" ? "Nature of the bond, how it shapes both parties, what it costs or enables…"
                  : record.canonType === "motif"        ? "The image or gesture, where it first appeared, why it recurs — compile into 'watch for opportunities to echo this'…"
                  : "Describe this record's role and significance…"
                }
                onSave={handleField}
                rows={4}
              />
            </div>

            {/* Details (Historical Context) ────────────────────────────── */}
            <div className="mb-5">
              <AutoField
                label="Historical Context"
                field="historicalContext"
                value={record.historicalContext}
                placeholder="Origin, what shaped it, how it has changed…"
                onSave={handleField}
                rows={3}
              />
            </div>

            {/* Visual Notes ────────────────────────────────────────────── */}
            <div className="mb-6">
              <AutoField
                label="Visual Notes"
                field="visualNotes"
                value={record.visualNotes}
                placeholder="Appearance, light quality, materials, distinctive features for prompt reference…"
                onSave={handleField}
                rows={3}
              />
            </div>

            {/* Related Canon ───────────────────────────────────────────── */}
            <div className="mb-6">
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: `1px solid ${WARM_BORDER}` }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{
                    background: PARCHMENT,
                    borderBottom: relations.length > 0 || showAddRel ? `1px solid ${WARM_BORDER}` : undefined,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5" style={{ color: "#9CA3AF" }} />
                    <span
                      className="text-[10px] font-semibold tracking-widest uppercase"
                      style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                    >
                      Related Canon
                    </span>
                    {relations.length > 0 && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded tabular-nums"
                        style={{ background: WARM_BORDER, color: INK }}
                      >
                        {relations.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowAddRel(v => !v)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      color: showAddRel ? CLAY : "#9CA3AF",
                      background: showAddRel ? `${CLAY}12` : "transparent",
                      fontFamily: "'Instrument Sans', sans-serif",
                    }}
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>

                {/* Existing relation chips */}
                {(relations.length > 0 || relLoading) && (
                  <div className="px-5 py-3 flex flex-col gap-2" style={{ background: WARM_WHITE }}>
                    {relLoading && (
                      <div className="flex items-center gap-2 text-xs" style={{ color: "#9CA3AF" }}>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Loading…
                      </div>
                    )}
                    {relations.map(rel => {
                      const rtm = relTypeMeta(rel.relationType);
                      const ttype = CANON_TYPES.find(t => t.key === rel.targetCanonType);
                      return (
                        <div
                          key={rel.toRecordId}
                          className="flex items-center gap-2 group"
                        >
                          {/* Type badge (dropdown) */}
                          <div className="relative">
                            <select
                              value={rel.relationType ?? "related"}
                              onChange={e =>
                                patchRelTypeMutation.mutate({ toId: rel.toRecordId, type: e.target.value })
                              }
                              className="appearance-none text-[11px] font-semibold px-2.5 py-1 rounded-full cursor-pointer focus:outline-none transition-colors pr-5"
                              style={{
                                background: rtm.bg,
                                color: rtm.color,
                                border: `1px solid ${rtm.color}30`,
                                fontFamily: "'Instrument Sans', sans-serif",
                              }}
                              disabled={patchRelTypeMutation.isPending}
                            >
                              {RELATION_TYPES.map(rt => (
                                <option key={rt.key} value={rt.key}>{rt.label}</option>
                              ))}
                            </select>
                            <ChevronDown
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 pointer-events-none"
                              style={{ color: rtm.color }}
                            />
                          </div>

                          {/* Target chip */}
                          <div
                            className="flex-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium min-w-0"
                            style={{
                              background: "#F9FAFB",
                              border: `1px solid ${WARM_BORDER}`,
                              color: INK,
                              fontFamily: "'Instrument Sans', sans-serif",
                            }}
                          >
                            {ttype && <ttype.Icon className="w-3 h-3 shrink-0" style={{ color: ttype.color }} />}
                            <span className="truncate">{rel.targetName}</span>
                          </div>

                          {/* Remove */}
                          <button
                            onClick={() => removeRelMutation.mutate(rel.toRecordId)}
                            disabled={removeRelMutation.isPending}
                            className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
                            style={{ color: "#9CA3AF" }}
                            title="Remove relation"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add relation panel */}
                {showAddRel && (
                  <div
                    className="px-5 py-4 flex flex-col gap-3"
                    style={{
                      background: "#FDFAF7",
                      borderTop: relations.length > 0 ? `1px solid ${WARM_BORDER}` : undefined,
                    }}
                  >
                    {/* Type selector */}
                    <div className="flex gap-1.5 flex-wrap">
                      {RELATION_TYPES.map(rt => (
                        <button
                          key={rt.key}
                          onClick={() => setAddRelType(rt.key)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                          style={
                            addRelType === rt.key
                              ? { background: rt.bg, color: rt.color, border: `1px solid ${rt.color}40` }
                              : { background: "transparent", color: "#9CA3AF", border: "1px solid #E5E7EB" }
                          }
                        >
                          {rt.label}
                        </button>
                      ))}
                    </div>

                    {/* Search */}
                    <input
                      value={addRelSearch}
                      onChange={e => setAddRelSearch(e.target.value)}
                      placeholder="Search canon records…"
                      autoFocus
                      className="w-full px-3 py-2 text-sm rounded-lg focus:outline-none"
                      style={{
                        border: `1px solid ${WARM_BORDER}`,
                        background: "white",
                        color: INK,
                        fontFamily: "'Instrument Sans', sans-serif",
                      }}
                    />

                    {/* Candidates */}
                    {addRelCandidates.length > 0 ? (
                      <div
                        className="rounded-lg overflow-hidden"
                        style={{ border: `1px solid ${WARM_BORDER}` }}
                      >
                        {addRelCandidates.map(r => {
                          const ttype = CANON_TYPES.find(t => t.key === r.canonType);
                          return (
                            <button
                              key={r.id}
                              onClick={() => addRelMutation.mutate({ toId: r.id, type: addRelType })}
                              disabled={addRelMutation.isPending}
                              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-left transition-colors hover:bg-gray-50 disabled:opacity-50"
                              style={{
                                color: INK,
                                borderBottom: `1px solid ${WARM_BORDER}`,
                                fontFamily: "'Instrument Sans', sans-serif",
                              }}
                            >
                              {ttype && <ttype.Icon className="w-3 h-3 shrink-0" style={{ color: ttype.color }} />}
                              <span className="flex-1 truncate font-medium">{r.name}</span>
                              {addRelMutation.isPending
                                ? <Loader2 className="w-3 h-3 animate-spin shrink-0 opacity-40" />
                                : <Plus className="w-3 h-3 shrink-0 opacity-30" />
                              }
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p
                        className="text-xs text-center py-2"
                        style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                      >
                        {addRelSearch.trim()
                          ? "No matching records"
                          : allRecords.length <= 1 ? "No other records in this world yet" : "Type to search…"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Linked Specs ────────────────────────────────────────────── */}
            {linkedSpecs.length > 0 && (
              <div className="mb-6">
                <div
                  className="rounded-xl p-5"
                  style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}` }}
                >
                  <SectionLabel>Referenced in {linkedSpecs.length} spec{linkedSpecs.length !== 1 ? "s" : ""}</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {linkedSpecs.map(spec => (
                      <Link key={spec.id} href={`/super/worldsmith/editorial/specs/${spec.id}`}>
                        <a
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:shadow-sm"
                          style={{
                            background: "white",
                            color: INK,
                            border: `1px solid ${WARM_BORDER}`,
                            fontFamily: "'Instrument Sans', sans-serif",
                          }}
                        >
                          <FileText className="w-3 h-3 opacity-50" />
                          {spec.productionItem}
                        </a>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Prompt Effect bar ───────────────────────────────────────── */}
            <div
              className="rounded-xl px-5 py-4"
              style={{ background: "#F1EAE0", border: `1px solid ${WARM_BORDER}` }}
            >
              <SectionLabel>Prompt Effect</SectionLabel>
              <p
                className="text-sm leading-relaxed"
                style={{
                  color: regM ? regM.color : "#9CA3AF",
                  fontFamily: "'Spectral', Georgia, serif",
                  fontStyle: "italic",
                }}
              >
                {regM
                  ? `This record contributes ${regM.key.toLowerCase()} tone to the prompt. ${record.registerLocked ? "The register is locked — it will not propagate to related records." : "Related records without a locked register will inherit this tone."}`
                  : "Set an Emotional Register above to preview how this record shapes the compiled prompt."}
              </p>
            </div>

            {/* Danger zone ─────────────────────────────────────────────── */}
            <div className="mt-8 pt-6" style={{ borderTop: `1px dashed ${WARM_BORDER}` }}>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 text-xs font-medium transition-colors"
                style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                onMouseLeave={e => (e.currentTarget.style.color = "#9CA3AF")}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete this record
              </button>
            </div>
          </div>
        </main>

        {/* ══════════════ MARGIN RAIL (352px) ════════════════════════════════ */}
        <aside
          className="shrink-0 flex flex-col overflow-y-auto"
          style={{
            width: 352,
            background: MARGIN_BG,
            borderLeft: `1px dashed ${DASHED_BORDER}`,
          }}
        >
          {/* Header */}
          <div
            className="shrink-0 px-6 pt-6 pb-4"
            style={{ borderBottom: `1px dashed ${DASHED_BORDER}` }}
          >
            <p
              className="text-sm leading-snug mb-3"
              style={{
                fontFamily: "'Spectral', Georgia, serif",
                fontStyle: "italic",
                color: "#9CA3AF",
              }}
            >
              Worldsmith, in the margin
            </p>

            {/* Existing content pills */}
            <div className="flex gap-1.5 flex-wrap mb-3">
              {["All", "To resolve", "Openings"].map(pill => (
                <button
                  key={pill}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                  style={{
                    background: pill === "All" ? PARCHMENT : "transparent",
                    color: pill === "All" ? INK : "#9CA3AF",
                    border: `1px solid ${pill === "All" ? WARM_BORDER : "transparent"}`,
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                >
                  {pill}
                </button>
              ))}
            </div>

            {/* Visibility filter */}
            <div className="mb-2">
              <p
                className="text-[9px] font-semibold tracking-widest uppercase mb-1"
                style={{ color: "#C9BEA8", fontFamily: "'Instrument Sans', sans-serif" }}
              >
                Visibility
              </p>
              <div className="flex gap-1 flex-wrap">
                {[
                  { key: null,         label: "All" },
                  { key: "background", label: "Background" },
                  { key: "hinted",     label: "Hinted" },
                  { key: "explicit",   label: "Explicit" },
                ].map(({ key, label }) => {
                  const active = filterVisibility === key;
                  return (
                    <button
                      key={label}
                      onClick={() => setFilterVisibility(active ? null : key)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
                      style={{
                        background: active ? INK : "transparent",
                        color: active ? "white" : "#9CA3AF",
                        border: `1px solid ${active ? INK : DASHED_BORDER}`,
                        fontFamily: "'Instrument Sans', sans-serif",
                      }}
                    >
                      {key === "background" && <EyeOff style={{ width: 8, height: 8 }} />}
                      {key === "hinted"     && <Eye    style={{ width: 8, height: 8, opacity: 0.55 }} />}
                      {key === "explicit"   && <Eye    style={{ width: 8, height: 8 }} />}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stability filter */}
            <div className="mb-2">
              <p
                className="text-[9px] font-semibold tracking-widest uppercase mb-1"
                style={{ color: "#C9BEA8", fontFamily: "'Instrument Sans', sans-serif" }}
              >
                Stability
              </p>
              <div className="flex gap-1 flex-wrap">
                {[
                  { key: null,     label: "All",    dot: null },
                  { key: "low",    label: "Low",    dot: { char: "●", color: "#9CA3AF" } },
                  { key: "medium", label: "Medium", dot: { char: "◐", color: "#B45309" } },
                  { key: "high",   label: "High",   dot: { char: "●", color: "#065F46" } },
                ].map(({ key, label, dot }) => {
                  const active = filterStability === key;
                  return (
                    <button
                      key={label}
                      onClick={() => setFilterStability(active ? null : key)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
                      style={{
                        background: active ? INK : "transparent",
                        color: active ? "white" : "#9CA3AF",
                        border: `1px solid ${active ? INK : DASHED_BORDER}`,
                        fontFamily: "'Instrument Sans', sans-serif",
                      }}
                    >
                      {dot && (
                        <span style={{ fontSize: 7, lineHeight: 1, color: active ? "white" : dot.color }}>
                          {dot.char}
                        </span>
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Type filter */}
            <div>
              <p
                className="text-[9px] font-semibold tracking-widest uppercase mb-1"
                style={{ color: "#C9BEA8", fontFamily: "'Instrument Sans', sans-serif" }}
              >
                Type
              </p>
              <div className="flex gap-1 flex-wrap">
                {CANON_TYPES.map(t => {
                  const active = filterType === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setFilterType(active ? null : t.key)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all"
                      style={{
                        background: active ? t.color : "transparent",
                        color: active ? "white" : "#9CA3AF",
                        border: `1px solid ${active ? t.color : DASHED_BORDER}`,
                        fontFamily: "'Instrument Sans', sans-serif",
                      }}
                    >
                      <t.Icon style={{ width: 8, height: 8 }} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Clear-all affordance — visible only when any filter is active */}
            {(filterVisibility || filterStability || filterType) && (
              <div
                className="mt-3 pt-3"
                style={{ borderTop: `1px solid ${DASHED_BORDER}` }}
              >
                <button
                  onClick={() => {
                    setFilterVisibility(null);
                    setFilterStability(null);
                    setFilterType(null);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all"
                  style={{
                    background: `${CLAY}18`,
                    color: CLAY,
                    border: `1px solid ${CLAY}40`,
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                >
                  <X className="w-2.5 h-2.5" />
                  Clear all filters
                </button>
              </div>
            )}
          </div>

          {/* Placeholder — AI Assist coming in Step 3 */}
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
            <p
              className="text-sm leading-relaxed"
              style={{
                fontFamily: "'Spectral', Georgia, serif",
                fontStyle: "italic",
                color: "#C9BEA8",
              }}
            >
              "Assist never blocks — it will appear here when you're ready."
            </p>
          </div>

          {/* Register cascade ── lives here so operators can reach it at any time */}
          <div
            className="shrink-0 px-5 py-4"
            style={{ borderTop: `1px dashed ${DASHED_BORDER}` }}
          >
            <SectionLabel>Register Cascade</SectionLabel>

            {/* Contradiction warning — shown when other records declare contradicts→this */}
            {contradictionsIn.length > 0 && (
              <div
                className="flex items-start gap-2 rounded-lg px-3 py-2.5 mb-3 text-xs"
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#9B1C1C",
                  fontFamily: "'Instrument Sans', sans-serif",
                }}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">
                    {contradictionsIn.length} contradiction{contradictionsIn.length !== 1 ? "s" : ""} point here
                  </p>
                  <p className="opacity-70 leading-snug">
                    {contradictionsIn.map(r => r.sourceName).join(", ")} — review before compiling
                  </p>
                </div>
              </div>
            )}

            {record.emotionalRegister ? (
              <div className="flex flex-col gap-2">
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
                >
                  Propagate{" "}
                  <span style={{ color: regM?.color ?? CLAY, fontWeight: 600 }}>
                    {record.emotionalRegister}
                  </span>{" "}
                  to all related records that are not locked.
                </p>

                <button
                  onClick={() => { setCascadeResult(null); cascadeMutation.mutate(); }}
                  disabled={cascadeMutation.isPending || record.registerLocked}
                  className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: INK,
                    color: "white",
                    fontFamily: "'Instrument Sans', sans-serif",
                  }}
                  title={record.registerLocked ? "This record is locked — unlock it first" : "Propagate register to related records"}
                >
                  {cascadeMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Share2 className="w-3.5 h-3.5" />}
                  Propagate Register
                </button>

                {cascadeResult !== null && !cascadeMutation.isPending && (
                  <div
                    className="rounded-lg px-3 py-2.5 text-xs"
                    style={{
                      background: cascadeResult.updated > 0 ? "#EAF5EE" : "#F3F4F6",
                      color: cascadeResult.updated > 0 ? "#065F46" : "#6B7280",
                      fontFamily: "'Instrument Sans', sans-serif",
                    }}
                  >
                    <p className="font-semibold">
                      {cascadeResult.updated > 0
                        ? `✓ ${cascadeResult.updated} record${cascadeResult.updated !== 1 ? "s" : ""} updated`
                        : "No related records to update"}
                    </p>
                    {cascadeResult.skipped_locked > 0 && (
                      <p className="mt-0.5 opacity-70">
                        {cascadeResult.skipped_locked} locked record{cascadeResult.skipped_locked !== 1 ? "s" : ""} skipped
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p
                className="text-xs"
                style={{ color: "#D1D5DB", fontFamily: "'Instrument Sans', sans-serif" }}
              >
                Set an Emotional Register first to enable propagation.
              </p>
            )}
          </div>

          {/* Type selector — lives here in the margin for non-blocking access */}
          <div
            className="shrink-0 px-5 py-4"
            style={{ borderTop: `1px dashed ${DASHED_BORDER}` }}
          >
            <SectionLabel>Canon Type</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {CANON_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => patchMutation.mutate({ canon_type: t.key })}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                  style={
                    record.canonType === t.key
                      ? { background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}40` }
                      : { background: "transparent", color: "#9CA3AF", border: "1px solid transparent" }
                  }
                >
                  <t.Icon className="w-3 h-3" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metadata */}
          <div
            className="shrink-0 px-5 py-4"
            style={{ borderTop: `1px dashed ${DASHED_BORDER}` }}
          >
            <SectionLabel>Metadata</SectionLabel>
            <dl className="space-y-1.5 text-xs" style={{ fontFamily: "'Instrument Sans', sans-serif" }}>
              <div className="flex items-center justify-between">
                <dt style={{ color: "#9CA3AF" }}>ID</dt>
                <dd style={{ color: INK, fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                  {record.id.slice(0, 8)}…
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt style={{ color: "#9CA3AF" }}>Created</dt>
                <dd style={{ color: INK }}>{new Date(record.createdAt).toLocaleDateString()}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt style={{ color: "#9CA3AF" }}>Updated</dt>
                <dd style={{ color: INK }}>{new Date(record.updatedAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      {/* ════════════════════════════════════ DELETE DIALOG ═════════════════ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "#FEF2F2" }}
                >
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2
                className="text-base font-semibold mb-1.5"
                style={{ color: INK, fontFamily: "'Instrument Sans', sans-serif" }}
              >
                Delete canon record?
              </h2>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "#6B7280", fontFamily: "'Instrument Sans', sans-serif" }}
              >
                <span className="font-medium" style={{ color: INK }}>"{record.name}"</span> will be
                permanently removed. This cannot be undone.
                {record.specRefCount > 0 && (
                  <span className="block mt-2 font-medium text-amber-600">
                    ⚠ Referenced by {record.specRefCount} production spec{record.specRefCount !== 1 ? "s" : ""}.
                  </span>
                )}
              </p>
            </div>
            <div
              className="px-6 py-4 flex items-center justify-end gap-3"
              style={{ background: "#F9FAFB", borderTop: "1px solid #F3F4F6" }}
            >
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
                style={{ borderColor: "#E5E7EB", color: "#6B7280" }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                style={{ background: "#EF4444", color: "white" }}
              >
                {deleteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function relTypeMeta(key: string | null | undefined) {
  return RELATION_TYPES.find(r => r.key === key) ?? RELATION_TYPES[0];
}

type RelationTypeKey = typeof RELATION_TYPES[number]["key"];

interface InboundRelation {
  fromRecordId: string;
  toRecordId: string;
  relationType: string | null;
  createdAt: string;
  sourceName: string;
  sourceCanonType: string | null;
  sourceStatus: string;
}

const RELATION_TYPES = [
  { key: "related",     label: "Related",     color: "#6B7280", bg: "#F3F4F6" },
  { key: "supports",    label: "Supports",    color: "#065F46", bg: "#D1FAE5" },
  { key: "contradicts", label: "Contradicts", color: "#9B1C1C", bg: "#FEE2E2" },
  { key: "precedes",    label: "Precedes",    color: "#1D4ED8", bg: "#DBEAFE" },
  { key: "follows",     label: "Follows",     color: "#4338CA", bg: "#EEF2FF" },
] as const;
