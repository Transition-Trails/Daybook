/**
 * /store/:storeId/support-inbox — Buyer support inbox for store owners / staff.
 *
 * Shows tickets filed by buyers for THIS store (recipientScope = storeId).
 * Store owners can reply and update status. Cross-store isolation is enforced
 * server-side; this page just scopes every call to the current storeId.
 */

import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, ChevronDown, ChevronUp, Send,
  Inbox, Users,
} from "lucide-react";
import { supportApi, type SupportTicket, type TicketReply } from "@/lib/api";
import { BUYER_AREAS } from "@/pages/shop/support-areas";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  border:  "var(--border)",
  navy:    "#1B2A4A",
  clay:    "#C87560",
  slate:   "#4A6080",
  muted:   "#7A8FA6",
  green:   "#1E6E34",
  greenBg: "#E6F4EA",
};

function areaLabel(key: string): string {
  return BUYER_AREAS?.find?.((a) => a.key === key)?.label ?? key;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    open:    { bg: "#FDF3F0", color: T.clay },
    replied: { bg: "#E8F4FD", color: "#1B6CA8" },
    fixed:   { bg: T.greenBg, color: T.green },
    closed:  { bg: "hsl(var(--muted))", color: T.slate },
  };
  const s = map[status] ?? map.open;
  return (
    <span style={{
      display: "inline-block", padding: "3px 10px", borderRadius: 4,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      letterSpacing: "0.05em", textTransform: "uppercase",
    }}>{status}</span>
  );
}

