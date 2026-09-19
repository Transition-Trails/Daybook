import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Feather,
  GitBranch,
  LockKeyhole,
  Plus,
  Send,
  Sparkles,
  Waypoints,
  X,
} from "lucide-react";

type CanonKind = "Foundation Canon" | "Store addition" | "Unsaved discovery" | "Submitted for approval";

type CanonRecord = {
  name: string;
  type: string;
  kind: CanonKind;
  detail: string;
  tone: string;
};

type Scene = {
  id: string;
  title: string;
  excerpt: string;
  state: "origin" | "choice" | "branch" | "draft";
  x: number;
};

const foundation: CanonRecord[] = [
  {
    name: "Elowen Vale",
    type: "Character",
    kind: "Foundation Canon",
    detail: "A patient botanist who listens for what the garden keeps.",
    tone: "ink",
  },
  {
    name: "The Glasshouse at Wychcombe",
    type: "Location",
    kind: "Foundation Canon",
    detail: "An iron-and-glass refuge at the edge of a sleeping estate.",
    tone: "moss",
  },
  {
    name: "The Brass Seed Key",
    type: "Object",
    kind: "Foundation Canon",
    detail: "A warm, old key with a tooth shaped like a curled leaf.",
    tone: "clay",
  },
  {
    name: "The Garden Remembers",
    type: "Story movement",
    kind: "Foundation Canon",
    detail: "Memory returns through growth, weather, and small acts of care.",
    tone: "dusk",
  },
];

const initialScenes: Scene[] = [
  {
    id: "opening",
    title: "The Unlatched Door",
    excerpt: "At first light, Elowen finds the glasshouse door open.",
    state: "origin",
    x: 7,
  },
  {
    id: "listening",
    title: "Listen to the Vines",
    excerpt: "She follows a soft tapping beneath the climbing roses.",
    state: "choice",
    x: 35,
  },
  {
    id: "key",
    title: "Turn the Seed Key",
    excerpt: "The brass key warms in her palm, pointing to the west wall.",
    state: "branch",
    x: 64,
  },
  {
    id: "ledger",
    title: "Read the Old Ledger",
    excerpt: "A gardener's hand has left one line unfinished.",
    state: "branch",
    x: 64,
  },
  {
    id: "discovery",
    title: "The Root Cellar",
    excerpt: "Something beneath the garden has been waiting for a name.",
    state: "draft",
    x: 89,
  },
];

const kindStyles: Record<CanonKind, string> = {
  "Foundation Canon": "border-[#94866f] bg-[#f5f0e5] text-[#574d40]",
  "Store addition": "border-[#718c6f] bg-[#e9f0e5] text-[#38553c]",
  "Unsaved discovery": "border-[#bc815f] bg-[#fff0e3] text-[#8a4f34]",
  "Submitted for approval": "border-[#756d8d] bg-[#eeeaf5] text-[#554d6b]",
};

