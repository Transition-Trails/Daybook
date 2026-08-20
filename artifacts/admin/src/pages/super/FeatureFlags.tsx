import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, type Store, type StoreFlags } from "@/lib/api";
import { PageHeader, StatusPill, SkeletonRows, ErrorState } from "@/components/shared";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";

interface FlagRow {
  store: Store;
  flags: StoreFlags;
  dirty: boolean;
}

export default function SuperFeatureFlags() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stores = [], isLoading: storesLoading, error } = useQuery({
    queryKey: ["stores"],
    queryFn: storesApi.list,
  });

  const [rows, setRows] = useState<FlagRow[]>([]);

  // Fetch all flags after stores load
  const { data: allFlags = [], isLoading: flagsLoading } = useQuery({
    queryKey: ["all-flags"],
    queryFn: () =>
      Promise.all(stores.map((s) => storesApi.flags.get(s.id).then((f) => ({ storeId: s.id, flags: f })))),
    enabled: stores.length > 0,
  });

  useEffect(() => {
    if (stores.length === 0 || allFlags.length === 0) return;
    const flagMap = new Map(allFlags.map((f) => [f.storeId, f.flags]));
    setRows(
      stores.map((store) => ({
        store,
        flags: flagMap.get(store.id) ?? {
          storeId: store.id, aiEnabled: false, customDomain: false, editionsCap: 5, storageQuota: 1024, inkEnabled: false, worldsmithEnabled: false,
        },
        dirty: false,
      })),
    );
  }, [stores, allFlags]);

  const saveMutation = useMutation({
    mutationFn: ({ storeId, flags }: { storeId: string; flags: Partial<StoreFlags> }) =>
      storesApi.flags.update(storeId, flags),
    onSuccess: (_, { storeId }) => {
      setRows((prev) => prev.map((r) => r.store.id === storeId ? { ...r, dirty: false } : r));
      qc.invalidateQueries({ queryKey: ["all-flags"] });
      toast({ title: "Flags saved" });
    },
    onError: (err: Error) =>
      toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  function updateFlag(storeId: string, key: keyof StoreFlags, value: boolean | number) {
    setRows((prev) =>
      prev.map((r) =>
        r.store.id === storeId
          ? { ...r, flags: { ...r.flags, [key]: value }, dirty: true }
          : r,
      ),
    );
  }

  function saveRow(row: FlagRow) {
    saveMutation.mutate({ storeId: row.store.id, flags: row.flags });
  }

  const isLoading = storesLoading || flagsLoading;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Feature flags"
        description="Per-store capability overrides. Changes take effect immediately."
        scopeLabel="Platform"
      />

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><SkeletonRows rows={4} cols={5} /></div>
        ) : error ? (
          <ErrorState message="Couldn't load store data." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium text-center">AI enabled</th>
                <th className="px-4 py-3 font-medium text-center">Ink</th>
                <th className="px-4 py-3 font-medium text-center">WorldSmith</th>
                <th className="px-4 py-3 font-medium text-center">Custom domain</th>
                <th className="px-4 py-3 font-medium text-center">Editions cap</th>
                <th className="px-4 py-3 font-medium text-center">Storage (MB)</th>
                <th className="px-4 py-3 font-medium text-center">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.store.id} className={row.dirty ? "bg-amber-50/40" : "hover:bg-muted/20 transition-colors"}>
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{row.store.name}</p>
                    <StatusPill status={row.store.status} className="mt-0.5" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={row.flags.aiEnabled}
                      onCheckedChange={(v) => updateFlag(row.store.id, "aiEnabled", v)}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={row.flags.inkEnabled}
                      onCheckedChange={(v) => updateFlag(row.store.id, "inkEnabled", v)}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={row.flags.worldsmithEnabled}
                      onCheckedChange={(v) => updateFlag(row.store.id, "worldsmithEnabled", v)}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Switch
                      checked={row.flags.customDomain}
                      onCheckedChange={(v) => updateFlag(row.store.id, "customDomain", v)}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      className="w-20 mx-auto text-center"
                      value={row.flags.editionsCap}
                      onChange={(e) => updateFlag(row.store.id, "editionsCap", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Input
                      type="number"
                      min={0}
                      className="w-24 mx-auto text-center"
                      value={row.flags.storageQuota}
                      onChange={(e) => updateFlag(row.store.id, "storageQuota", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={!row.dirty || saveMutation.isPending}
                      className="p-1.5 rounded transition-colors"
                      style={
                        row.dirty
                          ? { color: "hsl(12 49% 58%)", background: "hsl(12 49% 95%)" }
                          : { color: "hsl(216 15% 70%)", cursor: "default" }
                      }
                      title="Save changes"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
