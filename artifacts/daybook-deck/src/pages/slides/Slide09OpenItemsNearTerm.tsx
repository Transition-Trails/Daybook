export default function Slide09OpenItemsNearTerm() {
  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      backgroundColor: "#FAFBFC", fontFamily: "'Inter', sans-serif",
      padding: "4vh 4vw", boxSizing: "border-box",
      display: "grid", gridTemplateColumns: "1fr",
      gridTemplateRows: "auto auto 1fr auto", gap: "2.5vh",
      color: "#1E3A5F"
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #E2E8F0", paddingBottom: "2vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
          <div style={{ width: "2vw", height: "2vw", backgroundColor: "#0D9488", borderRadius: "0.4vw" }} />
          <div style={{ fontSize: "1.2vw", fontWeight: 700, letterSpacing: "0.02em" }}>Daybook Studio</div>
        </div>
        <div style={{ display: "flex", gap: "2vw", fontSize: "1vw", fontWeight: 500, color: "#64748B" }}>
          <div>OPEN ITEMS</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "0.8vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Backlog</div>
        <h1 style={{ fontSize: "3.8vw", fontWeight: 800, margin: 0, lineHeight: 1.1, letterSpacing: "-0.02em" }}>Open items — near term</h1>
      </div>

      {/* 2-column checklist */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5vh 2vw" }}>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #0D9488", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Font specimens in theme catalog</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#83 — sellers browsing theme catalog</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #0D9488", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Binding-style picker for notebooks</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#50 — platform admin notebook editions</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #0D9488", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Oversized/non-image file guard</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#62 — background upload validation</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #0D9488", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Texture background slug validation</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#58 — theme background linkage guard</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #0D9488", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Global widget CRUD</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#73 — super admin widget slot in Theme Studio</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #0D9488", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Cover Art slot guard</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#74 — prevent inserts in wrong slot</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "rgba(13,148,136,0.05)", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid rgba(13,148,136,0.2)", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)", gridColumn: "1 / -1" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #0D9488", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Keyboard focus trap in rail and dock overlays</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#51 — accessibility: Tab must not escape overlay panels</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 9</span>
        </div>
      </div>
    </div>
  );
}
