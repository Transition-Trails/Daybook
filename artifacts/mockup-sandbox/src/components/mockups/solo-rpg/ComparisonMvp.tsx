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
  NotebookTabs,
  Package,
  Plus,
  RotateCcw,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  UserRound,
  Volume2,
  Play,
  Pause,
  Image,
  Link2,
  WandSparkles,
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
  { id: "elowen", label: "Elowen Vale", kind: "Character", mark: "EV" },
  { id: "glasshouse", label: "The Glasshouse at Wychcombe", kind: "Location", mark: "GW" },
  { id: "seed-key", label: "The Brass Seed Key", kind: "Object", mark: "BK" },
  { id: "garden-remembers", label: "The Garden Remembers", kind: "Story movement", mark: "GR" },
];

const relationshipTypes = ["protects", "keeps a secret from", "is drawn to", "caused"];

const worlds = [
  { id: "garden", label: "Victorian Garden Journal", shortLabel: "The Garden", era: "1890 · botanical mystery", description: "A locked glasshouse, unfinished letters, and a key that remembers.", accent: "#a35d45", swatch: "linear-gradient(135deg, #d9c4a6 0%, #778a70 100%)", signal: "The key hums near rosemary.", voice: "A close, observant voice that notices what the room refuses to say.", visual: "Pressed leaves, tarnished brass, rain on glass." },
  { id: "orbital", label: "The Orbital Choir", shortLabel: "Orbital Choir", era: "far future · signal mystery", description: "A listening station receives a song from a ship that vanished.", accent: "#5f7188", swatch: "linear-gradient(135deg, #27344b 0%, #a7b7bd 100%)", signal: "The dead ship answers in your voice.", voice: "A patient transmission from the edge of a signal, warm beneath the static.", visual: "Signal noise, blue-black glass, star maps and worn interfaces." },
  { id: "salt-moon", label: "Salt Moon Country", shortLabel: "Salt Moon", era: "mythic coast · family folklore", description: "At low tide, the shoreline returns what the village forgot.", accent: "#8b6b54", swatch: "linear-gradient(135deg, #e3c9a6 0%, #7d9a99 100%)", signal: "The tide leaves a door in the salt.", voice: "A story passed between generations, playful at the shore and serious at the threshold.", visual: "Salt-crusted cloth, moonlit water, shells marked with names." },
];

