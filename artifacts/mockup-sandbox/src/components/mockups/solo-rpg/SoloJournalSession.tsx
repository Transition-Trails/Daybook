import React, { useMemo, useState } from "react";
import {
  Archive,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Feather,
  FilePlus2,
  Leaf,
  Lock,
  Menu,
  MoreHorizontal,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Sprout,
  SunMedium,
  X,
} from "lucide-react";

type CanonKind = "Foundation Canon" | "Store addition" | "Unsaved discovery" | "Submitted for approval";

const canonEntries = [
  { title: "Elowen Vale", kind: "Character", note: "A keeper of small, impossible gardens.", mark: "EV" },
  { title: "The Glasshouse at Wychcombe", kind: "Location", note: "A conservatory where winter never quite arrives.", mark: "GW" },
  { title: "The Brass Seed Key", kind: "Object", note: "Warm to the touch when the garden remembers.", mark: "BK" },
  { title: "The Garden Remembers", kind: "Story movement", note: "What is buried may still be tending.", mark: "GR" },
] as const;

const labelStyle: Record<CanonKind, React.CSSProperties> = {
  "Foundation Canon": { color: "#526c5d", background: "#e4eee6", borderColor: "#c4d8c8" },
  "Store addition": { color: "#966348", background: "#f4e6d7", borderColor: "#e3c9b2" },
  "Unsaved discovery": { color: "#7b6650", background: "#f1eadc", borderColor: "#dccdb9" },
  "Submitted for approval": { color: "#655e88", background: "#e9e6f3", borderColor: "#d1cce7" },
};

