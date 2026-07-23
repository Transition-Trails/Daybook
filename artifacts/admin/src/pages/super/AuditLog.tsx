import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { platformApi, type AuditEntry } from "@/lib/api";
import { PageHeader, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Clock } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  "store.create":   "Store created",
  "store.update":   "Store updated",
  "member.assign":  "Member assigned",
  "member.revoke":  "Member removed",
  "catalog.enable": "Catalog item enabled",
  "catalog.disable":"Catalog item disabled",
  "flags.update":   "Feature flags updated",
  "help.create":    "Help article created",
  "help.update":    "Help article updated",
  "help.delete":    "Help article deleted",
};

export default function SuperAuditLog() {
  const [storeFilter, setStoreFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const { data: entries = [], isLoading, error, refetch } = useQuery({
    queryKey: ["audit", storeFilter, actionFilter],
    queryFn: () =>
      platformApi.audit({
        storeId:  storeFilter || undefined,
        action:   actionFilter || undefined,
        limit:    200,
      }),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Audit log"
        description="Every admin action across the platform, in order."
        scopeLabel="Platform"
      />

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter by store ID…"
            className="pl-9"
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
          />
        </div>
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Filter by action…"
            className="pl-9"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><SkeletonRows rows={8} cols={5} /></div>
        ) : error ? (
          <ErrorState message="Couldn't load audit log." onRetry={() => refetch()} />
        ) : entries.length === 0 ? (
          <EmptyState title="No entries found" description="Try adjusting your filters." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((e: AuditEntry) => (
                <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    <span className="font-medium text-foreground">
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground font-mono text-xs">{e.actorUserId}</p>
                    <p className="text-muted-foreground text-xs">{e.actorRole}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs"
                      style={{
                        background: e.scope === "platform" ? "hsl(221 46% 95%)" : "hsl(35 52% 94%)",
                        borderColor: e.scope === "platform" ? "hsl(221 46% 85%)" : "hsl(37 37% 85%)",
                        color: e.scope === "platform" ? "hsl(221 46% 30%)" : "hsl(216 27% 40%)",
                      }}
                    >
                      {e.scope}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {e.targetId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <time dateTime={e.createdAt}>
                        {new Date(e.createdAt).toLocaleString()}
                      </time>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Showing {entries.length} entries
      </p>
    </div>
  );
}
