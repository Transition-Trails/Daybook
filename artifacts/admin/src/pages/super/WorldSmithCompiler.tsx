/**
 * WorldSmith Prompt Compiler v1.1
 * ─ Input: URL / dashed ID / 32-char hex, normalized client-side before submit
 * ─ Flow:  Input → Resolve → Preflight summary card → Compile / Dry Run
 * ─ Post:  Success screen with all key fields called out
 */
import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Copy, RefreshCw, FileText, Clock,
  Hash, RotateCcw, Search, ArrowRight, BookOpen,
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

interface CompileResponse {
  status: "compiled" | "validation_failed" | "requires_canon_review" | "failed";
  run_id: string;
  production_spec_id: string;
  payload_version: string;
  compiled_prompt_status: string;
  prompt_hash?: string;
  compiled_prompt?: string;
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
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorldSmithCompiler() {
  const { toast } = useToast();
  const [rawInput, setRawInput] = useState("");
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<"compiler" | "runs" | "assets">("compiler");
  const [statusFilter, setStatusFilter] = useState("all");

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
    onSuccess: (res) => {
      setResult(res);
      if (res.status === "compiled") {
        toast({ title: dryRun ? "Dry run complete" : "Compiled successfully", description: `Hash: ${res.prompt_hash?.slice(0, 12)}…` });
      } else {
        toast({ title: "Compilation blocked", description: res.errors?.[0]?.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    },
  });

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
              ? <SuccessScreen result={result} preflight={preflight} showPrompt={showPrompt} setShowPrompt={setShowPrompt} onReset={() => { setResult(null); setPreflight(null); setResolvedId(null); setRawInput(""); }} />
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

// ── Success Screen ────────────────────────────────────────────────────────────

function SuccessScreen({
  result, preflight, showPrompt, setShowPrompt, onReset,
}: {
  result: CompileResponse;
  preflight: PreflightResponse | null;
  showPrompt: boolean;
  setShowPrompt: (v: boolean) => void;
  onReset: () => void;
}) {
  const { toast } = useToast();

  const successFields: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: "Production Specification", value: result.production_specification ?? preflight?.production_specification },
    { label: "Component",                value: result.component_type ?? preflight?.component_type },
    { label: "Payload Version",          value: result.payload_version },
    { label: "Prompt Modules Loaded",    value: result.prompt_modules_loaded ?? preflight?.prompt_module_count },
    { label: "Compiled Prompt Length",   value: result.compiled_prompt ? `${result.compiled_prompt.length.toLocaleString()} chars` : "—" },
    { label: "Prompt Hash",              value: result.prompt_hash ? `${result.prompt_hash.slice(0, 24)}…` : "—" },
    { label: "Validation Status",        value: (result.warnings ?? []).length === 0 ? "Clean" : `${result.warnings.length} warning${result.warnings.length > 1 ? "s" : ""}` },
    { label: "Next Step",                value: result.next_action ?? "Generate image" },
  ];

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="flex items-center gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-800">Compilation Successful</p>
          <p className="text-xs text-emerald-700 mt-0.5">The compiled prompt and hash are ready.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onReset} className="shrink-0 text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />New
        </Button>
      </div>

      {/* Fields grid */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            {successFields.map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-sm font-medium" title={String(value ?? "—")}>{value ?? "—"}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Compiled prompt */}
      {result.compiled_prompt && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Compiled Prompt</CardTitle>
              <div className="flex items-center gap-1">
                <code className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                  {result.prompt_hash?.slice(0, 16)}…
                </code>
                <Button size="sm" variant="ghost" className="h-7 px-2"
                  onClick={() => { navigator.clipboard.writeText(result.compiled_prompt!); toast({ title: "Copied" }); }}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setShowPrompt(!showPrompt)}>
                  {showPrompt ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          {showPrompt && (
            <CardContent className="pt-0">
              <Textarea readOnly value={result.compiled_prompt}
                className="font-mono text-xs resize-none h-64 bg-muted/30" />
            </CardContent>
          )}
        </Card>
      )}

      {/* Warnings */}
      {(result.warnings ?? []).length > 0 && <IssueList title="Warnings" items={result.warnings} variant="warning" />}

      {/* Visual Asset */}
      {result.visual_asset_id && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Visual Asset updated in Notion: <code className="font-mono">{result.visual_asset_id}</code>
        </div>
      )}
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

// ── Issue List ────────────────────────────────────────────────────────────────

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
        {items.map((e, i) => (
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
        ))}
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
