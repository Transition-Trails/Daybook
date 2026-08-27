import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Search, X } from "lucide-react";
import { storesApi, type Store, type StoreFlags } from "@/lib/api";
import { Chip, ErrorState, PageHeader, Pill, SkeletonRows } from "@/components/shared";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  FLAG_KEYS,
  reconcileFlagRows,
  reconcileSavedFlagRows,
  type FlagKey,
  type ReconciledFlagRow,
} from "@/lib/flag-reconciliation";

type FlagRow = ReconciledFlagRow;
type CapabilityKey = "aiEnabled" | "inkEnabled" | "worldsmithEnabled" | "customDomain";
const CAPABILITIES: Array<{ key: CapabilityKey; label: string; hint: string }> = [
  { key: "aiEnabled", label: "AI", hint: "Enables AI-assisted studio tools." },
  { key: "inkEnabled", label: "Ink", hint: "Enables planner annotation and Ink exports." },
  { key: "worldsmithEnabled", label: "WorldSmith", hint: "Allows this store to open WorldSmith Studio." },
  { key: "customDomain", label: "Custom domain", hint: "Allows a branded storefront domain." },
];

export default function SuperFeatureFlags() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [rows, setRows] = useState<FlagRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const storesQuery = useQuery({
    queryKey: ["stores", { includeSeed: true }],
    queryFn: () => storesApi.list({ includeSeed: true }),
  });
  const stores = storesQuery.data ?? [];
  const flagsQuery = useQuery({
    queryKey: ["all-flags", { includeSeed: true }],
    queryFn: () => storesApi.flags.list({ includeSeed: true }),
  });

  useEffect(() => {
    if (!flagsQuery.data) return;
    setRows((current) => reconcileFlagRows(stores, flagsQuery.data, current));
  }, [stores, flagsQuery.data]);

  const dirtyFields = useMemo(() => rows.flatMap((row) =>
    FLAG_KEYS
      .filter((key) => row.flags[key] !== row.original[key])
      .map((key) => ({ storeId: row.store.id, key }))), [rows]);
  const dirtyStoreIds = [...new Set(dirtyFields.map((field) => field.storeId))];
  const changes = useMemo(() => dirtyStoreIds.map((storeId) => {
    const row = rows.find((item) => item.store.id === storeId)!;
    const flags: Partial<StoreFlags> = {};
    for (const key of FLAG_KEYS) {
      if (row.flags[key] !== row.original[key]) {
        (flags as Record<string, boolean | number>)[key] = row.flags[key];
      }
    }
    return { storeId, flags };
  }), [dirtyStoreIds, rows]);

  const save = useMutation({
    mutationFn: (submitted: Array<{ storeId: string; flags: Partial<StoreFlags> }>) =>
      storesApi.flags.updateBulk(submitted).then((serverFlags) => ({ submitted, serverFlags })),
    onSuccess: ({ submitted, serverFlags }) => {
      setRows((current) => reconcileSavedFlagRows(current, submitted, serverFlags));
      qc.invalidateQueries({ queryKey: ["all-flags", { includeSeed: true }] });
      toast({ title: "Capability changes saved" });
    },
    onError: (error: Error) => toast({ title: "Save failed", description: error.message, variant: "destructive" }),
  });

  const update = (storeId: string, key: FlagKey, value: boolean | number) =>
    setRows((current) => current.map((row) => row.store.id === storeId ? { ...row, flags: { ...row.flags, [key]: value } } : row));
  const discard = () => setRows((current) => current.map((row) => ({ ...row, flags: { ...row.original }, conflicts: {} })));
  const visible = rows.filter((row) =>
    row.store.name.toLowerCase().includes(search.toLowerCase()) && (status === "all" || row.store.status === status));
  const active = rows.find((row) => row.store.id === selected);
  const loading = storesQuery.isLoading || flagsQuery.isLoading;

  return (
    <div className="space-y-5 pb-16">
      <PageHeader title="Feature flags" description="Plan capabilities with explicit per-store overrides." />
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#8A7A66]" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search stores" className="border-[#E7DCCB] bg-[#FFFDF9] pl-9" />
        </label>
        {["all", "active", "trial", "suspended"].map((value) => (
          <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize ${status === value ? "border-[#1B2A4A] bg-[#1B2A4A] text-white" : "border-[#E7DCCB] bg-[#FFFDF9] text-[#5C4E3E]"}`}>{value}</button>
        ))}
        <span className="ml-auto font-mono text-[10px] text-[#8A7A66]">{visible.length} of {rows.length} stores</span>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9]">
        <div className="grid grid-cols-[1.6fr_2.1fr_.8fr_.9fr_24px] gap-3 border-b border-[#EFE6D8] bg-[#FBF6EE] px-[18px] py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#8A7A66]">
          <span>Store</span><span>Capabilities</span><span className="text-right">Editions</span><span className="text-right">Storage</span><span />
        </div>
        {loading ? <div className="p-5"><SkeletonRows rows={5} cols={5} /></div> :
          storesQuery.error ? <ErrorState message="Couldn't load store capabilities." /> :
          visible.map((row) => (
            <button key={row.store.id} type="button" aria-label={`Edit feature flags for ${row.store.name}`} onClick={() => setSelected(row.store.id)} className="grid min-h-14 w-full grid-cols-[1.6fr_2.1fr_.8fr_.9fr_24px] items-center gap-3 border-b border-[#F2EAE0] px-[18px] py-2 text-left transition-colors last:border-0 hover:bg-[#FBF6EE]">
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1B2A4A]">{row.store.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                  <Pill tone={row.store.status === "active" ? "live" : row.store.status === "trial" ? "info" : "warn"}>{row.store.status}</Pill>
                  {Object.keys(row.conflicts).length > 0 && <Pill tone="warn">Conflict</Pill>}
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">{CAPABILITIES.map((capability) => <Chip key={capability.key} active={row.flags[capability.key]}>{capability.label}</Chip>)}</span>
              <span className="text-right font-mono text-xs text-[#1B2A4A]">{row.flags.editionsCap}</span>
              <span className="text-right font-mono text-xs text-[#1B2A4A]">{row.flags.storageQuota} MB</span>
              <ChevronRight className="h-4 w-4 text-[#A2937E]" />
            </button>
          ))}
      </div>

      {active && (
        <>
          <button className="fixed inset-0 z-40 bg-[rgba(27,42,74,.28)]" aria-label="Close drawer" onClick={() => setSelected(null)} />
          <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-[420px] max-w-[92vw] flex-col bg-[#FFFDF9] shadow-[-10px_0_34px_rgba(27,42,74,.2)]">
            <div className="flex items-start justify-between border-b border-[#E7DCCB] p-5">
              <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8A7A66]">Capability overrides</p><h2 className="mt-1 font-display text-xl font-semibold text-[#1B2A4A]">{active.store.name}</h2></div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-md p-1 text-[#7A6A57] hover:bg-[#F5EFE5]"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <p className="text-sm leading-5 text-[#5C4E3E]">Overrides sit on top of the store plan. An absent override is not the same as explicitly turning a capability off.</p>
              <div className="mt-5 divide-y divide-[#F2EAE0] rounded-xl border border-[#E7DCCB]">
                {CAPABILITIES.map((capability) => (
                  <label key={capability.key} className="flex items-center gap-3 p-4">
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#1B2A4A]">{capability.label}{active.conflicts[capability.key] && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-[#C87560]">Changed on server</span>}</span><span className="block text-xs text-[#7A6A57]">{capability.hint}</span></span>
                    <Switch checked={active.flags[capability.key]} onCheckedChange={(value) => update(active.store.id, capability.key, value)} />
                  </label>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-[#5C4E3E]">Editions cap{active.conflicts.editionsCap && <span className="ml-1 text-[10px] text-[#C87560]">server changed</span>}<Input type="number" min={1} value={active.flags.editionsCap} onChange={(e) => update(active.store.id, "editionsCap", Number(e.target.value))} className="mt-1 border-[#E7DCCB]" /></label>
                <label className="text-xs font-semibold text-[#5C4E3E]">Storage MB{active.conflicts.storageQuota && <span className="ml-1 text-[10px] text-[#C87560]">server changed</span>}<Input type="number" min={0} value={active.flags.storageQuota} onChange={(e) => update(active.store.id, "storageQuota", Number(e.target.value))} className="mt-1 border-[#E7DCCB]" /></label>
              </div>
              <p className="mt-4 text-xs text-[#8A7A66]">Changes are queued. Nothing is live until you choose Save all.</p>
            </div>
            <div className="border-t border-[#E7DCCB] p-5"><button type="button" onClick={() => navigate(`/store/${active.store.id}`)} className="w-full rounded-lg border border-[#1B2A4A] px-4 py-2 text-sm font-semibold text-[#1B2A4A]">Enter this store</button></div>
          </aside>
        </>
      )}

      {dirtyFields.length > 0 && (
        <div className="fixed bottom-0 left-[246px] right-0 z-30 flex h-14 items-center gap-3 bg-[#1B2A4A] px-6 text-white shadow-[0_-5px_20px_rgba(27,42,74,.15)]">
          <span className="rounded-full bg-[#C87560] px-2 py-1 font-mono text-[10px] font-bold">{dirtyFields.length}</span>
          <span className="text-sm">{dirtyFields.length} unsaved changes, queued — nothing is live yet</span>
          <button type="button" onClick={discard} className="ml-auto rounded-lg px-4 py-2 text-xs font-semibold text-[#C6D2E4]">Discard</button>
          <button type="button" onClick={() => save.mutate(changes)} disabled={save.isPending} className="rounded-lg bg-[#C87560] px-4 py-2 text-xs font-semibold text-white hover:bg-[#A85B48]">{save.isPending ? "Saving…" : "Save all"}</button>
        </div>
      )}
    </div>
  );
}