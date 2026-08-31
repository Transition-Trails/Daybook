/**
 * SpecEditor — three-panel record viewer and editor for a Production Spec.
 * Left: editable identity plus Creative, Canon, and Payload tabs
 * Right: Completion sidebar with dependency health graph and relationships panel
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Lock, ChevronRight, ArrowLeft, CheckCircle2, AlertTriangle,
  Send, Trash2, X, ExternalLink, RefreshCw, Clock, BookOpen,
  FileText, Zap, GitBranch, Circle, Save, Image,
} from "lucide-react";
import {
  BANDS,
  canonClear,
  payloadReady,
  readinessChecks,
  readinessScore,
} from "@workspace/api-zod/readiness";
import { apiFetch } from "@/lib/api";
import {
  bypassNextSpecNavigationGuard,
  confirmSpecNavigation,
  registerSpecNavigationGuard,
} from "@/lib/spec-navigation-guard";
import { useToast } from "@/hooks/use-toast";
import { useEditorial } from "@/contexts/EditorialContext";
import {
  EditorialRichTextField,
  EditorialSection,
  editorialRichTextToPlainText,
} from "@/components/EditorialRichText";

let nextHistoryGuardId = 0;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Spec {
  id: string;
  worldId: string;
  collectionId?: string | null;
  volumeId?: string | null;
  productionItem: string | null;
  specId?: string | null;
  componentType: string | null;
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
  wizardComplete?: boolean;
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
    collection: { id: string; name: string } | null;
    volume: { id: string; name: string; code?: string | null } | null;
    style_guide: { id: string; name: string } | null;
    component_spec: { id: string; name: string; componentType: string } | null;
    canon_records: { id: string; name: string; status: string; canonType: string }[];
    prompt_modules: { id: string; name: string }[];
  };
}

interface LocalSpecPreview {
  status: "success";
  source: "local";
  production_item: string;
  preview_filename?: string;
  preview_object_path: string;
  preview_url: string;
}

interface ProductionPackage {
  id: string;
  status: "in_progress" | "generation_failed" | "upload_failed" | "uploaded_status_pending" | "success";
  production_art_status: "not_started" | "artwork_review";
  filename: string;
  artwork_url?: string;
  visual_asset_id?: string;
  provider: string;
  model: string;
  effective_size: string;
  quality: string;
  error?: string;
}

interface ProductionPackageState {
  package: ProductionPackage | null;
  last_successful: ProductionPackage | null;
}

// ── Radial dependency graph ───────────────────────────────────────────────────

function DependencyGraph({ spec, rels }: { spec: Spec; rels: SpecResponse["relationships"] }) {
  const nodes = [
    { id: "spec", label: (spec.productionItem ?? "Untitled Spec").slice(0, 18), health: "green", cx: 90, cy: 90, r: 22, main: true },
    rels.collection && { id: "collection", label: "Collection", sublabel: rels.collection.name.slice(0, 14), health: "green", cx: 25, cy: 35 },
    rels.volume && { id: "volume", label: "Volume", sublabel: rels.volume.name.slice(0, 14), health: "green", cx: 28, cy: 100 },
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
  onGeneratePreview,
  isGeneratingPreview,
  preview,
  previewDisabled,
  onApprove,
  isApproving,
  approvalDisabled,
  artworkState,
  onGenerateArtwork,
  isGeneratingArtwork,
}: {
  spec: Spec;
  rels: SpecResponse["relationships"];
  onPublish: () => void;
  isPublishing: boolean;
  onGeneratePreview: () => void;
  isGeneratingPreview: boolean;
  preview: LocalSpecPreview | null;
  previewDisabled: boolean;
  onApprove: () => void;
  isApproving: boolean;
  approvalDisabled: boolean;
  artworkState?: ProductionPackageState;
  onGenerateArtwork: (options?: { forceNew?: boolean; packageId?: string }) => void;
  isGeneratingArtwork: boolean;
}) {
  const checks = readinessChecks(spec);
  const done = checks.filter(c => c.done).length;
  const score = readinessScore(checks);
  const missing = checks.filter(c => !c.done);
  const isPayloadReady = payloadReady(checks);
  const isCanonClear = canonClear(checks);

  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = !isCanonClear
    ? "#C87560"
    : isPayloadReady
      ? "#0D9488"
      : score >= BANDS.payloadReady ? "#F59E0B" : "#9CA3AF";
  const readinessLabel = !isCanonClear ? "Canon needed" : isPayloadReady ? "Canon clear" : "In progress";
  const artworkPackage = artworkState?.package ?? null;
  const successfulArtwork = artworkPackage?.status === "success"
    ? artworkPackage
    : artworkState?.last_successful ?? null;
  const artworkApproved = spec.status.trim().toLowerCase() === "approved";
  const boardApproved = artworkApproved;
  const boardCompiled = spec.compiledPromptStatus.trim().toLowerCase() === "compiled";
  const approvalReady = spec.wizardComplete === true
    && boardCompiled
    && isPayloadReady
    && isCanonClear;
  const approvalReason = approvalDisabled
    ? "Save your changes before approving the board."
    : !approvalReady
      ? !spec.wizardComplete
        ? "Complete the Production Spec record before approving the board."
        : !boardCompiled
          ? "Compile the Specification Board before approving it."
          : !isPayloadReady
            ? "Complete the prompt payload and link its prompt modules first."
            : "Resolve the canon dependency before approving the board."
      : null;

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
              {readinessLabel}
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
      <div className="px-4 py-3 border-b border-[var(--admin-row-divider)]">
        <DependencyGraph spec={spec} rels={rels} />
      </div>

      {/* Linked records summary */}
      <div className="border-b border-gray-100 px-4 py-3">
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
        {rels.collection && (
          <div className="flex items-center gap-2 mb-1.5">
            <BookOpen className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 flex-1 truncate">{rels.collection.name}</span>
            <span className="text-[9px] bg-amber-50 text-amber-700 rounded-full px-1.5 py-0.5">Collection</span>
          </div>
        )}
        {rels.volume && (
          <div className="flex items-center gap-2 mb-1.5">
            <BookOpen className="w-3 h-3 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-600 flex-1 truncate">{rels.volume.name}</span>
            <span className="text-[9px] bg-orange-50 text-orange-700 rounded-full px-1.5 py-0.5">Volume</span>
          </div>
        )}
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
        {rels.canon_records.length === 0 && !rels.collection && !rels.volume && !rels.style_guide && rels.prompt_modules.length === 0 && (
          <p className="text-xs text-gray-400">No linked records.</p>
        )}
      </div>

      {/* Local board preview */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Specification Board</p>
        {preview ? (
          <div className="space-y-2">
            <a href={preview.preview_url} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={preview.preview_url}
                alt={`Specification board for ${preview.production_item}`}
                className="w-full rounded-md border border-gray-200 bg-[var(--admin-card-subtle)]"
              />
            </a>
            <a
              href={preview.preview_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-[#1B2A4A] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Open full board
            </a>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-gray-500 mb-3">
            Generate a review board from this local Editorial Suite record. It stays out of Notion until you publish.
          </p>
        )}
        <button
          type="button"
          onClick={onGeneratePreview}
          disabled={previewDisabled || isGeneratingPreview}
          title={previewDisabled ? "Save changes before generating a board." : undefined}
          className="mt-2 w-full flex items-center justify-center gap-2 py-2 text-sm rounded-lg font-medium disabled:opacity-40 transition-colors border border-[#1B2A4A] text-[#1B2A4A] hover:bg-[#F3F6FB]"
        >
          {isGeneratingPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
          {preview ? "Generate new board" : "Generate specification board"}
        </button>
        {previewDisabled && (
          <p className="mt-2 text-[11px] text-amber-700">Save your edits before generating a board.</p>
        )}
      </div>

      {/* Specification Board approval */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Board approval</p>
        {boardApproved ? (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-emerald-800">Specification Board approved</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-emerald-700">
                Final artwork is unlocked. Artwork review remains a separate step.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-gray-500 mb-2">
              Approve the reviewed board from this record to unlock final production artwork.
            </p>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Approve this Specification Board? This will unlock final artwork generation.")) {
                  onApprove();
                }
              }}
              disabled={!approvalReady || approvalDisabled || isApproving}
              title={approvalReason ?? undefined}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm rounded-lg font-medium disabled:opacity-40 bg-[var(--admin-ink)] text-white hover:opacity-90"
            >
              {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Approve Specification Board
            </button>
            {approvalReason && (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-700">{approvalReason}</p>
            )}
          </>
        )}
      </div>

      {/* Final production artwork */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Final Artwork</p>
        {successfulArtwork?.artwork_url && (
          <a href={successfulArtwork.artwork_url} target="_blank" rel="noopener noreferrer" className="block mb-2">
            <img
              src={successfulArtwork.artwork_url}
              alt={`Final production artwork for ${spec.productionItem ?? "this specification"}`}
              className="w-full rounded-md border border-gray-200 bg-[var(--admin-card-subtle)]"
            />
          </a>
        )}
        {artworkPackage ? (
          <div className="mb-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-700">
                {artworkPackage.status === "success" ? "Ready for artwork review" : artworkPackage.status.replaceAll("_", " ")}
              </span>
              <span className="text-[10px] text-gray-400">{artworkPackage.effective_size}</span>
            </div>
            {artworkPackage.error && (
              <p className="mt-1 text-[11px] leading-relaxed text-red-600">{artworkPackage.error}</p>
            )}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-gray-500 mb-3">
            Generate the production image from the approved, compiled specification. This is separate from the review board.
          </p>
        )}
        {!artworkApproved && (
          <p className="mb-2 text-[11px] leading-relaxed text-amber-700">
            Approve the Specification Board before generating final artwork.
          </p>
        )}
        {artworkPackage?.status === "generation_failed" || artworkPackage?.status === "upload_failed" ? (
          <button
            type="button"
            onClick={() => onGenerateArtwork({ packageId: artworkPackage.id })}
            disabled={!artworkApproved || previewDisabled || isGeneratingArtwork}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm rounded-lg font-medium disabled:opacity-40 border border-[var(--admin-ink)] text-[var(--admin-ink)] hover:bg-[var(--admin-card-subtle)]"
          >
            {isGeneratingArtwork ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Retry final artwork
          </button>
        ) : artworkPackage?.status === "success" ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Generate a new final artwork? The current successful artwork will be preserved.")) {
                onGenerateArtwork({ forceNew: true });
              }
            }}
            disabled={!artworkApproved || previewDisabled || isGeneratingArtwork}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm rounded-lg font-medium disabled:opacity-40 border border-[var(--admin-ink)] text-[var(--admin-ink)] hover:bg-[var(--admin-card-subtle)]"
          >
            {isGeneratingArtwork ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Generate new artwork
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onGenerateArtwork()}
            disabled={!artworkApproved || previewDisabled || isGeneratingArtwork || artworkPackage?.status === "in_progress"}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm rounded-lg font-medium disabled:opacity-40 bg-[var(--admin-ink)] text-white hover:opacity-90"
          >
            {isGeneratingArtwork ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
            Generate final artwork
          </button>
        )}
      </div>

      {/* Notion publish */}
      <div className="px-4 py-3">
        <button
          onClick={onPublish}
          disabled={isPublishing || !isPayloadReady}
          aria-describedby={!isPayloadReady ? "publish-requirements" : undefined}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm rounded-lg font-medium disabled:opacity-40 transition-colors"
          style={{ background: "#1B2A4A", color: "white" }}
        >
          {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          {spec.notionPageId ? "Re-publish to Notion" : "Publish to Notion"}
        </button>
        {!isPayloadReady && (
          <p id="publish-requirements" className="mt-2 text-[11px] leading-relaxed text-amber-700">
            Publishing is unavailable until the prompt payload is complete and at least one prompt module is linked.
          </p>
        )}
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

type OnSpecFieldFocus = (field: keyof Spec, label: string) => void;

function IdentityTab({ spec, onChange, onFocus, readOnly = false }: { spec: Spec; onChange: (patch: Partial<Spec>) => void; onFocus?: OnSpecFieldFocus; readOnly?: boolean }) {
  const [openSection, setOpenSection] = useState<string | null>("naming");

  const { data: setsData } = useQuery({
    queryKey: ["editorial-component-sets", spec.worldId],
    queryFn: () => apiFetch<{ component_sets: string[] }>(`/v1/editorial/component-sets?world_id=${spec.worldId}`),
    staleTime: 60_000,
  });
  const existingSets = setsData?.component_sets ?? [];
  const sectionProps = { contentReadOnly: readOnly };

  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

  return (
    <div className="space-y-3">
      <EditorialSection {...sectionProps}
        title="Naming & Identity"
        hint="Production item name, spec ID, and version."
        open={openSection === "naming"}
        onToggle={() => toggle("naming")}
        preview={spec.productionItem || undefined}
      >
        <div className="space-y-4">
          <Field label="Production Item Name">
            <input value={spec.productionItem ?? ""} onChange={e => onChange({ productionItem: e.target.value })} onFocus={() => onFocus?.("productionItem", "Production Item Name")} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Spec ID" hint="Auto-generated on creation — override here if needed.">
              <input value={spec.specId ?? ""} onChange={e => onChange({ specId: e.target.value })} onFocus={() => onFocus?.("specId", "Spec ID")} className={inputCls} placeholder="e.g. WYC-HRP-001" />
            </Field>
            <Field label="Current Version">
              <input value={spec.currentVersion} onChange={e => onChange({ currentVersion: e.target.value })} className={inputCls} />
            </Field>
          </div>
        </div>
      </EditorialSection>

      <EditorialSection {...sectionProps}
        title="Component & Format"
        hint="Type, set membership, orientation, and print style."
        open={openSection === "component"}
        onToggle={() => toggle("component")}
        preview={[spec.componentType, spec.componentSet].filter(Boolean).join(" · ") || undefined}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Component Type">
              <select value={spec.componentType ?? ""} onChange={e => onChange({ componentType: e.target.value })} className={selectCls}>
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
            <Field label="Component Set" hint="Pick an existing set or type a new name.">
              <input
                value={spec.componentSet ?? ""}
                onChange={e => onChange({ componentSet: e.target.value })}
                className={inputCls}
                placeholder="e.g. The Herbalist's Collection"
                list="editor-component-set-list"
                autoComplete="off"
              />
              {existingSets.length > 0 && (
                <datalist id="editor-component-set-list">
                  {existingSets.map(s => <option key={s} value={s} />)}
                </datalist>
              )}
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
      </EditorialSection>
    </div>
  );
}

function CreativeTab({ spec, onChange, onFocus, readOnly = false }: { spec: Spec; onChange: (patch: Partial<Spec>) => void; onFocus?: OnSpecFieldFocus; readOnly?: boolean }) {
  const [openSection, setOpenSection] = useState<string | null>("design");
  const sectionProps = { contentReadOnly: readOnly };
  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

  return (
    <div className="space-y-3">
      <EditorialSection {...sectionProps}
        title="Design Intent"
        hint="The visual experience this component should create."
        open={openSection === "design"}
        onToggle={() => toggle("design")}
        preview={editorialRichTextToPlainText(spec.designIntent).slice(0, 120) || undefined}
      >
        <EditorialRichTextField
          value={spec.designIntent}
          placeholder="Describe the visual experience this component should create…"
          onFocus={() => onFocus?.("designIntent", "Design Intent")}
          onChange={val => onChange({ designIntent: val })}
          minHeight={160}
        />
      </EditorialSection>

      <EditorialSection {...sectionProps}
        title="Narrative Purpose"
        hint="How this connects to the world's story."
        open={openSection === "narrative"}
        onToggle={() => toggle("narrative")}
        preview={editorialRichTextToPlainText(spec.narrativePurpose).slice(0, 120) || undefined}
      >
        <EditorialRichTextField
          value={spec.narrativePurpose}
          placeholder="How does this component connect to the world's story…"
          onFocus={() => onFocus?.("narrativePurpose", "Narrative Purpose")}
          onChange={val => onChange({ narrativePurpose: val })}
          minHeight={160}
        />
      </EditorialSection>

      <EditorialSection {...sectionProps}
        title="Required Content"
        hint="Specific visual elements, motifs, or text areas that must appear."
        open={openSection === "required"}
        onToggle={() => toggle("required")}
        preview={editorialRichTextToPlainText(spec.requiredContent).slice(0, 120) || undefined}
      >
        <EditorialRichTextField
          value={spec.requiredContent}
          placeholder="List specific visual elements, motifs, or text areas that must appear…"
          onFocus={() => onFocus?.("requiredContent", "Required Content")}
          onChange={val => onChange({ requiredContent: val })}
          minHeight={160}
        />
      </EditorialSection>

      <EditorialSection {...sectionProps}
        title="Review Criteria"
        hint="How you'll evaluate generated images against this spec."
        open={openSection === "review"}
        onToggle={() => toggle("review")}
        preview={editorialRichTextToPlainText(spec.reviewCriteria).slice(0, 120) || undefined}
      >
        <EditorialRichTextField
          value={spec.reviewCriteria}
          placeholder="Describe how you'll evaluate generated images against this spec…"
          onFocus={() => onFocus?.("reviewCriteria", "Review Criteria")}
          onChange={val => onChange({ reviewCriteria: val })}
          minHeight={160}
        />
      </EditorialSection>
    </div>
  );
}

function CanonTab({
  spec,
  onChange,
  onFocus,
  readOnly = false,
}: {
  spec: Spec;
  onChange: (patch: Partial<Spec>) => void;
  onFocus?: OnSpecFieldFocus;
  readOnly?: boolean;
}) {
  const [openSection, setOpenSection] = useState<string | null>("links");
  const [, navigate] = useLocation();
  const sectionProps = { contentReadOnly: readOnly };
  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

  const { data: sgData } = useQuery({
    queryKey: ["editorial-style-guides", spec.worldId],
    queryFn: () => apiFetch<{ style_guides: { id: string; name: string }[] }>(`/v1/editorial/style-guides?world_id=${spec.worldId}`),
  });
  const { data: collectionData } = useQuery({
    queryKey: ["editorial-collections", spec.worldId],
    queryFn: () => apiFetch<{ collections: { id: string; name: string }[] }>(`/v1/editorial/collections?world_id=${spec.worldId}`),
  });
  const { data: volumeData } = useQuery({
    queryKey: ["editorial-volumes", spec.worldId],
    queryFn: () => apiFetch<{ volumes: { id: string; name: string; code?: string | null; collectionId?: string | null }[] }>(`/v1/editorial/volumes?world_id=${spec.worldId}`),
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
    <div className="space-y-3">
      <EditorialSection {...sectionProps}
        title="Governance & Links"
        hint="Collection, volume, canon dependency, style guide, and component spec."
        open={openSection === "links"}
        onToggle={() => toggle("links")}
        preview={spec.canonDependency !== "None" ? spec.canonDependency : undefined}
      >
        <div className="space-y-4">
          <Field
            label="Collection or Volume"
            hint="Link this Production Spec to the collection or volume where it belongs."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                aria-label="Collection"
                value={spec.collectionId ?? ""}
                onChange={event => onChange({ collectionId: event.target.value || null, volumeId: null })}
                className={selectCls}
              >
                <option value="">No collection</option>
                {(collectionData?.collections ?? []).map(collection => (
                  <option key={collection.id} value={collection.id}>{collection.name}</option>
                ))}
              </select>
              <select
                aria-label="Volume"
                value={spec.volumeId ?? ""}
                onChange={event => onChange({ volumeId: event.target.value || null })}
                className={selectCls}
              >
                <option value="">No volume</option>
                {(volumeData?.volumes ?? [])
                  .filter(volume => !spec.collectionId || !volume.collectionId || volume.collectionId === spec.collectionId)
                  .map(volume => (
                    <option key={volume.id} value={volume.id}>
                      {volume.code ? `${volume.code} · ` : ""}{volume.name}
                    </option>
                  ))}
              </select>
            </div>
            {(collectionData?.collections ?? []).length === 0 && (volumeData?.volumes ?? []).length === 0 && (
              <p className="mt-1.5 text-xs text-amber-700">
                This world has no collection or volume records yet. Create them in the Editorial Suite world context first.
              </p>
            )}
          </Field>
          <Field label="Canon Dependency">
            {/* Immutable after creation — not in the PATCH mutable-fields contract */}
            <div className="flex items-center gap-2">
              <select
                value={spec.canonDependency}
                onChange={() => {/* locked — not mutable post-creation */}}
                disabled
                className={`${selectCls} disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-50`}
                title="Canon dependency is locked after creation"
              >
                <option value="None">None</option>
                <option value="Supports Canon">Supports Canon</option>
                <option value="Canon Reference">Canon Reference</option>
                <option value="Canon Defining">Canon Defining</option>
              </select>
              <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="Locked after creation" />
            </div>
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
            <button
              type="button"
              onClick={() => navigate("/super/worldsmith/editorial/component-specs")}
              className="mt-1.5 text-xs font-medium text-[#1B2A4A] hover:underline"
            >
              Create or manage component specs →
            </button>
          </Field>
        </div>
      </EditorialSection>

      <EditorialSection {...sectionProps}
        title="Canon Records"
        hint="Select the canon records this spec references."
        open={openSection === "canon"}
        onToggle={() => toggle("canon")}
        preview={canonIds.length > 0 ? `${canonIds.length} record${canonIds.length === 1 ? "" : "s"} linked` : undefined}
      >
        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
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
      </EditorialSection>
    </div>
  );
}

function PayloadTab({
  spec,
  onChange,
  onFocus,
  readOnly = false,
}: {
  spec: Spec;
  onChange: (patch: Partial<Spec>) => void;
  onFocus?: OnSpecFieldFocus;
  readOnly?: boolean;
}) {
  const [openSection, setOpenSection] = useState<string | null>("payload");
  const sectionProps = { contentReadOnly: readOnly };
  const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

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
    <div className="space-y-3">
      <EditorialSection {...sectionProps}
        title="Prompt Payload"
        hint="Structured plain-text payload sent to the AI compiler."
        open={openSection === "payload"}
        onToggle={() => toggle("payload")}
        preview={spec.promptPayload ? `${spec.promptPayload.trim().slice(0, 80)}…` : undefined}
      >
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
              onFocus={() => onFocus?.("promptPayload", "Prompt Payload")}
              className={textareaCls}
              rows={16}
              style={{ fontFamily: "ui-monospace, 'Fira Mono', monospace", fontSize: 12 }}
            />
          </Field>
        </div>
      </EditorialSection>

      {(pmData?.prompt_modules ?? []).length > 0 && (
        <EditorialSection {...sectionProps}
          title="Prompt Modules"
          hint="Reusable modules injected into the compiled prompt."
          open={openSection === "modules"}
          onToggle={() => toggle("modules")}
          preview={moduleIds.length > 0 ? `${moduleIds.length} module${moduleIds.length === 1 ? "" : "s"} active` : undefined}
        >
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
        </EditorialSection>
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
  const historyGuard = useRef<{ id: string; active: boolean; skipNextPop: boolean } | null>(null);
  if (!historyGuard.current) {
    historyGuard.current = {
      id: `spec-editor-${++nextHistoryGuardId}`,
      active: false,
      skipNextPop: false,
    };
  }

  const { data, isLoading, error } = useQuery<SpecResponse>({
    queryKey: ["editorial-spec", specId],
    queryFn: () => apiFetch<SpecResponse>(`/v1/editorial/specs/${specId}`),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (data?.spec) setLocalSpec(data.spec);
  }, [data?.spec]);

  // Identity correction fields, payload, canon links, and prompt modules are
  // editable. Creative-direction fields remain locked after creation.
  const onChange = (patch: Partial<Spec>) =>
    setLocalSpec(prev => prev ? { ...prev, ...patch } : null);

  // Detect unsaved changes in the mutable fields only
  const hasUnsavedChanges = Boolean(
    data?.spec && localSpec && (
      localSpec.promptPayload !== data.spec.promptPayload ||
      localSpec.payloadVersion !== data.spec.payloadVersion ||
      localSpec.productionItem !== data.spec.productionItem ||
      localSpec.specId !== data.spec.specId ||
      localSpec.componentType !== data.spec.componentType ||
      localSpec.componentSet !== data.spec.componentSet ||
      localSpec.currentVersion !== data.spec.currentVersion ||
      localSpec.writingSpacePercent !== data.spec.writingSpacePercent ||
      localSpec.orientation !== data.spec.orientation ||
      localSpec.frontBackStyle !== data.spec.frontBackStyle ||
      localSpec.collectionId !== data.spec.collectionId ||
      localSpec.volumeId !== data.spec.volumeId ||
      JSON.stringify(localSpec.canonRecordIds) !== JSON.stringify(data.spec.canonRecordIds) ||
      JSON.stringify(localSpec.promptModuleIds) !== JSON.stringify(data.spec.promptModuleIds) ||
      localSpec.styleGuideId !== data.spec.styleGuideId ||
      localSpec.componentSpecId !== data.spec.componentSpecId
    ),
  );

  useEffect(() => {
    const unregister = registerSpecNavigationGuard(() => {
      if (!hasUnsavedChanges) return true;
      return window.confirm("This spec has unsaved changes. Leave without saving?");
    });

    return unregister;
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    // Browser Back/Forward does not call Wouter's aroundNav hook. Add a
    // same-URL history entry, so the first Back stays in this mounted editor
    // while we ask for confirmation. The next traversal either restores this
    // entry (cancel) or continues to the actual previous route (confirm).
    const guard = historyGuard.current!;
    const state = {
      ...(window.history.state ?? {}),
      specEditorNavigationGuard: guard.id,
    };
    window.history.pushState(state, "", window.location.href);
    guard.active = true;

    const handlePopState = () => {
      if (guard.skipNextPop) {
        guard.skipNextPop = false;
        return;
      }

      if (window.confirm("This spec has unsaved changes. Leave without saving?")) {
        guard.skipNextPop = true;
        window.history.back();
      } else {
        guard.skipNextPop = true;
        window.history.forward();
      }
    };

    window.addEventListener("popstate", handlePopState, true);
    return () => {
      window.removeEventListener("popstate", handlePopState, true);

      // When the edits become clean, remove the same-URL guard entry so a
      // subsequent Back press still leaves the editor in one step.
      if (
        guard.active &&
        window.history.state?.specEditorNavigationGuard === guard.id
      ) {
        guard.active = false;
        window.history.back();
      }
    };
  }, [hasUnsavedChanges]);

  const saveMutation = useMutation({
    mutationFn: (s: Spec) =>
      apiFetch(`/v1/editorial/specs/${specId}`, {
        method: "PATCH",
        body: JSON.stringify({
          production_item:  s.productionItem,
          spec_id:           s.specId,
          component_type:    s.componentType,
          component_set:     s.componentSet,
          current_version:   s.currentVersion,
          writing_space_percent: s.writingSpacePercent,
          orientation:       s.orientation,
          front_back_style:  s.frontBackStyle,
          prompt_payload:    s.promptPayload,
          payload_version:   s.payloadVersion,
          collection_id:     s.collectionId,
          volume_id:         s.volumeId,
          canon_record_ids:  s.canonRecordIds,
          prompt_module_ids: s.promptModuleIds,
          style_guide_id:    s.styleGuideId,
          component_spec_id: s.componentSpecId,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["editorial-spec", specId] });
      toast({ title: "Spec saved" });
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

  const approveMutation = useMutation<{ spec: Spec; already_approved?: boolean }>({
    mutationFn: () => apiFetch(`/v1/editorial/specs/${specId}/approve`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
    onSuccess: ({ spec: approvedSpec }) => {
      setLocalSpec(approvedSpec);
      qc.setQueryData<SpecResponse>(["editorial-spec", specId], previous => (
        previous ? { ...previous, spec: approvedSpec } : previous
      ));
      qc.invalidateQueries({ queryKey: ["editorial/specs/list"] });
      toast({ title: "Specification Board approved", description: "Final artwork is now unlocked." });
    },
    onError: (err: Error) => toast({
      title: "Approval failed",
      description: err.message,
      variant: "destructive",
    }),
  });

  const existingPreviewQuery = useQuery<{ preview: LocalSpecPreview | null }>({
    queryKey: ["editorial-spec-preview", specId],
    queryFn: () => apiFetch(`/v1/worldsmith/spec-preview/local/${encodeURIComponent(specId)}`),
    staleTime: 30_000,
  });

  const previewMutation = useMutation({
    mutationFn: async (): Promise<LocalSpecPreview> => {
      const compilation = await apiFetch<{ status: string; prompt_hash?: string }>("/v1/prompt-compilations", {
        method: "POST",
        body: JSON.stringify({
          production_spec_id: specId,
          operation: "validate_and_compile",
          dry_run: false,
        }),
      });
      if (compilation.status !== "compiled" || !compilation.prompt_hash) {
        throw new Error("This Production Spec needs a successful local compilation before its board can be generated.");
      }
      return apiFetch<LocalSpecPreview>("/v1/worldsmith/spec-preview", {
        method: "POST",
        body: JSON.stringify({
          production_spec_id: specId,
          prompt_hash: compilation.prompt_hash,
          force_new: true,
        }),
      });
    },
    onSuccess: (preview) => {
      // Compilation is persisted by the server before preview generation
      // succeeds. Mirror that transition immediately so the approval gate does
      // not wait on the background record refetch.
      setLocalSpec(previous => previous ? {
        ...previous,
        compiledPromptStatus: "Compiled",
        status: previous.status.trim().toLowerCase() === "approved" ? previous.status : "compiled",
      } : previous);
      qc.invalidateQueries({ queryKey: ["editorial-spec", specId] });
      qc.setQueryData(["editorial-spec-preview", specId], { preview });
      toast({ title: "Specification board ready", description: preview.preview_filename ?? "Open the board from the sidebar." });
    },
    onError: (err: Error) => {
      toast({ title: "Board generation failed", description: err.message, variant: "destructive" });
    },
  });

  const artworkQuery = useQuery<ProductionPackageState>({
    queryKey: ["editorial-production-package", specId],
    queryFn: () => apiFetch(`/v1/production-packages?production_spec_id=${encodeURIComponent(specId)}`),
    staleTime: 15_000,
  });

  const artworkMutation = useMutation({
    mutationFn: (options?: { forceNew?: boolean; packageId?: string }) =>
      apiFetch<{ production_package?: ProductionPackage }>("/v1/production-packages", {
        method: "POST",
        body: JSON.stringify({
          production_spec_id: specId,
          force_new: options?.forceNew === true,
          production_package_id: options?.packageId,
        }),
      }),
    onSuccess: (response) => {
      qc.invalidateQueries({ queryKey: ["editorial-production-package", specId] });
      const result = response.production_package;
      if (result?.status === "success") {
        toast({ title: "Final artwork ready", description: "The image is ready for a separate artwork review." });
      } else if (result?.status === "in_progress") {
        toast({ title: "Final artwork is already generating" });
      } else {
        toast({
          title: "Final artwork was not completed",
          description: result?.error ?? "The request can be retried from the sidebar.",
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => toast({
      title: "Final artwork request failed",
      description: err.message,
      variant: "destructive",
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/editorial/specs/${specId}`, { method: "DELETE" }),
    onSuccess: () => {
      // Deletion has already discarded the dirty local state, so do not offer
      // a second route-leave prompt after the destructive request succeeds.
      bypassNextSpecNavigationGuard();
      toast({ title: "Spec deleted" });
      navigate("/super/worldsmith/editorial/board");
    },
    onError: (err: Error) => toast({
      title: "Delete failed",
      description: err.message,
      variant: "destructive",
    }),
  });

  const handleDelete = () => {
    if (!confirmSpecNavigation()) return;
    deleteMutation.mutate();
  };

  const spec = localSpec ?? data?.spec;
  const rels = data?.relationships ?? {
    collection: null,
    volume: null,
    style_guide: null,
    component_spec: null,
    canon_records: [],
    prompt_modules: [],
  };

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
              {spec.productionItem || "Untitled Spec"}
            </h1>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {spec.specId && <span>{spec.specId}</span>}
              <span>·</span>
              <span>{spec.componentType || "Component type not set"}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasUnsavedChanges && (
            <>
              <button
                onClick={() => data?.spec && setLocalSpec(data.spec)}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
                title="Discard unsaved changes"
              >
                <X className="w-3.5 h-3.5" />
                Discard
              </button>
              <button
                onClick={() => localSpec && saveMutation.mutate(localSpec)}
                disabled={saveMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-[#1B2A4A] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#0f1d36] transition-colors disabled:opacity-40"
              >
                {saveMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
            </>
          )}
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
            aria-label="Delete production spec"
            title="Delete spec"
          >
            {deleteMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Trash2 className="w-4 h-4" />}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-subtle)] px-3 py-1.5 text-xs font-semibold text-[#786D60]">
            <Lock className="h-3.5 w-3.5" /> Creative direction locked
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden relative">
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

          {/* Tab content — fills available width, no maxWidth cap */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-3 text-xs leading-relaxed text-[#786D60]">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#C87560]" />
              <span>
                Production item identity and print metadata can be corrected after creation.{" "}
                Creative direction stays locked; payload, canon links, and prompt modules can also be updated.
              </span>
            </div>
            {activeTab === "identity" && <IdentityTab spec={spec} onChange={onChange} />}
            {activeTab === "creative" && <CreativeTab spec={spec} onChange={onChange} readOnly />}
            {/* Canon and Payload tabs have mutable linkage fields — not readOnly */}
            {activeTab === "canon"   && <CanonTab   spec={spec} onChange={onChange} />}
            {activeTab === "payload" && <PayloadTab spec={spec} onChange={onChange} />}
          </div>
        </div>

        {/* Sidebar */}
        <CompletionSidebar
          spec={spec}
          rels={rels}
          onPublish={() => publishMutation.mutate()}
          isPublishing={publishMutation.isPending}
          onGeneratePreview={() => previewMutation.mutate()}
          isGeneratingPreview={previewMutation.isPending}
          preview={previewMutation.data ?? existingPreviewQuery.data?.preview ?? null}
          previewDisabled={hasUnsavedChanges}
          onApprove={() => approveMutation.mutate()}
          isApproving={approveMutation.isPending}
          approvalDisabled={hasUnsavedChanges}
          artworkState={artworkQuery.data}
          onGenerateArtwork={(options) => artworkMutation.mutate(options)}
          isGeneratingArtwork={artworkMutation.isPending}
        />
      </div>
    </div>
  );
}
