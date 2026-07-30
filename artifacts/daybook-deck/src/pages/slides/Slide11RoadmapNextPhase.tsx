export default function Slide11RoadmapNextPhase() {
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
          <div>ROADMAP</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "0.8vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Coming Up</div>
        <h1 style={{ fontSize: "3.8vw", fontWeight: 800, margin: 0, lineHeight: 1.1, letterSpacing: "-0.02em" }}>Roadmap — next phase</h1>
      </div>

      {/* 2x3 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr 1fr", gap: "1.8vh 2vw" }}>
        <div style={{ background: "#FFFFFF", padding: "2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
          <div style={{ width: "2.8vw", height: "2.8vw", backgroundColor: "#0D9488", borderRadius: "0.5vw", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#FFFFFF", borderRadius: "0.2vw" }} />
          </div>
          <div>
            <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "0.4vh" }}>Stripe billing</div>
            <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Subscriptions, per-store plans, paywall</div>
          </div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
          <div style={{ width: "2.8vw", height: "2.8vw", backgroundColor: "#0D9488", borderRadius: "0.5vw", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#FFFFFF", borderRadius: "0.2vw" }} />
          </div>
          <div>
            <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "0.4vh" }}>Inbound email MX routing</div>
            <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Auto-creates support tickets from inbound mail</div>
          </div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
          <div style={{ width: "2.8vw", height: "2.8vw", backgroundColor: "rgba(13,148,136,0.15)", borderRadius: "0.5vw", border: "1px solid rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "0.2vw" }} />
          </div>
          <div>
            <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "0.4vh" }}>Resend sending domain</div>
            <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Pending domain-owner coordination</div>
          </div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
          <div style={{ width: "2.8vw", height: "2.8vw", backgroundColor: "rgba(13,148,136,0.15)", borderRadius: "0.5vw", border: "1px solid rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "0.2vw" }} />
          </div>
          <div>
            <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "0.4vh" }}>Branch protection on main</div>
            <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Requires 1 review + all CI checks green</div>
          </div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
          <div style={{ width: "2.8vw", height: "2.8vw", backgroundColor: "rgba(13,148,136,0.15)", borderRadius: "0.5vw", border: "1px solid rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "0.2vw" }} />
          </div>
          <div>
            <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "0.4vh" }}>Expanded E2E coverage</div>
            <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Beyond smoke tests — studio and generation flows</div>
          </div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
          <div style={{ width: "2.8vw", height: "2.8vw", backgroundColor: "rgba(13,148,136,0.15)", borderRadius: "0.5vw", border: "1px solid rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "0.2vw" }} />
          </div>
          <div>
            <div style={{ fontSize: "1.05vw", fontWeight: 700, color: "#1E3A5F", marginBottom: "0.4vh" }}>Public storefront UI</div>
            <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Buyer-facing shop and planner configurator</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 11</span>
        </div>
      </div>
    </div>
  );
}
