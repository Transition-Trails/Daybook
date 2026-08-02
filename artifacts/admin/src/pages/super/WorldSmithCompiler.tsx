/**
 * WorldSmith Prompt Compiler v1.1
 * ─ Input: URL / dashed ID / 32-char hex, normalized client-side before submit
 * ─ Flow:  Input → Resolve → Preflight summary card → Compile / Dry Run
 * ─ Post:  Success screen with all key fields called out
 */
import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Copy, RefreshCw, FileText, Clock,
  Hash, RotateCcw, Search, ArrowRight, BookOpen,
  ImagePlus, ExternalLink, ImageOff, ArrowLeft, Layers, GitBranch,
  Download, Link2, ShieldCheck, Cpu, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

// ── Notion ID normalizer (mirrors server-side logic) ─────────────────────────

function normalizeNotionId(raw: string): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;
  const hexOnly = input.replace(/-/g, "");
  const match = hexOnly.match(/([0-9a-fA-F]{32})(?:[^0-9a-fA-F]|$)/);
  const hex = match ? match[1] :
    (hexOnly.length === 32 && /^[0-9a-fA-F]{32}$/.test(hexOnly) ? hexOnly : null);
  if (!hex) return null;
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20,32)]
    .join("-").toLowerCase();
}

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
  volume?: string;
  status: string;
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
  volume?: string;
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
}

// ── API helpers ───────────────────────────────────────────────────────────────

