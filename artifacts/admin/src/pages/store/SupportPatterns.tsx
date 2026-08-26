/**
 * /store/:storeId/support-patterns — Closed-by-reason patterns for store owners.
 *
 * Shows:
 *  • Ranked bar list: closed tickets this month by reason
 *  • "Worth acting on" section: repeated "Answered — no article yet" clusters
 *    presented as "N tickets, no article" with a "Draft the article" action
 */

import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BarChart2, ArrowLeft, BookOpen, AlertTriangle } from "lucide-react";
import { supportApi, type CloseReasonPattern, type NoArticleCluster } from "@/lib/api";
import { BUYER_AREAS } from "@/pages/shop/support-areas";

const T = {
  navy:    "#1B2A4A",
  clay:    "#C87560",
  green:   "#1E6E34",
  slate:   "#4A6080",
  muted:   "#7A8FA6",
  border:  "var(--border)",
  card:    "hsl(var(--card))",
  greenBg: "#E6F4EA",
  amberBg: "#FDF3F0",
};

const REASON_COLORS: Record<string, string> = {
  fixed_myself:             "#1B2A4A",
  answered_article_existed: "#1E6E34",
  answered_no_article:      "#C87560",
  buyer_error:              "#4A6080",
  product_defect:           "#C62828",
};

function areaLabel(key: string): string {
  return BUYER_AREAS?.find?.((a) => a.key === key)?.label ?? key;
}

function ReasonBar({ item, total }: { item: CloseReasonPattern; total: number }) {
  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
  const color = REASON_COLORS[item.reason] ?? T.slate;
  return (
    <div style={{ padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.navy }}>{item.label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{item.count} <span style={{ fontWeight: 400, color: T.muted, fontSize: 12 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 8, background: "hsl(var(--muted) / 0.4)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", background: color, borderRadius: 4, width: `${pct}%`, transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

function NoArticleClusterCard({ cluster, storeId }: { cluster: NoArticleCluster; storeId: string }) {
  const label = areaLabel(cluster.area);
  return (
    <div style={{ padding: "14px 16px", background: T.amberBg, borderRadius: 10, border: `1px solid ${T.clay}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.navy, marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: T.slate }}>
          {cluster.count} ticket{cluster.count !== 1 ? "s" : ""} closed with "no article yet" — this topic has no written guide.
        </div>
      </div>
      <a
        href={`/store/${storeId}/help?draft=1&area=${encodeURIComponent(cluster.area)}`}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
          background: T.navy, color: "white", textDecoration: "none", whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <BookOpen size={13} /> Draft the article
      </a>
    </div>
  );
}

export default function SupportPatterns() {
  const { storeId } = useParams<{ storeId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["support-patterns", storeId],
    queryFn: () => supportApi.closeReasonPatterns({ storeId }),
    enabled: !!storeId,
  });

  const { byReason = [], noArticleClusters = [], total = 0, months = 1 } = data ?? {};
  const actionable = noArticleClusters.filter((c) => c.count >= 2);

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 760, margin: "0 auto" }}>
      {/* Back */}
      <a
        href={`/store/${storeId}/support-inbox`}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: T.muted, textDecoration: "none", marginBottom: 24 }}
      >
        <ArrowLeft size={13} /> Back to cases
      </a>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <BarChart2 size={20} color={T.clay} />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "hsl(var(--foreground))" }}>Close patterns</h1>
      </div>
      <p style={{ margin: "0 0 28px", fontSize: 14, color: "hsl(var(--muted-foreground))" }}>
        Last {months} month{months !== 1 ? "s" : ""} · {total} closed ticket{total !== 1 ? "s" : ""}
      </p>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: T.muted, fontSize: 14 }}>Loading patterns…</div>
      ) : total === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: T.muted, fontSize: 14 }}>
          No closed tickets yet. Patterns appear once you start closing cases with reasons.
        </div>
      ) : (
        <>
          {/* Reason bar chart */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 28 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>By close reason</div>
            {byReason.map((item) => (
              <ReasonBar key={item.reason} item={item} total={total} />
            ))}
          </div>

          {/* Worth acting on */}
          {actionable.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={15} color={T.clay} />
                <span style={{ fontSize: 13, fontWeight: 800, color: T.slate, textTransform: "uppercase", letterSpacing: "0.08em" }}>Worth acting on</span>
              </div>
              <p style={{ fontSize: 13, color: T.muted, margin: "0 0 14px", lineHeight: 1.55 }}>
                These topics came up multiple times with no existing article. Each one is a question your buyers will ask again.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {actionable.map((c) => (
                  <NoArticleClusterCard key={c.area} cluster={c} storeId={storeId!} />
                ))}
              </div>
            </div>
          )}

          {noArticleClusters.length > 0 && actionable.length === 0 && (
            <div style={{ padding: "14px 16px", background: T.greenBg, borderRadius: 10, border: `1px solid ${T.green}`, fontSize: 13, color: T.green }}>
              ✓ Every "no article" close has only one ticket so far. Keep an eye on this as volume grows.
            </div>
          )}
        </>
      )}
    </div>
  );
}
