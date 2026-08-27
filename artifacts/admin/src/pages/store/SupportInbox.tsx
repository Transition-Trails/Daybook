/**
 * /store/:storeId/support-inbox — Store-owner all-cases view.
 *
 * Design rules:
 *  • All tickets fetched oldest-first (API guarantees asc sort)
 *  • Grouped: Needs reply → In progress → Waiting → Closed, FIFO within each
 *  • Age escalation: amber ≥24 h, red ≥72 h (row border + tint)
 *  • Close requires one of 5 reasons — enforced server-side AND client-side
 *  • Close form is per-ticket state keyed by id, never shared across tickets
 *  • Closed ticket renders read-only record + reopen + contextual action
 *  • Diagnostics highlight failed jobs, errors, missing links as red flags
 */

import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, Send, AlertTriangle, CheckCircle,
  Inbox, RefreshCw, BarChart2,
} from "lucide-react";
import { supportApi, type SupportTicket, type TicketReply } from "@/lib/api";
import { BUYER_AREAS } from "@/pages/shop/support-areas";
import { CLOSE_REASONS, closeReasonLabel } from "@/pages/shop/close-reasons";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  navy:     "#1B2A4A",
  clay:     "#C87560",
  red:      "#C62828",
  green:    "#1E6E34",
  slate:    "#4A6080",
  muted:    "#7A8FA6",
  border:   "var(--border)",
  card:     "hsl(var(--card))",
  greenBg:  "#E6F4EA",
  redBg:    "#FDECEA",
  amberBg:  "#FDF3F0",
};

// ── Status grouping ────────────────────────────────────────────────────────────
const GROUP_ORDER = ["open", "replied", "fixed", "closed"] as const;
type TicketStatus = (typeof GROUP_ORDER)[number];
const GROUP_LABELS: Record<TicketStatus, string> = {
  open:    "Needs reply",
  replied: "In progress",
  fixed:   "Waiting on buyer",
  closed:  "Closed",
};

// ── Age helpers ────────────────────────────────────────────────────────────────
function ageBand(iso: string): "fresh" | "amber" | "red" {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  return h < 24 ? "fresh" : h < 72 ? "amber" : "red";
}

function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(m, 1)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function areaLabel(key: string): string {
  return BUYER_AREAS?.find?.((a) => a.key === key)?.label ?? key;
}

// ── Diagnostics ────────────────────────────────────────────────────────────────
interface DiagFlag { key: string; label: string; value: string; level: "red" | "amber"; }

function buildDiagFlags(diag: Record<string, unknown>): DiagFlag[] {
  const flags: DiagFlag[] = [];
  if (diag.lastJobStatus === "failed")
    flags.push({ key: "lastJobStatus", label: "Job status", value: "failed", level: "red" });
  if (diag.lastJobError)
    flags.push({ key: "lastJobError", label: "Error", value: String(diag.lastJobError), level: "red" });
  if (diag.lastJobStatus === "completed" && !diag.fileLink && !diag.pdfFileId)
    flags.push({ key: "fileLink", label: "File link", value: "missing after completed job", level: "amber" });
  if (diag.lastJobStatus === "processing" || diag.lastJobStatus === "queued")
    flags.push({ key: "stale", label: "Job state", value: `${diag.lastJobStatus} (may be stale)`, level: "amber" });
  return flags;
}

function diagSummary(flags: DiagFlag[]): string {
  if (flags.some(f => f.key === "lastJobStatus" && f.level === "red"))
    return "Last build failed — likely the direct cause of this ticket.";
  if (flags.some(f => f.key === "lastJobError"))
    return "A generation error was recorded. PDF may not have been produced.";
  if (flags.some(f => f.key === "fileLink"))
    return "Build completed but no download link found.";
  if (flags.length > 0) return "Build is still processing or in an unknown state.";
  return "No obvious problems in the attached build.";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AgeBadge({ iso, status }: { iso: string; status: string }) {
  if (status === "closed") return null;
  const band = ageBand(iso);
  if (band === "fresh") return null;
  const color = band === "red" ? T.red : T.clay;
  const bg    = band === "red" ? T.redBg : T.amberBg;
  const ms    = Date.now() - new Date(iso).getTime();
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: bg, color, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 3 }}>
      <AlertTriangle size={10} />{formatDuration(ms)}
    </span>
  );
}

