import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Compass,
  Feather,
  FileCheck2,
  GitBranch,
  Hash,
  MessageCircle,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  UserRound,
  X,
} from "lucide-react";

type Concept = {
  id: string;
  eyebrow: string;
  name: string;
  description: string;
  accent: string;
  complexity: string;
  freedom: string;
  replayability: string;
  safety: string;
  readiness: string;
  bestFor: string;
};

const concepts: Concept[] = [
  {
    id: "prompt-deck",
    eyebrow: "01 / guided",
    name: "Prompt Deck",
    description:
      "A quiet sequence of editorial prompts. The owner chooses what to reveal, then writes a scene that remains safely tethered to Canon.",
    accent: "#a35d45",
    complexity: "Low",
    freedom: "Medium",
    replayability: "High",
    safety: "Very high",
    readiness: "Now",
    bestFor: "A dependable first session",
  },
  {
    id: "branch",
    eyebrow: "02 / authored",
    name: "One Limited Branch",
    description:
      "A single fork after the first discovery. Both paths return to the same story movement, keeping the world legible while adding consequence.",
    accent: "#627456",
    complexity: "Medium",
    freedom: "High",
    replayability: "High",
    safety: "High",
    readiness: "MVP add-on",
    bestFor: "A little agency, without a labyrinth",
  },
  {
    id: "open-table",
    eyebrow: "03 / expansive",
    name: "Open Table",
    description:
      "A freeform scene table with many possible destinations. Rich for experienced owners, but dependent on stronger contracts and review tooling.",
    accent: "#7b6b83",
    complexity: "High",
    freedom: "Very high",
    replayability: "Very high",
    safety: "Medium",
    readiness: "Later",
    bestFor: "A mature editorial ecosystem",
  },
];

const canon = [
  { label: "Elowen Vale", kind: "Character", mark: "EV" },
  { label: "The Glasshouse at Wychcombe", kind: "Location", mark: "GW" },
  { label: "The Brass Seed Key", kind: "Object", mark: "BK" },
  { label: "The Garden Remembers", kind: "Story movement", mark: "GR" },
];

const lifecycle = [
  ["Foundation Canon", "Immutable", "ink"],
  ["Guided scene", "In progress", "clay"],
  ["Private discovery", "Unsaved", "moss"],
  ["Store-owned contribution", "Owner scope", "dusk"],
  ["Submitted proposal", "Awaiting editor", "plum"],
  ["Editor decision", "Editorial", "gold"],
  ["Future solo session", "Replayable", "ink"],
];

