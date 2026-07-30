export default function Slide10OpenItemsQuality() {
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
          <div>QUALITY &amp; TESTING</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "0.8vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Backlog</div>
        <h1 style={{ fontSize: "3.8vw", fontWeight: 800, margin: 0, lineHeight: 1.1, letterSpacing: "-0.02em" }}>Open items — quality &amp; testing</h1>
      </div>

      {/* 2-column checklist */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5vh 2vw" }}>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #64748B", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Planner PDF Google Fonts TTF embed</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#81, #87 — Lora or Playfair when reachable</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #64748B", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Planner font draft save/restore</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#82 — font choices persist when buyer reopens draft</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #64748B", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>12-month PDF link survival test</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#3 — full generation + link integrity</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #64748B", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Notebook/journal catalog migration</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#48 — one-shot seed into edition catalog</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #64748B", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>RBAC test suite regression coverage</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#91 — catches real permission regressions</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "#FFFFFF", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid #E2E8F0", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #64748B", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Studio tab spinner timeout</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#69 — graceful fallback when AI flags endpoint is slow</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start", background: "rgba(13,148,136,0.05)", padding: "1.6vh 1.8vw", borderRadius: "0.7vw", border: "1px solid rgba(13,148,136,0.2)", boxShadow: "0 0.2vw 0.8vw rgba(30,58,95,0.04)", gridColumn: "1 / -1" }}>
          <div style={{ width: "1.6vw", height: "1.6vw", borderRadius: "50%", border: "2px solid #64748B", flexShrink: 0, marginTop: "0.2vh" }} />
          <div>
            <div style={{ fontSize: "1vw", fontWeight: 600, color: "#1E3A5F" }}>Cricut cut-path alignment on shadow-padded exports</div>
            <div style={{ fontSize: "0.85vw", color: "#64748B" }}>#41 — shadow padding must not shift SVG cut contour</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 10</span>
        </div>
      </div>
    </div>
  );
}