function DiagnosticsCard({ diagnostics }: { diagnostics: Record<string, unknown> }) {
  const SHOW = ["buildId", "editionName", "themeName", "size", "einkDevice", "lastJobStatus", "generatedAt"];
  const flags = buildDiagFlags(diagnostics);
  const hasIssues   = flags.length > 0;
  const topFlag     = flags[0];
  const headerBg    = topFlag?.level === "red" ? T.redBg : topFlag?.level === "amber" ? T.amberBg : "hsl(var(--muted) / 0.3)";
  const headerColor = topFlag?.level === "red" ? T.red   : topFlag?.level === "amber" ? T.clay    : T.green;
  return (
    <div style={{ marginBottom: 18, borderRadius: 8, overflow: "hidden", border: `1px solid ${hasIssues ? headerColor : T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: headerBg, borderBottom: `1px solid ${T.border}` }}>
        {hasIssues
          ? <AlertTriangle size={13} color={headerColor} />
          : <CheckCircle size={13} color={T.green} />}
        <span style={{ fontSize: 11, fontWeight: 700, color: headerColor, textTransform: "uppercase", letterSpacing: "0.07em" }}>ATTACHED BUILD</span>
        <span style={{ fontSize: 12, color: T.slate, flex: 1 }}>{diagSummary(flags)}</span>
      </div>
      <div style={{ padding: "10px 14px", background: T.card }}>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "5px 16px", fontSize: 12 }}>
          {SHOW.map((k) => {
            const v = diagnostics[k];
            if (!v) return null;
            const flag = flags.find(f => f.key === k);
            const vc = flag ? (flag.level === "red" ? T.red : T.clay) : T.slate;
            return (
              <>
                <span key={`k-${k}`} style={{ color: T.muted, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 2 }}>{k}</span>
                <span key={`v-${k}`} style={{ color: vc, fontWeight: flag ? 700 : 400, wordBreak: "break-all" }}>
                  {flag && "⚠ "}{String(v)}
                </span>
              </>
            );
          })}
          {flags.filter(f => !SHOW.includes(f.key)).map(f => (
            <>
              <span key={`k-${f.key}`} style={{ color: f.level === "red" ? T.red : T.clay, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 2 }}>{f.label}</span>
              <span key={`v-${f.key}`} style={{ color: f.level === "red" ? T.red : T.clay, fontWeight: 700, wordBreak: "break-all" }}>⚠ {f.value}</span>
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

function CloseReasonForm({
  reason, note, onReason, onNote, onSubmit, onCancel, isPending,
}: {
  reason: string; note: string;
  onReason: (v: string) => void; onNote: (v: string) => void;
  onSubmit: () => void; onCancel: () => void; isPending: boolean;
}) {
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: "18px 22px" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.navy, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Why are you closing this ticket?
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {CLOSE_REASONS.map((r) => (
          <button
            key={r.value}
            onClick={() => onReason(r.value)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "10px 14px", borderRadius: 8, cursor: "pointer", textAlign: "left",
              border: `2px solid ${reason === r.value ? T.navy : T.border}`,
              background: reason === r.value ? "hsl(var(--muted) / 0.18)" : T.card,
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: "50%", flexShrink: 0, marginTop: 2,
              border: `2px solid ${reason === r.value ? T.navy : T.border}`,
              background: reason === r.value ? T.navy : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {reason === r.value && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "white" }} />}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>{r.label}</div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{r.description}</div>
            </div>
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => onNote(e.target.value)}
        placeholder="Optional note for your records…"
        rows={2}
        style={{
          width: "100%", padding: "10px 14px", borderRadius: 8, resize: "vertical",
          border: `1px solid ${T.border}`, fontSize: 13, lineHeight: 1.6,
          color: T.navy, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={onSubmit}
          disabled={!reason || isPending}
          style={{
            padding: "9px 22px", borderRadius: 8,
            background: reason ? T.navy : "hsl(var(--muted))",
            color: reason ? "white" : T.muted,
            fontSize: 13, fontWeight: 700, border: "none",
            cursor: reason ? "pointer" : "not-allowed",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? "Closing…" : reason ? "Close ticket" : "Select a reason to continue"}
        </button>
        <button onClick={onCancel} style={{ fontSize: 13, color: T.muted, background: "transparent", border: "none", cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ClosedRecord({
  ticket, storeId, onReopen, isReopening,
}: {
  ticket: SupportTicket; storeId: string;
  onReopen: () => void; isReopening: boolean;
}) {
  const contextualAction =
    ticket.closeReason === "answered_no_article"
      ? { label: "Write the article while it's fresh →", href: `/store/${storeId}/support-patterns?area=${encodeURIComponent(ticket.area)}` }
      : ticket.closeReason === "product_defect"
      ? { label: "View defect patterns →", href: `/store/${storeId}/support-patterns` }
      : null;

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: "18px 22px" }}>
      <div style={{ borderLeft: `3px solid ${T.green}`, paddingLeft: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
          Closed
          {ticket.closedAt && (
            <span style={{ fontWeight: 400, marginLeft: 8 }}>
              {new Date(ticket.closedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.navy }}>{closeReasonLabel(ticket.closeReason)}</div>
        {ticket.closeNote && (
          <div style={{ fontSize: 13, color: T.slate, marginTop: 6, lineHeight: 1.55 }}>{ticket.closeNote}</div>
        )}
      </div>
      {contextualAction && (
        <a href={contextualAction.href} style={{ display: "inline-block", marginBottom: 12, fontSize: 13, color: T.clay, fontWeight: 600, textDecoration: "none" }}>
          {contextualAction.label}
        </a>
      )}
      <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic", marginBottom: 14 }}>
        This thread is closed. The buyer was notified by email.
      </div>
      <button
        onClick={onReopen}
        disabled={isReopening}
        style={{ padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${T.border}`, background: "transparent", color: T.slate, cursor: "pointer", opacity: isReopening ? 0.6 : 1 }}
      >
        {isReopening ? "Reopening…" : "↩ Reopen"}
      </button>
    </div>
  );
}

