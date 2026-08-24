/**
 * WorldSmith Prompt Compiler v1.1
 * ─ Input: URL / dashed ID / 32-char hex, normalized client-side before submit
 * ─ Flow:  Input → Resolve → Preflight summary card → Compile / Dry Run
 * ─ Post:  Success screen with all key fields called out
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Copy, RefreshCw, FileText, Clock,
  Hash, RotateCcw, Search, ArrowRight, BookOpen,
  ImagePlus, ExternalLink, ImageOff, ArrowLeft, Layers, GitBranch,
  Download, Link2, ShieldCheck, Cpu, Info, Zap, ArrowUpRight,
  CircleDot, TrendingUp, DollarSign, CheckSquare,
  Wand2, ListChecks, ShieldAlert, Package, ChevronRight, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { normalizeNotionId } from "@/lib/worldsmith/notion-id";
import { isRecommendationCode } from "@/lib/worldsmith/recommendations";
import { worldsmithStorage } from "@/lib/worldsmith/storage";
import { resolveCostEstimate, type ExplicitCostProvenance } from "@/lib/worldsmith/cost-estimate";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationError {
  code: string;
  field: string;
  governing_rule: string;
  message: string;
  recommended_action: string;
}

interface PreflightResponse {
  spec_id: string;
  production_specification: string;
  component_type: string;
  component_specification: string | null;
  payload_version: string;
  canon_dependency: string;
  compiled_prompt_status: string;
  generation_readiness: string;
  version: string;
  prompt_module_count: number;
  canon_record_count: number;
  world: string;
  collection?: string;
  volume?: string;
  status: string;
  /** true when payload_version is PP-2.0 and Prompt Payload is blank in Notion */
  prompt_payload_blank?: boolean;
}

// ── Payload Generator types ───────────────────────────────────────────────────

interface PP2Sections {
  shared_prompt: string;
  front_prompt: string;
  back_prompt?: string;
  assembly_prompt?: string;
  negative_prompt: string;
}

interface GeneratePayloadResponse {
  spec_id: string;
  production_item: string;
  component_type: string;
  sections: PP2Sections;
  serialized: string;
  pre_save_issues: ValidationError[];
  generator_warnings: ValidationError[];
  warnings: ValidationError[];
  requires_confirmation?: boolean;
  code?: string;
}

interface SavePayloadResponse {
  success: boolean;
  spec_id: string;
  persistence_verified: boolean;
  mismatch?: string | null;
  recompile?: unknown;
  // Returned on 422 PAYLOAD_VALIDATION_FAILED
  code?: string;
  error?: string;
  validation_issues?: ValidationError[];
}

interface WorldRecord {
  id: string;
  name: string;
  status: string;
  notionProductionDbId?: string | null;
}

interface BatchAuditRecord {
  specId: string;
  productionItem: string;
  componentType: string;
}

interface BatchAuditResponse {
  world_id: string;
  world_name: string;
  total_reviewed: number;
  truncated: boolean;
  ready: Array<BatchAuditRecord & { missingFields: string[] }>;
  warning: Array<BatchAuditRecord & { warnings: string[] }>;
  blocked: Array<BatchAuditRecord & { errors: string[] }>;
}

interface CompiledSectionRecord {
  key: string;
  label: string;
  content: string;
  source: string;
}

interface ProvenanceRecord {
  production_spec_title: string;
  component_type: string;
  component_set?: string;
  world: string;
  world_notion_id?: string;
  collection?: string;
  collection_notion_id?: string;
  volume?: string;
  volume_notion_id?: string;
  style_guide?: string;
  component_specification?: string;
  prompt_modules: string[];
  canon_records: string[];
  run_id: string;
  compilation_timestamp: string;
  production_spec_notion_id: string;
  style_guide_notion_id?: string;
  component_spec_notion_id?: string;
  prompt_payload_notion_id?: string;
  prompt_module_notion_ids: string[];
  canon_record_notion_ids: string[];
  prompt_payload_type: "linked" | "inline";
  prompt_hash: string;
  payload_version: string;
  payload_format: "legacy" | "2.0";
  compiler_version: string;
}

interface CompileResponse {
  status: "compiled" | "validation_failed" | "requires_canon_review" | "failed";
  run_id: string;
  production_spec_id: string;
  payload_version: string;
  compiled_prompt_status: string;
  prompt_hash?: string;
  compiled_prompt?: string;
  compiled_sections?: CompiledSectionRecord[];
  provenance?: ProvenanceRecord;
  visual_asset_id?: string;
  warnings: ValidationError[];
  next_action?: string;
  errors?: ValidationError[];
  failed_stage?: string;
  error_code?: string;
  message?: string;
  retry_safe?: boolean;
  // v1.1 success fields
  production_specification?: string;
  component_type?: string;
  prompt_modules_loaded?: number;
}

interface NotionRetryEvent {
  attempt: number;
  path: string;
  reason: "rate_limited" | "network_error";
  delay_ms: number;
  at: string;
}

interface RunRecord {
  run_id: string;
  status: string;
  production_spec_id: string;
  payload_version?: string;
  compiled_prompt_status?: string;
  prompt_hash?: string;
  compiled_prompt?: string | null;
  /** Structured per-section records stored at compile time — used to display the World Bible summary. */
  compiled_sections?: CompiledSectionRecord[];
  asset_id?: string;
  errors?: ValidationError[];
  warnings?: ValidationError[];
  failed_stage?: string;
  error_code?: string;
  initiated_by?: string;
  started_at: string;
  completed_at?: string;
  retry_count: number;
  notion_retries?: NotionRetryEvent[];
  /** Resolved Notion IDs keyed by role. Also carries `collection_name` (human-readable, captured at compile time). */
  resolved_source_ids?: Record<string, string | string[]>;
}

