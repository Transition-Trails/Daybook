/**
 * Customer-facing edition detail — /s/:storeSlug/edition/:editionId
 *
 * Public (no auth required). Shows edition info, available themes/packs/inserts,
 * and a "Build this planner" CTA that routes to the store-scoped builder.
 */
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookMarked, CheckCircle2, Palette, Package, FileText, Sparkles } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditionDetail {
  id: string; name: string; tier: string; status: string;
  sections: string[]; themes: string[]; packs: string[]; inserts: string[];
  priceLow?: number | null; priceHigh?: number | null;
}
interface ShopTheme  { id: string; name: string; colors: string[]; price: number; desc?: string | null; }
interface ShopPack   { id: string; name: string; tags: string[]; price: number; }
interface ShopInsert { id: string; name: string; cat: string; }
interface StoreInfo  { id: string; name: string; slug: string; }
interface EditionData {
  store: StoreInfo;
  edition: EditionDetail;
  themes: ShopTheme[];
  packs: ShopPack[];
  inserts: ShopInsert[];
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg: "#F7F0E6", card: "#FFFDF9", border: "#E7DCCB",
  navy: "#1B2A4A", clay: "#C87560", slate: "#4A6080", muted: "#7A8FA6",
};

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchEdition(storeSlug: string, editionId: string): Promise<EditionData> {
  const res = await fetch(
    `/api/shop/${encodeURIComponent(storeSlug)}/editions/${encodeURIComponent(editionId)}`,
    { credentials: "include" },
  );
  if (res.status === 410) throw new Error("unavailable");
  if (!res.ok) throw new Error("not_found");
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function PriceRange({ low, high }: { low?: number | null; high?: number | null }) {
  if (!low && !high) return <span style={{ color: T.muted, fontSize: 15 }}>Price on request</span>;
  if (low === high || !high)
    return <span style={{ color: T.clay, fontWeight: 700, fontSize: 20 }}>${low?.toFixed(2)}</span>;
  return <span style={{ color: T.clay, fontWeight: 700, fontSize: 20 }}>${low?.toFixed(2)} – ${high?.toFixed(2)}</span>;
}

function ThemeSwatch({ colors }: { colors: string[] }) {
  return (
    <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {(colors as string[]).slice(0, 5).map((c, i) => (
        <span key={i} style={{
          width: 16, height: 16, borderRadius: "50%", background: c,
          border: `1px solid rgba(27,42,74,0.12)`, display: "inline-block",
        }} />
      ))}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditionDetail() {
  const { storeSlug, editionId } = useParams<{ storeSlug: string; editionId: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery({
    queryKey: ["shop", storeSlug, "edition", editionId],
    queryFn: () => fetchEdition(storeSlug!, editionId!),
    retry: false,
  });

  // ── States ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: T.slate, fontFamily: "var(--app-font-sans)" }}>
          <div style={{
            width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.clay,
            borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto 16px",
          }} />
          <p style={{ fontSize: 14 }}>Loading…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error || !data) {
    const msg = (error as Error)?.message;
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--app-font-sans)" }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#E7DCCB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            {msg === "unavailable" ? <Sparkles size={28} color={T.clay} /> : <BookMarked size={28} color={T.slate} />}
          </div>
          <h2 style={{ fontFamily: "var(--app-font-display)", fontSize: 24, fontWeight: 600, color: T.navy, margin: "0 0 12px" }}>
            {msg === "unavailable" ? "Store unavailable" : "Edition not found"}
          </h2>
          <p style={{ color: T.slate, fontSize: 15, lineHeight: 1.6, margin: "0 0 24px" }}>
            {msg === "unavailable"
              ? "This store is currently paused. Please check back later."
              : "This edition isn't available in this store."}
          </p>
          <button
            onClick={() => navigate(`/s/${storeSlug}`)}
            style={{ background: T.clay, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Back to store
          </button>
        </div>
      </div>
    );
  }

  const { store, edition, themes, packs, inserts } = data;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "var(--app-font-sans)" }}>

      {/* Top nav */}
      <nav style={{
        background: T.navy, padding: "0 24px", height: 56,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button
          onClick={() => navigate(`/s/${storeSlug}`)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: 0 }}
        >
          <ArrowLeft size={15} />
          {store.name}
        </button>
      </nav>

      {/* Hero */}
      <header style={{
        background: T.navy, padding: "52px 24px 60px", textAlign: "center",
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              color: edition.tier === "advanced" ? T.clay : "rgba(255,255,255,0.5)",
              border: `1px solid ${edition.tier === "advanced" ? T.clay : "rgba(255,255,255,0.2)"}`,
              borderRadius: 99, padding: "3px 10px",
            }}>
              {edition.tier}
            </span>
          </div>
          <h1 style={{
            fontFamily: "var(--app-font-display)", fontSize: "clamp(28px,4vw,44px)",
            fontWeight: 600, color: "#fff", lineHeight: 1.2, margin: "0 0 20px",
            letterSpacing: "-0.02em",
          }}>
            {edition.name}
          </h1>
          <PriceRange low={edition.priceLow} high={edition.priceHigh} />
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 32, alignItems: "start" }}>

          {/* ── Left: details ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Sections */}
            {edition.sections.length > 0 && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <FileText size={16} color={T.clay} />
                  <h3 style={{ fontFamily: "var(--app-font-display)", fontSize: 16, fontWeight: 600, color: T.navy, margin: 0 }}>
                    What's included
                  </h3>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {edition.sections.map((s, i) => (
                    <span key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 12px", fontSize: 13, color: T.slate }}>
                      <CheckCircle2 size={12} color={T.clay} />
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Themes */}
            {themes.length > 0 && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Palette size={16} color={T.clay} />
                  <h3 style={{ fontFamily: "var(--app-font-display)", fontSize: 16, fontWeight: 600, color: T.navy, margin: 0 }}>
                    Available themes
                  </h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {themes.map(t => (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <ThemeSwatch colors={t.colors as string[]} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.navy }}>{t.name}</div>
                        {t.desc && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{t.desc}</div>}
                      </div>
                      {t.price > 0 && (
                        <span style={{ fontSize: 12, color: T.clay, fontWeight: 600 }}>${t.price.toFixed(2)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Packs */}
            {packs.length > 0 && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Package size={16} color={T.clay} />
                  <h3 style={{ fontFamily: "var(--app-font-display)", fontSize: 16, fontWeight: 600, color: T.navy, margin: 0 }}>
                    Compatible sticker packs
                  </h3>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {packs.map(p => (
                    <span key={p.id} style={{
                      background: T.bg, border: `1px solid ${T.border}`,
                      borderRadius: 8, padding: "5px 12px", fontSize: 13, color: T.slate,
                    }}>
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Inserts */}
            {inserts.length > 0 && (
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "24px" }}>
                <h3 style={{ fontFamily: "var(--app-font-display)", fontSize: 16, fontWeight: 600, color: T.navy, margin: "0 0 12px" }}>
                  Add-on inserts
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {inserts.map(ins => (
                    <span key={ins.id} style={{
                      background: T.bg, border: `1px solid ${T.border}`,
                      borderRadius: 8, padding: "5px 12px", fontSize: 13, color: T.slate,
                    }}>
                      {ins.name}
                      <span style={{ fontSize: 11, color: T.muted, marginLeft: 4 }}>· {ins.cat}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Right: CTA card (sticky) ── */}
          <div style={{ position: "sticky", top: 24 }}>
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(27,42,74,0.08)" }}>
              <div style={{ background: T.navy, padding: "20px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <BookMarked size={26} color={T.clay} />
                </div>
                <h3 style={{ fontFamily: "var(--app-font-display)", fontSize: 18, fontWeight: 600, color: "#fff", margin: "0 0 4px" }}>
                  {edition.name}
                </h3>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                  {edition.tier} edition
                </div>
              </div>

              <div style={{ padding: "20px" }}>
                <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
                  <PriceRange low={edition.priceLow} high={edition.priceHigh} />
                  <p style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Final price shown at checkout</p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                  {[
                    `${edition.sections.length} planner sections`,
                    `${themes.length} theme${themes.length !== 1 ? "s" : ""}`,
                    `${packs.length} sticker pack${packs.length !== 1 ? "s" : ""}`,
                    "Saved to your Google Drive",
                    "Annotate with Daybook Ink",
                  ].map((item, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.slate }}>
                      <CheckCircle2 size={13} color={T.clay} />
                      {item}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => navigate(`/s/${storeSlug}/edition/${editionId}/build`)}
                  style={{
                    width: "100%", background: T.clay, color: "#fff", border: "none",
                    borderRadius: 10, padding: "13px 0", fontSize: 15, fontWeight: 700,
                    cursor: "pointer", letterSpacing: "-0.01em", fontFamily: "var(--app-font-sans)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#B86550")}
                  onMouseLeave={e => (e.currentTarget.style.background = T.clay)}
                >
                  Build this planner →
                </button>

                <p style={{ textAlign: "center", fontSize: 11, color: T.muted, marginTop: 12 }}>
                  Sign in with Google to build and save
                </p>
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${T.border}`, padding: "24px",
        textAlign: "center", color: T.muted, fontSize: 12,
      }}>
        Powered by <span style={{ color: T.navy, fontWeight: 600 }}>Daybook Studio</span>
      </footer>
    </div>
  );
}
