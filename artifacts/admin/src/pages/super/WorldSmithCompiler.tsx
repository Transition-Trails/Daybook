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
          <h1 className="text-lg font-semibold">WorldSmith Publishing Engine</h1>
          <p className="text-xs text-muted-foreground">Governed publishing workflow — Resolve · Compile · Inspect · Specify · Review · Publish</p>
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

  const stages: PipelineStageShape[] = [
    { key: "resolve",               label: "Resolve",                      status: "done" },
    { key: "validate",              label: "Validate",                     status: errCount > 0 ? "error" : warnCount > 0 ? "warning" : "done", badge: errCount + warnCount || undefined },
    { key: "inheritance",           label: "Inheritance",                  status: "done" },
    { key: "prompt-assembly",       label: "Prompt Assembly",              status: "done" },
    { key: "hash-generation",       label: "Hash Generation",              status: "done" },
    { key: "ready-for-spec-board",  label: "Ready for Specification Board",status: "current" },
    { key: "specification-review",  label: "Specification Review",         status: "future" },
    { key: "ready-for-artwork",     label: "Ready for Artwork",            status: "future" },
    { key: "artwork-generation",    label: "Artwork Generation",           status: "future" },
    { key: "artwork-review",        label: "Artwork Review",               status: "future" },
    { key: "ready-for-publish",     label: "Ready for Publish",            status: "future" },
    { key: "published",             label: "Published",                    status: "future" },
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
  result, preflight, onReset,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  onReset: () => void;
}) {
  const [activeStage, setActiveStage] = useState<PipelineStageKey>("ready-for-spec-board");
  const prov = result.provenance;
  const isLegacy = prov?.payload_format === "legacy";
  const errCount = (result.errors ?? []).length;
  const warnCount = (result.warnings ?? []).length;

  const FUTURE_STAGES: PipelineStageKey[] = [
    "specification-review", "ready-for-artwork", "artwork-generation",
    "artwork-review", "ready-for-publish", "published",
  ];

  return (
    <div className="space-y-4">
      {/* Status Overview Card */}
      <StatusOverviewCard
        result={result}
        preflight={preflight}
        prov={prov ?? null}
        onReset={onReset}
        setActiveStage={setActiveStage}
      />

      {/* Publishing Pipeline — the navigation */}
      <PublishingPipeline result={result} activeStage={activeStage} setActiveStage={setActiveStage} />

      {/* Action Center */}
      <ActionCenter result={result} prov={prov ?? null} setActiveStage={setActiveStage} />

      {/* Stage-driven inspector panel */}
      {activeStage === "resolve"              && <ResolvePanel result={result} preflight={preflight} prov={prov ?? null} />}
      {activeStage === "validate"             && <ValidationTab errors={result.errors ?? []} warnings={result.warnings ?? []} prov={prov ?? null} />}
      {activeStage === "inheritance"          && <InspectorTab result={result} preflight={preflight} prov={prov ?? null} />}
      {activeStage === "prompt-assembly"      && <PromptSectionsTab sections={result.compiled_sections ?? []} fullPrompt={result.compiled_prompt ?? ""} promptHash={result.prompt_hash} isLegacy={isLegacy} />}
      {activeStage === "hash-generation"      && <TechnicalTab result={result} />}
      {activeStage === "ready-for-spec-board" && <ReadinessPanel result={result} preflight={preflight} prov={prov ?? null} />}
      {FUTURE_STAGES.includes(activeStage)    && <FuturePlaceholderPanel stage={activeStage} />}

      {result.visual_asset_id && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Visual Asset updated in Notion: <code className="font-mono">{result.visual_asset_id}</code>
        </div>
      )}
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

// ── Status Overview Card ───────────────────────────────────────────────────────

function StatusOverviewCard({
  result, preflight, prov, onReset, setActiveStage,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  prov: ProvenanceRecord | null;
  onReset: () => void;
  setActiveStage: (s: PipelineStageKey) => void;
}) {
  const specTitle   = prov?.production_spec_title ?? preflight?.production_specification ?? "Production Specification";
  const compType    = prov?.component_type ?? preflight?.component_type;
  const abbr        = componentAbbr(compType);
  const specUrl     = notionUrl(prov?.production_spec_notion_id);
  const readiness   = calcReadiness(result, prov, preflight);
  const errCount    = (result.errors ?? []).length;
  const recCount    = (result.warnings ?? []).filter(w => RECOMMENDATION_CODES.has(w.code ?? "")).length;
  const warnCount   = (result.warnings ?? []).filter(w => !RECOMMENDATION_CODES.has(w.code ?? "")).length;
  const isLegacy    = prov?.payload_format === "legacy";

  const nextAction  = errCount > 0
    ? "Resolve Validation Errors"
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
            <p className="text-sm font-semibold text-[#1B2A4A]">Ready for Specification Board</p>
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
        <Button
          size="sm"
          className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white shrink-0 gap-1.5"
          onClick={() => errCount > 0
            ? setActiveStage("validate")
            : document.getElementById("spec-preview-card")?.scrollIntoView({ behavior: "smooth" })
          }
        >
          {errCount > 0 ? <><XCircle className="w-3.5 h-3.5" />Review Errors</> : <><ImagePlus className="w-3.5 h-3.5" />Generate</>}
        </Button>
      </div>
    </Card>
  );
}

