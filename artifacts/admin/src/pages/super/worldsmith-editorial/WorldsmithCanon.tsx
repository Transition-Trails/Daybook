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
  ChevronRight, FileText, Trash2, X,
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
  { key: "character",  label: "Character",  color: "#8B5CF6", Icon: User2 },
  { key: "location",   label: "Location",   color: "#3B82F6", Icon: MapPin },
  { key: "object",     label: "Object",     color: "#F59E0B", Icon: Package },
  { key: "event",      label: "Event",      color: "#EC4899", Icon: CalendarDays },
  { key: "lore",       label: "Lore",       color: "#10B981", Icon: BookMarked },
  { key: "atmosphere", label: "Atmosphere", color: CLAY,      Icon: Wind },
  { key: "material",   label: "Material",   color: "#6B7280", Icon: Layers },
] as const;

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
  specRefCount: number;
  notionPageId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
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
}

interface LinkedSpec {
  id: string;
  productionItem: string;
  componentType: string;
  status: string;
}

// ── Canon-type ID abbreviations ───────────────────────────────────────────────
const TYPE_ABBREV: Record<string, string> = {
  character:   "CHR",
  location:    "PLC",
  object:      "OBJ",
  event:       "EVT",
  lore:        "LOR",
  atmosphere:  "ATM",
  material:    "MAT",
  institution: "INS",
};

/**
 * Builds type-prefixed IDs: CHR-001, PLC-002, etc.
 * Sequence is 1-based within each type group across the world's record list.
 */
