export default function Slide04CoreEngine() {
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
          <div>GENERATION ENGINE</div><div>JULY 2026</div>
        </div>
      </div>

      {/* Left */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#0D9488", marginBottom: "1vh", textTransform: "uppercase", letterSpacing: "0.05em" }}>Shipped</div>
        <h1 style={{ fontSize: "3.5vw", fontWeight: 800, margin: "0 0 2.5vh 0", lineHeight: 1.1, letterSpacing: "-0.02em" }}>Core engine: what ships in every PDF</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5vh" }}>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Config-driven generation</span> — dated/undated, layout, sections, fonts, palette</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Realistic render pipeline</span> — grain overlay, binding art (coils, discs), texture backgrounds</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Ink-friendly &amp; e-ink profiles</span> — reMarkable, Supernote, Kindle Scribe</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>Google Calendar / Drive sync</span> baked into generated pages</div>
          </div>
          <div style={{ display: "flex", gap: "1vw", alignItems: "flex-start" }}>
            <div style={{ width: "0.6vw", height: "0.6vw", backgroundColor: "#0D9488", borderRadius: "50%", marginTop: "0.6vh", flexShrink: 0 }} />
            <div style={{ fontSize: "1.05vw", color: "#475569", lineHeight: 1.4 }}><span style={{ fontWeight: 600, color: "#1E3A5F" }}>XObject optimisation</span> keeps realistic files under 15 MB</div>
          </div>
        </div>
      </div>

      {/* Right — PDF layer diagram */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ background: "#FFFFFF", padding: "3vh 2.5vw", borderRadius: "1vw", border: "1px solid #E2E8F0", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.5vh", boxSizing: "border-box", boxShadow: "0 0.4vw 1.2vw rgba(30,58,95,0.06)" }}>
          <div style={{ fontSize: "1.1vw", fontWeight: 600, color: "#1E3A5F", borderBottom: "1px solid #E2E8F0", paddingBottom: "1.5vh" }}>PDF Layer Order</div>
          <div style={{ padding: "1.2vh 1.5vw", borderRadius: "0.5vw", backgroundColor: "#1E3A5F", color: "#FFFFFF" }}>
            <div style={{ fontSize: "0.8vw", fontWeight: 600, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "0.3vh" }}>Layer 5 — Top</div>
            <div style={{ fontSize: "1vw", fontWeight: 500 }}>Content (links, text, tables)</div>
          </div>
          <div style={{ padding: "1.2vh 1.5vw", borderRadius: "0.5vw", backgroundColor: "#0D9488", color: "#FFFFFF" }}>
            <div style={{ fontSize: "0.8vw", fontWeight: 600, textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: "0.3vh" }}>Layer 4</div>
            <div style={{ fontSize: "1vw", fontWeight: 500 }}>Grain &amp; binding XObjects</div>
          </div>
          <div style={{ padding: "1.2vh 1.5vw", borderRadius: "0.5vw", backgroundColor: "rgba(13,148,136,0.55)", color: "#FFFFFF" }}>
            <div style={{ fontSize: "0.8vw", fontWeight: 600, textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginBottom: "0.3vh" }}>Layer 3</div>
            <div style={{ fontSize: "1vw", fontWeight: 500 }}>Texture / image background</div>
          </div>
          <div style={{ padding: "1.2vh 1.5vw", borderRadius: "0.5vw", backgroundColor: "rgba(13,148,136,0.3)", color: "#1E3A5F" }}>
            <div style={{ fontSize: "0.8vw", fontWeight: 600, textTransform: "uppercase", color: "#64748B", marginBottom: "0.3vh" }}>Layer 2</div>
            <div style={{ fontSize: "1vw", fontWeight: 500 }}>Palette / colour fill</div>
          </div>
          <div style={{ padding: "1.2vh 1.5vw", borderRadius: "0.5vw", backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", color: "#1E3A5F" }}>
            <div style={{ fontSize: "0.8vw", fontWeight: 600, textTransform: "uppercase", color: "#64748B", marginBottom: "0.3vh" }}>Layer 1 — Base</div>
            <div style={{ fontSize: "1vw", fontWeight: 500 }}>Paper white</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #E2E8F0", paddingTop: "2vh", fontSize: "0.9vw", color: "#94A3B8", fontWeight: 500 }}>
        <div>Transition Trails</div>
        <div style={{ display: "flex", gap: "1vw" }}>
          <span>Confidential</span><span>•</span><span>Page 4</span>
        </div>
      </div>
    </div>
  );
}
