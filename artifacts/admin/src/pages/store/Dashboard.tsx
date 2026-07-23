import { useQuery } from "@tanstack/react-query";
import { storesApi, platformApi } from "@/lib/api";
import { PageHeader, StatTile, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Users, ShoppingBag, Clock, BookCopy } from "lucide-react";

interface Props {
  storeId: string;
  role: string;
}

export default function StoreDashboard({ storeId, role }: Props) {
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["store-members", storeId],
    queryFn: () => storesApi.members.list(storeId),
  });

  const { data: catalog = [], isLoading: catalogLoading } = useQuery({
    queryKey: ["store-catalog", storeId],
    queryFn: () => storesApi.catalog.list(storeId),
  });

  const { data: audit = [], isLoading: auditLoading } = useQuery({
    queryKey: ["audit/store", storeId],
    queryFn: () => platformApi.audit({ storeId, limit: 15 }),
  });

  const isLoading = membersLoading || catalogLoading;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageHeader
        title="Dashboard"
        description="Your store at a glance."
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <StatTile
            label="Staff members"
            value={members.filter((m) => m.role !== "customer").length}
            sub={`${members.filter((m) => m.role === "customer").length} customers`}
            icon={Users}
          />
          <StatTile
            label="Catalog items enabled"
            value={catalog.length}
            icon={ShoppingBag}
          />
          <StatTile
            label="Planner builds"
            value={catalog.filter((c) => c.itemType === "edition").length}
            sub="Editions enabled"
            icon={BookCopy}
          />
        </div>
      )}

      {/* Recent activity */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-display font-semibold text-sm">Recent activity</h2>
        </div>
        {auditLoading ? (
          <div className="p-5"><SkeletonRows rows={5} cols={2} /></div>
        ) : audit.length === 0 ? (
          <EmptyState title="No activity yet" description="Actions in your store will appear here." />
        ) : (
          <ul className="divide-y divide-border max-h-72 overflow-y-auto">
            {audit.map((entry: any) => (
              <li key={entry.id} className="px-5 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">
                    <span className="font-medium">{entry.action}</span>
                    {entry.targetId && (
                      <span className="text-muted-foreground"> · {entry.targetId}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{entry.actorRole}</p>
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
  );
}
