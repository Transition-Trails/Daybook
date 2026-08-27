import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Clock3 } from "lucide-react";
import { platformApi, releasesApi, storesApi, type ReleaseWithNotes, type Store } from "@/lib/api";
import { EmptyState, ErrorState, MetricStrip, PageHeader, Pill, SkeletonRows } from "@/components/shared";
import { Checkbox } from "@/components/ui/checkbox";

function age(date: string | Date) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default function SuperDashboard() {
  const [hideSeed, setHideSeed] = useState(true);
  const statsQuery = useQuery({ queryKey: ["platform/stats"], queryFn: platformApi.stats });
  const storesQuery = useQuery({ queryKey: ["stores"], queryFn: storesApi.list });
  const { data: releases = [] } = useQuery<ReleaseWithNotes[]>({ queryKey: ["releases"], queryFn: releasesApi.list });
  const { data: audit = [], isLoading: auditLoading } = useQuery({
    queryKey: ["audit/recent"],
    queryFn: () => platformApi.audit({ limit: 4 }),
  });

  const allStores = storesQuery.data ?? [];
  const seedStores = allStores.filter((store) => Boolean((store as Store & { isSeed?: boolean }).isSeed));
  const visibleStores = hideSeed ? allStores.filter((store) => !(store as Store & { isSeed?: boolean }).isSeed) : allStores;
  const decisions = useMemo(() => visibleStores
    .filter((store) => store.status === "suspended" || store.status === "trial")
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 6)
    .map((store) => ({
      id: store.id,
      title: store.status === "suspended" ? `${store.name} is suspended` : `${store.name}'s trial needs review`,
      meta: store.status === "suspended"
        ? "Payment recovery is blocking storefront activity."
        : "Trial conversion is approaching without an active-plan decision.",
      tone: store.status === "suspended" ? "warn" as const : "info" as const,
      category: store.status === "suspended" ? "Billing" : "Trial",
      updatedAt: store.updatedAt,
    })), [visibleStores]);

  const stats = statsQuery.data;
  const metrics = [
    { label: "MRR", value: `$${stats?.mrr.amountUsd.toLocaleString() ?? "—"}`, delta: "Current total", neutral: true },
    { label: "Paying stores", value: visibleStores.filter((s) => s.status === "active" && s.plan === "pro").length, delta: "Current total", neutral: true },
    { label: "Trial → paid", value: "Unavailable", delta: "Not measured", neutral: true },
    { label: "Planners built", value: stats?.planners.total ?? "—", delta: "Current total", neutral: true },
    { label: "Failed builds", value: "Unavailable", delta: "Not measured", neutral: true },
  ];

  return (
    <div className="space-y-7">
      <PageHeader title="Dashboard" description="Signals that need a platform decision, not another report." />
      <div className="flex items-center justify-end gap-2 text-xs text-[#7A6A57]">
        <Checkbox id="hide-seed" checked={hideSeed} onCheckedChange={(value) => setHideSeed(value === true)} />
        <label htmlFor="hide-seed">Hide test &amp; seed stores</label>
        <span>· {hideSeed ? `${seedStores.length} hidden` : "included"}</span>
      </div>

      {statsQuery.isLoading ? <SkeletonRows rows={2} cols={5} /> :
        statsQuery.error ? <ErrorState message="Couldn't load platform metrics." onRetry={() => statsQuery.refetch()} /> :
        <MetricStrip metrics={metrics} />}

      <div className="grid gap-5 lg:grid-cols-[1.55fr_.85fr]">
        <section className="overflow-hidden rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9] shadow-[0_1px_3px_rgba(27,42,74,.06)]">
          <div className="border-b border-[#F2EAE0] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8A7A66]">Needs a decision</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-[#1B2A4A]">Human judgment queue</h2>
          </div>
          {storesQuery.isLoading ? <div className="p-5"><SkeletonRows rows={4} cols={2} /></div> :
            decisions.length === 0 ? <EmptyState title="No decisions waiting" description="The current store signals do not need intervention." /> :
            <ul className="divide-y divide-[#F2EAE0]">
              {decisions.map((item) => (
                <li key={item.id}>
                  <Link href={`/super/stores/${item.id}/inspect`}>
                    <span className="flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors hover:bg-[#FBF6EE]">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.tone === "warn" ? "bg-[#C87560]" : "bg-[#3A5480]"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-[#1B2A4A]">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-[#7A6A57]">{item.meta}</span>
                      </span>
                      <Pill tone={item.tone}>{item.category}</Pill>
                      <span className="font-mono text-[10px] text-[#8A7A66]">{age(item.updatedAt)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>}
        </section>

        <div className="space-y-5">
          <section className="rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9] p-5 shadow-[0_1px_3px_rgba(27,42,74,.06)]">
            <h2 className="font-display text-base font-semibold text-[#1B2A4A]">Release runway</h2>
            <ul className="mt-3 divide-y divide-[#F2EAE0]">
              {releases.slice(0, 4).map((release) => (
                <li key={release.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-[#1B2A4A]">Version {release.version}</p>
                    <p className="text-[10px] text-[#8A7A66]">{release.releaseDate ? new Date(release.releaseDate).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "Unscheduled"}</p>
                  </div>
                  <Pill tone={release.isPublished ? "live" : "draft"}>{release.isPublished ? "Live" : "Draft"}</Pill>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[14px] bg-[#1B2A4A] p-5 text-white shadow-[0_1px_3px_rgba(27,42,74,.06)]">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#8FA0BC]" />
              <h2 className="font-display text-base font-semibold">Audit stream</h2>
            </div>
            {auditLoading ? <div className="mt-4 opacity-40"><SkeletonRows rows={3} cols={1} /></div> :
              <ul className="mt-3 divide-y divide-white/10">
                {audit.slice(0, 4).map((entry) => (
                  <li key={entry.id} className="py-2.5">
                    <p className="truncate text-xs text-[#C6D2E4]">{entry.action}</p>
                    <p className="mt-1 font-mono text-[9px] text-[#8FA0BC]">{new Date(entry.createdAt).toLocaleString()}</p>
                  </li>
                ))}
              </ul>}
            <Link href="/super/audit"><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white">Open audit log <ArrowRight className="h-3 w-3" /></span></Link>
          </section>
        </div>
      </div>
    </div>
  );
}