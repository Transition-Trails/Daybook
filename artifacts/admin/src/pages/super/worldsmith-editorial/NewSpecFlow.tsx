/**
 * NewSpecFlow — progressive 5-section creation form for Production Specs.
 * Sections unlock sequentially; completion sidebar tracks readiness score.
 */
import { useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronRight, CheckCircle2, Circle, Loader2, ArrowLeft,
  BookOpen, Layers, Zap, FileText, GitBranch, X, Plus,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  // Identity
  productionItem: string;
  specId: string;
  componentType: string;
  componentSet: string;
  // Creative Direction
  designIntent: string;
  narrativePurpose: string;
  requiredContent: string;
  orientation: string;
  frontBackStyle: string;
  // Print Spec
  writingSpacePercent: string;
  reviewCriteria: string;
  // Canon
  canonDependency: string;
  canonRecordIds: string[];
  styleGuideId: string;
  componentSpecId: string;
  // Payload
  payloadVersion: string;
  promptPayload: string;
  promptModuleIds: string[];
}

const EMPTY: FormState = {
  productionItem: "",
  specId: "",
  componentType: "",
  componentSet: "",
  designIntent: "",
  narrativePurpose: "",
  requiredContent: "",
  orientation: "",
  frontBackStyle: "",
  writingSpacePercent: "",
  reviewCriteria: "",
  canonDependency: "None",
  canonRecordIds: [],
  styleGuideId: "",
  componentSpecId: "",
  payloadVersion: "PP-2.0",
  promptPayload: "",
  promptModuleIds: [],
};

// ── Completion scoring ────────────────────────────────────────────────────────

interface SectionMeta {
  id: string;
  label: string;
  icon: React.ElementType;
  checks: (f: FormState) => { label: string; done: boolean }[];
}

const SECTIONS: SectionMeta[] = [
  {
    id: "identity",
    label: "Identity",
    icon: FileText,
    checks: f => [
      { label: "Production item name", done: !!f.productionItem.trim() },
      { label: "Component type", done: !!f.componentType.trim() },
      { label: "Component set", done: !!f.componentSet.trim() },
    ],
  },
  {
    id: "creative",
    label: "Creative Direction",
    icon: Layers,
    checks: f => [
      { label: "Design intent", done: !!f.designIntent.trim() },
      { label: "Narrative purpose", done: !!f.narrativePurpose.trim() },
      { label: "Required content", done: !!f.requiredContent.trim() },
      { label: "Orientation", done: !!f.orientation },
      { label: "Front/back style", done: !!f.frontBackStyle },
    ],
  },
  {
    id: "canon",
    label: "Canon & Governance",
    icon: BookOpen,
    checks: f => [
      { label: "Canon dependency set", done: !!f.canonDependency },
      { label: "Style guide linked", done: !!f.styleGuideId },
      { label: "Component spec linked", done: !!f.componentSpecId },
      {
        label: "Canon records linked (if required)",
        done: f.canonDependency === "None" || f.canonRecordIds.length > 0,
      },
    ],
  },
  {
    id: "payload",
    label: "Prompt Payload",
    icon: Zap,
    checks: f => [
      { label: "Payload version", done: !!f.payloadVersion },
      { label: "Prompt payload content", done: f.promptPayload.trim().length > 30 },
      { label: "Includes shared_prompt", done: f.promptPayload.includes("shared_prompt") || f.promptPayload.includes("asset_role") },
    ],
  },
  {
    id: "review",
    label: "Review Criteria",
    icon: GitBranch,
    checks: f => [
      { label: "Review criteria filled", done: !!f.reviewCriteria.trim() },
      { label: "Writing space set", done: !!f.writingSpacePercent },
      { label: "Prompt modules linked", done: f.promptModuleIds.length > 0 },
    ],
  },
];

function computeSectionScore(section: SectionMeta, f: FormState): number {
  const checks = section.checks(f);
  return Math.round(checks.filter(c => c.done).length / checks.length * 100);
}

