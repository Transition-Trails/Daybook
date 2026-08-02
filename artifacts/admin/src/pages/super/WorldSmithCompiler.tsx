/**
 * WorldSmith Prompt Compiler
 * Super-admin page for compiling Production Specifications from Notion.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Loader2, Sparkles, CheckCircle2, XCircle, AlertTriangle,
  ChevronDown, ChevronUp, Copy, RefreshCw, FileText, Clock, Hash, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ValidationError {
  code: string;
  field: string;
  governing_rule: string;
  message: string;
  recommended_action: string;
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
  compile: (specId: string, dryRun: boolean) =>
    apiFetch<CompileResponse>("/v1/prompt-compilations", {
      method: "POST",
      body: JSON.stringify({
        notion_production_spec_id: specId.trim(),
        operation: "validate_and_compile",
        dry_run: dryRun,
      }),
    }),
  preview: (specId: string) =>
    apiFetch<CompileResponse>("/v1/prompt-compilations", {
      method: "POST",
      body: JSON.stringify({
        notion_production_spec_id: specId.trim(),
        operation: "preview",
        dry_run: true,
      }),
    }),
  getRun: (runId: string) =>
    apiFetch<RunRecord>(`/v1/runs/${runId}`),
  listRuns: (specId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (specId) params.set("spec_id", specId);
    if (status && status !== "all") params.set("status", status);
    const qs = params.toString();
    return apiFetch<{ runs: RunRecord[] }>(`/v1/worldsmith/runs${qs ? `?${qs}` : ""}`);
  },
  listAssets: () =>
    apiFetch<{ assets: Array<{ id: string; asset_name: string; component_type: string; world: string; current_version: string; readiness_state: string; updated_at: string }> }>("/v1/worldsmith/assets"),
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function WorldSmithCompiler() {
  const { toast } = useToast();
  const [specId, setSpecId] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [activeTab, setActiveTab] = useState<"compiler" | "runs" | "assets">("compiler");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // ── Mutations ───────────────────────────────────────────────────────────────
  const compile = useMutation({
    mutationFn: ({ id, dry }: { id: string; dry: boolean }) => worldsmithApi.compile(id, dry),
    onSuccess: (res) => {
      setResult(res);
      if (res.status === "compiled") {
        toast({ title: "Compiled successfully", description: `Hash: ${res.prompt_hash?.slice(0, 12)}…` });
      } else {
        toast({ title: "Compilation blocked", description: res.errors?.[0]?.message, variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Request failed", description: err.message, variant: "destructive" });
    },
  });

  const preview = useMutation({
    mutationFn: (id: string) => worldsmithApi.preview(id),
    onSuccess: (res) => {
      setResult(res);
    },
    onError: (err: Error) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Queries ─────────────────────────────────────────────────────────────────
  const runsQuery = useQuery({
    queryKey: ["worldsmith-runs", specId, statusFilter],
    queryFn: () => worldsmithApi.listRuns(specId.trim() || undefined, statusFilter),
    enabled: activeTab === "runs",
    staleTime: 10_000,
  });

  const assetsQuery = useQuery({
    queryKey: ["worldsmith-assets"],
    queryFn: () => worldsmithApi.listAssets(),
    enabled: activeTab === "assets",
    staleTime: 30_000,
  });

  const isPending = compile.isPending || preview.isPending;
  const canSubmit = !!specId.trim() && !isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#C87560]/10 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[#C87560]" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">WorldSmith Prompt Compiler</h1>
          <p className="text-xs text-muted-foreground">
            Compile Production Specifications from Notion → validated, hashed prompt
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["compiler", "runs", "assets"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-[#1B2A4A] text-[#1B2A4A]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Compiler tab ─────────────────────────────────────────────────── */}
      {activeTab === "compiler" && (
        <div className="space-y-6">
          {/* Input card */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spec-id">Notion Production Specification page ID</Label>
                <Input
                  id="spec-id"
                  placeholder="e.g. 1a2b3c4d-5e6f-7890-abcd-ef1234567890"
                  value={specId}
                  onChange={(e) => { setSpecId(e.target.value); setResult(null); }}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Paste the page ID from the Notion URL — the 32-character hex string after the last dash.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dry-run"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="dry-run" className="text-sm font-normal cursor-pointer">
                  Dry run — compile without writing back to Notion or Daybook
                </Label>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => compile.mutate({ id: specId, dry: dryRun })}
                  disabled={!canSubmit}
                  className="bg-[#1B2A4A] hover:bg-[#2a3d6a] text-white"
                >
                  {compile.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Compiling…</>
                    : <><Sparkles className="w-4 h-4 mr-2" />{dryRun ? "Dry Run" : "Compile"}</>}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => preview.mutate(specId)}
                  disabled={!canSubmit}
                >
                  {preview.isPending
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Previewing…</>
                    : <><FileText className="w-4 h-4 mr-2" />Preview only</>}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Result */}
          {result && <CompileResult result={result} showPrompt={showPrompt} setShowPrompt={setShowPrompt} />}
        </div>
      )}

      {/* ── Runs tab ─────────────────────────────────────────────────────── */}
      {activeTab === "runs" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Filter by spec ID (optional)"
              value={specId}
              onChange={(e) => setSpecId(e.target.value)}
              className="max-w-sm font-mono text-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
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

          {runsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading runs…
            </div>
          )}
          {runsQuery.isError && !runsQuery.isLoading && (
            <div className="flex items-center gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-700">Failed to load runs</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {(runsQuery.error as Error)?.message ?? "Unknown error"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => runsQuery.refetch()}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry
              </Button>
            </div>
          )}
          {!runsQuery.isLoading && !runsQuery.isError && (
            <p className="text-xs text-muted-foreground">
              {(runsQuery.data?.runs ?? []).length === 0
                ? "No runs found."
                : `${(runsQuery.data?.runs ?? []).length} run${(runsQuery.data?.runs ?? []).length === 1 ? "" : "s"} shown`}
            </p>
          )}
          <div className="space-y-2">
            {(runsQuery.data?.runs ?? []).map((run) => (
              <RunRow key={run.run_id} run={run} />
            ))}
          </div>
        </div>
      )}

      {/* ── Assets tab ───────────────────────────────────────────────────── */}
      {activeTab === "assets" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => assetsQuery.refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Refresh
            </Button>
          </div>
          {assetsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading assets…
            </div>
          )}
          {(assetsQuery.data?.assets ?? []).length === 0 && !assetsQuery.isLoading && (
            <p className="text-sm text-muted-foreground">No assets registered yet.</p>
          )}
          <div className="space-y-2">
            {(assetsQuery.data?.assets ?? []).map((asset) => (
              <Card key={asset.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium font-mono">{asset.id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {asset.asset_name} · {asset.component_type} · {asset.world}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={asset.readiness_state === "Approved" ? "default" : "secondary"} className="text-xs">
                        {asset.readiness_state}
                      </Badge>
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

// ── Sub-components ────────────────────────────────────────────────────────────

function CompileResult({
  result,
  showPrompt,
  setShowPrompt,
}: {
  result: CompileResponse;
  showPrompt: boolean;
  setShowPrompt: (v: boolean) => void;
}) {
  const { toast } = useToast();

  const statusConfig = {
    compiled: { icon: CheckCircle2, color: "text-emerald-500", label: "Compiled", bg: "bg-emerald-50 border-emerald-200" },
    validation_failed: { icon: XCircle, color: "text-red-500", label: "Validation Failed", bg: "bg-red-50 border-red-200" },
    requires_canon_review: { icon: AlertTriangle, color: "text-amber-500", label: "Requires Canon Review", bg: "bg-amber-50 border-amber-200" },
    failed: { icon: XCircle, color: "text-red-500", label: "Failed", bg: "bg-red-50 border-red-200" },
  };

  const cfg = statusConfig[result.status] ?? statusConfig.failed;
  const Icon = cfg.icon;

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${cfg.bg}`}>
        <Icon className={`w-5 h-5 shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{cfg.label}</p>
          {result.next_action && (
            <p className="text-xs text-muted-foreground mt-0.5">Next: {result.next_action}</p>
          )}
        </div>
        {result.run_id && (
          <code className="text-xs text-muted-foreground shrink-0">run: {result.run_id.slice(0, 8)}…</code>
        )}
      </div>

      {/* Compiled prompt & hash */}
      {result.status === "compiled" && result.compiled_prompt && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Compiled Prompt</CardTitle>
              <div className="flex items-center gap-2">
                <code className="text-xs text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                  {result.prompt_hash?.slice(0, 16)}…
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    navigator.clipboard.writeText(result.compiled_prompt!);
                    toast({ title: "Copied to clipboard" });
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => setShowPrompt(!showPrompt)}
                >
                  {showPrompt ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </CardHeader>
          {showPrompt && (
            <CardContent className="pt-0">
              <Textarea
                readOnly
                value={result.compiled_prompt}
                className="font-mono text-xs resize-none h-64 bg-muted/30"
              />
            </CardContent>
          )}
        </Card>
      )}

      {/* Errors */}
      {(result.errors ?? []).length > 0 && (
        <ErrorList title="Errors" items={result.errors!} variant="error" />
      )}

      {/* Warnings */}
      {(result.warnings ?? []).length > 0 && (
        <ErrorList title="Warnings" items={result.warnings} variant="warning" />
      )}

      {/* Daybook registration */}
      {result.status === "compiled" && result.visual_asset_id && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Visual Asset created/updated in Notion: <code className="font-mono">{result.visual_asset_id}</code>
        </div>
      )}
    </div>
  );
}

function ErrorList({
  title,
  items,
  variant,
}: {
  title: string;
  items: ValidationError[];
  variant: "error" | "warning";
}) {
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
            <div className="flex items-center gap-2">
              <code className="font-mono font-medium">{e.code}</code>
              <span className="text-muted-foreground">·</span>
              <span className="font-medium">{e.field}</span>
              <span className="text-muted-foreground ml-auto">{e.governing_rule}</span>
            </div>
            <p>{e.message}</p>
            <p className={`${variant === "error" ? "text-red-700" : "text-amber-700"} font-medium`}>
              → {e.recommended_action}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
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
  };

  const isInterrupted = run.status === "failed" && run.error_code === "INTERRUPTED";
  const badgeClass = isInterrupted
    ? "bg-orange-100 text-orange-700"
    : (statusColors[run.status] ?? "bg-gray-100 text-gray-600");
  const badgeLabel = isInterrupted ? "interrupted" : run.status;

  const detail = detailQuery.data;

  return (
    <Card className="overflow-hidden">
      {/* Summary row — click to expand */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
      >
        <CardContent className="pt-3 pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass}`}>
              {badgeLabel}
            </span>
            <code className="text-xs font-mono text-muted-foreground">{run.run_id.slice(0, 8)}…</code>
            <code className="text-xs font-mono flex-1 truncate min-w-0">{run.production_spec_id}</code>
            {run.payload_version && (
              <span className="text-xs text-muted-foreground shrink-0 font-mono">v{run.payload_version}</span>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3" />
              {new Date(run.started_at).toLocaleString()}
            </span>
            {run.prompt_hash && (
              <span className="text-xs font-mono text-muted-foreground shrink-0 flex items-center gap-1">
                <Hash className="w-3 h-3" />
                {run.prompt_hash.slice(0, 12)}…
              </span>
            )}
            <span className="ml-auto shrink-0 text-muted-foreground">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
          </div>

          {/* Retry badge (collapsed) */}
          {run.retry_count > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
              <RotateCcw className="w-3 h-3" />
              {run.retry_count} {run.retry_count === 1 ? "retry" : "retries"}
            </span>
          )}

          {/* Inline error preview (collapsed state only) */}
          {!expanded && (run.errors ?? []).length > 0 && (
            <p className="text-xs text-red-600 mt-1.5 pl-0.5">
              {run.errors![0].code}: {run.errors![0].message}
            </p>
          )}
        </CardContent>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
          {detailQuery.isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading details…
            </div>
          )}

          {detailQuery.isError && !detailQuery.isLoading && (
            <div className="flex items-center gap-3 p-3 rounded-md border border-red-200 bg-red-50">
              <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-red-700">Failed to load run details</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {(detailQuery.error as Error)?.message ?? "Unknown error"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 px-2 text-xs border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => detailQuery.refetch()}
              >
                <RefreshCw className="w-3 h-3 mr-1" />Retry
              </Button>
            </div>
          )}

          {detail && (
            <>
              {/* Meta row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground mb-0.5">Run ID</p>
                  <code className="font-mono">{detail.run_id.slice(0, 8)}…</code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Payload version</p>
                  <code className="font-mono">{detail.payload_version ?? "—"}</code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Prompt hash</p>
                  <code className="font-mono">{detail.prompt_hash ? `${detail.prompt_hash.slice(0, 16)}…` : "—"}</code>
                </div>
                <div>
                  <p className="text-muted-foreground mb-0.5">Compiled status</p>
                  <span>{detail.compiled_prompt_status ?? "—"}</span>
                </div>
              </div>

              {/* Full compiled prompt */}
              {detail.compiled_prompt && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compiled Prompt</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(detail.compiled_prompt!);
                        toast({ title: "Copied to clipboard" });
                      }}
                    >
                      <Copy className="w-3 h-3 mr-1" />Copy
                    </Button>
                  </div>
                  <Textarea
                    readOnly
                    value={detail.compiled_prompt}
                    className="font-mono text-xs resize-none h-48 bg-background"
                  />
                </div>
              )}

              {/* Notion retry detail */}
              {(detail.notion_retries ?? []).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Notion Retries ({detail.notion_retries!.length})
                  </p>
                  <div className="rounded-md border border-amber-200 bg-amber-50 divide-y divide-amber-100 overflow-hidden">
                    {detail.notion_retries!.map((r, i) => (
                      <div key={i} className="px-3 py-2 text-xs flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-amber-800 shrink-0">#{r.attempt}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${
                          r.reason === "rate_limited"
                            ? "bg-orange-100 text-orange-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {r.reason === "rate_limited" ? "Rate limited" : "Network error"}
                        </span>
                        <code className="font-mono text-muted-foreground flex-1 min-w-0 truncate">{r.path}</code>
                        <span className="text-muted-foreground shrink-0">{r.delay_ms.toLocaleString()} ms delay</span>
                        <span className="text-muted-foreground shrink-0 tabular-nums">
                          {new Date(r.at).toLocaleTimeString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {(detail.errors ?? []).length > 0 && (
                <ErrorList title="Errors" items={detail.errors!} variant="error" />
              )}

              {/* Warnings */}
              {(detail.warnings ?? []).length > 0 && (
                <ErrorList title="Warnings" items={detail.warnings!} variant="warning" />
              )}

              {!detail.compiled_prompt && (detail.errors ?? []).length === 0 && (detail.warnings ?? []).length === 0 && (detail.notion_retries ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No prompt or diagnostic details available for this run.</p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
