/**
 * NewSpecFlow — progressive 5-section creation form for Production Specs.
 * Sections unlock sequentially; completion sidebar tracks readiness score.
 */
import { useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronRight, CheckCircle2, Circle, Loader2, ArrowLeft,
  BookOpen, Layers, Zap, FileText, GitBranch, X, Plus,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  // Identity
  productionItem: string;
  specId: string;
  componentType: string;
  componentSet: string;
  // Creative Direction
  designIntent: string;
  narrativePurpose: string;
  requiredContent: string;
  orientation: string;
  frontBackStyle: string;
  // Print Spec
  writingSpacePercent: string;
  reviewCriteria: string;
  // Canon
  canonDependency: string;
  canonRecordIds: string[];
  styleGuideId: string;
  componentSpecId: string;
  // Payload
  payloadVersion: string;
  promptPayload: string;
  promptModuleIds: string[];
}

const EMPTY: FormState = {
  productionItem: "",
  specId: "",
  componentType: "",
  componentSet: "",
  designIntent: "",
  narrativePurpose: "",
  requiredContent: "",
  orientation: "",
  frontBackStyle: "",
  writingSpacePercent: "",
  reviewCriteria: "",
  canonDependency: "None",
  canonRecordIds: [],
  styleGuideId: "",
  componentSpecId: "",
  payloadVersion: "PP-2.0",
  promptPayload: "",
  promptModuleIds: [],
};

// ── Completion scoring ────────────────────────────────────────────────────────

interface SectionMeta {
  id: string;
  label: string;
  icon: React.ElementType;
  checks: (f: FormState) => { label: string; done: boolean }[];
}

const SECTIONS: SectionMeta[] = [
  {
    id: "identity",
    label: "Identity",
    icon: FileText,
    checks: f => [
      { label: "Production item name", done: !!f.productionItem.trim() },
      { label: "Component type", done: !!f.componentType.trim() },
      { label: "Component set", done: !!f.componentSet.trim() },
    ],
  },
  {
    id: "creative",
    label: "Creative Direction",
    icon: Layers,
    checks: f => [
      { label: "Design intent", done: !!f.designIntent.trim() },
      { label: "Narrative purpose", done: !!f.narrativePurpose.trim() },
      { label: "Required content", done: !!f.requiredContent.trim() },
      { label: "Orientation", done: !!f.orientation },
      { label: "Front/back style", done: !!f.frontBackStyle },
    ],
  },
  {
    id: "canon",
    label: "Canon & Governance",
    icon: BookOpen,
    checks: f => [
      { label: "Canon dependency set", done: !!f.canonDependency },
      { label: "Style guide linked", done: !!f.styleGuideId },
      { label: "Component spec linked", done: !!f.componentSpecId },
      {
        label: "Canon records linked (if required)",
        done: f.canonDependency === "None" || f.canonRecordIds.length > 0,
      },
    ],
  },
  {
    id: "payload",
    label: "Prompt Payload",
    icon: Zap,
    checks: f => [
      { label: "Payload version", done: !!f.payloadVersion },
      { label: "Prompt payload content", done: f.promptPayload.trim().length > 30 },
      { label: "Includes shared_prompt", done: f.promptPayload.includes("shared_prompt") || f.promptPayload.includes("asset_role") },
    ],
  },
  {
    id: "review",
    label: "Review Criteria",
    icon: GitBranch,
    checks: f => [
      { label: "Review criteria filled", done: !!f.reviewCriteria.trim() },
      { label: "Writing space set", done: !!f.writingSpacePercent },
      { label: "Prompt modules linked", done: f.promptModuleIds.length > 0 },
    ],
  },
];

function computeSectionScore(section: SectionMeta, f: FormState): number {
  const checks = section.checks(f);
  return Math.round(checks.filter(c => c.done).length / checks.length * 100);
}

