/**
 * Platform deliverability dashboard — super admin only.
 * Route: /super/email/deliverability
 *
 * Shows per-store: sends, bounces, complaints, bounce/complaint rates,
 * tier-1 suspension status, and custom domain verification state.
 */
import { useState, useEffect } from "react";
import {
  AlertTriangle, CheckCircle2, XCircle, Clock,
  RefreshCw, ShieldOff,
} from "lucide-react";
import { emailSettingsApi, type DeliverabilityRow } from "@/lib/api";

const T = {
  bg:      "#F7F0E6",
  card:    "#FFFDF9",
  border:  "#E7DCCB",
  navy:    "#1B2A4A",
  clay:    "#C87560",
  slate:   "var(--admin-slate)",
  muted:   "var(--admin-muted)",
  green:   "#1E6E34",
  greenBg: "#E6F4EA",
  red:     "#C0392B",
  redBg:   "#FCE8E6",
  yellow:  "#92600A",
  yellowBg:"#FEF3CD",
};

function DomainBadge({ status }: { status: string | null }) {
  if (!status || status === "not_started") return <span style={{ color: T.muted, fontSize: 12 }}>—</span>;
  const color = status === "verified" ? T.green : status === "failed" ? T.red : T.yellow;
  const bg    = status === "verified" ? T.greenBg : status === "failed" ? T.redBg : T.yellowBg;
  const Icon  = status === "verified" ? CheckCircle2 : status === "failed" ? XCircle : Clock;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: bg, color, fontSize: 11, fontWeight: 600 }}>
      <Icon size={10} /> {status}
    </span>
  );
}

function RateCell({ value, warnThreshold, errorThreshold }: { value: number; warnThreshold: number; errorThreshold: number }) {
  const pct = value.toFixed(2) + "%";
  if (value >= errorThreshold) return <span style={{ color: T.red, fontWeight: 700 }}>{pct}</span>;
  if (value >= warnThreshold)  return <span style={{ color: T.yellow, fontWeight: 600 }}>{pct}</span>;
  return <span style={{ color: T.slate }}>{pct}</span>;
}

export default function Deliverability() {
  const [rows, setRows]       = useState<DeliverabilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsuspending, setUnsuspending] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await emailSettingsApi.deliverability();
      setRows(r.stores);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function unsuspend(storeId: string) {
    setUnsuspending(storeId);
    try {
      await emailSettingsApi.unsuspend(storeId);
      setRows(prev => prev.map(r => r.storeId === storeId ? { ...r, tier1Suspended: false, suspendedReason: null } : r));
    } finally {
      setUnsuspending(null);
    }
  }

  const suspended = rows.filter(r => r.tier1Suspended);
  const broken    = rows.filter(r => r.domainStatus === "failed");

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "var(--app-font-sans, sans-serif)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.navy }}>Email deliverability</h1>
            <p style={{ margin: "4px 0 0", fontSize: 14, color: T.muted }}>Per-store send volume, bounce rates, and domain status</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${T.border}`, background: "white", color: T.navy, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            Refresh
          </button>
        </div>

        {/* Alert banners */}
        {suspended.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: T.redBg, border: `1px solid #F5C6C4`, borderRadius: 10, marginBottom: 12, fontSize: 13, color: T.red }}>
            <AlertTriangle size={16} />
            <strong>{suspended.length} store{suspended.length > 1 ? "s" : ""} have tier-1 sending suspended</strong> — review and unsuspend below.
          </div>
        )}
        {broken.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: T.yellowBg, border: `1px solid #F0D080`, borderRadius: 10, marginBottom: 12, fontSize: 13, color: T.yellow }}>
            <AlertTriangle size={16} />
            <strong>{broken.length} custom domain{broken.length > 1 ? "s" : ""} failed verification</strong> — those stores are silently falling back to tier-1.
          </div>
        )}

        {loading ? (
          <div style={{ padding: 48, textAlign: "center", color: T.muted, fontSize: 14 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: T.muted, fontSize: 14 }}>No stores yet.</div>
        ) : (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{ display: "grid", gridTemplateColumns: "200px 80px 80px 80px 90px 90px 110px 110px 1fr", gap: 0, padding: "10px 16px", background: "#F0EDE8", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <span>Store</span>
              <span>Volume</span>
              <span>Sent</span>
              <span>Failed</span>
              <span>Bounce %</span>
              <span>Complaint %</span>
              <span>Tier-1</span>
              <span>Custom domain</span>
              <span></span>
            </div>

            {rows.map((row, i) => (
              <div
                key={row.storeId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "200px 80px 80px 80px 90px 90px 110px 110px 1fr",
                  gap: 0,
                  padding: "12px 16px",
                  borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                  background: row.tier1Suspended ? "#FFF5F5" : "white",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: T.navy }}>{row.storeName}</div>
                  <div style={{ fontSize: 11, color: T.muted }}>{row.storeId}</div>
                </div>
                <span style={{ fontSize: 13, color: T.slate }}>{(row.monthlyVolume ?? 0).toLocaleString()}</span>
                <span style={{ fontSize: 13, color: T.slate }}>{(row.sent ?? 0).toLocaleString()}</span>
                <span style={{ fontSize: 13, color: (row.failed ?? 0) > 0 ? T.red : T.slate }}>{(row.failed ?? 0).toLocaleString()}</span>
                <RateCell value={row.bounceRate ?? 0}    warnThreshold={5}   errorThreshold={10} />
                <RateCell value={row.complaintRate ?? 0} warnThreshold={0.3} errorThreshold={0.5} />
                <div>
                  {row.tier1Suspended ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: T.redBg, color: T.red, fontSize: 11, fontWeight: 600 }}>
                      <ShieldOff size={10} /> Suspended
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: T.greenBg, color: T.green, fontSize: 11, fontWeight: 600 }}>
                      <CheckCircle2 size={10} /> Active
                    </span>
                  )}
                  {row.suspendedReason && (
                    <div style={{ fontSize: 10, color: T.red, marginTop: 2, maxWidth: 90 }}>{row.suspendedReason}</div>
                  )}
                </div>
                <div>
                  <DomainBadge status={row.domainStatus} />
                  {row.fromDomain && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{row.fromDomain}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {row.tier1Suspended && (
                    <button
                      onClick={() => unsuspend(row.storeId)}
                      disabled={unsuspending === row.storeId}
                      style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: "white", color: T.navy, fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: unsuspending === row.storeId ? 0.6 : 1 }}
                    >
                      Unsuspend
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div style={{ marginTop: 16, display: "flex", gap: 20, fontSize: 11, color: T.muted }}>
          <span>Bounce %: <span style={{ color: T.yellow }}>≥5% warn</span>, <span style={{ color: T.red }}>≥10% auto-suspend</span></span>
          <span>Complaint %: <span style={{ color: T.yellow }}>≥0.3% warn</span>, <span style={{ color: T.red }}>≥0.5% auto-suspend</span></span>
        </div>

      </div>
    </div>
  );
}
