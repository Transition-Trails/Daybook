import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, type Store } from "@/lib/api";
import { PageHeader, StatusPill, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, ExternalLink, Search, ArrowRight } from "lucide-react";
import type { StorePlan, StoreStatus } from "@/lib/api";
import { Link, useLocation } from "wouter";

type Filter = "all" | "active" | "trial" | "suspended";

export default function SuperStores() {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data: stores = [], isLoading, error, refetch } = useQuery({
    queryKey: ["stores"],
    queryFn: () => storesApi.list(),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Store> }) =>
      storesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stores"] });
      toast({ title: "Store updated" });
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });
  const enterMutation = useMutation({
    mutationFn: (storeId: string) => storesApi.impersonation.enter(storeId),
    onSuccess: ({ impersonation }) => {
      qc.setQueryData(["/api/auth/me"], (current: unknown) => (
        current && typeof current === "object"
          ? { ...current, impersonation }
          : current
      ));
      navigate(`/store/${impersonation.storeId}`);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: Error) => toast({
      title: "Could not enter store",
      description: err.message,
      variant: "destructive",
    }),
  });

  const filtered = stores.filter(
    (s) => filter === "all" || s.status === filter,
  );

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all",       label: "All" },
    { key: "active",    label: "Active" },
    { key: "trial",     label: "Trial" },
    { key: "suspended", label: "Suspended" },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Stores"
        description="Manage every merchant on the platform."
        scopeLabel="Platform"
        actions={
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="sm" style={{ background: "hsl(12 49% 58%)", color: "#fff" }}>
                <Plus className="w-4 h-4 mr-1.5" />
                New store
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Create store</SheetTitle>
              </SheetHeader>
              <NewStoreForm onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["stores"] }); }} />
            </SheetContent>
          </Sheet>
        }
      />

      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="px-3 py-1 rounded-full text-sm border transition-colors"
            style={
              filter === f.key
                ? { background: "hsl(221 46% 17%)", color: "#fff", borderColor: "hsl(221 46% 17%)" }
                : { background: "hsl(40 100% 99%)", color: "hsl(216 27% 40%)", borderColor: "hsl(37 37% 85%)" }
            }
          >
            {f.label}
            {f.key !== "all" && (
              <span className="ml-1.5 opacity-60">
                {stores.filter((s) => s.status === f.key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6"><SkeletonRows rows={5} cols={5} /></div>
        ) : error ? (
          <ErrorState message="Couldn't load stores." onRetry={() => refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No stores here" description={`No ${filter} stores found.`} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-5 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Members</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-medium text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.id}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.plan} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      {s.memberCount ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={s.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 items-center flex-wrap">
                      {/* Inspector — read-only support view */}
                      <Link href={`/super/stores/${s.id}/inspect`}>
                        <span className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer font-medium">
                          <Search className="w-3 h-3" />Inspect
                        </span>
                      </Link>
                      {/* Enter store — opens store admin console in support mode */}
                      <Link
                        href={`/store/${s.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          if (!enterMutation.isPending) enterMutation.mutate(s.id);
                        }}
                      >
                        <span
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                          style={{
                            background: "hsl(221 46% 17%)",
                            color: "hsl(35 50% 82%)",
                          }}
                          onMouseEnter={e => {
                            (e.currentTarget as HTMLElement).style.background = "hsl(221 46% 24%)";
                          }}
                          onMouseLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = "hsl(221 46% 17%)";
                          }}
                          aria-disabled={enterMutation.isPending}
                        >
                          <ArrowRight className="w-3 h-3" />Enter store
                        </span>
                      </Link>
                      {s.status !== "suspended" ? (
                        <button
                          onClick={() => patchMutation.mutate({ id: s.id, data: { status: "suspended" } })}
                          className="text-xs text-destructive hover:underline"
                          disabled={patchMutation.isPending}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => patchMutation.mutate({ id: s.id, data: { status: "active" } })}
                          className="text-xs text-emerald-600 hover:underline"
                          disabled={patchMutation.isPending}
                        >
                          Activate
                        </button>
                      )}
                      {s.status !== "suspended" && s.slug && (
                        <a
                          href={`/s/${s.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Storefront
                        </a>
                      )}
                    </div>
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

function NewStoreForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<{
    id: string; name: string; slug: string; ownerUserId: string;
    plan: StorePlan; status: StoreStatus;
  }>({
    id: "", name: "", slug: "", ownerUserId: "", plan: "starter", status: "trial",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await storesApi.create(form);
      toast({ title: "Store created" });
      onDone();
    } catch (err: any) {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        required
        placeholder={placeholder}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      {field("id", "Store ID", "store-acme")}
      {field("name", "Store name", "Acme Co.")}
      {field("slug", "Slug", "acme")}
      {field("ownerUserId", "Owner user ID")}
      <div className="space-y-1.5">
        <Label>Plan</Label>
        <Select value={form.plan} onValueChange={(v) => setForm((p) => ({ ...p, plan: v as StorePlan }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="w-full" style={{ background: "hsl(12 49% 58%)", color: "#fff" }}>
        Create store
      </Button>
    </form>
  );
}
