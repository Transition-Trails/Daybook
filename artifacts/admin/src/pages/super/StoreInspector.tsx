/**
 * StoreInspector — read-only support view for any store.
 * Super admin can see plan/tier, feature flags, members, and recent audit entries
 * without entering the store's own admin console.
 *
 * Separate from "Enter store" (/store/:id). This page never mutates anything.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { storesApi, apiFetch, type StoreMember } from "@/lib/api";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Store, ExternalLink, ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground w-44 shrink-0">{label}</span>
      <span className="text-sm flex-1">{value ?? <span className="text-muted-foreground/50">—</span>}</span>
    </div>
  );
}

function FlagBadge({ on }: { on: boolean }) {
  return (
    <Badge variant={on ? "default" : "secondary"} className="font-mono text-xs">
      {on ? "enabled" : "disabled"}
    </Badge>
  );
}

interface AuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorRole: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export default function StoreInspector({ storeId }: { storeId: string }) {
  const [tab, setTab] = useState("overview");
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const enterMutation = useMutation({
    mutationFn: () => storesApi.impersonation.enter(storeId),
    onSuccess: ({ impersonation }) => {
      queryClient.setQueryData(["/api/auth/me"], (current: unknown) => (
        current && typeof current === "object"
          ? { ...current, impersonation }
          : current
      ));
      navigate(`/store/${impersonation.storeId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: Error) => toast({
      title: "Could not enter store",
      description: err.message,
      variant: "destructive",
    }),
  });

  const { data: stores = [], isLoading: storesLoading } = useQuery({
    queryKey: ["stores", { includeSeed: true }],
    queryFn: () => storesApi.list({ includeSeed: true }),
    staleTime: 30_000,
  });
  const store = stores.find(s => s.id === storeId);

  const { data: flags, isLoading: flagsLoading } = useQuery({
    queryKey: ["store-flags", storeId],
    queryFn: () => storesApi.flags.get(storeId),
    staleTime: 30_000,
  });

  // StoreMember from api.ts has: id, storeId, userId, role, createdAt
  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["store-members", storeId],
    queryFn: () => storesApi.members.list(storeId),
    staleTime: 30_000,
  });

  const { data: auditRaw, isLoading: auditLoading } = useQuery({
    queryKey: ["audit", storeId],
    queryFn: () =>
      apiFetch<{ entries: AuditEntry[] }>(`/audit?storeId=${storeId}&limit=25`),
    staleTime: 60_000,
  });
  const auditEntries: AuditEntry[] = auditRaw?.entries ?? [];

  if (storesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Store <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{storeId}</code> not found.</p>
        <Link href="/super/stores">
          <Button variant="outline" className="mt-4">Back to stores</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/super/stores">
          <Button variant="ghost" size="icon" className="shrink-0 mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-display font-semibold">{store.name}</h1>
            <Badge variant={store.status === "active" ? "default" : "destructive"}>{store.status}</Badge>
            <Badge variant="outline">{store.plan}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-0.5 font-mono">{store.id}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => enterMutation.mutate()}
            disabled={enterMutation.isPending}
          >
            <Store className="w-3.5 h-3.5" />
            {enterMutation.isPending ? "Entering…" : "Enter store"}
          </Button>
          {store.slug && (
            <a href={`/s/${store.slug}`} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                Storefront
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Read-only notice */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm"
        style={{
          background: "hsl(216 60% 97%)",
          borderColor: "hsl(216 40% 88%)",
          color: "hsl(216 40% 45%)",
        }}
      >
        <ShieldCheck className="w-4 h-4 shrink-0" />
        <span>
          Read-only support view — no mutations from this page. Use <strong>Enter store</strong> to access the store's admin console.
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="flags">Feature flags</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        {/* ── Overview ───────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-6 space-y-8">
          <Section title="Identity">
            <div className="border rounded-lg p-4 divide-y">
              <Row label="Store ID" value={<code className="text-xs bg-muted px-1 rounded">{store.id}</code>} />
              <Row label="Display name" value={store.name} />
              {store.slug && <Row label="URL slug" value={<code className="text-xs bg-muted px-1 rounded">{store.slug}</code>} />}
              <Row label="Plan" value={<Badge variant="outline">{store.plan}</Badge>} />
              <Row label="Status" value={
                <Badge variant={store.status === "active" ? "default" : "destructive"}>{store.status}</Badge>
              } />
              <Row label="Members" value={store.memberCount ?? "—"} />
            </div>
          </Section>

          {flags && (
            <Section title="AI &amp; features">
              <div className="border rounded-lg p-4 divide-y">
                <Row label="AI studios" value={<FlagBadge on={flags.aiEnabled} />} />
                <Row label="Custom domain" value={<FlagBadge on={flags.customDomain} />} />
                <Row label="Editions cap" value={flags.editionsCap} />
                <Row label="Storage quota" value={`${flags.storageQuota} MB`} />
              </div>
            </Section>
          )}
        </TabsContent>

        {/* ── Feature flags ──────────────────────────────────────── */}
        <TabsContent value="flags" className="mt-6">
          {flagsLoading ? (
            <p className="text-muted-foreground">Loading flags…</p>
          ) : !flags ? (
            <p className="text-muted-foreground">No flags data available.</p>
          ) : (
            <div className="border rounded-lg divide-y">
              {Object.entries(flags).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between px-4 py-3">
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{key}</code>
                  {typeof val === "boolean" ? (
                    <FlagBadge on={val} />
                  ) : (
                    <span className="text-sm font-mono">{String(val)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Members ────────────────────────────────────────────── */}
        <TabsContent value="members" className="mt-6">
          {membersLoading ? (
            <p className="text-muted-foreground">Loading members…</p>
          ) : !members || members.length === 0 ? (
            <p className="text-muted-foreground">No members found.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">User ID</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(members as StoreMember[]).map(m => (
                    <tr key={m.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <code className="text-xs bg-muted px-1 rounded">{m.userId}</code>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary">{m.role}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Audit log ──────────────────────────────────────────── */}
        <TabsContent value="audit" className="mt-6">
          {auditLoading ? (
            <p className="text-muted-foreground">Loading audit log…</p>
          ) : auditEntries.length === 0 ? (
            <p className="text-muted-foreground">No audit entries for this store.</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Action</th>
                    <th className="px-4 py-2.5 font-medium">Actor</th>
                    <th className="px-4 py-2.5 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditEntries.map(e => (
                    <tr key={e.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5">
                        <code className="text-xs bg-muted px-1 rounded">{e.action}</code>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">
                        {e.actorRole && <Badge variant="outline" className="mr-1">{e.actorRole}</Badge>}
                        {e.actorId ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {e.metadata ? (
                          <code className="text-xs">{JSON.stringify(e.metadata).slice(0, 80)}</code>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