function buildIdMap(records: CanonListItem[]): Map<string, string> {
  const counters: Record<string, number> = {};
  const map = new Map<string, string>();
  for (const r of records) {
    const abbrev = r.canonType ? (TYPE_ABBREV[r.canonType] ?? "REC") : "REC";
    counters[abbrev] = (counters[abbrev] ?? 0) + 1;
    map.set(r.id, `${abbrev}-${String(counters[abbrev]).padStart(3, "0")}`);
  }
  return map;
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
export default function WorldsmithCanon({ recordId }: { recordId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { worlds, selectedWorldId, setSelectedWorldId } = useEditorial();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const world = worlds.find(w => w.id === selectedWorldId) ?? worlds[0] ?? null;

  // ── Load the current record ────────────────────────────────────────────────
  const { data: recordData, isLoading, error } = useQuery<{ canon_record: CanonRecord }>({
    queryKey: ["editorial-canon-record", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}`),
    staleTime: 30_000,
  });
  const record = recordData?.canon_record ?? null;

  // ── Load record list for rail (all records for the selected world) ─────────
  const worldId = record?.worldId ?? selectedWorldId ?? "";
  const { data: listData } = useQuery<{ canon_records: CanonListItem[] }>({
    queryKey: ["editorial-canon-library", worldId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records?world_id=${worldId}&limit=200`),
    enabled: !!worldId,
    staleTime: 30_000,
  });
  const allRecords: CanonListItem[] = listData?.canon_records ?? [];

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
  const idMap     = buildIdMap(allRecords);
  const idStamp   = idMap.get(recordId) ?? "—";

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
        className="shrink-0 flex items-center px-5 gap-6"
        style={{
          height: 52,
          background: "white",
          borderBottom: `1px solid ${WARM_BORDER}`,
        }}
      >
        {/* Left: Worldsmith wordmark */}
        <span
          className="shrink-0 text-sm font-semibold"
          style={{ color: INK, fontFamily: "'Instrument Sans', sans-serif" }}
        >
          Worldsmith
        </span>

        {/* Center: tabs */}
        <nav className="flex items-center gap-1">
          {(["Canon", "Prompt modules", "Style guides", "Visual assets"] as const).map(tab => {
            const href: Record<string, string> = {
              "Canon": "/super/worldsmith/editorial/canon",
              "Prompt modules": "/super/worldsmith/editorial/modules",
              "Style guides": "/super/worldsmith/editorial/style-guides",
              "Visual assets": "/super/worldsmith/editorial/board",
            };
            const active = tab === "Canon";
            return (
              <Link
                key={tab}
                href={href[tab]}
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: active ? INK : "transparent",
                  color: active ? "white" : "#6B7280",
                  fontFamily: "'Instrument Sans', sans-serif",
                }}
              >
                {tab}
              </Link>
            );
          })}
        </nav>

        {/* Right: readiness + notion + generate */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          {/* Readiness track */}
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: "#9CA3AF", fontFamily: "'Instrument Sans', sans-serif" }}
            >
              Ready
            </span>
            <div
              className="rounded-full overflow-hidden"
              style={{ width: 80, height: 5, background: "#E5E7EB" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${readyPct}%`, background: "#4CAF72" }}
              />
            </div>
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: INK, fontFamily: "'Space Mono', monospace", minWidth: 24 }}
            >
              {readyPct}
            </span>
          </div>

          {/* Notion synced — show when the world has a Canon DB configured */}
          {world?.notionCanonDbId && (
            <span
              className="flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: "#22C55E", fontFamily: "'Instrument Sans', sans-serif" }}
            >
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Notion synced
            </span>
          )}

          {/* Generate */}
          <button
            disabled
            className="px-4 py-1.5 rounded-lg text-sm font-semibold cursor-not-allowed opacity-50"
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

        {/* ══════════════ LEFT RAIL (280px) ══════════════════════════════════ */}
        <aside
          className="shrink-0 flex flex-col"
          style={{
            width: 280,
            borderRight: `1px solid ${WARM_BORDER}`,
            background: WARM_BG,
          }}
        >
          {/* World header */}
          <div
            className="shrink-0 px-4 pt-4 pb-3"
            style={{ borderBottom: `1px solid ${WARM_BORDER}` }}
          >
            {/* Inline badge + world name */}
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: INK, color: "white",
                  fontFamily: "'Space Mono', monospace",
                  letterSpacing: "0.05em",
                }}
              >
                {world?.code?.slice(0, 2).toUpperCase() ?? "WS"}
              </span>
              <span
                className="text-sm font-semibold leading-tight"
                style={{ color: INK, fontFamily: "'Instrument Sans', sans-serif" }}
              >
                {world?.name ?? "—"}
              </span>
            </div>

            {/* World description */}
            {world?.description && (
              <p
                className="text-[11px] leading-snug mb-2.5"
                style={{
                  color: "#9CA3AF",
                  fontFamily: "'Instrument Sans', sans-serif",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {world.description}
              </p>
            )}

            {/* World emotional register pill */}
            {world && (() => {
              const worldReg = allRecords.length > 0
                ? allRecords.reduce<string | null>((acc, r) => {
                    if (!acc && r.emotionalRegister) return r.emotionalRegister;
                    return acc;
                  }, null)
                : null;
              const rm2 = regMeta(worldReg);
              return rm2 ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: rm2.bg, color: rm2.color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: rm2.color }} />
                  {rm2.key}
                </span>
              ) : null;
            })()}
          </div>

          {/* Records list header */}
          <div
            className="shrink-0 flex items-center justify-between px-4 py-2"
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
              {allRecords.length}
            </span>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {allRecords.map(r => {
              const active = r.id === recordId;
              const rm = regMeta(r.emotionalRegister);
              const typeId = idMap.get(r.id) ?? "";
              return (
                <Link
                  key={r.id}
                  href={`/super/worldsmith/editorial/canon/${r.id}`}
                  className="flex items-center gap-2.5 py-2.5 transition-colors"
                  style={{
                    borderLeft: active ? `3px solid ${CLAY}` : "3px solid transparent",
                    background: active ? PARCHMENT : "transparent",
                    paddingLeft: 13,
                    paddingRight: 12,
                  }}
                >
                  {/* Register dot */}
                  <span
                    className="shrink-0 w-2 h-2 rounded-full"
                    style={{ background: rm ? rm.color : "#D1D5DB" }}
                  />

                  {/* Name */}
                  <span
                    className="flex-1 text-xs leading-snug truncate"
                    style={{
                      color: active ? INK : "#6B7280",
                      fontWeight: active ? 600 : 400,
                      fontFamily: "'Instrument Sans', sans-serif",
                    }}
                  >
                    {r.name}
                  </span>

                  {/* Type-prefixed ID right-aligned */}
                  {typeId && (
                    <span
                      className="shrink-0 text-[10px] tabular-nums"
                      style={{
                        color: active ? "#9CA3AF" : "#D1D5DB",
                        fontFamily: "'Space Mono', monospace",
                      }}
                    >
                      {typeId}
                    </span>
                  )}
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
                  record.canonType === "character" ? "Role, motivation, significance…"
                  : record.canonType === "location" ? "Place, atmosphere, narrative importance…"
                  : record.canonType === "atmosphere" ? "Mood and feeling…"
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
            {linkedSpecs.length > 0 && (
              <div className="mb-6">
                <div
                  className="rounded-xl p-5"
                  style={{ background: PARCHMENT, border: `1px solid ${WARM_BORDER}` }}
                >
                  <SectionLabel>Referenced in {linkedSpecs.length} spec{linkedSpecs.length !== 1 ? "s" : ""}</SectionLabel>
                  <div className="flex flex-wrap gap-2">
                    {linkedSpecs.map(spec => (
                      <Link
                        key={spec.id}
                        href={`/super/worldsmith/editorial/specs/${spec.id}`}
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

            {/* Filter pills */}
            <div className="flex gap-1.5 flex-wrap">
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