// ── Thread ─────────────────────────────────────────────────────────────────────
function TicketThread({
  ticket,
  storeId,
}: {
  ticket: SupportTicket;
  storeId: string;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState(ticket.status);

  const { data, isLoading } = useQuery({
    queryKey: ["support-ticket", ticket.id],
    queryFn: () => supportApi.get(ticket.id),
  });
  const replies: TicketReply[] = data?.replies ?? [];

  const replyMut = useMutation({
    mutationFn: () => supportApi.addReply(ticket.id, reply.trim()),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["support-ticket", ticket.id] });
      qc.invalidateQueries({ queryKey: ["support-inbox-store", storeId] });
    },
  });

  const statusMut = useMutation({
    mutationFn: (s: string) => supportApi.updateStatus(ticket.id, s),
    onSuccess: (_, s) => {
      setStatus(s as typeof status);
      qc.invalidateQueries({ queryKey: ["support-inbox-store", storeId] });
    },
  });

  return (
    <div style={{
      padding: "18px 22px",
      background: "hsl(var(--muted) / 0.12)",
      borderTop: `1px solid ${T.border}`,
    }}>
      {/* Symptoms */}
      {ticket.symptoms.length > 0 && (
        <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {ticket.symptoms.map((s) => (
            <span
              key={s}
              style={{
                padding: "4px 12px", borderRadius: 20,
                background: T.navy, color: "white",
                fontSize: 12, fontWeight: 600,
              }}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Buyer's description */}
      {ticket.body && (
        <div style={{
          marginBottom: 18, padding: "12px 16px",
          background: "hsl(var(--card))", borderRadius: 8,
          border: `1px solid ${T.border}`, fontSize: 13,
          color: T.slate, lineHeight: 1.65, whiteSpace: "pre-wrap",
        }}>
          {ticket.body}
        </div>
      )}

      {/* Diagnostics summary (build info the buyer attached) */}
      {ticket.buildRef && (
        <div style={{ marginBottom: 18, padding: "10px 14px", background: "hsl(var(--card))", borderRadius: 8, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.muted, textTransform: "uppercase", marginBottom: 8 }}>
            ATTACHED BUILD
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 16px", fontSize: 12 }}>
            {["buildId", "editionName", "size", "einkDevice", "lastJobStatus"].map((k) => {
              const v = ticket.diagnostics?.[k];
              if (!v) return null;
              return (
                <>
                  <div key={`k-${k}`} style={{ fontWeight: 700, color: T.muted, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", paddingTop: 2 }}>{k}</div>
                  <div key={`v-${k}`} style={{ color: T.slate, wordBreak: "break-all" }}>{String(v)}</div>
                </>
              );
            })}
          </div>
        </div>
      )}

      {/* Thread replies */}
      {isLoading ? (
        <div style={{ fontSize: 13, color: T.muted, padding: "8px 0" }}>Loading thread…</div>
      ) : replies.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          {replies.map((r) => (
            <div
              key={r.id}
              style={{
                padding: "11px 15px", borderRadius: 8,
                background: r.authorRole !== "buyer" ? "#EEF2F8" : "white",
                border: `1px solid ${T.border}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                  padding: "2px 7px", borderRadius: 4, textTransform: "uppercase",
                  background: r.authorRole === "buyer" ? "#F7F3EE" : T.navy,
                  color: r.authorRole === "buyer" ? T.clay : "white",
                }}>{r.authorRole.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 11, color: T.muted }}>
                  {new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                {r.body}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Reply composer */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Reply to this buyer…"
          rows={3}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 8, resize: "vertical",
            border: `1px solid ${T.border}`, fontSize: 13, lineHeight: 1.6,
            color: T.navy, fontFamily: "inherit", boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => replyMut.mutate()}
            disabled={!reply.trim() || replyMut.isPending}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 20px", borderRadius: 8, background: T.navy,
              color: "white", fontSize: 13, fontWeight: 600, border: "none",
              cursor: !reply.trim() ? "default" : "pointer",
              opacity: !reply.trim() || replyMut.isPending ? 0.5 : 1,
            }}
          >
            <Send size={13} /> {replyMut.isPending ? "Sending…" : "Send reply"}
          </button>
          <select
            value={status}
            onChange={(e) => statusMut.mutate(e.target.value)}
            style={{
              padding: "8px 12px", borderRadius: 8,
              border: `1px solid ${T.border}`,
              fontSize: 13, color: T.navy, background: "white", cursor: "pointer",
            }}
          >
            {["open", "replied", "fixed", "closed"].map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ["open", "replied", "fixed", "closed", "all"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

export default function StoreSupportInbox() {
  const { storeId } = useParams<{ storeId: string }>();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["support-inbox-store", storeId, statusFilter],
    queryFn: () =>
      supportApi.inbox(
        statusFilter === "all"
          ? { storeId }
          : { storeId, status: statusFilter },
      ),
    enabled: !!storeId,
  });
  const tickets: (SupportTicket & { replyCount: number })[] =
    (data?.tickets ?? []) as (SupportTicket & { replyCount: number })[];

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 860, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <Users size={20} color={T.clay} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "hsl(var(--foreground))" }}>
            Buyer Support Inbox
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: "hsl(var(--muted-foreground))" }}>
          Tickets filed by buyers at your store. Reply to close them out.
        </p>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: "6px 16px", borderRadius: 20, fontSize: 13, fontWeight: 600,
              border: "none", cursor: "pointer",
              background: statusFilter === s ? T.navy : "hsl(var(--muted))",
              color: statusFilter === s ? "white" : "hsl(var(--muted-foreground))",
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 40, color: T.muted, fontSize: 14 }}>
          Loading tickets…
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 0", color: T.muted, fontSize: 14 }}>
          <Inbox size={32} color="var(--border)" style={{ margin: "0 auto 12px", display: "block" }} />
          No {statusFilter === "all" ? "" : statusFilter} buyer tickets.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tickets.map((t) => {
            const open = expandedId === t.id;
            return (
              <div
                key={t.id}
                style={{
                  background: "hsl(var(--card))",
                  border: `1px solid ${T.border}`,
                  borderRadius: 10, overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setExpandedId(open ? null : t.id)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 20px", background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))" }}>
                        {areaLabel(t.area)}
                      </span>
                      <StatusPill status={t.status} />
                      {t.replyCount > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.muted }}>
                          <MessageCircle size={12} /> {t.replyCount}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: T.muted }}>
                      {t.id}{" "}
                      · {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {t.symptoms.length > 0 && (
                        <> · {t.symptoms.slice(0, 2).join(", ")}{t.symptoms.length > 2 ? ` +${t.symptoms.length - 2}` : ""}</>
                      )}
                    </div>
                  </div>
                  {open ? <ChevronUp size={16} color={T.muted} /> : <ChevronDown size={16} color={T.muted} />}
                </button>

                {open && <TicketThread ticket={t} storeId={storeId!} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