function computeOverallScore(f: FormState): number {
  const allChecks = SECTIONS.flatMap(s => s.checks(f));
  return Math.round(allChecks.filter(c => c.done).length / allChecks.length * 100);
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function CircleScore({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 80 ? "#0D9488" : score >= 50 ? "#F59E0B" : "#C87560";
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="3.5" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="3.5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize={size / 5} fill={color} fontWeight="700">
        {score}
      </text>
    </svg>
  );
}

function Field({ label, required, hint, action, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {action}
      </div>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function SuggestChip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors hover:opacity-70 shrink-0"
      style={{ color: "#C87560", borderColor: "#C87560", background: "transparent" }}
    >
      Suggest ✦
    </button>
  );
}

// ── Type-specific suggestion templates ────────────────────────────────────────

type SpecSuggestions = {
  productionItem: string;
  designIntent: string;
  narrativePurpose: string;
  requiredContent: string;
  reviewCriteria: string;
};

const SUGGESTIONS: Record<string, SpecSuggestions> = {
  "Hero Paper": {
    productionItem: "[World Name] — [Collection] Hero Paper",
    designIntent:
      "Full-bleed, richly detailed illustration that commands attention as the signature element of the collection. Should feel like a museum-quality botanical or archival plate — high density of fine linework, aged paper texture, a sense of centuries of careful observation. Colours should be warm and slightly muted, as if the pigments have mellowed with time.",
    narrativePurpose:
      "The hero paper anchors the entire collection's visual identity and establishes the world's aesthetic register. Every subsequent component should feel like it exists in this paper's world. When a reader holds this sheet they should feel transported — not just charmed.",
    requiredContent:
      "Central specimen or motif occupying 60–75% of the page. Taxonomic or archival annotation rendered in a secondary serif or hand-lettered style. Aged paper grain and foxing texture throughout. Generous margin space preserved for journaling — minimum 20mm on at least one edge. No hard crop or border lines unless period-appropriate.",
    reviewCriteria:
      "Does the illustration feel hand-drawn rather than digitally generated?\nIs the central motif clearly legible at full-bleed print size?\nDoes the colour palette sit within the established collection tones?\nIs the journaling margin preserved and genuinely usable?\nDoes the foxing and grain texture age convincingly without overwhelming the linework?\nWould a collector consider this worth framing?",
  },
  "Decorative Paper": {
    productionItem: "[World Name] — [Collection] Decorative Paper",
    designIntent:
      "An all-over repeating pattern that tiles seamlessly and functions as a background layer beneath journaling or ephemera. Should be visually rich but recede gracefully — present without competing. Tones lighter than the hero paper, density lower, so handwriting sits on top without being obscured.",
    narrativePurpose:
      "Provides the visual continuity that unifies loose ephemera and journaling across spreads. The pattern language should echo motifs established by the hero paper without repeating them directly — variations, fragments, secondary elements.",
    requiredContent:
      "Seamless tile pattern with no visible repeat seams at typical print size. Tonal consistency across the full sheet. Bleed-safe to all edges. Pattern density appropriate for background use — target 40–60% visual weight of the hero paper. No text or numerals.",
    reviewCriteria:
      "Is the tile repeat invisible at arm's length?\nIs the tonal contrast low enough that black handwriting sits on top legibly?\nDoes the pattern vocabulary echo the hero paper without copying it directly?\nDoes it print cleanly at 300 DPI on uncoated stock?\nWould it work as a book interior background without feeling busy?",
  },
  "Journal Card": {
    productionItem: "[World Name] — [Collection] Journal Card",
    designIntent:
      "A self-contained 4×6 card with a complete illustration on the front and a clean, lightly textured reverse for writing. The front should feel like a standalone collectible — not a cropped fragment of a larger design. Warm, tactile, worthy of being tucked into an envelope.",
    narrativePurpose:
      "Journal cards are the tactile touchpoints of the collection — the pieces readers reach for first. Each card should feel like a discovery or a keepsake pulled from the world's archives. The image on the front tells a story; the blank reverse invites the reader to continue it.",
    requiredContent:
      "Front: primary illustration contained within a 4×6 frame with bleed. Thin period-appropriate border or edge treatment. Reverse: clean writing area with very subtle background texture, light branding mark in a corner (≤10mm). Safe zones maintained on all sides for cutting. No text on front unless it is part of the illustration's world.",
    reviewCriteria:
      "Does the front illustration read as a complete composition at 4×6 scale — not a crop?\nIs the reverse writing area clean and uncluttered enough for journaling?\nAre bleed and safe zones respected so cutting is forgiving?\nDoes the card feel worthy of being kept — collectible rather than disposable?\nDoes it coordinate with the hero paper without being derivative?",
  },
  "Coordinating Paper": {
    productionItem: "[World Name] — [Collection] Coordinating Paper",
    designIntent:
      "A lighter-weight companion to the hero paper — same world, same visual vocabulary, reduced density. Should coordinate rather than compete. Where the hero paper commands, the coordinating paper supports. Think of it as the hero paper's quieter sibling.",
    narrativePurpose:
      "Gives the collection visual breathing room and enables a layering system — hero paper as foundation, coordinating paper as the mid-layer that harmonises everything. Used as a background under ephemera or as a second paper option for pages that need less visual intensity.",
    requiredContent:
      "Scattered motifs or reduced-density pattern drawn from the hero paper's vocabulary. Same tonal palette, saturation reduced by 30–40%. Suitable for use as a secondary layer under ephemera. Minimal to no text. Full bleed to edges.",
    reviewCriteria:
      "Does it read unambiguously as part of the same collection as the hero paper?\nIs its visual density clearly lighter — would placing both on a table make the hierarchy obvious?\nDoes it layer gracefully under the journal cards and ephemera?\nDoes it stand alone as a usable sheet if the other components are absent?",
  },
  "Ephemera Sheet": {
    productionItem: "[World Name] — [Collection] Ephemera Sheet",
    designIntent:
      "A curated sheet of cuttable elements — labels, tags, tickets, envelope seals, wax seal motifs — designed to be cut apart and used individually across spreads. Each element should feel self-contained and period-appropriate, as if it was pulled from an archive box, not manufactured.",
    narrativePurpose:
      "Ephemera provides the storytelling props of the collection. Each piece should feel like it was pulled from the world's archives — worn, purposeful, particular to this world. A tag might be from a botanical specimen box; a ticket might be from a garden exhibition. The world's lore lives in these details.",
    requiredContent:
      "Minimum 8 distinct cuttable elements per sheet. Varied scales and formats: mix of tags, labels, tickets, stamps, seals, and border strips. Each element clearly separated with ≥4mm whitespace or a visible dashed cut line. Each element self-contained — complete image and any text within its own bounds. Collector reference number or world code worked subtly into at least one element.",
    reviewCriteria:
      "Are all elements clearly separable with scissors or a craft knife without damaging neighbours?\nDo all elements feel like they belong to the same world and archive?\nIs the variety of formats sufficient — ideally 3+ distinct types (tags, labels, stamps)?\nDo they hold their visual quality when cut to their final size?\nDoes at least one element carry a small piece of world lore or in-universe text?",
  },
  "Notepaper": {
    productionItem: "[World Name] — [Collection] Notepaper",
    designIntent:
      "Functional writing paper with a strong atmospheric header or border element — designed to be used, not just admired. The decorative elements should frame the writing space without crowding it. The paper should invite the pen; the design should whisper, not shout.",
    narrativePurpose:
      "Notepaper is where the world's voice is heard directly — in the handwriting of the reader. The design should invite writing, feel quiet enough to disappear while in use, and be characterful enough to delight when the sheet is held up to the light.",
    requiredContent:
      "Minimum 65% clear writing area. Decorative element confined to header (top 20%), footer (bottom 10%), or left margin (≤15mm). Optional ruled lines at 7–8mm spacing. Page size A5 or US half-letter. Subtle texture across the writing area — not blank white, not busy. World branding element small and unobtrusive.",
    reviewCriteria:
      "Is the writing area genuinely usable — correct contrast, no busy texture under lines?\nDoes the decorative element add atmosphere without migrating into the writing zone?\nDoes it print cleanly in black and white for users without colour printers?\nDoes the paper feel like it belongs to the world — not just generic stationery with a logo?",
  },
  "Endpaper": {
    productionItem: "[World Name] — [Collection] Endpaper",
    designIntent:
      "A full-spread pattern designed to line the inside covers of a bound journal or notebook — the first thing seen when a book is opened, the last thing seen when it is closed. Should feel like opening a gift. The design must be confident enough to stand alone against bare bookboard.",
    narrativePurpose:
      "Endpapers frame the entire book experience. They set the atmosphere before the first page and seal it after the last. They should feel special, considered, not incidental. A reader who has used the book for months should still feel pleased every time they open the cover.",
    requiredContent:
      "Full two-page spread pattern designed to continue across the gutter. Mirror, step-and-repeat, or deliberate continuation across the spine. Grain and texture appropriate for adhering to bookboard. No critical design elements within 10mm of the gutter. No text or elements that would be obscured if the endpaper is trimmed to board size.",
    reviewCriteria:
      "Does the pattern work as a two-page spread — is the gutter treatment deliberate rather than accidental?\nIs the texture appropriate for a book interior — not too busy for an enclosed space?\nWould it look beautiful lined inside a cloth or leather cover?\nDoes it feel like the world's endpaper specifically, not just any patterned paper?\nIs the print-safe zone respected on all edges?",
  },
  "Washi Tape": {
    productionItem: "[World Name] — [Collection] Washi Tape",
    designIntent:
      "A 15mm strip pattern that tiles infinitely along its length — small scale, high charm. Should be delightful at the actual scale it will be used: as an accent, a hinge, a border strip. The pattern must work at narrow width first; wider context is secondary.",
    narrativePurpose:
      "Washi tape is the punctuation of the collection — the comma that holds things together with personality. The pattern should feel intentional and characterful even at narrow width. A reader who uses it on a spread should feel they have added a considered design element, not just a piece of tape.",
    requiredContent:
      "Pattern tiling seamlessly along the horizontal axis. Designed for a 15mm (±2mm) strip width. Each repeating unit ≤30mm long. Pattern readable and characterful at actual size — no elements that only make sense at full page scale. Transparent or white background with motifs, or full-colour wash with motifs over it.",
    reviewCriteria:
      "Does the pattern tile seamlessly — zero visible seam?\nIs it readable and charming at 15mm width when printed at 300 DPI?\nDo the motifs coordinate with the hero paper vocabulary?\nDoes it look like a design choice rather than a leftover pattern?\nWould it look intentional on a journal spread next to the other collection components?",
  },
};

const DEFAULT_SUGGESTIONS: SpecSuggestions = {
  productionItem: "[World Name] — [Component Description]",
  designIntent:
    "Describe the visual experience this component should create — the mood, atmosphere, and feeling a reader should have when they hold it. Reference the world's aesthetic register and the role this piece plays in the collection.",
  narrativePurpose:
    "Explain how this component serves the world's story. What does it represent in-universe? What does it invite the reader to do? What would be lost from the collection if this component were absent?",
  requiredContent:
    "List the specific visual elements, motifs, text areas, dimensions, and structural requirements that must appear in this component. Be precise — this is the brief the image generator will work from.",
  reviewCriteria:
    "Write the evaluation questions you will use when reviewing generated images. Each criterion should be answerable yes/no so review decisions are clear and consistent.",
};

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#C87560] transition-colors";
const textareaCls = `${inputCls} resize-none`;
const selectCls = `${inputCls} bg-white`;
type OnFieldFocus = (field: keyof FormState, label: string) => void;

// ── Section forms ─────────────────────────────────────────────────────────────

function IdentitySection({ f, set, worldId, onFocus }: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  worldId: string | null;
  onFocus?: OnFieldFocus;
}) {
  const { data: setsData } = useQuery({
    queryKey: ["editorial-component-sets", worldId],
    queryFn: () => apiFetch<{ component_sets: string[] }>(`/v1/editorial/component-sets?world_id=${worldId}`),
    enabled: !!worldId,
    staleTime: 60_000,
  });
  const existingSets = setsData?.component_sets ?? [];

  const suggest = SUGGESTIONS[f.componentType] ?? DEFAULT_SUGGESTIONS;
  const hasSuggestions = !!f.componentType;

  return (
    <div className="space-y-4">
      <Field
        label="Production Item Name"
        required
        hint="The full name as it appears in the production catalog."
        action={hasSuggestions ? (
          <SuggestChip onClick={() => set("productionItem", suggest.productionItem)} />
        ) : undefined}
      >
        <input value={f.productionItem} onChange={e => set("productionItem", e.target.value)} onFocus={() => onFocus?.("productionItem", "Production Item Name")} className={inputCls} placeholder="e.g. Victorian Garden Journal — Botanical Survey Page" />
      </Field>
      <Field label="Component Type" required>
        <select value={f.componentType} onChange={e => set("componentType", e.target.value)} className={selectCls}>
          <option value="">Select type…</option>
          <option>Hero Paper</option>
          <option>Decorative Paper</option>
          <option>Journal Card</option>
          <option>Coordinating Paper</option>
          <option>Ephemera Sheet</option>
          <option>Notepaper</option>
          <option>Endpaper</option>
          <option>Washi Tape</option>
        </select>
      </Field>
      <Field label="Component Set" hint="The thematic family this belongs to — pick an existing set or type a new name.">
        <input
          value={f.componentSet}
          onChange={e => set("componentSet", e.target.value)}
          onFocus={() => onFocus?.("componentSet", "Component Set")}
          className={inputCls}
          placeholder="e.g. The Herbalist's Collection"
          list="component-set-list"
          autoComplete="off"
        />
        {existingSets.length > 0 && (
          <datalist id="component-set-list">
            {existingSets.map(s => <option key={s} value={s} />)}
          </datalist>
        )}
      </Field>
      <Field label="Spec ID" hint="Leave blank to auto-generate (e.g. WYC-HRP-001). Override here if you have a naming convention.">
        <input
          value={f.specId}
          onChange={e => set("specId", e.target.value)}
          onFocus={() => onFocus?.("specId", "Spec ID")}
          className={inputCls}
          placeholder="Auto-generated on save"
        />
      </Field>
    </div>
  );
}