function Tag({ kind }: { kind: CanonKind }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${kindStyles[kind]}`}>{kind}</span>;
}

function Provenance({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-[#746858]">
      <Waypoints className="h-3.5 w-3.5 text-[#9a7b51]" />
      <span>From {label}</span>
    </div>
  );
}

export default function BranchingScenePath() {
  const [selectedIds, setSelectedIds] = useState<string[]>(["Elowen Vale", "The Glasshouse at Wychcombe", "The Brass Seed Key", "The Garden Remembers"]);
  const [scenes, setScenes] = useState(initialScenes);
  const [activeScene, setActiveScene] = useState("listening");
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [isCanonOpen, setIsCanonOpen] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [newCanonName, setNewCanonName] = useState("");
  const [newCanonNote, setNewCanonNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [choice, setChoice] = useState("Listen at the roses");

  const selectedCanon = useMemo(
    () => foundation.filter((record) => selectedIds.includes(record.name)),
    [selectedIds],
  );

  const toggleCanon = (name: string) => {
    setSelectedIds((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);
  };

  const createDiscovery = () => {
    if (!newCanonName.trim()) return;
    setScenes((current) => [...current, {
      id: `discovery-${Date.now()}`,
      title: newCanonName,
      excerpt: newCanonNote || "A private thread waiting to be written.",
      state: "draft",
      x: 89,
    }]);
    setNewCanonName("");
    setNewCanonNote("");
    setIsDiscoveryOpen(false);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2600);
  };

  return (
    <main className="min-h-[100dvh] bg-[#e8dfd0] text-[#302d29]" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
      <div className="pointer-events-none fixed inset-0 opacity-[0.13]" style={{ backgroundImage: "radial-gradient(#61523f 0.6px, transparent 0.6px)", backgroundSize: "7px 7px" }} />
      <header className="relative border-b border-[#cbbba4] bg-[#eee7da]/95 px-5 py-4 backdrop-blur md:px-9">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#967653] bg-[#f6f0e4] text-[#83603d] shadow-[0_2px_7px_rgba(74,56,37,.12)]">
              <Feather className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[11px] font-sans font-bold uppercase tracking-[0.22em] text-[#89765d]">WorldSmith</div>
              <div className="text-lg leading-none text-[#453b31]">Victorian Garden Journal</div>
            </div>
          </div>
          <div className="hidden items-center gap-4 font-sans text-xs text-[#796d60] md:flex">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#72876c]" />Private workspace</span>
            <span className="h-5 w-px bg-[#cdbda7]" />
            <span>Scene 02 of 05</span>
            <button className="rounded border border-[#b9a992] px-3 py-1.5 text-[#5d5144] hover:bg-[#e4d9c8]" onClick={() => setSavedNotice(true)}>Save draft</button>
          </div>
          <button className="rounded-full border border-[#c4b49e] p-2 text-[#756551] md:hidden" onClick={() => setIsGuideOpen(true)} aria-label="Open guidance"><CircleHelp className="h-5 w-5" /></button>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-[1500px] gap-6 px-5 py-7 md:px-9 lg:grid-cols-[292px_minmax(0,1fr)_310px]">
        <aside className="space-y-5">
          <section className="rounded-xl border border-[#ccbda8] bg-[#f3ecdf] p-4 shadow-[0_3px_12px_rgba(83,62,39,.08)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[#967450]">01 / Foundation</div>
                <h2 className="mt-1 text-lg text-[#40372e]">Choose your canon</h2>
              </div>
              <button onClick={() => setIsCanonOpen(!isCanonOpen)} className="rounded-md p-1 text-[#897052] hover:bg-[#e5d9c7]" aria-label="Toggle canon"><ChevronDown className={`h-4 w-4 transition-transform ${isCanonOpen ? "rotate-180" : ""}`} /></button>
            </div>
            <p className="mb-4 font-sans text-xs leading-5 text-[#76695a]">These records anchor the scene. Foundation Canon is locked and cannot be edited here.</p>
            <div className="space-y-2.5">
              {foundation.map((record) => (
                <button key={record.name} onClick={() => toggleCanon(record.name)} className={`group flex w-full items-start gap-2 rounded-lg border p-2.5 text-left transition ${selectedIds.includes(record.name) ? "border-[#a6875f] bg-[#f9f4e9]" : "border-transparent opacity-60 hover:border-[#cbbca6]"}`}>
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${selectedIds.includes(record.name) ? "border-[#8b6b47] bg-[#8b6b47] text-[#fbf6ed]" : "border-[#bca990]"}`}>{selectedIds.includes(record.name) && <Check className="h-3 w-3" />}</span>
                  <span><span className="block text-sm text-[#463c32]">{record.name}</span><span className="mt-0.5 block font-sans text-[10px] uppercase tracking-[0.12em] text-[#99846a]">{record.type}</span></span>
                </button>
              ))}
            </div>
            {isCanonOpen && <div className="mt-3 border-t border-[#d8cbb8] pt-3 font-sans text-[11px] leading-5 text-[#756858]">A scene can reference Foundation Canon, but only proposed records can enter editorial review. Your store additions remain yours.</div>}
          </section>
          <section className="rounded-xl border border-[#ccbda8] bg-[#eee5d6] p-4">
            <div className="mb-2 flex items-center gap-2 text-[#725d42]"><BookOpen className="h-4 w-4" /><span className="font-sans text-[10px] font-bold uppercase tracking-[0.16em]">Story movement</span></div>
            <h3 className="text-lg italic text-[#554634]">“The Garden Remembers”</h3>
            <p className="mt-2 font-sans text-xs leading-5 text-[#76695a]">Let what was buried return by way of a living thing.</p>
            <div className="mt-3 flex items-center gap-2 font-sans text-[11px] text-[#8a765d]"><LockKeyhole className="h-3.5 w-3.5" />Foundation Canon · read only</div>
          </section>
        </aside>

        <section className="min-w-0">
          {isGuideOpen && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#d0bd9b] bg-[#f6eddd] p-4 shadow-[0_3px_12px_rgba(83,62,39,.06)]">
              <div className="mt-0.5 rounded-full bg-[#a58258] p-1.5 text-[#fffaf1]"><Sparkles className="h-4 w-4" /></div>
              <div className="flex-1 font-sans text-xs leading-5 text-[#665744]"><strong className="font-semibold text-[#514332]">Begin with a choice.</strong> You are tracing an authored path through the garden. Select canon on the left, then choose the next beat in the scene card.</div>
              <button onClick={() => setIsGuideOpen(false)} className="text-[#9b8569] hover:text-[#5c4a38]" aria-label="Dismiss guidance"><X className="h-4 w-4" /></button>
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><div className="font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-[#967450]">02 / Branching scene path</div><h1 className="mt-1 text-3xl text-[#3e352d] md:text-4xl">The garden remembers</h1></div>
            <div className="flex items-center gap-2 font-sans text-xs text-[#806e59]"><Clock3 className="h-4 w-4" />Last touched 8 min ago</div>
          </div>
          <div className="rounded-2xl border border-[#c6b49b] bg-[#efe6d8] p-4 shadow-[0_5px_18px_rgba(83,62,39,.08)] md:p-6">
            <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-2 font-sans text-[11px] text-[#806e59]"><GitBranch className="h-4 w-4" />Your scene graph</div><div className="flex items-center gap-3 font-sans text-[10px] uppercase tracking-[0.12em] text-[#8e7a61]"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#9d8158]" />current</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#b4a58e]" />unwritten</span></div></div>
            <div className="relative min-h-[390px] overflow-x-auto pb-4">
              <div className="absolute left-[13%] top-[77px] h-px w-[26%] bg-[#af9470]" />
              <div className="absolute left-[40%] top-[96px] h-[115px] w-[1px] rotate-[27deg] bg-[#af9470]" />
              <div className="absolute left-[40%] top-[96px] h-[115px] w-[1px] -rotate-[27deg] bg-[#af9470]" />
              <div className="absolute left-[66%] top-[210px] h-px w-[24%] bg-[#b9a68a]" />
              <div className="absolute left-[66%] top-[210px] h-[90px] w-[1px] rotate-[26deg] bg-[#b9a68a]" />
              <div className="absolute left-[66%] top-[210px] h-[90px] w-[1px] -rotate-[26deg] bg-[#b9a68a]" />
              <div className="relative grid min-w-[690px] grid-cols-4 gap-x-7 gap-y-14 pt-9">
                {scenes.map((scene, index) => (
                  <button key={scene.id} onClick={() => setActiveScene(scene.id)} className={`relative z-10 min-h-[126px] rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${activeScene === scene.id ? "border-[#96734c] bg-[#faf4e8] shadow-[0_5px_12px_rgba(89,63,36,.12)] ring-1 ring-[#b2956d]" : scene.state === "draft" ? "border-dashed border-[#c6ad8e] bg-[#f3eade]" : "border-[#c9b79f] bg-[#f6eee2]"}`}>
                    <div className="mb-2 flex items-center justify-between"><span className="font-sans text-[10px] font-bold uppercase tracking-[0.13em] text-[#9a7a54]">{scene.state === "origin" ? "Opening" : scene.state === "choice" ? "Choice point" : scene.state === "draft" ? "Unwritten" : "Branch"}</span>{activeScene === scene.id && <span className="h-2 w-2 rounded-full bg-[#a6764e]" />}</div>
                    <div className="text-base text-[#4c3d2e]">{scene.title}</div><p className="mt-2 font-sans text-[11px] leading-4 text-[#7c6d5b]">{scene.excerpt}</p>
                    {index === 1 && <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap font-sans text-[10px] uppercase tracking-[0.1em] text-[#9a8266]">choose a thread</div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-5 rounded-xl border border-[#b9aa95] bg-[#f5ede0] p-5 shadow-[0_3px_12px_rgba(83,62,39,.06)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><div className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[#967450]">Current scene · Listening at the roses</div><h2 className="mt-1 text-2xl text-[#44392e]">A sound beneath the leaves</h2></div><Tag kind="Unsaved discovery" /></div>
            <p className="max-w-2xl text-[15px] leading-7 text-[#5d5041]">Elowen kneels where the climbing roses have thickened against the glass. Something taps once, then twice, from the other side of the wall. The brass seed key turns toward the sound before she touches it.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {["Listen at the roses", "Reach for the west wall"].map((item) => <button key={item} onClick={() => setChoice(item)} className={`flex items-center justify-between rounded-lg border p-3.5 text-left font-sans text-sm transition ${choice === item ? "border-[#a47b53] bg-[#f0e1cd] text-[#523f2c]" : "border-[#d2c2ac] bg-[#f9f2e7] text-[#6e6152] hover:border-[#b89970]"}`}><span>{item}</span>{choice === item ? <Check className="h-4 w-4 text-[#8b6747]" /> : <ArrowRight className="h-4 w-4 text-[#aa957b]" />}</button>)}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#d8cab6] pt-4"><Provenance label="Elowen Vale · The Glasshouse at Wychcombe · The Brass Seed Key" /><button onClick={() => { setSavedNotice(true); setActiveScene("key"); }} className="flex items-center gap-2 rounded-md bg-[#73573c] px-4 py-2.5 font-sans text-xs font-semibold text-[#fff8eb] shadow-sm hover:bg-[#60472f]">Continue this path <ArrowRight className="h-4 w-4" /></button></div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-xl border border-[#ccbda8] bg-[#f3ecdf] p-4 shadow-[0_3px_12px_rgba(83,62,39,.08)]">
            <div className="mb-3 flex items-center justify-between"><div><div className="font-sans text-[10px] font-bold uppercase tracking-[0.18em] text-[#967450]">03 / Workbench</div><h2 className="mt-1 text-lg">New discovery</h2></div><span className="rounded-full bg-[#fff0e3] px-2 py-1 font-sans text-[10px] uppercase tracking-[0.1em] text-[#8a4f34]">Private</span></div>
            <p className="mb-4 font-sans text-xs leading-5 text-[#76695a]">Name a thread as you write. It stays private until you choose to propose it.</p>
            <button onClick={() => setIsDiscoveryOpen(!isDiscoveryOpen)} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#b7936f] bg-[#fcf4e8] py-2.5 font-sans text-xs font-semibold text-[#79573b] hover:bg-[#f7ead8]"><Plus className="h-4 w-4" /> Add discovery</button>
            {isDiscoveryOpen && <div className="mt-3 space-y-2.5 border-t border-[#d8cbb8] pt-3"><input value={newCanonName} onChange={(e) => setNewCanonName(e.target.value)} placeholder="Discovery name" className="w-full rounded-md border border-[#cdbda8] bg-[#fbf6ed] px-3 py-2 font-sans text-xs outline-none focus:border-[#9e7954]" /><textarea value={newCanonNote} onChange={(e) => setNewCanonNote(e.target.value)} placeholder="What does the garden reveal?" rows={3} className="w-full resize-none rounded-md border border-[#cdbda8] bg-[#fbf6ed] px-3 py-2 font-sans text-xs outline-none focus:border-[#9e7954]" /><button onClick={createDiscovery} className="w-full rounded-md bg-[#876346] py-2 font-sans text-xs font-semibold text-[#fff8ed]">Keep private</button></div>}
          </section>
          <section className="rounded-xl border border-[#c6b8ae] bg-[#eeeaf4] p-4">
            <div className="mb-2 flex items-center gap-2 font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-[#645d79]"><Send className="h-4 w-4" /> Contribution review</div>
            <h3 className="text-lg text-[#494256]">The Root Cellar</h3>
            <Tag kind="Submitted for approval" />
            <p className="mt-3 font-sans text-xs leading-5 text-[#6f6878]">A proposed Canon record, submitted 14 May. Editorial review keeps the world coherent.</p>
            <div className="mt-3 border-t border-[#d1c8dc] pt-3"><Provenance label="The Glasshouse at Wychcombe · The Garden Remembers" /></div>
            <button onClick={() => setSubmitted(!submitted)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-[#9f96b4] bg-[#f8f5fb] py-2 font-sans text-xs font-semibold text-[#5d5570]">{submitted ? "Submitted for approval" : "Submit proposed record"} <Send className="h-3.5 w-3.5" /></button>
          </section>
          <section className="rounded-xl border border-[#ccbda8] bg-[#e4dacb] p-4">
            <div className="flex items-center gap-2 font-sans text-[10px] font-bold uppercase tracking-[0.16em] text-[#7c6a54]"><ArrowLeft className="h-4 w-4" /> Resume writing</div>
            <h3 className="mt-2 text-lg text-[#514537]">The Unlatched Door</h3>
            <p className="mt-1 font-sans text-xs text-[#786b5a]">You left this path at the first light.</p>
            <button onClick={() => setActiveScene("opening")} className="mt-3 flex items-center gap-2 font-sans text-xs font-semibold text-[#775638] hover:text-[#4f3927]">Return to scene <ArrowRight className="h-3.5 w-3.5" /></button>
          </section>
        </aside>
      </div>
      {savedNotice && <div className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#b3a083] bg-[#4e463d] px-4 py-2.5 font-sans text-xs text-[#f8efe0] shadow-lg"><Check className="h-4 w-4 text-[#c8d4b8]" /> Draft kept in your private workspace</div>}
    </main>
  );
}