const worldsmithApi = {
  preflight: (specId: string) =>
    apiFetch<PreflightResponse>(`/v1/worldsmith/preflight?spec_id=${encodeURIComponent(specId)}`),

  compile: (specId: string, dryRun: boolean) =>
    apiFetch<CompileResponse>("/v1/prompt-compilations", {
      method: "POST",
      body: JSON.stringify({
        notion_production_spec_id: specId,
        operation: "validate_and_compile",
        dry_run: dryRun,
      }),
    }),

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
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorldSmithCompiler() {
  const { toast } = useToast();
  const [rawInput, setRawInput] = useState("");
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"compiler" | "runs" | "assets">("compiler");
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Spec Preview state ────────────────────────────────────────────────────
  const [previewResult, setPreviewResult] = useState<SpecPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [autoPreview, setAutoPreview] = useState<boolean>(() => {
    try { return localStorage.getItem("worldsmith:auto-preview") !== "false"; }
    catch { return true; }
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
          <h1 className="text-lg font-semibold">WorldSmith Prompt Compiler</h1>
          <p className="text-xs text-muted-foreground">Notion Production Specification → validated, hashed compiled prompt</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["compiler", "runs", "assets"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab ? "border-[#1B2A4A] text-[#1B2A4A]" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab}
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
            <PreflightCard
              preflight={preflight}
              dryRun={dryRun}
              setDryRun={setDryRun}
              onCompile={() => compile.mutate({ id: resolvedId!, dry: dryRun })}
              onDryRun={() => compile.mutate({ id: resolvedId!, dry: true })}
              isPending={compile.isPending}
              canCompile={canCompile}
            />
          )}

          {/* Step 3 — Result */}
          {result && (
            result.status === "compiled"
              ? (
                <>
                  {/* If preview produced an image (success or partial), show the full preview success screen */}
                  {(previewResult?.status === "success" || previewResult?.status === "upload_success_status_failed") ? (
                    <PreviewSuccessScreen
                      result={previewResult}
                      onGenerateNew={() => previewMutation.mutate({
                        specId: resolvedId!,
                        hash: result.prompt_hash!,
                        forceNew: true,
                      })}
                      isGenerating={previewMutation.isPending}
                      onReturnToCompiler={() => { setResult(null); setPreviewResult(null); setPreflight(null); setResolvedId(null); setRawInput(""); }}
                    />
                  ) : (
                    <InspectorScreen
                      result={result}
                      preflight={preflight}
                      onReset={() => { setResult(null); setPreviewResult(null); setPreviewError(null); setPreflight(null); setResolvedId(null); setRawInput(""); }}
                    />
                  )}

                  {/* Preview section — shown while generating, after dry-run, or after failure.
                      Not shown once a real preview image has been uploaded. */}
                  {previewResult?.status !== "success" && previewResult?.status !== "upload_success_status_failed" && (
                    <SpecPreviewSection
                      result={result}
                      resolvedId={resolvedId}
                      autoPreview={autoPreview}
                      setAutoPreview={(v) => {
                        setAutoPreview(v);
                        try { localStorage.setItem("worldsmith:auto-preview", v ? "true" : "false"); } catch {}
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
          {preflight.canon_record_count > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Hash className="w-3.5 h-3.5" />
              {preflight.canon_record_count} Canon Record{preflight.canon_record_count !== 1 ? "s" : ""}
            </div>
          )}
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

// ── Build Pipeline ─────────────────────────────────────────────────────────────

type StageStatus = "done" | "warning" | "error" | "pending";

function BuildPipeline({ result }: { result: CompileResponse }) {
  const hasErrors = (result.errors ?? []).length > 0;
  const hasWarnings = (result.warnings ?? []).length > 0;
  const validateStatus: StageStatus = hasErrors ? "error" : hasWarnings ? "warning" : "done";

  const stages: Array<{ key: string; label: string; status: StageStatus }> = [
    { key: "resolve",  label: "Resolve",           status: "done" },
    { key: "validate", label: "Validate",           status: validateStatus },
    { key: "inherit",  label: "Inheritance",        status: "done" },
    { key: "assemble", label: "Prompt Assembly",    status: "done" },
    { key: "hash",     label: "Hash Generation",    status: "done" },
    { key: "preview",  label: "Ready for Preview",  status: "pending" },
    { key: "artwork",  label: "Generate Artwork",   status: "pending" },
  ];

  const cls: Record<StageStatus, string> = {
    done:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    error:   "bg-red-50 text-red-700 border-red-200",
    pending: "bg-muted/40 text-muted-foreground border-border",
  };
  const StageIcon = ({ s }: { s: StageStatus }) =>
    s === "done"    ? <CheckCircle2 className="w-3 h-3" />
    : s === "warning" ? <AlertTriangle className="w-3 h-3" />
    : s === "error"   ? <XCircle className="w-3 h-3" />
    : <Clock className="w-3 h-3" />;

  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {stages.map((s, i) => (
        <div key={s.key} className="flex items-center shrink-0">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] font-medium ${cls[s.status]}`}>
            <StageIcon s={s.status} />{s.label}
          </div>
          {i < stages.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground mx-0.5 shrink-0" />}
        </div>
      ))}
    </div>
  );
}

// ── Compiled Production Specification Inspector ────────────────────────────────

type InspectorView = "summary" | "inspector" | "sections" | "validation" | "technical";

function InspectorScreen({
  result, preflight, onReset,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  onReset: () => void;
}) {
  const [activeView, setActiveView] = useState<InspectorView>("summary");
  const prov = result.provenance;
  const isLegacy = prov?.payload_format === "legacy";
  const errCount = (result.errors ?? []).length;
  const warnCount = (result.warnings ?? []).length;

  const tabs: Array<{ key: InspectorView; label: string; icon: React.ReactNode; badge?: number }> = [
    { key: "summary",    label: "Summary",    icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
    { key: "inspector",  label: "Inspector",  icon: <GitBranch className="w-3.5 h-3.5" /> },
    { key: "sections",   label: "Sections",   icon: <Layers className="w-3.5 h-3.5" /> },
    { key: "validation", label: "Validation", icon: <ShieldCheck className="w-3.5 h-3.5" />, badge: errCount + warnCount },
    { key: "technical",  label: "Technical",  icon: <Cpu className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${errCount > 0 ? "border-red-200 bg-red-50" : warnCount > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <CheckCircle2 className={`w-5 h-5 shrink-0 ${errCount > 0 ? "text-red-500" : warnCount > 0 ? "text-amber-500" : "text-emerald-500"}`} />
        <div className="flex-1">
          <p className={`text-sm font-semibold ${errCount > 0 ? "text-red-800" : warnCount > 0 ? "text-amber-800" : "text-emerald-800"}`}>
            Compiled Production Specification
          </p>
          <p className={`text-xs mt-0.5 ${errCount > 0 ? "text-red-700" : warnCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
            {isLegacy ? "PP-1.0 legacy format — consider migrating to PP-2.0." : "PP-2.0 structured payload."}
            {errCount > 0 && ` ${errCount} contract error${errCount !== 1 ? "s" : ""} — review Validation tab.`}
            {errCount === 0 && warnCount > 0 && ` ${warnCount} warning${warnCount !== 1 ? "s" : ""}.`}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onReset} className="shrink-0 text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />New
        </Button>
      </div>

      {/* Build Pipeline */}
      <BuildPipeline result={result} />

      {/* 5-tab nav */}
      <div className="flex gap-0 border-b border-border overflow-x-auto">
        {tabs.map(({ key, label, icon, badge }) => (
          <button key={key} onClick={() => setActiveView(key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeView === key
                ? "border-[#1B2A4A] text-[#1B2A4A]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {icon}{label}
            {badge != null && badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">{badge}</span>
            )}
          </button>
        ))}
      </div>

      {activeView === "summary"    && <SummaryTab    result={result} preflight={preflight} prov={prov ?? null} />}
      {activeView === "inspector"  && <InspectorTab  result={result} preflight={preflight} prov={prov ?? null} />}
      {activeView === "sections"   && <PromptSectionsTab sections={result.compiled_sections ?? []} fullPrompt={result.compiled_prompt ?? ""} promptHash={result.prompt_hash} isLegacy={isLegacy} />}
      {activeView === "validation" && <ValidationTab errors={result.errors ?? []} warnings={result.warnings ?? []} prov={prov ?? null} />}
      {activeView === "technical"  && <TechnicalTab  result={result} />}

      {result.visual_asset_id && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Visual Asset updated in Notion: <code className="font-mono">{result.visual_asset_id}</code>
        </div>
      )}
    </div>
  );
}

// ── Tab 1: Summary ────────────────────────────────────────────────────────────

function SummaryTab({
  result, preflight, prov,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
}) {
  const { toast } = useToast();
  const [showTech, setShowTech] = useState(false);

  const artifactId = prov?.run_id ?? result.run_id ?? "—";
  const promptHash = result.prompt_hash ?? "—";
  const errCount = (result.errors ?? []).length;
  const warnCount = (result.warnings ?? []).length;
  const validationLabel = errCount > 0
    ? `${errCount} error${errCount !== 1 ? "s" : ""}`
    : warnCount > 0 ? `${warnCount} warning${warnCount !== 1 ? "s" : ""}` : "Clean";

  const mainFields: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: "Production Specification", value: prov?.production_spec_title ?? preflight?.production_specification },
    { label: "Component",                value: prov?.component_type ?? preflight?.component_type },
    { label: "World",                    value: prov?.world ?? preflight?.world },
    { label: "Volume",                   value: prov?.volume ?? preflight?.volume ?? "—" },
    { label: "Component Set",            value: prov?.component_set ?? "—" },
    { label: "Component Specification",  value: prov?.component_specification ?? preflight?.component_specification ?? "—" },
    { label: "Payload Version",          value: prov?.payload_version ?? result.payload_version },
    { label: "Payload Format",           value: prov?.payload_format === "legacy" ? "PP-1.0 (legacy flat keys)" : "PP-2.0 (structured sections)" },
    { label: "Compiled Artifact ID",     value: artifactId.length > 24 ? `${artifactId.slice(0, 20)}…` : artifactId },
    { label: "Compiled Prompt Length",   value: result.compiled_prompt ? `${result.compiled_prompt.length.toLocaleString()} chars` : "—" },
    { label: "Compiler Version",         value: prov?.compiler_version ?? "—" },
    { label: "Compilation Timestamp",    value: fmtTs(prov?.compilation_timestamp) },
    { label: "Validation Status",        value: validationLabel },
    { label: "Next Step",                value: result.next_action ?? "Generate Preview" },
  ];

  const techFields: Array<{ label: string; value: string }> = [
    { label: "Run ID (Compiled Artifact ID)", value: artifactId },
    { label: "Prompt Hash (full)",             value: promptHash },
    { label: "Production Spec (Notion)",       value: prov?.production_spec_notion_id ?? "—" },
    { label: "Component Spec (Notion)",        value: prov?.component_spec_notion_id ?? "—" },
    { label: "Style Guide (Notion)",           value: prov?.style_guide_notion_id ?? "—" },
    { label: "Prompt Payload (Notion)",        value: prov?.prompt_payload_notion_id ?? "Inline" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {mainFields.map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-sm font-medium" title={String(value ?? "—")}>{value ?? "—"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Artifact ID + Prompt Hash callout */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-start gap-2 p-3 rounded-md border border-[#1B2A4A]/20 bg-[#1B2A4A]/5">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Compiled Artifact ID · Primary</p>
            <code className="text-xs font-mono break-all">{artifactId}</code>
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0 mt-1"
            onClick={() => { navigator.clipboard.writeText(artifactId); toast({ title: "Artifact ID copied" }); }}>
            <Copy className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/20">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Prompt Hash · Secondary</p>
            <code className="text-xs font-mono break-all">{promptHash}</code>
          </div>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0 mt-1"
            onClick={() => { navigator.clipboard.writeText(promptHash); toast({ title: "Prompt hash copied" }); }}>
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Expandable Technical Details */}
      <Card>
        <button type="button" onClick={() => setShowTech(!showTech)} className="w-full text-left">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="w-3.5 h-3.5" />
                <span className="font-medium">Technical Details</span>
                <span>— raw IDs and compiler metadata</span>
              </div>
              {showTech ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          </CardContent>
        </button>
        {showTech && (
          <div className="border-t border-border divide-y divide-border">
            {techFields.map(({ label, value }) => (
              <div key={label} className="grid grid-cols-[220px_1fr] gap-3 px-4 py-2.5 text-xs">
                <span className="text-muted-foreground font-medium self-start">{label}</span>
                <code className="font-mono break-all">{value}</code>
              </div>
            ))}
          </div>
        )}
      </Card>
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
      <button type="button" onClick={() => isExpandable && setOpen(!open)}
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
      </button>

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
  sections, fullPrompt, promptHash, isLegacy,
}: {
  sections: CompiledSectionRecord[];
  fullPrompt: string;
  promptHash?: string;
  isLegacy: boolean;
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
        {sections.map((s) => (
          <Card key={s.key} className="overflow-hidden">
            <button type="button" onClick={() => toggle(s.key)} className="w-full text-left">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{s.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full">{s.content.length.toLocaleString()} chars</span>
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={s.source}>{s.source}</span>
                    </div>
                    {!openKeys.has(s.key) && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{s.content.slice(0, 100)}{s.content.length > 100 ? "…" : ""}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(s.content); toast({ title: `"${s.label}" copied` }); }}>
                      <Copy className="w-3 h-3" />
                    </Button>
                    {openKeys.has(s.key) ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>
              </CardContent>
            </button>
            {openKeys.has(s.key) && (
              <div className="border-t border-border bg-muted/20 px-4 py-3">
                <pre className="text-xs font-mono whitespace-pre-wrap break-words text-foreground leading-relaxed">{s.content}</pre>
              </div>
            )}
          </Card>
        ))}
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
  const allClean = errors.length === 0 && warnings.length === 0;
  const specUrl    = notionUrl(prov?.production_spec_notion_id);
  const payloadUrl = notionUrl(prov?.prompt_payload_notion_id);
  const compUrl    = notionUrl(prov?.component_spec_notion_id);

  return (
    <div className="space-y-4">
      {/* Notion navigation */}
      {(specUrl || payloadUrl || compUrl) && (
        <div className="flex flex-wrap gap-2">
          {specUrl && <a href={specUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="h-7 gap-1.5"><ExternalLink className="w-3 h-3" />Production Specification</Button></a>}
          {payloadUrl && <a href={payloadUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="h-7 gap-1.5"><ExternalLink className="w-3 h-3" />Prompt Payload</Button></a>}
          {compUrl && <a href={compUrl} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="outline" className="h-7 gap-1.5"><ExternalLink className="w-3 h-3" />Component Specification</Button></a>}
        </div>
      )}

      {allClean && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-emerald-800">Validation passed</p>
            <p className="text-xs text-emerald-700 mt-0.5">No errors or warnings. Ready for preview generation.</p>
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
            <XCircle className="w-4 h-4" />Errors ({errors.length})
          </div>
          {errors.map((e, i) => e.code === "MISSING_REQUIRED_SECTION"
            ? <ContractViolationCard key={i} e={e} variant="error" />
            : <GenericIssueRow key={i} e={e} variant="error" />
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
            <AlertTriangle className="w-4 h-4" />Warnings ({warnings.length})
          </div>
          {warnings.map((w, i) => w.code === "MISSING_REQUIRED_SECTION"
            ? <ContractViolationCard key={i} e={w} variant="warning" />
            : <GenericIssueRow key={i} e={w} variant="warning" />
          )}
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
  const canPreview = !!resolvedId && !!result.prompt_hash;
  const isGenerating = previewMutation.isPending;

  return (
    <Card className="border-[#1B2A4A]/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-[#C87560]" />
            Specification Board Preview
          </CardTitle>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none text-muted-foreground">
            <input
              type="checkbox"
              checked={autoPreview}
              onChange={(e) => setAutoPreview(e.target.checked)}
              className="rounded w-3.5 h-3.5"
            />
            Auto-generate after compile
          </label>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {isGenerating && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-[#1B2A4A]/5 border border-[#1B2A4A]/10">
            <Loader2 className="w-4 h-4 animate-spin text-[#1B2A4A] shrink-0" />
            <div>
              <p className="text-sm font-medium text-[#1B2A4A]">Generating specification board…</p>
              <p className="text-xs text-muted-foreground mt-0.5">Rendering layout + central concept visual. This may take 20–40 seconds.</p>
            </div>
          </div>
        )}

        {previewError && !isGenerating && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
            <ImageOff className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Preview generation failed</p>
              <p className="text-xs text-red-700 mt-0.5 break-words">{previewError}</p>
            </div>
          </div>
        )}

        {dryRunResult && !isGenerating && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
              <p className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-2">Dry-run payload preview</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {Object.entries(dryRunResult.dry_run_payload ?? {}).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{k}</p>
                    <p className="text-xs font-medium truncate" title={v}>{v || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
            {dryRunResult.proposed_status_change && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded bg-muted">{dryRunResult.proposed_status_change.from}</span>
                <ArrowRight className="w-3 h-3 shrink-0" />
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">{dryRunResult.proposed_status_change.to}</span>
              </div>
            )}
          </div>
        )}

        {!isGenerating && (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!canPreview || isGenerating}
              className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white"
              onClick={() => previewMutation.mutate({ specId: resolvedId!, hash: result.prompt_hash! })}
            >
              <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
              {previewError ? "Retry Preview" : "Generate Preview"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canPreview || isGenerating}
              onClick={() =>
                // Route through the mutation so the dry_run_payload is stored in
                // previewResult state and rendered via the dryRunResult prop below.
                previewMutation.mutate({ specId: resolvedId!, hash: result.prompt_hash!, isDryRun: true })
              }
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Dry Run
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Uploads a{" "}
          <span className="font-medium">1600×2000 px PNG</span> specification board to Notion and advances Status to{" "}
          <span className="font-medium">Ready for Review</span>.
        </p>
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
            {isPartialSuccess ? "Specification board uploaded (status not updated)" : "Specification board generated"}
          </p>
          <p className={`text-xs mt-0.5 ${isPartialSuccess ? "text-amber-700" : "text-emerald-700"}`}>
            {isPartialSuccess
              ? "The image was uploaded to Notion, but the Status field could not be updated automatically."
              : `Status advanced: ${result.previous_status || "Active"} → ${result.new_status || "Ready for Review"}`}
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
            : <><ImagePlus className="w-4 h-4 mr-2" />Generate New Preview</>}
        </Button>
        <Button variant="ghost" onClick={onReturnToCompiler}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Return to Compiler
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

// ── Run Row ───────────────────────────────────────────────────────────────────

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

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="w-full text-left">
        <CardContent className="pt-3 pb-3 space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>{badgeLabel}</span>
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
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div><p className="text-muted-foreground mb-0.5">Run ID</p><code className="font-mono">{detail.run_id.slice(0, 8)}…</code></div>
                <div><p className="text-muted-foreground mb-0.5">Payload version</p><code className="font-mono">{detail.payload_version ?? "—"}</code></div>
                <div><p className="text-muted-foreground mb-0.5">Prompt hash</p><code className="font-mono">{detail.prompt_hash ? `${detail.prompt_hash.slice(0, 16)}…` : "—"}</code></div>
                <div><p className="text-muted-foreground mb-0.5">Compiled status</p><span>{detail.compiled_prompt_status ?? "—"}</span></div>
              </div>

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
