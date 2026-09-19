import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Feather,
  Info,
  Leaf,
  LockKeyhole,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

type CanonItem = {
  id: string;
  kind: "Character" | "Place" | "Object" | "Movement";
  title: string;
  detail: string;
  mark: string;
};

const canon: CanonItem[] = [
  { id: "elowen", kind: "Character", title: "Elowen Vale", detail: "A keeper of quiet remedies and unfinished letters.", mark: "EV" },
  { id: "glasshouse", kind: "Place", title: "The Glasshouse at Wychcombe", detail: "A warm room where rain becomes a silver curtain.", mark: "GW" },
  { id: "key", kind: "Object", title: "The Brass Seed Key", detail: "A small key with soil caught in its teeth.", mark: "BK" },
  { id: "remembers", kind: "Movement", title: "The Garden Remembers", detail: "What was buried is beginning to answer.", mark: "GR" },
];

const choices = [
  { label: "Follow the key's warmth", text: "Elowen turns the key toward the oldest bed, where a seam of light has appeared." },
  { label: "Read the glass", text: "She breathes on the glass. A map blooms in the fog, naming a place she has never seen." },
  { label: "Wait for the garden", text: "She sets the key down and listens. Beneath the rain, something knocks three times." },
];

const styles = `
  .pd-shell { min-height:100dvh; background:#f3eee3; color:#29362d; font-family:"Avenir Next", "Segoe UI", sans-serif; }
  .pd-shell * { box-sizing:border-box; }
  .pd-layout { display:grid; grid-template-columns:250px minmax(0,1fr); min-height:100dvh; }
  .pd-rail { background:#24352d; color:#efe8d9; padding:27px 19px; display:flex; flex-direction:column; border-right:1px solid #3b5142; }
  .pd-brand { display:flex; align-items:center; gap:11px; margin:0 9px 42px; }
  .pd-brand-mark { width:31px;height:31px;border:1px solid #b9c39d; border-radius:50%; display:grid;place-items:center;color:#d4d9af; }
  .pd-brand-name { font:600 18px Georgia, serif; letter-spacing:.01em; }
  .pd-brand-name span { color:#c5cc9e; font-style:italic; font-weight:400; }
  .pd-kicker { color:#9daa8a; font:600 10px "SFMono-Regular",Consolas,monospace; letter-spacing:.14em; text-transform:uppercase; margin:0 10px 12px; }
  .pd-nav { display:grid; gap:5px; }
  .pd-nav button { border:0; background:transparent; color:#bdc8b8; border-radius:7px; padding:11px 10px; text-align:left; font-size:13px; display:flex; align-items:center; gap:11px; cursor:pointer; }
  .pd-nav button.active { background:#3b5243; color:#f5efdf; }
  .pd-nav button:hover { background:#344b3d; color:#fff9e9; }
  .pd-rail-note { margin-top:auto; border-top:1px solid #405446; padding:18px 9px 0; }
  .pd-rail-note p { margin:7px 0 0; font:italic 14px Georgia,serif; line-height:1.45; color:#d5d4bd; }
  .pd-main { min-width:0; }
  .pd-topbar { height:77px; border-bottom:1px solid #dfd6c5; display:flex; align-items:center; justify-content:space-between; padding:0 clamp(22px,5vw,70px); background:#f7f2e9cc; }
  .pd-breadcrumb { font:600 11px "SFMono-Regular",Consolas,monospace; color:#777e70; letter-spacing:.08em; text-transform:uppercase; }
  .pd-breadcrumb b { color:#bd684b; font-weight:600; }
  .pd-top-actions { display:flex; align-items:center; gap:17px; color:#798073; font-size:12px; }
  .pd-status { display:flex; align-items:center; gap:7px; }
  .pd-dot { width:7px; height:7px; background:#ba775a; border-radius:50%; }
  .pd-avatar { width:31px;height:31px;background:#d4ad8e;color:#4e3d32;border-radius:50%;display:grid;place-items:center;font:600 11px Georgia,serif; }
  .pd-content { max-width:1090px; margin:0 auto; padding:45px clamp(22px,5vw,70px) 80px; }
  .pd-eyebrow { display:flex; align-items:center; gap:9px; color:#a05b43; font:600 11px "SFMono-Regular",Consolas,monospace; text-transform:uppercase; letter-spacing:.12em; }
  .pd-eyebrow:before { content:""; width:22px; height:1px; background:#b56b50; }
  .pd-heading { max-width:680px; margin:12px 0 10px; font:400 clamp(32px,4.4vw,54px)/1.08 Georgia,serif; letter-spacing:-.035em; color:#29362d; }
  .pd-intro { color:#72796e; max-width:570px; font-size:15px; line-height:1.65; margin:0; }
  .pd-progress { display:flex; gap:6px; margin:31px 0 29px; }
  .pd-progress span { height:3px; flex:1; background:#d8d2c3; border-radius:3px; max-width:112px; }
  .pd-progress span.done { background:#b86b51; }
  .pd-progress span.current { background:#687c59; }
  .pd-progress-label { font:600 10px "SFMono-Regular",Consolas,monospace; color:#83887d; letter-spacing:.1em; text-transform:uppercase; margin-left:12px; }
  .pd-card { background:#fbf8f0; border:1px solid #dfd6c5; box-shadow:0 10px 30px rgba(74,65,48,.07); border-radius:3px; overflow:hidden; }
  .pd-card-head { display:flex; justify-content:space-between; align-items:flex-start; padding:28px 31px 19px; border-bottom:1px solid #e9e2d5; }
  .pd-card-index { color:#a05b43; font:600 11px "SFMono-Regular",Consolas,monospace; letter-spacing:.11em; text-transform:uppercase; }
  .pd-card h2 { font:400 26px Georgia,serif; margin:8px 0 0; color:#304034; }
  .pd-card-copy { color:#778074; font-size:13px; line-height:1.5; margin:5px 0 0; }
  .pd-guidance { padding:11px 31px; background:#f0eee0; color:#66715d; font-size:12px; display:flex; align-items:center; gap:8px; }
  .pd-canon-grid { padding:24px 31px 29px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:11px; }
  .pd-canon-item { text-align:left; border:1px solid #ddd5c5; background:#faf7ee; padding:16px; border-radius:3px; min-height:113px; cursor:pointer; transition:transform .18s ease,border-color .18s ease,background .18s ease; }
  .pd-canon-item:hover { transform:translateY(-2px); border-color:#bd8066; }
  .pd-canon-item.selected { background:#edf0df; border-color:#7b8c65; box-shadow:inset 3px 0 #7b8c65; }
  .pd-canon-top { display:flex; justify-content:space-between; align-items:center; }
  .pd-kind { color:#a05b43; font:600 9px "SFMono-Regular",Consolas,monospace; text-transform:uppercase; letter-spacing:.1em; }
  .pd-check { color:#728559; }
  .pd-canon-item h3 { font:400 17px Georgia,serif; margin:10px 0 5px; color:#354438; }
  .pd-canon-item p { color:#7d8376; font-size:11px; line-height:1.4; margin:0; }
  .pd-card-foot { display:flex; align-items:center; justify-content:space-between; padding:17px 31px; background:#f7f3e9; border-top:1px solid #e9e2d5; }
  .pd-provenance { display:flex; flex-wrap:wrap; gap:7px; }
  .pd-tag { border-radius:100px; padding:5px 9px; font:600 9px "SFMono-Regular",Consolas,monospace; letter-spacing:.03em; }
  .pd-tag.foundation { background:#dfe7d3; color:#536748; }
  .pd-tag.addition { background:#ead7c8; color:#91573e; }
  .pd-tag.unsaved { background:#eee5c9; color:#8c7040; }
  .pd-tag.submitted { background:#ded9e0; color:#62576d; }
  .pd-button { border:1px solid #cfc6b5; background:#fdf9f0; color:#536052; padding:10px 14px; border-radius:3px; font-weight:600; font-size:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; }
  .pd-button:hover { background:#f0eadc; }
  .pd-button.primary { color:#f8f2e4; background:#b5674e; border-color:#b5674e; }
  .pd-button.primary:hover { background:#9e5943; }
  .pd-button:disabled { opacity:.45; cursor:not-allowed; }
  .pd-lower { display:grid; grid-template-columns:1.18fr .82fr; gap:19px; margin-top:20px; }
  .pd-mini { padding:21px 23px; background:#ebe6d8; border:1px solid #dbd3c1; border-radius:3px; }
  .pd-mini h3 { margin:0 0 8px; font:400 19px Georgia,serif; color:#354438; }
  .pd-mini p { margin:0; font-size:12px; line-height:1.55; color:#72786e; }
  .pd-mini .pd-button { margin-top:16px; background:transparent; }
  .pd-resume { background:#354b3d; color:#e9ecd9; padding:21px 23px; border-radius:3px; position:relative; overflow:hidden; }
  .pd-resume:after { content:""; position:absolute; width:120px;height:120px;border:1px solid #758367;border-radius:50%;right:-52px;bottom:-56px; opacity:.5; }
  .pd-resume h3 { margin:0 0 6px; font:400 19px Georgia,serif; }
  .pd-resume p { margin:0; color:#c2cdb7; font-size:12px; line-height:1.5; }
  .pd-resume .pd-button { margin-top:15px; color:#e8eddb; border-color:#6d8069; background:transparent; position:relative; z-index:1; }
  .pd-premise { padding:30px 31px; }
  .pd-premise blockquote { border-left:2px solid #b56b50; margin:0 0 22px; padding:3px 0 3px 18px; font:italic 22px/1.45 Georgia,serif; color:#3b493d; }
  .pd-label { display:block; color:#7c8176; font:600 10px "SFMono-Regular",Consolas,monospace; text-transform:uppercase; letter-spacing:.1em; margin:19px 0 8px; }
  .pd-textarea { width:100%; min-height:100px; resize:vertical; border:1px solid #d9d0bf; background:#fdfaf3; padding:13px; color:#3a493d; font:15px/1.5 Georgia,serif; outline:none; }
  .pd-textarea:focus { border-color:#7a8d68; box-shadow:0 0 0 2px #dfe7d3; }
  .pd-choice-grid { display:grid; gap:9px; padding:23px 31px; }
  .pd-choice { text-align:left; padding:14px 16px; border:1px solid #ded5c4; background:#fdfaf2; cursor:pointer; color:#4b594c; font:14px Georgia,serif; display:flex; align-items:center; justify-content:space-between; }
  .pd-choice:hover,.pd-choice.selected { border-color:#b56b50; background:#f5e9de; }
  .pd-choice small { display:block; color:#8b8e81; font:11px "Avenir Next",sans-serif; margin-top:4px; }
  .pd-scene { padding:27px 31px; }
  .pd-scene p { font:17px/1.7 Georgia,serif; color:#465344; margin:0; }
  .pd-scene-meta { display:flex; align-items:center; gap:9px; margin-top:21px; color:#8a8d7d; font:10px "SFMono-Regular",Consolas,monospace; text-transform:uppercase; letter-spacing:.06em; }
  .pd-scene-meta i { width:6px;height:6px;background:#c18a69;border-radius:50%; }
  .pd-modal-wrap { position:fixed; inset:0; background:rgba(38,49,40,.38); display:grid; place-items:center; padding:20px; z-index:3; }
  .pd-modal { width:min(470px,100%); background:#fbf8f0; border:1px solid #d7cebc; box-shadow:0 18px 60px rgba(35,45,37,.22); padding:27px; }
  .pd-modal-head { display:flex; justify-content:space-between; align-items:flex-start; }
  .pd-modal h2 { font:400 25px Georgia,serif; margin:0; }
  .pd-close { border:0;background:transparent;color:#777d70;cursor:pointer; }
  .pd-modal input,.pd-modal textarea { width:100%; border:1px solid #d8cfbe; background:#fffaf1; padding:11px; font:14px "Avenir Next",sans-serif; color:#39473c; outline:none; }
  .pd-modal textarea { min-height:90px; resize:vertical; }
  .pd-modal input:focus,.pd-modal textarea:focus { border-color:#7b8c65; }
  .pd-modal-actions { margin-top:20px; display:flex; justify-content:flex-end; gap:9px; }
  @media (max-width:760px) {
    .pd-layout { grid-template-columns:1fr; }
    .pd-rail { display:none; }
    .pd-topbar { height:62px; padding:0 18px; }
    .pd-content { padding:31px 16px 55px; }
    .pd-heading { font-size:38px; }
    .pd-card-head,.pd-card-foot,.pd-guidance,.pd-canon-grid,.pd-choice-grid,.pd-premise,.pd-scene { padding-left:18px; padding-right:18px; }
    .pd-canon-grid,.pd-lower { grid-template-columns:1fr; }
    .pd-card-foot { align-items:flex-start; gap:14px; flex-direction:column; }
    .pd-top-actions span { display:none; }
  }
`;

