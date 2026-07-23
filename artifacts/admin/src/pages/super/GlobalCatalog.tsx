import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { catalogApi, type CatalogItem } from "@/lib/api";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Info } from "lucide-react";

type Tab = "themes" | "packs" | "inserts" | "products";

const TABS: { key: Tab; label: string; fetcher: () => Promise<CatalogItem[]>; updater: (id: string, d: Partial<CatalogItem>) => Promise<CatalogItem> }[] = [
  { key: "themes",   label: "Themes",           fetcher: catalogApi.themes,   updater: catalogApi.updateTheme },
  { key: "packs",    label: "Sticker packs",    fetcher: catalogApi.packs,    updater: catalogApi.updatePack },
  { key: "inserts",  label: "Inserts",           fetcher: catalogApi.inserts,  updater: catalogApi.updateInsert },
  { key: "products", label: "Related products",  fetcher: catalogApi.products, updater: catalogApi.updateProduct },
];

export default function SuperGlobalCatalog() {
  const [tab, setTab] = useState<Tab>("themes");
  const { toast } = useToast();
  const qc = useQueryClient();

  const current = TABS.find((t) => t.key === tab)!;

  const { data: items = [], isLoading, error, refetch } = useQuery({
    queryKey: ["catalog", tab],
    queryFn: current.fetcher,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      current.updater(id, { globalAvailable: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", tab] }),
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Global catalog"
        description="Items marked as available appear in every store's curated menu."
        scopeLabel="Platform"
      />

      {/* Info note */}
      <div
        className="flex items-start gap-3 rounded-lg border p-4 text-sm"
        style={{ background: "hsl(38 65% 94%)", borderColor: "hsl(38 40% 85%)", color: "hsl(38 50% 30%)" }}
      >
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Stores curate from this list — they can enable any item marked <strong>Available</strong> for their own storefront.
          Items not marked available are hidden from store-level menus.
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={
              tab === t.key
                ? { borderColor: "hsl(12 49% 58%)", color: "hsl(12 49% 48%)" }
                : { borderColor: "transparent", color: "hsl(216 15% 50%)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Items */}
      {isLoading ? (
        <SkeletonRows rows={6} cols={4} />
      ) : error ? (
        <ErrorState message="Couldn't load catalog items." onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No items yet" description="Add items to this catalog from the Daybook Admin." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium text-right">Available to stores</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3 font-medium text-foreground">{item.name}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{item.id}</td>
                  <td className="px-4 py-3 text-right">
                    <Switch
                      checked={!!item.globalAvailable}
                      onCheckedChange={(v) =>
                        toggleMutation.mutate({ id: item.id, value: v })
                      }
                      disabled={toggleMutation.isPending}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
