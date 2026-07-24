import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, catalogApi, type CatalogItem, type ItemOrigin, type EntitlementStatus } from "@/lib/api";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Lock, AlertTriangle } from "lucide-react";

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

// ── Origin badge ────────────────────────────────────────────────────────────

function OriginBadge({ origin }: { origin?: ItemOrigin }) {
  if (!origin) return null;
  const styles: Record<ItemOrigin, { label: string; cls: string }> = {
    starter:  { label: "Starter",  cls: "bg-blue-50 text-blue-700 border-blue-200" },
    licensed: { label: "Licensed", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    owned:    { label: "Yours",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  };
  const { label, cls } = styles[origin];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ── Entitlement status chip ─────────────────────────────────────────────────

function EntitlementChip({ status }: { status?: EntitlementStatus }) {
  if (!status || status === "entitled") return null;
  if (status === "gated-license-lapsed") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
        <AlertTriangle className="w-2.5 h-2.5" />
        License inactive
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">
      Not yours
    </span>
  );
}

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

  // Build a map from itemId → entitlement status for the current tab's type.
  const enabledSet = new Set<string>();
  const entitlementMap = new Map<string, EntitlementStatus>();
  for (const e of enabled) {
    if (e.itemType === current.type) {
      enabledSet.add(e.itemId);
      if (e.entitlementStatus) entitlementMap.set(e.itemId, e.entitlementStatus);
    }
  }

  // Check if any licensed items are lapsed so we can show the top banner.
  const hasLapsedItems = enabled.some(
    (e) => e.entitlementStatus === "gated-license-lapsed",
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

      {/* Subscription-inactive warning banner */}
      {hasLapsedItems && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold">Content license inactive</p>
            <p className="text-xs mt-0.5 text-amber-700">
              This store's subscription is paused. Licensed items shown in the catalog cannot be used to
              generate new planners. Starter items remain fully available. Reactivate the subscription to
              restore access.
            </p>
          </div>
        </div>
      )}

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
                <th className="px-4 py-3 font-medium">Origin</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Availability</th>
                {!isReadOnly && (
                  <th className="px-4 py-3 font-medium text-right">Enabled for store</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {globalItems.map((item) => {
                const isEnabled   = enabledSet.has(item.id);
                const isLocked    = !item.globalAvailable;
                const entiStatus  = isEnabled ? entitlementMap.get(item.id) : undefined;
                const isLapsed    = entiStatus === "gated-license-lapsed";
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-muted/20 transition-colors ${isLocked ? "opacity-60" : ""} ${isLapsed ? "bg-red-50/30" : ""}`}
                  >
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <OriginBadge origin={item.origin as ItemOrigin | undefined} />
                        {isEnabled && <EntitlementChip status={entiStatus} />}
                      </div>
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