export default function PromptDeck() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(["elowen", "glasshouse"]);
  const [premise, setPremise] = useState("At dusk, Elowen finds the Brass Seed Key warm beneath a tray of wintering violets.");
  const [choice, setChoice] = useState<number | null>(null);
  const [sceneNote, setSceneNote] = useState("The glasshouse holds its breath. Somewhere beyond the fern shelves, a latch answers the little key.");
  const [showProposal, setShowProposal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("The Violet Door");
  const [proposalDetail, setProposalDetail] = useState("A hidden door beneath the west bench, opened only when the garden has something to remember.");
  const [saved, setSaved] = useState(false);

  const selectedCanon = useMemo(() => canon.filter((item) => selected.includes(item.id)), [selected]);
  const toggleCanon = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const next = () => setStep((current) => Math.min(current + 1, 3));
  const back = () => setStep((current) => Math.max(current - 1, 0));

  return (
    <div className="pd-shell">
      <style>{styles}</style>
      <div className="pd-layout">
        <aside className="pd-rail">
          <div className="pd-brand"><div className="pd-brand-mark"><Feather size={15} /></div><div className="pd-brand-name">World<span>Smith</span></div></div>
          <div className="pd-kicker">The Victorian Garden Journal</div>
          <nav className="pd-nav" aria-label="Workspace">
            <button className="active" onClick={() => setStep(0)}><Sparkles size={15} />Prompt deck</button>
            <button onClick={() => setStep(1)}><BookOpen size={15} />My discoveries <span style={{ marginLeft:"auto", color:"#c6c997" }}>1</span></button>
            <button onClick={() => setShowProposal(true)}><Send size={15} />Proposed Canon {submitted && <span style={{ marginLeft:"auto", color:"#d9b49a" }}>1</span>}</button>
          </nav>
          <div className="pd-rail-note"><Leaf size={15} color="#c6c997" /><p>Build from what is already true. Leave room for the story to surprise you.</p></div>
        </aside>
        <main className="pd-main">
          <header className="pd-topbar">
            <div className="pd-breadcrumb">Workspace <b>/</b> New story moment</div>
            <div className="pd-top-actions"><div className="pd-status"><i className="pd-dot" /> <span>{saved ? "Saved privately" : "Unsaved discovery"}</span></div><div className="pd-avatar">AV</div></div>
          </header>
          <section className="pd-content">
            <div className="pd-eyebrow">A guided beginning</div>
            <h1 className="pd-heading">Open a door in the garden.</h1>
            <p className="pd-intro">Choose a few truths from your world, then follow the thread they make together. Nothing is published until you decide it is ready.</p>
            <div className="pd-progress" aria-label={`Step ${step + 1} of 4`}>{[0,1,2,3].map((item) => <span key={item} className={item < step ? "done" : item === step ? "current" : ""} />)}<div className="pd-progress-label">0{step + 1} / 04</div></div>

            {step === 0 && <div className="pd-card">
              <div className="pd-card-head"><div><div className="pd-card-index">Card one · Select the known</div><h2>What will the garden remember?</h2><p className="pd-card-copy">Start with two or three pieces of Foundation Canon. These records are locked and cannot be edited here.</p></div><LockKeyhole size={19} color="#869178" /></div>
              <div className="pd-guidance"><Info size={14} /> Foundation Canon is the shared source of truth. Your additions stay yours until submitted.</div>
              <div className="pd-canon-grid">{canon.map((item) => <button key={item.id} className={`pd-canon-item ${selected.includes(item.id) ? "selected" : ""}`} onClick={() => toggleCanon(item.id)}><div className="pd-canon-top"><span className="pd-kind">{item.kind}</span>{selected.includes(item.id) && <Check className="pd-check" size={16} />}</div><h3>{item.title}</h3><p>{item.detail}</p></button>)}</div>
              <div className="pd-card-foot"><div className="pd-provenance"><span className="pd-tag foundation">Foundation Canon · {selectedCanon.length} selected</span></div><button className="pd-button primary" disabled={selected.length < 2} onClick={next}>Shape the premise <ArrowRight size={14} /></button></div>
            </div>}

            {step === 1 && <div className="pd-card">
              <div className="pd-card-head"><div><div className="pd-card-index">Card two · Find the thread</div><h2>A premise to carry forward</h2><p className="pd-card-copy">Weaving the selected records together gives you a starting point, not a rule.</p></div><Wand2 size={19} color="#ae765e" /></div>
              <div className="pd-premise"><blockquote>“The garden does not forget. It only waits for the right hand.”</blockquote><label className="pd-label" htmlFor="premise">Suggested premise · editable private draft</label><textarea id="premise" className="pd-textarea" value={premise} onChange={(event) => { setPremise(event.target.value); setSaved(false); }} /><div className="pd-provenance" style={{ marginTop:19 }}><span className="pd-tag foundation">Elowen Vale</span><span className="pd-tag foundation">The Glasshouse at Wychcombe</span><span className="pd-tag unsaved">Unsaved discovery</span></div></div>
              <div className="pd-card-foot"><button className="pd-button" onClick={back}><ChevronLeft size={14} /> Back</button><button className="pd-button primary" onClick={next}>Choose a turn <ArrowRight size={14} /></button></div>
            </div>}

            {step === 2 && <div className="pd-card">
              <div className="pd-card-head"><div><div className="pd-card-index">Card three · Make a meaningful choice</div><h2>What does Elowen do next?</h2><p className="pd-card-copy">A small decision is enough. Choose the pressure you want the next scene to hold.</p></div><Leaf size={19} color="#70835e" /></div>
              <div className="pd-choice-grid">{choices.map((item, index) => <button key={item.label} className={`pd-choice ${choice === index ? "selected" : ""}`} onClick={() => setChoice(index)}><span><strong>{item.label}</strong><small>{item.text}</small></span>{choice === index ? <Check size={16} color="#a45f48" /> : <ChevronRight size={16} color="#9da293" />}</button>)}</div>
              <div className="pd-card-foot"><div className="pd-provenance"><span className="pd-tag foundation">Foundation Canon</span><span className="pd-tag unsaved">Choice stays private</span></div><div><button className="pd-button" onClick={back} style={{ marginRight:8 }}><ChevronLeft size={14} /> Back</button><button className="pd-button primary" disabled={choice === null} onClick={next}>Write the scene <ArrowRight size={14} /></button></div></div>
            </div>}

            {step === 3 && <div className="pd-card">
              <div className="pd-card-head"><div><div className="pd-card-index">Card four · Leave a trace</div><h2>Scene note</h2><p className="pd-card-copy">Keep the moment close. This note remains an owner-scoped discovery until you choose to propose it.</p></div><Feather size={19} color="#ae765e" /></div>
              <div className="pd-scene"><p>{choice === null ? sceneNote : choices[choice].text} {sceneNote}</p><label className="pd-label" htmlFor="scene-note">Continue the moment</label><textarea id="scene-note" className="pd-textarea" value={sceneNote} onChange={(event) => { setSceneNote(event.target.value); setSaved(false); }} /><div className="pd-scene-meta"><i /> Source trail retained · Victorian Garden Journal · Story movement: The Garden Remembers</div></div>
              <div className="pd-card-foot"><div className="pd-provenance"><span className="pd-tag unsaved">Unsaved discovery</span><span className="pd-tag foundation">4 source records</span>{submitted && <span className="pd-tag submitted">Submitted for approval</span>}</div><div><button className="pd-button" onClick={() => { setSaved(true); }} style={{ marginRight:8 }}>{saved ? <Check size={14} /> : <RotateCcw size={14} />} {saved ? "Kept private" : "Save privately"}</button><button className="pd-button primary" onClick={() => setShowProposal(true)}><Send size={14} /> Propose Canon</button></div></div>
            </div>}

            <div className="pd-lower">
              <div className="pd-mini"><h3>New to WorldSmith?</h3><p>Canon is the spine of your journal. Your story notes remain private by default; a proposal asks an editor to review a new record.</p><button className="pd-button" onClick={() => setStep(0)}>Start with Foundation Canon <ArrowRight size={13} /></button></div>
              <div className="pd-resume"><h3>Continue your thread</h3><p>Glasshouse, late afternoon · 4 minutes ago</p><button className="pd-button" onClick={() => setStep(3)}>Resume scene <ChevronRight size={14} /></button></div>
            </div>
          </section>
        </main>
      </div>
      {showProposal && <div className="pd-modal-wrap" role="dialog" aria-modal="true"><div className="pd-modal"><div className="pd-modal-head"><div><div className="pd-card-index">Editorial review</div><h2>Propose a Canon record</h2></div><button className="pd-close" onClick={() => setShowProposal(false)} aria-label="Close"><X size={18} /></button></div><p className="pd-card-copy" style={{ marginTop:10 }}>This will create an owner-scoped submission. Foundation Canon remains unchanged until an editor approves it.</p><label className="pd-label" htmlFor="proposal-title">Record name</label><input id="proposal-title" value={proposalTitle} onChange={(event) => setProposalTitle(event.target.value)} /><label className="pd-label" htmlFor="proposal-detail">What should the journal remember?</label><textarea id="proposal-detail" value={proposalDetail} onChange={(event) => setProposalDetail(event.target.value)} /><div className="pd-provenance" style={{ marginTop:15 }}><span className="pd-tag addition">Store addition</span><span className="pd-tag submitted">{submitted ? "Submitted for approval" : "Draft proposal"}</span></div><div className="pd-modal-actions"><button className="pd-button" onClick={() => setShowProposal(false)}>Keep private</button><button className="pd-button primary" onClick={() => { setSubmitted(true); setShowProposal(false); }}><Send size={14} /> Submit for approval</button></div></div></div>}
    </div>
  );
}