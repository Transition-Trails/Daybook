import { useQuery } from "@tanstack/react-query";
import { platformApi } from "@/lib/api";
import { PageHeader, StatTile, SkeletonRows, ErrorState, EmptyState, StatusPill } from "@/components/shared";
import { Store, Users, TrendingUp, BookCopy, AlertTriangle, Clock } from "lucide-react";
import { Link } from "wouter";

export default function SuperDashboard() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } =
    useQuery({ queryKey: ["platform/stats"], queryFn: platformApi.stats });

  const { data: audit = [], isLoading: auditLoading } =
    useQuery({
      queryKey: ["audit/recent"],
      queryFn: () => platformApi.audit({ limit: 15 }),
    });

  const { data: stores = [], isLoading: storesLoading } =
    useQuery({
      queryKey: ["stores"],
      queryFn: async () => {
        const res = await fetch("/api/stores", { credentials: "include" });
        if (!res.ok) return [];
        return res.json();
      },
    });

  const attentionStores = (stores as any[]).filter(
    (s: any) => s.status === "suspended" || s.status === "trial",
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageHeader
        title="Dashboard"
        description="Platform health at a glance."
        scopeLabel="Platform"
      />

      {/* Stat tiles */}
      {statsLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : statsError ? (
        <ErrorState message="Couldn't load platform stats." onRetry={() => refetchStats()} />
      ) : stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total stores"
            value={stats.stores.total}
            sub={`${stats.stores.active} active`}
            icon={Store}
          />
          <StatTile
            label="Users"
            value={stats.users.total}
            icon={Users}
          />
          <StatTile
            label="MRR"
            value={`$${stats.mrr.amountUsd.toLocaleString()}`}
            sub="Pro stores × $49"
            icon={TrendingUp}
          />
          <StatTile
            label="Planners generated"
            value={stats.planners.total}
            icon={BookCopy}
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Stores needing attention */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="font-display font-semibold text-sm">Stores needing attention</h2>
          </div>
          {storesLoading ? (
            <div className="p-5"><SkeletonRows rows={3} cols={3} /></div>
          ) : attentionStores.length === 0 ? (
            <EmptyState title="All stores look healthy" description="No trial or suspended stores right now." />
          ) : (
            <ul className="divide-y divide-border">
              {attentionStores.map((s: any) => (
                <li key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <Link href="/super/stores">
                      <span className="text-sm font-medium text-foreground hover:text-primary cursor-pointer">
                        {s.name}
                      </span>
                    </Link>
                    <p className="text-xs text-muted-foreground">{s.plan} plan</p>
                  </div>
                  <StatusPill status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h2 className="font-display font-semibold text-sm">Recent activity</h2>
            </div>
            <Link href="/super/audit">
              <span className="text-xs text-primary hover:underline cursor-pointer">View all</span>
            </Link>
          </div>
          {auditLoading ? (
            <div className="p-5"><SkeletonRows rows={5} cols={2} /></div>
          ) : audit.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-border max-h-72 overflow-y-auto">
              {audit.map((entry: any) => (
                <li key={entry.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground truncate">
                      <span className="font-medium">{entry.action}</span>
                      {entry.targetId && <span className="text-muted-foreground"> · {entry.targetId}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {entry.actorRole} · {entry.scope}
                    </p>
                  </div>
                  <time className="text-xs text-muted-foreground shrink-0 mt-0.5">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