function computeOverallScore(f: FormState): number {
  const allChecks = SECTIONS.flatMap(s => s.checks(f));
  return Math.round(allChecks.filter(c => c.done).length / allChecks.length * 100);
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function CircleScore({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 80 ? "#0D9488" : score >= 50 ? "#F59E0B" : "#C87560";
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="3.5" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="3.5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={size / 5} fill={color} fontWeight="700">
        {score}
      </text>
    </svg>
  );
}

function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#C87560] transition-colors";
const textareaCls = `${inputCls} resize-none`;
const selectCls = `${inputCls} bg-white`;

// ── Section forms ─────────────────────────────────────────────────────────────

function IdentitySection({ f, set, worldId }: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  worldId: string | null;
}) {
  const { data: setsData } = useQuery({
    queryKey: ["editorial-component-sets", worldId],
    queryFn: () => apiFetch<{ component_sets: string[] }>(`/v1/editorial/component-sets?world_id=${worldId}`),
    enabled: !!worldId,
    staleTime: 60_000,
  });
  const existingSets = setsData?.component_sets ?? [];

  return (
    <div className="space-y-4">
      <Field label="Production Item Name" required hint="The full name as it appears in the production catalog.">
        <input value={f.productionItem} onChange={e => set("productionItem", e.target.value)} className={inputCls} placeholder="e.g. Victorian Garden Journal — Botanical Survey Page" />
      </Field>
      <Field label="Component Type" required>
        <select value={f.componentType} onChange={e => set("componentType", e.target.value)} className={selectCls}>
          <option value="">Select type…</option>
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
      <Field label="Component Set" hint="The thematic family this belongs to — pick an existing set or type a new name.">
        <input
          value={f.componentSet}
          onChange={e => set("componentSet", e.target.value)}
          className={inputCls}
          placeholder="e.g. The Herbalist's Collection"
          list="component-set-list"
          autoComplete="off"
        />
        {existingSets.length > 0 && (
          <datalist id="component-set-list">
            {existingSets.map(s => <option key={s} value={s} />)}
          </datalist>
        )}
      </Field>
      <Field label="Spec ID" hint="Leave blank to auto-generate (e.g. WYC-HRP-001). Override here if you have a naming convention.">
        <input
          value={f.specId}
          onChange={e => set("specId", e.target.value)}
          className={inputCls}
          placeholder="Auto-generated on save"
        />
      </Field>
    </div>
  );
}

