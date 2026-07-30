export default function Slide05AIStudios() {
  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      backgroundColor: "#FAFBFC", fontFamily: "'Inter', sans-serif",
      padding: "4vh 4vw", boxSizing: "border-box",
      display: "grid", gridTemplateColumns: "1fr",
      gridTemplateRows: "auto auto 1fr auto", gap: "3vh",
      color: "#1E3A5F"
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #E2E8F0", paddingBottom: "2vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
          <div style={{ width: "2vw", height: "2vw", backgroundColor: "#0D9488", borderRadius: "0.4vw" }} />
          <div style={{ fontSize: "1.2vw", fontWeight: 700, letterSpacing: "0.02em" }}>Daybook Studio</div>
        </div>
        <div style={{ display: "flex", gap: "2vw", fontSize: "1vw", fontWeight: 500, color: "#64748B" }}>
          <div>AI STUDIOS</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "0.8vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shipped</div>
        <h1 style={{ fontSize: "3.8vw", fontWeight: 800, margin: 0, lineHeight: 1.1, letterSpacing: "-0.02em" }}>AI Studios</h1>
      </div>

      {/* Three cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2vw" }}>
        <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)", display: "flex", flexDirection: "column" }}>
          <div style={{ width: "3.5vw", height: "3.5vw", backgroundColor: "#1E3A5F", borderRadius: "0.8vw", marginBottom: "2vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "1.5vw", height: "1.5vw", backgroundColor: "#0D9488", borderRadius: "0.3vw" }} />
          </div>
          <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "1.2vh" }}>Planner Studio</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1vh", flex: 1 }}>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Full visual builder with AI voice/tone controls</div>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Palette picker and template rail</div>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Platform-owned templates with monthly presets</div>
          </div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)", display: "flex", flexDirection: "column" }}>
          <div style={{ width: "3.5vw", height: "3.5vw", backgroundColor: "#0D9488", borderRadius: "0.8vw", marginBottom: "2vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: "1.5vw", height: "1.5vw", backgroundColor: "#FFFFFF", borderRadius: "50%" }} />
          </div>
          <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "1.2vh" }}>Sticker Studio</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1vh", flex: 1 }}>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Batch generation with BFS silhouette removal</div>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Moore-tracing SVG cut-lines for Cricut export</div>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>GoodNotes, Ink, and Cricut export targets</div>
          </div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)", display: "flex", flexDirection: "column" }}>
          <div style={{ width: "3.5vw", height: "3.5vw", backgroundColor: "rgba(13,148,136,0.15)", borderRadius: "0.8vw", marginBottom: "2vh", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(13,148,136,0.3)" }}>
            <div style={{ width: "1.5vw", height: "1.5vw", backgroundColor: "#0D9488", borderRadius: "0.3vw", transform: "rotate(45deg)" }} />
          </div>
          <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "1.2vh" }}>Marketing Studio</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1vh", flex: 1 }}>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>Listing copy and social captions</div>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>SVG product mockups grounded in store profile</div>
            <div style={{ fontSize: "0.95vw", color: "#64748B", lineHeight: 1.4 }}>All AI calls server-side with cross-store guards</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 5</span>
        </div>
      </div>
    </div>
  );
}
