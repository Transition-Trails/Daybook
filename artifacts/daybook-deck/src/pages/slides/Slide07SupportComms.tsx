export default function Slide07SupportComms() {
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
          <div>SUPPORT &amp; COMMS</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Left */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shipped</div>
        <h1 style={{ fontSize: "3.5vw", fontWeight: 800, margin: "0 0 2.5vh 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>Support &amp; communications layer</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Two-tier ticket system:</span> store inbox (seller/buyer) and super inbox (TT/seller)</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Close-reason taxonomy</span> drives pattern analysis — surfaces missing help articles</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Transactional email via Resend:</span> order receipts, domain verification, per-store rate limiting</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Periodic domain re-verify</span> job runs every 4 hours</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Volume upgrade prompt</span> appears at 1,000 sends/month</div>
          </div>
        </div>
      </div>

      {/* Right — ticket flow */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", boxSizing: "border-box", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)" }}>
          <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#1E3A5F", borderBottom: "1px solid #E2E8F0", paddingBottom: "1.5vh", marginBottom: "2vh" }}>Ticket Lifecycle</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0", position: "relative" }}>
            <div style={{ position: "absolute", left: "1.1vw", top: "2.5vh", bottom: "2.5vh", width: "2px", backgroundColor: "#E2E8F0" }} />
            <div style={{ display: "flex", gap: "2vw", alignItems: "center", position: "relative", zIndex: 1, marginBottom: "2.5vh" }}>
              <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "50%", border: "3px solid #FFFFFF", boxShadow: "0 0 0 1px #E2E8F0", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#0D9488", textTransform: "uppercase" }}>Opened</div>
                <div style={{ fontSize: "1vw", color: "#475569" }}>Buyer submits via storefront</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "2vw", alignItems: "center", position: "relative", zIndex: 1, marginBottom: "2.5vh" }}>
              <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "50%", border: "3px solid #FFFFFF", boxShadow: "0 0 0 1px #E2E8F0", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#0D9488", textTransform: "uppercase" }}>Triaged</div>
                <div style={{ fontSize: "1vw", color: "#475569" }}>Staff responds in store inbox</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "2vw", alignItems: "center", position: "relative", zIndex: 1, marginBottom: "2.5vh" }}>
              <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "50%", border: "3px solid #FFFFFF", boxShadow: "0 0 0 1px #E2E8F0", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#0D9488", textTransform: "uppercase" }}>Closed with Reason</div>
                <div style={{ fontSize: "1vw", color: "#475569" }}>5 canonical close reasons captured</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "2vw", alignItems: "center", position: "relative", zIndex: 1 }}>
              <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#1E3A5F", borderRadius: "50%", border: "3px solid #FFFFFF", boxShadow: "0 0 0 1px #E2E8F0", flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "0.85vw", fontWeight: 600, color: "#1E3A5F", textTransform: "uppercase" }}>Pattern Analysis</div>
                <div style={{ fontSize: "1vw", color: "#475569" }}>Ranked by reason — actionable clusters surfaced</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 7</span>
        </div>
      </div>
    </div>
  );
}
