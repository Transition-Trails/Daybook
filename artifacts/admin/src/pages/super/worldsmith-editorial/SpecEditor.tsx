/**
 * SpecEditor — three-panel tabbed record editor for a Production Spec.
 * Left: form editor (Identity, Creative, Canon, Payload tabs)
 * Right: Completion sidebar with dependency health graph and relationships panel
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Save, ChevronRight, ArrowLeft, CheckCircle2, AlertTriangle,
  Send, Trash2, X, ExternalLink, RefreshCw, Clock, BookOpen,
  FileText, Zap, GitBranch, Circle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useEditorial } from "@/contexts/EditorialContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Spec {
  id: string;
  worldId: string;
  collectionId?: string | null;
  productionItem: string;
  specId?: string | null;
  componentType: string;
  componentSet?: string | null;
  currentVersion: string;
  designIntent: string;
  narrativePurpose: string;
  requiredContent: string;
  reviewCriteria: string;
  writingSpacePercent?: number | null;
  orientation?: string | null;
  frontBackStyle?: string | null;
  canonDependency: string;
  canonRecordIds: string[];
  payloadVersion?: string | null;
  promptPayload: string;
  styleGuideId?: string | null;
  componentSpecId?: string | null;
  promptModuleIds: string[];
  status: string;
  compiledPromptStatus: string;
  readinessScore: number;
  notionPageId?: string | null;
  syncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SpecResponse {
  spec: Spec;
  relationships: {
    style_guide: { id: string; name: string } | null;
    component_spec: { id: string; name: string; componentType: string } | null;
    canon_records: { id: string; name: string; status: string; canonType: string }[];
    prompt_modules: { id: string; name: string }[];
  };
}

// ── Completion scoring ────────────────────────────────────────────────────────

type CheckEntry = { label: string; done: boolean; section: string };

function getChecks(s: Spec): CheckEntry[] {
  const dep = s.canonDependency ?? "None";
  const canonIds = (s.canonRecordIds ?? []) as string[];
  const moduleIds = (s.promptModuleIds ?? []) as string[];
  const payload = s.promptPayload ?? "";

  return [
    { label: "Production item name", done: !!s.productionItem?.trim(), section: "identity" },
    { label: "Component type", done: !!s.componentType?.trim(), section: "identity" },
    { label: "Spec ID", done: !!s.specId?.trim(), section: "identity" },
    { label: "Collection linked", done: !!(s.collectionId?.trim()), section: "identity" },
    { label: "Design intent", done: !!s.designIntent?.trim(), section: "creative" },
    { label: "Narrative purpose", done: !!s.narrativePurpose?.trim(), section: "creative" },
    { label: "Required content", done: !!s.requiredContent?.trim(), section: "creative" },
    { label: "Orientation", done: !!s.orientation?.trim(), section: "creative" },
    { label: "Front/back style", done: !!s.frontBackStyle?.trim(), section: "creative" },
    { label: "Payload version", done: !!s.payloadVersion?.trim(), section: "payload" },
    { label: "Prompt payload content", done: payload.trim().length > 30, section: "payload" },
    { label: "Payload structure", done: payload.includes("shared_prompt") || payload.includes("asset_role"), section: "payload" },
    { label: "Canon dependency set", done: true, section: "canon" }, // always set
    { label: "Style guide linked", done: !!s.styleGuideId?.trim(), section: "canon" },
    { label: "Component spec linked", done: !!s.componentSpecId?.trim(), section: "canon" },
    { label: "Canon records (if required)", done: dep === "None" || canonIds.length > 0, section: "canon" },
    { label: "Prompt modules", done: moduleIds.length > 0, section: "payload" },
    { label: "Review criteria", done: !!s.reviewCriteria?.trim(), section: "review" },
  ];
}

// ── Radial dependency graph ───────────────────────────────────────────────────

function DependencyGraph({ spec, rels }: { spec: Spec; rels: SpecResponse["relationships"] }) {
  const nodes = [
    { id: "spec", label: spec.productionItem.slice(0, 18), health: "green", cx: 90, cy: 90, r: 22, main: true },
    rels.style_guide && { id: "sg", label: "Style Guide", sublabel: rels.style_guide.name.slice(0, 14), health: "green", cx: 155, cy: 35 },
    rels.component_spec && { id: "cs", label: "Component Spec", sublabel: rels.component_spec.name.slice(0, 14), health: "green", cx: 170, cy: 100 },
    ...(rels.canon_records.map((cr, i) => ({
      id: `cr-${i}`,
      label: cr.name.slice(0, 14),
      health: cr.status === "accepted" ? "green" : cr.status === "under_review" ? "amber" : "rose",
      cx: 50 + (i % 2) * 110,
      cy: 145 + Math.floor(i / 2) * 40,
    }))),
  ].filter(Boolean) as { id: string; label: string; sublabel?: string; health: string; cx: number; cy: number; r?: number; main?: boolean }[];

  const healthColor = (h: string) =>
    h === "green" ? "#10B981" : h === "amber" ? "#F59E0B" : "#F87171";

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Dependencies</p>
      {nodes.length <= 1 ? (
        <p className="text-xs text-gray-400">No linked records yet.</p>
      ) : (
        <svg width="200" height={Math.max(160, 80 + rels.canon_records.length * 40)} className="w-full">
          {/* Edges from main node */}
          {nodes.slice(1).map(n => (
            <line key={n.id} x1={90} y1={90} x2={n.cx} y2={n.cy} stroke="#E5E7EB" strokeWidth="1.5" />
          ))}
          {/* Nodes */}
          {nodes.map(n => (
            <g key={n.id}>
              <circle cx={n.cx} cy={n.cy} r={n.r ?? 16} fill="white" stroke={healthColor(n.health)} strokeWidth="2" />
              <text x={n.cx} y={n.cy + 4} textAnchor="middle" fontSize={n.main ? 7 : 6} fill="#374151" fontWeight="500">
                {n.label}
              </text>
              {n.sublabel && (
                <text x={n.cx} y={n.cy + 13} textAnchor="middle" fontSize={5} fill="#9CA3AF">
                  {n.sublabel}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

// ── Right panel ───────────────────────────────────────────────────────────────

function CompletionSidebar({
  spec,
  rels,
  onPublish,
  isPublishing,
}: {
  spec: Spec;
  rels: SpecResponse["relationships"];
  onPublish: () => void;
  isPublishing: boolean;
}) {
  const checks = getChecks(spec);
  const done = checks.filter(c => c.done).length;
  const score = Math.round((done / checks.length) * 100);
  const missing = checks.filter(c => !c.done);

  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 80 ? "#0D9488" : score >= 50 ? "#F59E0B" : "#C87560";

  return (
    <aside
      className="flex flex-col border-l bg-white overflow-y-auto"
      style={{ width: 240, borderColor: "#E5E7EB" }}
    >
      <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "#F3F4F6" }}>
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-3">Readiness</p>
        {/* Score circle */}
        <div className="flex items-center gap-3 mb-3">
          <svg width="68" height="68">
            <circle cx={34} cy={34} r={r} fill="none" stroke="#E5E7EB" strokeWidth="4" />
            <circle
              cx={34} cy={34} r={r} fill="none"
              stroke={color} strokeWidth="4"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform="rotate(-90 34 34)"
            />
            <text x={34} y={39} textAnchor="middle" fontSize="13" fill={color} fontWeight="700">{score}</text>
          </svg>
          <div>
            <p className="text-sm font-semibold text-gray-800">{score}% done</p>
            <p className="text-xs text-gray-500">
              {done}/{checks.length} checks
            </p>
            <p className="text-xs mt-0.5" style={{ color }}>
              {score >= 80 ? "Compile-ready" : score >= 50 ? "Near complete" : "In progress"}
            </p>
          </div>
        </div>

        {/* Pipeline status */}
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
            style={{
              background: spec.status === "compiled" ? "#CCFBF1" : spec.status === "published" ? "#D1FAE5" : spec.status === "blocked" ? "#FEE2E2" : "#F3F4F6",
              color: spec.status === "compiled" ? "#0D9488" : spec.status === "published" ? "#059669" : spec.status === "blocked" ? "#DC2626" : "#6B7280",
            }}
          >
            {spec.status.replace("_", " ")}
          </span>
          <span className="text-xs text-gray-400">{spec.compiledPromptStatus}</span>
        </div>
      </div>

      {/* Missing checks */}
      {missing.length > 0 && (
        <div className="px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Needed next</p>
          {missing.slice(0, 5).map((c, i) => (
            <p key={i} className="text-xs text-gray-500 flex items-start gap-1.5 mb-1">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              {c.label}
            </p>
          ))}
          {missing.length > 5 && (
            <p className="text-xs text-gray-400">{missing.length - 5} more…</p>
          )}
        </div>
      )}

      {/* Dependency graph */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
        <DependencyGraph spec={spec} rels={rels} />
      </div>

      {/* Linked records summary */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Linked Records</p>
        {rels.canon_records.map(cr => (
          <div key={cr.id} className="flex items-center gap-2 mb-1.5">
            <BookOpen className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 flex-1 truncate">{cr.name}</span>
            <span
              className="text-[9px] rounded-full px-1.5 py-0.5"
              style={{
                background: cr.status === "accepted" ? "#D1FAE5" : cr.status === "under_review" ? "#FEF3C7" : "#F3F4F6",
                color: cr.status === "accepted" ? "#059669" : cr.status === "under_review" ? "#D97706" : "#6B7280",
              }}
            >
              {cr.status.replace("_", " ")}
            </span>
          </div>
        ))}
        {rels.style_guide && (
          <div className="flex items-center gap-2 mb-1.5">
            <FileText className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 flex-1 truncate">{rels.style_guide.name}</span>
            <span className="text-[9px] bg-blue-50 text-blue-600 rounded-full px-1.5 py-0.5">Style</span>
          </div>
        )}
        {rels.prompt_modules.map(pm => (
          <div key={pm.id} className="flex items-center gap-2 mb-1.5">
            <Zap className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 flex-1 truncate">{pm.name}</span>
            <span className="text-[9px] bg-violet-50 text-violet-600 rounded-full px-1.5 py-0.5">Module</span>
          </div>
        ))}
        {rels.canon_records.length === 0 && !rels.style_guide && rels.prompt_modules.length === 0 && (
          <p className="text-xs text-gray-400">No linked records.</p>
        )}
      </div>

      {/* Notion publish */}
      <div className="px-4 py-3">
        <button
          onClick={onPublish}
          disabled={isPublishing || score < 30}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm rounded-lg font-medium disabled:opacity-40 transition-colors"
          style={{ background: "#1B2A4A", color: "white" }}
        >
          {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {spec.notionPageId ? "Re-publish to Notion" : "Publish to Notion"}
        </button>
        {spec.notionPageId && (
          <a
            href={`https://notion.so/${spec.notionPageId.replace(/-/g, "")}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mt-2"
          >
            <ExternalLink className="w-3 h-3" />
            View in Notion
          </a>
        )}
      </div>
    </aside>
  );
}

// ── Tab content ───────────────────────────────────────────────────────────────

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#C87560] transition-colors";
const textareaCls = `${inputCls} resize-none`;
const selectCls = `${inputCls} bg-white`;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function IdentityTab({ spec, onChange }: { spec: Spec; onChange: (patch: Partial<Spec>) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Production Item Name">
        <input value={spec.productionItem} onChange={e => onChange({ productionItem: e.target.value })} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Spec ID">
          <input value={spec.specId ?? ""} onChange={e => onChange({ specId: e.target.value })} className={inputCls} placeholder="V01·VGJ·004" />
        </Field>
        <Field label="Current Version">
          <input value={spec.currentVersion} onChange={e => onChange({ currentVersion: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Component Type">
          <select value={spec.componentType} onChange={e => onChange({ componentType: e.target.value })} className={selectCls}>
            <option>Hero Paper</option>
            <option>Decorative Paper</option>
            <option>Journal Card</option>
            <option>Coordinating Paper</option>
            <option>Ephemera Sheet</option>
            <option>Notepaper</option>
            <option>Endpaper</option>
            <option>Washi Tape</option>
          </select>
        </Field>
        <Field label="Component Set">
          <input value={spec.componentSet ?? ""} onChange={e => onChange({ componentSet: e.target.value })} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Orientation">
          <select value={spec.orientation ?? ""} onChange={e => onChange({ orientation: e.target.value })} className={selectCls}>
            <option value="">Not set</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
            <option value="square">Square</option>
          </select>
        </Field>
        <Field label="Front/Back Style">
          <select value={spec.frontBackStyle ?? ""} onChange={e => onChange({ frontBackStyle: e.target.value })} className={selectCls}>
            <option value="">Not set</option>
            <option value="single-sided">Single Sided</option>
            <option value="double-sided-matched">Double Sided — Matched</option>
            <option value="double-sided-complementary">Double Sided — Complementary</option>
            <option value="double-sided-independent">Double Sided — Independent</option>
          </select>
        </Field>
      </div>
      <Field label="Writing Space %" hint="0 = decorative only, 100 = blank/lined paper.">
        <input
          type="number" min={0} max={100} step={5}
          value={spec.writingSpacePercent ?? ""}
          onChange={e => onChange({ writingSpacePercent: e.target.value ? parseFloat(e.target.value) : null })}
          className={inputCls}
        />
      </Field>
    </div>
  );
}

function CreativeTab({ spec, onChange }: { spec: Spec; onChange: (patch: Partial<Spec>) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Design Intent" hint="The visual experience this component should create.">
        <textarea value={spec.designIntent} onChange={e => onChange({ designIntent: e.target.value })} className={textareaCls} rows={4} />
      </Field>
      <Field label="Narrative Purpose" hint="How this connects to the world's story.">
        <textarea value={spec.narrativePurpose} onChange={e => onChange({ narrativePurpose: e.target.value })} className={textareaCls} rows={4} />
      </Field>
      <Field label="Required Content" hint="Specific visual elements, motifs, or text areas that must appear.">
        <textarea value={spec.requiredContent} onChange={e => onChange({ requiredContent: e.target.value })} className={textareaCls} rows={4} />
      </Field>
      <Field label="Review Criteria" hint="How you'll evaluate generated images against this spec.">
        <textarea value={spec.reviewCriteria} onChange={e => onChange({ reviewCriteria: e.target.value })} className={textareaCls} rows={4} />
      </Field>
    </div>
  );
}

function CanonTab({
  spec,
  onChange,
}: {
  spec: Spec;
  onChange: (patch: Partial<Spec>) => void;
}) {
  const { data: sgData } = useQuery({
    queryKey: ["editorial-style-guides", spec.worldId],
    queryFn: () => apiFetch<{ style_guides: { id: string; name: string }[] }>(`/v1/editorial/style-guides?world_id=${spec.worldId}`),
  });
  const { data: csData } = useQuery({
    queryKey: ["editorial-component-specs", spec.worldId],
    queryFn: () => apiFetch<{ component_specs: { id: string; name: string; componentType: string }[] }>(`/v1/editorial/component-specs?world_id=${spec.worldId}`),
  });
  const { data: crData } = useQuery({
    queryKey: ["editorial-canon-records", spec.worldId],
    queryFn: () => apiFetch<{ canon_records: { id: string; name: string; status: string; canonType: string }[] }>(`/v1/editorial/canon-records?world_id=${spec.worldId}`),
  });

  const canonIds = (spec.canonRecordIds ?? []) as string[];
  const toggleCanon = (id: string) => {
    const next = canonIds.includes(id) ? canonIds.filter(x => x !== id) : [...canonIds, id];
    onChange({ canonRecordIds: next });
  };

  return (
    <div className="space-y-4">
      <Field label="Canon Dependency">
        <select value={spec.canonDependency} onChange={e => onChange({ canonDependency: e.target.value })} className={selectCls}>
          <option value="None">None</option>
          <option value="Supports Canon">Supports Canon</option>
          <option value="Canon Reference">Canon Reference</option>
          <option value="Canon Defining">Canon Defining</option>
        </select>
      </Field>
      <Field label="Style Guide">
        <select value={spec.styleGuideId ?? ""} onChange={e => onChange({ styleGuideId: e.target.value || null })} className={selectCls}>
          <option value="">None</option>
          {(sgData?.style_guides ?? []).map(sg => <option key={sg.id} value={sg.id}>{sg.name}</option>)}
        </select>
      </Field>
      <Field label="Component Spec">
        <select value={spec.componentSpecId ?? ""} onChange={e => onChange({ componentSpecId: e.target.value || null })} className={selectCls}>
          <option value="">None</option>
          {(csData?.component_specs ?? []).map(cs => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
        </select>
      </Field>
      <Field label="Canon Records" hint="Select the canon records this spec references.">
        <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto divide-y divide-gray-100">
          {(crData?.canon_records ?? []).length === 0 ? (
            <p className="text-xs text-gray-400 p-3">No canon records in this world yet.</p>
          ) : (
            (crData?.canon_records ?? []).map(cr => (
              <label key={cr.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={canonIds.includes(cr.id)} onChange={() => toggleCanon(cr.id)} className="accent-[#C87560]" />
                <span className="text-sm text-gray-700 flex-1">{cr.name}</span>
                <span
                  className="text-[10px] rounded-full px-1.5 py-0.5"
                  style={{
                    background: cr.status === "accepted" ? "#D1FAE5" : cr.status === "under_review" ? "#FEF3C7" : "#F3F4F6",
                    color: cr.status === "accepted" ? "#059669" : cr.status === "under_review" ? "#D97706" : "#6B7280",
                  }}
                >
                  {cr.status}
                </span>
              </label>
            ))
          )}
        </div>
      </Field>
    </div>
  );
}

function PayloadTab({
  spec,
  onChange,
}: {
  spec: Spec;
  onChange: (patch: Partial<Spec>) => void;
}) {
  const { data: pmData } = useQuery({
    queryKey: ["editorial-prompt-modules", spec.worldId],
    queryFn: () => apiFetch<{ prompt_modules: { id: string; name: string }[] }>(`/v1/editorial/prompt-modules?world_id=${spec.worldId}`),
  });

  const moduleIds = (spec.promptModuleIds ?? []) as string[];
  const toggleModule = (id: string) => {
    const next = moduleIds.includes(id) ? moduleIds.filter(x => x !== id) : [...moduleIds, id];
    onChange({ promptModuleIds: next });
  };

  return (
    <div className="space-y-4">
      <Field label="Payload Version">
        <select value={spec.payloadVersion ?? "PP-2.0"} onChange={e => onChange({ payloadVersion: e.target.value })} className={selectCls}>
          <option value="PP-2.0">PP-2.0 (Section-based)</option>
          <option value="PP-1.0">PP-1.0 (Legacy flat)</option>
        </select>
      </Field>
      <Field label="Prompt Payload">
        <textarea
          value={spec.promptPayload}
          onChange={e => onChange({ promptPayload: e.target.value })}
          className={textareaCls}
          rows={14}
          style={{ fontFamily: "ui-monospace, 'Fira Mono', monospace", fontSize: 12 }}
        />
      </Field>
      {(pmData?.prompt_modules ?? []).length > 0 && (
        <Field label="Prompt Modules">
          <div className="flex flex-wrap gap-2">
            {(pmData?.prompt_modules ?? []).map(pm => {
              const active = moduleIds.includes(pm.id);
              return (
                <button
                  key={pm.id} type="button" onClick={() => toggleModule(pm.id)}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                  style={active ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" } : { background: "white", color: "#6B7280", borderColor: "#E5E7EB" }}
                >
                  {pm.name}
                </button>
              );
            })}
          </div>
        </Field>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "identity", label: "Identity & Print", icon: FileText },
  { id: "creative", label: "Creative Direction", icon: GitBranch },
  { id: "canon", label: "Canon & Governance", icon: BookOpen },
  { id: "payload", label: "Prompt Payload", icon: Zap },
] as const;

type TabId = typeof TABS[number]["id"];

export default function SpecEditor({ specId }: { specId: string }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("identity");
  const [localSpec, setLocalSpec] = useState<Spec | null>(null);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading, error } = useQuery<SpecResponse>({
    queryKey: ["editorial-spec", specId],
    queryFn: () => apiFetch<SpecResponse>(`/v1/editorial/specs/${specId}`),
    staleTime: 30_000,
  });

  // Sync local state when data loads
  useEffect(() => {
    if (data?.spec && !dirty) setLocalSpec(data.spec);
    else if (data?.spec && !localSpec) setLocalSpec(data.spec);
  }, [data?.spec]);

  const onChange = (patch: Partial<Spec>) => {
    setLocalSpec(prev => prev ? { ...prev, ...patch } : null);
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!localSpec) throw new Error("No spec");
      return apiFetch<{ spec: Spec }>(`/v1/editorial/specs/${specId}`, {
        method: "PATCH",
        body: JSON.stringify({
          production_item: localSpec.productionItem,
          spec_id: localSpec.specId || undefined,
          component_type: localSpec.componentType,
          component_set: localSpec.componentSet || undefined,
          current_version: localSpec.currentVersion,
          design_intent: localSpec.designIntent,
          narrative_purpose: localSpec.narrativePurpose,
          required_content: localSpec.requiredContent,
          review_criteria: localSpec.reviewCriteria,
          writing_space_percent: localSpec.writingSpacePercent,
          orientation: localSpec.orientation || undefined,
          front_back_style: localSpec.frontBackStyle || undefined,
          canon_dependency: localSpec.canonDependency,
          canon_record_ids: localSpec.canonRecordIds,
          payload_version: localSpec.payloadVersion,
          prompt_payload: localSpec.promptPayload,
          style_guide_id: localSpec.styleGuideId || undefined,
          component_spec_id: localSpec.componentSpecId || undefined,
          prompt_module_ids: localSpec.promptModuleIds,
        }),
      });
    },
    onSuccess: (data) => {
      setLocalSpec(data.spec);
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["editorial-spec", specId] });
      qc.invalidateQueries({ queryKey: ["editorial-board"] });
      toast({ title: "Saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const publishMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/editorial/specs/${specId}/publish`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-spec", specId] });
      toast({ title: "Published to Notion" });
    },
    onError: (err: any) => {
      const msg = err?.code === "NO_NOTION_DB" ? "World has no Notion DB configured." : "Publish failed";
      toast({ title: msg, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/editorial/specs/${specId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Spec deleted" });
      navigate("/super/worldsmith/editorial/board");
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const spec = localSpec ?? data?.spec;
  const rels = data?.relationships ?? { style_guide: null, component_spec: null, canon_records: [], prompt_modules: [] };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  if (error || !spec) return (
    <div className="flex items-center justify-center h-full text-red-400 text-sm">
      Failed to load spec.
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate("/super/worldsmith/editorial/board")} className="text-gray-400 hover:text-gray-600 shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1
              className="font-semibold text-[#1B2A4A] truncate"
              style={{ fontFamily: "'Playfair Display', serif", fontSize: 17 }}
            >
              {spec.productionItem}
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {spec.specId && <span>{spec.specId}</span>}
              <span>·</span>
              <span>{spec.componentType}</span>
              {dirty && <span className="text-amber-500">· unsaved changes</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => deleteMutation.mutate()}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
            title="Delete spec"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-colors"
            style={{ background: dirty ? "#C87560" : "#E5E7EB" }}
          >
            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor panel */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Tabs */}
          <div className="bg-white border-b border-gray-200 flex">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-4 py-3 text-sm transition-colors relative"
                  style={{ color: active ? "#C87560" : "#6B7280", borderBottom: active ? "2px solid #C87560" : "2px solid transparent", fontWeight: active ? 500 : 400 }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div style={{ maxWidth: 640 }}>
              {activeTab === "identity" && <IdentityTab spec={spec} onChange={onChange} />}
              {activeTab === "creative" && <CreativeTab spec={spec} onChange={onChange} />}
              {activeTab === "canon" && <CanonTab spec={spec} onChange={onChange} />}
              {activeTab === "payload" && <PayloadTab spec={spec} onChange={onChange} />}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <CompletionSidebar
          spec={spec}
          rels={rels}
          onPublish={() => publishMutation.mutate()}
          isPublishing={publishMutation.isPending}
        />
      </div>
    </div>
  );
}