interface SpecPreviewResult {
  status: "success" | "dry_run" | "upload_success_status_failed" | "failed";
  production_item: string;
  spec_page_id: string;
  notion_page_id: string;
  notion_page_url: string;
  preview_filename?: string;
  provider?: string;
  model?: string;
  prompt_hash: string;
  previous_status?: string;
  new_status?: string;
  upload_status?: "success" | "failed" | "skipped";
  notion_upload_id?: string;
  dry_run_payload?: Record<string, string>;
  proposed_status_change?: { from: string; to: string };
  error?: string;
  /** true when DALL-E was skipped or failed — spec board has a placeholder image */
  dalle_skipped?: boolean;
  /** DALL-E error message when dalle_skipped is true and a call was attempted */
  dalle_error?: string;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const worldsmithApi = {
  preflight: (specId: string) =>
    apiFetch<PreflightResponse>(`/v1/worldsmith/preflight?spec_id=${encodeURIComponent(specId)}`),

  compile: async (specId: string, dryRun: boolean): Promise<CompileResponse> => {
    const res = await fetch("/api/v1/prompt-compilations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notion_production_spec_id: specId,
        operation: "validate_and_compile",
        dry_run: dryRun,
      }),
    });
    // 200, 422 (validation_failed / requires_canon_review), 503 all carry
    // a structured CompileResponse body — return it so the UI can render
    // errors. Only hard-fail on unexpected non-JSON or 4xx without a body.
    const body = await res.json().catch(() => null);
    if (body === null) throw new Error(`HTTP ${res.status}`);
    if (!res.ok && body.status === undefined) {
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    return body as CompileResponse;
  },

  listRuns: (specId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (specId) params.set("spec_id", specId);
    if (status && status !== "all") params.set("status", status);
    const qs = params.toString();
    return apiFetch<{ runs: RunRecord[] }>(`/v1/worldsmith/runs${qs ? `?${qs}` : ""}`);
  },

  getRun: (runId: string) =>
    apiFetch<RunRecord>(`/v1/runs/${runId}`),

  listAssets: () =>
    apiFetch<{ assets: Array<{ id: string; asset_name: string; component_type: string; world: string; current_version: string; readiness_state: string; updated_at: string }> }>("/v1/worldsmith/assets"),

  generatePreview: (specId: string, promptHash: string, forceNew = false, dryRun = false) =>
    apiFetch<SpecPreviewResult>("/v1/worldsmith/spec-preview", {
      method: "POST",
      body: JSON.stringify({
        spec_page_id: specId,
        prompt_hash: promptHash,
        force_new: forceNew,
        dry_run: dryRun,
      }),
    }),

  retryStatusUpdate: (specId: string, promptHash: string) =>
    apiFetch<SpecPreviewResult>("/v1/worldsmith/spec-preview/retry-status", {
      method: "POST",
      body: JSON.stringify({
        spec_page_id: specId,
        prompt_hash: promptHash,
      }),
    }),

  refreshCollectionName: (runId: string) =>
    apiFetch<{ collection_name: string; run_id: string }>(
      `/v1/worldsmith/runs/${runId}/refresh-collection-name`,
      { method: "POST" },
    ),

  generatePayload: (specId: string, confirmWarnings = false) =>
    apiFetch<GeneratePayloadResponse>("/v1/worldsmith/generate-payload", {
      method: "POST",
      body: JSON.stringify({ spec_id: specId, confirm_warnings: confirmWarnings }),
    }),

  savePayload: async (specId: string, serializedPayload: string, skipRecompile = false): Promise<SavePayloadResponse> => {
    const res = await fetch("/api/v1/worldsmith/save-payload", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec_id: specId, serialized_payload: serializedPayload, skip_recompile: skipRecompile }),
    });
    const body = await res.json().catch(() => ({})) as SavePayloadResponse;
    // 200 = success; 422 PAYLOAD_VALIDATION_FAILED = structured issues returned as-is for UI
    if (res.status === 422 && body.code === "PAYLOAD_VALIDATION_FAILED") return body;
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  },

  listWorlds: () =>
    apiFetch<{ worlds: WorldRecord[] }>("/v1/worldsmith/worlds"),

  batchAudit: (worldId: string, limit = 60) =>
    apiFetch<BatchAuditResponse>("/v1/worldsmith/batch-generate-payloads", {
      method: "POST",
      body: JSON.stringify({ world_id: worldId, limit }),
    }),

  batchSavePayload: async (specId: string, serializedPayload: string): Promise<SavePayloadResponse> => {
    const res = await fetch("/api/v1/worldsmith/batch-save-payload", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec_id: specId, serialized_payload: serializedPayload, skip_recompile: true }),
    });
    const body = await res.json().catch(() => ({})) as SavePayloadResponse;
    if (res.status === 422 && body.code === "PAYLOAD_VALIDATION_FAILED") return body;
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorldSmithCompiler() {
  const { toast } = useToast();
  const [rawInput, setRawInput] = useState("");
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"compiler" | "runs" | "assets" | "batch">("compiler");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Spec Preview state ────────────────────────────────────────────────────
  const [previewResult, setPreviewResult] = useState<SpecPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [autoPreview, setAutoPreview] = useState<boolean>(() => {
    return worldsmithStorage.compilerAutoPreview() !== "false";
  });
  // Track whether the most recent compile was a dry run so auto-preview never
  // fires for dry-run compiles (they should not trigger real Notion writes).
  const [lastCompileWasDryRun, setLastCompileWasDryRun] = useState(false);

  const normalizedId = normalizeNotionId(rawInput);
  const inputIsValid = !!normalizedId;

  // ── Preflight mutation ──────────────────────────────────────────────────────
  const preflightMutation = useMutation({
    mutationFn: (id: string) => worldsmithApi.preflight(id),
    onSuccess: (data) => {
      setResolvedId(data.spec_id);
      setPreflight(data);
      setResult(null);
    },
    onError: (err: Error) => {
      setPreflight(null);
      setResolvedId(null);
      toast({ title: "Could not resolve spec", description: err.message, variant: "destructive" });
    },
  });

  // ── Compile mutation ────────────────────────────────────────────────────────
  const compile = useMutation({
    mutationFn: ({ id, dry }: { id: string; dry: boolean }) => worldsmithApi.compile(id, dry),
    onSuccess: (res, vars) => {
      // Record whether this compile was a dry run so auto-preview can gate on it
      setLastCompileWasDryRun(vars.dry);
      setResult(res);
      setPreviewResult(null);
      setPreviewError(null);
      if (res.status === "compiled") {
        toast({ title: vars.dry ? "Dry run complete" : "Compiled successfully", description: `Hash: ${res.prompt_hash?.slice(0, 12)}…` });
      } else {
        toast({ title: "Compilation blocked", description: res.errors?.[0]?.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Retry status-only mutation ──────────────────────────────────────────────
  // Re-attempts only the Notion status write — no DALL-E call, no upload cost.
  const retryStatusMutation = useMutation({
    mutationFn: ({ specId, hash }: { specId: string; hash: string }) =>
      worldsmithApi.retryStatusUpdate(specId, hash),
    onSuccess: (res) => {
      setPreviewResult(res);
      toast({ title: "Status updated", description: "Notion status set to Ready for Review." });
    },
    onError: (err: Error) => {
      toast({ title: "Status retry failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Spec preview mutation ───────────────────────────────────────────────────
  // Handles both real previews and preview dry-runs so all results go through
  // React Query state (no fire-and-forget calls that bypass component state).
  const previewMutation = useMutation({
    mutationFn: ({ specId, hash, forceNew, isDryRun }: {
      specId: string;
      hash: string;
      forceNew?: boolean;
      isDryRun?: boolean;
    }) => worldsmithApi.generatePreview(specId, hash, forceNew ?? false, isDryRun ?? false),
    onSuccess: (res) => {
      setPreviewResult(res);
      setPreviewError(null);
      if (res.status === "dry_run") {
        toast({ title: "Preview dry run complete", description: "Text payload assembled — no Notion writes made." });
      } else {
        toast({ title: "Specification board generated", description: res.preview_filename ?? "Preview ready" });
      }
    },
    onError: (err: Error) => {
      setPreviewError(err.message);
      toast({ title: "Preview generation failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Auto-trigger preview after successful real compile ────────────────────
  // Guard: only fires for real (non-dry-run) compiles. A compile dry run must
  // never cause a real spec-preview generation (that would upload to Notion).
  useEffect(() => {
    if (
      result?.status === "compiled" &&
      result.prompt_hash &&
      resolvedId &&
      autoPreview &&
      !lastCompileWasDryRun &&
      !previewMutation.isPending &&
      previewResult === null &&
      previewError === null
    ) {
      previewMutation.mutate({ specId: resolvedId, hash: result.prompt_hash });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.status, result?.prompt_hash, autoPreview, lastCompileWasDryRun]);

  // ── Runs query ──────────────────────────────────────────────────────────────
  const runsQuery = useQuery({
    queryKey: ["worldsmith-runs", resolvedId ?? rawInput, statusFilter],
    queryFn: () => worldsmithApi.listRuns((resolvedId ?? rawInput).trim() || undefined, statusFilter),
    enabled: activeTab === "runs",
    staleTime: 10_000,
  });

  const assetsQuery = useQuery({
    queryKey: ["worldsmith-assets"],
    queryFn: () => worldsmithApi.listAssets(),
    enabled: activeTab === "assets",
    staleTime: 30_000,
  });

  const handleResolve = useCallback(() => {
    if (!normalizedId) return;
    preflightMutation.mutate(normalizedId);
  }, [normalizedId, preflightMutation]);

  const handleInputChange = (v: string) => {
    setRawInput(v);
    // Clear preflight when input changes
    if (preflight) { setPreflight(null); setResolvedId(null); setResult(null); }
  };

  const canCompile = !!resolvedId && !compile.isPending && !preflightMutation.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#C87560]/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[#C87560]" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">WorldSmith Publishing Engine</h1>
          <p className="text-xs text-muted-foreground">Governed publishing workflow — Resolve · Compile · Inspect · Specify · Review · Publish</p>
        </div>
        <div className="ml-auto">
          <Link href="/super">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer">
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Daybook
            </span>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["compiler", "runs", "assets", "batch"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab === "batch" ? "Batch Generate" : tab}
          </button>
        ))}
      </div>

      {/* ── Compiler tab ─────────────────────────────────────────────────── */}
      {activeTab === "compiler" && (
        <div className="space-y-5">

          {/* Step 1 — Input */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spec-input">Production Specification</Label>
                <div className="flex gap-2">
                  <Input
                    id="spec-input"
                    placeholder="Paste a Notion page URL or page ID"
                    value={rawInput}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && inputIsValid && handleResolve()}
                    className="font-mono text-sm flex-1"
                  />
                  <Button
                    onClick={handleResolve}
                    disabled={!inputIsValid || preflightMutation.isPending}
                    variant="outline"
                    className="shrink-0"
                  >
                    {preflightMutation.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <><Search className="w-4 h-4 mr-1.5" />Resolve</>}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Accepts a full Notion URL, a dashed UUID, or a 32-character page ID.
                  {normalizedId && !preflight && (
                    <span className="ml-1.5 text-emerald-600">✓ Normalized: <code className="font-mono">{normalizedId}</code></span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Step 2 — Preflight summary (shown after resolve) */}
          {preflight && !result && (
            <>
              <PreflightCard
                preflight={preflight}
                dryRun={dryRun}
                setDryRun={setDryRun}
                onCompile={() => compile.mutate({ id: resolvedId!, dry: dryRun })}
                onDryRun={() => compile.mutate({ id: resolvedId!, dry: true })}
                isPending={compile.isPending}
                canCompile={canCompile}
              />
              {/* Pricing is intentionally unavailable until a compile carries
                  explicit provider usage. Show that status before an editor
                  decides whether to compile rather than hiding the card. */}
              <CostEstimateCard prov={null} />
              {/* PP-2.0 payload generator — shown only when payload is blank */}
              {preflight.prompt_payload_blank && resolvedId && (
                <PayloadGeneratorPanel
                  specId={resolvedId}
                  productionItem={preflight.production_specification}
                  onSaved={() => {
                    // Re-run preflight so the generate button disappears
                    preflightMutation.mutate(resolvedId!);
                  }}
                />
              )}
            </>
          )}

          {/* Step 3 — Result */}
          {result && (
            result.status === "compiled"
              ? (
                <>
                  {/* Inspector always shown after compile — pipeline advances inside it once a board is generated */}
                  <InspectorScreen
                    result={result}
                    preflight={preflight}
                    previewResult={previewResult}
                    onReset={() => { setResult(null); setPreviewResult(null); setPreviewError(null); setPreflight(null); setResolvedId(null); setRawInput(""); }}
                    onGenerateNewBoard={() => previewMutation.mutate({
                      specId: resolvedId!,
                      hash: result.prompt_hash!,
                      forceNew: true,
                    })}
                    isGeneratingBoard={previewMutation.isPending}
                    onRetryStatus={() => retryStatusMutation.mutate({
                      specId: resolvedId!,
                      hash: result.prompt_hash!,
                    })}
                    isRetryingStatus={retryStatusMutation.isPending}
                  />

                  {/* Preview section — shown while generating, after dry-run, or after failure.
                      Not shown once a real preview image has been uploaded. */}
                  {previewResult?.status !== "success" && previewResult?.status !== "upload_success_status_failed" && (
                    <SpecPreviewSection
                      result={result}
                      resolvedId={resolvedId}
                      autoPreview={autoPreview}
                      setAutoPreview={(v) => {
                        setAutoPreview(v);
                        worldsmithStorage.setCompilerAutoPreview(v);
                      }}
                      previewMutation={previewMutation}
                      previewError={previewError}
                      dryRunResult={previewResult?.status === "dry_run" ? previewResult : null}
                    />
                  )}
                </>
              )
              : <ErrorResult result={result} onRetry={() => compile.mutate({ id: resolvedId!, dry: dryRun })} isPending={compile.isPending} />
          )}
        </div>
      )}

      {/* ── Runs tab ─────────────────────────────────────────────────────── */}
      {activeTab === "runs" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Input placeholder="Filter by spec ID" value={resolvedId ?? rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              className="max-w-sm font-mono text-sm" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <option value="all">All statuses</option>
              <option value="compiled">Compiled</option>
              <option value="failed">Failed</option>
              <option value="interrupted">Interrupted</option>
              <option value="in_progress">In Progress</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => runsQuery.refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {runsQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading runs…</div>}
          {runsQuery.isError && !runsQuery.isLoading && (
            <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 flex-1">{(runsQuery.error as Error)?.message}</p>
              <Button size="sm" variant="outline" className="border-red-300 text-red-700" onClick={() => runsQuery.refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry</Button>
            </div>
          )}
          {!runsQuery.isLoading && !runsQuery.isError && (
            <p className="text-xs text-muted-foreground">{(runsQuery.data?.runs ?? []).length} run{(runsQuery.data?.runs ?? []).length === 1 ? "" : "s"} shown</p>
          )}
          <div className="space-y-2">
            {(runsQuery.data?.runs ?? []).map((run) => <RunRow key={run.run_id} run={run} />)}
          </div>
        </div>
      )}

      {/* ── Assets tab ───────────────────────────────────────────────────── */}
      {activeTab === "assets" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => assetsQuery.refetch()}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh</Button>
          </div>
          {assetsQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
          {(assetsQuery.data?.assets ?? []).length === 0 && !assetsQuery.isLoading && <p className="text-sm text-muted-foreground">No assets registered yet.</p>}
          <div className="space-y-2">
            {(assetsQuery.data?.assets ?? []).map((asset) => (
              <Card key={asset.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium font-mono">{asset.id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{asset.asset_name} · {asset.component_type} · {asset.world}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={asset.readiness_state === "Approved" ? "default" : "secondary"} className="text-xs">{asset.readiness_state}</Badge>
                      <span className="text-xs text-muted-foreground">{asset.current_version}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── Batch Generate tab ────────────────────────────────────────────── */}
      {activeTab === "batch" && <BatchTab />}
    </div>
  );
}

// ── Canon Records label ───────────────────────────────────────────────────────
// Shows contextual text + colour based on Canon Dependency value and link count.

function CanonRecordsLabel({ dep, count }: { dep: string; count: number }) {
  if (dep === "None") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Hash className="w-3.5 h-3.5" />
        Canon Records: <span className="font-medium">Not required</span>
      </div>
    );
  }
  if (dep === "Supports Canon") {
    if (count === 0) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
          <Hash className="w-3.5 h-3.5" />
          Canon Records: <span className="font-medium">Recommended — not linked</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Hash className="w-3.5 h-3.5" />
        {count} Canon Record{count !== 1 ? "s" : ""} <span className="font-medium">(Supports Canon)</span>
      </div>
    );
  }
  // Canon Reference or Canon Defining
  if (count === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-600">
        <Hash className="w-3.5 h-3.5" />
        Canon Records: <span className="font-medium">Required — not linked</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
      <Hash className="w-3.5 h-3.5" />
      {count} Canon Record{count !== 1 ? "s" : ""} <span className="font-medium">linked</span>
    </div>
  );
}

// ── Preflight Card ────────────────────────────────────────────────────────────

function PreflightCard({
  preflight, dryRun, setDryRun, onCompile, onDryRun, isPending, canCompile,
}: {
  preflight: PreflightResponse;
  dryRun: boolean;
  setDryRun: (v: boolean) => void;
  onCompile: () => void;
  onDryRun: () => void;
  isPending: boolean;
  canCompile: boolean;
}) {
  const readinessColor: Record<string, string> = {
    "Ready": "bg-emerald-100 text-emerald-700",
    "Compiled": "bg-emerald-100 text-emerald-700",
    "Not Compiled": "bg-gray-100 text-gray-600",
    "Draft": "bg-amber-100 text-amber-700",
    "Needs Canon Review": "bg-orange-100 text-orange-700",
  };
  const readinessClass = readinessColor[preflight.generation_readiness] ?? "bg-gray-100 text-gray-600";

  const fields: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: "Production Specification", value: preflight.production_specification },
    { label: "Component Type",           value: preflight.component_type || "—" },
    { label: "Component Specification",  value: preflight.component_specification || "—" },
    { label: "Payload Version",          value: preflight.payload_version || "—" },
    { label: "Canon Dependency",         value: preflight.canon_dependency },
    { label: "Compiled Prompt Status",   value: preflight.compiled_prompt_status },
    { label: "Generation Readiness",     value: preflight.generation_readiness },
    { label: "Version",                  value: preflight.version },
    { label: "World",                    value: preflight.world || "—" },
    { label: "Collection",               value: preflight.collection || "—" },
    { label: "Volume",                   value: preflight.volume || "—" },
  ];

  return (
    <Card className="border-[#1B2A4A]/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Spec Resolved
          </CardTitle>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${readinessClass}`}>
            {preflight.generation_readiness}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Fields grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {fields.map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
              <p className="text-sm font-medium truncate" title={String(value ?? "—")}>{value ?? "—"}</p>
            </div>
          ))}
        </div>

        {/* Module / Canon counts */}
        <div className="flex gap-4 pt-1 border-t border-border">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BookOpen className="w-3.5 h-3.5" />
            {preflight.prompt_module_count} Prompt Module{preflight.prompt_module_count !== 1 ? "s" : ""} linked
          </div>
          <CanonRecordsLabel dep={preflight.canon_dependency} count={preflight.canon_record_count} />
        </div>

        {/* Dry run toggle + Compile */}
        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded" />
            Dry run (no Notion write-back)
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={dryRun ? onDryRun : onCompile}
            disabled={!canCompile}
            className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white"
          >
            {isPending
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{dryRun ? "Running dry run…" : "Compiling…"}</>
              : <><Sparkles className="w-4 h-4 mr-2" />{dryRun ? "Dry Run" : "Compile"}</>}
          </Button>
          {!dryRun && (
            <Button variant="outline" onClick={onDryRun} disabled={!canCompile}>
              <FileText className="w-4 h-4 mr-1.5" />Preview only
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Payload Generator Panel ───────────────────────────────────────────────────
// Self-contained component shown below PreflightCard when payload_version is
// PP-2.0 and Prompt Payload is blank.  State machine:
//   idle → checking → warning_confirm → generating → preview → saving → saved

type GenPanelState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "warning_confirm"; warnings: ValidationError[] }
  | { phase: "generating" }
  | { phase: "preview"; draft: GeneratePayloadResponse }
  | { phase: "saving"; draft: GeneratePayloadResponse }
  | { phase: "saved"; draft: GeneratePayloadResponse }
  | { phase: "error"; message: string };

function PayloadGeneratorPanel({
  specId,
  productionItem,
  onSaved,
}: {
  specId: string;
  productionItem: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<GenPanelState>({ phase: "idle" });
  const [expanded, setExpanded] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [editedSerialized, setEditedSerialized] = useState<string | null>(null);

  async function startGenerate(confirmWarnings = false) {
    setState({ phase: confirmWarnings ? "generating" : "checking" });
    try {
      const resp = await worldsmithApi.generatePayload(specId, confirmWarnings);
      if ((resp as GeneratePayloadResponse & { requires_confirmation?: boolean }).requires_confirmation) {
        setState({ phase: "warning_confirm", warnings: (resp as GeneratePayloadResponse).warnings });
        return;
      }
      setState({ phase: "preview", draft: resp });
      setEditedSerialized(resp.serialized);
    } catch (err: unknown) {
      const errBody = err as { status?: number; body?: { code?: string; errors?: ValidationError[]; message?: string; error?: string } };
      if (errBody?.body?.code === "REQUIREMENTS_NOT_MET") {
        setState({ phase: "error", message: `Requirements not met:\n${(errBody.body.errors ?? []).map(e => `• ${e.field}: ${e.message}`).join("\n")}` });
      } else {
        setState({ phase: "error", message: String((errBody?.body?.error) ?? err) });
      }
    }
  }

  async function handleSave() {
    if (state.phase !== "preview") return;
    const payload = editedSerialized ?? state.draft.serialized;
    const currentDraft = state.draft;
    setState({ phase: "saving", draft: currentDraft });
    try {
      const resp = await worldsmithApi.savePayload(specId, payload, false);
      // Server-side validation rejected the edited payload — show issues inline
      if (resp.code === "PAYLOAD_VALIDATION_FAILED") {
        const updatedDraft: GeneratePayloadResponse = {
          ...currentDraft,
          pre_save_issues: resp.validation_issues ?? [],
        };
        setState({ phase: "preview", draft: updatedDraft });
        toast({
          title: "Payload validation failed",
          description: `${resp.validation_issues?.length ?? 1} issue(s) found in the edited payload. Fix them and retry.`,
          variant: "destructive",
        });
        return;
      }
      if (!resp.success) throw new Error(resp.error ?? "Save indicated failure");
      setState({ phase: "saved", draft: currentDraft });
      toast({ title: "Payload saved", description: `Notion updated${resp.persistence_verified ? " and verified" : " (verification pending)"}. Recompile queued.` });
      setTimeout(onSaved, 1200);
    } catch (err) {
      setState({ phase: "error", message: String(err) });
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    }
  }

  function copySection(key: string, val: string) {
    navigator.clipboard.writeText(val).catch(() => {});
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 1500);
  }

  const sectionLabels: Record<string, string> = {
    shared_prompt: "Shared Prompt",
    front_prompt: "Front Prompt",
    back_prompt: "Back Prompt",
    assembly_prompt: "Assembly Prompt",
    negative_prompt: "Negative Prompt",
  };

  // --- Idle state: collapsed teaser card ---
  if (!expanded && state.phase === "idle") {
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-900">Prompt Payload missing</p>
                <p className="text-xs text-amber-700">This PP-2.0 spec has no Prompt Payload. Generate one from source data using AI.</p>
              </div>
            </div>
            <Button size="sm" onClick={() => { setExpanded(true); startGenerate(false); }}
              className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white">
              <Wand2 className="w-3.5 h-3.5 mr-1.5" />Generate Payload
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-amber-600" />
            Generate PP-2.0 Prompt Payload
            <span className="text-xs font-normal text-muted-foreground ml-1 truncate max-w-[200px]">{productionItem}</span>
          </CardTitle>
          {(state.phase === "idle" || state.phase === "error") && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded(false)} className="h-6 w-6 p-0">
              <ChevronUp className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">

        {/* ── Checking requirements ── */}
        {state.phase === "checking" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking generation requirements…
          </div>
        )}

        {/* ── Generating ── */}
        {state.phase === "generating" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              <span className="font-medium text-amber-900">Synthesizing payload with AI…</span>
            </div>
            <div className="grid grid-cols-5 gap-1 mt-2">
              {["Shared Prompt", "Front Prompt", "Back Prompt", "Assembly", "Negative"].map((s, i) => (
                <div key={s} className={`h-1 rounded-full ${i < 2 ? "bg-amber-400" : "bg-amber-100"} animate-pulse`} style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">This uses OpenAI and may take 10–20 seconds.</p>
          </div>
        )}

        {/* ── Warning confirmation ── */}
        {state.phase === "warning_confirm" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Warnings require confirmation before generation
            </div>
            <div className="space-y-2">
              {state.warnings.map((w, i) => (
                <div key={i} className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-medium text-amber-800">{w.field}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{w.message}</p>
                  <p className="text-xs text-amber-600 mt-1 italic">{w.recommended_action}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => startGenerate(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white">
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />Confirm &amp; Generate Anyway
              </Button>
              <Button size="sm" variant="outline" onClick={() => setState({ phase: "idle" })}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {state.phase === "error" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
              <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <pre className="text-xs text-red-700 whitespace-pre-wrap font-sans">{state.message}</pre>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => startGenerate(false)}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setState({ phase: "idle" })}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ── Preview ── */}
        {(state.phase === "preview" || state.phase === "saving" || state.phase === "saved") && (
          <>
            {/* Pre-save issues */}
            {state.draft.pre_save_issues.length > 0 && (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-3 space-y-1">
                <p className="text-xs font-medium text-orange-800 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {state.draft.pre_save_issues.length} pre-save issue{state.draft.pre_save_issues.length !== 1 ? "s" : ""}
                </p>
                {state.draft.pre_save_issues.map((issue, i) => (
                  <p key={i} className="text-xs text-orange-700">• <strong>{issue.field}</strong>: {issue.message}</p>
                ))}
              </div>
            )}

            {/* Warnings from requirements check */}
            {state.draft.warnings.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
                <p className="text-xs font-medium text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {state.draft.warnings.length} generation warning{state.draft.warnings.length !== 1 ? "s" : ""}
                </p>
                {state.draft.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-700">• <strong>{w.field}</strong>: {w.message}</p>
                ))}
              </div>
            )}

            {/* Section preview cards */}
            <div className="space-y-2">
              {Object.entries(state.draft.sections).map(([key, val]) => {
                if (!val?.trim()) return null;
                return (
                  <div key={key} className="rounded-md border border-border bg-muted/30 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/50">
                      <span className="text-xs font-mono font-semibold text-[#1B2A4A]">{key}</span>
                      <button onClick={() => copySection(key, val)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        {copiedSection === key ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        {sectionLabels[key] ?? key}
                      </button>
                    </div>
                    <p className="px-3 py-2 text-xs text-foreground leading-relaxed">{val}</p>
                  </div>
                );
              })}
            </div>

            {/* Editable raw payload */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Serialised payload (editable before saving)</p>
              <Textarea
                value={editedSerialized ?? state.draft.serialized}
                onChange={(e) => setEditedSerialized(e.target.value)}
                className="font-mono text-xs h-32 resize-y"
                disabled={state.phase === "saving" || state.phase === "saved"}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {(editedSerialized ?? state.draft.serialized).length} chars ·
                {state.draft.pre_save_issues.length === 0 ? " ✓ Validation passed" : ` ${state.draft.pre_save_issues.length} issue(s) — review before saving`}
              </p>
            </div>

            {/* Action buttons */}
            {state.phase === "preview" && (
              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleSave}
                  disabled={state.draft.pre_save_issues.some(i => i.code === "PAYLOAD_TOO_LARGE")}
                  className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white"
                >
                  <Save className="w-3.5 h-3.5 mr-1.5" />Save to Notion &amp; Recompile
                </Button>
                <Button variant="outline" onClick={() => startGenerate(true)}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Regenerate
                </Button>
                <Button variant="ghost" onClick={() => setState({ phase: "idle" })}>
                  Cancel
                </Button>
              </div>
            )}

            {state.phase === "saving" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Writing to Notion…
              </div>
            )}

            {state.phase === "saved" && (
              <div className="flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="w-4 h-4" />
                Saved to Notion successfully. Preflight will refresh.
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Batch Generate Tab ─────────────────────────────────────────────────────────

type BatchRecordWithDraft = {
  specId: string;
  productionItem: string;
  componentType: string;
  issues: string[];
  issueType: "error" | "warning";
  draft?: GeneratePayloadResponse | null;
  draftState: "idle" | "generating" | "ready" | "saving" | "saved" | "error";
  draftError?: string;
  savedPayload?: string;
};

function BatchTab() {
  const { toast } = useToast();
  const [selectedWorldId, setSelectedWorldId] = useState<string>("");
  const [auditResult, setAuditResult] = useState<BatchAuditResponse | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [records, setRecords] = useState<BatchRecordWithDraft[]>([]);
  const [activeGroup, setActiveGroup] = useState<"ready" | "warning" | "blocked">("ready");

  const worldsQuery = useQuery({
    queryKey: ["worldsmith-worlds"],
    queryFn: () => worldsmithApi.listWorlds(),
  });

  const worlds = worldsQuery.data?.worlds ?? [];

  async function runAudit() {
    if (!selectedWorldId) return;
    setIsAuditing(true);
    setAuditResult(null);
    setAuditError(null);
    setRecords([]);
    try {
      const result = await worldsmithApi.batchAudit(selectedWorldId, 60);
      setAuditResult(result);
      const allRecords: BatchRecordWithDraft[] = [
        ...result.ready.map(r => ({ specId: r.specId, productionItem: r.productionItem, componentType: r.componentType, issues: [], issueType: "warning" as const, draftState: "idle" as const })),
        ...result.warning.map(r => ({ specId: r.specId, productionItem: r.productionItem, componentType: r.componentType, issues: r.warnings, issueType: "warning" as const, draftState: "idle" as const })),
        ...result.blocked.map(r => ({ specId: r.specId, productionItem: r.productionItem, componentType: r.componentType, issues: r.errors, issueType: "error" as const, draftState: "idle" as const })),
      ];
      setRecords(allRecords);
    } catch (err) {
      setAuditError(String(err));
    } finally {
      setIsAuditing(false);
    }
  }

  function updateRecord(specId: string, patch: Partial<BatchRecordWithDraft>) {
    setRecords(prev => prev.map(r => r.specId === specId ? { ...r, ...patch } : r));
  }

  async function generateForRecord(specId: string) {
    updateRecord(specId, { draftState: "generating", draftError: undefined });
    try {
      const resp = await worldsmithApi.generatePayload(specId, true);
      updateRecord(specId, { draft: resp, draftState: "ready", savedPayload: resp.serialized });
    } catch (err) {
      updateRecord(specId, { draftState: "error", draftError: String(err) });
    }
  }

  async function saveRecord(specId: string) {
    const rec = records.find(r => r.specId === specId);
    if (!rec?.savedPayload) return;
    updateRecord(specId, { draftState: "saving" });
    try {
      const resp = await worldsmithApi.batchSavePayload(specId, rec.savedPayload);
      if (resp.code === "PAYLOAD_VALIDATION_FAILED") {
        const issueText = (resp.validation_issues ?? []).map(i => `• ${i.field}: ${i.message}`).join("\n");
        updateRecord(specId, {
          draftState: "error",
          draftError: `Validation failed:\n${issueText}`,
        });
        return;
      }
      updateRecord(specId, { draftState: "saved" });
      toast({ title: "Saved", description: `${rec.productionItem} — payload written to Notion.` });
    } catch (err) {
      updateRecord(specId, { draftState: "error", draftError: String(err) });
    }
  }

  async function generateAllReady() {
    const readyIds = records
      .filter(r => (auditResult?.ready ?? []).some(ar => ar.specId === r.specId) && r.draftState === "idle")
      .map(r => r.specId);

    for (const specId of readyIds) {
      await generateForRecord(specId);
    }
  }

  async function saveAllReady() {
    const toSave = records.filter(r =>
      (auditResult?.ready ?? []).some(ar => ar.specId === r.specId) &&
      r.draftState === "ready" &&
      r.savedPayload
    );
    for (const rec of toSave) {
      await saveRecord(rec.specId);
    }
  }

  const groupRecords = (group: "ready" | "warning" | "blocked") => {
    if (!auditResult) return [];
    const ids = new Set(auditResult[group].map(r => r.specId));
    return records.filter(r => ids.has(r.specId));
  };

  const groupCounts = auditResult
    ? { ready: auditResult.ready.length, warning: auditResult.warning.length, blocked: auditResult.blocked.length }
    : null;

  const readySavedCount = auditResult
    ? records.filter(r => auditResult.ready.some(ar => ar.specId === r.specId) && r.draftState === "saved").length
    : 0;

  const readyToSaveCount = auditResult
    ? records.filter(r => auditResult.ready.some(ar => ar.specId === r.specId) && r.draftState === "ready").length
    : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Batch PP-2.0 Payload Generation</p>
          <p className="text-xs text-muted-foreground">Audit a world's Notion Production DB and generate missing PP-2.0 payloads.</p>
        </div>
      </div>

      {/* World selector + audit button */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">World</label>
              {worldsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />Loading worlds…</div>
              ) : (
                <select
                  value={selectedWorldId}
                  onChange={(e) => setSelectedWorldId(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="">Select a world…</option>
                  {worlds.map((w) => (
                    <option key={w.id} value={w.id} disabled={!w.notionProductionDbId}>
                      {w.name}{!w.notionProductionDbId ? " (no DB configured)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Button
              onClick={runAudit}
              disabled={!selectedWorldId || isAuditing}
              className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white shrink-0"
            >
              {isAuditing
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Auditing…</>
                : <><ListChecks className="w-4 h-4 mr-2" />Audit Records</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit error */}
      {auditError && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
          <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{auditError}</p>
        </div>
      )}

      {/* Results */}
      {auditResult && (
        <div className="space-y-4">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: "ready" as const, label: "Ready", count: auditResult.ready.length, color: "emerald", icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" /> },
              { key: "warning" as const, label: "Warning", count: auditResult.warning.length, color: "amber", icon: <AlertTriangle className="w-4 h-4 text-amber-600" /> },
              { key: "blocked" as const, label: "Blocked", count: auditResult.blocked.length, color: "red", icon: <ShieldAlert className="w-4 h-4 text-red-500" /> },
            ].map(({ key, label, count, icon }) => (
              <button
                key={key}
                onClick={() => setActiveGroup(key)}
                className={`rounded-lg border p-3 text-left transition-all ${
                  activeGroup === key ? "border-[#1B2A4A] shadow-sm" : "border-border hover:border-[#1B2A4A]/40"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium">{label}</span></div>
                <p className="text-2xl font-bold">{count}</p>
              </button>
            ))}
          </div>

          {auditResult.truncated && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Results truncated at 60 records. Run again after saving these to process more.
            </p>
          )}

          {/* Group actions */}
          {activeGroup === "ready" && auditResult.ready.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={generateAllReady}
                disabled={records.filter(r => auditResult.ready.some(ar => ar.specId === r.specId) && r.draftState === "idle").length === 0}>
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />Generate All Ready
              </Button>
              {readyToSaveCount > 0 && (
                <Button size="sm" onClick={saveAllReady} className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white">
                  <Save className="w-3.5 h-3.5 mr-1.5" />Save All Ready ({readyToSaveCount})
                </Button>
              )}
              {readySavedCount > 0 && (
                <span className="text-xs text-emerald-700 flex items-center gap-1 self-center">
                  <CheckCircle2 className="w-3.5 h-3.5" />{readySavedCount} saved
                </span>
              )}
            </div>
          )}

          {/* Record list */}
          <div className="space-y-2">
            {groupCounts && groupCounts[activeGroup] === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No records in this group.</p>
            )}
            {groupRecords(activeGroup).map((rec) => (
              <Card key={rec.specId} className={
                rec.draftState === "saved" ? "border-emerald-200 bg-emerald-50/40" :
                rec.draftState === "error" ? "border-red-200" :
                "border-border"
              }>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{rec.productionItem}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rec.componentType} · <span className="font-mono text-[10px]">{rec.specId}</span></p>
                      {rec.issues.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {rec.issues.map((issue, i) => (
                            <li key={i} className={`text-xs ${rec.issueType === "error" ? "text-red-600" : "text-amber-700"}`}>
                              • {issue}
                            </li>
                          ))}
                        </ul>
                      )}
                      {rec.draftState === "error" && rec.draftError && (
                        <p className="text-xs text-red-600 mt-1">Error: {rec.draftError}</p>
                      )}
                      {rec.draftState === "ready" && rec.draft && (
                        <div className="mt-2 rounded border border-border bg-muted/30 p-2">
                          <p className="text-xs font-mono text-muted-foreground line-clamp-3 whitespace-pre-wrap">{rec.draft.serialized}</p>
                          <p className="text-xs text-muted-foreground mt-1">{rec.draft.pre_save_issues.length === 0 ? "✓ Validation passed" : `${rec.draft.pre_save_issues.length} issue(s)`} · {rec.draft.serialized.length} chars</p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                      {rec.draftState === "idle" && activeGroup !== "blocked" && (
                        <Button size="sm" variant="outline" onClick={() => generateForRecord(rec.specId)}>
                          <Wand2 className="w-3.5 h-3.5 mr-1" />Generate
                        </Button>
                      )}
                      {rec.draftState === "generating" && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…
                        </div>
                      )}
                      {rec.draftState === "ready" && (
                        <Button size="sm" onClick={() => saveRecord(rec.specId)} className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white">
                          <Save className="w-3.5 h-3.5 mr-1" />Save
                        </Button>
                      )}
                      {rec.draftState === "saving" && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…
                        </div>
                      )}
                      {rec.draftState === "saved" && (
                        <span className="text-xs text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />Saved
                        </span>
                      )}
                      {rec.draftState === "error" && (
                        <Button size="sm" variant="outline" onClick={() => generateForRecord(rec.specId)}>
                          <RefreshCw className="w-3.5 h-3.5 mr-1" />Retry
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function notionUrl(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return `https://www.notion.so/${id.replace(/-/g, "")}`;
}

function exportJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function fmtTs(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

// ── Publishing Pipeline ────────────────────────────────────────────────────────

type PipelineStageKey =
  | "resolve" | "validate" | "inheritance" | "prompt-assembly" | "hash-generation"
  | "ready-for-spec-board" | "specification-review" | "ready-for-artwork"
  | "artwork-generation" | "artwork-review" | "ready-for-publish" | "published";

type PipelineStageStatus = "done" | "current" | "warning" | "error" | "future";

interface PipelineStageShape {
  key: PipelineStageKey;
  label: string;
  status: PipelineStageStatus;
  badge?: number;
}

function PipelineStageIcon({ status }: { status: PipelineStageStatus }) {
  if (status === "done")    return <CheckCircle2 className="w-3 h-3 shrink-0" />;
  if (status === "current") return <div className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />;
  if (status === "warning") return <AlertTriangle className="w-3 h-3 shrink-0" />;
  if (status === "error")   return <XCircle className="w-3 h-3 shrink-0" />;
  return <Clock className="w-3 h-3 shrink-0 opacity-50" />;
}

function PublishingPipeline({
  result, activeStage, setActiveStage,
}: {
  result: CompileResponse;
  activeStage: PipelineStageKey;
  setActiveStage: (s: PipelineStageKey) => void;
}) {
  const errCount = (result.errors ?? []).length;
  const warnCount = (result.warnings ?? []).length;

  // Post-compile stages in pipeline order; used to derive done/current/future dynamically.
  const POST_COMPILE_STAGES: Array<{ key: PipelineStageKey; label: string }> = [
    { key: "ready-for-spec-board", label: "Ready for Specification Board" },
    { key: "specification-review", label: "Specification Review" },
    { key: "ready-for-artwork",    label: "Ready for Artwork" },
    { key: "artwork-generation",   label: "Artwork Generation" },
    { key: "artwork-review",       label: "Artwork Review" },
    { key: "ready-for-publish",    label: "Ready for Publish" },
    { key: "published",            label: "Published" },
  ];
  const currentPostIdx = POST_COMPILE_STAGES.findIndex(s => s.key === activeStage);

  const stages: PipelineStageShape[] = [
    { key: "resolve",         label: "Resolve",         status: "done" },
    { key: "validate",        label: "Validate",        status: errCount > 0 ? "error" : warnCount > 0 ? "warning" : "done", badge: errCount + warnCount || undefined },
    { key: "inheritance",     label: "Inheritance",     status: "done" },
    { key: "prompt-assembly", label: "Prompt Assembly", status: "done" },
    { key: "hash-generation", label: "Hash Generation", status: "done" },
    ...POST_COMPILE_STAGES.map((s, i): PipelineStageShape => ({
      key: s.key,
      label: s.label,
      // When activeStage is a compile-phase stage (not in post-compile list), treat ready-for-spec-board as current.
      status: currentPostIdx < 0
        ? (i === 0 ? "current" : "future")
        : i < currentPostIdx ? "done" : i === currentPostIdx ? "current" : "future",
    })),
  ];

  const baseCls = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer select-none";
  const statusCls: Record<PipelineStageStatus, string> = {
    done:    "bg-emerald-50  text-emerald-700  border-emerald-200  hover:bg-emerald-100",
    current: "bg-[#1B2A4A]  text-white         border-[#1B2A4A]    hover:bg-[#2a3d6a]",
    warning: "bg-amber-50   text-amber-700    border-amber-200    hover:bg-amber-100",
    error:   "bg-red-50     text-red-700      border-red-200      hover:bg-red-100",
    future:  "bg-muted/30   text-muted-foreground border-border   hover:bg-muted/50",
  };
  const selectedRing = "ring-2 ring-offset-1 ring-[#1B2A4A]/40";

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex items-center gap-0 min-w-max">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setActiveStage(s.key)}
              className={`${baseCls} ${statusCls[s.status]} ${activeStage === s.key ? selectedRing : ""}`}
            >
              <PipelineStageIcon status={s.status} />
              <span>{s.label}</span>
              {s.badge != null && s.badge > 0 && (
                <span className={`ml-0.5 px-1.5 py-0 rounded-full text-[9px] font-bold leading-4 ${s.status === "error" ? "bg-red-600 text-white" : "bg-amber-500 text-white"}`}>
                  {s.badge}
                </span>
              )}
            </button>
            {i < stages.length - 1 && (
              <ArrowRight className="w-3 h-3 text-muted-foreground mx-0.5 shrink-0 opacity-50" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Publishing Engine Inspector ────────────────────────────────────────────────

function InspectorScreen({
  result, preflight, previewResult, onReset, onGenerateNewBoard, isGeneratingBoard,
  onRetryStatus, isRetryingStatus,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  previewResult?: SpecPreviewResult | null;
  onReset: () => void;
  onGenerateNewBoard?: () => void;
  isGeneratingBoard?: boolean;
  onRetryStatus?: () => void;
  isRetryingStatus?: boolean;
}) {
  const boardSuccess = previewResult?.status === "success" || previewResult?.status === "upload_success_status_failed";
  const [workspaceTab, setWorkspaceTab]     = useState<"overview" | "inspector" | "history">("overview");
  const [inspectorStage, setInspectorStage] = useState<PipelineStageKey>(
    boardSuccess ? "specification-review" : "ready-for-spec-board"
  );
  const prov = result.provenance;

  /** Navigate to a specific pipeline stage — switches to Inspector tab */
  function goToStage(stage: PipelineStageKey) {
    setInspectorStage(stage);
    setWorkspaceTab("inspector");
  }

  // Advance pipeline when the spec board is successfully generated
  useEffect(() => {
    if (boardSuccess) {
      setInspectorStage("specification-review");
      setWorkspaceTab("inspector");
    }
  }, [boardSuccess]);

  return (
    <div className="space-y-3">
      {/* Zone 1 — Publishing Status */}
      <StickyPublishingHeader
        result={result}
        preflight={preflight}
        prov={prov ?? null}
        onReset={onReset}
        setActiveStage={goToStage}
        previewResult={previewResult}
        inspectorStage={inspectorStage}
      />

      {/* Zone 2 — Primary Action */}
      <ActionCenter
        result={result}
        prov={prov ?? null}
        setActiveStage={goToStage}
        previewResult={previewResult}
        onReset={onReset}
        onGenerateNewBoard={onGenerateNewBoard}
        isGeneratingBoard={isGeneratingBoard}
      />

      {/* Zone 3 — Publishing Workspace */}
      <WorkspacePanel
        result={result}
        preflight={preflight}
        prov={prov ?? null}
        workspaceTab={workspaceTab}
        setWorkspaceTab={setWorkspaceTab}
        inspectorStage={inspectorStage}
        setInspectorStage={setInspectorStage}
        goToStage={goToStage}
        previewResult={previewResult}
        onGenerateNewBoard={onGenerateNewBoard}
        isGeneratingBoard={isGeneratingBoard}
        onRetryStatus={onRetryStatus}
        isRetryingStatus={isRetryingStatus}
      />

      {result.visual_asset_id && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Visual Asset ID: <code className="font-mono">{result.visual_asset_id}</code>
        </div>
      )}
    </div>
  );
}

// ── Workspace Panel (Zone 3) ─────────────────────────────────────────────────

function WorkspacePanel({
  result, preflight, prov,
  workspaceTab, setWorkspaceTab,
  inspectorStage, setInspectorStage,
  goToStage,
  previewResult, onGenerateNewBoard, isGeneratingBoard,
  onRetryStatus, isRetryingStatus,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
  workspaceTab: "overview" | "inspector" | "history";
  setWorkspaceTab: (t: "overview" | "inspector" | "history") => void;
  inspectorStage: PipelineStageKey;
  setInspectorStage: (s: PipelineStageKey) => void;
  goToStage: (s: PipelineStageKey) => void;
  previewResult?: SpecPreviewResult | null;
  onGenerateNewBoard?: () => void;
  isGeneratingBoard?: boolean;
  onRetryStatus?: () => void;
  isRetryingStatus?: boolean;
}) {
  const TABS = [
    { id: "overview",  label: "Overview"  },
    { id: "inspector", label: "Inspector" },
    { id: "history",   label: "History"   },
  ] as const;

  return (
    <div>
      <div className="flex border-b border-[#1B2A4A]/15 mb-4">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setWorkspaceTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              workspaceTab === tab.id
                ? "border-[#1B2A4A] text-[#1B2A4A]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {workspaceTab === "overview" && (
        <OverviewTab result={result} preflight={preflight} prov={prov} goToStage={goToStage} />
      )}
      {workspaceTab === "inspector" && (
        <InspectorWorkspaceTab result={result} preflight={preflight} prov={prov}
          stage={inspectorStage} setStage={setInspectorStage}
          previewResult={previewResult} onGenerateNewBoard={onGenerateNewBoard} isGeneratingBoard={isGeneratingBoard}
          onRetryStatus={onRetryStatus} isRetryingStatus={isRetryingStatus} />
      )}
      {workspaceTab === "history" && (
        <HistoryTab result={result} />
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  result, preflight, prov, goToStage,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
  goToStage: (s: PipelineStageKey) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Top row — Summary (left) + Publishing Journey (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <ProductionSummaryCard result={result} preflight={preflight} prov={prov} />
        </div>
        <div className="lg:col-span-2">
          <PublishingJourneyCard result={result} prov={prov} goToStage={goToStage} />
        </div>
      </div>

      {/* Grouped Readiness */}
      <GroupedReadinessCard result={result} preflight={preflight} prov={prov} />

      {/* Keep pricing provenance visible in the default post-compile view.
          The detailed Inspector stage also includes this card. */}
      <CostEstimateCard prov={prov} />

      {/* World Bible — shown when Bible-derived sections were compiled */}
      {(result.compiled_sections ?? []).some((s) => s.source === "World Bible") && (
        <WorldBibleCard sections={result.compiled_sections!} />
      )}

      {/* Timeline */}
      <CompilationTimeline prov={prov} result={result} />

      {/* Bottom row — Context + Next After This */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProductionContextCard prov={prov} preflight={preflight} />
        <NextAfterThisCard result={result} />
      </div>
    </div>
  );
}

// ── Production Summary Card ───────────────────────────────────────────────────

function ProductionSummaryCard({
  result, preflight, prov,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
}) {
  const { useToast: _ut } = { useToast: () => ({ toast: (_: unknown) => {} }) }; // local copy-toast
  const { toast } = useToast();
  const errCount  = (result.errors ?? []).length;
  const stageLabel = errCount > 0 ? "Validation Blocked" : "Ready for Specification Board";

  function CopyRow({ label, value, copy }: { label: string; value: string; copy?: string }) {
    return (
      <div className="flex items-center justify-between gap-3 group">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-xs font-medium font-mono truncate text-right max-w-[160px]" title={copy ?? value}>{value}</span>
          {copy && (
            <button onClick={() => { navigator.clipboard.writeText(copy); toast({ title: `${label} copied` }); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-foreground text-muted-foreground transition-opacity shrink-0">
              <Copy className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    );
  }

  function Row({ label, value, color, notionId }: { label: string; value: string; color?: string; notionId?: string }) {
    const url = notionUrl(notionId);
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground shrink-0">{label}</span>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className={`text-xs font-medium text-right truncate max-w-[60%] flex items-center gap-1 hover:underline ${color ?? ""}`}>
            {value}<ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
          </a>
        ) : (
          <span className={`text-xs font-medium text-right truncate max-w-[60%] ${color ?? ""}`}>{value}</span>
        )}
      </div>
    );
  }

  const ts = prov?.compilation_timestamp;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Production Summary</CardTitle></CardHeader>
      <CardContent className="pt-0 space-y-4">

        {/* Identity */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Identity</p>
          <div className="space-y-1.5">
            <Row label="World"          value={prov?.world ?? preflight?.world ?? "—"} notionId={prov?.world_notion_id} />
            <Row label="Collection"     value={prov?.collection ?? "—"} notionId={prov?.collection ? prov?.collection_notion_id : undefined} />
            <Row label="Volume"         value={prov?.volume ?? preflight?.volume ?? "—"} notionId={prov?.volume_notion_id} />
            <Row label="Component"      value={prov?.component_type ?? result.component_type ?? preflight?.component_type ?? "—"} />
            <Row label="Component Set"  value={prov?.component_set ?? "—"} />
          </div>
        </div>

        {/* Workflow */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Workflow</p>
          <div className="space-y-1.5">
            <Row label="Publishing Stage" value={stageLabel} color={errCount > 0 ? "text-red-600" : "text-[#1B2A4A]"} />
            <Row label="Current Status"   value={errCount > 0 ? "Blocked — validation errors" : "Compiled successfully"} />
            <Row label="Next Action"      value={errCount > 0 ? "Fix validation errors" : "Generate Specification Board"} />
          </div>
        </div>

        {/* Compilation */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Compilation</p>
          <div className="space-y-1.5">
            <CopyRow label="Compiled Artifact ID" value={result.run_id ? result.run_id.slice(0, 12) + "…" : "—"} copy={result.run_id} />
            <CopyRow label="Prompt Hash"  value={result.prompt_hash ? result.prompt_hash.slice(0, 12) + "…" : "—"} copy={result.prompt_hash} />
            <Row     label="Compiler Version" value={prov?.compiler_version ?? "—"} />
            <Row     label="Compilation Time" value={ts ? fmtTs(ts) : "—"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Publishing Journey Card ───────────────────────────────────────────────────

function PublishingJourneyCard({
  result, prov, goToStage,
}: {
  result: CompileResponse;
  prov: ProvenanceRecord | null;
  goToStage: (s: PipelineStageKey) => void;
}) {
  const errCount = (result.errors ?? []).length;

  const stages: Array<{ key: PipelineStageKey; label: string; done: boolean; current?: boolean }> = [
    { key: "resolve",              label: "Resolve",             done: true },
    { key: "validate",             label: "Validate",            done: errCount === 0 },
    { key: "inheritance",          label: "Inheritance",         done: !!prov },
    { key: "prompt-assembly",      label: "Prompt Assembly",     done: !!result.compiled_prompt },
    { key: "hash-generation",      label: "Hash Generation",     done: !!result.prompt_hash },
    { key: "ready-for-spec-board", label: "Specification Board", done: false, current: true },
    { key: "specification-review", label: "Human Review",        done: false },
    { key: "ready-for-artwork",    label: "Artwork Generation",  done: false },
    { key: "artwork-review",       label: "Artwork QA",          done: false },
    { key: "ready-for-publish",    label: "Publishing Approval", done: false },
    { key: "published",            label: "Published",           done: false },
  ];

  return (
    <Card className="h-full">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Publishing Journey</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {stages.map((stage, i) => {
            const isLast    = i === stages.length - 1;
            const clickable = stage.done || stage.current;
            return (
              <div key={stage.key} className="flex gap-3">
                {/* Track */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] border-2 mt-0.5 ${
                    stage.done    ? "bg-emerald-500 border-emerald-500 text-white"
                    : stage.current ? "bg-[#1B2A4A] border-[#1B2A4A] text-white"
                    : "bg-white border-muted-foreground/20"
                  }`}>
                    {stage.done ? "✓" : stage.current ? <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" /> : ""}
                  </div>
                  {!isLast && <div className={`w-0.5 flex-1 my-0.5 ${stage.done ? "bg-emerald-300" : "bg-muted/40"}`} style={{ minHeight: 14 }} />}
                </div>
                {/* Label */}
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && goToStage(stage.key)}
                  className={`pb-2.5 text-left leading-none ${
                    clickable ? "hover:underline cursor-pointer" : "cursor-default"
                  } ${
                    stage.done    ? "text-xs font-medium text-emerald-700"
                    : stage.current ? "text-xs font-semibold text-[#1B2A4A]"
                    : "text-xs text-muted-foreground/60"
                  }`}>
                  {stage.label}
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Grouped Readiness Card ────────────────────────────────────────────────────

function GroupedReadinessCard({
  result, preflight, prov,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ governance: true, compilation: true, output: false, publishing: false });
  const toggle = (k: string) => setOpen(prev => ({ ...prev, [k]: !prev[k] }));

  const govItems = [
    { label: "Production Specification", ok: true },
    { label: "Component Specification",  ok: !!(prov?.component_specification ?? preflight?.component_specification) },
    { label: "Style Guide",              ok: !!prov?.style_guide },
    { label: "Canon Records",            ok: (prov?.canon_records.length ?? preflight?.canon_record_count ?? 0) > 0 },
  ];
  const compileItems = [
    { label: "Prompt Modules",   ok: (prov?.prompt_modules.length ?? preflight?.prompt_module_count ?? 0) > 0 },
    { label: "Prompt Payload",   ok: true },
    { label: "Prompt Hash",      ok: !!result.prompt_hash },
    { label: "Compiled Artifact",ok: true },
    { label: "PP-2.0 Contract",  ok: prov?.payload_format !== "legacy" },
  ];
  const outputItems = [
    { label: "Specification Board", ok: false, pending: true },
    { label: "Artwork",             ok: false, pending: true },
  ];
  const publishItems = [
    { label: "Publishing Approval", ok: false, pending: true },
    { label: "Published",           ok: false, pending: true },
  ];

  const groups = [
    { key: "governance",  label: "Governance",  items: govItems },
    { key: "compilation", label: "Compilation", items: compileItems },
    { key: "output",      label: "Output",      items: outputItems },
    { key: "publishing",  label: "Publishing",  items: publishItems },
  ];

  function Item({ label, ok, pending }: { label: string; ok: boolean; pending?: boolean }) {
    return (
      <div className="flex items-center gap-2 py-1">
        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold ${
          pending   ? "border border-dashed border-muted-foreground/30 text-transparent"
          : ok      ? "bg-emerald-100 text-emerald-700"
          :           "bg-red-100 text-red-600"
        }`}>
          {!pending && (ok ? "✓" : "✗")}
        </div>
        <span className={`text-xs ${pending ? "text-muted-foreground/50 italic" : ok ? "text-foreground" : "text-red-700 font-medium"}`}>
          {label}{pending ? " — pending" : ""}
        </span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Readiness</CardTitle></CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-border">
          {groups.map(group => (
            <div key={group.key} className="px-3 first:pl-0 last:pr-0">
              <button onClick={() => toggle(group.key)}
                className="flex items-center justify-between w-full py-1.5 group">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{group.label}</p>
                <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${open[group.key] ? "rotate-180" : ""}`} />
              </button>
              {open[group.key] && (
                <div className="pb-2">
                  {group.items.map(item => <Item key={item.label} {...item} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Production Context Card ───────────────────────────────────────────────────

function ProductionContextCard({
  prov, preflight,
}: {
  prov: ProvenanceRecord | null;
  preflight: PreflightResponse | null;
}) {
  const volume    = prov?.volume ?? preflight?.volume ?? "Volume I";
  const compType  = prov?.component_type ?? preflight?.component_type ?? "Component";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#C87560]" />
          This Asset in Production
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-[#1B2A4A]">{volume} Progress</span>
            <span className="text-xs font-bold text-[#1B2A4A] tabular-nums">—%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div className="h-full rounded-full bg-[#1B2A4A]/20" style={{ width: "0%" }} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{compType}s in volume</span>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-emerald-700 font-medium">— complete</span>
              <span className="text-amber-600">— in review</span>
              <span className="text-red-600">— blocked</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/60 italic pt-1">
          Volume pipeline data will connect when production tracking is enabled.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Next After This Card ──────────────────────────────────────────────────────

function NextAfterThisCard({ result }: { result: CompileResponse }) {
  const errCount = (result.errors ?? []).length;

  const steps = errCount > 0
    ? [
        { label: "Fix validation errors",      note: "Required before proceeding" },
        { label: "Recompile",                  note: "Run a fresh compilation" },
        { label: "Generate Specification Board", note: "Upload to Notion for review" },
      ]
    : [
        { label: "Generate Specification Board", note: "Upload 1600×2000 px board to Notion" },
        { label: "Specification Review",         note: "Human review in Notion" },
        { label: "Artwork Generation",           note: "DALL-E HD render" },
        { label: "Artwork QA",                   note: "Quality check and approval" },
        { label: "Publishing Approval",          note: "Final sign-off" },
        { label: "Published",                    note: "Volume progress advances" },
      ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-[#C87560]" />
          After This Asset…
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div key={step.label} className="flex gap-2.5">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] font-bold mt-0.5 ${
                  i === 0 ? "border-[#1B2A4A] bg-[#1B2A4A] text-white" : "border-muted-foreground/20 bg-white"
                }`}>
                  {i === 0 ? "→" : ""}
                </div>
                {i < steps.length - 1 && <div className="w-0.5 flex-1 bg-muted/30 my-0.5" style={{ minHeight: 14 }} />}
              </div>
              <div className="pb-2.5">
                <p className={`text-xs font-medium leading-none ${i === 0 ? "text-[#1B2A4A]" : "text-muted-foreground/70"}`}>{step.label}</p>
                <p className="text-[11px] text-muted-foreground/50 mt-0.5">{step.note}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Inspector Workspace Tab ────────────────────────────────────────────────────

function InspectorWorkspaceTab({
  result, preflight, prov, stage, setStage,
  previewResult, onGenerateNewBoard, isGeneratingBoard,
  onRetryStatus, isRetryingStatus,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
  stage: PipelineStageKey;
  setStage: (s: PipelineStageKey) => void;
  previewResult?: SpecPreviewResult | null;
  onGenerateNewBoard?: () => void;
  isGeneratingBoard?: boolean;
  onRetryStatus?: () => void;
  isRetryingStatus?: boolean;
}) {
  const isLegacy = prov?.payload_format === "legacy";
  const boardSuccess = previewResult?.status === "success" || previewResult?.status === "upload_success_status_failed";
  const PLACEHOLDER_STAGES: PipelineStageKey[] = [
    "ready-for-artwork", "artwork-generation",
    "artwork-review", "ready-for-publish", "published",
  ];

  return (
    <div className="space-y-4">
      <PublishingPipeline result={result} activeStage={stage} setActiveStage={setStage} />

      {stage === "resolve"              && <ResolvePanel result={result} preflight={preflight} prov={prov} />}
      {stage === "validate"             && <ValidationTab errors={result.errors ?? []} warnings={result.warnings ?? []} prov={prov} />}
      {stage === "inheritance"          && <InspectorTab result={result} preflight={preflight} prov={prov} />}
      {stage === "prompt-assembly"      && <PromptSectionsTab sections={result.compiled_sections ?? []} fullPrompt={result.compiled_prompt ?? ""} promptHash={result.prompt_hash} isLegacy={isLegacy} bibleFetchWarning={(result.warnings ?? []).find(w => w.code === "WORLD_BIBLE_FETCH_ERROR")} />}
      {stage === "hash-generation"      && <TechnicalTab result={result} />}
      {stage === "ready-for-spec-board" && <ReadinessPanel result={result} preflight={preflight} prov={prov} />}
      {stage === "specification-review" && (
        boardSuccess && previewResult
          ? <SpecificationReviewPanel previewResult={previewResult} prov={prov} onGenerateNew={onGenerateNewBoard} isGenerating={isGeneratingBoard} onRetryStatus={onRetryStatus} isRetryingStatus={isRetryingStatus} />
          : <FuturePlaceholderPanel stage="specification-review" />
      )}
      {PLACEHOLDER_STAGES.includes(stage) && <FuturePlaceholderPanel stage={stage} />}
    </div>
  );
}

// ── History Tab ────────────────────────────────────────────────────────────────

function HistoryTab({ result }: { result: CompileResponse }) {
  const runsQuery = useQuery({
    queryKey: ["workspace-history", result.production_spec_id],
    queryFn:  () => worldsmithApi.listRuns(result.production_spec_id, "all"),
    staleTime: 30_000,
  });

  const sections = [
    {
      title: "Compile History",
      content: (
        <div className="space-y-2">
          {runsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />Loading runs…
            </div>
          )}
          {runsQuery.isError && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              <XCircle className="w-4 h-4 shrink-0" />
              {(runsQuery.error as Error)?.message}
              <Button size="sm" variant="outline" className="ml-auto border-red-300 text-red-700 h-7" onClick={() => runsQuery.refetch()}>
                <RefreshCw className="w-3 h-3" />
              </Button>
            </div>
          )}
          {!runsQuery.isLoading && !runsQuery.isError && (runsQuery.data?.runs ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No previous runs.</p>
          )}
          {(runsQuery.data?.runs ?? []).map(run => <RunRow key={run.run_id} run={run} />)}
        </div>
      ),
    },
    {
      title: "Specification Board History",
      content: (
        <div className="p-4 rounded-lg border border-dashed border-muted/60 text-center">
          <ImagePlus className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Board history will appear here once boards have been generated.</p>
        </div>
      ),
    },
    {
      title: "Artwork History",
      content: (
        <div className="p-4 rounded-lg border border-dashed border-muted/60 text-center">
          <p className="text-sm text-muted-foreground/50 italic">Not yet reached — artwork generation follows specification review.</p>
        </div>
      ),
    },
    {
      title: "QA History",
      content: (
        <div className="p-4 rounded-lg border border-dashed border-muted/60 text-center">
          <p className="text-sm text-muted-foreground/50 italic">Not yet reached.</p>
        </div>
      ),
    },
    {
      title: "Publishing History",
      content: (
        <div className="p-4 rounded-lg border border-dashed border-muted/60 text-center">
          <p className="text-sm text-muted-foreground/50 italic">Not yet reached.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {sections.map(s => (
        <div key={s.title}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">{s.title}</h3>
          {s.content}
        </div>
      ))}
    </div>
  );
}

// ── Readiness score ───────────────────────────────────────────────────────────

function calcReadiness(
  result: CompileResponse,
  prov: ProvenanceRecord | null,
  preflight: PreflightResponse | null,
): number {
  // Weighted checklist — total weight = 100
  const items: Array<{ ok: boolean; weight: number }> = [
    { ok: true,                                                                                    weight: 15 }, // Production Specification — always present after compile
    { ok: !!(prov?.component_specification ?? preflight?.component_specification),                 weight: 15 }, // Component Specification
    { ok: !!result.prompt_hash,                                                                    weight: 12 }, // Prompt Hash
    { ok: true,                                                                                    weight: 12 }, // Prompt Payload — must exist to compile
    { ok: !!prov?.component_type,                                                                  weight: 11 }, // Print Specification
    { ok: !!prov?.style_guide,                                                                     weight: 12 }, // Style Guide
    { ok: (prov?.prompt_modules.length ?? preflight?.prompt_module_count ?? 0) > 0,               weight:  9 }, // Prompt Modules
    { ok: (prov?.canon_records.length  ?? preflight?.canon_record_count  ?? 0) > 0,               weight:  8 }, // Canon
    { ok: prov?.payload_format !== "legacy",                                                       weight:  6 }, // PP-2.0 contract
  ];
  const total  = items.reduce((s, i) => s + i.weight, 0);
  const earned = items.reduce((s, i) => s + (i.ok ? i.weight : 0), 0);
  return Math.round((earned / total) * 100);
}

// Derives a short abbreviation from a component type string, e.g. "Journal Card" → "JC"
function componentAbbr(componentType: string | null | undefined): string {
  if (!componentType) return "";
  return componentType
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

function StatusOverviewCard({
  result, preflight, prov, onReset, setActiveStage, activeStage, previewResult,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
  onReset: () => void;
  setActiveStage: (s: PipelineStageKey) => void;
  activeStage: PipelineStageKey;
  previewResult?: SpecPreviewResult | null;
}) {
  const specTitle   = prov?.production_spec_title ?? preflight?.production_specification ?? "Production Specification";
  const compType    = prov?.component_type ?? preflight?.component_type;
  const abbr        = componentAbbr(compType);
  const specUrl     = notionUrl(prov?.production_spec_notion_id);
  const readiness   = calcReadiness(result, prov, preflight);
  const errCount    = (result.errors ?? []).length;
  const recCount    = (result.warnings ?? []).filter(w => isRecommendationCode(w.code)).length;
  const warnCount   = (result.warnings ?? []).filter(w => !isRecommendationCode(w.code)).length;
  const isLegacy    = prov?.payload_format === "legacy";
  const boardSuccess = previewResult?.status === "success" || previewResult?.status === "upload_success_status_failed";

  const nextAction  = errCount > 0
    ? "Resolve Validation Errors"
    : boardSuccess
    ? "Open Notion Record"
    : "Generate Specification Board";

  const validationLine =
    errCount > 0
      ? `${errCount} Error${errCount !== 1 ? "s" : ""}${warnCount > 0 ? ` • ${warnCount} Warning${warnCount !== 1 ? "s" : ""}` : ""}${recCount > 0 ? ` • ${recCount} Recommendation${recCount !== 1 ? "s" : ""}` : ""}`
      : warnCount > 0
      ? `0 Errors • ${warnCount} Warning${warnCount !== 1 ? "s" : ""}${recCount > 0 ? ` • ${recCount} Recommendation${recCount !== 1 ? "s" : ""}` : ""}`
      : recCount > 0
      ? `0 Errors • ${recCount} Recommendation${recCount !== 1 ? "s" : ""}`
      : "0 Errors • Passed";

  // progress bar colour
  const barColor = errCount > 0 ? "bg-red-500" : readiness >= 90 ? "bg-emerald-500" : readiness >= 70 ? "bg-amber-400" : "bg-orange-400";
  const readinessLabel = errCount > 0 ? "text-red-600" : readiness >= 90 ? "text-emerald-700" : "text-amber-600";

  return (
    <Card className="border-[#1B2A4A]/20 bg-[#1B2A4A]/[0.02] overflow-hidden">
      {/* Top strip — spec identity */}
      <div className="px-5 pt-4 pb-3 border-b border-[#1B2A4A]/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {abbr && (
                <span className="text-[11px] font-bold text-[#1B2A4A] bg-[#1B2A4A]/10 px-2 py-0.5 rounded font-mono tracking-wide">{abbr}</span>
              )}
              <h2 className="text-base font-semibold text-[#1B2A4A] leading-tight">{specTitle}</h2>
            </div>
            {compType && <p className="text-xs text-muted-foreground mt-0.5">{compType}{isLegacy ? " · PP-1.0 legacy" : " · PP-2.0"}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {specUrl && (
              <a href={specUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            )}
            <Button size="sm" variant="ghost" onClick={onReset} className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1">
              <RefreshCw className="w-3 h-3" />New
            </Button>
          </div>
        </div>
      </div>

      {/* Three stat columns */}
      <div className="grid grid-cols-3 divide-x divide-[#1B2A4A]/10">
        {/* Publishing Stage */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Publishing Stage</p>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#1B2A4A] animate-pulse shrink-0" />
            <p className="text-sm font-semibold text-[#1B2A4A]">
              {activeStage === "specification-review"
                ? "Specification Review"
                : activeStage === "ready-for-artwork" || activeStage === "artwork-generation" || activeStage === "artwork-review"
                ? "Artwork Phase"
                : activeStage === "ready-for-publish" || activeStage === "published"
                ? "Ready for Publish"
                : "Ready for Specification Board"}
            </p>
          </div>
        </div>

        {/* Production Readiness */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Production Readiness</p>
          <div className="flex items-end gap-2">
            <p className={`text-2xl font-bold leading-none ${readinessLabel}`}>{readiness}%</p>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-muted/50 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${readiness}%` }} />
          </div>
        </div>

        {/* Validation */}
        <div className="px-5 py-4">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Validation</p>
          <button
            type="button"
            onClick={() => setActiveStage("validate")}
            className="text-left group"
          >
            {errCount > 0 && (
              <p className="text-sm font-semibold text-red-600 group-hover:underline">
                {errCount} Error{errCount !== 1 ? "s" : ""}
              </p>
            )}
            {warnCount > 0 && (
              <p className="text-sm font-semibold text-amber-600 group-hover:underline">
                {warnCount} Warning{warnCount !== 1 ? "s" : ""}
              </p>
            )}
            {errCount === 0 && warnCount === 0 && (
              <p className="text-sm font-semibold text-emerald-700">0 Errors</p>
            )}
            {recCount > 0 && (
              <p className="text-xs text-blue-600 mt-0.5 group-hover:underline">
                {recCount} Recommendation{recCount !== 1 ? "s" : ""}
              </p>
            )}
            {errCount === 0 && warnCount === 0 && recCount === 0 && (
              <p className="text-xs text-emerald-600">Passed</p>
            )}
          </button>
        </div>
      </div>

      {/* Next Action footer */}
      <div className="px-5 py-3 border-t border-[#1B2A4A]/10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest shrink-0">Next Action</p>
          <p className="text-sm font-semibold text-[#1B2A4A] truncate">{nextAction}</p>
        </div>
        {errCount > 0 ? (
          <Button size="sm" className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white shrink-0 gap-1.5"
            onClick={() => setActiveStage("validate")}>
            <XCircle className="w-3.5 h-3.5" />Review Errors
          </Button>
        ) : boardSuccess && previewResult?.notion_page_url ? (
          <a href={previewResult.notion_page_url} target="_blank" rel="noopener noreferrer">
            <Button size="sm" className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white shrink-0 gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />Open Notion Record
            </Button>
          </a>
        ) : (
          <Button size="sm" className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white shrink-0 gap-1.5"
            onClick={() => document.getElementById("spec-preview-card")?.scrollIntoView({ behavior: "smooth" })}>
            <ImagePlus className="w-3.5 h-3.5" />Generate
          </Button>
        )}
      </div>
    </Card>
  );
}
// ── Sticky Publishing Header ──────────────────────────────────────────────────

function StickyPublishingHeader({
  result, preflight, prov, onReset, setActiveStage, previewResult, inspectorStage,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
  onReset: () => void;
  setActiveStage: (s: PipelineStageKey) => void;
  previewResult?: SpecPreviewResult | null;
  inspectorStage?: PipelineStageKey;
}) {
  const [stuck, setStuck] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const specTitle  = prov?.production_spec_title ?? preflight?.production_specification ?? "Production Specification";
  const compType   = prov?.component_type ?? preflight?.component_type;
  const abbr       = componentAbbr(compType);
  const world      = prov?.world ?? preflight?.world;
  const collection = prov?.collection;
  const volume     = prov?.volume ?? preflight?.volume;
  const specUrl    = notionUrl(prov?.production_spec_notion_id);
  const readiness  = calcReadiness(result, prov, preflight);
  const errCount   = (result.errors ?? []).length;
  const recCount   = (result.warnings ?? []).filter(w => isRecommendationCode(w.code)).length;
  const warnCount  = (result.warnings ?? []).filter(w => !isRecommendationCode(w.code)).length;
  const isLegacy   = prov?.payload_format === "legacy";

  const barColor       = errCount > 0 ? "bg-red-500" : readiness >= 90 ? "bg-emerald-500" : readiness >= 70 ? "bg-amber-400" : "bg-orange-400";
  const readinessColor = errCount > 0 ? "text-red-600" : readiness >= 90 ? "text-emerald-700" : "text-amber-600";
  const boardSuccess   = previewResult?.status === "success" || previewResult?.status === "upload_success_status_failed";
  const stageLabel     = errCount > 0
    ? "Errors — Review Required"
    : boardSuccess
    ? "Specification Review"
    : "Ready for Specification Board";

  const breadcrumb = [world, collection, volume, compType].filter(Boolean) as string[];

  function handlePrimaryClick() {
    if (errCount > 0) setActiveStage("validate");
    else if (boardSuccess && previewResult?.notion_page_url) window.open(previewResult.notion_page_url, "_blank");
    else document.getElementById("spec-preview-card")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <>
      {/* sentinel — when this leaves viewport the header "sticks" */}
      <div ref={sentinelRef} className="h-px w-full" aria-hidden />

      <div className={`sticky top-0 z-10 transition-shadow duration-200 ${stuck ? "shadow-lg" : ""}`}>

        {/* ── Compact strip (visible only when stuck / scrolled) ── */}
        {stuck && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-background/95 backdrop-blur-sm border-b border-[#1B2A4A]/15">
            {abbr && (
              <span className="text-[10px] font-bold text-[#1B2A4A] bg-[#1B2A4A]/10 px-1.5 py-0.5 rounded font-mono shrink-0">{abbr}</span>
            )}
            <p className="text-sm font-semibold text-[#1B2A4A] truncate flex-1 min-w-0">{specTitle}</p>
            <div className="flex items-center gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${errCount > 0 ? "bg-red-500" : "bg-emerald-500"}`} />
                <span className="text-xs text-muted-foreground font-medium">{stageLabel}</span>
              </div>
              <span className={`text-xs font-bold tabular-nums ${readinessColor}`}>{readiness}%</span>
              {errCount > 0 && <span className="text-xs font-semibold text-red-600">{errCount} Error{errCount !== 1 ? "s" : ""}</span>}
              {errCount === 0 && warnCount > 0 && <span className="text-xs font-semibold text-amber-600">{warnCount}W</span>}
              {errCount === 0 && recCount > 0  && <span className="text-xs text-blue-600">{recCount}R</span>}
              <Button size="sm"
                className={`h-7 gap-1 text-xs shrink-0 ${errCount > 0 ? "bg-red-600 hover:bg-red-700 text-white" : "bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white"}`}
                onClick={handlePrimaryClick}>
                {errCount > 0 ? <><XCircle className="w-3 h-3" />Review</> : boardSuccess ? <><ExternalLink className="w-3 h-3" />Open Notion</> : <><ImagePlus className="w-3 h-3" />Generate</>}
              </Button>
            </div>
          </div>
        )}

        {/* ── Compact full card (visible when at top of page) ── */}
        {!stuck && (
          <Card className="border-[#1B2A4A]/20 overflow-hidden">
            {/* Row 1 — Identity */}
            <div className="px-4 pt-2.5 pb-2 border-b border-[#1B2A4A]/10 flex items-center gap-2">
              <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
                {abbr && (
                  <span className="text-[10px] font-bold text-[#1B2A4A] bg-[#1B2A4A]/10 px-1.5 py-0.5 rounded font-mono tracking-wide shrink-0">{abbr}</span>
                )}
                <h2 className="text-sm font-semibold text-[#1B2A4A]">{specTitle}</h2>
                {isLegacy && (
                  <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-semibold shrink-0">PP-1.0</span>
                )}
                {breadcrumb.map((crumb, i) => (
                  <span key={crumb} className="hidden sm:flex items-center gap-1.5">
                    <span className="text-[#1B2A4A]/20 text-[10px]">·</span>
                    <span className="text-[11px] text-[#1B2A4A]/50 font-medium">{crumb}</span>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {specUrl && (
                  <a href={specUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  </a>
                )}
                <Button size="sm" variant="ghost" onClick={onReset} className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1">
                  <RefreshCw className="w-2.5 h-2.5" />New
                </Button>
              </div>
            </div>
            {/* Row 2 — Stage · Readiness · Validation · CTA */}
            <div className="px-4 py-2 flex items-center gap-3 flex-wrap bg-[#1B2A4A]/[0.015]">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${errCount > 0 ? "bg-red-500" : "bg-[#1B2A4A] animate-pulse"}`} />
                <span className="text-xs font-semibold text-[#1B2A4A]">{stageLabel}</span>
              </div>
              <span className="text-[#1B2A4A]/15 hidden sm:inline">|</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-xs font-bold tabular-nums ${readinessColor}`}>{readiness}%</span>
                <div className="w-16 h-1 rounded-full bg-muted/60 overflow-hidden hidden sm:block">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${readiness}%` }} />
                </div>
              </div>
              <span className="text-[#1B2A4A]/15 hidden sm:inline">|</span>
              <button type="button" onClick={() => setActiveStage("validate")} className="flex items-center gap-2 text-xs group shrink-0">
                {errCount === 0
                  ? <span className="text-emerald-700 font-medium">0 Errors</span>
                  : <span className="text-red-600 font-semibold group-hover:underline">{errCount} Error{errCount !== 1 ? "s" : ""}</span>
                }
                {warnCount > 0 && <span className="text-amber-600 group-hover:underline">· {warnCount}W</span>}
                {recCount > 0  && <span className="text-blue-600 group-hover:underline">· {recCount}R</span>}
              </button>
              <Button size="sm"
                className={`ml-auto gap-1.5 h-7 shrink-0 ${errCount > 0 ? "bg-red-600 hover:bg-red-700 text-white" : "bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white"}`}
                onClick={handlePrimaryClick}>
                {errCount > 0
                  ? <><XCircle className="w-3 h-3" />Review Errors</>
                  : boardSuccess
                  ? <><ExternalLink className="w-3 h-3" />Open Notion</>
                  : <><ImagePlus className="w-3 h-3" />Generate</>
                }
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

// ── Action Center ─────────────────────────────────────────────────────────────

function ActionCenter({
  result, prov, setActiveStage, previewResult, onReset, onGenerateNewBoard, isGeneratingBoard,
}: {
  result: CompileResponse;
  prov: ProvenanceRecord | null;
  setActiveStage: (s: PipelineStageKey) => void;
  previewResult?: SpecPreviewResult | null;
  onReset?: () => void;
  onGenerateNewBoard?: () => void;
  isGeneratingBoard?: boolean;
}) {
  const errCount    = (result.errors ?? []).length;
  const warnCount   = (result.warnings ?? []).filter(w => !isRecommendationCode(w.code)).length;
  const boardSuccess = previewResult?.status === "success" || previewResult?.status === "upload_success_status_failed";

  type SecAction = { label: string; href?: string; onClick?: () => void; icon: React.ReactNode; disabled?: boolean };

  // ── Primary action ──────────────────────────────────────────────────────────
  let primaryLabel: string;
  let primaryIcon: React.ReactNode;
  let primaryDanger = false;
  let primaryHref: string | undefined;
  let handlePrimary: (() => void) | undefined;

  if (errCount > 0) {
    primaryLabel  = "Resolve Validation Errors";
    primaryIcon   = <XCircle className="w-4 h-4" />;
    primaryDanger = true;
    handlePrimary = () => setActiveStage("validate");
  } else if (boardSuccess && previewResult?.notion_page_url) {
    primaryLabel = "Open Notion Record";
    primaryIcon  = <ExternalLink className="w-4 h-4" />;
    primaryHref  = previewResult.notion_page_url;
  } else {
    primaryLabel  = "Generate Specification Board";
    primaryIcon   = <ImagePlus className="w-4 h-4" />;
    handlePrimary = () => document.getElementById("spec-preview-card")?.scrollIntoView({ behavior: "smooth" });
  }

  // ── Secondary actions ───────────────────────────────────────────────────────
  let secondary: (SecAction | null)[];

  if (errCount > 0) {
    secondary = [
      prov?.prompt_payload_notion_id  ? { label: "Open Prompt Payload",      icon: <ExternalLink className="w-3 h-3" />, href: notionUrl(prov.prompt_payload_notion_id) }  : null,
      prov?.component_spec_notion_id  ? { label: "Component Specification",  icon: <ExternalLink className="w-3 h-3" />, href: notionUrl(prov.component_spec_notion_id) }  : null,
      prov?.production_spec_notion_id ? { label: "Production Specification", icon: <ExternalLink className="w-3 h-3" />, href: notionUrl(prov.production_spec_notion_id) } : null,
    ];
  } else if (boardSuccess) {
    secondary = [
      { label: "Generate New Board", icon: <ImagePlus className="w-3 h-3" />, onClick: onGenerateNewBoard, disabled: isGeneratingBoard },
      prov?.production_spec_notion_id ? { label: "Production Specification", icon: <ExternalLink className="w-3 h-3" />, href: notionUrl(prov.production_spec_notion_id) } : null,
      warnCount > 0 ? { label: "Review Validation", icon: <AlertTriangle className="w-3 h-3" />, onClick: () => setActiveStage("validate") } : null,
      { label: "Inspect Records",  icon: <GitBranch className="w-3 h-3" />, onClick: () => setActiveStage("resolve") },
      { label: "Return to Engine", icon: <RotateCcw className="w-3 h-3" />, onClick: onReset },
    ];
  } else {
    secondary = [
      prov?.production_spec_notion_id ? { label: "Production Specification", icon: <ExternalLink className="w-3 h-3" />, href: notionUrl(prov.production_spec_notion_id) } : null,
      prov?.component_spec_notion_id  ? { label: "Component Specification",  icon: <ExternalLink className="w-3 h-3" />, href: notionUrl(prov.component_spec_notion_id) }  : null,
      warnCount > 0                   ? { label: "Review Validation",        icon: <AlertTriangle className="w-3 h-3" />, onClick: () => setActiveStage("validate") }       : null,
      { label: "Inspect Records",   icon: <GitBranch className="w-3 h-3" />, onClick: () => setActiveStage("resolve") },
      { label: "Prompt Assembly",   icon: <Layers    className="w-3 h-3" />, onClick: () => setActiveStage("prompt-assembly") },
      { label: "Technical Details", icon: <Hash      className="w-3 h-3" />, onClick: () => setActiveStage("hash-generation") },
    ];
  }
  const secondaryFiltered = secondary.filter(Boolean) as SecAction[];

  const primaryCls = `w-full h-11 gap-2 text-sm font-semibold transition-colors ${primaryDanger ? "bg-red-600 hover:bg-red-700 text-white" : "bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white"}`;

  return (
    <div className="space-y-2">
      {/* Primary — one large, prominent button or link */}
      {primaryHref
        ? <a href={primaryHref} target="_blank" rel="noopener noreferrer" className="block">
            <Button className={primaryCls}>{primaryIcon}{primaryLabel}</Button>
          </a>
        : <Button className={primaryCls} onClick={handlePrimary}>
            {primaryIcon}{primaryLabel}
          </Button>
      }

      {/* Secondary — smaller, supporting actions */}
      {secondaryFiltered.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {secondaryFiltered.map((a, i) =>
            a.href
              ? <a key={i} href={a.href} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-medium">{a.icon}{a.label}</Button>
                </a>
              : <Button key={i} size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-medium" onClick={a.onClick} disabled={a.disabled}>
                  {a.icon}{a.label}
                </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Production Readiness Panel (Ready for Specification Board stage) ───────────

function ReadinessPanel({
  result, preflight, prov,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
}) {
  const { toast } = useToast();
  const artifactId  = prov?.run_id ?? result.run_id ?? "—";
  const promptHash  = result.prompt_hash ?? "—";
  const errCount    = (result.errors ?? []).length;
  const errors      = result.errors ?? [];
  const realWarnings = (result.warnings ?? []).filter(w => !isRecommendationCode(w.code));
  const recs         = (result.warnings ?? []).filter(w => isRecommendationCode(w.code));
  const isLegacy    = prov?.payload_format === "legacy";
  const moduleCount = prov?.prompt_modules.length ?? preflight?.prompt_module_count ?? 0;
  const canonCount  = prov?.canon_records.length  ?? preflight?.canon_record_count  ?? 0;

  const checklist: Array<{ label: string; ok: boolean; note: string; notionId?: string }> = [
    { label: "Production Specification", ok: true,                                              note: prov?.production_spec_title ?? preflight?.production_specification ?? "Resolved",                   notionId: prov?.production_spec_notion_id },
    { label: "Component Specification",  ok: !!(prov?.component_specification ?? preflight?.component_specification), note: prov?.component_specification ?? preflight?.component_specification ?? "Not linked", notionId: prov?.component_spec_notion_id },
    { label: "Style Guide",              ok: !!prov?.style_guide,                               note: prov?.style_guide ?? "Not linked",                                                                  notionId: prov?.style_guide_notion_id },
    { label: "Prompt Modules",           ok: moduleCount > 0,                                   note: moduleCount > 0 ? `${moduleCount} linked` : "None linked" },
    { label: "Prompt Payload",           ok: true,                                              note: prov?.payload_version ?? result.payload_version ?? "Present",                                       notionId: prov?.prompt_payload_notion_id },
    { label: "Canon",                    ok: canonCount > 0,                                    note: canonCount > 0 ? `${canonCount} records` : "No canon records" },
    { label: "Print Specification",      ok: !!prov?.component_type,                           note: prov?.component_type ?? "Not resolved" },
    { label: "Compiled Artifact",        ok: !!result.prompt_hash,                             note: result.prompt_hash ? `${result.prompt_hash.slice(0, 16)}…` : "Not generated" },
    { label: "Payload Contract",         ok: !isLegacy,                                        note: isLegacy ? "Legacy PP-1.0" : "PP-2.0 ✓" },
  ];

  // Publishing Progress — 11 stages
  const progressStages: Array<{ label: string; done: boolean; current?: boolean; blocked?: boolean }> = [
    { label: "Resolved",                      done: true },
    { label: "Validated",                     done: errCount === 0 },
    { label: "Inherited",                     done: !!prov },
    { label: "Compiled",                      done: !!result.prompt_hash },
    { label: "Ready for Specification Board", done: errCount === 0, current: errCount === 0 },
    { label: "Awaiting Specification Review", done: false },
    { label: "Ready for Artwork",             done: false },
    { label: "Artwork Generation",            done: false },
    { label: "Artwork QA",                    done: false },
    { label: "Ready to Publish",              done: false },
    { label: "Published",                     done: false },
  ];

  function copy(val: string, label: string) {
    navigator.clipboard.writeText(val);
    toast({ title: `${label} copied` });
  }

  return (
    <div className="space-y-4">

      {/* ── 1. Production Summary — three groups ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Production Summary</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-6">

          {/* Identity */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Identity</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {([
                { label: "Production Specification", value: prov?.production_spec_title ?? preflight?.production_specification, notionId: undefined as string | undefined },
                { label: "World",                    value: prov?.world ?? preflight?.world,        notionId: undefined as string | undefined },
                { label: "Collection",               value: prov?.collection ?? "—",                notionId: prov?.collection ? prov?.collection_notion_id : undefined },
                { label: "Volume",                   value: prov?.volume ?? preflight?.volume ?? "—", notionId: undefined as string | undefined },
                { label: "Component Set",            value: prov?.component_set ?? "—",             notionId: undefined as string | undefined },
              ]).map(({ label, value, notionId }) => {
                const url = notionUrl(notionId);
                return (
                  <div key={label}>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">
                      {label}
                      {label === "Collection" && <span className="ml-1 text-[10px] text-muted-foreground/60 normal-case tracking-normal">(at compile time)</span>}
                    </p>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium truncate flex items-center gap-1 hover:underline" title={value ?? "—"}>
                        {value || "—"}<ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                      </a>
                    ) : (
                      <p className="text-sm font-medium truncate" title={value ?? "—"}>{value || "—"}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Compilation */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Compilation</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 mb-4">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Compilation Time</p>
                <p className="text-sm font-medium">{fmtTs(prov?.compilation_timestamp)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Compiler Version</p>
                <p className="text-sm font-medium font-mono">{prov?.compiler_version ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Payload Format</p>
                <p className="text-sm font-medium">{isLegacy ? "PP-1.0 (Legacy)" : "PP-2.0 (Structured)"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Prompt Length</p>
                <p className="text-sm font-medium">
                  {result.compiled_prompt ? `${result.compiled_prompt.length.toLocaleString()} chars` : "—"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: "Compiled Artifact ID", value: artifactId },
                { label: "Prompt Hash",           value: promptHash },
              ] as Array<{label:string;value:string}>).map(({ label, value }) => (
                <div key={label} className="flex items-start gap-2 p-3 rounded-md border border-[#1B2A4A]/20 bg-[#1B2A4A]/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
                    <code className="text-xs font-mono break-all">{value}</code>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0 hover:bg-[#1B2A4A]/10"
                    onClick={() => copy(value, label)}>
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Current State */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Current State</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Publishing Stage</p>
                <p className="text-sm font-medium">
                  {errCount > 0 ? <span className="text-red-600">Errors — Review Required</span> : "Ready for Specification Board"}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Payload Format</p>
                <p className="text-sm font-medium">{isLegacy ? "PP-1.0 Legacy" : "PP-2.0"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Validation</p>
                <p className="text-sm font-medium">
                  {errCount > 0
                    ? <span className="text-red-600">{errCount} Error{errCount !== 1 ? "s" : ""}</span>
                    : <span className="text-emerald-600">Passed</span>}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Next Action</p>
                <p className="text-sm font-medium">
                  {errCount > 0 ? "Resolve Errors" : "Generate Specification Board"}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Readiness Checklist + Publishing Progress ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1B2A4A]" />
            Production Readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Checklist */}
          <div className="space-y-2.5">
            {checklist.map(({ label, ok, note, notionId }) => {
              const url = notionUrl(notionId);
              return (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? "bg-emerald-100" : "bg-gray-100"}`}>
                    {ok ? <CheckCircle2 className="w-3 h-3 text-emerald-600" /> : <Info className="w-3 h-3 text-gray-400" />}
                  </div>
                  <span className="font-medium flex-1">{label}</span>
                  <span className={`text-xs ${ok ? "text-muted-foreground" : "text-amber-600 font-medium"}`}>{note}</span>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>

          {/* Publishing Progress */}
          <div className="mt-6 pt-5 border-t border-border">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Publishing Progress</p>
            <div className="space-y-0">
              {progressStages.map(({ label, done, current }, i) => (
                <div key={label} className="flex items-start gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center z-10
                      ${done
                        ? "bg-emerald-500"
                        : current
                        ? "bg-[#1B2A4A] ring-2 ring-[#1B2A4A]/25 ring-offset-2"
                        : "bg-background border-2 border-muted-foreground/20"}`}>
                      {done
                        ? <CheckCircle2 className="w-3 h-3 text-white" />
                        : current
                        ? <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        : null}
                    </div>
                    {i < progressStages.length - 1 && (
                      <div className={`w-0.5 h-5 ${done ? "bg-emerald-300" : "bg-muted-foreground/15"}`} />
                    )}
                  </div>
                  <p className={`text-sm pb-3 leading-tight pt-0.5
                    ${done    ? "text-emerald-700 font-medium"
                    : current ? "text-[#1B2A4A] font-semibold"
                    : "text-muted-foreground/70"}`}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Issues — Blocking / Warnings / Recommendations (only if any exist) ── */}
      {(errors.length > 0 || realWarnings.length > 0 || recs.length > 0) && (
        <Card className="border-[#1B2A4A]/15">
          <CardContent className="pt-5 space-y-5">
            {errors.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest mb-2.5">Blocking Issues</p>
                <div className="space-y-2">
                  {errors.map((e, i) => (
                    <div key={i} className="rounded-md p-3 text-xs space-y-1 bg-red-50 border border-red-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono font-medium text-red-700">{e.code}</code>
                        <span className="text-muted-foreground">· {e.field}</span>
                      </div>
                      <p className="text-red-900">{e.message}</p>
                      <p className="font-medium text-red-700">→ {e.recommended_action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {realWarnings.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-2.5">Warnings</p>
                <div className="space-y-2">
                  {realWarnings.map((w, i) => (
                    <div key={i} className="rounded-md p-3 text-xs space-y-1 bg-amber-50 border border-amber-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono font-medium text-amber-700">{w.code}</code>
                        <span className="text-muted-foreground">· {w.field}</span>
                      </div>
                      <p className="text-amber-900">{w.message}</p>
                      <p className="font-medium text-amber-700">→ {w.recommended_action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recs.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-2.5">Recommendations</p>
                <p className="text-xs text-muted-foreground mb-3">These do not prevent Specification Board generation.</p>
                <div className="space-y-2">
                  {recs.map((r, i) => (
                    <div key={i} className="rounded-md p-3 text-xs space-y-1 bg-blue-50 border border-blue-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="font-mono font-medium text-blue-700">{r.code}</code>
                        <span className="text-muted-foreground">· {r.field}</span>
                      </div>
                      <p className="text-blue-900">{r.message}</p>
                      <p className="font-medium text-blue-700">→ {r.recommended_action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 4. Recommendations Rich Panel (PP-1.0 upgrade coaching) ── */}
      {isLegacy && <RecommendationsRichPanel />}

      {/* ── 5. Compilation Timeline ── */}
      <CompilationTimeline prov={prov} result={result} />

      {/* ── 6. Cost Estimate ── */}
      <CostEstimateCard prov={prov} />

    </div>
  );
}

// ── Recommendations Rich Panel ─────────────────────────────────────────────────

function RecommendationsRichPanel() {
  return (
    <Card className="border-blue-200/60 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm text-blue-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-500" />
              Upgrade Available
            </CardTitle>
            <p className="text-xs text-blue-700/80 mt-1">Migrate to PP-2.0 for structured prompt sections and future publishing support.</p>
          </div>
          <Badge variant="outline" className="text-blue-600 border-blue-200 bg-white shrink-0 text-[10px]">Optional</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-md bg-white border border-blue-100">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Current</p>
            <p className="text-sm font-semibold text-amber-700">PP-1.0 Legacy</p>
            <p className="text-xs text-muted-foreground mt-0.5">Flat key-value format</p>
          </div>
          <div className="p-3 rounded-md bg-white border border-blue-200">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Recommended</p>
            <p className="text-sm font-semibold text-blue-700">PP-2.0 Structured</p>
            <p className="text-xs text-muted-foreground mt-0.5">Section-based format</p>
          </div>
        </div>
        <div className="mb-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Benefits</p>
          <div className="space-y-1">
            {[
              "Structured prompt sections (shared / front / back / assembly)",
              "Front and back artwork support",
              "Construction assembly prompts",
              "Future-proof publishing workflow",
            ].map(benefit => (
              <div key={benefit} className="flex items-center gap-2 text-xs text-blue-900">
                <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                {benefit}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-blue-700">Estimated effort:</span> Under two minutes
          </p>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-100">
            <ArrowUpRight className="w-3 h-3" />Upgrade Payload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Compilation Timeline ───────────────────────────────────────────────────────

// ── World Bible Summary Card ──────────────────────────────────────────────────
// Shown whenever compiled_sections contains sections sourced from "World Bible".
// Lets operators trace which aesthetic identity shaped the output.

const BIBLE_FIELD_ORDER: Array<{ key: string; label: string }> = [
  { key: "visual_palette",    label: "Visual Palette" },
  { key: "prose_voice",       label: "Prose Voice" },
  { key: "atmospheric_notes", label: "Atmospheric Notes" },
  { key: "material_world",    label: "Material World" },
];

function WorldBibleCard({ sections }: { sections: CompiledSectionRecord[] }) {
  const bibleSections = sections.filter((s) => s.source === "World Bible");
  if (bibleSections.length === 0) return null;

  const byKey = Object.fromEntries(bibleSections.map((s) => [s.key, s]));
  const worldRules = byKey["world_rules"]?.content
    ?.split("\n")
    .map((r) => r.trim())
    .filter(Boolean) ?? [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#C87560]" />
          World Bible
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Aesthetic identity captured at compile time — these values shaped every section of this prompt.
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Four aesthetic fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {BIBLE_FIELD_ORDER.map(({ key, label }) => {
            const sec = byKey[key];
            if (!sec?.content?.trim()) return null;
            return (
              <div key={key} className="rounded-md border border-[#1B2A4A]/10 bg-[#1B2A4A]/[0.02] px-3 py-2.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  {label}
                </p>
                <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{sec.content.trim()}</p>
              </div>
            );
          })}
        </div>

        {/* World Rules — numbered list */}
        {worldRules.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
              World Rules
            </p>
            <ol className="space-y-1.5">
              {worldRules.map((rule, i) => (
                <li key={i} className="flex gap-2.5 text-xs">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-[#1B2A4A]/10 text-[#1B2A4A] font-bold
                                   flex items-center justify-center text-[9px] leading-none mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-foreground leading-relaxed">{rule}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CompilationTimeline({ prov, result }: { prov: ProvenanceRecord | null; result: CompileResponse }) {
  const ts = prov?.compilation_timestamp;
  const fmtTime = (iso: string | undefined) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };
  const t = fmtTime(ts);

  const stages: Array<{ time: string; label: string; done: boolean }> = [
    { time: t, label: "Resolved",              done: true },
    { time: t, label: "Validated",             done: (result.errors ?? []).length === 0 },
    { time: t, label: "Inherited",             done: !!prov },
    { time: t, label: "Compiled",              done: !!result.prompt_hash },
    { time: t, label: "Prompt Hash Generated", done: !!result.prompt_hash },
    { time: "—", label: "Specification Board",   done: false },
    { time: "—", label: "Artwork",               done: false },
    { time: "—", label: "QA",                   done: false },
    { time: "—", label: "Publish",              done: false },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          Compilation Timeline
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-0">
          {stages.map(({ time, label, done }, i) => (
            <div key={label} className="flex items-start gap-3">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0
                  ${done ? "bg-emerald-500" : "bg-muted-foreground/25"}`} />
                {i < stages.length - 1 && (
                  <div className={`w-px h-5 ${done ? "bg-emerald-200" : "bg-muted-foreground/15"}`} />
                )}
              </div>
              <div className="flex items-baseline gap-2 pb-3">
                <span className={`text-[11px] font-mono w-14 shrink-0 ${done ? "text-[#1B2A4A]/60" : "text-muted-foreground/40"}`}>{time}</span>
                <span className={`text-sm ${done ? "text-foreground" : "text-muted-foreground/50"}`}>{label}</span>
                {!done && time === "—" && (
                  <span className="text-[10px] text-muted-foreground/50 font-medium uppercase tracking-wide">Pending</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Cost Estimate Card ─────────────────────────────────────────────────────────

function CostEstimateCard({ prov }: { prov: ProvenanceRecord | null }) {
  const cost = resolveCostEstimate(prov as ExplicitCostProvenance | null);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-muted-foreground" />
          Projected Publishing Cost
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Provider: {cost.providerLabel}{cost.modelLabel ? ` · ${cost.modelLabel}` : ""}
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {cost.lineItems.length > 0 ? (
          <>
            <div className="space-y-2">
              {cost.lineItems.map(({ stage, amountUsd, note }) => (
                <div key={stage} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{stage}</span>
                  <div className="flex items-center gap-3">
                    {note && <span className="text-xs text-muted-foreground/60">{note}</span>}
                    <span className="font-mono font-semibold tabular-nums text-right">${amountUsd.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Projected Total</p>
              <p className="font-mono font-bold text-sm tabular-nums text-[#1B2A4A]">${cost.totalUsd!.toFixed(2)}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{cost.message}</p>
        )}
        {cost.lineItems.length > 0 && cost.message && (
          <p className="text-xs text-muted-foreground mt-3">{cost.message}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Resolve Panel (all resolved records) ──────────────────────────────────────

function ResolvePanel({
  result, preflight, prov,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
}) {
  const moduleCount = prov?.prompt_modules.length ?? preflight?.prompt_module_count ?? 0;
  const canonCount  = prov?.canon_records.length ?? preflight?.canon_record_count ?? 0;

  const records: Array<{ label: string; value: string | null | undefined; resolved: boolean; notionId?: string; detail?: string }> = [
    { label: "Production Specification", value: prov?.production_spec_title ?? preflight?.production_specification, resolved: true,               notionId: prov?.production_spec_notion_id },
    { label: "World",                    value: prov?.world ?? preflight?.world,                                    resolved: !!(prov?.world ?? preflight?.world) },
    { label: "Collection",               value: prov?.collection ?? "—",                                            resolved: !!prov?.collection,  notionId: prov?.collection ? prov?.collection_notion_id : undefined, detail: prov?.collection ? "Name captured at compile time — open the Notion link to verify it hasn't been renamed." : undefined },
    { label: "Volume",                   value: prov?.volume ?? preflight?.volume ?? "—",                           resolved: !!(prov?.volume ?? preflight?.volume) },
    { label: "Component Set",            value: prov?.component_set ?? "—",                                         resolved: !!prov?.component_set },
    { label: "Component Specification",  value: prov?.component_specification ?? preflight?.component_specification, resolved: !!(prov?.component_specification ?? preflight?.component_specification), notionId: prov?.component_spec_notion_id },
    { label: "Style Guide",              value: prov?.style_guide ?? "Not linked",                                  resolved: !!prov?.style_guide, notionId: prov?.style_guide_notion_id },
    { label: "Prompt Modules",           value: moduleCount > 0 ? `${moduleCount} module${moduleCount !== 1 ? "s" : ""} loaded` : "None linked",  resolved: moduleCount > 0, detail: prov?.prompt_modules.join(", ") },
    { label: "Prompt Payload",           value: prov?.payload_version ?? result.payload_version,                    resolved: true,               notionId: prov?.prompt_payload_notion_id, detail: prov?.prompt_payload_type === "linked" ? "Linked record" : "Inline (from Production Spec)" },
    { label: "Canon",                    value: canonCount > 0 ? `${canonCount} record${canonCount !== 1 ? "s" : ""}` : "No canon records",       resolved: canonCount > 0, detail: prov?.canon_records.join(", ") },
    { label: "Print Specification",      value: prov?.component_type ?? "Not resolved",                             resolved: !!prov?.component_type },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Resolved Records
        </CardTitle>
        <p className="text-xs text-muted-foreground">All records resolved from the Notion Production Specification chain.</p>
      </CardHeader>
      <CardContent className="pt-0 divide-y divide-border">
        {records.map(({ label, value, resolved, notionId, detail }) => {
          const url = notionUrl(notionId);
          return (
            <div key={label} className="flex items-start gap-3 py-3 text-sm">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${resolved ? "bg-emerald-100" : "bg-gray-100"}`}>
                {resolved
                  ? <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  : <Info className="w-3 h-3 text-gray-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
                <p className={`font-medium mt-0.5 ${!resolved ? "text-muted-foreground" : ""}`}>{value || "—"}</p>
                {detail && <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{detail}</p>}
              </div>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0 mt-0.5">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SpecificationReviewPanel({
  previewResult, prov, onGenerateNew, isGenerating, onRetryStatus, isRetryingStatus,
}: {
  previewResult: SpecPreviewResult;
  prov: ProvenanceRecord | null;
  onGenerateNew?: () => void;
  isGenerating?: boolean;
  onRetryStatus?: () => void;
  isRetryingStatus?: boolean;
}) {
  const { toast } = useToast();
  const uploadPartial = previewResult.status === "upload_success_status_failed";

  return (
    <div className="space-y-4">
      {/* Spec board success banner */}
      <Card className={`overflow-hidden ${uploadPartial ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60"}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${uploadPartial ? "bg-amber-100" : "bg-emerald-100"}`}>
              {uploadPartial
                ? <AlertTriangle className="w-4 h-4 text-amber-600" />
                : <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${uploadPartial ? "text-amber-800" : "text-emerald-800"}`}>
                {uploadPartial ? "Board Uploaded — Status Update Failed" : "Specification Board Generated"}
              </p>
              <p className={`text-xs mt-0.5 ${uploadPartial ? "text-amber-700" : "text-emerald-700"}`}>
                {uploadPartial
                  ? "The board image was uploaded successfully but the Notion status write failed. Use the button below to retry the status update without regenerating the image."
                  : (previewResult.preview_filename ?? "The specification board image has been uploaded to Notion.")}
              </p>
              {previewResult.provider && (
                <p className={`text-[11px] mt-1 ${uploadPartial ? "text-amber-600" : "text-emerald-600"}`}>
                  Provider: {previewResult.provider}{previewResult.model ? ` · ${previewResult.model}` : ""}
                </p>
              )}
            </div>
            {uploadPartial && (
              <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">Partial</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* DALL-E placeholder warning — shown when concept image was not generated */}
      {previewResult.dalle_skipped && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50/40">
          <ImageOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-sm font-semibold text-amber-800">Concept Image Placeholder</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              The specification board was uploaded with a placeholder — the DALL-E concept image was not generated.
              {previewResult.dalle_error
                ? ` Reason: ${previewResult.dalle_error}`
                : " Check that the OPENAI_API_KEY secret is configured."}
            </p>
            <p className="text-xs text-amber-600">
              Click <strong>Generate New Board</strong> to retry — a fresh generation will attempt DALL-E again.
            </p>
          </div>
          {onGenerateNew && (
            <Button
              size="sm"
              variant="outline"
              onClick={onGenerateNew}
              disabled={isGenerating}
              className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 gap-1.5"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
              Retry with Image
            </Button>
          )}
        </div>
      )}

      {/* Retry status update (only when status write previously failed) */}
      {uploadPartial && onRetryStatus && (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50/40">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-semibold text-amber-800">Status Update Pending</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              The Notion page status was not advanced to "Ready for Review". Click below to retry — no new image will be generated.
            </p>
          </div>
          <Button
            size="sm"
            onClick={onRetryStatus}
            disabled={isRetryingStatus}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white h-8 gap-1.5"
          >
            {isRetryingStatus
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Retrying…</>
              : <><RefreshCw className="w-3.5 h-3.5" />Retry Status Update</>}
          </Button>
        </div>
      )}

      {/* Key identifiers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1B2A4A]" />
            Specification Record
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Production Item</p>
              <p className="font-medium truncate" title={previewResult.production_item}>{previewResult.production_item || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Prompt Hash</p>
              <p className="font-mono text-xs truncate" title={previewResult.prompt_hash}>{previewResult.prompt_hash?.slice(0, 20)}…</p>
            </div>
            {previewResult.previous_status && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">Previous Status</p>
                <p className="font-medium">{previewResult.previous_status}</p>
              </div>
            )}
            {previewResult.new_status && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">New Status</p>
                <p className="font-medium text-emerald-700">{previewResult.new_status}</p>
              </div>
            )}
          </div>

          {/* Copy hash */}
          <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Notion Page ID</p>
              <code className="text-xs font-mono break-all">{previewResult.notion_page_id}</code>
            </div>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0"
              onClick={() => { navigator.clipboard.writeText(previewResult.notion_page_id); toast({ title: "Notion page ID copied" }); }}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reviewer instruction */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-[#1B2A4A]/15 bg-[#1B2A4A]/[0.03]">
        <Cpu className="w-4 h-4 text-[#1B2A4A] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#1B2A4A]">Awaiting Human Review</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Open the Notion record to review the generated Specification Board. Once approved, the asset will advance to artwork generation.
          </p>
        </div>
        {previewResult.notion_page_url && (
          <a href={previewResult.notion_page_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <Button size="sm" variant="outline" className="h-7 gap-1.5">
              <ExternalLink className="w-3 h-3" />Open in Notion
            </Button>
          </a>
        )}
      </div>

      {/* Generate new board */}
      {onGenerateNew && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={onGenerateNew} disabled={isGenerating} className="gap-1.5">
            {isGenerating
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
              : <><RefreshCw className="w-3.5 h-3.5" />Regenerate Board</>}
          </Button>
        </div>
      )}
    </div>
  );
}
function FuturePlaceholderPanel({ stage }: { stage: PipelineStageKey }) {
  const labels: Partial<Record<PipelineStageKey, { title: string; description: string }>> = {
    "specification-review": { title: "Specification Review",  description: "A human reviewer opens the generated Specification Board in Notion and approves the compiled prompt before artwork generation begins." },
    "ready-for-artwork":    { title: "Ready for Artwork",     description: "The Specification Board has been approved. The asset is queued for artwork generation once the review gate is cleared." },
    "artwork-generation":   { title: "Artwork Generation",    description: "The approved compiled prompt is submitted to the image provider. The generated artwork is uploaded back to Notion for review." },
    "artwork-review":       { title: "Artwork Review",        description: "A quality reviewer inspects the generated artwork against the Specification Board and approves or rejects it." },
    "ready-for-publish":    { title: "Ready for Publish",     description: "Artwork has passed QA review. The asset is cleared for final publication to the product catalog." },
    "published":            { title: "Published",             description: "The asset has been published to the product catalog and is live for end users." },
  };
  const info = labels[stage];

  return (
    <div className="flex flex-col items-center gap-4 py-12 px-8 rounded-lg border border-dashed border-border text-center">
      <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
        <Clock className="w-5 h-5 text-muted-foreground" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <p className="text-sm font-semibold">{info?.title ?? stage}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{info?.description ?? "This publishing stage is reserved for a future workflow phase."}</p>
      </div>
      <div className="px-3 py-1.5 rounded-full bg-muted/50 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
        Coming Soon
      </div>
    </div>
  );
}

// ── Tab 2: Compilation Inspector (Inheritance Tree) ───────────────────────────

interface InheritanceNode {
  label: string;
  value?: string;
  source?: string;
  status: "ok" | "missing" | "warning";
  notionId?: string;
  preview?: string;
  children?: Array<{ label: string; value?: string; source?: string; notionId?: string; preview?: string }>;
}

function InspectorTab({
  result, preflight, prov,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
}) {
  const sections = result.compiled_sections ?? [];

  const tree: InheritanceNode[] = [
    {
      label: "Production Specification",
      value: prov?.production_spec_title ?? preflight?.production_specification ?? "—",
      source: "Notion",
      status: "ok",
      notionId: prov?.production_spec_notion_id,
    },
    {
      label: "Creative Task",
      source: "Production Specification",
      status: "ok",
      preview: prov ? `Component: ${prov.component_type}${prov.component_set ? ` · Set: ${prov.component_set}` : ""}` : undefined,
    },
    {
      label: "World",
      value: prov?.world ?? "—",
      source: "World record",
      status: prov?.world ? "ok" : "missing",
    },
    ...(prov?.collection ? [{
      label: "Collection",
      value: prov.collection,
      source: "Collection record",
      status: "ok" as const,
      notionId: prov.collection_notion_id,
    }] : []),
    ...(prov?.volume ? [{ label: "Volume", value: prov.volume, source: "Volume record", status: "ok" as const }] : []),
    {
      label: "Style Guide",
      value: prov?.style_guide ?? "Not linked",
      source: prov?.style_guide ? "Notion record" : "None",
      status: prov?.style_guide ? "ok" : "missing",
      notionId: prov?.style_guide_notion_id,
    },
    {
      label: "Component Specification",
      value: prov?.component_specification ?? "Not linked",
      source: prov?.component_specification ? "Notion record" : "None",
      status: prov?.component_specification ? "ok" : "missing",
      notionId: prov?.component_spec_notion_id,
    },
    ...(prov?.component_set ? [{ label: "Component Set", value: prov.component_set, source: "Production Specification", status: "ok" as const }] : []),
    {
      label: "Prompt Modules",
      value: (prov?.prompt_modules.length ?? 0) > 0 ? `${prov!.prompt_modules.length} module${prov!.prompt_modules.length !== 1 ? "s" : ""} loaded` : "None linked",
      source: "Prompt Module records",
      status: (prov?.prompt_modules.length ?? 0) > 0 ? "ok" : "warning",
      children: (prov?.prompt_modules ?? []).map((name, i) => ({
        label: name,
        notionId: prov?.prompt_module_notion_ids[i],
      })),
    },
    {
      label: "Prompt Payload",
      value: prov ? `${prov.payload_version} — ${prov.payload_format === "legacy" ? "Legacy flat keys" : "Structured sections"}` : "—",
      source: prov?.prompt_payload_type === "linked" ? "Linked Notion record" : "Inline (Production Spec)",
      status: "ok",
      notionId: prov?.prompt_payload_notion_id,
      children: sections
        .filter(s => ["shared_prompt","front_prompt","back_prompt","inside_prompt","outside_prompt","assembly_prompt","negative_prompt"].includes(s.key))
        .map(s => ({ label: s.label, value: `${s.content.length.toLocaleString()} chars`, source: s.source, preview: s.content.slice(0, 120) + (s.content.length > 120 ? "…" : "") })),
    },
    {
      label: "Canon",
      value: (prov?.canon_records.length ?? 0) > 0 ? `${prov!.canon_records.length} record${prov!.canon_records.length !== 1 ? "s" : ""}` : "No canon records",
      source: "Canon Records",
      status: (prov?.canon_records.length ?? 0) > 0 ? "ok" : "warning",
      children: (prov?.canon_records ?? []).map((name, i) => ({ label: name, notionId: prov?.canon_record_notion_ids[i] })),
    },
    {
      label: "Print Specification",
      source: "Production Specification",
      status: "ok",
      preview: prov ? `Component: ${prov.component_type}` : "—",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {tree.map((node, i) => <InheritanceNodeCard key={i} node={node} />)}
      </div>

      {/* Provenance chain */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-[#1B2A4A]" />
            Compilation Provenance
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ProvenanceChain prov={prov} />
        </CardContent>
      </Card>
    </div>
  );
}

function InheritanceNodeCard({ node }: { node: InheritanceNode }) {
  const [open, setOpen] = useState(false);
  const hasChildren = (node.children ?? []).length > 0;
  const isExpandable = hasChildren || !!node.preview;

  const statusCls = { ok: "bg-emerald-100 text-emerald-700", missing: "bg-gray-100 text-gray-500", warning: "bg-amber-100 text-amber-700" };
  const StatusIcon = ({ s }: { s: "ok" | "missing" | "warning" }) =>
    s === "ok" ? <CheckCircle2 className="w-3 h-3" /> : s === "warning" ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />;
  const statusLabel = { ok: "Inherited", missing: "Not linked", warning: "No records" };

  const url = notionUrl(node.notionId);

  return (
    <Card className="overflow-hidden">
      {/* div instead of button — <a> link inside prevents interactive-in-button nesting */}
      <div role={isExpandable ? "button" : undefined} tabIndex={isExpandable ? 0 : undefined}
        onClick={() => isExpandable && setOpen(!open)}
        onKeyDown={(e) => isExpandable && (e.key === "Enter" || e.key === " ") && setOpen(!open)}
        className={`w-full text-left ${isExpandable ? "cursor-pointer" : "cursor-default"}`}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{node.label}</span>
                {node.value && <span className="text-sm text-[#1B2A4A] font-medium">{node.value}</span>}
                <span className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${statusCls[node.status]}`}>
                  <StatusIcon s={node.status} />{statusLabel[node.status]}
                </span>
              </div>
              {node.source && <p className="text-[11px] text-muted-foreground mt-0.5">Source: {node.source}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50">
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {isExpandable && (open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />)}
            </div>
          </div>
        </CardContent>
      </div>

      {open && (
        <div className="border-t border-border bg-muted/20">
          {node.preview && (
            <div className="px-4 py-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
              {node.preview}
            </div>
          )}
          {hasChildren && (
            <div className="divide-y divide-border">
              {node.children!.map((child, ci) => {
                const childUrl = notionUrl(child.notionId);
                return (
                  <div key={ci} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{child.label}</span>
                        {child.value && <span className="text-muted-foreground">{child.value}</span>}
                      </div>
                      {child.source && <p className="text-muted-foreground mt-0.5">{child.source}</p>}
                      {child.preview && <p className="text-muted-foreground mt-0.5 truncate" title={child.preview}>{child.preview}</p>}
                    </div>
                    {childUrl && (
                      <a href={childUrl} target="_blank" rel="noopener noreferrer"
                        className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ProvenanceChain({ prov }: { prov: ProvenanceRecord | null }) {
  if (!prov) return <p className="text-xs text-muted-foreground">Provenance data not available.</p>;

  const items: Array<{ label: string; value: string; notionId?: string }> = [
    { label: "Production Specification", value: prov.production_spec_title, notionId: prov.production_spec_notion_id },
    ...(prov.component_specification ? [{ label: "Component Specification", value: prov.component_specification, notionId: prov.component_spec_notion_id }] : []),
    ...(prov.style_guide ? [{ label: "Style Guide", value: prov.style_guide, notionId: prov.style_guide_notion_id }] : []),
    ...(prov.collection ? [{ label: "Collection", value: prov.collection, notionId: prov.collection_notion_id }] : []),
    ...(prov.prompt_modules.length > 0 ? [{ label: "Prompt Modules", value: prov.prompt_modules.join(", ") }] : []),
    { label: "Prompt Payload", value: prov.payload_version, notionId: prov.prompt_payload_notion_id },
    ...(prov.canon_records.length > 0 ? [{ label: "Canon Records", value: prov.canon_records.join(", ") }] : []),
    { label: "Print Specification", value: prov.component_type },
  ];

  return (
    <div className="space-y-0">
      {items.map((item, i) => {
        const url = notionUrl(item.notionId);
        return (
          <div key={i} className="flex flex-col">
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-md text-xs ${url ? "hover:bg-muted/40 cursor-pointer" : ""}`}
              onClick={() => url && window.open(url, "_blank")}>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
                <p className="font-medium text-sm">{item.value}</p>
              </div>
              {url && <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />}
            </div>
            {i < items.length - 1 && (
              <div className="flex items-center ml-3 my-0.5">
                <div className="w-px h-4 bg-border" />
                <span className="text-[10px] text-muted-foreground ml-1.5">↓</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tab 3: Prompt Sections ─────────────────────────────────────────────────────

function PromptSectionsTab({
  sections, fullPrompt, promptHash, isLegacy, bibleFetchWarning,
}: {
  sections: CompiledSectionRecord[];
  fullPrompt: string;
  promptHash?: string;
  isLegacy: boolean;
  bibleFetchWarning?: ValidationError;
}) {
  const { toast } = useToast();
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set(["shared_prompt", "front_prompt"]));

  const toggle = (key: string) =>
    setOpenKeys((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });

  if (sections.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        <Layers className="w-4 h-4 shrink-0" />No structured sections available for this compile.
      </div>
    );
  }

  const handleExport = () => exportJson({
    prompt_hash: promptHash, is_legacy_format: isLegacy,
    sections: sections.map(s => ({ key: s.key, label: s.label, source: s.source, char_count: s.content.length, content: s.content })),
    full_prompt: fullPrompt,
  }, `compiled-prompt-${promptHash?.slice(0, 12) ?? "export"}.json`);

  return (
    <div className="space-y-3">
      {bibleFetchWarning && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-orange-200 bg-orange-50 text-xs text-orange-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-500" />
          <div>
            <p className="font-medium">World Bible unavailable at compile time</p>
            <p className="mt-0.5">{bibleFetchWarning.message}</p>
            <p className="mt-1 text-orange-700">{bibleFetchWarning.recommended_action}</p>
          </div>
        </div>
      )}
      {isLegacy && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div><p className="font-medium">Legacy PP-1.0 format</p><p className="mt-0.5">Sections derived from flat-key payload. Migrate to PP-2.0 for richer provenance.</p></div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="h-7"
          onClick={() => { navigator.clipboard.writeText(fullPrompt); toast({ title: "Full prompt copied" }); }}>
          <Copy className="w-3 h-3 mr-1.5" />Copy Entire Prompt
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={handleExport}>
          <Download className="w-3 h-3 mr-1.5" />Export JSON
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          {fullPrompt.length.toLocaleString()} total chars · {sections.length} section{sections.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {sections.map((s) => {
          const isBible = s.source === "World Bible";
          // Look up a friendly field label for known Bible keys
          const bibleFieldLabel = isBible
            ? (BIBLE_FIELD_ORDER.find((f) => f.key === s.key)?.label ?? (s.key === "world_rules" ? "World Rules" : null))
            : null;
          const isExpanded = openKeys.has(s.key);

          if (isBible) {
            // ── World Bible sections: value always visible inline, styled like WorldBibleCard ──
            const isWorldRules = s.key === "world_rules";
            const rules = isWorldRules
              ? s.content.split("\n").map((r) => r.trim()).filter(Boolean)
              : [];
            return (
              <Card key={s.key} className="overflow-hidden border-[#C87560]/30 bg-[#C87560]/[0.03]">
                <CardContent className="py-3 px-4">
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{s.label}</span>
                        <span className="text-xs text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full">{s.content.length.toLocaleString()} chars</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#C87560] bg-[#C87560]/10 border border-[#C87560]/20 px-2 py-0.5 rounded-full">
                          <BookOpen className="w-2.5 h-2.5" />World Bible
                        </span>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(s.content); toast({ title: `"${s.label}" copied` }); }}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Inline value — always visible, styled like WorldBibleCard */}
                  <div className="mt-2.5 rounded-md border border-[#1B2A4A]/10 bg-[#1B2A4A]/[0.02] px-3 py-2.5">
                    {bibleFieldLabel && (
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <BookOpen className="w-2.5 h-2.5 text-[#C87560]" />
                        {bibleFieldLabel}
                      </p>
                    )}
                    {isWorldRules && rules.length > 0 ? (
                      <ol className="space-y-1">
                        {rules.map((rule, i) => (
                          <li key={i} className="flex gap-2 text-xs">
                            <span className="shrink-0 w-4 h-4 rounded-full bg-[#1B2A4A]/10 text-[#1B2A4A] font-bold
                                             flex items-center justify-center text-[9px] leading-none mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-foreground leading-relaxed">{rule}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{s.content.trim()}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          }

          // ── Non-Bible sections: existing collapsible card ─────────────────────────
          return (
            <Card key={s.key} className="overflow-hidden">
              {/* div instead of button — copy Button inside prevents button-in-button nesting */}
              <div role="button" tabIndex={0}
                onClick={() => toggle(s.key)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(s.key)}
                className="w-full text-left cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{s.label}</span>
                        <span className="text-xs text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full">{s.content.length.toLocaleString()} chars</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={s.source}>{s.source}</span>
                      </div>
                      {!isExpanded && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.content.slice(0, 100)}{s.content.length > 100 ? "…" : ""}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(s.content); toast({ title: `"${s.label}" copied` }); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                </CardContent>
              </div>
              {isExpanded && (
                <div className="border-t border-border bg-muted/20 px-4 py-3">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground leading-relaxed">{s.content}</pre>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Tab 4: Validation ─────────────────────────────────────────────────────────

function ValidationTab({
  errors, warnings, prov,
}: {
  errors: ValidationError[];
  warnings: ValidationError[];
  prov: ProvenanceRecord | null;
}) {
  const realWarnings = warnings.filter(w => !isRecommendationCode(w.code));
  const recs         = warnings.filter(w => isRecommendationCode(w.code));
  const allClean     = errors.length === 0 && realWarnings.length === 0 && recs.length === 0;
  const recsOnly     = errors.length === 0 && realWarnings.length === 0 && recs.length > 0;

  const specUrl    = notionUrl(prov?.production_spec_notion_id);
  const payloadUrl = notionUrl(prov?.prompt_payload_notion_id);
  const compUrl    = notionUrl(prov?.component_spec_notion_id);

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div>
        <p className="text-[11px] font-semibold text-[#1B2A4A] uppercase tracking-widest">Validation Report</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {allClean ? "All governance checks passed." : recsOnly ? "Production-ready — modernization recommendations available." : `${errors.length} error${errors.length !== 1 ? "s" : ""} · ${realWarnings.length} warning${realWarnings.length !== 1 ? "s" : ""} · ${recs.length} recommendation${recs.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Notion navigation */}
      {(specUrl || payloadUrl || compUrl) && (
        <div className="flex flex-wrap gap-2">
          {specUrl    && <a href={specUrl}    target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="h-7 gap-1.5"><ExternalLink className="w-3 h-3" />Production Specification</Button></a>}
          {payloadUrl && <a href={payloadUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="h-7 gap-1.5"><ExternalLink className="w-3 h-3" />Prompt Payload</Button></a>}
          {compUrl    && <a href={compUrl}    target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="h-7 gap-1.5"><ExternalLink className="w-3 h-3" />Component Specification</Button></a>}
        </div>
      )}

      {/* All-clear banner */}
      {allClean && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">All governance checks passed</p>
            <p className="text-xs text-emerald-700 mt-0.5">This Production Specification is ready for the next publishing stage.</p>
          </div>
        </div>
      )}

      {/* Recommendations-only banner */}
      {recsOnly && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50">
          <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">This asset is production-ready</p>
            <p className="text-xs text-blue-700 mt-0.5">Modernization improvements are available but optional.</p>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
            <XCircle className="w-4 h-4" />
            Errors <span className="font-normal text-red-500">({errors.length}) — compilation blocked</span>
          </div>
          {errors.map((e, i) => e.code === "MISSING_REQUIRED_SECTION"
            ? <ContractViolationCard key={i} e={e} variant="error" />
            : <GenericIssueRow key={i} e={e} variant="error" />
          )}
        </div>
      )}

      {/* Warnings */}
      {realWarnings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
            <AlertTriangle className="w-4 h-4" />
            Warnings <span className="font-normal text-amber-500">({realWarnings.length}) — quality may be affected</span>
          </div>
          {realWarnings.map((w, i) => w.code === "MISSING_REQUIRED_SECTION"
            ? <ContractViolationCard key={i} e={w} variant="warning" />
            : <GenericIssueRow key={i} e={w} variant="warning" />
          )}
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-blue-600">
            <Sparkles className="w-4 h-4" />
            Recommendations <span className="font-normal text-blue-500">({recs.length}) — optional modernization</span>
          </div>
          {recs.map((r, i) => (
            <div key={i} className="rounded-md p-3 text-xs space-y-1 bg-blue-50 border border-blue-100">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono font-medium text-blue-700">{r.code}</code>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{r.field}</span>
                <span className="text-muted-foreground ml-auto">{r.governing_rule}</span>
              </div>
              <p className="text-blue-900">{r.message}</p>
              <p className="font-medium text-blue-700">→ {r.recommended_action}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GenericIssueRow({ e, variant }: { e: ValidationError; variant: "error" | "warning" }) {
  return (
    <div className={`rounded-md p-3 text-xs space-y-1 ${variant === "error" ? "bg-red-50" : "bg-amber-50"}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="font-mono font-medium">{e.code}</code>
        <span className="text-muted-foreground">·</span>
        <span className="font-medium">{e.field}</span>
        <span className="text-muted-foreground ml-auto text-right">{e.governing_rule}</span>
      </div>
      <p>{e.message}</p>
      <p className={`font-medium ${variant === "error" ? "text-red-700" : "text-amber-700"}`}>→ {e.recommended_action}</p>
    </div>
  );
}

// ── Tab 5: Technical Details ──────────────────────────────────────────────────

function TechnicalTab({ result }: { result: CompileResponse }) {
  const { toast } = useToast();
  const [showIds, setShowIds] = useState(false);
  const prov = result.provenance;

  const metaRows: Array<{ label: string; value: string }> = [
    { label: "Compiler Version",       value: prov?.compiler_version ?? "—" },
    { label: "Compiler Build",         value: "worldsmith-2.0" },
    { label: "Provider",               value: "Notion + Anthropic" },
    { label: "Compilation Timestamp",  value: fmtTs(prov?.compilation_timestamp) },
    { label: "Prompt Length",          value: result.compiled_prompt ? `${result.compiled_prompt.length.toLocaleString()} chars` : "—" },
    { label: "Prompt Hash",            value: result.prompt_hash ?? "—" },
    { label: "Prompt Modules Loaded",  value: String(prov?.prompt_modules.length ?? "—") },
    { label: "Canon Records",          value: String(prov?.canon_records.length ?? "—") },
  ];

  const idRows: Array<{ label: string; value?: string }> = [
    { label: "Run ID (Compiled Artifact ID)",   value: prov?.run_id ?? result.run_id },
    { label: "Production Spec (Notion ID)",     value: prov?.production_spec_notion_id },
    { label: "Component Spec (Notion ID)",      value: prov?.component_spec_notion_id },
    { label: "Style Guide (Notion ID)",         value: prov?.style_guide_notion_id },
    { label: "Prompt Payload (Notion ID)",      value: prov?.prompt_payload_notion_id },
    ...(prov?.prompt_module_notion_ids ?? []).map((id, i) => ({ label: `Prompt Module ${i + 1} (Notion ID)`, value: id })),
    ...(prov?.canon_record_notion_ids ?? []).map((id, i) => ({ label: `Canon Record ${i + 1} (Notion ID)`, value: id })),
  ];

  return (
    <div className="space-y-4">
      {/* Export actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-7"
          onClick={() => exportJson(result, `compilation-report-${result.run_id?.slice(0, 12) ?? "export"}.json`)}>
          <Download className="w-3 h-3 mr-1.5" />Export Report
        </Button>
        <Button size="sm" variant="outline" className="h-7"
          onClick={() => exportJson(prov, `provenance-${result.run_id?.slice(0, 12) ?? "export"}.json`)}>
          <Download className="w-3 h-3 mr-1.5" />Export Provenance
        </Button>
        <Button size="sm" variant="outline" className="h-7"
          onClick={() => exportJson({ prompt: result.compiled_prompt, hash: result.prompt_hash }, `compiled-prompt-${result.prompt_hash?.slice(0, 12) ?? "export"}.json`)}>
          <Download className="w-3 h-3 mr-1.5" />Export Prompt
        </Button>
      </div>

      {/* Compiler metadata */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#1B2A4A]" />Compiler Metadata
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 divide-y divide-border">
          {metaRows.map(({ label, value }) => (
            <div key={label} className="grid grid-cols-[220px_1fr] gap-3 py-2.5 text-xs">
              <span className="text-muted-foreground font-medium">{label}</span>
              <span className="font-mono break-all">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* UUID toggle */}
      <Card>
        <button type="button" onClick={() => setShowIds(!showIds)} className="w-full text-left">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs">
                <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="font-medium">Notion IDs / UUIDs</span>
                <span className="text-muted-foreground">— {showIds ? "showing raw identifiers" : "hidden by default"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {showIds ? "Hide IDs" : "Show Technical IDs"}
                {showIds ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </div>
          </CardContent>
        </button>
        {showIds && (
          <div className="border-t border-border divide-y divide-border">
            {idRows.map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                <span className="text-muted-foreground font-medium shrink-0 w-[220px]">{label}</span>
                <div className="flex-1 flex items-start gap-2 min-w-0">
                  <code className="font-mono break-all flex-1">{value ?? "—"}</code>
                  {value && (
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(value); toast({ title: "ID copied" }); }}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Error Result ──────────────────────────────────────────────────────────────

function ErrorResult({
  result, onRetry, isPending,
}: {
  result: CompileResponse;
  onRetry: () => void;
  isPending: boolean;
}) {
  const isCanon = result.status === "requires_canon_review";
  const bg = isCanon ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
  const Icon = isCanon ? AlertTriangle : XCircle;
  const iconColor = isCanon ? "text-amber-500" : "text-red-500";
  const label = isCanon ? "Requires Canon Review" : "Validation Failed";

  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${bg}`}>
        <Icon className={`w-5 h-5 shrink-0 ${iconColor}`} />
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
          {result.next_action && <p className="text-xs text-muted-foreground mt-0.5">Next: {result.next_action}</p>}
        </div>
        {result.retry_safe && (
          <Button size="sm" variant="outline" onClick={onRetry} disabled={isPending}
            className={isCanon ? "border-amber-300 text-amber-700" : "border-red-300 text-red-700"}>
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><RotateCcw className="w-3.5 h-3.5 mr-1.5" />Retry</>}
          </Button>
        )}
      </div>
      {(result.errors ?? []).length > 0 && <IssueList title="Errors" items={result.errors!} variant="error" />}
      {(result.warnings ?? []).length > 0 && <IssueList title="Warnings" items={result.warnings} variant="warning" />}
    </div>
  );
}

// ── Spec Preview Section (shown below SuccessScreen while generating) ─────────

interface PreviewMutationHandle {
  isPending: boolean;
  reset: () => void;
  mutate: (vars: { specId: string; hash: string; forceNew?: boolean; isDryRun?: boolean }) => void;
}

function SpecPreviewSection({
  result,
  resolvedId,
  autoPreview,
  setAutoPreview,
  previewMutation,
  previewError,
  dryRunResult,
}: {
  result: CompileResponse;
  resolvedId: string | null;
  autoPreview: boolean;
  setAutoPreview: (v: boolean) => void;
  previewMutation: PreviewMutationHandle;
  previewError: string | null;
  dryRunResult: SpecPreviewResult | null;
}) {
  const canGenerate  = !!resolvedId && !!result.prompt_hash;
  const isGenerating = previewMutation.isPending;
  const hasFailed    = !!previewError && !isGenerating;
  const isDryRun     = !!dryRunResult && !isGenerating;

  // Derive status label + badge colour
  const statusLabel  = isGenerating ? "Generating…" : hasFailed ? "Failed" : isDryRun ? "Dry Run Complete" : "Not Generated";
  const statusBadge  = isGenerating
    ? "bg-[#1B2A4A]/10 text-[#1B2A4A]"
    : hasFailed
    ? "bg-red-100 text-red-700"
    : isDryRun
    ? "bg-amber-100 text-amber-700"
    : "bg-muted text-muted-foreground";

  return (
    <Card id="spec-preview-card" className="border-[#1B2A4A]/20">
      {/* Header — title + status badge + auto-generate toggle */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ImagePlus className="w-4 h-4 text-[#C87560] shrink-0" />
            <div>
              <CardTitle className="text-sm">Specification Board</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadge}`}>
                  {isGenerating && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  Status: {statusLabel}
                </span>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground shrink-0 mt-0.5">
            <input
              type="checkbox"
              checked={autoPreview}
              onChange={(e) => setAutoPreview(e.target.checked)}
              className="rounded w-3.5 h-3.5 accent-[#1B2A4A]"
            />
            Auto-generate
          </label>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">

        {/* Generating state */}
        {isGenerating && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-[#1B2A4A]/5 border border-[#1B2A4A]/10">
            <Loader2 className="w-5 h-5 animate-spin text-[#1B2A4A] shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#1B2A4A]">Generating specification board…</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Rendering layout and central concept visual. This typically takes 20–40 seconds.
              </p>
            </div>
          </div>
        )}

        {/* Failed state */}
        {hasFailed && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
            <ImageOff className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">Generation failed</p>
              <p className="text-xs text-red-700 mt-0.5 break-words">{previewError}</p>
            </div>
          </div>
        )}

        {/* Idle — Not generated yet (no error, no dry run, not generating) */}
        {!isGenerating && !hasFailed && !isDryRun && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-muted/60">
            <div className="w-10 h-10 rounded-lg border-2 border-dashed border-muted-foreground/20 flex items-center justify-center shrink-0">
              <ImagePlus className="w-4 h-4 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No board generated yet</p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Generate a 1600×2000 px specification board and upload it to Notion.
              </p>
            </div>
          </div>
        )}

        {/* Dry-run result */}
        {isDryRun && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Dry-run payload preview</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Object.entries(dryRunResult!.dry_run_payload ?? {}).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{k}</p>
                    <p className="text-xs font-medium truncate" title={v}>{v || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
            {dryRunResult!.proposed_status_change && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">{dryRunResult!.proposed_status_change.from}</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">{dryRunResult!.proposed_status_change.to}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!isGenerating && (
          <div className="space-y-2">
            {/* Primary — generate (or retry) */}
            <Button
              className="w-full bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white gap-2"
              disabled={!canGenerate}
              onClick={() => previewMutation.mutate({ specId: resolvedId!, hash: result.prompt_hash! })}
            >
              <ImagePlus className="w-4 h-4" />
              {hasFailed ? "Retry Specification Board" : isDryRun ? "Generate Specification Board" : "Generate Specification Board"}
            </Button>
            {/* Secondary — dry run */}
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={!canGenerate}
              onClick={() => previewMutation.mutate({ specId: resolvedId!, hash: result.prompt_hash!, isDryRun: true })}
            >
              <FileText className="w-4 h-4" />
              Preview Payload (Dry Run)
            </Button>
          </div>
        )}

        {/* Coaching footer */}
        <div className="pt-1 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>
            Uploads a <span className="font-medium text-foreground">1600×2000 px</span> board to Notion
            and advances Status to <span className="font-medium text-foreground">Ready for Specification Review</span>.
            Warnings and recommendations do not block generation.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Preview Success Screen ────────────────────────────────────────────────────

function PreviewSuccessScreen({
  result,
  onGenerateNew,
  isGenerating,
  onReturnToCompiler,
}: {
  result: SpecPreviewResult;
  onGenerateNew: () => void;
  isGenerating: boolean;
  onReturnToCompiler: () => void;
}) {
  const { toast } = useToast();

  const fields: Array<{ label: string; value: string | undefined | null }> = [
    { label: "Production Item",   value: result.production_item },
    { label: "Previous Status",   value: result.previous_status || "—" },
    { label: "New Status",        value: result.new_status || "Ready for Review" },
    { label: "Filename",          value: result.preview_filename },
    { label: "Provider / Model",  value: result.provider ? `${result.provider} / ${result.model ?? "—"}` : "—" },
    { label: "Prompt Hash",       value: result.prompt_hash ? `${result.prompt_hash.slice(0, 24)}…` : "—" },
    { label: "Upload ID",         value: result.notion_upload_id ? `${result.notion_upload_id.slice(0, 20)}…` : "—" },
    { label: "Upload Status",     value: result.upload_status ?? "—" },
  ];

  const isPartialSuccess = result.status === "upload_success_status_failed";

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${isPartialSuccess ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <CheckCircle2 className={`w-5 h-5 shrink-0 ${isPartialSuccess ? "text-amber-500" : "text-emerald-500"}`} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${isPartialSuccess ? "text-amber-800" : "text-emerald-800"}`}>
            {isPartialSuccess ? "Specification Board uploaded — status not updated" : "Specification Board generated"}
          </p>
          <p className={`text-xs mt-0.5 ${isPartialSuccess ? "text-amber-700" : "text-emerald-700"}`}>
            {isPartialSuccess
              ? "The image was uploaded to Notion, but the Status field could not be updated automatically. Set it to Ready for Specification Review manually."
              : `Status advanced: ${result.previous_status || "Active"} → ${result.new_status || "Ready for Specification Review"}`}
          </p>
        </div>
      </div>

      {/* Fields */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {fields.map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-sm font-medium font-mono break-all" title={value ?? "—"}>{value ?? "—"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white"
          onClick={() => window.open(result.notion_page_url, "_blank")}
        >
          <ExternalLink className="w-4 h-4 mr-2" />
          Open in Notion
        </Button>
        <Button
          variant="outline"
          disabled={isGenerating}
          onClick={onGenerateNew}
        >
          {isGenerating
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
            : <><ImagePlus className="w-4 h-4 mr-2" />Generate New Board</>}
        </Button>
        <Button variant="ghost" onClick={onReturnToCompiler}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Return to Publishing Engine
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          onClick={() => {
            navigator.clipboard.writeText(result.notion_page_url);
            toast({ title: "Notion URL copied" });
          }}
        >
          <Copy className="w-3.5 h-3.5 mr-1.5" />
          Copy URL
        </Button>
      </div>

      {isPartialSuccess && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-xs text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>The image was uploaded successfully but the Status field was not updated. Open the Notion record and set Status to <strong>Ready for Review</strong> manually.</p>
        </div>
      )}
    </div>
  );
}

// ── Issue List ────────────────────────────────────────────────────────────────

// ── Contract Violation Card (PP-2.0 MISSING_REQUIRED_SECTION) ────────────────

function ContractViolationCard({ e, variant }: { e: ValidationError; variant: "error" | "warning" }) {
  // governing_rule pattern: "CS-000 PP-2.0 / Journal Card"
  const ruleParts = e.governing_rule.split(" / ");
  const rulePrefix = ruleParts[0] ?? e.governing_rule; // "CS-000 PP-2.0"
  const componentSpec = ruleParts[1] ?? "—";           // "Journal Card"

  // Extract payload version from rule prefix (e.g. "PP-2.0")
  const payloadVersionMatch = rulePrefix.match(/PP-[\d.]+/);
  const payloadVersion = payloadVersionMatch ? payloadVersionMatch[0] : rulePrefix;

  const isError = variant === "error";
  const headerBg    = isError ? "bg-red-600"          : "bg-amber-500";
  const cardBorder  = isError ? "border-red-200"       : "border-amber-200";
  const rowBg       = isError ? "bg-red-50/60"         : "bg-amber-50/60";
  const labelColor  = isError ? "text-red-700"         : "text-amber-700";
  const fixBg       = isError ? "bg-red-100/70"        : "bg-amber-100/70";
  const fixBorder   = isError ? "border-red-200"       : "border-amber-200";
  const fixText     = isError ? "text-red-800"         : "text-amber-800";

  const rows: Array<{ label: string; value: string }> = [
    { label: "Component Specification", value: componentSpec },
    { label: "Payload Version",         value: payloadVersion },
    { label: "Missing Section",         value: e.field },
    { label: "Required By",             value: "Component Specification Contract" },
  ];

  return (
    <div className={`rounded-lg border ${cardBorder} overflow-hidden text-xs`}>
      {/* Header */}
      <div className={`${headerBg} px-4 py-2.5 flex items-center gap-2`}>
        {isError
          ? <XCircle className="w-3.5 h-3.5 text-white shrink-0" />
          : <AlertTriangle className="w-3.5 h-3.5 text-white shrink-0" />}
        <span className="font-semibold text-white tracking-wide uppercase text-[11px]">Payload Contract Validation</span>
      </div>

      {/* Error title */}
      <div className={`px-4 py-3 border-b ${cardBorder}`}>
        <p className={`font-semibold text-sm ${labelColor}`}>
          {e.code === "MISSING_REQUIRED_SECTION" ? "Missing Required Payload Section" : e.message}
        </p>
      </div>

      {/* Field rows */}
      <div className={`divide-y ${isError ? "divide-red-100" : "divide-amber-100"}`}>
        {rows.map(({ label, value }) => (
          <div key={label} className={`grid grid-cols-[168px_1fr] gap-3 px-4 py-2.5 ${rowBg}`}>
            <span className={`font-medium ${labelColor} self-start`}>{label}</span>
            <span className="font-mono break-all">{value}</span>
          </div>
        ))}
      </div>

      {/* Suggested fix */}
      <div className={`px-4 py-3 ${fixBg} border-t ${fixBorder} flex items-start gap-2`}>
        <span className={`font-semibold ${fixText} shrink-0`}>Suggested Fix</span>
        <span className={`${fixText} leading-snug`}>{e.recommended_action}</span>
      </div>
    </div>
  );
}

// ── Issue List ─────────────────────────────────────────────────────────────────

function IssueList({ title, items, variant }: { title: string; items: ValidationError[]; variant: "error" | "warning" }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm flex items-center gap-1.5 ${variant === "error" ? "text-red-600" : "text-amber-600"}`}>
          {variant === "error" ? <XCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {title} ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {items.map((e, i) =>
          e.code === "MISSING_REQUIRED_SECTION" ? (
            <ContractViolationCard key={i} e={e} variant={variant} />
          ) : (
            <div key={i} className={`rounded-md p-3 text-xs space-y-1 ${variant === "error" ? "bg-red-50" : "bg-amber-50"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono font-medium">{e.code}</code>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{e.field}</span>
                <span className="text-muted-foreground ml-auto">{e.governing_rule}</span>
              </div>
              <p>{e.message}</p>
              <p className={`font-medium ${variant === "error" ? "text-red-700" : "text-amber-700"}`}>
                → {e.recommended_action}
              </p>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}

// ── Run-level readiness score (no ProvenanceRecord required) ─────────────────
// Derives a Production Readiness score entirely from fields present on a
// RunRecord. Works on both the list-level row (no compiled_prompt) and the
// detail-level row (with compiled_prompt). Returns the score and a labelled
// checklist so callers can render both.

interface RunReadinessItem {
  label: string;
  ok: boolean;
  weight: number;
}

interface RunReadiness {
  score: number;
  items: RunReadinessItem[];
}

function calcReadinessFromRun(run: RunRecord): RunReadiness {
  const items: RunReadinessItem[] = [
    { label: "Production Specification",  ok: !!run.production_spec_id,                    weight: 15 },
    { label: "Compiled successfully",      ok: run.status === "compiled",                   weight: 20 },
    { label: "Prompt Hash",               ok: !!run.prompt_hash,                           weight: 12 },
    { label: "Payload Version",           ok: !!run.payload_version,                       weight: 12 },
    { label: "Asset ID assigned",         ok: !!run.asset_id,                              weight: 11 },
    { label: "No validation errors",      ok: (run.errors?.length ?? 0) === 0,             weight: 18 },
    { label: "Prompt content stored",     ok: !!run.compiled_prompt,                       weight: 12 },
  ];
  const total  = items.reduce((s, i) => s + i.weight, 0);
  const earned = items.reduce((s, i) => s + (i.ok ? i.weight : 0), 0);
  return { score: Math.round((earned / total) * 100), items };
}

// ── Run Row ───────────────────────────────────────────────────────────────────

// ── Collection Provenance Row (with Re-fetch button) ──────────────────────────

function CollectionProvenanceRow({
  runId,
  initialName,
  notionId,
}: {
  runId: string;
  initialName: string | null;
  notionId: string | null;
}) {
  const { toast } = useToast();
  const [currentName, setCurrentName] = useState<string | null>(initialName);

  const refreshMutation = useMutation({
    mutationFn: () => worldsmithApi.refreshCollectionName(runId),
    onSuccess: (data) => {
      setCurrentName(data.collection_name);
      toast({ title: "Collection name refreshed", description: data.collection_name });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to refresh collection name", description: err.message, variant: "destructive" });
    },
  });

  if (!currentName && !notionId) return null;
  const url = notionUrl(notionId ?? undefined);

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Info className="w-3.5 h-3.5" />Collection (captured at compile time)
      </p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{currentName ?? "—"}</span>
        <div className="flex items-center gap-2 shrink-0">
          {notionId && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs"
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
            >
              {refreshMutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <><RefreshCw className="w-3 h-3 mr-1" />Re-fetch name</>}
            </Button>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="w-3.5 h-3.5" />Open in Notion
            </a>
          )}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        This name was recorded when the run compiled. If the Collection was renamed in Notion since then, open the Notion link to verify the current name.
      </p>
    </div>
  );
}

function RunRow({ run }: { run: RunRecord }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["worldsmith-run-detail", run.run_id],
    queryFn: () => worldsmithApi.getRun(run.run_id),
    enabled: expanded,
    staleTime: 30_000,
  });

  const statusColors: Record<string, string> = {
    compiled: "bg-emerald-100 text-emerald-700",
    validation_failed: "bg-red-100 text-red-700",
    requires_canon_review: "bg-amber-100 text-amber-700",
    failed: "bg-red-100 text-red-700",
    pending: "bg-gray-100 text-gray-600",
    compiling: "bg-blue-100 text-blue-700",
    interrupted: "bg-orange-100 text-orange-700",
  };

  const isInterrupted = run.status === "failed" && run.error_code === "INTERRUPTED";
  const badgeClass = isInterrupted ? "bg-orange-100 text-orange-700" : (statusColors[run.status] ?? "bg-gray-100 text-gray-600");
  const badgeLabel = isInterrupted ? "interrupted" : run.status;
  const detail = detailQuery.data;

  // Readiness: use full detail (which includes compiled_prompt) when loaded,
  // otherwise fall back to the list-level run record.
  const rowReadiness = calcReadinessFromRun(run);
  const detailReadiness = detail ? calcReadinessFromRun(detail) : rowReadiness;
  const readinessBarColor = detailReadiness.score >= 90 ? "bg-emerald-500" : detailReadiness.score >= 70 ? "bg-amber-400" : "bg-orange-400";
  const readinessScoreColor = detailReadiness.score >= 90 ? "text-emerald-700" : detailReadiness.score >= 70 ? "text-amber-600" : "text-orange-600";

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        <CardContent className="pt-3 pb-3 space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>{badgeLabel}</span>
            {/* Readiness score badge — always shown so past runs are easy to compare */}
            <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-semibold shrink-0 ${
              rowReadiness.score >= 90 ? "bg-emerald-50 text-emerald-700" :
              rowReadiness.score >= 70 ? "bg-amber-50 text-amber-700" :
              "bg-orange-50 text-orange-700"
            }`} title="Production Readiness score">
              <ShieldCheck className="w-3 h-3 inline mr-0.5 opacity-70" />{rowReadiness.score}%
            </span>
            <code className="text-xs font-mono text-muted-foreground">{run.run_id.slice(0, 8)}…</code>
            <code className="text-xs font-mono flex-1 truncate min-w-0">{run.production_spec_id}</code>
            {run.payload_version && <span className="text-xs text-muted-foreground font-mono shrink-0">v{run.payload_version}</span>}
            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" />{new Date(run.started_at).toLocaleString()}
            </span>
            {run.prompt_hash && (
              <span className="text-xs font-mono text-muted-foreground shrink-0 flex items-center gap-1">
                <Hash className="w-3 h-3" />{run.prompt_hash.slice(0, 12)}…
              </span>
            )}
            <span className="ml-auto shrink-0 text-muted-foreground">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </div>
          {run.retry_count > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <RotateCcw className="w-3 h-3" />{run.retry_count} {run.retry_count === 1 ? "retry" : "retries"}
            </span>
          )}
          {!expanded && (run.errors ?? []).length > 0 && (
            <p className="text-xs text-red-600">{run.errors![0].code}: {run.errors![0].message}</p>
          )}
          {!expanded && (run.warnings ?? []).length > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />{run.warnings!.length} warning{run.warnings!.length === 1 ? "" : "s"} — expand to review
            </p>
          )}
        </CardContent>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
          {detailQuery.isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>}
          {detailQuery.isError && (
            <div className="flex items-center gap-2 p-3 rounded-md border border-red-200 bg-red-50">
              <XCircle className="w-3.5 h-3.5 text-red-500" />
              <p className="text-xs text-red-700 flex-1">{(detailQuery.error as Error)?.message}</p>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-300 text-red-700" onClick={() => detailQuery.refetch()}><RefreshCw className="w-3 h-3" /></Button>
            </div>
          )}

          {detail && (
            <>
              {/* ── Production Readiness ──────────────────────────────────── */}
              <div className="rounded-md border border-border bg-background p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />Production Readiness
                  </p>
                  <span className={`text-sm font-bold tabular-nums ${readinessScoreColor}`}>
                    {detailReadiness.score}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${readinessBarColor}`}
                    style={{ width: `${detailReadiness.score}%` }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-0.5">
                  {detailReadiness.items.map((item) => (
                    <div key={item.label} className="flex items-center gap-1.5 text-xs">
                      {item.ok
                        ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                        : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                      <span className={item.ok ? "text-foreground" : "text-muted-foreground line-through"}>{item.label}</span>
                      <span className="ml-auto text-muted-foreground tabular-nums shrink-0">{item.weight}pt</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><p className="text-muted-foreground mb-0.5">Run ID</p><code className="font-mono">{detail.run_id.slice(0, 8)}…</code></div>
                <div><p className="text-muted-foreground mb-0.5">Payload version</p><code className="font-mono">{detail.payload_version ?? "—"}</code></div>
                <div><p className="text-muted-foreground mb-0.5">Prompt hash</p><code className="font-mono">{detail.prompt_hash ? `${detail.prompt_hash.slice(0, 16)}…` : "—"}</code></div>
                <div><p className="text-muted-foreground mb-0.5">Compiled status</p><span>{detail.compiled_prompt_status ?? "—"}</span></div>
              </div>

              {/* ── World / Collection / Volume provenance ───────────────── */}
              {(() => {
                const src = detail.resolved_source_ids ?? {};

                // Helper: render one provenance row for a named Notion record
                const ProvenanceRow = ({
                  label,
                  name,
                  notionId,
                }: {
                  label: string;
                  name: string | null;
                  notionId: string | null;
                }) => {
                  if (!name && !notionId) return null;
                  const url = notionUrl(notionId ?? undefined);
                  return (
                    <div className="rounded-md border border-border bg-background p-3 space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5" />{label} (captured at compile time)
                      </p>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{name ?? "—"}</span>
                        {url && (
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0">
                            <ExternalLink className="w-3.5 h-3.5" />Open in Notion
                          </a>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        This name was recorded when the run compiled. If the {label} was renamed in Notion since then, open the Notion link to verify the current name.
                      </p>
                    </div>
                  );
                };

                const worldName      = typeof src.world_name        === "string" ? src.world_name        : null;
                const worldId        = typeof src.world_notion_id    === "string" ? src.world_notion_id    : null;
                const collectionName = typeof src.collection_name    === "string" ? src.collection_name    : null;
                // collection_notion_id is the preferred key; fall back to legacy "collection" key
                const collectionId   = typeof src.collection_notion_id === "string" ? src.collection_notion_id
                                     : typeof src.collection            === "string" ? src.collection : null;
                const volumeName     = typeof src.volume_name        === "string" ? src.volume_name        : null;
                const volumeId       = typeof src.volume_notion_id   === "string" ? src.volume_notion_id   : null;

                if (!worldName && !worldId && !collectionName && !collectionId && !volumeName && !volumeId) return null;
                return (
                  <>
                    <ProvenanceRow label="World"  name={worldName}  notionId={worldId}  />
                    <CollectionProvenanceRow runId={detail.run_id} initialName={collectionName} notionId={collectionId} />
                    <ProvenanceRow label="Volume" name={volumeName} notionId={volumeId} />
                  </>
                );
              })()}

              {/* ── World Bible snapshot ──────────────────────────────── */}
              {(detail.compiled_sections ?? []).some((s) => s.source === "World Bible") && (
                <WorldBibleCard sections={detail.compiled_sections!} />
              )}

              {detail.compiled_prompt && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compiled Prompt</p>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => { navigator.clipboard.writeText(detail.compiled_prompt!); toast({ title: "Copied" }); }}>
                      <Copy className="w-3 h-3 mr-1" />Copy
                    </Button>
                  </div>
                  <Textarea readOnly value={detail.compiled_prompt} className="font-mono text-xs resize-none h-48 bg-background" />
                </div>
              )}

              {(detail.notion_retries ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />Notion Retries ({detail.notion_retries!.length})
                  </p>
                  <div className="rounded-md border border-amber-200 bg-amber-50 divide-y divide-amber-100 overflow-hidden">
                    {detail.notion_retries!.map((r, i) => (
                      <div key={i} className="px-3 py-2 text-xs flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-amber-800 shrink-0">#{r.attempt}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${r.reason === "rate_limited" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                          {r.reason === "rate_limited" ? "Rate limited" : "Network error"}
                        </span>
                        <code className="font-mono text-muted-foreground flex-1 min-w-0 truncate">{r.path}</code>
                        <span className="text-muted-foreground shrink-0">{r.delay_ms.toLocaleString()} ms</span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">{new Date(r.at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(detail.errors ?? []).length > 0 && <IssueList title="Errors" items={detail.errors!} variant="error" />}
              {(detail.warnings ?? []).length > 0 && <IssueList title="Warnings" items={detail.warnings!} variant="warning" />}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
