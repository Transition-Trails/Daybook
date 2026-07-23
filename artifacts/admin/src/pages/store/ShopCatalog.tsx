import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, catalogApi, type CatalogItem, type StoreCatalogEntry } from "@/lib/api";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Lock } from "lucide-react";

interface Props {
  storeId: string;
  role: string;
}

type Tab = "themes" | "packs" | "inserts" | "products" | "editions";

const TABS: { key: Tab; label: string; type: string; fetcher: () => Promise<CatalogItem[]> }[] = [
  { key: "themes",   label: "Themes",          type: "theme",   fetcher: catalogApi.themes },
  { key: "packs",    label: "Sticker packs",   type: "pack",    fetcher: catalogApi.packs },
  { key: "inserts",  label: "Inserts",          type: "insert",  fetcher: catalogApi.inserts },
  { key: "products", label: "Related products", type: "product", fetcher: catalogApi.products },
  { key: "editions", label: "Editions",         type: "edition", fetcher: catalogApi.editions },
];

export default function StoreShopCatalog({ storeId, role }: Props) {
  const [tab, setTab] = useState<Tab>("themes");
  const { toast } = useToast();
  const qc = useQueryClient();

  const isReadOnly = role === "support";
  const current = TABS.find((t) => t.key === tab)!;

  const { data: globalItems = [], isLoading: globalLoading, error: globalError } = useQuery({
    queryKey: ["catalog", tab],
    queryFn: current.fetcher,
  });

  const { data: enabled = [], isLoading: enabledLoading } = useQuery({
    queryKey: ["store-catalog", storeId],
    queryFn: () => storesApi.catalog.list(storeId),
  });

  const enabledSet = new Set(
    enabled
      .filter((e) => e.itemType === current.type)
      .map((e) => e.itemId),
  );

  const enableMutation = useMutation<void, Error, { itemId: string; enabled: boolean }>({
    mutationFn: async ({ itemId, enabled }) => {
      if (enabled) {
        await storesApi.catalog.enable(storeId, current.type, itemId);
      } else {
        await storesApi.catalog.disable(storeId, current.type, itemId);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-catalog", storeId] }),
    onError: (err: Error) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const isLoading = globalLoading || enabledLoading;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Shop catalog"
        description={
          isReadOnly
            ? "Items your store has enabled. Contact your store owner to make changes."
            : "Enable items from the global catalog for your storefront."
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap"
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

      {isLoading ? (
        <SkeletonRows rows={6} cols={4} />
      ) : globalError ? (
        <ErrorState message="Couldn't load catalog items." />
      ) : globalItems.length === 0 ? (
        <EmptyState title="No items available" description="The global catalog is empty for this category." />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Availability</th>
                {!isReadOnly && (
                  <th className="px-4 py-3 font-medium text-right">Enabled for store</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {globalItems.map((item) => {
                const isEnabled = enabledSet.has(item.id);
                const isLocked = !item.globalAvailable;
                return (
                  <tr key={item.id} className={`hover:bg-muted/20 transition-colors ${isLocked ? "opacity-60" : ""}`}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={item.status} />
                    </td>
                    <td className="px-4 py-3">
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="w-3 h-3" />
                          Platform only
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-700">Available</span>
                      )}
                    </td>
                    {!isReadOnly && (
                      <td className="px-4 py-3 text-right">
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={(v) => enableMutation.mutate({ itemId: item.id, enabled: v })}
                          disabled={isLocked || enableMutation.isPending}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
