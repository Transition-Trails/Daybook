import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Clock3 } from "lucide-react";
import { platformApi, recipesApi, storesApi } from "@/lib/api";
import { EmptyState, ErrorState, MetricStrip, PageHeader, Pill, SkeletonRows } from "@/components/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { billingTrendValues, buildRecipeReleaseRunway, deriveDecisionSignals, formatPercent } from "@/lib/dashboard-insights";

function age(date: string | Date) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function periodDelta(values: number[]) {
  const current = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? 0;
  const difference = current - previous;
  return `${difference >= 0 ? "+" : ""}${difference} vs last month`;
}

function currencyPeriodDelta(values: number[]) {
  const current = values.at(-1) ?? 0;
  const previous = values.at(-2) ?? 0;
  const difference = current - previous;
  return `${difference >= 0 ? "+" : "-"}$${Math.abs(difference).toLocaleString("en-US")} vs last month`;
}

function sixPointSeries(values: Array<number | null> | null | undefined) {
  return Array.from({ length: 6 }, (_, index) => values?.[index] ?? 0);
}

export default function SuperDashboard() {
  const [hideSeed, setHideSeed] = useState(true);
  const statsQuery = useQuery({
    queryKey: ["platform/stats", { includeSeed: !hideSeed }],
    queryFn: () => platformApi.stats({ includeSeed: !hideSeed }),
  });
  // The dashboard needs the complete set to report how many fixtures are
  // hidden, so this is an intentional, explicit override of the API default.
  const storesQuery = useQuery({
    queryKey: ["stores", { includeSeed: true }],
    queryFn: () => storesApi.list({ includeSeed: true }),
  });
  const recipesQuery = useQuery({
    queryKey: ["platform-recipes"],
    queryFn: recipesApi.list,
  });
  const { data: audit = [], isLoading: auditLoading } = useQuery({
    queryKey: ["audit/recent"],
    queryFn: () => platformApi.audit({ limit: 4 }),
  });

  const allStores = storesQuery.data ?? [];
  const seedStores = allStores.filter((store) => store.isSeed);
  const visibleStores = hideSeed ? allStores.filter((store) => !store.isSeed) : allStores;
  const stats = statsQuery.data;
  const recipes = recipesQuery.data ?? [];
  const decisions = useMemo(
    () => stats ? deriveDecisionSignals(visibleStores, recipes, stats).slice(0, 6) : [],
    [visibleStores, recipes, stats],
  );
  const runway = useMemo(() => buildRecipeReleaseRunway(recipes, new Date(), 4), [recipes]);
  const activity = stats?.activitySeries;
  const billing = stats?.billingAnalytics;
  const billingTrends = stats ? billingTrendValues(stats) : undefined;
  const latestConversion = billing?.trialConversion.latestMatured;
  const previousConversion = billing?.trialConversion.previousMatured;
  const conversionDelta = latestConversion && previousConversion
    ? `${(latestConversion.conversionRatePercent ?? 0) - (previousConversion.conversionRatePercent ?? 0) >= 0 ? "+" : ""}${((latestConversion.conversionRatePercent ?? 0) - (previousConversion.conversionRatePercent ?? 0)).toFixed(1)} pts vs prior mature cohort`
    : "No prior mature cohort";
  const metrics = [
    {
      label: "MRR",
      value: billing ? `$${billing.mrr.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—",
      delta: billingTrends ? currencyPeriodDelta(billingTrends.revenue) : "Loading",
      values: sixPointSeries(billingTrends?.revenue),
      desirable: true,
    },
    {
      label: "Trial → paid",
      value: formatPercent(latestConversion?.conversionRatePercent ?? null),
      delta: latestConversion && previousConversion ? conversionDelta : "No prior mature cohort",
      values: sixPointSeries(billingTrends?.conversion),
      desirable: true,
    },
    {
      label: "New stores",
      value: activity?.newStores.at(-1) ?? "—",
      delta: activity ? periodDelta(activity.newStores) : "Loading",
      values: sixPointSeries(activity?.newStores),
      desirable: true,
    },
    {
      label: "Completed builds",
      value: activity?.completedBuilds.at(-1) ?? "—",
      delta: activity ? periodDelta(activity.completedBuilds) : "Loading",
      values: sixPointSeries(activity?.completedBuilds),
      desirable: true,
    },
    {
      label: "Failed builds",
      value: activity?.failedBuilds.at(-1) ?? "—",
      delta: activity ? periodDelta(activity.failedBuilds) : "Loading",
      values: sixPointSeries(activity?.failedBuilds),
      desirable: false,
    },
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
      {billing && billingTrends && (
        <p className="-mt-4 text-[11px] text-[#8A7A66]">
          MRR uses successful annual USD subscription revenue ÷ 12; Trial → paid uses mature 30-day UTC owner cohorts.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.55fr_.85fr]">
        <section className="overflow-hidden rounded-[14px] border border-[#E7DCCB] bg-[#FFFDF9] shadow-[0_1px_3px_rgba(27,42,74,.06)]">
          <div className="border-b border-[#F2EAE0] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#8A7A66]">Needs a decision</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-[#1B2A4A]">Human judgment queue</h2>
          </div>
          {storesQuery.isLoading || statsQuery.isLoading || recipesQuery.isLoading ? <div className="p-5"><SkeletonRows rows={4} cols={2} /></div> :
            decisions.length === 0 ? <EmptyState title="No decisions waiting" description="The current store signals do not need intervention." /> :
            <ul className="divide-y divide-[#F2EAE0]">
              {decisions.map((item) => (
                <li key={item.id}>
                  <Link href={item.href}>
                    <span className="flex cursor-pointer items-start gap-3 px-5 py-4 transition-colors hover:bg-[#FBF6EE]">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.severity === "critical" ? "bg-[#A85B48]" : item.severity === "warning" ? "bg-[#C87560]" : "bg-[#3A5480]"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-[#1B2A4A]">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-[#7A6A57]">{item.description}</span>
                      </span>
                      <Pill tone={item.severity === "critical" || item.severity === "warning" ? "warn" : "info"}>{item.category}</Pill>
                      <span className="font-mono text-[10px] text-[#8A7A66]">{age(item.occurredAt)}</span>
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
              {runway.map((month) => (
                <li key={month.key} className="flex items-start justify-between gap-3 py-2.5">
                  <p className="w-16 shrink-0 font-mono text-[10px] text-[#8A7A66]">{month.label}</p>
                  <div className="min-w-0 flex-1 text-right">
                    {month.recipes.length === 0
                      ? <p className="text-xs italic text-[#A2937E]">No recipe scheduled</p>
                      : month.recipes.map((recipe) => (
                        <p key={recipe.id} className="truncate text-sm font-medium text-[#1B2A4A]">
                          {recipe.name} <Pill tone={recipe.status === "live" ? "live" : "draft"}>{recipe.status}</Pill>
                        </p>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
            <Link href="/super/recipes"><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1B2A4A]">Open product recipes <ArrowRight className="h-3 w-3" /></span></Link>
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