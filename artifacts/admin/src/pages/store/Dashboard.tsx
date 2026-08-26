import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, platformApi, storeProfileApi, type DefaultMode } from "@/lib/api";
import { PageHeader, StatTile, SkeletonRows, ErrorState, EmptyState } from "@/components/shared";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Users, ShoppingBag, Clock, BookCopy, ShieldCheck, AlertTriangle, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { isStaffRole, isStoreOwnerRole, isSuperAdminRole } from "@/lib/permissions";

interface Props {
  storeId: string;
  role: string;
}

const MODE_OPTIONS: { value: DefaultMode; label: string; desc: string }[] = [
  { value: "curated",     label: "Curated",     desc: "Licensed-first: store uses platform catalog items." },
  { value: "independent", label: "Independent", desc: "Own-IP: store uses starter set and its own authored items only." },
];

// ── Entitlement admin panel (super_admin only) ──────────────────────────────

function EntitlementPanel({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: store, isLoading } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => storesApi.get(storeId),
  });

  const mutation = useMutation<
    { id: string; subscriptionActive: boolean; defaultMode: DefaultMode },
    Error,
    { subscriptionActive?: boolean; defaultMode?: DefaultMode }
  >({
    mutationFn: (data) => storesApi.entitlement.update(storeId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store", storeId] });
      qc.invalidateQueries({ queryKey: ["store-catalog", storeId] });
      toast({ title: "Entitlement updated" });
    },
    onError: (err) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  if (isLoading || !store) return null;

  const { subscriptionActive, defaultMode } = store;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display font-semibold text-sm">License &amp; entitlement</h2>
        <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
          super_admin
        </span>
      </div>

      <div className="px-5 py-5 space-y-6">
        {/* Subscription active toggle */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Subscription active</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When off, licensed-origin items are gated — new planners cannot be generated from them.
              Starter items always remain available.
            </p>
            {!subscriptionActive && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Currently inactive — licensed content is gated for this store.
              </div>
            )}
          </div>
          <Switch
            checked={subscriptionActive}
            onCheckedChange={(v) => mutation.mutate({ subscriptionActive: v })}
            disabled={mutation.isPending}
          />
        </div>

        {/* Default mode selector */}
        <div>
          <p className="text-sm font-medium text-foreground mb-2">Content mode</p>
          <div className="grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => mutation.mutate({ defaultMode: opt.value })}
                disabled={mutation.isPending || defaultMode === opt.value}
                className={`text-left rounded-lg border px-4 py-3 transition-all ${
                  defaultMode === opt.value
                    ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300"
                    : "border-border bg-muted/20 hover:bg-muted/40"
                }`}
              >
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function getOwnerEntitlementCopy(subscriptionActive: boolean) {
  return subscriptionActive
    ? {
        status: "active",
        summary: "Your store can use licensed catalog content for new planner generations.",
      }
    : {
        status: "inactive",
        summary: "Licensed catalog content is currently gated for new planner generations.",
      };
}

function OwnerEntitlementSummary({ storeId }: { storeId: string }) {
  const { data: store, isLoading } = useQuery({
    queryKey: ["store", storeId],
    queryFn: () => storesApi.get(storeId),
  });

  if (isLoading || !store) return null;
  const entitlement = getOwnerEntitlementCopy(store.subscriptionActive);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display font-semibold text-sm">License status</h2>
        <span
          className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${
            store.subscriptionActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {entitlement.status}
        </span>
      </div>
      <div className="px-5 py-5 space-y-3">
        <p className="text-sm text-foreground">{entitlement.summary}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          If the license lapses, Daybook only blocks new generations that use licensed-origin items.
          Your existing generated files, store records, and starter or store-authored content remain available.
        </p>
        <p className="text-xs text-muted-foreground">
          Content mode: <span className="font-medium text-foreground">{store.defaultMode === "curated" ? "Curated" : "Independent"}</span>
        </p>
      </div>
    </div>
  );
}

// ── Profile setup banner ─────────────────────────────────────────────────────

function ProfileSetupBanner({ storeId }: { storeId: string }) {
  const { data: flags } = useQuery({
    queryKey: ["store-flags", storeId],
    queryFn: () => storesApi.flags.get(storeId),
    staleTime: 60_000,
  });
  const { data: profile } = useQuery({
    queryKey: ["store-profile", storeId],
    queryFn: () => storeProfileApi.get(storeId),
    staleTime: 60_000,
    enabled: flags?.aiEnabled === true,
  });

  if (!flags?.aiEnabled) return null;

  // "Reasonably complete" = both pitch and whatTheySell are set
  const complete = !!(profile?.facts?.pitch && profile?.facts?.whatTheySell);
  if (complete) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#C87560]/30 bg-[#FDF6F1] px-5 py-4">
      <Sparkles className="w-5 h-5 text-[#C87560] mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1B2A4A]">Set up your brand voice</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          AI studios write in your brand voice and state only your facts — once you fill in your store profile.
        </p>
      </div>
      <Link href={`/store/${storeId}/settings/profile`}>
        <button className="shrink-0 flex items-center gap-1 text-xs font-medium text-[#C87560] hover:text-[#A85E4E] transition-colors">
          Set up now
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </Link>
    </div>
  );
}

// ── Main dashboard ──────────────────────────────────────────────────────────

export default function StoreDashboard({ storeId, role }: Props) {
  const isSuperAdmin = isSuperAdminRole(role);
  const isOwner = isStoreOwnerRole(role);

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
      <ProfileSetupBanner storeId={storeId} />

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
            value={members.filter((m) => isStaffRole(m.role)).length}
            sub={`${members.filter((m) => m.role === "customer").length} customers`}
            icon={Users}
          />
          <StatTile
            label="Catalog items enabled"
            value={catalog.length}
            icon={ShoppingBag}
          />
          <StatTile
            label="Planner editions"
            value={catalog.filter((c) => c.itemType === "edition").length}
            sub="Editions enabled"
            icon={BookCopy}
          />
        </div>
      )}

      {/* Entitlement panels — controls for platform admins, status for store owners */}
      {isSuperAdmin && <EntitlementPanel storeId={storeId} />}
      {isOwner && <OwnerEntitlementSummary storeId={storeId} />}

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