const buildArchetypes = [
  {
    id: "victorian",
    label: "Victorian fantasy",
    subtitle: "Botanical mystery · intimate stakes",
    accent: "#a35d45",
    premise: "A locked glasshouse remembers every promise made beneath its roof.",
    questions: ["What social rule hides the magic?", "Which object carries the family secret?", "What does the world refuse to name?"],
    materials: "Rain on glass · brass · pressed leaves",
    voice: "Close, observant, and careful with silence.",
  },
  {
    id: "dragon-sci-fi",
    label: "Dragon rider / sci-fi",
    subtitle: "Skyborne frontier · bonded technology",
    accent: "#5f7188",
    premise: "A generation ship bred dragons to navigate a storm no instrument can read.",
    questions: ["What does the rider owe the creature?", "Which technology feels like ritual?", "What signal is the sky hiding?"],
    materials: "Carbon fiber · storm light · worn flight cloth",
    voice: "Urgent transmission softened by ancient instinct.",
  },
  {
    id: "mythic-coast",
    label: "Mythic coast folklore",
    subtitle: "Tidebound village · inherited names",
    accent: "#718a83",
    premise: "At low tide, the shoreline returns what the village forgot.",
    questions: ["Who keeps the old story alive?", "What changes when the tide turns?", "Which place remembers you?"],
    materials: "Salt cloth · moonlit water · shell marks",
    voice: "Generational, playful at the shore, serious at the threshold.",
  },
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

const buildPhases = [
  {
    id: "foundation",
    number: "01",
    label: "Foundation",
    estimate: "1–2 weeks",
    title: "Make worlds safe to author",
    detail: "World contracts, genre seeds, rich prompt schemas, tone boundaries, provenance, and the owner/editor/community scopes.",
    outputs: "World grammar · permissions · Canon links",
  },
  {
    id: "play",
    number: "02",
    label: "First play",
    estimate: "2–3 weeks",
    title: "Ship the guided loop",
    detail: "Prompt Deck, one consequential branch, session resume, private discoveries, and a first playable scene grounded in approved Canon.",
    outputs: "Prompt Deck · branch · resume state",
  },
  {
    id: "belong",
    number: "03",
    label: "Belonging",
    estimate: "2–4 weeks",
    title: "Give the world somewhere to gather",
    detail: "Membership-gated community rooms, editor prompts, readings, moderation, reporting, and explicit submission boundaries.",
    outputs: "Community room · moderation · review queue",
  },
  {
    id: "media",
    number: "04",
    label: "Atmosphere",
    estimate: "2–4 weeks",
    title: "Turn grammar into media",
    detail: "ElevenLabs-ready voice briefs, HeyGen-ready visual briefs, asset suggestions, editor approval, library publishing, and Daybook handoff.",
    outputs: "Voice/visual kit · library · provenance",
  },
];

export default function ComparisonMvp() {
  const [selected, setSelected] = useState("prompt-deck");
  const [selectedWorldId, setSelectedWorldId] = useState("garden");
  const [openPremise, setOpenPremise] = useState(false);
  const [resume, setResume] = useState(true);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposed, setProposed] = useState(false);
  const [sceneStarted, setSceneStarted] = useState(false);
  const [choice, setChoice] = useState("follow-the-light");
  const [communityJoined, setCommunityJoined] = useState(false);
  const [communityChannel, setCommunityChannel] = useState("canon-garden");
  const [selectedAsset, setSelectedAsset] = useState("garden-notebook");
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voiceStyle, setVoiceStyle] = useState("intimate");
  const [visualFocus, setVisualFocus] = useState("material");
  const [buildMode, setBuildMode] = useState("victorian");
  const [buildStep, setBuildStep] = useState(1);
  const [communityDraft, setCommunityDraft] = useState("");
  const [communityPosted, setCommunityPosted] = useState(false);
  const [relationshipSource, setRelationshipSource] = useState("elowen");
  const [relationshipTarget, setRelationshipTarget] = useState("seed-key");
  const [relationshipType, setRelationshipType] = useState("protects");
  const [relationshipDescription, setRelationshipDescription] = useState("");
  const [relationshipPopoverOpen, setRelationshipPopoverOpen] = useState(false);
  const [createdRelationship, setCreatedRelationship] = useState<{ source: string; target: string; type: string; description: string } | null>(null);
  const [selectedBuildPhase, setSelectedBuildPhase] = useState("foundation");

  const active = useMemo(
    () => concepts.find((concept) => concept.id === selected) ?? concepts[0],
    [selected],
  );
  const activeWorld = useMemo(
    () => worlds.find((world) => world.id === selectedWorldId) ?? worlds[0],
    [selectedWorldId],
  );
  const activeArchetype = useMemo(
    () => buildArchetypes.find((archetype) => archetype.id === buildMode) ?? buildArchetypes[0],
    [buildMode],
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
              A decision board for authored worlds. Compare the creative shape, the
              editorial risk, and the smallest trustworthy thing to ship—whatever
              world your community wants to enter next.
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
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">Choose a world to enter</p>
                <h2 className="mt-2 font-serif text-3xl text-[#292720]">{activeWorld.label}</h2>
              </div>
              <BookOpen className="text-[#a35d45]" size={23} strokeWidth={1.5} />
            </div>
            <div className="mb-6 grid gap-2 sm:grid-cols-3">
              {worlds.map((world) => (
                <button
                  key={world.id}
                  onClick={() => setSelectedWorldId(world.id)}
                  className={`group overflow-hidden border text-left transition-transform hover:-translate-y-0.5 ${selectedWorldId === world.id ? "border-[#a35d45] ring-1 ring-[#a35d45]" : "border-[#d1c2b0]"}`}
                >
                  <div className="h-9" style={{ background: world.swatch }} />
                  <div className="bg-[#f1e7d7] p-2.5">
                    <p className="text-[11px] font-semibold text-[#403a33]">{world.shortLabel}</p>
                    <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#8d8172]">{world.era}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="mb-6 border-l-2 border-[#a35d45] pl-4">
              <p className="font-serif text-lg leading-7 text-[#4a433a]">
                “{activeWorld.signal}”
              </p>
              <p className="mt-2 text-xs text-[#837768]">Suggested premise · {activeWorld.description}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {canon.map((item) => (
                <div key={item.id} className="group flex items-center gap-3 border-t border-[#d7cbbb] py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#dfe2d1] font-mono text-[10px] text-[#55604d]">{item.mark}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.label}</p>
                    <p className="text-[11px] text-[#8d8172]">{item.kind} · <span className="text-[#6b7c60]">Foundation Canon</span></p>
                  </div>
                  <LockKeyhole size={13} className="ml-auto shrink-0 text-[#9b8f7e]" />
                  <button
                    onClick={() => { setRelationshipSource(item.id); if (relationshipTarget === item.id) setRelationshipTarget(canon.find((record) => record.id !== item.id)?.id ?? "seed-key"); setRelationshipPopoverOpen(true); }}
                    className="grid h-7 w-7 shrink-0 place-items-center border border-transparent text-[#a35d45] opacity-70 transition-opacity hover:border-[#c9b7a3] hover:bg-[#efe0ce] hover:opacity-100"
                    aria-label={`Create relationship from ${item.label}`}
                    title="Create relationship"
                  >
                    <Link2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-5 border-t border-[#d7cbbb] pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#71685e]"><Link2 size={13} className="text-[#a35d45]" /> Canon relationships</p>
                  <p className="mt-1 text-xs text-[#8b7f70]">Connect records once; maintain the detail in one place.</p>
                </div>
                <button onClick={() => setRelationshipPopoverOpen(true)} className="flex items-center gap-1.5 border border-[#a35d45] bg-[#f1e3d2] px-3 py-2 text-[10px] font-bold text-[#9a553d] hover:bg-[#ead7c2]"><Plus size={13} /> Add relationship</button>
              </div>
              {createdRelationship && (
                <div className="mt-3 flex items-start gap-2 border border-[#b9c2aa] bg-[#e7eadb] p-3 text-xs text-[#59654f]">
                  <Check size={14} className="mt-0.5 shrink-0" />
                  <span><strong>{canon.find((item) => item.id === createdRelationship.source)?.label}</strong> {createdRelationship.type} <strong>{canon.find((item) => item.id === createdRelationship.target)?.label}</strong>{createdRelationship.description ? ` · ${createdRelationship.description}` : ""}<span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.1em] text-[#7b876d]">Relationship record created automatically</span></span>
                </div>
              )}
            </div>
            {relationshipPopoverOpen && (
              <div className="relative mt-3 border border-[#b7a995] bg-[#efe4d4] p-4 shadow-[3px_3px_0_#d5c8b5]">
                <button onClick={() => setRelationshipPopoverOpen(false)} className="absolute right-3 top-3 text-[#8b7f70]" aria-label="Close relationship editor"><X size={15} /></button>
                <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#a35d45]">New Canon relationship</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-[#6f665c]">Choose any two records. The relationship becomes its own traceable Canon record instead of buried prose.</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                  <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#71685e]">From
                    <select value={relationshipSource} onChange={(event) => { const nextSource = event.target.value; setRelationshipSource(nextSource); if (relationshipTarget === nextSource) setRelationshipTarget(canon.find((record) => record.id !== nextSource)?.id ?? "seed-key"); }} className="mt-1 w-full border border-[#c6b6a4] bg-[#f7f0e3] p-2 text-xs font-normal text-[#443d35]">
                      {canon.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.kind}</option>)}
                    </select>
                  </label>
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-[#a35d45] text-[#f7f0e3]"><Link2 size={14} /></div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#71685e]">To
                    <select value={relationshipTarget} onChange={(event) => setRelationshipTarget(event.target.value)} className="mt-1 w-full border border-[#c6b6a4] bg-[#f7f0e3] p-2 text-xs font-normal text-[#443d35]">
                      {canon.filter((item) => item.id !== relationshipSource).map((item) => <option key={item.id} value={item.id}>{item.label} · {item.kind}</option>)}
                    </select>
                  </label>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[0.75fr_1.25fr]">
                  <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#71685e]">Relationship
                    <select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value)} className="mt-1 w-full border border-[#c6b6a4] bg-[#f7f0e3] p-2 text-xs font-normal capitalize text-[#443d35]">
                      {relationshipTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#71685e]">Details
                    <input value={relationshipDescription} onChange={(event) => setRelationshipDescription(event.target.value)} placeholder="What should the world remember?" className="mt-1 w-full border border-[#c6b6a4] bg-[#f7f0e3] p-2 text-xs font-normal text-[#443d35] outline-none focus:border-[#a35d45]" />
                  </label>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#d2c1ae] pt-3">
                  <span className="text-[10px] text-[#8b7f70]">Scope · Foundation Canon · provenance retained</span>
                  <button onClick={() => { setCreatedRelationship({ source: relationshipSource, target: relationshipTarget, type: relationshipType, description: relationshipDescription }); setRelationshipPopoverOpen(false); }} disabled={relationshipSource === relationshipTarget} className="flex items-center gap-2 bg-[#66785d] px-3 py-2 text-[10px] font-bold text-[#f7f0e3] disabled:cursor-not-allowed disabled:opacity-50"><Check size={13} /> Create relationship record</button>
                </div>
              </div>
            )}
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

        <section className="border-b border-[#b7a995]/60 py-9">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">Worldbuilding studio · revised</p>
              <h2 className="mt-2 max-w-3xl font-serif text-3xl tracking-[-0.03em]">Start with a feeling. Leave with a world people can enter.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766d61]">
                Choose a world seed, then answer the questions that make it specific: its pressure, its voice, its materials, and the promises it asks a reader to keep.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-[#837768]">
                <span className="rounded-full border border-[#c8b9a7] bg-[#f7f0e3] px-2.5 py-1">Romantasy lens</span>
                <span>Character tension, devotion, and wonder · SFW by default</span>
              </div>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b7f70]">Step {buildStep} of 4 · saved locally</span>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[0.8fr_1.4fr_0.8fr]">
            <div className="border border-[#b7a995] bg-[#f7f0e3] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#71685e]">01 / Choose a world seed</p>
              <div className="mt-4 space-y-2">
                {buildArchetypes.map((archetype) => (
                  <button key={archetype.id} onClick={() => { setBuildMode(archetype.id); setBuildStep(2); }} className={`w-full border p-3 text-left transition-transform hover:-translate-y-0.5 ${buildMode === archetype.id ? "border-[#a35d45] bg-[#efe0ce] ring-1 ring-[#a35d45]" : "border-[#d7cbbb] bg-[#f1e8da]"}`}>
                    <p className="text-sm font-semibold text-[#443d35]">{archetype.label}</p>
                    <p className="mt-1 text-[10px] leading-4 text-[#8b7f70]">{archetype.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-[#b7a995] bg-[#34372f] p-5 text-[#f4ecdc]">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7c6a1]">02 / Define the world pressure</p>
                <Compass size={17} className="text-[#d59878]" />
              </div>
              <h3 className="mt-5 max-w-xl font-serif text-2xl leading-tight">What keeps this world from becoming ordinary?</h3>
              <p className="mt-3 text-sm leading-6 text-[#c7c8ba]">Start from a suggested premise, then make it yours by answering one question at a time. The system keeps the answers connected instead of asking for a blank-page lore dump.</p>
              <div className="mt-5 border-l-2 border-[#d59878] bg-[#465044] p-4">
                <p className="font-serif text-lg leading-6">“{activeArchetype.premise}”</p>
                <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[#c8b88e]">Suggested premise · {activeArchetype.label}</p>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {activeArchetype.questions.map((question, index) => (
                  <button key={question} onClick={() => setBuildStep(3)} className={`border p-3 text-left text-xs leading-4 transition-colors ${buildStep >= 3 && index === 0 ? "border-[#d59878] bg-[#a35d45]/30" : "border-[#6f7b6e] bg-[#465044]/60 hover:bg-[#566052]"}`}>
                    <span className="font-mono text-[9px] text-[#d59878]">0{index + 1}</span>
                    <span className="mt-2 block text-[#e6dfd1]">{question}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-[#b7a995] bg-[#e4dac9] p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#71685e]">03 / Make it tangible</p>
              <div className="mt-5 space-y-4">
                <div><p className="text-[10px] uppercase tracking-[0.12em] text-[#9b8f7e]">World materials</p><p className="mt-1 text-sm font-semibold text-[#494137]">{activeArchetype.materials}</p></div>
                <div className="border-t border-[#cabbab] pt-4"><p className="text-[10px] uppercase tracking-[0.12em] text-[#9b8f7e]">Voice direction</p><p className="mt-1 text-sm leading-5 text-[#5f574e]">{activeArchetype.voice}</p></div>
                <button onClick={() => setBuildStep(4)} className="flex w-full items-center justify-center gap-2 border border-[#66785d] bg-[#f7f0e3] px-3 py-2.5 text-xs font-bold text-[#506048] hover:bg-[#eee4d4]">Save world grammar <ArrowRight size={13} /></button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 border border-[#b7a995] bg-[#efe0ce] p-3 text-xs text-[#6d665c] sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-[#66785d]" /> Rich prompts become reusable Canon context, voice direction, scene cues, and future library suggestions.</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#8f6958]">Tone boundaries travel with the world</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9b5941]">{buildStep === 4 ? "World grammar saved" : "Draft stays private"}</span>
          </div>
        </section>

        <section className="border-b border-[#b7a995]/60 py-9">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">Authoring the atmosphere</p>
              <h2 className="mt-2 max-w-3xl font-serif text-3xl tracking-[-0.03em]">Give the world a voice before you give it more rules.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766d61]">
                Authors bring a world alive by choosing how it speaks and what it leaves behind. Voice notes and visual references become a shared grammar for scenes, assets, and future Daybook pages.
              </p>
            </div>
            <span className="flex items-center gap-2 text-xs text-[#6f665c]"><WandSparkles size={15} className="text-[#a35d45]" /> World grammar · author-owned direction</span>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative overflow-hidden border border-[#b7a995] bg-[#34372f] p-5 text-[#f4ecdc]">
              <div className="absolute -right-8 -top-10 h-36 w-36 rounded-full border border-[#c8b88e]/20" />
              <div className="relative">
                  <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7c6a1]"><Volume2 size={14} /> Voice of the world</div>
                  <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#aeb5a4]">ElevenLabs brief</span>
                </div>
                <p className="mt-5 max-w-md font-serif text-2xl leading-tight">“{activeWorld.voice}”</p>
                <div className="mt-5 flex items-center gap-3 border-t border-[#687164] pt-4">
                  <button onClick={() => setVoicePlaying((value) => !value)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#d59878] text-[#332c27] transition-transform hover:scale-105" aria-label={voicePlaying ? "Pause voice sample" : "Play voice sample"}>
                    {voicePlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex h-5 items-center gap-1">
                      {[12, 18, 9, 23, 15, 25, 11, 19, 8, 16, 22, 13, 18, 10, 20, 14, 8, 17].map((height, index) => <span key={index} className={`w-1 rounded-full transition-all ${voicePlaying ? "bg-[#d59878]" : "bg-[#85917f]"}`} style={{ height }} />)}
                    </div>
                    <p className="mt-1 text-[10px] text-[#b9b8a7]">{voicePlaying ? "Playing a 0:18 ElevenLabs-ready sample" : "Preview the ElevenLabs-ready voice direction"}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {[["intimate", "Close + tactile"], ["ceremonial", "Ceremonial"], ["unsettling", "Unsettling"]].map(([id, label]) => <button key={id} onClick={() => setVoiceStyle(id)} className={`rounded-full border px-3 py-1.5 text-[10px] ${voiceStyle === id ? "border-[#d59878] bg-[#a35d45]/40 text-[#fff4e4]" : "border-[#6f7b6e] text-[#c8c5b7]"}`}>{label}</button>)}
                </div>
              </div>
            </div>
            <div className="border border-[#b7a995] bg-[#f7f0e3] p-5">
              <div className="flex items-center justify-between border-b border-[#d7cbbb] pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#4c463d]"><Image size={15} className="text-[#a35d45]" /> Visual grammar</div>
                <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#9b8f7e]">HeyGen visual brief</span>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  ["material", "Material", activeWorld.visual.split(", ")[0], activeWorld.swatch],
                  ["motif", "Recurring motif", activeWorld.signal.split(".")[0], "linear-gradient(145deg, #c8b88e 0%, #8d9c8d 100%)"],
                  ["light", "Light + color", "A palette the reader can feel", activeWorld.swatch],
                ].map(([id, label, detail, swatch]) => (
                  <button key={id} onClick={() => setVisualFocus(id)} className={`overflow-hidden border text-left transition-transform hover:-translate-y-0.5 ${visualFocus === id ? "border-[#a35d45] ring-1 ring-[#a35d45]" : "border-[#d7cbbb]"}`}>
                    <div className="h-16" style={{ background: swatch }} />
                    <div className="bg-[#f1e8da] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#8c6d5f]">{label}</p>
                      <p className="mt-2 text-xs leading-4 text-[#50483f]">{detail}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#d7cbbb] pt-4">
                <p className="flex items-center gap-2 text-xs text-[#756b60]"><ShieldCheck size={14} className="text-[#66785d]" /> HeyGen references guide the visual treatment; they do not replace authorship.</p>
                <button onClick={() => setSceneStarted(true)} className="shrink-0 text-xs font-bold text-[#9a553d]">Use in next scene <ArrowRight size={13} className="ml-1 inline" /></button>
              </div>
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

        <section className="border-b border-[#b7a995]/60 py-9">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">A buildable path</p>
              <h2 className="mt-2 max-w-3xl font-serif text-3xl tracking-[-0.03em]">Build the trust layer before the spectacle.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766d61]">
                A Replit-sized first release can prove the participation loop in roughly 7–13 focused weeks. The estimate assumes the existing WorldSmith accounts, Canon model, Daybook, and editor tools can be extended rather than rebuilt.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#6f665c]">
              <Clock3 size={15} className="text-[#a35d45]" /> Estimated MVP · 7–13 weeks
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[0.8fr_1.35fr_0.85fr]">
            <div className="border border-[#b7a995] bg-[#f7f0e3] p-3">
              <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[#71685e]">Build sequence</p>
              <div className="space-y-1">
                {buildPhases.map((phase) => (
                  <button
                    key={phase.id}
                    onClick={() => setSelectedBuildPhase(phase.id)}
                    className={`flex w-full items-center gap-3 border p-3 text-left transition-transform hover:-translate-y-0.5 ${selectedBuildPhase === phase.id ? "border-[#a35d45] bg-[#efe0ce] ring-1 ring-[#a35d45]" : "border-[#d7cbbb] bg-[#f1e8da]"}`}
                  >
                    <span className="font-mono text-[10px] text-[#a35d45]">{phase.number}</span>
                    <span className="text-sm font-semibold text-[#443d35]">{phase.label}</span>
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.08em] text-[#8b7f70]">{phase.estimate}</span>
                  </button>
                ))}
              </div>
            </div>
            {buildPhases.filter((phase) => phase.id === selectedBuildPhase).map((phase) => (
              <div key={phase.id} className="border border-[#b7a995] bg-[#34372f] p-5 text-[#f4ecdc]">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7c6a1]">{phase.number} / {phase.label}</p>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#d59878]">{phase.estimate}</span>
                </div>
                <h3 className="mt-6 max-w-xl font-serif text-2xl leading-tight">{phase.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#c7c8ba]">{phase.detail}</p>
                <div className="mt-6 flex items-center gap-2 border-t border-[#687164] pt-4 text-xs text-[#d7c6a1]"><Check size={14} className="text-[#d59878]" /> {phase.outputs}</div>
              </div>
            ))}
            <div className="border border-[#b7a995] bg-[#e4dac9] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#71685e]">Plan around</p>
              <div className="mt-5 space-y-4">
                <div><p className="text-[10px] uppercase tracking-[0.12em] text-[#9b8f7e]">Fastest proof</p><p className="mt-1 text-sm font-semibold text-[#494137]">One world · one room · one branch</p></div>
                <div className="border-t border-[#cabbab] pt-4"><p className="text-[10px] uppercase tracking-[0.12em] text-[#9b8f7e]">Do not hide</p><p className="mt-1 text-sm leading-5 text-[#5f574e]">Moderation, provenance, permissions, and editorial review are product work—not polish.</p></div>
                <div className="border-t border-[#cabbab] pt-4"><p className="text-[10px] uppercase tracking-[0.12em] text-[#9b8f7e]">Later expansion</p><p className="mt-1 text-sm leading-5 text-[#5f574e]">More genres, richer branches, generated media, and a public library.</p></div>
              </div>
            </div>
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
               <div className="mt-3 space-y-2 border-t border-[#d7cbbb] pt-3">
                 <div className="flex gap-2 text-xs leading-5 text-[#6b6258]"><span className="font-semibold text-[#4a4239]">Theo / member:</span><span>“I hear the greenhouse as a threshold, not a location. Does anyone else feel that?”</span></div>
                 <div className="flex gap-2 text-xs leading-5 text-[#6b6258]"><span className="font-semibold text-[#4a4239]">June / store owner:</span><span>“I made a private scene from that reading. Sharing the thread, not proposing Canon yet.”</span></div>
                 {communityPosted && <div className="flex gap-2 text-xs leading-5 text-[#6b6258]"><span className="font-semibold text-[#4a4239]">You:</span><span>{communityDraft || "The key feels like a promise before it feels like a tool."}</span></div>}
               </div>
               <div className="mt-3 flex gap-2 border-t border-[#d7cbbb] pt-3">
                 <input value={communityDraft} onChange={(event) => setCommunityDraft(event.target.value)} placeholder="Add your reading to the room…" className="min-w-0 flex-1 border border-[#d7cbbb] bg-[#f1e8da] px-3 py-2 text-xs text-[#4a4239] outline-none focus:border-[#a35d45]" />
                 <button onClick={() => setCommunityPosted(true)} className="shrink-0 bg-[#66785d] px-3 py-2 text-[10px] font-bold text-[#f7f0e3]">Post reading</button>
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

        <section className="border-t border-[#b7a995]/60 py-9">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a35d45]">The story-to-library flywheel</p>
              <h2 className="mt-2 max-w-3xl font-serif text-3xl tracking-[-0.03em]">Let the story suggest what the world needs next.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766d61]">
                A scene can reveal a useful physical or digital object. Platform editors shape that signal into a reusable library item, then the community brings it back into notebooks, washi paper, ephemera, and Daybook pages.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs text-[#6f665c]">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e4dac9] text-[#a35d45]"><Sparkles size={14} /></span>
              <span><strong className="text-[#4a4239]">3 suggested items</strong><br />from this story movement</span>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[0.85fr_1.35fr_0.8fr]">
            <div className="border border-[#b7a995] bg-[#34372f] p-5 text-[#f4ecdc]">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d7c6a1]"><BookOpen size={14} /> Story signal</div>
              <p className="mt-5 font-serif text-2xl">The key hums near rosemary.</p>
              <p className="mt-3 text-xs leading-5 text-[#c7c8ba]">A recurring object, scent, and unanswered door create a strong cue for a tactile set.</p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                {[activeWorld.signal, activeWorld.shortLabel, "Story moment", "Provenance"].map((tag) => <span key={tag} className="border border-[#778574] bg-[#465044] px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#d5d6c7]">{tag}</span>)}
              </div>
            </div>
            <div className="border border-[#b7a995] bg-[#f7f0e3] p-4">
              <div className="flex items-center justify-between border-b border-[#d7cbbb] pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#4c463d]"><Package size={14} className="text-[#a35d45]" /> Platform suggestions</div>
                <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-[#9b8f7e]">editor queue</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  ["garden-notebook", "Field notebook", "Notebook · 12 pages", NotebookTabs],
                  ["rosemary-washi", "Rosemary washi", "Washi paper · 3 strips", Sparkles],
                  ["glasshouse-ephemera", "Glasshouse letter set", "Ephemera · 6 pieces", FileCheck2],
                ].map(([id, title, meta, Icon]) => (
                  <button key={id as string} onClick={() => setSelectedAsset(id as string)} className={`border p-3 text-left transition-colors ${selectedAsset === id ? "border-[#a35d45] bg-[#efe0ce]" : "border-[#d7cbbb] bg-[#f1e8da] hover:bg-[#eee0cf]"}`}>
                    <Icon size={16} className="text-[#a35d45]" />
                    <p className="mt-3 text-xs font-semibold text-[#3f3a34]">{title as string}</p>
                    <p className="mt-1 text-[10px] leading-4 text-[#8b7f70]">{meta as string}</p>
                    <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#64755b]">Suggested from story</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="border border-[#b7a995] bg-[#e4dac9] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#71685e]">The handoff</p>
              <div className="mt-5 space-y-4">
                {[
                  ["01", "Platform editor", "Creates the asset"],
                  ["02", "Library", "Makes it reusable"],
                  ["03", "Daybook + community", "Uses it in a spread"],
                ].map(([number, title, line]) => <div key={number} className="flex items-start gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f7f0e3] font-mono text-[9px] text-[#a35d45]">{number}</span><div><p className="text-xs font-semibold text-[#4b443a]">{title}</p><p className="mt-1 text-[10px] leading-4 text-[#7d7163]">{line}</p></div></div>)}
              </div>
              <button onClick={() => setCommunityChannel("member-lounge")} className="mt-6 flex w-full items-center justify-center gap-2 border border-[#8d9a84] bg-[#f7f0e3] px-3 py-2.5 text-xs font-bold text-[#5c6e55] hover:bg-[#eee4d4]"><Users size={14} /> See community uses</button>
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 border border-[#b7a995] bg-[#efe0ce] p-3 text-xs text-[#6d665c] sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-[#66785d]" /> Every suggestion keeps its story provenance before it enters the shared library.</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9b5941]">Selected · {selectedAsset === "garden-notebook" ? "Field notebook" : selectedAsset === "rosemary-washi" ? "Rosemary washi" : "Glasshouse letter set"}</span>
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