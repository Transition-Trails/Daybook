/**
 * Customer-facing storefront home — /s/:storeSlug
 *
 * Public (no auth required). Shows:
 *   • Store name / brand header
 *   • Hero section
 *   • Editions grid with tier badge + price range
 *   • Themes and sticker-pack browsing sections
 */
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BookMarked, Sparkles, ChevronRight, Package, Palette } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopEdition {
  id: string; name: string; tier: string;
  priceLow?: number | null; priceHigh?: number | null;
  sections: string[]; themes: string[]; packs: string[]; inserts: string[];
}
interface ShopTheme  { id: string; name: string; colors: string[]; price: number; }
interface ShopPack   { id: string; name: string; tags: string[]; price: number; }
interface ShopStore  { id: string; name: string; slug: string; plan: string; status: string; }
interface ShopData {
  store: ShopStore;
  editions: ShopEdition[];
  themes: ShopTheme[];
  packs: ShopPack[];
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg:      "#F7F0E6",
  card:    "#FFFDF9",
  border:  "#E7DCCB",
  navy:    "#1B2A4A",
  clay:    "#C87560",
  slate:   "#4A6080",
  muted:   "#7A8FA6",
};

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchShop(slug: string): Promise<ShopData> {
  const res = await fetch(`/api/shop/${encodeURIComponent(slug)}`, { credentials: "include" });
  if (res.status === 410) throw new Error("unavailable");
  if (!res.ok) throw new Error("not_found");
  return res.json();
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PriceRange({ low, high }: { low?: number | null; high?: number | null }) {
  if (!low && !high) return <span style={{ color: T.muted, fontSize: 13 }}>Price on request</span>;
  if (low === high || !high) return <span style={{ color: T.clay, fontWeight: 600, fontSize: 14 }}>${low?.toFixed(2)}</span>;
  return <span style={{ color: T.clay, fontWeight: 600, fontSize: 14 }}>${low?.toFixed(2)} – ${high?.toFixed(2)}</span>;
}

function TierBadge({ tier }: { tier: string }) {
  const isAdv = tier === "advanced";
  return (
    <span style={{
      display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
      textTransform: "uppercase", padding: "2px 8px", borderRadius: 99,
      background: isAdv ? T.navy : "transparent",
      color: isAdv ? "#fff" : T.slate,
      border: isAdv ? "none" : `1px solid ${T.border}`,
    }}>
      {tier}
    </span>
  );
}

function ThemeSwatch({ colors }: { colors: string[] }) {
  return (
    <span style={{ display: "flex", gap: 3 }}>
      {colors.slice(0, 4).map((c, i) => (
        <span key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: c, display: "inline-block", border: `1px solid ${T.border}` }} />
      ))}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StorefrontHome() {
  const { storeSlug } = useParams<{ storeSlug: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading, error } = useQuery({
    queryKey: ["shop", storeSlug],
    queryFn: () => fetchShop(storeSlug!),
    retry: false,
  });

  // ── States ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", color: T.slate }}>
          <div style={{
            width: 40, height: 40, border: `3px solid ${T.border}`, borderTopColor: T.clay,
            borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto 16px",
          }} />
          <p style={{ fontFamily: "var(--app-font-sans)", fontSize: 14 }}>Loading store…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const errMsg = (error as Error)?.message;
  if (errMsg === "unavailable") {
    return <UnavailableState />;
  }
  if (error || !data) {
    return <NotFoundState slug={storeSlug ?? ""} />;
  }

  const { store, editions, themes, packs } = data;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "var(--app-font-sans)" }}>

      {/* ── Top nav ── */}
      <nav style={{
        background: T.navy, borderBottom: `1px solid rgba(255,255,255,0.08)`,
        padding: "0 24px", height: 56, display: "flex", alignItems: "center", gap: 12,
      }}>
        <BookMarked size={20} color={T.clay} />
        <span style={{ color: "#fff", fontFamily: "var(--app-font-display)", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em" }}>
          {store.name}
        </span>
        <div style={{ flex: 1 }} />
        <a
          href="/login"
          style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, textDecoration: "none" }}
        >
          Sign in
        </a>
      </nav>

      {/* ── Hero ── */}
      <header style={{
        background: T.navy, padding: "64px 24px 72px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <span style={{
            display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: T.clay, marginBottom: 16,
          }}>
            ✦ Curated planner collection
          </span>
          <h1 style={{
            fontFamily: "var(--app-font-display)", fontSize: "clamp(32px,5vw,52px)",
            fontWeight: 600, color: "#fff", lineHeight: 1.15, margin: "0 0 20px",
            letterSpacing: "-0.02em",
          }}>
            Build a planner that fits your life
          </h1>
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 17, lineHeight: 1.6, margin: 0 }}>
            Choose an edition, pick your style, and generate a personalised PDF planner — saved directly to your Drive.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* ── Editions ── */}
        <section style={{ marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
            <h2 style={{ fontFamily: "var(--app-font-display)", fontSize: 26, fontWeight: 600, color: T.navy, margin: 0 }}>
              Editions
            </h2>
            <span style={{ fontSize: 13, color: T.muted }}>{editions.length} available</span>
          </div>

          {editions.length === 0 ? (
            <EmptySection message="No editions available yet — check back soon." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {editions.map(ed => (
                <button
                  key={ed.id}
                  onClick={() => navigate(`/s/${storeSlug}/edition/${ed.id}`)}
                  style={{
                    background: T.card, border: `1px solid ${T.border}`, borderRadius: 14,
                    padding: 0, cursor: "pointer", textAlign: "left",
                    boxShadow: "0 1px 4px rgba(27,42,74,0.06)",
                    transition: "box-shadow 0.15s, transform 0.15s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 18px rgba(27,42,74,0.12)";
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 4px rgba(27,42,74,0.06)";
                    (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
                  }}
                >
                  {/* Cover placeholder */}
                  <div style={{
                    height: 160, background: `linear-gradient(135deg, ${T.navy} 0%, #2A4070 100%)`,
                    borderRadius: "13px 13px 0 0", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <BookMarked size={36} color="rgba(255,255,255,0.25)" />
                  </div>

                  <div style={{ padding: "16px 20px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <TierBadge tier={ed.tier} />
                      <ChevronRight size={14} color={T.muted} />
                    </div>
                    <h3 style={{ fontFamily: "var(--app-font-display)", fontSize: 18, fontWeight: 600, color: T.navy, margin: "0 0 6px", letterSpacing: "-0.01em" }}>
                      {ed.name}
                    </h3>
                    <p style={{ fontSize: 12, color: T.slate, margin: "0 0 12px", lineHeight: 1.5 }}>
                      {ed.sections.length > 0
                        ? ed.sections.slice(0, 3).join(" · ") + (ed.sections.length > 3 ? ` +${ed.sections.length - 3} more` : "")
                        : "Classic planner edition"}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <PriceRange low={ed.priceLow} high={ed.priceHigh} />
                      <span style={{ fontSize: 11, color: T.muted }}>
                        {ed.themes.length} {ed.themes.length === 1 ? "theme" : "themes"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Themes ── */}
        {themes.length > 0 && (
          <section style={{ marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <Palette size={18} color={T.clay} />
              <h2 style={{ fontFamily: "var(--app-font-display)", fontSize: 20, fontWeight: 600, color: T.navy, margin: 0 }}>
                Themes
              </h2>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {themes.map(t => (
                <div key={t.id} style={{
                  background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "10px 16px", display: "flex", alignItems: "center", gap: 10,
                }}>
                  <ThemeSwatch colors={t.colors as string[]} />
                  <span style={{ fontSize: 13, color: T.navy, fontWeight: 500 }}>{t.name}</span>
                  {t.price > 0 && (
                    <span style={{ fontSize: 11, color: T.clay, fontWeight: 600, marginLeft: 4 }}>${t.price.toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Sticker packs ── */}
        {packs.length > 0 && (
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <Package size={18} color={T.clay} />
              <h2 style={{ fontFamily: "var(--app-font-display)", fontSize: 20, fontWeight: 600, color: T.navy, margin: 0 }}>
                Sticker packs
              </h2>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {packs.map(p => (
                <div key={p.id} style={{
                  background: T.card, border: `1px solid ${T.border}`, borderRadius: 10,
                  padding: "10px 16px",
                }}>
                  <span style={{ fontSize: 13, color: T.navy, fontWeight: 500 }}>{p.name}</span>
                  {p.tags?.length > 0 && (
                    <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>{p.tags.slice(0, 2).join(", ")}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

      </main>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: `1px solid ${T.border}`, padding: "24px",
        textAlign: "center", color: T.muted, fontSize: 12,
      }}>
        <span>Powered by </span>
        <span style={{ color: T.navy, fontWeight: 600 }}>Daybook Studio</span>
      </footer>
    </div>
  );
}

// ── Error states ───────────────────────────────────────────────────────────────

function UnavailableState() {
  return (
    <div style={{ minHeight: "100vh", background: "#F7F0E6", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--app-font-sans)" }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#E7DCCB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <Sparkles size={28} color="#C87560" />
        </div>
        <h2 style={{ fontFamily: "var(--app-font-display)", fontSize: 26, fontWeight: 600, color: "#1B2A4A", margin: "0 0 12px" }}>
          Store temporarily unavailable
        </h2>
        <p style={{ color: "#4A6080", fontSize: 15, lineHeight: 1.6, margin: 0 }}>
          This store is currently paused. Please check back later or contact the store owner for more information.
        </p>
      </div>
    </div>
  );
}

function NotFoundState({ slug }: { slug: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "#F7F0E6", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--app-font-sans)" }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: "0 24px" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#E7DCCB", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <BookMarked size={28} color="#4A6080" />
        </div>
        <h2 style={{ fontFamily: "var(--app-font-display)", fontSize: 26, fontWeight: 600, color: "#1B2A4A", margin: "0 0 12px" }}>
          Store not found
        </h2>
        <p style={{ color: "#4A6080", fontSize: 15, lineHeight: 1.6 }}>
          We couldn't find a store at <strong>/{slug}</strong>. Double-check the link and try again.
        </p>
      </div>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <div style={{
      border: `1px dashed #E7DCCB`, borderRadius: 12,
      padding: "36px 24px", textAlign: "center", color: "#7A8FA6", fontSize: 14,
    }}>
      {message}
    </div>
  );
}