function CreativeSection({ f, set, onFocus }: { f: FormState; set: (k: keyof FormState, v: string) => void; onFocus?: OnFieldFocus }) {
  const suggest = SUGGESTIONS[f.componentType] ?? DEFAULT_SUGGESTIONS;
  const hasSuggestions = !!f.componentType;

  return (
    <div className="space-y-4">
      <Field
        label="Design Intent"
        required
        hint="What visual experience should this create?"
        action={hasSuggestions ? <SuggestChip onClick={() => set("designIntent", suggest.designIntent)} /> : undefined}
      >
        <textarea value={f.designIntent} onChange={e => set("designIntent", e.target.value)} onFocus={() => onFocus?.("designIntent", "Design Intent")} className={textareaCls} rows={4} placeholder="Describe the feeling, mood, and visual atmosphere…" />
      </Field>
      <Field
        label="Narrative Purpose"
        required
        hint="What story does this component serve?"
        action={hasSuggestions ? <SuggestChip onClick={() => set("narrativePurpose", suggest.narrativePurpose)} /> : undefined}
      >
        <textarea value={f.narrativePurpose} onChange={e => set("narrativePurpose", e.target.value)} onFocus={() => onFocus?.("narrativePurpose", "Narrative Purpose")} className={textareaCls} rows={4} placeholder="How does this connect to the world's narrative…" />
      </Field>
      <Field
        label="Required Content"
        required
        hint="Specific elements that must appear."
        action={hasSuggestions ? <SuggestChip onClick={() => set("requiredContent", suggest.requiredContent)} /> : undefined}
      >
        <textarea value={f.requiredContent} onChange={e => set("requiredContent", e.target.value)} onFocus={() => onFocus?.("requiredContent", "Required Content")} className={textareaCls} rows={4} placeholder="List required visual elements, motifs, text areas…" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Orientation">
          <select value={f.orientation} onChange={e => set("orientation", e.target.value)} className={selectCls}>
            <option value="">Select…</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
            <option value="square">Square</option>
          </select>
        </Field>
        <Field label="Front/Back Style">
          <select value={f.frontBackStyle} onChange={e => set("frontBackStyle", e.target.value)} className={selectCls}>
            <option value="">Select…</option>
            <option value="single-sided">Single Sided</option>
            <option value="double-sided-matched">Double Sided — Matched</option>
            <option value="double-sided-complementary">Double Sided — Complementary</option>
            <option value="double-sided-independent">Double Sided — Independent</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

function CanonSection({
  f,
  set,
  worldId,
  onToggleCanonId,
}: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  worldId: string | null;
  onToggleCanonId: (id: string) => void;
}) {
  const { data: sgData } = useQuery({
    queryKey: ["editorial-style-guides", worldId],
    queryFn: () => apiFetch<{ style_guides: { id: string; name: string }[] }>(`/v1/editorial/style-guides?world_id=${worldId}`),
    enabled: !!worldId,
  });
  const { data: csData } = useQuery({
    queryKey: ["editorial-component-specs", worldId],
    queryFn: () => apiFetch<{ component_specs: { id: string; name: string; componentType: string }[] }>(`/v1/editorial/component-specs?world_id=${worldId}`),
    enabled: !!worldId,
  });
  const { data: crData } = useQuery({
    queryKey: ["editorial-canon-records", worldId, "accepted"],
    queryFn: () => apiFetch<{ canon_records: { id: string; name: string; status: string; canonType: string }[] }>(`/v1/editorial/canon-records?world_id=${worldId}&status=accepted`),
    enabled: !!worldId && f.canonDependency !== "None",
  });

  return (
    <div className="space-y-4">
      <Field label="Canon Dependency" hint="How strongly does this spec depend on approved canon records?">
        <select value={f.canonDependency} onChange={e => set("canonDependency", e.target.value)} className={selectCls}>
          <option value="None">None — visually inspired, no specific references</option>
          <option value="Supports Canon">Supports Canon — consistent with established records</option>
          <option value="Canon Reference">Canon Reference — specifically references canon elements</option>
          <option value="Canon Defining">Canon Defining — will define new canon (all refs must be Accepted)</option>
        </select>
      </Field>

      <Field label="Style Guide">
        <select value={f.styleGuideId} onChange={e => set("styleGuideId", e.target.value)} className={selectCls}>
          <option value="">No style guide linked</option>
          {(sgData?.style_guides ?? []).map(sg => (
            <option key={sg.id} value={sg.id}>{sg.name}</option>
          ))}
        </select>
      </Field>

      <Field label="Component Spec">
        <select value={f.componentSpecId} onChange={e => set("componentSpecId", e.target.value)} className={selectCls}>
          <option value="">No component spec linked</option>
          {(csData?.component_specs ?? []).map(cs => (
            <option key={cs.id} value={cs.id}>{cs.name} ({cs.componentType})</option>
          ))}
        </select>
      </Field>

      {f.canonDependency !== "None" && (
        <Field label="Canon Records" hint="Select accepted canon records this spec references.">
          <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100">
            {(crData?.canon_records ?? []).length === 0 ? (
              <p className="text-xs text-gray-400 p-3">No accepted canon records yet.</p>
            ) : (
              (crData?.canon_records ?? []).map(cr => (
                <label key={cr.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={f.canonRecordIds.includes(cr.id)}
                    onChange={() => onToggleCanonId(cr.id)}
                    className="accent-[#C87560]"
                  />
                  <span className="text-sm text-gray-700">{cr.name}</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{cr.canonType}</span>
                </label>
              ))
            )}
          </div>
        </Field>
      )}
    </div>
  );
}

function PayloadSection({ f, set, worldId, onToggleModuleId, onFocus }: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  worldId: string | null;
  onToggleModuleId: (id: string) => void;
  onFocus?: OnFieldFocus;
}) {
  const { data: pmData } = useQuery({
    queryKey: ["editorial-prompt-modules", worldId],
    queryFn: () => apiFetch<{ prompt_modules: { id: string; name: string }[] }>(`/v1/editorial/prompt-modules?world_id=${worldId}`),
    enabled: !!worldId,
  });

  return (
    <div className="space-y-4">
      <Field label="Payload Version">
        <select value={f.payloadVersion} onChange={e => set("payloadVersion", e.target.value)} className={selectCls}>
          <option value="PP-2.0">PP-2.0 (Section-based)</option>
          <option value="PP-1.0">PP-1.0 (Legacy flat)</option>
        </select>
      </Field>
      <Field label="Prompt Payload" required hint={f.payloadVersion === "PP-2.0" ? "Include shared_prompt, front_prompt, and negative_prompt sections." : "Single flat prompt string."}>
        <textarea
          value={f.promptPayload}
          onChange={e => set("promptPayload", e.target.value)}
          onFocus={() => onFocus?.("promptPayload", "Prompt Payload")}
          className={textareaCls}
          rows={10}
          placeholder={f.payloadVersion === "PP-2.0" ? `shared_prompt: Aged botanical illustration from a Victorian naturalist's journal…\n\nfront_prompt: Delicate hand-drawn plant specimen with taxonomic annotations…\n\nnegative_prompt: modern, digital, harsh lines, neon…` : `asset_role: Hero Paper\ncard_role: Hero Paper\nmaterials: Cotton paper, aged foxing…`}
          style={{ fontFamily: "ui-monospace, 'Fira Mono', monospace", fontSize: 12 }}
        />
      </Field>
      {(pmData?.prompt_modules ?? []).length > 0 && (
        <Field label="Prompt Modules" hint="Include content from these modules.">
          <div className="flex flex-wrap gap-2">
            {(pmData?.prompt_modules ?? []).map(pm => {
              const active = f.promptModuleIds.includes(pm.id);
              return (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => onToggleModuleId(pm.id)}
                  className="text-xs px-2.5 py-1 rounded-full border transition-colors"
                  style={active
                    ? { background: "#1B2A4A", color: "white", borderColor: "#1B2A4A" }
                    : { background: "white", color: "#6B7280", borderColor: "#E5E7EB" }}
                >
                  {pm.name}
                </button>
              );
            })}
          </div>
        </Field>
      )}
    </div>
  );
}

