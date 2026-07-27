export default function Slide02WhatWeAreBuilding() {
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
          <div>PLATFORM OVERVIEW</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Left */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>The Platform</div>
        <h1 style={{ fontSize: "3.8vw", fontWeight: 800, margin: "0 0 2.5vh 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>What we're building</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.8vh" }}>
          <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.8vh 1.8vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)" }}>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#0D9488", backgroundColor: "rgba(13,148,136,0.1)", width: "2.5vw", height: "2.5vw", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", flexShrink: 0 }}>1</div>
            <div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#1E3A5F", marginBottom: "0.3vh" }}>White-label SaaS for planner creators</div>
              <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Sellers configure, brand, and sell AI-generated PDF planners without writing code</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.8vh 1.8vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)" }}>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#0D9488", backgroundColor: "rgba(13,148,136,0.1)", width: "2.5vw", height: "2.5vw", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", flexShrink: 0 }}>2</div>
            <div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#1E3A5F", marginBottom: "0.3vh" }}>Platform-managed catalog and engine</div>
              <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Provides the catalog, generation engine, and storefront infrastructure</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.8vh 1.8vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)" }}>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#0D9488", backgroundColor: "rgba(13,148,136,0.1)", width: "2.5vw", height: "2.5vw", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", flexShrink: 0 }}>3</div>
            <div>
              <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#1E3A5F", marginBottom: "0.3vh" }}>Personalised planners, zero manufacturing</div>
              <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Buyers get personalised planners; sellers get margin without physical goods</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — platform stack */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh", boxSizing: "border-box", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)" }}>
          <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#1E3A5F", borderBottom: "1px solid #E2E8F0", paddingBottom: "1.5vh" }}>Platform Stack</div>
          <div style={{ padding: "1.5vh 1.5vw", borderRadius: "0.6vw", backgroundColor: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.2)" }}>
            <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#0D9488", textTransform: "uppercase", marginBottom: "0.3vh" }}>Storefront</div>
            <div style={{ fontSize: "1vw", color: "#475569" }}>Multi-tenant buyer-facing shops</div>
          </div>
          <div style={{ padding: "1.5vh 1.5vw", borderRadius: "0.6vw", backgroundColor: "rgba(13,148,136,0.12)", border: "1px solid rgba(13,148,136,0.25)" }}>
            <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#0D9488", textTransform: "uppercase", marginBottom: "0.3vh" }}>AI Studios</div>
            <div style={{ fontSize: "1vw", color: "#475569" }}>Planner, Sticker, Marketing workbenches</div>
          </div>
          <div style={{ padding: "1.5vh 1.5vw", borderRadius: "0.6vw", backgroundColor: "rgba(13,148,136,0.17)", border: "1px solid rgba(13,148,136,0.3)" }}>
            <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#0D9488", textTransform: "uppercase", marginBottom: "0.3vh" }}>Generation Engine</div>
            <div style={{ fontSize: "1vw", color: "#475569" }}>Config-driven PDF build pipeline</div>
          </div>
          <div style={{ padding: "1.5vh 1.5vw", borderRadius: "0.6vw", backgroundColor: "#0D9488" }}>
            <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", marginBottom: "0.3vh" }}>Catalog &amp; Entitlements</div>
            <div style={{ fontSize: "1vw", color: "rgba(255,255,255,0.9)" }}>Themes, stickers, inserts, fonts — globally managed</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 2</span>
        </div>
      </div>
    </div>
  );
}
