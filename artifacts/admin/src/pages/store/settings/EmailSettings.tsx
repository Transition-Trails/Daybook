/**
 * Store email settings — tier-1 display name override + tier-2 custom domain.
 * Route: /store/:storeId/email-settings
 */
import { useState, useEffect } from "react";
import { useParams } from "wouter";
import {
  CheckCircle2, XCircle, Clock, AlertCircle, ChevronRight,
  Copy, RefreshCw, Trash2, Globe, Mail,
} from "lucide-react";
import { emailSettingsApi, type StoreEmailConfig, type DnsRecord } from "@/lib/api";

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:     "#F7F0E6",
  card:   "#FFFDF9",
  border: "#E7DCCB",
  navy:   "#1B2A4A",
  clay:   "#C87560",
  slate:  "#4A6080",
  muted:  "#7A8FA6",
  green:  "#1E6E34",
  greenBg:"#E6F4EA",
  red:    "#C0392B",
  redBg:  "#FCE8E6",
  yellow: "#92600A",
  yellowBg:"#FEF3CD",
};

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; bg: string; Icon: React.FC<{size?: number}> }> = {
  not_started: { label: "Not started",  color: T.muted,  bg: "#F0EDE8", Icon: Clock },
  pending:     { label: "Pending",      color: T.yellow, bg: T.yellowBg, Icon: Clock },
  verified:    { label: "Verified",     color: T.green,  bg: T.greenBg,  Icon: CheckCircle2 },
  failed:      { label: "Failed",       color: T.red,    bg: T.redBg,    Icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.not_started;
  const { label, color, bg, Icon } = meta;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: bg, color, fontSize: 12, fontWeight: 600 }}>
      <Icon size={12} /> {label}
    </span>
  );
}

