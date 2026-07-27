export default function Slide03WhoIsOnThePlatform() {
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
          <div>PLATFORM USERS</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "0.8vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Four Roles</div>
        <h1 style={{ fontSize: "3.8vw", fontWeight: 800, margin: 0, lineHeight: 1.1, letterSpacing: "-0.02em" }}>Who's on the platform</h1>
      </div>

      {/* 2x2 grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "2vh 2vw" }}>
        <div style={{ background: "#FFFFFF", padding: "2.5vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2vw", marginBottom: "1.2vh" }}>
            <div style={{ width: "3vw", height: "3vw", backgroundColor: "#1E3A5F", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "50%" }} />
            </div>
            <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#1E3A5F" }}>Super Admins</div>
          </div>
          <div style={{ fontSize: "1vw", color: "#64748B", lineHeight: 1.5 }}>Manage the global catalog, recipes, feature flags, and all stores on the platform</div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2.5vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2vw", marginBottom: "1.2vh" }}>
            <div style={{ width: "3vw", height: "3vw", backgroundColor: "#0D9488", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#FFFFFF", borderRadius: "50%" }} />
            </div>
            <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#1E3A5F" }}>Store Owners</div>
          </div>
          <div style={{ fontSize: "1vw", color: "#64748B", lineHeight: 1.5 }}>Run their own branded storefronts with custom themes and AI-generated products</div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2.5vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2vw", marginBottom: "1.2vh" }}>
            <div style={{ width: "3vw", height: "3vw", backgroundColor: "#64748B", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#FFFFFF", borderRadius: "50%" }} />
            </div>
            <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#1E3A5F" }}>Store Staff</div>
          </div>
          <div style={{ fontSize: "1vw", color: "#64748B", lineHeight: 1.5 }}>Manage support tickets, orders, and day-to-day store operations</div>
        </div>
        <div style={{ background: "rgba(13,148,136,0.05)", padding: "2.5vh 2.5vw", borderRadius: "1vw", border: "1px solid rgba(13,148,136,0.2)", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1.2vw", marginBottom: "1.2vh" }}>
            <div style={{ width: "3vw", height: "3vw", backgroundColor: "rgba(13,148,136,0.15)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(13,148,136,0.3)", flexShrink: 0 }}>
              <div style={{ width: "1.2vw", height: "1.2vw", backgroundColor: "#0D9488", borderRadius: "50%" }} />
            </div>
            <div style={{ fontSize: "1.4vw", fontWeight: 700, color: "#1E3A5F" }}>Buyers</div>
          </div>
          <div style={{ fontSize: "1vw", color: "#64748B", lineHeight: 1.5 }}>Configure and purchase personalised planners via the store's branded storefront</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 3</span>
        </div>
      </div>
    </div>
  );
}
