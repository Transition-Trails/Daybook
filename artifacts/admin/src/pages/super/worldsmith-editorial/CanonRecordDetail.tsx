/**
 * CanonRecordDetail — Full editor for a single Canon Record.
 *
 * Layout:
 *   Left main (2/3): inline name editor, tabbed content panels (Narrative /
 *     Historical Context / Visual Notes), each auto-saving on blur.
 *   Right sidebar (1/3): Type selector, status workflow, Notion link,
 *     "Referenced in specs" list.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  ArrowLeft, Loader2, Save, CheckCircle2, AlertCircle,
  User2, MapPin, Package, CalendarDays, BookMarked, Wind, Layers,
  ExternalLink, FileText, ChevronRight, Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// ── Type / status config (mirrors CanonLibrary) ───────────────────────────────

const CANON_TYPES = [
  { key: "character",  label: "Character",  color: "#8B5CF6", Icon: User2 },
  { key: "location",   label: "Location",   color: "#3B82F6", Icon: MapPin },
  { key: "object",     label: "Object",     color: "#F59E0B", Icon: Package },
  { key: "event",      label: "Event",      color: "#EC4899", Icon: CalendarDays },
  { key: "lore",       label: "Lore",       color: "#10B981", Icon: BookMarked },
  { key: "atmosphere", label: "Atmosphere", color: "#C87560", Icon: Wind },
  { key: "material",   label: "Material",   color: "#6B7280", Icon: Layers },
] as const;

type CanonTypeKey = typeof CANON_TYPES[number]["key"];

const CANON_TRANSITIONS: Record<string, string[]> = {
  proposed:     ["under_review", "rejected"],
  under_review: ["accepted", "superseded", "rejected", "proposed"],
  accepted:     ["superseded"],
  superseded:   [],
  rejected:     ["proposed"],
};

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  proposed:     { label: "Proposed",     bg: "bg-gray-100",    text: "text-gray-600" },
  under_review: { label: "Under Review", bg: "bg-amber-100",   text: "text-amber-700" },
  accepted:     { label: "Accepted",     bg: "bg-emerald-100", text: "text-emerald-700" },
  superseded:   { label: "Superseded",   bg: "bg-gray-100",    text: "text-gray-400" },
  rejected:     { label: "Rejected",     bg: "bg-red-100",     text: "text-red-600" },
};

const TRANSITION_LABELS: Record<string, string> = {
  under_review: "Send for Review",
  accepted:     "Accept",
  superseded:   "Supersede",
  rejected:     "Reject",
  proposed:     "Reopen as Proposed",
};

/** Pipeline statuses for production specs (distinct from canon record statuses). */
const SPEC_STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  draft:         { label: "Draft",         bg: "bg-gray-100",    text: "text-gray-500" },
  payload_ready: { label: "Payload Ready", bg: "bg-blue-50",     text: "text-blue-600" },
  canon_clear:   { label: "Canon Clear",   bg: "bg-violet-50",   text: "text-violet-600" },
  compiled:      { label: "Compiled",      bg: "bg-emerald-100", text: "text-emerald-700" },
  published:     { label: "Published",     bg: "bg-emerald-100", text: "text-emerald-700" },
  blocked:       { label: "Blocked",       bg: "bg-red-100",     text: "text-red-600" },
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
  specRefCount: number;
  notionPageId?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LinkedSpec {
  id: string;
  productionItem: string;
  componentType: string;
  status: string;
  collectionId?: string | null;
  updatedAt: string;
}

// ── AutoSaveTextArea ─────────────────────────────────────────────────────────