function RecordStatusIcon({ status }: { status: string }) {
  if (status === "verified")    return <CheckCircle2 size={14} color={T.green} />;
  if (status === "failed")      return <XCircle      size={14} color={T.red}   />;
  return <Clock size={14} color={T.muted} />;
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function EmailSettings() {
  const { storeId } = useParams() as { storeId: string };

  const [config, setConfig]     = useState<StoreEmailConfig | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Form state
  const [displayName, setDisplayName]   = useState("");
  const [localPart, setLocalPart]       = useState("hello");
  const [newDomain, setNewDomain]       = useState("");
  const [msg, setMsg]                   = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied]             = useState<string | null>(null);

  useEffect(() => {
    emailSettingsApi.get(storeId).then(r => {
      setConfig(r.config);
      if (r.config) {
        setDisplayName(r.config.fromDisplayName ?? "");
        setLocalPart(r.config.fromLocalPart ?? "hello");
      }
    }).finally(() => setLoading(false));
  }, [storeId]);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function saveDisplayName() {
    setSaving(true);
    try {
      const r = await emailSettingsApi.update(storeId, { fromDisplayName: displayName, fromLocalPart: localPart });
      setConfig(r.config);
      flash("ok", "Saved");
    } catch (e) {
      flash("err", String(e));
    } finally {
      setSaving(false);
    }
  }

  async function registerDomain() {
    if (!newDomain.trim()) return;
    setSaving(true);
    try {
      const r = await emailSettingsApi.registerDomain(storeId, { fromDomain: newDomain.trim(), fromLocalPart: localPart });
      setConfig(prev => prev ? { ...prev, ...r.domain, fromDomain: newDomain.trim(), domainStatus: r.domain.status, dnsRecords: r.domain.records, resendDomainId: r.domain.id } : null);
      // Refresh full config
      const fresh = await emailSettingsApi.get(storeId);
      setConfig(fresh.config);
      setNewDomain("");
      flash("ok", "Domain registered — add the DNS records below, then click Verify");
    } catch (e) {
      flash("err", String(e));
    } finally {
      setSaving(false);
    }
  }

  async function verifyDomain() {
    setVerifying(true);
    try {
      const r = await emailSettingsApi.verifyDomain(storeId);
      const fresh = await emailSettingsApi.get(storeId);
      setConfig(fresh.config);
      if (r.domain.status === "verified") {
        flash("ok", "Domain verified! Your store will now send from its own domain.");
      } else {
        flash("err", `Verification status: ${r.domain.status}. Check that all DNS records are saved and propagated.`);
      }
    } catch (e) {
      flash("err", String(e));
    } finally {
      setVerifying(false);
    }
  }

  async function removeDomain() {
    if (!confirm("Remove custom domain? Your store will fall back to the platform sending domain immediately.")) return;
    setSaving(true);
    try {
      await emailSettingsApi.removeDomain(storeId);
      const fresh = await emailSettingsApi.get(storeId);
      setConfig(fresh.config);
      flash("ok", "Custom domain removed");
    } catch (e) {
      flash("err", String(e));
    } finally {
      setSaving(false);
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  if (loading) {
    return (
      <div style={{ padding: 48, color: T.muted, fontSize: 14 }}>Loading…</div>
    );
  }

  const records: DnsRecord[] = config?.dnsRecords ?? [];
  const hasDomain  = !!config?.fromDomain;
  const isVerified = config?.domainStatus === "verified";

  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "32px 24px", fontFamily: "var(--app-font-sans, sans-serif)" }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: T.navy }}>Email settings</h1>
          <p style={{ margin: "6px 0 0", fontSize: 14, color: T.muted }}>
            Buyers see your store name in their inbox. Optionally, send from your own domain.
          </p>
        </div>

        {/* Flash message */}
        {msg && (
          <div style={{ marginBottom: 16, padding: "10px 16px", borderRadius: 8, background: msg.kind === "ok" ? T.greenBg : T.redBg, color: msg.kind === "ok" ? T.green : T.red, fontSize: 13, fontWeight: 500 }}>
            {msg.text}
          </div>
        )}

        {/* ── TIER 1: Display name ────────────────────────────────────────── */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Mail size={18} color={T.clay} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.navy }}>From name</h2>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: T.greenBg, color: T.green, fontWeight: 600 }}>ACTIVE</span>
          </div>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: T.slate, lineHeight: 1.6 }}>
            Buyers see this name in their inbox. If blank, your store name is used.
            All tier-1 mail sends from <code style={{ fontSize: 12, background: "#F0EDE8", padding: "1px 6px", borderRadius: 4 }}>notifications@[platform-domain]</code>.
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="e.g. Sage Leaf Co."
              style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 14, color: T.navy, outline: "none", background: "white" }}
            />
            <button
              onClick={saveDisplayName}
              disabled={saving}
              style={{ padding: "9px 20px", borderRadius: 8, background: T.clay, color: "white", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}
            >
              Save
            </button>
          </div>
        </div>

        {/* ── TIER 2: Custom domain ────────────────────────────────────────── */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <Globe size={18} color={T.clay} />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.navy }}>Custom sending domain</h2>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#F0EDE8", color: T.muted, fontWeight: 600 }}>OPT-IN</span>
            {hasDomain && <StatusBadge status={config!.domainStatus} />}
          </div>
          <p style={{ margin: "0 0 20px", fontSize: 13, color: T.slate, lineHeight: 1.6 }}>
            Send as <strong>hello@yourdomain.com</strong> instead of the platform address. Requires adding DNS records to your domain.
          </p>

          {!hasDomain ? (
            /* Register domain form */
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Sending domain</label>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <input
                  value={newDomain}
                  onChange={e => setNewDomain(e.target.value)}
                  placeholder="mail.yourdomain.com"
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 14, color: T.navy, outline: "none", background: "white" }}
                />
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Local part (before @)</label>
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <input
                  value={localPart}
                  onChange={e => setLocalPart(e.target.value)}
                  placeholder="hello"
                  style={{ width: 180, padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${T.border}`, fontSize: 14, color: T.navy, outline: "none", background: "white" }}
                />
                <span style={{ display: "flex", alignItems: "center", fontSize: 13, color: T.muted }}>
                  → sends as <strong style={{ marginLeft: 6, color: T.navy }}>{localPart || "hello"}@{newDomain || "yourdomain.com"}</strong>
                </span>
              </div>
              <button
                onClick={registerDomain}
                disabled={saving || !newDomain.trim()}
                style={{ padding: "10px 24px", borderRadius: 8, background: T.navy, color: "white", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", opacity: (saving || !newDomain.trim()) ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}
              >
                Add domain <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            /* Domain registered — show DNS checklist */
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 14px", background: "#F0EDE8", borderRadius: 8 }}>
                <Globe size={14} color={T.muted} />
                <span style={{ fontSize: 13, color: T.navy, fontWeight: 600 }}>{config!.fromDomain}</span>
                <span style={{ fontSize: 13, color: T.muted, marginLeft: 4 }}>sending as <strong>{config!.fromLocalPart}@{config!.fromDomain}</strong></span>
                <button
                  onClick={removeDomain}
                  style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "white", color: T.red, fontSize: 12, cursor: "pointer", fontWeight: 500 }}
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>

              {records.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: T.navy }}>
                    Add these DNS records at your domain registrar, then click Verify:
                  </p>
                  <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                    {/* Table header */}
                    <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 60px 32px", gap: 0, background: "#F0EDE8", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      <span>Type</span><span>Name</span><span>Value</span><span>TTL</span><span></span>
                    </div>
                    {records.map((r, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 60px 32px", gap: 0, padding: "10px 12px", borderTop: `1px solid ${T.border}`, background: "white", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.clay, fontFamily: "monospace" }}>{r.type}</span>
                        <span style={{ fontSize: 12, color: T.navy, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{r.name}</span>
                        <span style={{ fontSize: 12, color: T.slate, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>{r.value}</span>
                        <span style={{ fontSize: 11, color: T.muted }}>{String(r.ttl)}</span>
                        <button
                          onClick={() => copyText(`${r.type}\t${r.name}\t${r.value}\t${r.ttl}`, `row-${i}`)}
                          title="Copy row"
                          style={{ background: "none", border: "none", cursor: "pointer", color: copied === `row-${i}` ? T.green : T.muted, padding: 2 }}
                        >
                          {copied === `row-${i}` ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                        </button>
                        <span style={{ gridColumn: "1/-1", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                          <RecordStatusIcon status={r.status} />
                          <span style={{ fontSize: 11, color: T.muted }}>{r.status}</span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div style={{ background: "#FEF9F0", border: `1px solid #F0DCBB`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: T.yellow }}>
                    <strong>DMARC guidance:</strong> Add a TXT record at <code>_dmarc.{config!.fromDomain}</code> with value <code>v=DMARC1; p=quarantine; rua=mailto:dmarc@{config!.fromDomain}</code> for best deliverability.
                  </div>
                </div>
              )}

              {!isVerified && (
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    onClick={verifyDomain}
                    disabled={verifying}
                    style={{ padding: "10px 24px", borderRadius: 8, background: T.clay, color: "white", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer", opacity: verifying ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <RefreshCw size={14} style={{ animation: verifying ? "spin 1s linear infinite" : "none" }} />
                    {verifying ? "Checking…" : "Verify DNS"}
                  </button>
                  <span style={{ fontSize: 12, color: T.muted }}>DNS changes can take up to 48 hours to propagate.</span>
                </div>
              )}

              {isVerified && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: T.greenBg, borderRadius: 8, fontSize: 13, color: T.green, fontWeight: 600 }}>
                  <CheckCircle2 size={16} />
                  Domain verified — your store is now sending from {config!.fromLocalPart}@{config!.fromDomain}
                </div>
              )}

              {config?.lastVerifyError && !isVerified && (
                <div style={{ marginTop: 10, display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", background: T.redBg, borderRadius: 8, fontSize: 12, color: T.red }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{config.lastVerifyError}</span>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