function ReviewSection({ f, set, onFocus }: { f: FormState; set: (k: keyof FormState, v: string) => void; onFocus?: OnFieldFocus }) {
  const suggest = SUGGESTIONS[f.componentType] ?? DEFAULT_SUGGESTIONS;
  const hasSuggestions = !!f.componentType;

  return (
    <div className="space-y-4">
      <Field
        label="Review Criteria"
        hint="What will you evaluate when reviewing generated images?"
        action={hasSuggestions ? <SuggestChip onClick={() => set("reviewCriteria", suggest.reviewCriteria)} /> : undefined}
      >
        <textarea value={f.reviewCriteria} onChange={e => set("reviewCriteria", e.target.value)} onFocus={() => onFocus?.("reviewCriteria", "Review Criteria")} className={textareaCls} rows={6} placeholder="Does the botanical illustration style match the hero paper?&#10;Are the writing spaces correctly sized?&#10;Does it evoke the Victorian naturalist aesthetic?…" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Writing Space %" hint="0 for decorative, 100 for blank paper.">
          <input
            type="number"
            min={0} max={100} step={5}
            value={f.writingSpacePercent}
            onChange={e => set("writingSpacePercent", e.target.value)}
            className={inputCls}
            placeholder="e.g. 60"
          />
        </Field>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewSpecFlow() {
  const [, navigate] = useLocation();
  const { selectedWorldId, selectedCollectionId } = useEditorial();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [activeSection, setActiveSection] = useState(0);
  const set = (k: keyof FormState, v: string) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleId = (key: "canonRecordIds" | "promptModuleIds", id: string) => {
    setForm(prev => {
      const arr = prev[key] as string[];
      const next = arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
      return { ...prev, [key]: next };
    });
  };

  const overallScore = computeOverallScore(form);

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiFetch<{ spec: { id: string } }>("/v1/editorial/specs", {
        method: "POST",
        body: JSON.stringify({
          world_id: selectedWorldId,
          collection_id: selectedCollectionId || undefined,
          production_item: form.productionItem,
          spec_id: form.specId || undefined,
          component_type: form.componentType,
          component_set: form.componentSet || undefined,
          design_intent: form.designIntent,
          narrative_purpose: form.narrativePurpose,
          required_content: form.requiredContent,
          orientation: form.orientation || undefined,
          front_back_style: form.frontBackStyle || undefined,
          writing_space_percent: form.writingSpacePercent ? parseFloat(form.writingSpacePercent) : undefined,
          review_criteria: form.reviewCriteria,
          canon_dependency: form.canonDependency,
          canon_record_ids: form.canonRecordIds,
          style_guide_id: form.styleGuideId || undefined,
          component_spec_id: form.componentSpecId || undefined,
          payload_version: form.payloadVersion,
          prompt_payload: form.promptPayload,
          prompt_module_ids: form.promptModuleIds,
        }),
      });
    },
    onSuccess: (data) => {
      toast({ title: "Production spec created" });
      navigate(`/super/worldsmith/editorial/specs/${data.spec.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create spec", variant: "destructive" });
    },
  });

  const canSubmit = !!(form.productionItem.trim() && form.componentType.trim() && selectedWorldId);
  const currentSection = SECTIONS[activeSection];
  return (
    <div className="flex h-full overflow-hidden" style={{ background: "#FAF8F3" }}>
      {/* Progress sidebar */}
      <aside className="flex flex-col border-r bg-white" style={{ width: 220, borderColor: "#E5E7EB" }}>
        <div className="px-4 pt-5 pb-3 border-b" style={{ borderColor: "#F3F4F6" }}>
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">New Asset</div>
          <div className="font-medium text-gray-800" style={{ fontFamily: "'Playfair Display', serif", fontSize: 16 }}>
            {form.productionItem.trim() || "Untitled Spec"}
          </div>
          {form.componentType && (
            <div className="text-xs text-[#C87560] mt-0.5">{form.componentType}</div>
          )}
        </div>

        {/* Overall score */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "#F3F4F6" }}>
          <CircleScore score={overallScore} size={48} />
          <div>
            <div className="text-xs text-gray-500">Readiness</div>
            <div
              className="text-sm font-semibold"
              style={{ color: overallScore >= 80 ? "#0D9488" : overallScore >= 50 ? "#F59E0B" : "#9CA3AF" }}
            >
              {overallScore >= 80 ? "Compile-ready" : overallScore >= 50 ? "Near complete" : "In progress"}
            </div>
          </div>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto py-2">
          {SECTIONS.map((sec, i) => {
            const score = computeSectionScore(sec, form);
            const isActive = i === activeSection;
            const Icon = sec.icon;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSection(i)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors"
                style={isActive ? { background: "rgba(200,117,96,0.08)", borderLeft: "2px solid #C87560" } : { borderLeft: "2px solid transparent" }}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: isActive ? "#C87560" : "#9CA3AF" }} />
                <span className="flex-1 text-sm" style={{ color: isActive ? "#C87560" : "#4B5563", fontWeight: isActive ? 500 : 400 }}>
                  {sec.label}
                </span>
                {score === 100 ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                ) : (
                  <span className="text-[10px] text-gray-400 shrink-0">{score}%</span>
                )}
              </button>
            );
          })}
        </div>

        {/* "What's needed" */}
        <div className="border-t px-4 py-3" style={{ borderColor: "#F3F4F6" }}>
          <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Next required</p>
          {SECTIONS.flatMap(s => s.checks(form).filter(c => !c.done)).slice(0, 3).map((c, i) => (
            <p key={i} className="text-xs text-gray-500 flex items-start gap-1.5 mb-1">
              <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              {c.label}
            </p>
          ))}
          {SECTIONS.flatMap(s => s.checks(form).filter(c => !c.done)).length === 0 && (
            <p className="text-xs text-teal-600">All checks passed ✓</p>
          )}
        </div>
      </aside>

      {/* Main form area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top bar */}
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0" style={{ borderColor: "#E5E7EB" }}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/super/worldsmith/editorial/board")}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-[#1B2A4A]">
                {currentSection.label}
              </h1>
              <p className="text-xs text-gray-400">
                Step {activeSection + 1} of {SECTIONS.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Section nav */}
            <button
              onClick={() => setActiveSection(Math.max(0, activeSection - 1))}
              disabled={activeSection === 0}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Back
            </button>
            {activeSection < SECTIONS.length - 1 ? (
              <button
                onClick={() => setActiveSection(activeSection + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium text-white transition-colors"
                style={{ background: "#1B2A4A" }}
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit || createMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-medium text-white disabled:opacity-50"
                style={{ background: "#C87560" }}
              >
                {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Create Spec
              </button>
            )}
          </div>
        </div>

        {/* Section content + contextual co-write rail */}
        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-8 min-w-0">
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
            {activeSection === 0 && <IdentitySection f={form} set={set} worldId={selectedWorldId} />}
            {activeSection === 1 && <CreativeSection f={form} set={set} />}
            {activeSection === 2 && (
              <CanonSection
                f={form} set={set}
                worldId={selectedWorldId}
                onToggleCanonId={id => toggleId("canonRecordIds", id)}
              />
            )}
            {activeSection === 3 && (
              <PayloadSection
                f={form} set={set}
                worldId={selectedWorldId}
                onToggleModuleId={id => toggleId("promptModuleIds", id)}
              />
            )}
            {activeSection === 4 && <ReviewSection f={form} set={set} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