function CreativeSection({ f, set }: { f: FormState; set: (k: keyof FormState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Design Intent" required hint="What visual experience should this create?">
        <textarea value={f.designIntent} onChange={e => set("designIntent", e.target.value)} className={textareaCls} rows={3} placeholder="Describe the feeling, mood, and visual atmosphere…" />
      </Field>
      <Field label="Narrative Purpose" required hint="What story does this component serve?">
        <textarea value={f.narrativePurpose} onChange={e => set("narrativePurpose", e.target.value)} className={textareaCls} rows={3} placeholder="How does this connect to the world's narrative…" />
      </Field>
      <Field label="Required Content" required hint="Specific elements that must appear.">
        <textarea value={f.requiredContent} onChange={e => set("requiredContent", e.target.value)} className={textareaCls} rows={3} placeholder="List required visual elements, motifs, text areas…" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Orientation">
          <select value={f.orientation} onChange={e => set("orientation", e.target.value)} className={selectCls}>
            <option value="">Select…</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
            <option value="square">Square</option>
          </select>
        </Field>
        <Field label="Front/Back Style">
          <select value={f.frontBackStyle} onChange={e => set("frontBackStyle", e.target.value)} className={selectCls}>
            <option value="">Select…</option>
            <option value="single-sided">Single Sided</option>
            <option value="double-sided-matched">Double Sided — Matched</option>
            <option value="double-sided-complementary">Double Sided — Complementary</option>
            <option value="double-sided-independent">Double Sided — Independent</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function CanonSection({
  f,
  set,
  worldId,
  onToggleCanonId,
}: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  worldId: string | null;
  onToggleCanonId: (id: string) => void;
}) {
  const { data: sgData } = useQuery({
    queryKey: ["editorial-style-guides", worldId],
    queryFn: () => apiFetch<{ style_guides: { id: string; name: string }[] }>(`/v1/editorial/style-guides?world_id=${worldId}`),
    enabled: !!worldId,
  });
  const { data: csData } = useQuery({
    queryKey: ["editorial-component-specs", worldId],
    queryFn: () => apiFetch<{ component_specs: { id: string; name: string; componentType: string }[] }>(`/v1/editorial/component-specs?world_id=${worldId}`),
    enabled: !!worldId,
  });
  const { data: crData } = useQuery({
    queryKey: ["editorial-canon-records", worldId, "accepted"],
    queryFn: () => apiFetch<{ canon_records: { id: string; name: string; status: string; canonType: string }[] }>(`/v1/editorial/canon-records?world_id=${worldId}&status=accepted`),
    enabled: !!worldId && f.canonDependency !== "None",
  });

  return (
    <div className="space-y-4">
      <Field label="Canon Dependency" hint="How strongly does this spec depend on approved canon records?">
        <select value={f.canonDependency} onChange={e => set("canonDependency", e.target.value)} className={selectCls}>
          <option value="None">None — visually inspired, no specific references</option>
          <option value="Supports Canon">Supports Canon — consistent with established records</option>
          <option value="Canon Reference">Canon Reference — specifically references canon elements</option>
          <option value="Canon Defining">Canon Defining — will define new canon (all refs must be Accepted)</option>
        </select>
      </Field>

      <Field label="Style Guide">
        <select value={f.styleGuideId} onChange={e => set("styleGuideId", e.target.value)} className={selectCls}>
          <option value="">No style guide linked</option>
          {(sgData?.style_guides ?? []).map(sg => (
            <option key={sg.id} value={sg.id}>{sg.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Component Spec">
        <select value={f.componentSpecId} onChange={e => set("componentSpecId", e.target.value)} className={selectCls}>
          <option value="">No component spec linked</option>
          {(csData?.component_specs ?? []).map(cs => (
            <option key={cs.id} value={cs.id}>{cs.name} ({cs.componentType})</option>
          ))}
        </select>
      </Field>

      {f.canonDependency !== "None" && (
        <Field label="Canon Records" hint="Select accepted canon records this spec references.">
          <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
            {(crData?.canon_records ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 p-3">No accepted canon records yet.</p>
            ) : (
              (crData?.canon_records ?? []).map(cr => (
                <label key={cr.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.canonRecordIds.includes(cr.id)}
                    onChange={() => onToggleCanonId(cr.id)}
                    className="accent-[#C87560]"
                  />
                  <span className="text-sm text-gray-700">{cr.name}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{cr.canonType}</span>
                </label>
              ))
            )}
          </div>
        </Field>
      )}
    </div>
  );
}

function PayloadSection({ f, set, worldId, onToggleModuleId }: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  worldId: string | null;
  onToggleModuleId: (id: string) => void;
}) {
  const { data: pmData } = useQuery({
    queryKey: ["editorial-prompt-modules", worldId],
    queryFn: () => apiFetch<{ prompt_modules: { id: string; name: string }[] }>(`/v1/editorial/prompt-modules?world_id=${worldId}`),
    enabled: !!worldId,
  });

  return (
    <div className="space-y-4">
      <Field label="Payload Version">
        <select value={f.payloadVersion} onChange={e => set("payloadVersion", e.target.value)} className={selectCls}>
          <option value="PP-2.0">PP-2.0 (Section-based)</option>
          <option value="PP-1.0">PP-1.0 (Legacy flat)</option>
        </select>
      </Field>
      <Field label="Prompt Payload" required hint={f.payloadVersion === "PP-2.0" ? "Include shared_prompt, front_prompt, and negative_prompt sections." : "Single flat prompt string."}>
        <textarea
          value={f.promptPayload}
          onChange={e => set("promptPayload", e.target.value)}
          className={textareaCls}
          rows={10}
          placeholder={f.payloadVersion === "PP-2.0" ? `shared_prompt: Aged botanical illustration from a Victorian naturalist's journal…\n\nfront_prompt: Delicate hand-drawn plant specimen with taxonomic annotations…\n\nnegative_prompt: modern, digital, harsh lines, neon…` : `asset_role: Hero Paper\ncard_role: Hero Paper\nmaterials: Cotton paper, aged foxing…`}
          style={{ fontFamily: "ui-monospace, 'Fira Mono', monospace", fontSize: 12 }}
        />
      </Field>
      {(pmData?.prompt_modules ?? []).length > 0 && (
        <Field label="Prompt Modules" hint="Include content from these modules.">
          <div className="flex flex-wrap gap-2">
            {(pmData?.prompt_modules ?? []).map(pm => {
              const active = f.promptModuleIds.includes(pm.id);
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => onToggleModuleId(pm.id)}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                  style={active
                    ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" }
                    : { background: "white", color: "#6B7280", borderColor: "#E5E7EB" }}
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

function ReviewSection({ f, set }: { f: FormState; set: (k: keyof FormState, v: string) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Review Criteria" hint="What will you evaluate when reviewing generated images?">
        <textarea value={f.reviewCriteria} onChange={e => set("reviewCriteria", e.target.value)} className={textareaCls} rows={5} placeholder="Does the botanical illustration style match the hero paper?&#10;Are the writing spaces correctly sized?&#10;Does it evoke the Victorian naturalist aesthetic?…" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Writing Space %" hint="0 for decorative, 100 for blank paper.">
          <input
            type="number"
            min={0} max={100} step={5}
            value={f.writingSpacePercent}
            onChange={e => set("writingSpacePercent", e.target.value)}
            className={inputCls}
            placeholder="e.g. 60"
          />
        </Field>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewSpecFlow() {
  const [, navigate] = useLocation();
  const { selectedWorldId, selectedCollectionId } = useEditorial();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [activeSection, setActiveSection] = useState(0);

  const set = (k: keyof FormState, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleId = (key: "canonRecordIds" | "promptModuleIds", id: string) => {
    setForm(prev => {
      const arr = prev[key] as string[];
      const next = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
      return { ...prev, [key]: next };
    });
  };

  const overallScore = computeOverallScore(form);

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiFetch<{ spec: { id: string } }>("/v1/editorial/specs", {
        method: "POST",
        body: JSON.stringify({
          world_id: selectedWorldId,
          collection_id: selectedCollectionId || undefined,
          production_item: form.productionItem,
          spec_id: form.specId || undefined,
          component_type: form.componentType,
          component_set: form.componentSet || undefined,
          design_intent: form.designIntent,
          narrative_purpose: form.narrativePurpose,
          required_content: form.requiredContent,
          orientation: form.orientation || undefined,
          front_back_style: form.frontBackStyle || undefined,
          writing_space_percent: form.writingSpacePercent ? parseFloat(form.writingSpacePercent) : undefined,
          review_criteria: form.reviewCriteria,
          canon_dependency: form.canonDependency,
          canon_record_ids: form.canonRecordIds,
          style_guide_id: form.styleGuideId || undefined,
          component_spec_id: form.componentSpecId || undefined,
          payload_version: form.payloadVersion,
          prompt_payload: form.promptPayload,
          prompt_module_ids: form.promptModuleIds,
        }),
      });
    },
    onSuccess: (data) => {
      toast({ title: "Production spec created" });
      navigate(`/super/worldsmith/editorial/specs/${data.spec.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create spec", variant: "destructive" });
    },
  });

  const canSubmit = !!(form.productionItem.trim() && form.componentType.trim() && selectedWorldId);
  const currentSection = SECTIONS[activeSection];

  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#FAF8F3" }}>
      {/* Progress sidebar */}
      <aside className="flex flex-col border-r bg-white" style={{ width: 220, borderColor: "#E5E7EB" }}>
        <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: "#F3F4F6" }}>
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">New Asset</div>
          <div className="font-medium text-gray-800" style={{ fontFamily: "'Playfair Display', serif", fontSize: 16 }}>
            {form.productionItem.trim() || "Untitled Spec"}
          </div>
          {form.componentType && (
            <div className="text-xs text-[#C87560] mt-0.5">{form.componentType}</div>
          )}
        </div>

        {/* Overall score */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
          <CircleScore score={overallScore} size={48} />
          <div>
            <div className="text-xs text-gray-500">Readiness</div>
            <div
              className="text-sm font-semibold"
              style={{ color: overallScore >= 80 ? "#0D9488" : overallScore >= 50 ? "#F59E0B" : "#9CA3AF" }}
            >
              {overallScore >= 80 ? "Compile-ready" : overallScore >= 50 ? "Near complete" : "In progress"}
            </div>
          </div>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto py-2">
          {SECTIONS.map((sec, i) => {
            const score = computeSectionScore(sec, form);
            const isActive = i === activeSection;
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(i)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors"
                style={isActive ? { background: "rgba(200,117,96,0.08)", borderLeft: "2px solid #C87560" } : { borderLeft: "2px solid transparent" }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? "#C87560" : "#9CA3AF" }} />
                <span className="flex-1 text-sm" style={{ color: isActive ? "#C87560" : "#4B5563", fontWeight: isActive ? 500 : 400 }}>
                  {sec.label}
                </span>
                {score === 100 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                ) : (
                  <span className="text-[10px] text-gray-400 shrink-0">{score}%</span>
                )}
              </button>
            );
          })}
        </div>

        {/* "What's needed" */}
        <div className="border-t px-4 py-3" style={{ borderColor: "#F3F4F6" }}>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Next required</p>
          {SECTIONS.flatMap(s => s.checks(form).filter(c => !c.done)).slice(0, 3).map((c, i) => (
            <p key={i} className="text-xs text-gray-500 flex items-start gap-1.5 mb-1">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              {c.label}
            </p>
          ))}
          {SECTIONS.flatMap(s => s.checks(form).filter(c => !c.done)).length === 0 && (
            <p className="text-xs text-teal-600">All checks passed ✓</p>
          )}
        </div>
      </aside>

      {/* Main form area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0" style={{ borderColor: "#E5E7EB" }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/super/worldsmith/editorial/board")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-[#1B2A4A]">
                {currentSection.label}
              </h1>
              <p className="text-xs text-gray-400">
                Step {activeSection + 1} of {SECTIONS.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Section nav */}
            <button
              onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
              disabled={activeSection === 0}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Back
            </button>
            {activeSection < SECTIONS.length - 1 ? (
              <button
                onClick={() => setActiveSection(activeSection + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium text-white transition-colors"
                style={{ background: "#1B2A4A" }}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit || createMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium text-white disabled:opacity-50"
                style={{ background: "#C87560" }}
              >
                {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create Spec
              </button>
            )}
          </div>
        </div>

        {/* Section content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            {activeSection === 0 && <IdentitySection f={form} set={set} worldId={selectedWorldId} />}
            {activeSection === 1 && <CreativeSection f={form} set={set} />}
            {activeSection === 2 && (
              <CanonSection
                f={form} set={set}
                worldId={selectedWorldId}
                onToggleCanonId={id => toggleId("canonRecordIds", id)}
              />
            )}
            {activeSection === 3 && (
              <PayloadSection
                f={form} set={set}
                worldId={selectedWorldId}
                onToggleModuleId={id => toggleId("promptModuleIds", id)}
              />
            )}
            {activeSection === 4 && <ReviewSection f={form} set={set} />}
          </div>
        </div>
      </div>
    </div>
  );
}
