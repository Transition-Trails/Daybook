/**
 * /s/:storeSlug/support
 *
 * Role-adaptive issue-filing form.
 * — Store owner / staff  → "owner tier": files to the platform queue
 * — Buyer / unauthenticated  → "buyer tier": files to the store queue
 *
 * Progressive disclosure:
 *   Step 1  Area cards (always visible)
 *   Step 2  Recent builds / purchases (appears after area is chosen)
 *   Step 3  Symptoms + free-text + screenshot (appears after area is chosen)
 *   "Attached automatically" diagnostics (appears when a build is selected)
 *   Right rail  Article matching + open tickets (always visible, content loads)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Notebook,
  CheckCircle2, Upload, X, ChevronRight,
} from "lucide-react";
import {
  supportApi, storageApi,
  type RecentBuild, type HelpArticleMatch, type SupportTicket,
} from "@/lib/api";
import { canWrite } from "@/lib/permissions";
import { OWNER_AREAS, BUYER_AREAS } from "./support-areas";

// ── Design tokens (matches StorefrontHome) ────────────────────────────────────
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
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatUA(ua: string): string {
  const m = ua.match(/(iPhone|iPad|Android|Mac OS X|Windows NT|Linux)/i);
  const browser = ua.includes("Firefox") ? "Firefox" : ua.includes("Edg") ? "Edge" : ua.includes("Chrome") ? "Chrome" : ua.includes("Safari") ? "Safari" : "Browser";
  return `${browser}${m ? " · " + m[1] : ""}`;
}

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    open:    { bg: "#FDF3F0", color: "#C87560", label: "Open" },
    replied: { bg: "#E8F4FD", color: "#1B6CA8", label: "Replied" },
    fixed:   { bg: T.greenBg, color: T.green,  label: "Fixed" },
    closed:  { bg: "#F0F3F7", color: T.slate,  label: "Closed" },
  };
  const s = map[status] ?? map.open;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 4,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      letterSpacing: "0.04em", textTransform: "uppercase",
    }}>{s.label}</span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SupportPage() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const qc = useQueryClient();

  // ── Form state
  const [area, setArea] = useState<string | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<RecentBuild | null>(null);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [uploadingShot, setUploadingShot] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── Data: shop info
  const { data: shopData } = useQuery({
    queryKey: ["shop", storeSlug],
    queryFn: () =>
      fetch(`/api/shop/${encodeURIComponent(storeSlug!)}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    enabled: !!storeSlug,
  });
  const store = shopData?.store as { id: string; name: string; slug: string } | undefined;

  // ── Data: auth state
  const { data: authData } = useQuery({
    queryKey: ["auth-me-support"],
    queryFn: () =>
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
  });
  const authed = !!authData?.id;

  // ── Data: store role (owner tier if store_owner/staff for this store)
  const { data: myStores } = useQuery({
    queryKey: ["me-stores-support"],
    queryFn: () =>
      fetch("/api/me/stores", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    enabled: authed,
  });
  const myStoreEntry = (myStores?.stores ?? []).find(
    (s: { storeId?: string; slug?: string; role?: string }) =>
      s.storeId === store?.id || s.slug === storeSlug,
  );
  const isOwnerTier =
    authData?.platformRole === "super_admin" ||
    canWrite(myStoreEntry?.role);
  const tier: "owner" | "buyer" = isOwnerTier ? "owner" : "buyer";
  const areas = tier === "owner" ? OWNER_AREAS : BUYER_AREAS;
  const areaDef = areas.find((a) => a.key === area) ?? null;

  // ── Data: recent builds (once area is selected + authed)
  const { data: activityData, isFetching: activityLoading } = useQuery({
    queryKey: ["support-activity", store?.id, area],
    queryFn: () => supportApi.recentActivity(store?.id),
    enabled: !!area && authed && !!store?.id,
  });
  const recentBuilds: RecentBuild[] = activityData?.builds ?? [];

  // ── Data: article matching (live)
  const { data: articlesData } = useQuery({
    queryKey: ["support-articles", area ?? "", symptoms.join(",")],
    queryFn: () =>
      supportApi.articles(area ?? "", symptoms, tier === "buyer" ? (store?.id ?? "platform") : "platform"),
    enabled: !!area,
    refetchOnWindowFocus: false,
  });
  const articles: HelpArticleMatch[] = articlesData?.articles ?? [];

  // ── Data: my open tickets (right rail)
  const { data: myTicketsData } = useQuery({
    queryKey: ["support-my-tickets"],
    queryFn: supportApi.myTickets,
    enabled: authed,
  });
  const myTickets: SupportTicket[] = (myTicketsData?.tickets ?? []).filter(
    (t: SupportTicket) => t.status !== "closed",
  );

  // ── Screenshot handling
  const handleFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 10 * 1024 * 1024) {
        setErr("Screenshot must be under 10 MB");
        return;
      }
      setScreenshotFile(file);
      const reader = new FileReader();
      reader.onload = (e) => setScreenshotPreview(e.target?.result as string);
      reader.readAsDataURL(file);
      // Upload in background
      setUploadingShot(true);
      try {
        const { uploadURL, objectPath } = await storageApi.requestUploadUrl(
          file.name, file.size, file.type,
        );
        await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        setScreenshotPath(objectPath);
      } catch {
        setErr("Screenshot upload failed — you can still submit without it.");
      } finally {
        setUploadingShot(false);
      }
    },
    [],
  );

  // Paste handler
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(
        (i) => i.type.startsWith("image/"),
      );
      if (item) { e.preventDefault(); const f = item.getAsFile(); if (f) handleFile(f); }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [handleFile]);

  // Drop handlers
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ── Submit
  const handleSubmit = async () => {
    if (!area) { setErr("Please select an area."); return; }
    if (!authed) { setErr("Please sign in before submitting."); return; }
    setErr(null);
    setSubmitting(true);
    try {
      const { ticket } = await supportApi.create({
        area,
        symptoms,
        body: body.trim() || undefined,
        buildRef: selectedBuild?.id,
        storeId: tier === "buyer" ? store?.id : undefined,
        screenshotRefs: screenshotPath ? [screenshotPath] : [],
        extraDiagnostics: { userAgent: navigator.userAgent, tier },
      });
      setSuccessId(ticket.id);
      qc.invalidateQueries({ queryKey: ["support-my-tickets"] });
    } catch (e) {
      setErr((e as Error).message || "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Diagnostics rows (built from selectedBuild + browser info)
  const diagRows = selectedBuild
    ? [
        { key: "BUILD",   value: `${selectedBuild.id.slice(0, 14)} · ${selectedBuild.name}` },
        { key: "RECIPE",  value: selectedBuild.editionName ?? "Custom" },
        { key: "THEME",   value: selectedBuild.themeName ?? (selectedBuild.style?.themeId as string | undefined) ?? "Default" },
        { key: "SIZE",    value: (selectedBuild.style?.size as string | undefined) ?? "iPad 4:3" },
        ...(selectedBuild.output?.einkDevice
          ? [{ key: "DEVICE", value: cap(selectedBuild.output.einkDevice as string) + " (e-ink)" }]
          : []),
        ...(selectedBuild.lastJobStatus
          ? [{ key: "LAST GEN", value: selectedBuild.lastJobStatus + (selectedBuild.lastJobError ? ` · ${(selectedBuild.lastJobError as string).slice(0, 55)}` : "") }]
          : []),
        { key: "BROWSER", value: formatUA(navigator.userAgent) },
      ]
    : [];

  // ── Success screen ─────────────────────────────────────────────────────────
  if (successId) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--app-font-sans, sans-serif)" }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: "48px 40px", maxWidth: 480, textAlign: "center" }}>
          <CheckCircle2 size={40} color={T.green} style={{ margin: "0 auto 20px" }} />
          <div style={{ fontWeight: 700, fontSize: 20, color: T.navy, marginBottom: 8 }}>
            We've got it.
          </div>
          <div style={{ color: T.slate, lineHeight: 1.6, marginBottom: 24 }}>
            Ticket <strong style={{ color: T.navy }}>{successId}</strong> filed.{" "}
            {tier === "owner"
              ? "Our team will reply within one business day."
              : `${store?.name ?? "The store"} will get back to you soon.`}
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href={`/s/${storeSlug}`} style={{ padding: "10px 22px", borderRadius: 8, border: `1.5px solid ${T.border}`, color: T.navy, fontSize: 14, fontWeight: 600, textDecoration: "none", background: "white" }}>
              Back to store
            </a>
            <button
              onClick={() => { setSuccessId(null); setArea(null); setSelectedBuild(null); setSymptoms([]); setBody(""); setScreenshotFile(null); setScreenshotPreview(null); setScreenshotPath(null); }}
              style={{ padding: "10px 22px", borderRadius: 8, background: T.clay, color: "white", fontSize: 14, fontWeight: 600, border: "none", cursor: "pointer" }}
            >
              File another ticket
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "var(--app-font-sans, sans-serif)", padding: "0 0 64px" }}>

      {/* Store header */}
      <div style={{ borderBottom: `1px solid ${T.border}`, padding: "14px 32px", display: "flex", alignItems: "center", gap: 12, background: T.card }}>
        <a href={`/s/${storeSlug}`} style={{ fontSize: 13, fontWeight: 600, color: T.clay, textDecoration: "none" }}>
          {store?.name ?? storeSlug}
        </a>
        <span style={{ color: T.border }}>›</span>
        <span style={{ fontSize: 13, color: T.muted }}>Support</span>
      </div>

      {/* Hero heading */}
      <div style={{ padding: "40px 32px 32px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: T.clay, textTransform: "uppercase", marginBottom: 8 }}>
          {tier === "owner" ? "PLATFORM SUPPORT" : "BUYER SUPPORT"}
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: T.navy, margin: "0 0 10px", lineHeight: 1.2 }}>
          {tier === "owner"
            ? "Something not working? Tell us once."
            : "Need a hand with your planner?"}
        </h1>
        <p style={{ fontSize: 15, color: T.slate, margin: 0, lineHeight: 1.65 }}>
          {tier === "owner"
            ? "Describe what happened and we'll pull the build data automatically. Most issues are diagnosed without any back-and-forth."
            : `Describe what happened and ${store?.name ?? "the store"} will get back to you. Attaching your planner means less back-and-forth.`}
        </p>
      </div>

      {/* Two-column grid */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 32px", display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 24, alignItems: "start" }}>

        {/* ── LEFT COLUMN ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* STEP 1 — Area */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>STEP 1</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.navy, marginBottom: 16 }}>
              {tier === "owner" ? "What were you doing?" : "What do you need help with?"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {areas.map((a) => {
                const selected = area === a.key;
                return (
                  <button
                    key={a.key}
                    onClick={() => { setArea(a.key); setSymptoms([]); setSelectedBuild(null); }}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                      background: selected ? "#FDF3F0" : "white",
                      border: selected ? `1.5px solid ${T.clay}` : `1px solid ${T.border}`,
                      boxShadow: selected ? `inset 3px 0 0 ${T.clay}` : "none",
                      textAlign: "left", transition: "all 0.1s",
                    }}
                  >
                    <a.Icon size={15} strokeWidth={2} color={selected ? T.clay : T.slate} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selected ? T.navy : T.navy, lineHeight: 1.3 }}>{a.label}</div>
                      <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4, marginTop: 2 }}>{a.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dashed placeholder — shown until area is picked */}
          {!area && (
            <div style={{
              border: `1.5px dashed ${T.border}`, borderRadius: 10, padding: "32px 24px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.slate }}>
                The rest of the form appears once you pick an area
              </div>
              <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, maxWidth: 340 }}>
                We use the area to pull the right diagnostics and match help articles before you even submit.
              </div>
            </div>
          )}

          {area && (
            <>
              {/* STEP 2 — Build / purchase */}
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>STEP 2 — OPTIONAL</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.navy, marginBottom: 4 }}>
                  {tier === "owner" ? "Which build is this about?" : "Which planner is this about?"}
                </div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
                  Attaching a build lets us pull diagnostics automatically.
                </div>

                {!authed ? (
                  <div style={{ padding: "14px 16px", background: "#F7F3EE", borderRadius: 8, fontSize: 13, color: T.slate, textAlign: "center" }}>
                    <a href="/login" style={{ color: T.clay, fontWeight: 600 }}>Sign in</a>{" "}
                    to attach a specific build and include diagnostics automatically.
                  </div>
                ) : activityLoading ? (
                  <div style={{ padding: 16, textAlign: "center", color: T.muted, fontSize: 13 }}>Loading your builds…</div>
                ) : recentBuilds.length === 0 ? (
                  <div style={{ padding: "14px 16px", background: "#F7F3EE", borderRadius: 8, fontSize: 13, color: T.slate }}>
                    No builds found for this store. Continue to the next step.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {recentBuilds.map((b) => {
                      const sel = selectedBuild?.id === b.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBuild(sel ? null : b)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "12px 14px", borderRadius: 8, cursor: "pointer",
                            background: sel ? "#FDF3F0" : "white",
                            border: sel ? `1.5px solid ${T.clay}` : `1px solid ${T.border}`,
                            boxShadow: sel ? `inset 3px 0 0 ${T.clay}` : "none",
                            textAlign: "left",
                          }}
                        >
                          {/* Colour swatch from theme */}
                          <div style={{
                            width: 34, height: 34, borderRadius: 6, flexShrink: 0,
                            background: b.style?.themeId ? "#C87560" : "#E7DCCB",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Notebook size={14} color="white" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>{b.name}</span>
                              {b.badge && (
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: T.clay, background: "#FDF3F0", padding: "2px 6px", borderRadius: 4 }}>
                                  {b.badge}
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{b.meta}</div>
                          </div>
                          {sel && <CheckCircle2 size={16} color={T.clay} strokeWidth={2.5} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* STEP 3 — What went wrong */}
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: T.muted, textTransform: "uppercase", marginBottom: 4 }}>STEP 3</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.navy, marginBottom: 16 }}>What went wrong?</div>

                {/* Symptom chips */}
                {areaDef && areaDef.symptoms.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                      SELECT ALL THAT APPLY
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {areaDef.symptoms.map((s) => {
                        const on = symptoms.includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => setSymptoms(on ? symptoms.filter((x) => x !== s) : [...symptoms, s])}
                            style={{
                              padding: "6px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                              fontWeight: 600, border: "none",
                              background: on ? T.navy : "white",
                              color: on ? "white" : T.navy,
                              outline: on ? "none" : `1.5px solid ${T.border}`,
                              transition: "all 0.1s",
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Free text */}
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Describe what you were doing when it went wrong, what you expected, and what actually happened…"
                  rows={5}
                  style={{
                    width: "100%", padding: "12px 14px", borderRadius: 8, resize: "vertical",
                    border: `1px solid ${T.border}`, fontSize: 14, lineHeight: 1.6,
                    color: T.navy, background: "white", fontFamily: "inherit", boxSizing: "border-box",
                  }}
                />

                {/* Screenshot drop zone */}
                <div
                  ref={dropRef}
                  onDrop={onDrop}
                  onDragOver={(e) => e.preventDefault()}
                  style={{ marginTop: 12, borderRadius: 8, border: `1.5px dashed ${T.border}`, padding: "18px 16px", textAlign: "center", cursor: "pointer", position: "relative" }}
                  onClick={() => document.getElementById("screenshot-input")?.click()}
                >
                  <input
                    id="screenshot-input"
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  />
                  {screenshotPreview ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <img src={screenshotPreview} alt="Screenshot" style={{ height: 56, width: 80, objectFit: "cover", borderRadius: 6, border: `1px solid ${T.border}` }} />
                      <div style={{ flex: 1, textAlign: "left" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.navy }}>{screenshotFile?.name}</div>
                        <div style={{ fontSize: 11, color: uploadingShot ? T.clay : T.green }}>
                          {uploadingShot ? "Uploading…" : "✓ Ready"}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setScreenshotFile(null); setScreenshotPreview(null); setScreenshotPath(null); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: T.muted }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload size={18} color={T.muted} style={{ margin: "0 auto 6px" }} />
                      <div style={{ fontSize: 13, color: T.slate }}>
                        <strong>Drop a screenshot</strong> or click to browse
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                        You can also paste from clipboard · PNG or JPG · max 10 MB
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ATTACHED AUTOMATICALLY card */}
              {selectedBuild && diagRows.length > 0 && (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.navy }}>Attached automatically</div>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                      background: T.greenBg, color: T.green,
                      padding: "3px 8px", borderRadius: 4, textTransform: "uppercase",
                    }}>
                      NOTHING TO TYPE
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13 }}>
                    {diagRows.map(({ key, value }) => (
                      <>
                        <div key={`k-${key}`} style={{ fontWeight: 700, color: T.muted, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", paddingTop: 3 }}>{key}</div>
                        <div key={`v-${key}`} style={{ color: T.slate, wordBreak: "break-all", lineHeight: 1.5 }}>{value}</div>
                      </>
                    ))}
                  </div>
                  <div style={{ marginTop: 14, padding: "10px 12px", background: "#F7F3EE", borderRadius: 6, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                    This data is only used to diagnose your issue. It won't be shared outside the support team.
                  </div>
                </div>
              )}

              {/* Error message */}
              {err && (
                <div style={{ padding: "12px 16px", background: "#FDF3F0", border: `1px solid #F0C4B8`, borderRadius: 8, fontSize: 13, color: "#B24A30" }}>
                  {err}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !authed}
                style={{
                  padding: "14px 28px", borderRadius: 8, background: T.clay, color: "white",
                  fontSize: 15, fontWeight: 700, border: "none", cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.7 : 1, transition: "opacity 0.15s",
                }}
              >
                {!authed
                  ? "Sign in to submit"
                  : submitting
                  ? "Filing ticket…"
                  : tier === "owner"
                  ? "Send to platform support →"
                  : `Send to ${store?.name ?? "the store"} →`}
              </button>
            </>
          )}
        </div>

        {/* ── RIGHT COLUMN (sticky) ──────────────────────────────────────── */}
        <div style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Article matching */}
          <div style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 6, background: T.navy,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, flexShrink: 0,
              }}>
                ✦
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>
                  {articles.length > 0 ? "This might fix it now" : "Help articles"}
                </div>
                <div style={{ fontSize: 11, color: T.muted }}>
                  {area ? "Matched to your area" : "Pick an area to see matches"}
                </div>
              </div>
            </div>

            <div style={{ padding: "14px 20px" }}>
              {!area ? (
                <div style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "12px 0" }}>
                  Articles will appear here as you fill the form.
                </div>
              ) : articles.length === 0 ? (
                <div style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "12px 0" }}>
                  No direct matches — your ticket will reach a human.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {articles.map((art) => {
                    const confMap = {
                      "EXACT MATCH": { bg: T.greenBg, color: T.green },
                      "LIKELY":      { bg: "#FDF3F0", color: T.clay },
                      "RELATED":     { bg: "#F0F3F7", color: T.slate },
                    };
                    const c = confMap[art.confidence ?? "RELATED"] ?? confMap["RELATED"];
                    return (
                      <div key={art.id} style={{ paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          {art.confidence && (
                            <span style={{
                              fontSize: 9, fontWeight: 800, letterSpacing: "0.1em",
                              background: c.bg, color: c.color,
                              padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", whiteSpace: "nowrap",
                            }}>
                              {art.confidence}
                            </span>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: T.navy, lineHeight: 1.3 }}>{art.title}</span>
                        </div>
                        <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{art.excerpt}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {area && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "#F7F3EE", borderRadius: 6, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                  About half of tickets are solved by reading the matched article before submitting.
                </div>
              )}
            </div>
          </div>

          {/* Open tickets */}
          {authed && myTickets.length > 0 && (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px 10px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.navy }}>Your open tickets</div>
              </div>
              <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                {myTickets.slice(0, 5).map((t) => {
                  const areaLabel = [...OWNER_AREAS, ...BUYER_AREAS].find((a) => a.key === t.area)?.label ?? t.area;
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.navy, lineHeight: 1.3 }}>{areaLabel}</div>
                        <div style={{ fontSize: 11, color: T.muted }}>{t.id} · {new Date(t.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</div>
                      </div>
                      <StatusPill status={t.status} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sign-in prompt (right rail) */}
          {!authed && (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: T.slate, lineHeight: 1.5, marginBottom: 12 }}>
                Sign in to attach build diagnostics and track your tickets.
              </div>
              <a href="/login" style={{ display: "inline-block", padding: "9px 20px", borderRadius: 8, background: T.clay, color: "white", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                Sign in <ChevronRight size={13} style={{ display: "inline", verticalAlign: "middle" }} />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
