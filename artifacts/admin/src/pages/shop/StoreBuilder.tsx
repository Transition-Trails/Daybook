/**
 * Store-scoped Planner Builder — /s/:storeSlug/edition/:editionId/build
 *
 * Public page — auth is checked at the point of clicking "Generate".
 * Edition is pre-selected from the URL. Catalog choices (themes, packs, inserts)
 * are limited to what the store has enabled for this edition.
 *
 * Auth flow:
 *   • Not signed in → sign-in prompt (Google OAuth popup, same as admin login)
 *   • Signed in → full builder form
 *
 * After successful generation, deep-links into Ink editor at /s/:storeSlug/ink/:id
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Wand2, Loader2, CheckCircle2, AlertCircle, PenLine, BookMarked,
} from "lucide-react";
import { inkApi } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopEdition {
  id: string; name: string; tier: string;
  priceLow?: number | null; priceHigh?: number | null;
  sections: string[];
}
interface ThemePalette    { id: string; name: string; colors: string[]; }
interface ThemeBackground { id: string; name: string; type: string; assetRef?: string | null; }
interface ShopTheme  { id: string; name: string; colors: string[]; palettes?: ThemePalette[]; backgrounds?: ThemeBackground[]; }
interface ShopPack   { id: string; name: string; }
interface ShopInsert { id: string; name: string; cat: string; }
interface StoreInfo  { id: string; name: string; slug: string; }
interface ShopEditionData {
  store: StoreInfo;
  edition: ShopEdition;
  themes: ShopTheme[];
  packs: ShopPack[];
  inserts: ShopInsert[];
}
interface GenerateResult { id: string; pageCount: number; drive: { pdfFileId: string; configFileId: string }; }
type CalMode = "none" | "overlay" | "link";

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg: "#F7F0E6", card: "#FFFDF9", border: "#E7DCCB",
  navy: "#1B2A4A", clay: "#C87560", slate: "#4A6080", muted: "#7A8FA6",
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchEditionData(storeSlug: string, editionId: string): Promise<ShopEditionData> {
  const res = await fetch(
    `/api/shop/${encodeURIComponent(storeSlug)}/editions/${encodeURIComponent(editionId)}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error("not_found");
  return res.json();
}

async function fetchMe(): Promise<{ id: string; name: string; email: string } | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

// ── Sign-in prompt ─────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function SignInPrompt({ editionName, storeName }: { editionName: string; storeName: string }) {
  const handleGoogleSignIn = useCallback(() => {
    const w = 500, h = 620;
    const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
    const popup = window.open(
      "/api/auth/google",
      "daybook-google-auth",
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`,
    );
    function onMessage(ev: MessageEvent) {
      if (ev.data?.type === "daybook:auth_success") {
        window.removeEventListener("message", onMessage);
        popup?.close();
        // Reload the current page so React Query re-fetches /auth/me with the new cookie.
        window.location.reload();
      }
    }
    window.addEventListener("message", onMessage);
    const timer = setInterval(() => {
      if (popup?.closed) { clearInterval(timer); window.removeEventListener("message", onMessage); }
    }, 500);
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px" }}>
      <div style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 20,
        padding: "40px 32px", maxWidth: 400, width: "100%", textAlign: "center",
        boxShadow: "0 4px 24px rgba(27,42,74,0.08)",
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 16, background: T.navy,
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px",
        }}>
          <BookMarked size={28} color={T.clay} />
        </div>
        <h2 style={{ fontFamily: "var(--app-font-display)", fontSize: 22, fontWeight: 600, color: T.navy, margin: "0 0 8px" }}>
          Sign in to build
        </h2>
        <p style={{ color: T.slate, fontSize: 14, lineHeight: 1.6, margin: "0 0 8px" }}>
          You're building <strong style={{ color: T.navy }}>{editionName}</strong> from <strong style={{ color: T.navy }}>{storeName}</strong>.
        </p>
        <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.6, margin: "0 0 28px" }}>
          Sign in with Google so we can save your generated planner to your Drive.
        </p>
        <button
          onClick={handleGoogleSignIn}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: T.clay, color: "#fff", border: "none", borderRadius: 10,
            padding: "12px 0", fontSize: 15, fontWeight: 600, cursor: "pointer",
            fontFamily: "var(--app-font-sans)",
          }}
        >
          <GoogleIcon />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

// ── Builder form ──────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS  = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() + i);

function Sel({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: T.slate, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: "7px 10px", fontSize: 13, color: T.navy, fontFamily: "var(--app-font-sans)",
          cursor: "pointer", outline: "none",
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ToggleChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? T.navy : T.bg,
        color: selected ? "#fff" : T.slate,
        border: `1px solid ${selected ? T.navy : T.border}`,
        borderRadius: 8, padding: "5px 12px", fontSize: 12,
        cursor: "pointer", fontFamily: "var(--app-font-sans)", fontWeight: selected ? 600 : 400,
        transition: "all 0.12s",
      }}
    >
      {label}
    </button>
  );
}

function BackgroundChip({ bg, selected, onClick }: { bg: ThemeBackground; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? T.clay : T.bg,
        color: selected ? "#fff" : T.slate,
        border: `1.5px solid ${selected ? T.clay : T.border}`,
        borderRadius: 8, padding: "5px 11px",
        fontSize: 12, cursor: "pointer",
        fontFamily: "var(--app-font-sans)", fontWeight: selected ? 600 : 400,
        display: "flex", alignItems: "center", gap: 7,
        transition: "all 0.12s",
      }}
    >
      {bg.type === "color" && bg.assetRef ? (
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: bg.assetRef, border: "1px solid rgba(0,0,0,0.15)", flexShrink: 0 }} />
      ) : (
        <span style={{ fontSize: 10, lineHeight: "1" }}>🖼</span>
      )}
      {bg.name}
    </button>
  );
}

function PaletteChip({ palette, selected, onClick }: { palette: ThemePalette; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? T.clay : T.bg,
        color: selected ? "#fff" : T.slate,
        border: `1.5px solid ${selected ? T.clay : T.border}`,
        borderRadius: 8, padding: "5px 11px",
        fontSize: 12, cursor: "pointer",
        fontFamily: "var(--app-font-sans)", fontWeight: selected ? 600 : 400,
        display: "flex", alignItems: "center", gap: 6,
        transition: "all 0.12s",
      }}
    >
      <span style={{ display: "flex", gap: 2 }}>
        {palette.colors.slice(0, 4).map((c, i) => (
          <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.1)" }} />
        ))}
      </span>
      {palette.name}
    </button>
  );
}

function ThemeChip({ theme, selected, onClick }: { theme: ShopTheme; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? T.navy : T.bg,
        color: selected ? "#fff" : T.slate,
        border: `1.5px solid ${selected ? T.navy : T.border}`,
        borderRadius: 8, padding: "6px 12px",
        fontSize: 12, cursor: "pointer",
        fontFamily: "var(--app-font-sans)", fontWeight: selected ? 600 : 400,
        display: "flex", alignItems: "center", gap: 7,
        transition: "all 0.12s",
      }}
    >
      <span style={{ display: "flex", gap: 2 }}>
        {(theme.colors as string[]).slice(0, 3).map((c, i) => (
          <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c, border: "1px solid rgba(0,0,0,0.1)" }} />
        ))}
      </span>
      {theme.name}
    </button>
  );
}

interface BuilderFormProps {
  data: ShopEditionData;
  storeSlug: string;
}

function BuilderForm({ data, storeSlug }: BuilderFormProps) {
  const { data: inkStatus } = useQuery({
    queryKey: ["ink/enabled", storeSlug],
    queryFn: () => inkApi.enabled(storeSlug),
    staleTime: 60_000,
  });
  const inkEnabled = inkStatus?.enabled ?? false;
  const { store, edition, themes, packs, inserts } = data;
  const [, navigate] = useLocation();

  // Form state
  const [startYear, setStartYear]   = useState(String(new Date().getFullYear()));
  const [startMonth, setStartMonth] = useState("0");
  const [monthCount, setMonthCount] = useState("12");
  const [weekStart, setWeekStart]   = useState<"mon" | "sun">("mon");
  const [orientation, setOrientation] = useState<"vertical" | "landscape">("vertical");
  const [themeId, setThemeId]         = useState("");
  const [paletteId, setPaletteId]     = useState("");
  const [backgroundId, setBackgroundId] = useState("");
  const [selectedPacks, setSelectedPacks]     = useState<string[]>([]);
  const [selectedInserts, setSelectedInserts] = useState<string[]>([]);
  const [calMode, setCalMode] = useState<CalMode>("none");

  // Generate state
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [genError, setGenError] = useState("");
  // Separate state for entitlement 403 so we can surface it with different UI
  const [entitlementError, setEntitlementError] = useState<{ message: string; reason: string } | null>(null);

  // Preview
  const [previewUrl, setPreviewUrl]     = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const prevUrlRef = useRef<string | null>(null);

  function toggleList(id: string, list: string[], setList: (v: string[]) => void) {
    setList(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  }

  // Auto-select first palette when theme changes; reset background selection
  function handleThemeClick(id: string) {
    const next = themeId === id ? "" : id;
    setThemeId(next);
    if (next) {
      const t = themes.find(t => t.id === next);
      const firstPalette = t?.palettes?.[0]?.id ?? "";
      setPaletteId(firstPalette);
    } else {
      setPaletteId("");
    }
    setBackgroundId(""); // always reset background when theme changes
  }

  function buildBody(includeStoreContext = false) {
    return {
      editionId: edition.id,
      year: Number(startYear),
      setup: {
        weekStart, orientation,
        startMonth: Number(startMonth),
        startYear: Number(startYear),
        monthCount: Number(monthCount),
      },
      style: { themeId: themeId || undefined, paletteId: paletteId || undefined, backgroundId: backgroundId || undefined, packs: selectedPacks, inserts: selectedInserts },
      output: { calMode, eventMins: 60, aiInPdf: false },
      // storeContext is included on the persisting generate call so the server can
      // enforce entitlement for this store (starter items always pass; licensed items
      // require subscriptionActive=true). Preview is non-persisting — no context needed.
      ...(includeStoreContext ? { storeContext: { storeId: store.id } } : {}),
    };
  }

  // Live preview — debounced 600 ms
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/planners/preview", {
          method: "POST", signal: controller.signal,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildBody()),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        prevUrlRef.current = url;
        setPreviewUrl(url);
      } catch { /* silent */ } finally { setPreviewLoading(false); }
    }, 600);
    return () => { clearTimeout(timer); controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startYear, startMonth, monthCount, weekStart, orientation, themeId, paletteId, backgroundId, selectedPacks, selectedInserts, calMode]);

  useEffect(() => () => { if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current); }, []);

  async function handleGenerate() {
    setIsGenerating(true); setResult(null); setGenError(""); setEntitlementError(null);
    try {
      const res = await fetch("/api/planners", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(true)), // true → include storeContext for gate
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        // 403 = entitlement gate fired — surface with dedicated UI, not a generic error
        if (res.status === 403) {
          setEntitlementError({ message: b?.error ?? "Content not available.", reason: b?.reason ?? "" });
          return;
        }
        throw new Error(b?.error ?? `HTTP ${res.status}`);
      }
      const json: GenerateResult = await res.json();
      setResult(json);
    } catch (err: any) {
      setGenError(err.message ?? "Generation failed");
    } finally { setIsGenerating(false); }
  }

  // ── Section render ─────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: "flex", gap: 24, padding: "32px 24px 64px", maxWidth: 1060, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

      {/* ── Left: Config ── */}
      <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Edition header */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Building from</div>
          <div style={{ fontFamily: "var(--app-font-display)", fontSize: 18, fontWeight: 600, color: T.navy }}>{edition.name}</div>
          <div style={{ fontSize: 12, color: T.slate, marginTop: 3 }}>{store.name} · {edition.tier} edition</div>
        </div>

        {/* Date & layout */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontFamily: "var(--app-font-display)", fontSize: 14, fontWeight: 600, color: T.navy, marginBottom: 14 }}>Date &amp; layout</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Sel
              label="Start year"
              value={startYear}
              onChange={setStartYear}
              options={YEARS.map(y => ({ value: String(y), label: String(y) }))}
            />
            <Sel
              label="Start month"
              value={startMonth}
              onChange={setStartMonth}
              options={MONTHS.map((m, i) => ({ value: String(i), label: m }))}
            />
            <Sel
              label="Duration"
              value={monthCount}
              onChange={setMonthCount}
              options={[1,3,6,9,12,18,24].map(n => ({ value: String(n), label: `${n} months` }))}
            />
            <Sel
              label="Week starts"
              value={weekStart}
              onChange={v => setWeekStart(v as "mon" | "sun")}
              options={[{ value: "mon", label: "Monday" }, { value: "sun", label: "Sunday" }]}
            />
            <div style={{ gridColumn: "span 2" }}>
              <Sel
                label="Orientation"
                value={orientation}
                onChange={v => setOrientation(v as "vertical" | "landscape")}
                options={[{ value: "vertical", label: "Vertical (portrait)" }, { value: "landscape", label: "Landscape" }]}
              />
            </div>
          </div>
        </div>

        {/* Style */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontFamily: "var(--app-font-display)", fontSize: 14, fontWeight: 600, color: T.navy, marginBottom: 14 }}>Style</div>

          {themes.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Theme</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {themes.map(t => (
                  <ThemeChip
                    key={t.id} theme={t}
                    selected={themeId === t.id}
                    onClick={() => handleThemeClick(t.id)}
                  />
                ))}
              </div>

              {/* Palette picker — shown only when the selected theme has multiple palettes */}
              {(() => {
                const selectedTheme = themes.find(t => t.id === themeId);
                const palettes = selectedTheme?.palettes ?? [];
                if (!themeId || palettes.length < 2) return null;
                return (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
                      Color palette
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {palettes.map(p => (
                        <PaletteChip
                          key={p.id}
                          palette={p}
                          selected={paletteId === p.id}
                          onClick={() => setPaletteId(paletteId === p.id ? (palettes[0]?.id ?? "") : p.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Background picker — shown when the selected theme has ≥ 1 linked background */}
              {(() => {
                const selectedTheme = themes.find(t => t.id === themeId);
                const bgs = selectedTheme?.backgrounds ?? [];
                if (!themeId || bgs.length === 0) return null;
                return (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 7 }}>
                      Page background
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <button
                        onClick={() => setBackgroundId("")}
                        style={{
                          background: !backgroundId ? T.navy : T.bg,
                          color: !backgroundId ? "#fff" : T.slate,
                          border: `1.5px solid ${!backgroundId ? T.navy : T.border}`,
                          borderRadius: 8, padding: "5px 11px", fontSize: 12, cursor: "pointer",
                          fontFamily: "var(--app-font-sans)", fontWeight: !backgroundId ? 600 : 400,
                          transition: "all 0.12s",
                        }}
                      >
                        None
                      </button>
                      {bgs.map(bg => (
                        <BackgroundChip
                          key={bg.id}
                          bg={bg}
                          selected={backgroundId === bg.id}
                          onClick={() => setBackgroundId(backgroundId === bg.id ? "" : bg.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {packs.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Sticker packs</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {packs.map(p => (
                  <ToggleChip
                    key={p.id} label={p.name}
                    selected={selectedPacks.includes(p.id)}
                    onClick={() => toggleList(p.id, selectedPacks, setSelectedPacks)}
                  />
                ))}
              </div>
            </div>
          )}

          {inserts.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.slate, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Add-on inserts</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {inserts.map(ins => (
                  <ToggleChip
                    key={ins.id} label={ins.name}
                    selected={selectedInserts.includes(ins.id)}
                    onClick={() => toggleList(ins.id, selectedInserts, setSelectedInserts)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ fontFamily: "var(--app-font-display)", fontSize: 14, fontWeight: 600, color: T.navy, marginBottom: 14 }}>Output options</div>
          <Sel
            label="Calendar links"
            value={calMode}
            onChange={v => setCalMode(v as CalMode)}
            options={[
              { value: "none", label: "None" },
              { value: "link", label: "Deep-link" },
              { value: "overlay", label: "Overlay" },
            ]}
          />
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            background: isGenerating ? T.muted : T.clay, color: "#fff",
            border: "none", borderRadius: 12, padding: "14px",
            fontSize: 15, fontWeight: 700, cursor: isGenerating ? "wait" : "pointer",
            fontFamily: "var(--app-font-sans)", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8, transition: "background 0.15s",
          }}
        >
          {isGenerating
            ? <><Loader2 size={16} style={{ animation: "spin 0.9s linear infinite" }} />Generating…</>
            : <><Wand2 size={16} />Generate &amp; save to Drive</>}
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </button>

        {/* Result */}
        {result && (
          <div style={{ background: "#F0FAF0", border: "1px solid #B7DDB7", borderRadius: 12, padding: "16px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <CheckCircle2 size={18} color="#2E7D32" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1B5E20", margin: "0 0 10px" }}>
                  Planner saved — {result.pageCount} pages
                </p>
                <button
                  onClick={() => navigate(`/s/${storeSlug}/ink/${result.id}`)}
                  style={{
                    background: T.navy, color: "#fff", border: "none", borderRadius: 8,
                    padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    fontFamily: "var(--app-font-sans)", display: inkEnabled ? "flex" : "none", alignItems: "center", gap: 6,
                  }}
                >
                  <PenLine size={13} /> Open in Ink ✦
                </button>
              </div>
            </div>
          </div>
        )}

        {entitlementError && (
          <div style={{ background: "#FFFBEA", border: "1px solid #F5C842", borderRadius: 12, padding: "16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={18} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#92400E", margin: "0 0 5px" }}>
                Content not available
              </p>
              <p style={{ fontSize: 12, color: "#78350F", margin: "0 0 8px", lineHeight: 1.55 }}>
                {entitlementError.message}
              </p>
              <p style={{ fontSize: 11, color: "#A16207", margin: 0, lineHeight: 1.5 }}>
                Tip: if this edition or theme is marked as <strong>Starter</strong>, it is always available regardless of the store&apos;s subscription. Switch to a starter item and try again, or ask the store owner to reactivate their content license.
              </p>
            </div>
          </div>
        )}

        {genError && (
          <div style={{ background: "#FFF0F0", border: "1px solid #EFB0B0", borderRadius: 12, padding: "16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={18} color="#C62828" style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#B71C1C", margin: "0 0 3px" }}>Generation failed</p>
              <p style={{ fontSize: 12, color: "#7A3030", margin: 0 }}>{genError}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Right: Live preview ── */}
      <div style={{ flex: 1, minWidth: 0, position: "sticky", top: 0, alignSelf: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.slate }}>Live preview</span>
          {previewLoading && (
            <span style={{ fontSize: 11, color: T.muted, display: "flex", alignItems: "center", gap: 5 }}>
              <Loader2 size={11} style={{ animation: "spin 0.9s linear infinite" }} /> Rendering…
            </span>
          )}
        </div>
        <div style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: 12,
          overflow: "hidden", height: "calc(100vh - 200px)", minHeight: 480, position: "relative",
        }}>
          {!previewUrl && !previewLoading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: T.muted }}>
              <div style={{ width: 48, height: 60, border: `2px dashed ${T.border}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <BookMarked size={22} color={T.border} />
              </div>
              <p style={{ fontSize: 13 }}>Adjust settings to see a live preview</p>
            </div>
          )}
          {previewLoading && previewUrl && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(247,240,230,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
              <Loader2 size={28} color={T.clay} style={{ animation: "spin 0.9s linear infinite" }} />
            </div>
          )}
          {previewUrl && (
            <iframe key={previewUrl} src={previewUrl} style={{ width: "100%", height: "100%", border: "none" }} title="Planner preview" />
          )}
        </div>
        <p style={{ fontSize: 11, color: T.muted, textAlign: "center", marginTop: 8 }}>
          Preview shows sample pages · final planner renders all {Number(monthCount) * 30}+ pages
        </p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StoreBuilder() {
  const { storeSlug, editionId } = useParams<{ storeSlug: string; editionId: string }>();
  const [, navigate] = useLocation();

  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["shop-me"],
    queryFn: fetchMe,
    retry: false,
    staleTime: 30_000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["shop", storeSlug, "edition", editionId],
    queryFn: () => fetchEditionData(storeSlug!, editionId!),
    retry: false,
  });

  if (isLoading || meLoading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: T.slate, fontFamily: "var(--app-font-sans)" }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.clay, borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ fontSize: 14 }}>Loading…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--app-font-sans)" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: T.slate }}>Edition not available.</p>
          <button onClick={() => navigate(`/s/${storeSlug}`)} style={{ marginTop: 12, background: T.clay, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
            Back to store
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "var(--app-font-sans)", display: "flex", flexDirection: "column" }}>

      {/* Top nav */}
      <nav style={{ background: T.navy, padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button
          onClick={() => navigate(`/s/${storeSlug}/edition/${editionId}`)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: 0 }}
        >
          <ArrowLeft size={15} />
          {data.edition.name}
        </button>
        <div style={{ flex: 1 }} />
        {me && (
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{me.name || me.email}</span>
        )}
      </nav>

      {/* Auth gate or builder */}
      {!me ? (
        <SignInPrompt editionName={data.edition.name} storeName={data.store.name} />
      ) : (
        <BuilderForm data={data} storeSlug={storeSlug!} />
      )}
    </div>
  );
}
