export default function Slide08DevFoundation() {
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
          <div>DEVELOPER FOUNDATION</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Title */}
      <div>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "0.8vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shipped This Session</div>
        <h1 style={{ fontSize: "3.8vw", fontWeight: 800, margin: 0, lineHeight: 1.1, letterSpacing: "-0.02em" }}>Developer foundation</h1>
      </div>

      {/* 2x3 grid of tools */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "2vh 2vw" }}>
        <div style={{ background: "#FFFFFF", padding: "2.2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "0.8vh" }}>
            <div style={{ width: "2.2vw", height: "2.2vw", backgroundColor: "#1E3A5F", borderRadius: "0.4vw", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "1vw", height: "1vw", backgroundColor: "#FFFFFF", borderRadius: "0.2vw" }} />
            </div>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#1E3A5F" }}>GitHub Repo</div>
          </div>
          <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Transition-Trails/Daybook — live with 146 commits</div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2.2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "0.8vh" }}>
            <div style={{ width: "2.2vw", height: "2.2vw", backgroundColor: "#0D9488", borderRadius: "0.4vw", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "0", height: "0", borderLeft: "0.5vw solid transparent", borderRight: "0.5vw solid transparent", borderBottom: "0.9vw solid #FFFFFF" }} />
            </div>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#1E3A5F" }}>GitHub Actions CI</div>
          </div>
          <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Typecheck + build, unit tests, migrations, Playwright E2E</div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2.2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "0.8vh" }}>
            <div style={{ width: "2.2vw", height: "2.2vw", backgroundColor: "#475569", borderRadius: "0.4vw", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: "1vw", height: "1vw", backgroundColor: "#0D9488", borderRadius: "50%" }} />
            </div>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#1E3A5F" }}>Playwright E2E</div>
          </div>
          <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>5 pre-authed personas, smoke suites, CI seed script</div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2.2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "0.8vh" }}>
            <div style={{ width: "2.2vw", height: "2.2vw", backgroundColor: "rgba(13,148,136,0.15)", borderRadius: "0.4vw", border: "1px solid rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ fontSize: "1vw", fontWeight: 700, color: "#0D9488" }}>D</div>
            </div>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#1E3A5F" }}>Dependabot</div>
          </div>
          <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Weekly npm security patches; major bumps excluded</div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2.2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "0.8vh" }}>
            <div style={{ width: "2.2vw", height: "2.2vw", backgroundColor: "rgba(13,148,136,0.15)", borderRadius: "0.4vw", border: "1px solid rgba(13,148,136,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ fontSize: "1vw", fontWeight: 700, color: "#0D9488" }}>C</div>
            </div>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#1E3A5F" }}>CODEOWNERS</div>
          </div>
          <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Angela auto-assigned on all PRs; db/ needs explicit sign-off</div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "2.2vh 2vw", borderRadius: "0.8vw", border: "1px solid #E2E8F0", boxShadow: "0 0.3vw 1vw rgba(30,58,95,0.05)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1vw", marginBottom: "0.8vh" }}>
            <div style={{ width: "2.2vw", height: "2.2vw", backgroundColor: "#1E3A5F", borderRadius: "0.4vw", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ fontSize: "0.9vw", fontWeight: 700, color: "#0D9488" }}>QL</div>
            </div>
            <div style={{ fontSize: "1.1vw", fontWeight: 700, color: "#1E3A5F" }}>CodeQL</div>
          </div>
          <div style={{ fontSize: "0.9vw", color: "#64748B", lineHeight: 1.4 }}>Static security scanning on push, PR, and weekly schedule</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 8</span>
        </div>
      </div>
    </div>
  );
}
