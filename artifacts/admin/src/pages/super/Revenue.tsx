import { useQuery } from "@tanstack/react-query";
import { platformApi } from "@/lib/api";
import { PageHeader, StatTile, ErrorState } from "@/components/shared";
import { TrendingUp, Store, Activity, Info } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const COLORS: Record<string, string> = {
  active:    "hsl(160 50% 42%)",
  trial:     "hsl(200 60% 52%)",
  suspended: "hsl(0 60% 58%)",
};

export default function SuperRevenue() {
  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ["platform/stats"],
    queryFn: () => platformApi.stats(),
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader
        title="Revenue"
        description="Platform-level financial indicators."
        scopeLabel="Platform"
      />

      {/* Stripe definition */}
      <div
        className="flex items-start gap-3 rounded-lg border p-4 text-sm"
        style={{ background: "hsl(38 65% 94%)", borderColor: "hsl(38 40% 85%)", color: "hsl(38 50% 30%)" }}
      >
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          MRR and paid revenue use the Stripe-backed subscription ledger. MRR is the latest successful annual USD subscription payment divided by 12; trial conversion uses mature 30-day UTC account-owner cohorts. Seed stores are excluded by default.
        </span>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message="Couldn't load revenue data." onRetry={() => refetch()} />
      ) : stats ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatTile
              label="Current MRR"
              value={`$${stats.billingAnalytics.mrr.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={`${stats.billingAnalytics.mrr.activeSubscriptions} active Stripe subscription${stats.billingAnalytics.mrr.activeSubscriptions === 1 ? "" : "s"}`}
              icon={TrendingUp}
            />
            <StatTile
              label="Trial → paid"
              value={stats.billingAnalytics.trialConversion.latestMatured?.conversionRatePercent == null
                ? "—"
                : `${stats.billingAnalytics.trialConversion.latestMatured.conversionRatePercent}%`}
              sub={stats.billingAnalytics.trialConversion.latestMatured
                ? `${stats.billingAnalytics.trialConversion.latestMatured.convertedUsers}/${stats.billingAnalytics.trialConversion.latestMatured.eligibleUsers} owners in the latest mature cohort`
                : "No mature 30-day cohort yet"}
              icon={Store}
            />
            <StatTile
              label="Latest paid revenue"
              value={`$${(stats.billingAnalytics.revenueSeries.at(-1)?.amountUsd ?? 0).toLocaleString()}`}
              sub="Current UTC calendar month"
              icon={Activity}
            />
          </div>

          {/* Bar chart: stores by status */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-display font-semibold text-sm mb-5 text-foreground">Stores by status</h2>
            {Object.keys(stats.stores.byStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No store data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={Object.entries(stats.stores.byStatus).map(([status, count]) => ({
                    status,
                    count,
                  }))}
                  barCategoryGap="40%"
                >
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 12, fill: "hsl(216 15% 50%)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "hsl(216 15% 50%)" }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(40 100% 99%)",
                      border: "1px solid hsl(37 37% 85%)",
                      borderRadius: "8px",
                      fontSize: 12,
                    }}
                    cursor={{ fill: "hsl(35 52% 94%)" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {Object.keys(stats.stores.byStatus).map((status) => (
                      <Cell key={status} fill={COLORS[status] ?? "hsl(216 27% 60%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