// ── Action Center ─────────────────────────────────────────────────────────────

function ActionCenter({
  result, prov, setActiveStage,
}: {
  result: CompileResponse;
  prov: ProvenanceRecord | null;
  setActiveStage: (s: PipelineStageKey) => void;
}) {
  const errCount = (result.errors ?? []).length;
  const warnCount = (result.warnings ?? []).length;

  type ActionItem = { label: string; primary?: boolean; href?: string; onClick?: () => void; icon: React.ReactNode };
  const actions: ActionItem[] = [];

  if (errCount > 0) {
    actions.push({ label: "Resolve Validation Errors", primary: true, icon: <XCircle className="w-3.5 h-3.5" />, onClick: () => setActiveStage("validate") });
    if (prov?.prompt_payload_notion_id) actions.push({ label: "Open Prompt Payload",          icon: <ExternalLink className="w-3.5 h-3.5" />, href: notionUrl(prov.prompt_payload_notion_id) });
    if (prov?.component_spec_notion_id) actions.push({ label: "Update Component Specification",icon: <ExternalLink className="w-3.5 h-3.5" />, href: notionUrl(prov.component_spec_notion_id) });
    if (prov?.production_spec_notion_id) actions.push({ label: "Open Production Specification", icon: <ExternalLink className="w-3.5 h-3.5" />, href: notionUrl(prov.production_spec_notion_id) });
  } else {
    actions.push({ label: "Generate Specification Board", primary: true, icon: <ImagePlus className="w-3.5 h-3.5" />, onClick: () => { document.getElementById("spec-preview-card")?.scrollIntoView({ behavior: "smooth" }); } });
    if (prov?.production_spec_notion_id) actions.push({ label: "Open Production Specification", icon: <ExternalLink className="w-3.5 h-3.5" />, href: notionUrl(prov.production_spec_notion_id) });
    if (warnCount > 0) actions.push({ label: "Review Validation Report", icon: <AlertTriangle className="w-3.5 h-3.5" />, onClick: () => setActiveStage("validate") });
    actions.push({ label: "Inspect Resolved Records", icon: <GitBranch className="w-3.5 h-3.5" />, onClick: () => setActiveStage("resolve") });
    actions.push({ label: "Review Prompt Assembly",   icon: <Layers className="w-3.5 h-3.5" />,    onClick: () => setActiveStage("prompt-assembly") });
  }

  return (
    <div className="rounded-lg border border-[#1B2A4A]/15 bg-[#1B2A4A]/[0.03] px-4 py-3">
      <div className="flex items-start gap-3 flex-wrap">
        <p className="text-[11px] font-semibold text-[#1B2A4A] uppercase tracking-widest mt-0.5 shrink-0">Actions</p>
        <div className="flex items-center gap-2 flex-wrap">
          {actions.map((action, i) => (
            action.href
              ? <a key={i} href={action.href} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant={action.primary ? "default" : "outline"}
                    className={`h-7 gap-1.5 ${action.primary ? "bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white" : ""}`}>
                    {action.icon}{action.label}
                  </Button>
                </a>
              : <Button key={i} size="sm" variant={action.primary ? "default" : "outline"}
                  className={`h-7 gap-1.5 ${action.primary ? "bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white" : ""}`}
                  onClick={action.onClick}>
                  {action.icon}{action.label}
                </Button>
          ))}
        </div>
      </div>
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
  const artifactId = prov?.run_id ?? result.run_id ?? "—";
  const promptHash = result.prompt_hash ?? "—";
  const errCount = (result.errors ?? []).length;

  const summaryFields: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Production Specification", value: prov?.production_spec_title ?? preflight?.production_specification },
    { label: "World",                    value: prov?.world ?? preflight?.world },
    { label: "Component",                value: prov?.component_type ?? preflight?.component_type },
    { label: "Volume",                   value: prov?.volume ?? preflight?.volume ?? "—" },
    { label: "Component Set",            value: prov?.component_set ?? "—" },
    { label: "Payload Format",           value: prov?.payload_format === "legacy" ? "PP-1.0 (legacy)" : "PP-2.0 (structured)" },
    { label: "Compilation Timestamp",    value: fmtTs(prov?.compilation_timestamp) },
    { label: "Next Action",              value: result.next_action ?? "Generate Specification Board" },
  ];

  const moduleCount = prov?.prompt_modules.length ?? preflight?.prompt_module_count ?? 0;
  const canonCount  = prov?.canon_records.length ?? preflight?.canon_record_count ?? 0;

  const checklist: Array<{ label: string; ok: boolean; note: string; notionId?: string }> = [
    { label: "Production Specification", ok: true,                                       note: prov?.production_spec_title ?? preflight?.production_specification ?? "Resolved", notionId: prov?.production_spec_notion_id },
    { label: "Component Specification",  ok: !!(prov?.component_specification ?? preflight?.component_specification), note: prov?.component_specification ?? preflight?.component_specification ?? "Not linked", notionId: prov?.component_spec_notion_id },
    { label: "Style Guide",              ok: !!prov?.style_guide,                        note: prov?.style_guide ?? "Not linked", notionId: prov?.style_guide_notion_id },
    { label: "Prompt Modules",           ok: moduleCount > 0,                            note: moduleCount > 0 ? `${moduleCount} linked` : "None linked" },
    { label: "Prompt Payload",           ok: true,                                       note: prov?.payload_version ?? result.payload_version ?? "Present", notionId: prov?.prompt_payload_notion_id },
    { label: "Canon",                    ok: canonCount > 0,                             note: canonCount > 0 ? `${canonCount} records` : "No canon records" },
    { label: "Print Specification",      ok: !!prov?.component_type,                    note: prov?.component_type ?? "Not resolved" },
    { label: "Prompt Hash",              ok: !!result.prompt_hash,                      note: result.prompt_hash ? `${result.prompt_hash.slice(0, 16)}…` : "Not generated" },
    { label: "Payload Contract",         ok: prov?.payload_format !== "legacy",         note: prov?.payload_format === "legacy" ? "Legacy PP-1.0" : "PP-2.0 ✓" },
  ];

  const isReadyForSpecBoard = errCount === 0;
  const isReadyForArtwork   = isReadyForSpecBoard && prov?.payload_format !== "legacy" && !!prov?.style_guide;

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Production Summary</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {summaryFields.map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-sm font-medium truncate" title={value ?? "—"}>{value ?? "—"}</p>
              </div>
            ))}
          </div>

          {/* Artifact ID + Prompt Hash callout */}
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-border">
            <div className="flex items-start gap-2 p-3 rounded-md border border-[#1B2A4A]/20 bg-[#1B2A4A]/5">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Compiled Artifact ID</p>
                <code className="text-xs font-mono break-all">{artifactId}</code>
              </div>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0"
                onClick={() => { navigator.clipboard.writeText(artifactId); toast({ title: "Artifact ID copied" }); }}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/20">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Prompt Hash</p>
                <code className="text-xs font-mono break-all">{promptHash}</code>
              </div>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0"
                onClick={() => { navigator.clipboard.writeText(promptHash); toast({ title: "Prompt hash copied" }); }}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Production Readiness checklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#1B2A4A]" />
            Production Readiness
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2.5">
            {checklist.map(({ label, ok, note, notionId }) => {
              const url = notionUrl(notionId);
              return (
                <div key={label} className="flex items-center gap-3 text-sm">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${ok ? "bg-emerald-100" : "bg-gray-100"}`}>
                    {ok
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      : <Info className="w-3 h-3 text-gray-400" />}
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

          <div className="mt-4 pt-4 border-t border-border space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Ready For</p>
            <div className="flex items-center gap-2 text-sm">
              {isReadyForSpecBoard
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
              <span className={isReadyForSpecBoard ? "" : "text-muted-foreground"}>Specification Board</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {isReadyForArtwork
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                : <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className={isReadyForArtwork ? "" : "text-muted-foreground"}>Final Artwork</span>
              {!isReadyForArtwork && <span className="text-xs text-muted-foreground">{prov?.payload_format === "legacy" ? "(requires PP-2.0 migration)" : !prov?.style_guide ? "(requires Style Guide)" : "(resolve errors first)"}</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
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

// ── Future Stage Placeholder ───────────────────────────────────────────────────

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

// Codes that represent best-practice modernization — not quality or blocking concerns.
const RECOMMENDATION_CODES = new Set([
  "LEGACY_PAYLOAD_FORMAT", "MIGRATION_SUGGESTED", "PAYLOAD_OPTIMIZATION",
  "OPTIONAL_PROMPT_MODULE", "OPTIONAL_MODULE",
]);

function ValidationTab({
  errors, warnings, prov,
}: {
  errors: ValidationError[];
  warnings: ValidationError[];
  prov: ProvenanceRecord | null;
}) {
  const realWarnings = warnings.filter(w => !RECOMMENDATION_CODES.has(w.code ?? ""));
  const recs         = warnings.filter(w =>  RECOMMENDATION_CODES.has(w.code ?? ""));
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
  const canPreview = !!resolvedId && !!result.prompt_hash;
  const isGenerating = previewMutation.isPending;

  return (
    <Card id="spec-preview-card" className="border-[#1B2A4A]/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <ImagePlus className="w-4 h-4 text-[#C87560]" />
            Specification Board
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
              {previewError ? "Retry Specification Board" : "Generate Specification Board"}
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
          <span className="font-medium">1600×2000 px PNG</span> Specification Board to Notion and advances Status to{" "}
          <span className="font-medium">Ready for Specification Review</span>. Warnings and recommendations do not prevent generation.
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
