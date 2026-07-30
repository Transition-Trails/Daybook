export default function Slide12FocusThisWeek() {
  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      backgroundColor: "#FAFBFC", fontFamily: "'Inter', sans-serif",
      padding: "4vh 4vw", boxSizing: "border-box",
      display: "grid", gridTemplateColumns: "1fr",
      gridTemplateRows: "auto 1fr auto", gap: "3vh",
      color: "#1E3A5F"
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #E2E8F0", paddingBottom: "2vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
          <div style={{ width: "2vw", height: "2vw", backgroundColor: "#0D9488", borderRadius: "0.4vw" }} />
          <div style={{ fontSize: "1.2vw", fontWeight: 700, letterSpacing: "0.02em" }}>Daybook Studio</div>
        </div>
        <div style={{ display: "flex", gap: "2vw", fontSize: "1vw", fontWeight: 500, color: "#64748B" }}>
          <div>THIS WEEK</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Action Items</div>
        <h1 style={{ fontSize: "4vw", fontWeight: 800, margin: "0 0 3vh 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>What to focus on this week</h1>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2vh 2vw" }}>
          <div style={{ background: "#1E3A5F", padding: "3vh 2.5vw", borderRadius: "1vw", color: "#FFFFFF" }}>
            <div style={{ fontSize: "2.5vw", fontWeight: 800, color: "#0D9488", marginBottom: "1.5vh" }}>01</div>
            <div style={{ fontSize: "1.2vw", fontWeight: 700, marginBottom: "0.8vh" }}>Confirm branch protection on main</div>
            <div style={{ fontSize: "1vw", color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>GitHub Settings — Branches — require 1 review + CI pass</div>
          </div>
          <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "2px solid #0D9488" }}>
            <div style={{ fontSize: "2.5vw", fontWeight: 800, color: "#0D9488", marginBottom: "1.5vh" }}>02</div>
            <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "0.8vh" }}>Verify Resend sending domain</div>
            <div style={{ fontSize: "1vw", color: "#64748B", lineHeight: 1.4 }}>Coordinate DNS records with domain owner</div>
          </div>
          <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "2px solid #0D9488" }}>
            <div style={{ fontSize: "2.5vw", fontWeight: 800, color: "#0D9488", marginBottom: "1.5vh" }}>03</div>
            <div style={{ fontSize: "1.2vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "0.8vh" }}>Pick 3 open items to close</div>
            <div style={{ fontSize: "1vw", color: "#64748B", lineHeight: 1.4 }}>Choose from the near-term backlog on slide 9</div>
          </div>
          <div style={{ background: "#1E3A5F", padding: "3vh 2.5vw", borderRadius: "1vw", color: "#FFFFFF" }}>
            <div style={{ fontSize: "2.5vw", fontWeight: 800, color: "#0D9488", marginBottom: "1.5vh" }}>04</div>
            <div style={{ fontSize: "1.2vw", fontWeight: 700, marginBottom: "0.8vh" }}>Run seed:ci and verify Playwright</div>
            <div style={{ fontSize: "1vw", color: "rgba(255,255,255,0.7)", lineHeight: 1.4 }}>Confirm all 5 personas log in cleanly in CI</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 12</span>
        </div>
      </div>
    </div>
  );
}
