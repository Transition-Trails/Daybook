export default function Slide01Title() {
  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      backgroundColor: "#FAFBFC", fontFamily: "'Inter', sans-serif",
      padding: "4vh 4vw", boxSizing: "border-box",
      display: "grid", gridTemplateColumns: "3fr 2fr",
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
          <div>INTERNAL DECK</div>
          <div>JULY 2026</div>
        </div>
      </div>

      {/* Left */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Progress &amp; Roadmap</div>
        <h1 style={{ fontSize: "5vw", fontWeight: 800, margin: "0 0 1.5vh 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>Daybook Studio</h1>
        <p style={{ fontSize: "1.4vw", fontWeight: 400, color: "#475569", margin: "0 0 3vh 0", lineHeight: 1.5, maxWidth: "36vw" }}>
          White-label SaaS for digital planner creators — where we are and where we're going.
        </p>
        <div style={{ display: "flex", gap: "2vw" }}>
          <div style={{ background: "#FFFFFF", padding: "2vh 2vw", borderRadius: "1vw", border: "1px solid #E2E8F0", flex: 1, boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)" }}>
            <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#64748B", marginBottom: "0.8vh", textTransform: "uppercase" }}>Major Modules</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.8vw" }}>
              <div style={{ fontSize: "3.2vw", fontWeight: 700, color: "#1E3A5F" }}>8+</div>
              <div style={{ fontSize: "0.9vw", fontWeight: 600, color: "#0D9488", backgroundColor: "rgba(13,148,136,0.1)", padding: "0.4vh 0.7vw", borderRadius: "2vw" }}>Shipped</div>
            </div>
          </div>
          <div style={{ background: "#FFFFFF", padding: "2vh 2vw", borderRadius: "1vw", border: "1px solid #E2E8F0", flex: 1, boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)" }}>
            <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#64748B", marginBottom: "0.8vh", textTransform: "uppercase" }}>Open Tasks</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.8vw" }}>
              <div style={{ fontSize: "3.2vw", fontWeight: 700, color: "#1E3A5F" }}>25</div>
              <div style={{ fontSize: "0.9vw", fontWeight: 600, color: "#64748B", backgroundColor: "#F1F5F9", padding: "0.4vh 0.7vw", borderRadius: "2vw" }}>Tracked</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right — bar chart */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)" }}>
          <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#1E3A5F" }}>Platform Completeness</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "1vw", height: "22vh", borderBottom: "2px solid #E2E8F0", paddingBottom: "1vh" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8vh", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", height: "75%", backgroundColor: "#0D9488", borderRadius: "0.3vw 0.3vw 0 0" }} />
              <div style={{ fontSize: "0.8vw", color: "#64748B", fontWeight: 500 }}>Catalog</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8vh", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", height: "88%", backgroundColor: "#0D9488", borderRadius: "0.3vw 0.3vw 0 0" }} />
              <div style={{ fontSize: "0.8vw", color: "#64748B", fontWeight: 500 }}>Engine</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8vh", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", height: "95%", backgroundColor: "#0D9488", borderRadius: "0.3vw 0.3vw 0 0" }} />
              <div style={{ fontSize: "0.8vw", color: "#64748B", fontWeight: 500 }}>Studios</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8vh", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", height: "60%", backgroundColor: "rgba(13,148,136,0.35)", borderRadius: "0.3vw 0.3vw 0 0" }} />
              <div style={{ fontSize: "0.8vw", color: "#64748B", fontWeight: 500 }}>Support</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8vh", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", height: "100%", backgroundColor: "#0D9488", borderRadius: "0.3vw 0.3vw 0 0" }} />
              <div style={{ fontSize: "0.8vw", color: "#64748B", fontWeight: 500 }}>DevOps</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5vw" }}>
            <div style={{ width: "0.9vw", height: "0.9vw", backgroundColor: "#0D9488", borderRadius: "2px" }} />
            <span style={{ fontSize: "0.85vw", color: "#64748B" }}>Shipped</span>
            <div style={{ width: "0.9vw", height: "0.9vw", backgroundColor: "rgba(13,148,136,0.35)", borderRadius: "2px", marginLeft: "1vw" }} />
            <span style={{ fontSize: "0.85vw", color: "#64748B" }}>In Progress</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Internal Use Only</span>
        </div>
      </div>
    </div>
  );
}
