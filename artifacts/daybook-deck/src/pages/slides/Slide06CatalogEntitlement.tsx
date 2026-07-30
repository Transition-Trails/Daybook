export default function Slide06CatalogEntitlement() {
  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      backgroundColor: "#FAFBFC", fontFamily: "'Inter', sans-serif",
      padding: "4vh 4vw", boxSizing: "border-box",
      display: "grid", gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "auto 1fr auto", gap: "3vh 4vw",
      color: "#1E3A5F"
    }}>
      {/* Header */}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #E2E8F0", paddingBottom: "2vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
          <div style={{ width: "2vw", height: "2vw", backgroundColor: "#0D9488", borderRadius: "0.4vw" }} />
          <div style={{ fontSize: "1.2vw", fontWeight: 700, letterSpacing: "0.02em" }}>Daybook Studio</div>
        </div>
        <div style={{ display: "flex", gap: "2vw", fontSize: "1vw", fontWeight: 500, color: "#64748B" }}>
          <div>CATALOG</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Left */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shipped</div>
        <h1 style={{ fontSize: "3.5vw", fontWeight: 800, margin: "0 0 2.5vh 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>Catalog &amp; entitlement system</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Three-tier origin model:</span> starter (platform IP), licensed (shared), owned (store-created)</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Entitlement engine</span> gates all catalog items at generation time — not display time</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Themes</span> composed from colour shells + palettes + backgrounds</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}>10 colour shells → 4 real theme bundles; <span style={{ fontWeight: 600, color: "#1E3A5F" }}>is_primary</span> palette drives default rendering</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Product recipes</span> define repeatable build configurations across the catalog</div>
          </div>
        </div>
      </div>

      {/* Right — 3-tier model */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "0", boxSizing: "border-box", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)" }}>
          <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#1E3A5F", borderBottom: "1px solid #E2E8F0", paddingBottom: "1.5vh", marginBottom: "2vh" }}>IP Origin Model</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
            <div style={{ padding: "2vh 2vw", borderRadius: "0.8vw", backgroundColor: "#1E3A5F", color: "#FFFFFF" }}>
              <div style={{ fontSize: "0.85vw", fontWeight: 600, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "0.4vh" }}>Starter — Platform IP</div>
              <div style={{ fontSize: "1.05vw" }}>Read-only; all stores access at launch</div>
            </div>
            <div style={{ padding: "2vh 2vw", borderRadius: "0.8vw", backgroundColor: "#0D9488", color: "#FFFFFF" }}>
              <div style={{ fontSize: "0.85vw", fontWeight: 600, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "0.4vh" }}>Licensed — Shared</div>
              <div style={{ fontSize: "1.05vw" }}>Granted by super admin; cross-store usage</div>
            </div>
            <div style={{ padding: "2vh 2vw", borderRadius: "0.8vw", backgroundColor: "rgba(13,148,136,0.12)", border: "1px solid rgba(13,148,136,0.25)", color: "#1E3A5F" }}>
              <div style={{ fontSize: "0.85vw", fontWeight: 600, textTransform: "uppercase", color: "#0D9488", marginBottom: "0.4vh" }}>Owned — Store-Created</div>
              <div style={{ fontSize: "1.05vw" }}>Private to the store; gated at generation</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 6</span>
        </div>
      </div>
    </div>
  );
}
