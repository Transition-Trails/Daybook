import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Github, Loader2, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type ContextSnapshotEntityType =
  | "production-specs" | "component-specs" | "style-guides" | "prompt-modules"
  | "collections" | "volumes" | "production-profiles" | "punch-templates";

export interface ContextSnapshotStatus {
  status: "not_generated" | "current" | "out_of_date" | "sync_failed" | string;
  githubPath?: string | null;
  lastSnapshotAt?: string | null;
  lastError?: string | null;
}

/**
 * Shared GitHub context status card used by every editable WorldSmith detail
 * surface. Keeping the API and presentation here prevents the drawers from
 * drifting as new editorial record types are added.
 */
export function ContextSnapshotStatus({
  entityType,
  entityId,
}: {
  entityType: ContextSnapshotEntityType;
  entityId?: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["worldsmith-context-snapshot", entityType, entityId];
  // apiFetch supplies the shared /api proxy prefix.
  const path = `/worldsmith/editorial/context-snapshots/${entityType}/${entityId}`;
  const { data, isLoading } = useQuery<ContextSnapshotStatus | { status: ContextSnapshotStatus } | { snapshot: ContextSnapshotStatus }>({
    queryKey,
    queryFn: () => apiFetch(`${path}/status`),
    enabled: Boolean(entityId),
    staleTime: 30_000,
  });
  const mutation = useMutation({
    mutationFn: () => apiFetch<ContextSnapshotStatus | { status: ContextSnapshotStatus } | { snapshot: ContextSnapshotStatus }>(`${path}/update`, { method: "POST" }),
    onSuccess: result => {
      queryClient.setQueryData(queryKey, result);
      toast({ title: "Context Snapshot updated" });
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Context Snapshot failed", description: error.message, variant: "destructive" });
    },
  });
  if (!entityId) return null;
  const snapshot: ContextSnapshotStatus | undefined = data
    ? ("snapshot" in data ? data.snapshot : typeof data.status === "object" ? data.status : data as ContextSnapshotStatus)
    : undefined;
  const status = snapshot?.status ?? "not_generated";
  const tone = status === "current"
    ? "bg-green-50 text-green-700"
    : status === "sync_failed"
      ? "bg-red-50 text-red-700"
      : "bg-amber-50 text-amber-700";
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5" data-testid={`context-snapshot-${entityType}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Github className="h-4 w-4 text-[var(--admin-clay)]" /> Context Snapshot
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">Readable GitHub context for this Daybook record.</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${tone}`}>
          {isLoading ? "loading…" : status.replace(/_/g, " ")}
        </span>
      </div>
      <dl className="mt-4 space-y-2 text-xs">
        <div>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">GitHub path · context-snapshots branch</dt>
          <dd className="mt-1 break-all font-mono text-[10px] leading-relaxed text-gray-500">{snapshot?.githubPath ?? "—"}</dd>
        </div>
        {snapshot?.lastSnapshotAt && <div className="flex justify-between gap-3 text-gray-500"><dt>Last updated</dt><dd>{new Date(snapshot.lastSnapshotAt).toLocaleString()}</dd></div>}
      </dl>
      {snapshot?.lastError && <p className="mt-3 rounded-lg bg-red-50 p-2 text-[11px] leading-relaxed text-red-700">{snapshot.lastError}</p>}
      <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-900 disabled:opacity-60">
        {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Update Context Snapshot
      </button>
    </section>
  );
}