/**
 * NewPromptModuleFlow — progressive 4-section creation form for Prompt Modules.
 * Mirrors the NewStyleGuideFlow / NewSpecFlow pattern: progress sidebar,
 * completion scoring, Suggest chips per field, assembled content on save.
 *
 * Sections:
 *   1. Identity       — name, module type, usage context
 *   2. Prompt Content — primary text, alternative phrasing, injection point
 *   3. Targeting      — applicable component types, canon hint, priority
 *   4. Quality        — good/bad output indicators, module interactions
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2, Circle, Loader2, ArrowLeft,
  Puzzle, Zap, Target, ShieldCheck, FileText, Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import { EditorialCopilot } from "@/components/EditorialCopilot";
import type { ApplyTarget } from "@/components/CopilotPanel";

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  // Identity
  name: string;
  moduleType: string;
  usageContext: string;
  // Prompt Content
  primaryContent: string;
  alternativePhrasing: string;
  injectionPoint: string;
  // Targeting
  applicableTypes: string;
  canonDependencyHint: string;
  priorityNote: string;
  // Quality & Interactions
  goodOutputIndicators: string;
  badOutputIndicators: string;
  moduleInteractions: string;
}

const EMPTY: FormState = {
  name: "",
  moduleType: "",
  usageContext: "",
  primaryContent: "",
  alternativePhrasing: "",
  injectionPoint: "",
  applicableTypes: "",
  canonDependencyHint: "",
  priorityNote: "",
  goodOutputIndicators: "",
  badOutputIndicators: "",
  moduleInteractions: "",
};

// ── Content assembler ─────────────────────────────────────────────────────────

function assembleContent(f: FormState): string {
  const lines: string[] = [];
  const field = (label: string, value: string) => {
    if (value.trim()) {
      lines.push(`\n### ${label}`);
      lines.push(value.trim());
    }
  };

  lines.push(`PROMPT MODULE: ${f.name}`);
  if (f.moduleType) lines.push(`Type: ${f.moduleType}`);
  if (f.injectionPoint) lines.push(`Injection point: ${f.injectionPoint}`);

  if (f.usageContext.trim()) {
    lines.push(`\n## Usage`);
    lines.push(f.usageContext.trim());
  }

  lines.push(`\n## Prompt Content`);
  field("Primary", f.primaryContent);
  field("Alternative / Condensed", f.alternativePhrasing);

  if (f.applicableTypes || f.canonDependencyHint || f.priorityNote) {
    lines.push(`\n## Targeting`);
    field("Applicable Component Types", f.applicableTypes);
    field("Canon Dependency Hint", f.canonDependencyHint);
    field("Priority / Injection Order", f.priorityNote);
  }

  if (f.goodOutputIndicators || f.badOutputIndicators || f.moduleInteractions) {
    lines.push(`\n## Quality & Interactions`);
    field("Good Output Indicators", f.goodOutputIndicators);
    field("Bad Output Indicators (reject if present)", f.badOutputIndicators);
    field("Module Interactions", f.moduleInteractions);
  }

  return lines.join("\n").trim();
}

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
      { label: "Module name", done: !!f.name.trim() },
      { label: "Module type", done: !!f.moduleType },
      { label: "Usage context", done: !!f.usageContext.trim() },
    ],
  },
  {
    id: "content",
    label: "Prompt Content",
    icon: Zap,
    checks: f => [
      { label: "Primary content", done: !!f.primaryContent.trim() },
      { label: "Injection point", done: !!f.injectionPoint },
    ],
  },
  {
    id: "targeting",
    label: "Targeting",
    icon: Target,
    checks: f => [
      { label: "Applicable component types", done: !!f.applicableTypes.trim() },
      { label: "Priority note", done: !!f.priorityNote.trim() },
    ],
  },
  {
    id: "quality",
    label: "Quality & Interactions",
    icon: ShieldCheck,
    checks: f => [
      { label: "Good output indicators", done: !!f.goodOutputIndicators.trim() },
      { label: "Bad output indicators", done: !!f.badOutputIndicators.trim() },
    ],
  },
];

const CLAY = "#C87560";
const INK = "#1B2A4A";

// ── Progress ring ─────────────────────────────────────────────────────────────

function ProgressRing({ done, total, size = 32 }: { done: number; total: number; size?: number }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (done / Math.max(total, 1)) * circ;
  const color = done === total ? CLAY : done > 0 ? "#FCD34D" : "#E5E7EB";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E5E7EB" strokeWidth="3.5" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="3.5"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

// ── Field + Suggest chip ───────────────────────────────────────────────────────

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
      style={{ color: CLAY, borderColor: CLAY, background: "transparent" }}
    >
      Suggest ✦
    </button>
  );
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:border-[#C87560] transition-colors";
const textareaCls = `${inputCls} resize-none`;
const selectCls = `${inputCls} bg-white`;
type OnFieldFocus = (field: keyof FormState, label: string) => void;

// ── Type-specific suggestion templates ────────────────────────────────────────

type ModuleSuggestions = {
  usageContext: string;
  primaryContent: string;
  alternativePhrasing: string;
  applicableTypes: string;
  canonDependencyHint: string;
  priorityNote: string;
  goodOutputIndicators: string;
  badOutputIndicators: string;
  moduleInteractions: string;
};

const MODULE_SUGGESTIONS: Record<string, ModuleSuggestions> = {
  "Atmospheric Grounding": {
    usageContext:
      "Attach to all Hero Paper and Decorative Paper specs in this collection. This module sets the world's ambient atmosphere before any component-specific content — it should always be the first shared_prompt injection.",
    primaryContent:
      "The scene exists in a world of perpetual soft autumn light — the kind that filters through old glass and settles into the grain of timber and vellum. There is age here, but not decay. Things have been used and kept. The air carries the faint smell of beeswax and dried lavender; the sound, if any, is the scratch of a nib or the turn of a page. Nothing is hurried. Everything is deliberate.",
    alternativePhrasing:
      "Warm autumn light through old glass; aged but cared for; beeswax, dried herbs, unhurried pace.",
    applicableTypes:
      "Hero Paper, Decorative Paper, Notepaper, Endpaper — all specs where world atmosphere should permeate the image.",
    canonDependencyHint:
      "None — atmospheric modules should function independently of specific canon records and be reusable across the full collection.",
    priorityNote:
      "Highest priority among style modules — inject first in shared_prompt, before any component-specific or canon anchor content.",
    goodOutputIndicators:
      "The image feels as if you have opened a door into the world. The light is warm and directional. Textures are tangible. There is no sense of digital origin — no smooth gradients, no perfectly even surfaces. The viewer could identify the time of day and the quality of the air.",
    badOutputIndicators:
      "Cool or neutral colour cast. Bright, sourceless, commercial-feeling lighting. Smooth gradients. Any sense of stock photography or contemporary digital illustration. The world feels contemporary rather than timeless.",
    moduleInteractions:
      "Must precede Material World and Sensory Layer in shared_prompt. Can conflict with Technical Constraint modules if atmospheric grounding implies textures incompatible with print-safe rules — resolve in favour of production requirements. Combine with Sensory Layer for maximum immersive effect on hero pieces.",
  },
  "Material World": {
    usageContext:
      "Attach to specs where physical materials are central to the visual — botanical papers, endpapers, illustrated ephemera. Most effective in combination with Atmospheric Grounding.",
    primaryContent:
      "The paper has texture — not the even tooth of modern watercolour paper but the uneven, hand-laid surface of something pressed from rag. The ink sits on top rather than sinking in; edges bleed slightly at the extremity of lines. Where wash has been applied, the pigment has granulated in the hollows. A corner is softly dog-eared; a margin carries the ghost of a thumbprint in pencil. These are working materials, used by someone who knew their craft.",
    alternativePhrasing:
      "Rag paper with uneven tooth; ink sitting on surface with edge bleed; pigment granulation in washes; working materials — used and purposeful, not precious.",
    applicableTypes:
      "Hero Paper, Journal Card, Endpaper — any spec where physical material quality is a primary atmospheric element.",
    canonDependencyHint:
      "None — material world modules operate at the physical-reality layer, independent of specific canon content.",
    priorityNote:
      "Medium priority — inject in shared_prompt after Atmospheric Grounding, before component-specific content. Can stand alone if Atmospheric Grounding is not attached.",
    goodOutputIndicators:
      "Materials read as physically real and varied — no two areas feel the same. Paper grain is visible and contextually appropriate. Ink has weight and occasional edge variation. Pigment granulation or wash pooling is present where colour appears. The illustration feels as if it could be lifted from the page.",
    badOutputIndicators:
      "Smooth, even, uniform surfaces throughout. No texture variation between areas. Ink lines have perfectly even width from start to finish. Paper reads as pure white or as a clean digital background. The result looks printed rather than drawn or made.",
    moduleInteractions:
      "Pairs naturally with Atmospheric Grounding — together they establish both mood and physical reality. Can be used independently for specs focused on material quality. Avoid combining with Technical Constraint modules that specify clean, bleed-free output for certain production contexts.",
  },
  "Canon Anchor": {
    usageContext:
      "Attach to specs with Canon Reference or Canon Defining dependency level. Always attach specific canon record IDs alongside this module in the spec. This module ensures the generator respects world-locked visual decisions.",
    primaryContent:
      "[CUSTOMISE: Replace bracketed sections with your world's specifics.]\n\nThis component exists within [World Name]'s established visual canon. The following elements are fixed by accepted canon record and must appear accurately: [list canon-specified elements — colours, objects, characters, locations]. Do not introduce visual elements, characters, or locations that contradict established canon records. Where ambiguity exists, default to the most recently accepted canon record over the style guide's general direction.",
    alternativePhrasing:
      "Canon elements are non-negotiable. When a canon record specifies a colour, material, character appearance, or visual quality, that specification overrides style guide preferences.",
    applicableTypes:
      "All component types when the spec's canon_dependency is Canon Reference or Canon Defining.",
    canonDependencyHint:
      "Canon Reference or Canon Defining — this module has no value when attached to specs with no canon dependency. Only attach when specific canon records are listed in the spec.",
    priorityNote:
      "Highest priority when attached — canon constraints override style guide preferences and atmospheric modules for specific visual elements. Inject in shared_prompt early.",
    goodOutputIndicators:
      "Canon-specified elements appear exactly as documented in the attached canon records. No visual contradictions with accepted canon. Output feels consistent with previously approved canon-anchored imagery in this world.",
    badOutputIndicators:
      "Canon elements are absent, visually altered, or contradicted. Elements appear that have been explicitly excluded or that contradict accepted canon records. Imagery feels disconnected from the established visual world.",
    moduleInteractions:
      "Canon Anchor has override authority over Atmospheric Grounding and Material World for specific visual elements — if a canon record specifies an element's appearance, that overrides general atmospheric direction. Must be coordinated with the spec's attached canon record list. Replace the bracketed placeholder text before attaching to any spec.",
  },
  "Sensory Layer": {
    usageContext:
      "Attach to Hero Papers and editorial imagery where maximum immersive quality is the goal — pieces intended to make a reader feel they have stepped into the world. Most effective on signature pieces that lead a collection.",
    primaryContent:
      "The quality of light is specific: it enters from one side, warm and slightly diffuse, casting soft shadows that anchor each element to a surface. Temperature, if felt, would be cool-room warm — comfortable but not heated. The silence is thick: this is a room that has been quiet for a long time. Scent, if translatable to image: old paper, warm wax, the faintest trace of something botanical drying somewhere above. The feeling is of being the first person to have been here in a while — and of being welcome.",
    alternativePhrasing:
      "Single light source, warm and diffuse. Cool-warm ambient temperature. Deep quiet. Old paper and botanical scent implied. Feeling of welcome solitude — inhabited but unhurried.",
    applicableTypes:
      "Hero Paper, full-spread Endpaper, signature Journal Cards — pieces intended as the emotional anchor of a collection.",
    canonDependencyHint:
      "None — sensory modules work at the atmospheric layer, independent of specific canon content.",
    priorityNote:
      "Inject in shared_prompt after Atmospheric Grounding. Use Sensory Layer for the world's richest, most emotionally demanding pieces — reserve it for the work that needs to land hardest.",
    goodOutputIndicators:
      "The image creates a felt sense, not just a seen one. Light reads as having a specific source, direction, and quality, not just brightness. There is an implied temperature and ambient quiet. The image invites lingering — the viewer feels they could reach in.",
    badOutputIndicators:
      "Flat, even, sourceless light throughout the image. No implied depth of field or sense of air. Image reads as an arranged still-life or product shot rather than a discovered moment. The viewer feels outside the image, looking at it, rather than present within it.",
    moduleInteractions:
      "Pairs naturally with Atmospheric Grounding — they operate at different registers (general atmosphere vs. specific sensory quality). Use Sensory Layer selectively for the richest pieces; omit for pattern-based Decorative Paper or Washi Tape where immersion is not the primary goal. Can conflict with Technical Constraint modules that specify flat, composition-dominant output — resolve by adjusting the spec's intent.",
  },
  "Narrative Voice": {
    usageContext:
      "Attach to any spec where editorial framing copy will appear as a visual element — notepaper headers, card reverses, journal prompt text, specimen labels. Sets the point of view and register for all text elements in the image.",
    primaryContent:
      "Any text that appears in this image is written by someone who knows this world from the inside — not describing it for an outsider, but recording it for themselves. The handwriting, if present, is considered and unhurried: not calligraphic but practised. The language, if readable, has the register of a private journal or a careful field note — specific, observational, quietly expressive. Nothing is labelled for a reader; everything is noted for the writer's own future reference.",
    alternativePhrasing:
      "Internal perspective — written for self, not for audience. Private journal register. Specific, observational, unhurried. Practised but not calligraphic handwriting.",
    applicableTypes:
      "Notepaper, Journal Card (reverse face), any spec containing handwritten or editorial text as a primary visual element.",
    canonDependencyHint:
      "Supports Canon — text elements should be consistent with the world's established voice, register, and any canon-specified vocabulary or naming conventions.",
    priorityNote:
      "Apply to front_prompt for specs where text is a primary visual element. Not needed for purely illustrative specs with no text components.",
    goodOutputIndicators:
      "Text elements (if visible) read as written rather than typeset or printed. Register is personal and considered. Nothing reads as a label, caption, or marketing copy. The point of view is internal to the world — the writer is inside, not narrating for an external audience.",
    badOutputIndicators:
      "Text feels like a caption, label, or product description. Register is formal, external, or commercial. Handwriting, if present, is uniform, mechanical, or decoratively perfect. Text breaks the fourth wall by addressing the viewer directly or using contemporary language.",
    moduleInteractions:
      "Works alongside Atmospheric Grounding without conflict. Can conflict with Technical Constraint modules that specify minimal or no text in production assets — resolve in favour of the spec's required content field. Do not attach to specs where text is explicitly excluded by the Required Content field.",
  },
  "Technical Constraint": {
    usageContext:
      "Attach to all print-destined production specs. Enforces print-safe composition rules that prevent costly errors in print-on-demand fulfilment. Critical for Hero Papers and any full-bleed artwork.",
    primaryContent:
      "This is a print-production asset. Composition must respect the following hard constraints:\n\n— Safe zone: no essential detail within 5mm of the trimmed edge.\n— Bleed: full colour and texture must extend to 3mm beyond the trim line.\n— Text and critical linework: no closer than 8mm to the trim.\n— Colour: avoid pure black (#000000) for large filled areas — use rich black mix (C:60 M:40 Y:40 K:100). Avoid neon or out-of-gamut colours.\n— Line weights: minimum 0.25pt at final print size — no hairlines thinner than this.\n— Paper simulation texture: must not produce a visible border — ensure it bleeds fully to the frame edge.",
    alternativePhrasing:
      "Print safe: 5mm safe zone inside trim, 3mm bleed outside trim, rich black for large fills, minimum 0.25pt lines, no out-of-gamut colour, full-bleed texture.",
    applicableTypes:
      "All print production specs — Hero Paper, Decorative Paper, Journal Card, Notepaper, Endpaper, Washi Tape.",
    canonDependencyHint:
      "None — technical constraints apply regardless of canon dependency level.",
    priorityNote:
      "Always inject. Technical constraints have higher authority than aesthetic preferences when they conflict. Inject in shared_prompt and reinforce with negative_prompt entries.",
    goodOutputIndicators:
      "Composition has natural breathing room inside the safe zone — key elements are not crowded against the edge. No essential detail is dangerously close to trim. Colours read as rich without neon or out-of-gamut quality. Textures extend fully to the frame edge without visible borders.",
    badOutputIndicators:
      "Key illustration elements bleed off the edge or sit within 3mm of trim. Pure black (#000000) used for large filled areas. Paper simulation texture ends before the image edge, creating a visible band of white or a frame. Hairline details below 0.25pt that will disappear or break at 300 DPI.",
    moduleInteractions:
      "Takes precedence over all other modules when aesthetic and production requirements conflict. Combine with negative_prompt content from this module for maximum effect. Pair with Negative Space module for specs with high writing_space_percent requirements.",
  },
  "Negative Space": {
    usageContext:
      "Attach to any spec where the generator tendency to over-fill the frame needs to be suppressed — common with Hero Papers, Notepaper, and any spec with a writing_space_percent above 40.",
    primaryContent:
      "Do not fill the composition. This is not a failure to create — it is a compositional decision. White space, or near-white space, is as intentional as any illustrated element. The journaling area must be genuinely usable: at minimum 20% of the page area at readable contrast, free of illustration, pattern, or texture that would impede writing. Resist the impulse to fill every corner. Let the paper breathe. The illustrated area and the empty area should have a deliberate, considered relationship — not an accidental one.",
    alternativePhrasing:
      "Negative space is a deliberate compositional choice. Minimum 20% usable writing area, free of competing visual elements. Empty space is designed, not absent. Do not fill every corner.",
    applicableTypes:
      "Hero Paper, Notepaper, any spec with writing_space_percent set to 40 or above.",
    canonDependencyHint:
      "None — negative space requirements are driven by the spec's writing_space_percent field, not by canon content.",
    priorityNote:
      "Attach when writing_space_percent is 40 or above. The higher the writing_space_percent, the more important this module becomes — at 70%+, also add the threshold to the negative_prompt.",
    goodOutputIndicators:
      "The journaling area is genuinely clear — light enough for dark ink writing, free of competing illustration or texture. The illustrated area and the empty area have an intentional compositional relationship. The empty space reads as a design decision, not as an area the generator failed to fill.",
    badOutputIndicators:
      "Every available surface is covered with illustration, pattern, or texture. The supposed journaling area has visual elements that would make writing difficult. The composition feels cramped, anxious, or over-worked. No breathing room.",
    moduleInteractions:
      "Use alongside Technical Constraint for full print-safe setup. Can be used independently. Not appropriate for purely decorative components (Washi Tape, Decorative Paper) where full-field fill is the design intent. For specs with writing_space_percent above 70%, also add explicit exclusion language to the negative_prompt injection.",
  },
  "Style Reference": {
    usageContext:
      "Attach when the visual reference for this spec is a specific historical period, art movement, or named artistic tradition. Most useful for the first Hero Paper in a new collection — it sets the visual baseline that all subsequent specs should coordinate with.",
    primaryContent:
      "[CUSTOMISE: Replace bracketed sections with your specific reference.]\n\nVisual reference: the natural history illustration tradition of the late 18th and early 19th century — specifically the work of the Kew Gardens botanical artists (William Hooker, Walter Hood Fitch). Key qualities: meticulous botanical accuracy combined with compositional elegance; the specimen as both scientific record and aesthetic object; clean vellum ground beneath colour-washed specimens; plates sized for folio presentation.\n\nAvoid: the looser, more impressionistic style of later botanical art (early 20th century onwards). Maintain the structured, plate-based composition of the earlier period.",
    alternativePhrasing:
      "Late 18th / early 19th century Kew botanical illustration: meticulous accuracy, compositional elegance, vellum ground, folio format. Avoid impressionistic or loose rendering characteristic of later periods.",
    applicableTypes:
      "Hero Paper, Endpaper, any spec that establishes or references the collection's core visual register.",
    canonDependencyHint:
      "None — style references operate at the visual language level, independent of specific canon records.",
    priorityNote:
      "High priority — inject in shared_prompt before component-specific content. The style reference sets the visual baseline from which all other decisions flow. Replace the bracketed placeholder text with your actual reference before attaching.",
    goodOutputIndicators:
      "The visual reference period or movement is clearly recognisable to a knowledgeable viewer. Illustration decisions (composition, palette, rendering technique, level of detail) are period-appropriate and internally consistent. The result reads as a genuine engagement with the reference, not a pastiche or surface-level imitation.",
    badOutputIndicators:
      "The style reference is generic or unidentifiable — it could be 'antique' from any period. Period accuracy is superficial (correct colour palette but wrong rendering technique or composition approach). The result looks like a digital rendering with a period-appropriate colour grade applied, rather than an illustration produced within the tradition.",
    moduleInteractions:
      "Pairs with Atmospheric Grounding (sets mood) and Material World (sets physical reality). Style Reference sets the visual language — it should be the first module injected in shared_prompt. Update the placeholder text for each new collection; never attach the default template without customisation.",
  },
};

const DEFAULT_MODULE_SUGGESTIONS: ModuleSuggestions = {
  usageContext: "Describe when this module should be attached to a spec — which component types benefit from it, at what stage of production it is most useful, and whether it should be combined with other modules.",
  primaryContent: "Write the full prompt content that will be injected verbatim into compiled prompts. This text is passed directly to the image generator — write it as if you are briefing an expert illustrator, not explaining it to the module system.",
  alternativePhrasing: "Provide a condensed or alternative version of the primary content — useful when the full module would overload the prompt context, or as a quick reference summary.",
  applicableTypes: "List the component types (Hero Paper, Journal Card, Notepaper, etc.) that this module is designed for. Note any types where it should NOT be attached.",
  canonDependencyHint: "Describe the canon dependency level (None / Supports Canon / Canon Reference / Canon Defining) that this module is designed to accompany. Helps editors know when to include it.",
  priorityNote: "Describe where this module should appear in the injection order — first (highest priority), middle, or last. Note any ordering dependencies with other modules.",
  goodOutputIndicators: "Write 3–5 specific, observable qualities that indicate this module is working correctly. Frame as things you can look for in the generated image.",
  badOutputIndicators: "Write 3–5 specific failure signals that indicate the module is not working or conflicting with another prompt element. These are your rejection criteria.",
  moduleInteractions: "Describe how this module interacts with other modules — which it pairs well with, which it can conflict with, and how to resolve conflicts.",
};

// ── Section forms ─────────────────────────────────────────────────────────────

function IdentitySection({ f, set, onFocus }: { f: FormState; set: (k: keyof FormState, v: string) => void; onFocus?: OnFieldFocus }) {
  const suggest = MODULE_SUGGESTIONS[f.moduleType] ?? DEFAULT_MODULE_SUGGESTIONS;
  const hasSuggestions = !!f.moduleType;

  return (
    <div className="space-y-4">
      <Field label="Module Name" required hint="A clear, descriptive name — editors see this when attaching modules to specs.">
        <input
          value={f.name}
          onChange={e => set("name", e.target.value)}
          onFocus={() => onFocus?.("name", "Module Name")}
          className={inputCls}
          placeholder="e.g. Atmospheric Grounding — Victorian Garden World"
        />
      </Field>
      <Field label="Module Type" required hint="The primary function this module performs in a compiled prompt.">
        <select value={f.moduleType} onChange={e => set("moduleType", e.target.value)} className={selectCls}>
          <option value="">Select type…</option>
          <option>Atmospheric Grounding</option>
          <option>Material World</option>
          <option>Canon Anchor</option>
          <option>Sensory Layer</option>
          <option>Narrative Voice</option>
          <option>Technical Constraint</option>
          <option>Negative Space</option>
          <option>Style Reference</option>
        </select>
      </Field>
      <Field
        label="Usage Context"
        required
        hint="When should editors attach this module? Which specs benefit from it?"
        action={hasSuggestions ? <SuggestChip onClick={() => set("usageContext", suggest.usageContext)} /> : undefined}
      >
        <textarea
          value={f.usageContext}
          onChange={e => set("usageContext", e.target.value)}
          onFocus={() => onFocus?.("usageContext", "Usage Context")}
          className={textareaCls}
          rows={3}
          placeholder="Describe which specs this module is for, when to attach it, and any prerequisites…"
        />
      </Field>
    </div>
  );
}

function ContentSection({ f, set, onFocus }: { f: FormState; set: (k: keyof FormState, v: string) => void; onFocus?: OnFieldFocus }) {
  const suggest = MODULE_SUGGESTIONS[f.moduleType] ?? DEFAULT_MODULE_SUGGESTIONS;
  const hasSuggestions = !!f.moduleType;

  return (
    <div className="space-y-4">
      <Field
        label="Primary Content"
        required
        hint="The actual prompt text — this is injected verbatim into compiled prompts. Write it as a brief to an expert illustrator."
        action={hasSuggestions ? <SuggestChip onClick={() => set("primaryContent", suggest.primaryContent)} /> : undefined}
      >
        <textarea
          value={f.primaryContent}
          onChange={e => set("primaryContent", e.target.value)}
          onFocus={() => onFocus?.("primaryContent", "Primary Content")}
          className={`${textareaCls} font-mono text-xs leading-relaxed`}
          rows={10}
          placeholder="Write the prompt content exactly as it should appear in the compiled prompt…"
        />
      </Field>
      <Field
        label="Alternative / Condensed Phrasing"
        hint="A shorter version for when context length is limited, or a quick reference summary."
        action={hasSuggestions ? <SuggestChip onClick={() => set("alternativePhrasing", suggest.alternativePhrasing)} /> : undefined}
      >
        <textarea
          value={f.alternativePhrasing}
          onChange={e => set("alternativePhrasing", e.target.value)}
          onFocus={() => onFocus?.("alternativePhrasing", "Alternative Phrasing")}
          className={textareaCls}
          rows={3}
          placeholder="Condensed version or key phrases that capture the module's essence in fewer words…"
        />
      </Field>
      <Field label="Injection Point" required hint="Where in the compiled prompt this module's content belongs.">
        <select value={f.injectionPoint} onChange={e => set("injectionPoint", e.target.value)} className={selectCls}>
          <option value="">Select injection point…</option>
          <option value="shared_prompt">shared_prompt — applies to all sides of the component</option>
          <option value="front_prompt">front_prompt — applies to the front face only</option>
          <option value="negative_prompt">negative_prompt — content to suppress or exclude</option>
          <option value="shared_prompt + negative_prompt">shared_prompt + negative_prompt — positive framing and exclusion</option>
        </select>
      </Field>
    </div>
  );
}

function TargetingSection({ f, set, onFocus }: { f: FormState; set: (k: keyof FormState, v: string) => void; onFocus?: OnFieldFocus }) {
  const suggest = MODULE_SUGGESTIONS[f.moduleType] ?? DEFAULT_MODULE_SUGGESTIONS;
  const hasSuggestions = !!f.moduleType;

  return (
    <div className="space-y-4">
      <Field
        label="Applicable Component Types"
        required
        hint="Which component types should editors attach this module to? Note any types where it should NOT be used."
        action={hasSuggestions ? <SuggestChip onClick={() => set("applicableTypes", suggest.applicableTypes)} /> : undefined}
      >
        <textarea
          value={f.applicableTypes}
          onChange={e => set("applicableTypes", e.target.value)}
          onFocus={() => onFocus?.("applicableTypes", "Applicable Component Types")}
          className={textareaCls}
          rows={3}
          placeholder="e.g. Hero Paper, Journal Card — not Washi Tape or Decorative Paper…"
        />
      </Field>
      <Field
        label="Canon Dependency Hint"
        hint="What canon dependency level (None / Supports / Reference / Defining) does this module work best with?"
        action={hasSuggestions ? <SuggestChip onClick={() => set("canonDependencyHint", suggest.canonDependencyHint)} /> : undefined}
      >
        <textarea
          value={f.canonDependencyHint}
          onChange={e => set("canonDependencyHint", e.target.value)}
          onFocus={() => onFocus?.("canonDependencyHint", "Canon Dependency Hint")}
          className={textareaCls}
          rows={2}
          placeholder="Describe the canon dependency level this module is designed to accompany…"
        />
      </Field>
      <Field
        label="Priority / Injection Order"
        required
        hint="Where in the injection order does this module belong? Any ordering dependencies with other modules?"
        action={hasSuggestions ? <SuggestChip onClick={() => set("priorityNote", suggest.priorityNote)} /> : undefined}
      >
        <textarea
          value={f.priorityNote}
          onChange={e => set("priorityNote", e.target.value)}
          onFocus={() => onFocus?.("priorityNote", "Priority / Injection Order")}
          className={textareaCls}
          rows={2}
          placeholder="e.g. Inject first in shared_prompt, before component-specific content…"
        />
      </Field>
    </div>
  );
}

function QualitySection({ f, set, onFocus }: { f: FormState; set: (k: keyof FormState, v: string) => void; onFocus?: OnFieldFocus }) {
  const suggest = MODULE_SUGGESTIONS[f.moduleType] ?? DEFAULT_MODULE_SUGGESTIONS;
  const hasSuggestions = !!f.moduleType;

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg text-xs" style={{ background: "rgba(200,117,96,0.06)", color: "#92400E", border: "1px solid rgba(200,117,96,0.2)" }}>
        <strong>Review criteria for this module.</strong> When you generate with this module attached, these indicators tell you whether it's working — and when to reject and retry.
      </div>
      <Field
        label="Good Output Indicators"
        required
        hint="3–5 specific, observable qualities that confirm this module is working correctly."
        action={hasSuggestions ? <SuggestChip onClick={() => set("goodOutputIndicators", suggest.goodOutputIndicators)} /> : undefined}
      >
        <textarea
          value={f.goodOutputIndicators}
          onChange={e => set("goodOutputIndicators", e.target.value)}
          onFocus={() => onFocus?.("goodOutputIndicators", "Good Output Indicators")}
          className={textareaCls}
          rows={5}
          placeholder="What does a good result look like? List observable qualities you can check in the generated image…"
        />
      </Field>
      <Field
        label="Bad Output Indicators — Reject If Present"
        required
        hint="3–5 specific failure signals. If you see these, the module isn't working — retry or investigate."
        action={hasSuggestions ? <SuggestChip onClick={() => set("badOutputIndicators", suggest.badOutputIndicators)} /> : undefined}
      >
        <textarea
          value={f.badOutputIndicators}
          onChange={e => set("badOutputIndicators", e.target.value)}
          onFocus={() => onFocus?.("badOutputIndicators", "Bad Output Indicators")}
          className={textareaCls}
          rows={5}
          placeholder="What does a bad result look like? List specific failure signals that trigger a reject…"
        />
      </Field>
      <Field
        label="Module Interactions"
        hint="Which modules pair well with this one? Which can conflict? How should conflicts be resolved?"
        action={hasSuggestions ? <SuggestChip onClick={() => set("moduleInteractions", suggest.moduleInteractions)} /> : undefined}
      >
        <textarea
          value={f.moduleInteractions}
          onChange={e => set("moduleInteractions", e.target.value)}
          onFocus={() => onFocus?.("moduleInteractions", "Module Interactions")}
          className={textareaCls}
          rows={4}
          placeholder="Describe pairings, conflicts, and override rules when this module is combined with others…"
        />
      </Field>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function NewPromptModuleFlow() {
  const [, navigate] = useLocation();
  const { selectedWorldId } = useEditorial();
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [activeSection, setActiveSection] = useState(0);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeCoField, setActiveCoField] = useState<ApplyTarget>({ key: "name", label: "Module Name" });
  const copilotSession = useRef(`copilot-prompt-module-new-${selectedWorldId ?? "unselected"}-${Math.random().toString(36).slice(2)}`);
  const sectionTargets: ApplyTarget[] = [
    { key: "name", label: "Module Name" },
    { key: "primaryContent", label: "Primary Content" },
    { key: "applicableTypes", label: "Applicable Component Types" },
    { key: "goodOutputIndicators", label: "Good Output Indicators" },
  ];
  useEffect(() => setActiveCoField(sectionTargets[activeSection]!), [activeSection]);

  const set = (k: keyof FormState, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const checks = SECTIONS.map(s => {
    const items = s.checks(form);
    const done = items.filter(c => c.done).length;
    return { ...s, items, done, total: items.length };
  });
  const totalDone = checks.reduce((a, c) => a + c.done, 0);
  const totalItems = checks.reduce((a, c) => a + c.total, 0);

  const canSubmit = !!(form.name.trim() && form.moduleType && selectedWorldId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const content = assembleContent(form);
      return apiFetch<{ prompt_module: { id: string } }>("/v1/editorial/prompt-modules", {
        method: "POST",
        body: JSON.stringify({
          world_id: selectedWorldId,
          name: form.name.trim(),
          content,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Prompt module created" });
      navigate("/super/worldsmith/editorial/modules");
    },
    onError: () => {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleFieldFocus: OnFieldFocus = (field, label) => setActiveCoField({ key: field, label });
  const sectionComponents = [
    <IdentitySection f={form} set={set} onFocus={handleFieldFocus} />,
    <ContentSection f={form} set={set} onFocus={handleFieldFocus} />,
    <TargetingSection f={form} set={set} onFocus={handleFieldFocus} />,
    <QualitySection f={form} set={set} onFocus={handleFieldFocus} />,
  ];

  return (
    <div className="flex h-dvh bg-gray-50">
      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside className="w-64 flex-none bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 pt-5 pb-4 border-b border-gray-100">
          <button
            onClick={() => navigate("/super/worldsmith/editorial/modules")}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3"
          >
            <ArrowLeft className="w-3 h-3" /> Prompt Modules
          </button>
          <div className="flex items-center gap-2">
            <Puzzle className="w-4 h-4" style={{ color: CLAY }} />
            <span className="font-semibold text-sm text-gray-900">New Prompt Module</span>
          </div>
        </div>

        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-700">Completeness</span>
            <span className="text-xs text-gray-400 ml-auto">{totalDone}/{totalItems}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${totalItems > 0 ? (totalDone / totalItems) * 100 : 0}%`, background: CLAY }}
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {checks.map((s, i) => {
            const Icon = s.icon;
            const active = i === activeSection;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(i)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                style={{ background: active ? "rgba(200,117,96,0.06)" : "transparent" }}
              >
                <ProgressRing done={s.done} total={s.total} size={28} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: active ? CLAY : "#374151" }}>{s.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{s.done}/{s.total} complete</p>
                </div>
                {active && <div className="ml-auto w-1 h-6 rounded-full" style={{ background: CLAY }} />}
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">This section</p>
          {checks[activeSection].items.map((item, i) => (
            <div key={i} className="flex items-center gap-2 py-1">
              {item.done
                ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: CLAY }} />
                : <Circle className="w-3.5 h-3.5 flex-shrink-0 text-gray-300" />}
              <span className="text-xs" style={{ color: item.done ? "#374151" : "#9CA3AF" }}>{item.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main content ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200 flex-none">
          <div>
            <h1 className="text-base font-semibold text-gray-900">
              {SECTIONS[activeSection].label}
            </h1>
            {form.name && (
              <p className="text-xs text-gray-400 mt-0.5">{form.name}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!selectedWorldId && (
              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
                Select a world in the world picker to save
              </p>
            )}
            <div className="flex items-center gap-2 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5">
              <span>Step {activeSection + 1} of {SECTIONS.length}</span>
            </div>
            <button
              onClick={() => setCopilotOpen(open => !open)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors"
              style={copilotOpen ? { background: INK, color: "white", borderColor: INK } : { color: "#4B5563", borderColor: "#E5E7EB" }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: copilotOpen ? CLAY : undefined }} />
              Co-write
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!canSubmit || saveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: INK }}
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Puzzle className="w-3.5 h-3.5" />}
              Create Module
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto min-w-0">
            <div className={copilotOpen ? "max-w-2xl px-8 py-8" : "max-w-2xl mx-auto px-8 py-8"}>
              {sectionComponents[activeSection]}
            </div>
          </div>
          <EditorialCopilot
            isOpen={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            surface="prompt_module"
            worldId={selectedWorldId}
            storageKey={copilotSession.current}
            title="Prompt Module Copilot"
            greeting={`I can help write ${form.name ? `"${form.name}"` : "this prompt module"} — develop prompt content, targeting, quality checks, and module interactions without losing your place.`}
            activeTarget={activeCoField}
            context={{ section: SECTIONS[activeSection].label, draft: form }}
            onApply={(text, key) => set(key as keyof FormState, text.trim())}
            className="max-xl:absolute max-xl:right-3 max-xl:top-3 max-xl:z-30"
          />
        </div>

        <div className="flex items-center justify-between px-8 py-4 bg-white border-t border-gray-200 flex-none">
          <button
            onClick={() => setActiveSection(i => Math.max(0, i - 1))}
            disabled={activeSection === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Previous
          </button>
          {activeSection < SECTIONS.length - 1 ? (
            <button
              onClick={() => setActiveSection(i => i + 1)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm text-white rounded-lg transition-colors"
              style={{ background: CLAY }}
            >
              Next: {SECTIONS[activeSection + 1].label}
            </button>
          ) : (
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!canSubmit || saveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: INK }}
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Puzzle className="w-3.5 h-3.5" />}
              Create Module
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