// ── TicketDetail ───────────────────────────────────────────────────────────────
function TicketDetail({
  ticket, storeId, closeReason, closeNote, onCloseReason, onCloseNote,
}: {
  ticket: SupportTicket; storeId: string;
  closeReason: string; closeNote: string;
  onCloseReason: (v: string) => void; onCloseNote: (v: string) => void;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [showClose, setShowClose] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["support-ticket", ticket.id],
    queryFn: () => supportApi.get(ticket.id, storeId),
  });
  const replies: TicketReply[] = data?.replies ?? [];

  const replyMut = useMutation({
    mutationFn: () => supportApi.addReply(ticket.id, reply.trim(), storeId),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["support-ticket", ticket.id] });
      qc.invalidateQueries({ queryKey: ["support-inbox-store", storeId] });
    },
  });

  const statusMut = useMutation({
    mutationFn: (args: { status: string; closeReason?: string; closeNote?: string }) =>
      supportApi.updateStatus(ticket.id, args.status, args, storeId),
    onSuccess: () => {
      setShowClose(false);
      qc.invalidateQueries({ queryKey: ["support-inbox-store", storeId] });
      qc.invalidateQueries({ queryKey: ["support-ticket", ticket.id] });
    },
  });

  const isClosed = ticket.status === "closed";

  return (
    <div style={{ background: "hsl(var(--muted) / 0.08)", borderTop: `1px solid ${T.border}` }}>
      <div style={{ padding: "18px 22px" }}>
        {ticket.symptoms.length > 0 && (
          <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ticket.symptoms.map((s) => (
              <span key={s} style={{ padding: "4px 12px", borderRadius: 20, background: T.navy, color: "white", fontSize: 12, fontWeight: 600 }}>{s}</span>
            ))}
          </div>
        )}
        {ticket.body && (
          <div style={{ marginBottom: 18, padding: "12px 16px", background: T.card, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, color: T.slate, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
            {ticket.body}
          </div>
        )}
        {ticket.buildRef && Object.keys(ticket.diagnostics ?? {}).length > 0 && (
          <DiagnosticsCard diagnostics={ticket.diagnostics} />
        )}
        {isLoading ? (
          <div style={{ fontSize: 13, color: T.muted, padding: "8px 0" }}>Loading thread…</div>
        ) : replies.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {replies.map((r) => (
              <div key={r.id} style={{ padding: "11px 15px", borderRadius: 8, background: r.authorRole !== "buyer" ? "#EEF2F8" : "white", border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 4, textTransform: "uppercase", background: r.authorRole === "buyer" ? "#F7F3EE" : T.navy, color: r.authorRole === "buyer" ? T.clay : "white" }}>
                    {r.authorRole.replace(/_/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, color: T.muted }}>
                    {new Date(r.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{r.body}</div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Reply composer — only for open tickets, not when close form is showing */}
        {!isClosed && !showClose && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Reply to this buyer…"
              rows={3}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, resize: "vertical", border: `1px solid ${T.border}`, fontSize: 13, lineHeight: 1.6, color: T.navy, fontFamily: "inherit", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => replyMut.mutate()}
                disabled={!reply.trim() || replyMut.isPending}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", borderRadius: 8, background: T.navy, color: "white", fontSize: 13, fontWeight: 600, border: "none", cursor: !reply.trim() ? "default" : "pointer", opacity: !reply.trim() || replyMut.isPending ? 0.5 : 1 }}
              >
                <Send size={13} />{replyMut.isPending ? "Sending…" : "Send reply"}
              </button>
              {ticket.status !== "fixed" && (
                <button
                  onClick={() => statusMut.mutate({ status: "fixed" })}
                  disabled={statusMut.isPending}
                  style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${T.border}`, background: "transparent", color: T.slate, cursor: "pointer" }}
                >
                  Mark waiting
                </button>
              )}
              <button
                onClick={() => setShowClose(true)}
                style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${T.border}`, background: "transparent", color: T.slate, cursor: "pointer", marginLeft: "auto" }}
              >
                Close ticket…
              </button>
            </div>
          </div>
        )}
      </div>

      {!isClosed && showClose && (
        <CloseReasonForm
          reason={closeReason} note={closeNote}
          onReason={onCloseReason} onNote={onCloseNote}
          onSubmit={() => statusMut.mutate({ status: "closed", closeReason, closeNote })}
          onCancel={() => setShowClose(false)}
          isPending={statusMut.isPending}
        />
      )}

      {isClosed && (
        <ClosedRecord
          ticket={ticket} storeId={storeId}
          onReopen={() => statusMut.mutate({ status: "open" })}
          isReopening={statusMut.isPending}
        />
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
type TicketWithCount = SupportTicket & { replyCount: number };

export default function StoreSupportInbox() {
  const { storeId } = useParams<{ storeId: string }>();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closeForms, setCloseForms] = useState<Record<string, { reason: string; note: string }>>({});

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["support-inbox-store", storeId],
    queryFn: () => supportApi.inbox({ storeId }),
    enabled: !!storeId,
  });
  const tickets: TicketWithCount[] = (data?.tickets ?? []) as TicketWithCount[];

  // If filter/data change hides the selected ticket, jump to first open
  const allIds = new Set(tickets.map((t) => t.id));
  if (selectedId && !allIds.has(selectedId)) {
    const next = tickets.find((t) => t.status !== "closed") ?? tickets[0];
    setTimeout(() => setSelectedId(next?.id ?? null), 0);
  }

  // Counters (open = not closed)
  const openTickets = tickets.filter((t) => t.status !== "closed");
  const over3Days   = openTickets.filter((t) => ageBand(t.createdAt) === "red");
  const oldestOpen  = openTickets.length > 0
    ? openTickets.reduce((a, b) =>
        new Date(a.createdAt) < new Date(b.createdAt) ? a : b)
    : null;

  // Per-ticket close form helpers
  const getForm = (id: string) => closeForms[id] ?? { reason: "", note: "" };
  const setFormField = (id: string, field: "reason" | "note", v: string) =>
    setCloseForms((p) => ({ ...p, [id]: { ...(p[id] ?? { reason: "", note: "" }), [field]: v } }));

  // Grouped FIFO
  const groups = GROUP_ORDER.map((status) => ({
    status, label: GROUP_LABELS[status],
    tickets: tickets
      .filter((t) => t.status === status)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  })).filter((g) => g.tickets.length > 0);

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 860, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700, color: "hsl(var(--foreground))" }}>Buyer Cases</h1>
          <p style={{ margin: 0, fontSize: 14, color: "hsl(var(--muted-foreground))" }}>Grouped oldest-first. Nothing silently ages out.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={`/store/${storeId}/support-patterns`}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${T.border}`, color: T.clay, textDecoration: "none" }}
          >
            <BarChart2 size={13} /> Patterns
          </a>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["support-inbox-store", storeId] })}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", fontSize: 13, color: T.slate, cursor: "pointer" }}
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Counters */}
      {openTickets.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
          {[
            { label: "Open", value: openTickets.length, highlight: false },
            { label: "Over 3 days", value: over3Days.length, highlight: over3Days.length > 0 },
            {
              label: "Oldest waiting",
              value: oldestOpen
                ? formatDuration(Date.now() - new Date(oldestOpen.createdAt).getTime())
                : "—",
              highlight: !!oldestOpen && ageBand(oldestOpen.createdAt) !== "fresh",
            },
          ].map(({ label, value, highlight }) => (
            <div key={label} style={{ flex: "1 1 120px", minWidth: 100, padding: "12px 16px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: highlight ? T.red : T.navy, marginTop: 4 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: 48, color: T.muted, fontSize: 14 }}>Loading tickets…</div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "56px 0", color: T.muted, fontSize: 14 }}>
          <Inbox size={32} color="var(--border)" style={{ margin: "0 auto 12px", display: "block" }} />
          No buyer tickets yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {groups.map(({ status, label, tickets: grp }) => (
            <section key={status}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: T.slate, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                <span style={{ fontSize: 12, color: T.muted }}>· {grp.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {grp.map((t) => {
                  const isSelected = selectedId === t.id;
                  const band = (status as string) !== "closed" ? ageBand(t.createdAt) : "fresh";
                  const borderColor = band === "red" ? T.red : band === "amber" ? T.clay : T.border;
                  const rowBg =
                    band === "red"   ? "rgba(198,40,40,0.03)"   :
                    band === "amber" ? "rgba(200,117,96,0.04)"  : T.card;

                  return (
                    <div key={t.id} style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${isSelected ? T.navy : borderColor}`, borderLeft: `3px solid ${isSelected ? T.navy : borderColor}`, background: rowBg }}>
                      <button
                        onClick={() => setSelectedId(isSelected ? null : t.id)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "hsl(var(--foreground))" }}>
                              {areaLabel(t.area)}
                            </span>
                            {t.symptoms.slice(0, 2).map((s) => (
                              <span key={s} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "hsl(var(--muted) / 0.5)", color: T.slate }}>{s}</span>
                            ))}
                            {(status as string) === "closed" && t.closeReason && (
                              <span style={{ fontSize: 11, fontStyle: "italic", color: T.muted }}>{closeReasonLabel(t.closeReason)}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: T.muted }}>
                            {t.id} · {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            {t.replyCount > 0 && <> · {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}</>}
                          </div>
                        </div>
                        <AgeBadge iso={t.createdAt} status={status} />
                        <span style={{ fontSize: 18, color: T.muted, lineHeight: 1, flexShrink: 0 }}>{isSelected ? "−" : "+"}</span>
                      </button>

                      {isSelected && (
                        <>
                          <div style={{ padding: "6px 18px 0", borderTop: `1px solid ${T.border}` }}>
                            <button
                              onClick={() => setSelectedId(null)}
                              style={{ fontSize: 12, color: T.muted, background: "transparent", border: "none", cursor: "pointer", padding: "4px 0", display: "flex", alignItems: "center", gap: 4 }}
                            >
                              <ChevronLeft size={12} /> All cases
                            </button>
                          </div>
                          <TicketDetail
                            ticket={t}
                            storeId={storeId!}
                            closeReason={getForm(t.id).reason}
                            closeNote={getForm(t.id).note}
                            onCloseReason={(v) => setFormField(t.id, "reason", v)}
                            onCloseNote={(v) => setFormField(t.id, "note", v)}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