export default function ComparisonMvp() {
  const [selected, setSelected] = useState("prompt-deck");
  const [openPremise, setOpenPremise] = useState(false);
  const [resume, setResume] = useState(true);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposed, setProposed] = useState(false);
  const [sceneStarted, setSceneStarted] = useState(false);
  const [choice, setChoice] = useState("follow-the-light");
  const [communityJoined, setCommunityJoined] = useState(false);
  const [communityChannel, setCommunityChannel] = useState("canon-garden");

  const active = useMemo(
    () => concepts.find((concept) => concept.id === selected) ?? concepts[0],
    [selected],
  );

  return (
    <main className="min-h-[100dvh] bg-[#eee7d8] text-[#2f2c27] selection:bg-[#c98968]/25">
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-8 lg:px-12">
        <header className="flex flex-col gap-7 border-b border-[#b7a995]/60 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-4 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#766d61]">
              <div className="grid h-8 w-8 place-items-center rounded-full border border-[#9b8f7e] bg-[#f7f0e3]">
                <Feather size={15} strokeWidth={1.5} />
              </div>
              WorldSmith <span className="text-[#b7a995]">/</span> Product direction
            </div>
            <h1 className="max-w-3xl font-serif text-4xl leading-[0.98] tracking-[-0.04em] text-[#27241f] sm:text-6xl">
              Three ways to let a shop
              <br />
              <i className="text-[#a35d45]">enter the story.</i>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#766d61]">
              A decision board for the Victorian Garden Journal. Compare the creative
              shape, the editorial risk, and the smallest trustworthy thing to ship.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start lg:self-auto">
            <span className="rounded-full border border-[#b7a995] bg-[#f7f0e3]/70 px-3 py-2 text-xs text-[#6d665c]">
              Working hypothesis
            </span>
            <button
              onClick={() => setResume((value) => !value)}
              className="flex items-center gap-2 rounded-full bg-[#34372f] px-4 py-2.5 text-xs font-semibold text-[#f4ecdc] transition-transform hover:-translate-y-0.5"
            >
              <RotateCcw size={14} /> {resume ? "Resume session" : "Start a session"}
            </button>
          </div>
        </header>

        <section className="grid gap-5 border-b border-[#b7a995]/60 py-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="rounded-[2px] border border-[#b7a995] bg-[#f7f0e3] p-5 shadow-[4px_5px_0_#d5c8b5] sm:p-7">
            <div className="mb-8 flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">Shared scenario</p>
                <h2 className="mt-2 font-serif text-3xl text-[#292720]">The Victorian Garden Journal</h2>
              </div>
              <BookOpen className="text-[#a35d45]" size={23} strokeWidth={1.5} />
            </div>
            <div className="mb-6 border-l-2 border-[#a35d45] pl-4">
              <p className="font-serif text-lg leading-7 text-[#4a433a]">
                “The garden has kept one promise, and it is waiting to see who remembers.”
              </p>
              <p className="mt-2 text-xs text-[#837768]">Suggested premise · a room that changes when named</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {canon.map((item) => (
                <div key={item.label} className="flex items-center gap-3 border-t border-[#d7cbbb] py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#dfe2d1] font-mono text-[10px] text-[#55604d]">{item.mark}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.label}</p>
                    <p className="text-[11px] text-[#8d8172]">{item.kind} · <span className="text-[#6b7c60]">Foundation Canon</span></p>
                  </div>
                  <LockKeyhole size={13} className="ml-auto shrink-0 text-[#9b8f7e]" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#d7cbbb] pt-4">
              <p className="flex items-center gap-2 text-xs text-[#776e63]"><ShieldCheck size={15} className="text-[#66785d]" /> Foundation Canon is immutable</p>
              <button onClick={() => setOpenPremise(!openPremise)} className="flex items-center gap-1 text-xs font-semibold text-[#9a553d]">
                {openPremise ? "Hide premise" : "Read suggested premise"} <ChevronDown size={14} className={openPremise ? "rotate-180" : ""} />
              </button>
            </div>
            {openPremise && <p className="mt-3 rounded bg-[#e9dfcd] p-3 text-xs leading-5 text-[#6f665c]">At dusk, Elowen finds the Brass Seed Key in a pot that was empty that morning. The Glasshouse door opens only when the owner decides what the garden is trying to return.</p>}
          </div>

          <div className="relative overflow-hidden rounded-[2px] bg-[#3b4038] p-5 text-[#f4ecdc] sm:p-7">
            <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border border-[#9da88f]/25" />
            <div className="absolute -right-2 -top-6 h-28 w-28 rounded-full border border-[#9da88f]/20" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#c8b88e]">Owner workspace · in progress</p>
                <MoreHorizontal size={18} className="text-[#b9b8a7]" />
              </div>
              <h2 className="mt-7 max-w-md font-serif text-3xl leading-tight">The door is open. What do you do with the silence?</h2>
              <p className="mt-3 max-w-md text-sm leading-6 text-[#c8c5b7]">Your choices shape this scene, not the Foundation Canon. Every new thought stays private until you choose to offer it.</p>
              <div className="mt-7 space-y-2">
                {[
                  ["follow-the-light", "Follow the thin light beneath the potting bench"],
                  ["ask-elowen", "Ask Elowen what she has forgotten"],
                  ["leave-note", "Leave a note for whoever comes next"],
                ].map(([id, label], index) => (
                  <button key={id} onClick={() => setChoice(id)} className={`flex w-full items-center gap-3 border p-3 text-left text-sm transition-colors ${choice === id ? "border-[#c98768] bg-[#a35d45]/25 text-[#fff6e8]" : "border-[#718070] bg-[#4a5147]/60 text-[#d6d2c5] hover:bg-[#566052]"}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] ${choice === id ? "border-[#d89a7c] bg-[#a35d45] text-white" : "border-[#899282]"}`}>{index + 1}</span>
                    {label}
                    {choice === id && <Check className="ml-auto text-[#e5b59e]" size={15} />}
                  </button>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button onClick={() => setSceneStarted(true)} className="flex items-center gap-2 rounded-sm bg-[#d59878] px-4 py-2.5 text-xs font-bold text-[#332c27] hover:bg-[#e2ab8c]">
                  {sceneStarted ? "Scene saved locally" : "Create scene"} <ArrowRight size={14} />
                </button>
                <span className="text-[11px] text-[#b8beae]"><CircleDot size={12} className="mr-1 inline text-[#d59878]" /> {sceneStarted ? "Unsaved discovery" : "Not yet started"}</span>
              </div>
              <div className="mt-8 flex items-center gap-2 border-t border-[#687164] pt-4 text-[11px] text-[#b9b8a7]"><Clock3 size={13} /> Last opened 8 minutes ago · 6 min remaining</div>
            </div>
          </div>
        </section>

        <section className="py-9">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">The decision</p>
              <h2 className="mt-1 font-serif text-3xl tracking-[-0.03em]">Choose the smallest world that still feels alive.</h2>
            </div>
            <p className="max-w-sm text-right text-xs leading-5 text-[#796f62]">The recommendation is not the most expansive concept. It is the one that earns trust before it asks for more.</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {concepts.map((concept) => (
              <button key={concept.id} onClick={() => setSelected(concept.id)} className={`group text-left ${selected === concept.id ? "ring-2 ring-[#a35d45] ring-offset-2 ring-offset-[#eee7d8]" : ""}`}>
                <article className="h-full border border-[#b7a995] bg-[#f7f0e3] p-5 transition-transform group-hover:-translate-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: concept.accent }}>{concept.eyebrow}</span>
                    {selected === concept.id && <span className="grid h-6 w-6 place-items-center rounded-full bg-[#a35d45] text-[#f7f0e3]"><Check size={14} /></span>}
                  </div>
                  <h3 className="mt-5 font-serif text-2xl">{concept.name}</h3>
                  <p className="mt-3 min-h-[72px] text-sm leading-6 text-[#71685e]">{concept.description}</p>
                  <div className="mt-5 grid grid-cols-2 gap-y-3 border-t border-[#d7cbbb] pt-4 text-xs">
                    {[
                      ["Complexity", concept.complexity],
                      ["Creative freedom", concept.freedom],
                      ["Replayability", concept.replayability],
                      ["Canon safety", concept.safety],
                    ].map(([label, value]) => <div key={label}><p className="text-[#958979]">{label}</p><p className="mt-0.5 font-semibold text-[#484037]">{value}</p></div>)}
                  </div>
                  <p className="mt-5 flex items-center justify-between text-xs font-semibold" style={{ color: concept.accent }}>Best for {concept.bestFor} <ArrowRight size={14} /></p>
                </article>
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-col justify-between gap-3 border border-[#a35d45]/40 bg-[#efe0ce] p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3"><Sparkles className="mt-0.5 shrink-0 text-[#a35d45]" size={17} /><p className="text-sm"><strong className="font-semibold">Recommendation:</strong> Prompt Deck plus one limited branch. <span className="text-[#766d61]">Start with a guided hand, then give the owner one meaningful turn.</span></p></div>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[#9b5941]">{active.name} selected</span>
          </div>
        </section>

        <section className="grid gap-8 border-t border-[#b7a995]/60 py-9 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">The system underneath</p>
            <h2 className="mt-2 font-serif text-3xl">Reusable foundations, explicit boundaries.</h2>
            <div className="mt-6 space-y-2">
              {["Stories", "Acts", "Encounters", "Journal Prompts", "Canon links"].map((item, index) => <div key={item} className="flex items-center gap-3 border-b border-[#cabbab] py-3 text-sm"><span className="font-mono text-[10px] text-[#a35d45]">0{index + 1}</span><span>{item}</span><Check size={14} className="ml-auto text-[#77826b]" /></div>)}
            </div>
            <div className="mt-6 rounded border border-[#b7a995] bg-[#e4dac9] p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-[#71685e]"><Scale size={14} /> Missing contracts</div>
              <p className="mt-3 text-xs leading-5 text-[#756b60]">Tenant-safe routes · contribution ownership/status/provenance · sessions/resume · choices · promotion workflow</p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">Participation model</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {[
                ["Platform editor", "Protects the world", "Approves Canon proposals"],
                ["Store owner", "Authors locally", "Creates, saves, submits"],
                ["Eventual player", "Returns alone", "Replays approved moments"],
              ].map(([role, line, action]) => <div key={role} className="border border-[#b7a995] bg-[#f7f0e3] p-4"><UserRound size={16} className="text-[#66785d]" /><p className="mt-4 text-sm font-semibold">{role}</p><p className="mt-1 text-xs text-[#8a7d6d]">{line}</p><p className="mt-4 border-t border-[#d7cbbb] pt-3 text-xs leading-5 text-[#5e574e]">{action}</p></div>)}
            </div>
            <div className="mt-7">
              <div className="mb-3 flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#71685e]">Lifecycle</p><p className="text-[11px] text-[#8b7f70]">provenance never disappears</p></div>
              <div className="flex flex-wrap items-center gap-y-2">
                {lifecycle.map(([name, status, tone], index) => <div key={name} className="flex items-center"><div className="w-[102px] border border-[#c8b9a7] bg-[#f7f0e3] px-2 py-2"><p className={`text-[10px] font-semibold ${tone === "clay" ? "text-[#a35d45]" : tone === "moss" ? "text-[#64755b]" : "text-[#71685e]"}`}>{name}</p><p className="mt-1 text-[9px] text-[#9b8f7e]">{status}</p></div>{index < lifecycle.length - 1 && <ArrowRight size={13} className="mx-1 text-[#aa9d8b]" />}</div>)}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[#b7a995]/60 py-9">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">The community layer</p>
              <h2 className="mt-2 max-w-2xl font-serif text-3xl tracking-[-0.03em]">A living room for the world, not a shortcut around the editor.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766d61]">
                Discord gives members a place to ask what the garden remembers, compare interpretations, and help shape foundational Canon in the open. Store-owned discoveries still stay scoped until someone deliberately submits them.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-[#6f665c]">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#dfe2d1] text-[#5d7055]"><Users size={14} /></span>
              <span><strong className="text-[#3e4d3b]">184 members</strong><br />12 in the garden now</span>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[0.75fr_1.5fr_0.75fr]">
            <div className="border border-[#b7a995] bg-[#34372f] p-4 text-[#f4ecdc]">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7c6a1]"><MessageCircle size={14} /> WorldSmith Discord</div>
              <p className="mt-4 font-serif text-2xl">The Garden Room</p>
              <p className="mt-2 text-xs leading-5 text-[#c7c8ba]">A moderated community for members, collaborators, and careful world-builders.</p>
              <button onClick={() => setCommunityJoined((value) => !value)} className="mt-5 flex w-full items-center justify-center gap-2 border border-[#83907e] bg-[#465044] px-3 py-2.5 text-xs font-semibold text-[#f4ecdc] hover:bg-[#526052]">
                <Users size={14} /> {communityJoined ? "Joined · open Discord" : "Join with membership"}
              </button>
            </div>
            <div className="border border-[#b7a995] bg-[#f7f0e3] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d7cbbb] pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#4c463d]"><span className="h-2 w-2 rounded-full bg-[#778e6d]" /> Live discussion</div>
                <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#9b8f7e]">member space</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["canon-garden", "canon-garden", "Foundational Canon", "43 messages"],
                  ["scene-lab", "scene-lab", "Scene Lab", "18 messages"],
                  ["member-lounge", "member-lounge", "Member lounge", "9 messages"],
                ].map(([id, channel, label, count]) => (
                  <button key={id} onClick={() => setCommunityChannel(id)} className={`border p-3 text-left transition-colors ${communityChannel === id ? "border-[#a35d45] bg-[#efe0ce]" : "border-[#d7cbbb] bg-[#f1e8da] hover:bg-[#eee0cf]"}`}>
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5c554d]"><Hash size={13} className="text-[#a35d45]" />{channel}</div>
                    <p className="mt-2 text-xs font-semibold text-[#3f3a34]">{label}</p>
                    <p className="mt-1 text-[10px] text-[#8b7f70]">{count}</p>
                  </button>
                ))}
              </div>
              <div className="mt-3 border-l-2 border-[#a35d45] bg-[#eee4d4] px-3 py-2.5 text-xs leading-5 text-[#6b6258]">
                <strong className="text-[#4a4239]">Mara / editor:</strong> “If the seed key opens a room, does that become shared Canon — or is it still your reading of the moment?”
              </div>
            </div>
            <div className="border border-[#b7a995] bg-[#e4dac9] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#71685e]">Three kinds of belonging</p>
              <div className="mt-4 space-y-3">
                {[
                  ["Community", "Discuss and interpret", "public room"],
                  ["Store workspace", "Create and save", "owner scope"],
                  ["Editorial Canon", "Approve and protect", "platform scope"],
                ].map(([title, line, status], index) => (
                  <div key={title} className="flex items-start gap-2 border-b border-[#cabbab] pb-3 last:border-0 last:pb-0">
                    <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-[#f7f0e3] font-mono text-[9px] text-[#a35d45]">0{index + 1}</span>
                    <div><p className="text-xs font-semibold text-[#4b443a]">{title}</p><p className="mt-0.5 text-[10px] leading-4 text-[#7d7163]">{line}</p><p className="mt-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[#9b8f7e]">{status}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[#b7a995]/60 py-7">
          <div className="flex flex-col gap-4 rounded bg-[#dfe2d1] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#66785d]">Contribution review</p><p className="mt-1 font-serif text-xl">Have you found something worth offering back?</p><p className="mt-1 text-xs text-[#6d7665]">A proposal is never an edit. It is a clearly attributed request for editorial care.</p></div>
            <button onClick={() => setProposalOpen(true)} className="flex shrink-0 items-center justify-center gap-2 border border-[#66785d] bg-[#f7f0e3] px-4 py-3 text-xs font-bold text-[#506048] hover:bg-[#f1e7d7]"><Plus size={15} /> Propose a new Canon record</button>
          </div>
          {proposed && <div className="mt-3 flex items-center gap-2 border border-[#b7a995] bg-[#f7f0e3] p-3 text-xs text-[#66785d]"><FileCheck2 size={16} /> Submitted for approval · “The key hums near rosemary” · owned by this store <button onClick={() => setProposed(false)} className="ml-auto"><X size={14} /></button></div>}
        </section>

        {proposalOpen && <div className="fixed inset-0 z-20 grid place-items-center bg-[#302d28]/35 p-5" onClick={() => setProposalOpen(false)}><div className="w-full max-w-md border border-[#b7a995] bg-[#f7f0e3] p-6 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">Editorial handoff</p><h2 className="mt-2 font-serif text-2xl">Propose a Canon record</h2></div><button onClick={() => setProposalOpen(false)}><X size={18} className="text-[#766d61]" /></button></div><p className="mt-3 text-sm leading-6 text-[#766d61]">This discovery remains store-owned and private until submitted. An editor must approve it before it can become part of the shared world.</p><label className="mt-5 block text-xs font-semibold text-[#5d554c]">Record title<input defaultValue="The key hums near rosemary" className="mt-2 w-full border border-[#b7a995] bg-[#efe7d8] p-3 text-sm outline-none focus:border-[#a35d45]" /></label><label className="mt-4 block text-xs font-semibold text-[#5d554c]">Provenance<textarea defaultValue="Discovered in The Glasshouse at Wychcombe, during The Garden Remembers." rows={3} className="mt-2 w-full resize-none border border-[#b7a995] bg-[#efe7d8] p-3 text-sm outline-none focus:border-[#a35d45]" /></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setProposalOpen(false)} className="px-3 py-2 text-xs text-[#766d61]">Keep private</button><button onClick={() => { setProposed(true); setProposalOpen(false); }} className="bg-[#66785d] px-4 py-2 text-xs font-bold text-[#f7f0e3]">Submit for approval</button></div></div></div>}

        <footer className="flex flex-col justify-between gap-3 border-t border-[#b7a995]/60 py-5 text-[11px] text-[#8b7f70] sm:flex-row"><span>WorldSmith · a workspace for authored worlds</span><span className="flex items-center gap-2"><GitBranch size={13} /> Foundation Canon → future solo session</span></footer>
      </div>
    </main>
  );
}