function AutoSaveTextArea({
  label,
  field,
  value,
  placeholder,
  onSave,
  isSaving,
  lastSaved,
}: {
  label: string;
  field: string;
  value: string;
  placeholder: string;
  onSave: (field: string, value: string) => void;
  isSaving: boolean;
  lastSaved: Date | null;
}) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);
  const prevValue = useRef(value);

  // Sync if external value changes (e.g. after save)
  useEffect(() => {
    if (prevValue.current !== value && !dirty) {
      setLocal(value);
      prevValue.current = value;
    }
  }, [value, dirty]);

  const handleBlur = () => {
    if (dirty && local !== prevValue.current) {
      onSave(field, local);
      prevValue.current = local;
    }
    setDirty(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
        <span className="text-[10px] text-gray-400 flex items-center gap-1">
          {isSaving && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
          {!isSaving && lastSaved && (
            <>
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
              Saved
            </>
          )}
        </span>
      </div>
      <textarea
        value={local}
        onChange={e => { setLocal(e.target.value); setDirty(true); }}
        onBlur={handleBlur}
        className="w-full border rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-[#C87560] resize-none transition-colors"
        style={{ borderColor: "#E5E7EB", minHeight: 120 }}
        placeholder={placeholder}
        rows={5}
      />
    </div>
  );
}

// ── InlineNameEditor ──────────────────────────────────────────────────────────

function InlineNameEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocal(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (local.trim() && local.trim() !== value) onSave(local.trim());
    else setLocal(value);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setLocal(value); setEditing(false); } }}
        autoFocus
        className="text-2xl font-bold w-full border-b-2 pb-1 focus:outline-none bg-transparent"
        style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#1B2A4A", borderColor: "#C87560" }}
      />
    );
  }

  return (
    <h1
      className="text-2xl font-bold cursor-text hover:text-[#C87560] transition-colors leading-tight"
      style={{ fontFamily: "'Playfair Display', Georgia, serif", color: "#1B2A4A" }}
      onClick={() => setEditing(true)}
      title="Click to edit"
    >
      {value}
    </h1>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function CanonRecordDetail({ recordId }: { recordId: string }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"narrative" | "historical" | "visual">("narrative");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load record
  const { data: recordData, isLoading, error } = useQuery<{ canon_record: CanonRecord }>({
    queryKey: ["editorial-canon-record", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}`),
    staleTime: 30_000,
  });

  // Load linked specs
  const { data: specsData } = useQuery<{ specs: LinkedSpec[] }>({
    queryKey: ["editorial-canon-record-specs", recordId],
    queryFn: () => apiFetch(`/v1/editorial/canon-records/${recordId}/specs`),
    staleTime: 30_000,
    enabled: !!recordData,
  });

  const record = recordData?.canon_record;
  const linkedSpecs = specsData?.specs ?? [];

  // Patch mutation
  const patchMutation = useMutation({
    mutationFn: (fields: Record<string, string>) =>
      apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      }),
    onMutate: () => setIsSaving(true),
    onSuccess: (result) => {
      qc.setQueryData(["editorial-canon-record", recordId], { canon_record: result.canon_record });
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
      setLastSaved(new Date());
      setIsSaving(false);
    },
    onError: () => {
      toast({ title: "Save failed", variant: "destructive" });
      setIsSaving(false);
    },
  });

  // Transition mutation
  const transitionMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch<{ canon_record: CanonRecord }>(`/v1/editorial/canon-records/${recordId}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (result) => {
      qc.setQueryData(["editorial-canon-record", recordId], { canon_record: result.canon_record });
      qc.invalidateQueries({ queryKey: ["editorial-canon-library"] });
      toast({ title: `Moved to ${result.canon_record.status.replace("_", " ")}` });
    },
    onError: () => toast({ title: "Transition failed", variant: "destructive" }),
  });

  const handleSave = useCallback((fieldKey: string, value: string) => {
    const fieldMap: Record<string, string> = {
      narrativeDetails: "narrative_details",
      historicalContext: "historical_context",
      visualNotes: "visual_notes",
    };
    patchMutation.mutate({ [fieldMap[fieldKey] ?? fieldKey]: value });
  }, [patchMutation]);

  if (isLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-400">
        <AlertCircle className="w-8 h-8 mb-3 opacity-40" />
        <p className="text-sm">Canon record not found.</p>
        <button onClick={() => navigate("/super/worldsmith/editorial/canon")} className="mt-3 text-sm underline">
          Back to library
        </button>
      </div>
    );
  }

  const type = CANON_TYPES.find(t => t.key === record.canonType);
  const statusMeta = STATUS_META[record.status] ?? STATUS_META.proposed;
  const allowedTransitions = CANON_TRANSITIONS[record.status] ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-6 py-3 flex items-center gap-4 shrink-0" style={{ borderColor: "#E5E7EB" }}>
        <button
          onClick={() => navigate("/super/worldsmith/editorial/canon")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Canon Library
        </button>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium truncate max-w-xs">{record.name}</span>

        <div className="ml-auto flex items-center gap-2">
          {isSaving && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" /> Saving…
            </span>
          )}
          {!isSaving && lastSaved && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Saved
            </span>
          )}
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left: content editor ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-6 min-w-0">
          {/* Header */}
          <div className="flex items-start gap-3 mb-6">
            {type && (
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: `${type.color}18` }}
              >
                <type.Icon className="w-5 h-5" style={{ color: type.color }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <InlineNameEditor
                value={record.name}
                onSave={name => patchMutation.mutate({ name })}
              />
              <div className="flex items-center gap-2 mt-2">
                {type && (
                  <span
                    className="text-[11px] font-semibold rounded-full px-2.5 py-1"
                    style={{ background: `${type.color}18`, color: type.color }}
                  >
                    {type.label}
                  </span>
                )}
                <span className={`text-[11px] font-medium rounded-full px-2.5 py-1 ${statusMeta.bg} ${statusMeta.text}`}>
                  {statusMeta.label}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b mb-6" style={{ borderColor: "#F3F4F6" }}>
            {(["narrative", "historical", "visual"] as const).map(tab => {
              const labels = { narrative: "Narrative Details", historical: "Historical Context", visual: "Visual Notes" };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-4 py-2.5 text-sm font-medium border-b-2 transition-colors"
                  style={{
                    borderBottomColor: activeTab === tab ? "#C87560" : "transparent",
                    color: activeTab === tab ? "#C87560" : "#6B7280",
                  }}
                >
                  {labels[tab]}
                </button>
              );
            })}
          </div>

          {/* Tab panels */}
          {activeTab === "narrative" && (
            <AutoSaveTextArea
              label="Narrative Details"
              field="narrativeDetails"
              value={record.narrativeDetails}
              placeholder={
                record.canonType === "character" ? "Describe their role, motivation, and significance…"
                : record.canonType === "location" ? "Describe the place, its atmosphere, and narrative importance…"
                : record.canonType === "object" ? "Describe the artifact, its purpose, and symbolic meaning…"
                : record.canonType === "event" ? "What happened, and why does it still matter?"
                : record.canonType === "lore" ? "State the fact, rule, or belief and its implications…"
                : record.canonType === "atmosphere" ? "Describe the mood and the feeling it evokes…"
                : "Describe this material and its role in the world…"
              }
              onSave={handleSave}
              isSaving={isSaving}
              lastSaved={lastSaved}
            />
          )}

          {activeTab === "historical" && (
            <AutoSaveTextArea
              label="Historical Context"
              field="historicalContext"
              value={record.historicalContext}
              placeholder="Where does it come from? What shaped it? How has it changed over time?"
              onSave={handleSave}
              isSaving={isSaving}
              lastSaved={lastSaved}
            />
          )}

          {activeTab === "visual" && (
            <AutoSaveTextArea
              label="Visual Notes"
              field="visualNotes"
              value={record.visualNotes}
              placeholder="Appearance, materials, light quality, distinctive visual features for prompt reference…"
              onSave={handleSave}
              isSaving={isSaving}
              lastSaved={lastSaved}
            />
          )}

          {/* All content preview (collapsed below tabs) */}
          <div className="mt-8 space-y-4">
            {record.narrativeDetails && activeTab !== "narrative" && (
              <div className="p-4 rounded-xl border" style={{ borderColor: "#F0E8DC", background: "#FDFAF7" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Narrative</p>
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{record.narrativeDetails}</p>
                <button onClick={() => setActiveTab("narrative")} className="text-xs text-[#C87560] mt-1 hover:underline">
                  Edit ↗
                </button>
              </div>
            )}
            {record.historicalContext && activeTab !== "historical" && (
              <div className="p-4 rounded-xl border" style={{ borderColor: "#F0E8DC", background: "#FDFAF7" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Historical Context</p>
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{record.historicalContext}</p>
                <button onClick={() => setActiveTab("historical")} className="text-xs text-[#C87560] mt-1 hover:underline">
                  Edit ↗
                </button>
              </div>
            )}
            {record.visualNotes && activeTab !== "visual" && (
              <div className="p-4 rounded-xl border" style={{ borderColor: "#F0E8DC", background: "#FDFAF7" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Visual Notes</p>
                <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{record.visualNotes}</p>
                <button onClick={() => setActiveTab("visual")} className="text-xs text-[#C87560] mt-1 hover:underline">
                  Edit ↗
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Right sidebar ────────────────────────────────────────────────── */}
        <aside
          className="w-72 shrink-0 border-l flex flex-col overflow-y-auto"
          style={{ borderColor: "#E5E7EB", background: "#FAFAF9" }}
        >
          {/* Type selector */}
          <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EBE0" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Canon Type</p>
            <div className="flex flex-col gap-1.5">
              {CANON_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => patchMutation.mutate({ canon_type: t.key })}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left"
                  style={
                    record.canonType === t.key
                      ? { background: `${t.color}18`, color: t.color }
                      : { color: "#6B7280", background: "transparent" }
                  }
                >
                  <t.Icon className="w-3.5 h-3.5 shrink-0" />
                  {t.label}
                  {record.canonType === t.key && <CheckCircle2 className="w-3 h-3 ml-auto" />}
                </button>
              ))}
            </div>
          </div>

          {/* Status workflow */}
          <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EBE0" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Workflow</p>

            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-3 ${statusMeta.bg} ${statusMeta.text}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {statusMeta.label}
            </div>

            {allowedTransitions.length > 0 && (
              <div className="flex flex-col gap-2">
                {allowedTransitions.map(target => (
                  <button
                    key={target}
                    onClick={() => transitionMutation.mutate(target)}
                    disabled={transitionMutation.isPending}
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-all hover:shadow-sm disabled:opacity-50"
                    style={{ borderColor: "#E5E7EB", color: "#1B2A4A", background: "white" }}
                  >
                    {transitionMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 shrink-0" />
                    )}
                    {TRANSITION_LABELS[target] ?? target}
                  </button>
                ))}
              </div>
            )}
            {allowedTransitions.length === 0 && (
              <p className="text-xs text-gray-400">No further transitions available.</p>
            )}
          </div>

          {/* Referenced specs */}
          <div className="px-5 py-4 border-b" style={{ borderColor: "#F0EBE0" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                Referenced in Specs
              </p>
              {linkedSpecs.length > 0 && (
                <span className="text-[10px] bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
                  {linkedSpecs.length}
                </span>
              )}
            </div>

            {linkedSpecs.length === 0 ? (
              <p className="text-xs text-gray-400 leading-relaxed">
                No production specs reference this canon record yet.
              </p>
            ) : (
              <div className="space-y-2">
                {linkedSpecs.slice(0, 6).map(spec => {
                  const sm = SPEC_STATUS_META[spec.status] ?? SPEC_STATUS_META.draft;
                  return (
                    <Link key={spec.id} href={`/super/worldsmith/editorial/specs/${spec.id}`}>
                      <div
                        className="group flex items-start gap-2 p-2.5 rounded-lg border hover:shadow-sm transition-all cursor-pointer"
                        style={{ borderColor: "#E5E7EB", background: "white" }}
                      >
                        <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: "#1B2A4A" }}>
                            {spec.productionItem}
                          </p>
                          <p className="text-[10px] text-gray-400 truncate">{spec.componentType}</p>
                        </div>
                        <span className={`text-[9px] font-medium rounded-full px-1.5 py-0.5 shrink-0 ${sm.bg} ${sm.text}`}>
                          {sm.label}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {linkedSpecs.length > 6 && (
                  <p className="text-[10px] text-gray-400 text-center pt-1">
                    +{linkedSpecs.length - 6} more
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3">Metadata</p>
            <dl className="space-y-2 text-xs">
              {record.notionPageId && (
                <div className="flex items-center justify-between">
                  <dt className="text-gray-400">Notion</dt>
                  <dd>
                    <a
                      href={`https://notion.so/${record.notionPageId.replace(/-/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[#C87560] hover:underline"
                    >
                      Open page
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-gray-400">Created</dt>
                <dd className="text-gray-600">{new Date(record.createdAt).toLocaleDateString()}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-400">Updated</dt>
                <dd className="text-gray-600">{new Date(record.updatedAt).toLocaleDateString()}</dd>
              </div>
              {record.specRefCount > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-gray-400">Spec refs</dt>
                  <dd className="text-gray-600 font-medium">{record.specRefCount}</dd>
                </div>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