export default function SoloJournalSession() {
  const [selected, setSelected] = useState(0);
  const [oracle, setOracle] = useState("The brass key is warm.");
  const [choice, setChoice] = useState("");
  const [journal, setJournal] = useState(
    "The glasshouse did not feel empty. Somewhere beneath the potting bench, something was counting the rain."
  );
  const [saved, setSaved] = useState(true);
  const [sceneStarted, setSceneStarted] = useState(false);
  const [showProposal, setShowProposal] = useState(false);
  const [proposedTitle, setProposedTitle] = useState("");
  const [proposalSent, setProposalSent] = useState(false);
  const [mobileRail, setMobileRail] = useState(false);

  const current = canonEntries[selected];
  const progress = useMemo(() => (sceneStarted ? 64 : 38), [sceneStarted]);

  function drawOracle() {
    const outcomes = [
      "A second shadow crosses the glass.",
      "The key remembers a door that is not there.",
      "A small green shoot turns towards Elowen.",
      "The rain stops, but the leaves keep listening.",
    ];
    setOracle(outcomes[Math.floor(Math.random() * outcomes.length)]);
    setSaved(false);
  }

  function saveJournal() {
    setSaved(true);
  }

  return (
    <div className="worldsmith-journal">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        .worldsmith-journal{--ink:#2d3934;--muted:#748079;--paper:#f7f3e9;--paper2:#fbf8f0;--line:#ddd7c9;--clay:#a86f50;--moss:#526c5d;min-height:100dvh;background:#ebe5d8;color:var(--ink);font-family:'Plus Jakarta Sans',sans-serif;display:flex;overflow:hidden}
        .wj-rail{width:224px;background:#273831;color:#dce4d7;padding:25px 18px;display:flex;flex-direction:column;flex-shrink:0;position:relative}
        .wj-brand{display:flex;align-items:center;gap:10px;margin:0 9px 44px;color:#f1eadb;letter-spacing:.02em;font-weight:600}
        .wj-brand svg{color:#c5a879}.wj-nav-label{font-family:'DM Mono';font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#9eafa1;margin:0 10px 12px}
        .wj-nav{display:flex;align-items:center;gap:11px;border:0;background:transparent;color:#bfcfc2;width:100%;padding:11px 10px;text-align:left;border-radius:7px;font-size:12px;cursor:pointer}
        .wj-nav.active{background:#3d5348;color:#fff}.wj-nav:hover{background:#344a40}
        .wj-rail-bottom{margin-top:auto;border-top:1px solid #43564c;padding:18px 10px 3px;font-size:11px;color:#9eafa1;line-height:1.65}
        .wj-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto}
        .wj-top{height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 39px;border-bottom:1px solid var(--line);background:rgba(251,248,240,.7)}
        .wj-crumb{font-family:'DM Mono';font-size:10px;color:#8a928b;letter-spacing:.08em;text-transform:uppercase}.wj-crumb strong{color:#44534b;font-weight:500}
        .wj-top-actions{display:flex;align-items:center;gap:14px;font-size:11px;color:#78837b}.wj-icon{border:0;background:transparent;color:#748079;cursor:pointer;padding:5px}
        .wj-body{max-width:1190px;width:100%;margin:0 auto;padding:31px 40px 60px}
        .wj-kicker{font-family:'DM Mono';font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--clay);display:flex;gap:10px;align-items:center}.wj-kicker:before{content:'';width:20px;height:1px;background:var(--clay)}
        h1,h2,h3{font-family:'Fraunces',serif;font-weight:600;margin:0}.wj-title{font-size:39px;line-height:1.05;margin:10px 0 7px;letter-spacing:-.025em}.wj-subtitle{font-size:13px;color:#7b837e;margin:0}
        .wj-sessionline{display:flex;align-items:center;gap:14px;margin:24px 0 18px;color:#778078;font-size:11px}.wj-sessionline .rule{height:1px;background:var(--line);flex:1}.wj-sessionline strong{font-family:'DM Mono';font-size:10px;color:#59665e;font-weight:500}
        .wj-grid{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(275px,.7fr);gap:22px;align-items:start}
        .wj-card{background:var(--paper2);border:1px solid var(--line);border-radius:9px;box-shadow:0 4px 16px rgba(72,66,53,.05)}.wj-card.pad{padding:24px}
        .wj-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px}.wj-card h2{font-size:23px}.wj-smallcap{font-family:'DM Mono';font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:#8a918a}
        .wj-canon-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.wj-canon{min-height:116px;border:1px solid #ded8ca;background:#f5f0e5;border-radius:7px;padding:12px 10px;cursor:pointer;text-align:left;transition:transform .15s, border-color .15s}.wj-canon:hover{transform:translateY(-2px);border-color:#b6aa91}.wj-canon.chosen{border:1.5px solid var(--moss);background:#edf1e8;box-shadow:inset 0 0 0 2px #edf1e8}.wj-canon-mark{font-family:'Fraunces';font-size:17px;color:#7f8e7d;border-bottom:1px solid #dbd3c4;padding-bottom:8px;margin-bottom:8px}.wj-canon-title{font-size:11px;font-weight:600;line-height:1.25;color:#3e4943}.wj-canon-type{font-size:9px;color:#8e948c;margin-top:6px}
        .wj-note{display:flex;align-items:flex-start;gap:8px;background:#f2eee4;border-left:2px solid #c5b79d;padding:11px 12px;font-size:11px;line-height:1.55;color:#716e64;margin-top:17px}.wj-note svg{flex-shrink:0;color:#927c5d;margin-top:1px}
        .wj-encounter{margin-top:22px;background:#33483d;color:#e4eadc;border-radius:9px;padding:24px;position:relative;overflow:hidden}.wj-encounter:after{content:'';position:absolute;right:24px;top:22px;width:10px;height:10px;border:1px solid #8da28c;transform:rotate(45deg);opacity:.55}.wj-encounter h2{font-size:22px;color:#f0ebda}.wj-encounter-copy{font-family:'Fraunces';font-size:16px;line-height:1.5;color:#c5d2c4;max-width:580px;margin:15px 0 21px}.wj-oracle{display:flex;align-items:center;justify-content:space-between;border:1px solid #617466;background:#3e5548;padding:11px 13px;border-radius:5px;margin-bottom:17px}.wj-oracle span{font-family:'Fraunces';font-size:16px;color:#f0e9d7}.wj-button{border:0;border-radius:5px;padding:10px 14px;font-size:11px;font-family:'Plus Jakarta Sans';cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s,background .15s}.wj-button:hover{transform:translateY(-1px)}.wj-button.dark{background:#e2d7bf;color:#32463b}.wj-button.dark:hover{background:#f0e6d2}.wj-button.ghost{background:transparent;color:#bed0bf;border:1px solid #718677}.wj-button.clay{background:var(--clay);color:#fff4e9}.wj-choices{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wj-choice{border:1px solid #5c7064;background:transparent;color:#d7e2d5;text-align:left;border-radius:5px;padding:12px;font-size:11px;line-height:1.4;cursor:pointer}.wj-choice:hover,.wj-choice.selected{background:#496152;border-color:#a9bea6}.wj-choice b{display:block;font-family:'DM Mono';font-size:9px;color:#a9b9a7;margin-bottom:4px}
        .wj-journal{margin-top:22px}.wj-journal-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:13px}.wj-journal-title h2{font-size:22px}.wj-save{font-size:10px;color:#8b958e;display:flex;gap:6px;align-items:center}.wj-save svg{color:#69836d}.wj-textarea{width:100%;min-height:137px;resize:vertical;border:1px solid #d6d0c1;border-radius:6px;background:#fffdf7;padding:15px;font:16px/1.65 'Fraunces',serif;color:#455049;outline:none}.wj-textarea:focus{border-color:#8da291;box-shadow:0 0 0 3px #dce6dc}.wj-journal-foot{display:flex;align-items:center;justify-content:space-between;margin-top:10px}.wj-provenance{font-size:10px;color:#8b9188}.wj-provenance a{color:#617d69;text-decoration:underline;cursor:pointer}.wj-side{display:flex;flex-direction:column;gap:16px}.wj-side-card{padding:20px}.wj-side h3{font-size:18px;margin:5px 0 16px}.wj-progress{height:5px;background:#e4ded0;border-radius:6px;overflow:hidden;margin:14px 0 9px}.wj-progress>span{height:100%;display:block;background:var(--clay);border-radius:6px;transition:width .3s}.wj-progress-meta{display:flex;justify-content:space-between;font-family:'DM Mono';font-size:9px;color:#879087}.wj-record{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #e7e1d5}.wj-record:last-child{border-bottom:0}.wj-record-icon{width:24px;height:24px;border-radius:50%;background:#e7eee7;display:grid;place-items:center;color:var(--moss);flex-shrink:0}.wj-record div{font-size:10px;line-height:1.4}.wj-record strong{font-size:11px;display:block;color:#47534c}.wj-record small{color:#8b9188}.wj-tag{display:inline-block;border:1px solid;padding:3px 6px;border-radius:3px;font-family:'DM Mono';font-size:8px;letter-spacing:.02em;margin-bottom:8px}
        .wj-resume{background:#efe5d5;border-color:#d9c7ae}.wj-resume h3{font-size:17px}.wj-resume p{font:14px/1.45 'Fraunces';color:#685f52;margin:11px 0 16px}.wj-resume .wj-button{width:100%}.wj-propose{margin-top:16px;border-top:1px solid var(--line);padding-top:16px}.wj-propose button{width:100%;background:transparent;border:1px dashed #bda98f;color:#8f644b;padding:10px;border-radius:5px;font-size:11px;cursor:pointer}
        .wj-modal-back{position:fixed;inset:0;background:rgba(38,48,42,.42);display:grid;place-items:center;padding:20px;z-index:5}.wj-modal{max-width:470px;width:100%;background:#fbf8f0;border:1px solid #d8cfbe;border-radius:9px;padding:25px;box-shadow:0 18px 60px rgba(34,45,37,.22)}.wj-modal-head{display:flex;justify-content:space-between;align-items:flex-start}.wj-modal h2{font-size:25px}.wj-modal p{font-size:11px;color:#7c827a;line-height:1.55;margin:9px 0 19px}.wj-input{width:100%;border:1px solid #d5cdbc;background:#fffdf7;border-radius:5px;padding:11px;font:14px 'Fraunces';color:var(--ink);outline:none}.wj-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
        @media(max-width:900px){.wj-rail{width:190px}.wj-body{padding:27px 23px}.wj-top{padding:0 23px}.wj-canon-row{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:720px){.worldsmith-journal{display:block;overflow:auto}.wj-rail{display:none}.wj-main{overflow:visible}.wj-top{height:61px;padding:0 17px}.wj-top-actions span{display:none}.wj-body{padding:25px 15px 45px}.wj-title{font-size:33px}.wj-grid{grid-template-columns:1fr}.wj-canon-row{grid-template-columns:repeat(2,1fr)}.wj-card.pad{padding:18px}.wj-encounter{padding:19px}.wj-choices{grid-template-columns:1fr}.wj-mobile-menu{display:block!important}.wj-sessionline{margin-top:20px}}
        .wj-mobile-menu{display:none}
      `}</style>

      <aside className="wj-rail">
        <div className="wj-brand"><Sprout size={18} strokeWidth={1.7} /> WorldSmith</div>
        <div className="wj-nav-label">My workshop</div>
        <button className="wj-nav active"><Feather size={15} /> Solo sessions</button>
        <button className="wj-nav"><Archive size={15} /> Story shelf</button>
        <button className="wj-nav"><Compass size={15} /> Canon index</button>
        <div className="wj-nav-label" style={{ marginTop: 28 }}>Today’s page</div>
        <button className="wj-nav"><BookOpen size={15} /> The Victorian Garden</button>
        <div className="wj-rail-bottom">
          <div style={{ color: "#d5ded2", marginBottom: 5 }}>A private workspace</div>
          Discoveries stay yours until you choose to share them with the editors.
        </div>
      </aside>

      <main className="wj-main">
        <header className="wj-top">
          <button className="wj-icon wj-mobile-menu" onClick={() => setMobileRail(!mobileRail)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="wj-crumb">Workshops <ChevronRight size={12} style={{ verticalAlign: "middle" }} /> <strong>Victorian Garden Journal</strong></div>
          <div className="wj-top-actions"><span><Save size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />{saved ? "Saved just now" : "Unsaved changes"}</span><button className="wj-icon" aria-label="More options"><MoreHorizontal size={18} /></button></div>
        </header>
        <div className="wj-body">
          <div className="wj-kicker">Solo journal session</div>
          <h1 className="wj-title">A door beneath the potting bench</h1>
          <p className="wj-subtitle">A quiet encounter in the Glasshouse at Wychcombe · Session 04</p>
          <div className="wj-sessionline"><span>Sunday, 17 November 1889</span><div className="rule" /><strong>{sceneStarted ? "IN PROGRESS" : "READY TO BEGIN"}</strong></div>

          <div className="wj-grid">
            <section>
              <div className="wj-card pad">
                <div className="wj-card-head"><div><div className="wj-smallcap">01 / Foundation canon</div><h2>Choose what the page remembers</h2></div><Lock size={15} color="#849087" aria-label="Foundation Canon is locked" /></div>
                <div className="wj-canon-row">
                  {canonEntries.map((entry, index) => <button key={entry.title} className={`wj-canon ${selected === index ? "chosen" : ""}`} onClick={() => setSelected(index)}><div className="wj-canon-mark">{entry.mark}</div><div className="wj-canon-title">{entry.title}</div><div className="wj-canon-type">{entry.kind}</div></button>)}
                </div>
                <div className="wj-note"><CircleHelp size={14} /><span><strong>Foundation Canon is immutable.</strong> You are choosing a lens for this session, not editing the world. Owner discoveries can be kept private or proposed separately.</span></div>
              </div>

              <div className="wj-encounter">
                <div className="wj-smallcap" style={{ color: "#9ab19b" }}>02 / The encounter</div>
                <h2>{sceneStarted ? "The glasshouse answers" : "Begin at the glasshouse"}</h2>
                <p className="wj-encounter-copy">{sceneStarted ? "The rain has stopped. Something under the bench has begun to breathe in the rhythm of the house." : "Elowen finds a narrow seam beneath the potting bench. The Brass Seed Key is warm in her pocket."}</p>
                <div className="wj-oracle"><span>{oracle}</span><button className="wj-button ghost" onClick={drawOracle}><RotateCcw size={13} /> Draw again</button></div>
                <div className="wj-choices">
                  <button className={`wj-choice ${choice === "lift" ? "selected" : ""}`} onClick={() => { setChoice("lift"); setSceneStarted(true); }}><b>01 · LOOK CLOSER</b>Lift the bench and follow the warmth.</button>
                  <button className={`wj-choice ${choice === "wait" ? "selected" : ""}`} onClick={() => { setChoice("wait"); setSceneStarted(true); }}><b>02 · WAIT</b>Leave the key on the soil and listen.</button>
                </div>
              </div>

              <div className="wj-card pad wj-journal">
                <div className="wj-journal-title"><div><div className="wj-smallcap">03 / Your journal</div><h2>What did Elowen notice?</h2></div><div className="wj-save">{saved ? <Check size={13} /> : <span style={{ color: "#a86f50" }}>•</span>} {saved ? "Private draft saved" : "Not saved"}</div></div>
                <textarea className="wj-textarea" value={journal} onChange={(event) => { setJournal(event.target.value); setSaved(false); }} aria-label="Journal response" />
                <div className="wj-journal-foot"><div className="wj-provenance">Drawn from <a>{current.title}</a> · The Garden Remembers · Scene 01</div><button className="wj-button clay" onClick={saveJournal}><Save size={13} /> Save entry</button></div>
              </div>
            </section>

            <aside className="wj-side">
              <div className="wj-card wj-side-card wj-resume"><div className="wj-tag" style={labelStyle["Unsaved discovery"]}>Unsaved discovery</div><h3>Resume this page</h3><p>{sceneStarted ? "You chose a path through the glasshouse. Your next note is waiting." : "Your last visit left an unopened question beneath the bench."}</p><button className="wj-button dark" onClick={() => { setSceneStarted(true); window.scrollTo({ top: 240, behavior: "smooth" }); }}>Continue session <ArrowRight size={14} /></button></div>
              <div className="wj-card wj-side-card"><div className="wj-smallcap">Session record</div><h3>Provenance, kept intact</h3><div className="wj-record"><div className="wj-record-icon"><Lock size={12} /></div><div><strong>Foundation Canon</strong><small>{current.title}</small></div></div><div className="wj-record"><div className="wj-record-icon" style={{ background: "#f5e8da", color: "#a86f50" }}><Leaf size={12} /></div><div><strong>Story movement</strong><small>The Garden Remembers</small></div></div><div className="wj-record"><div className="wj-record-icon" style={{ background: "#f0eadd", color: "#927c5d" }}><Feather size={12} /></div><div><strong>Private contribution</strong><small>Scene 01 · {choice ? "Choice recorded" : "Awaiting choice"}</small></div></div><div className="wj-progress"><span style={{ width: `${progress}%` }} /></div><div className="wj-progress-meta"><span>Session progress</span><span>{progress}%</span></div></div>
              <div className="wj-card wj-side-card"><div className="wj-smallcap">Make it yours</div><h3>Have you found a new thread?</h3><p style={{ fontSize: 11, color: "#7d847d", lineHeight: 1.5, margin: "8px 0 14px" }}>Keep an addition private while it is taking shape, or send a considered record to editorial review.</p>{proposalSent ? <div style={{ background: "#e9e6f3", color: "#655e88", padding: 11, borderRadius: 5, fontSize: 11, lineHeight: 1.45 }}><Check size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />Submitted for approval. The foundation remains unchanged.</div> : <div className="wj-propose"><button onClick={() => setShowProposal(true)}><FilePlus2 size={13} style={{ verticalAlign: "middle", marginRight: 5 }} /> Propose a new Canon record</button></div>}</div>
            </aside>
          </div>
        </div>
      </main>

      {showProposal && <div className="wj-modal-back" role="dialog" aria-modal="true"><div className="wj-modal"><div className="wj-modal-head"><div><div className="wj-smallcap">Editorial proposal</div><h2>A new thread</h2></div><button className="wj-icon" onClick={() => setShowProposal(false)} aria-label="Close"><X size={18} /></button></div><p>This creates an owner-scoped record for editorial review. It will never overwrite Foundation Canon, and stays private until submitted.</p><label className="wj-smallcap" htmlFor="proposal-title">Working title</label><input id="proposal-title" className="wj-input" value={proposedTitle} onChange={(event) => setProposedTitle(event.target.value)} placeholder="For example, The room beneath the roots" /><div className="wj-modal-actions"><button className="wj-button" onClick={() => setShowProposal(false)} style={{ background: "#ece5d8", color: "#606a62" }}>Keep private</button><button className="wj-button clay" disabled={!proposedTitle.trim()} onClick={() => { setProposalSent(true); setShowProposal(false); }}> <Send size={13} /> Submit for approval</button></div></div></div>}
    </div>
  );
}