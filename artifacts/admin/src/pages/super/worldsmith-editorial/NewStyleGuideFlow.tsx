/**
 * NewStyleGuideFlow — progressive 4-section creation form for Style Guides.
 * Mirrors the NewSpecFlow pattern: progress sidebar, completion scoring,
 * Suggest chips per field, assembled content document on save.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2, Circle, Loader2, ArrowLeft,
  Layers, Palette, Type, ShieldOff, FileText, Save, Trash2, Sparkles,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useEditorial } from "@/contexts/EditorialContext";
import { useToast } from "@/hooks/use-toast";
import { EditorialCopilot } from "@/components/EditorialCopilot";
import type { ApplyTarget } from "@/components/CopilotPanel";
import { PaletteLibraryPicker, paletteReferenceText } from "@/components/PaletteLibraryPicker";

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  // Identity
  name: string;
  guideType: string;
  scopeDescription: string;
  // Visual Language
  colourPalette: string;
  illustrationStyle: string;
  textureAndMaterials: string;
  // Typography & Tone
  typefaceDirection: string;
  typeHierarchy: string;
  proseVoice: string;
  register: string;
  referencePhrases: string;
  wordsToAvoid: string;
  // Constraints
  negativeConstraints: string;
  productionRules: string;
}

const EMPTY: FormState = {
  name: "",
  guideType: "",
  scopeDescription: "",
  colourPalette: "",
  illustrationStyle: "",
  textureAndMaterials: "",
  typefaceDirection: "",
  typeHierarchy: "",
  proseVoice: "",
  register: "",
  referencePhrases: "",
  wordsToAvoid: "",
  negativeConstraints: "",
  productionRules: "",
};

// ── Content assembler ─────────────────────────────────────────────────────────
// Builds the plain-text `content` field passed verbatim to the compiler.

function assembleContent(f: FormState): string {
  const lines: string[] = [];
  const section = (title: string) => lines.push(`\n## ${title}`);
  const field = (label: string, value: string) => {
    if (value.trim()) {
      lines.push(`\n### ${label}`);
      lines.push(value.trim());
    }
  };

  lines.push(`STYLE GUIDE: ${f.name}`);
  if (f.guideType) lines.push(`Type: ${f.guideType}`);
  if (f.scopeDescription) lines.push(`Scope: ${f.scopeDescription}`);

  section("Visual Language");
  field("Colour Palette", f.colourPalette);
  field("Illustration Style", f.illustrationStyle);
  field("Texture & Materials", f.textureAndMaterials);

  section("Typography & Tone");
  field("Typeface Direction", f.typefaceDirection);
  field("Type Hierarchy", f.typeHierarchy);
  field("Prose Voice", f.proseVoice);
  if (f.register) lines.push(`Register: ${f.register}`);
  field("Reference Phrases", f.referencePhrases);
  field("Words & Phrases to Avoid", f.wordsToAvoid);

  section("Constraints");
  field("Negative Constraints (Do Not)", f.negativeConstraints);
  field("Production Rules", f.productionRules);

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
      { label: "Guide name", done: !!f.name.trim() },
      { label: "Guide type", done: !!f.guideType },
    ],
  },
  {
    id: "visual",
    label: "Visual Language",
    icon: Palette,
    checks: f => [
      { label: "Colour palette", done: !!f.colourPalette.trim() },
      { label: "Illustration style", done: !!f.illustrationStyle.trim() },
    ],
  },
  {
    id: "typography",
    label: "Typography & Tone",
    icon: Type,
    checks: f => [
      { label: "Typeface direction", done: !!f.typefaceDirection.trim() },
      { label: "Prose voice", done: !!f.proseVoice.trim() },
    ],
  },
  {
    id: "constraints",
    label: "Constraints",
    icon: ShieldOff,
    checks: f => [
      { label: "Negative constraints", done: !!f.negativeConstraints.trim() },
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
const textareaCls = `${inputCls} resize-y min-h-[76px]`;
const selectCls = `${inputCls} bg-white`;

// ── Type-specific suggestion templates ────────────────────────────────────────

type GuideSuggestions = {
  scopeDescription: string;
  colourPalette: string;
  illustrationStyle: string;
  textureAndMaterials: string;
  typefaceDirection: string;
  typeHierarchy: string;
  proseVoice: string;
  referencePhrases: string;
  wordsToAvoid: string;
  negativeConstraints: string;
  productionRules: string;
};

const GUIDE_SUGGESTIONS: Record<string, GuideSuggestions> = {
  "Visual Language": {
    scopeDescription: "Defines the complete visual register for this world — colour, illustration approach, texture, and atmosphere. Referenced by all production specs.",
    colourPalette:
      "Dominant: warm ochre and aged cream (Pantone 7503 / #EBE2C8). Accent: Victorian bottle green and burnt sienna (Pantone 574 / #3D6B3A, Pantone 1525 / #C85A20). Neutrals: charcoal ink (#2A2A2A) and soft sepia (#8B6E52).\n\nPaper stock should never read as pure white — always carry a warm cream or aged tint. Avoid cool blues, electric tones, or fully saturated primaries.",
    illustrationStyle:
      "Hand-engraved copper plate aesthetic with fine hatching and cross-hatching for shadow and depth. Line weights varied: 0.25pt for detail, 0.75pt for outlines, 1.5pt for borders and frames. Botanical or archival accuracy is paramount — specimens should be identifiable. All illustration must read as archival and hand-produced; no photographic or digital rendering.",
    textureAndMaterials:
      "Aged wove paper grain at 40–60% opacity as a base layer. Foxing and water-stain marks applied selectively to corners and margins — never obscuring primary illustration. Ink bleeding at extremities suggests printing from an original block. Slight letterpress impression on border elements where appropriate. Smooth digital gradients are never used.",
    typefaceDirection:
      "Primary: Cormorant Garamond or Playfair Display — old-style serif with pronounced stroke contrast. Annotations and labels: a condensed or small-caps variant of the primary. Numerals: old-style figures only. Display headlines: tightly tracked Playfair Display SC. No geometric sans, rounded fonts, or any typeface that reads as modern.",
    typeHierarchy:
      "H1 Display: Playfair Display SC, 24pt+, +200 tracking, Ink Navy. H2 Section: Cormorant Garamond italic, 16pt, +80 tracking. Body: Cormorant Garamond regular, 11pt, 1.5× leading. Caption: Cormorant SC 8pt, +150 tracking. Maximum two typefaces per composition.",
    proseVoice:
      "The voice of a Victorian naturalist-scholar — learned, precise, and quietly passionate. Sentences are structured and complex but never opaque. Observation is celebrated; enthusiasm present but restrained. The author has spent decades in the field and knows the names of things.",
    referencePhrases:
      "\"A remarkable specimen, noteworthy for its…\" | \"The collector will observe that…\" | \"Long prized by those who appreciate…\" | \"Drawn from the archive of…\" | \"Presented here for the first time in catalogue form…\"",
    wordsToAvoid:
      "stunning, amazing, beautiful (too informal for this register), digital, modern, sleek, clean, minimal, vibrant (wrong world), [brand name] (avoid self-reference in voice)",
    negativeConstraints:
      "No sans-serif typography in primary roles. No pure white (#FFFFFF) backgrounds. No photographic realism — all imagery reads as illustrated. No colour blocking or flat design. No UI or web design conventions (rounded buttons, card shadows). No contemporary stock imagery aesthetics.",
    productionRules:
      "All artwork at 300 DPI minimum for print, 144 DPI for digital. Colour mode: CMYK for print (ISO Coated v2 profile), convert to sRGB for digital. Bleed: 3mm on all edges. Safe zone: 5mm inside cut line. Paper simulation layer reduced or removed for digital-only SKUs. All artwork approved in greyscale — it must hold without colour.",
  },
  "Illustration Style": {
    scopeDescription: "Defines the illustration approach, rendering technique, and visual conventions for all original artwork in this world.",
    colourPalette:
      "Monochromatic ink wash as the primary working palette — sepia brown (#8B6E52) to deep charcoal (#2A2A2A), with a single accent colour per collection. Warm neutrals for paper simulation. Reserve colour for annotation and taxonomic labelling only.",
    illustrationStyle:
      "Botanical line illustration in the tradition of 18th–19th century natural history publishing. Stippling for texture, hatching for volume — solid fill avoided in favour of linework throughout. Each specimen presented with scientific care: include root systems for botanical subjects, show multiple growth stages where relevant. Scale bar or coin reference where appropriate to convey size.",
    textureAndMaterials:
      "Hot press watercolour paper simulation with slight tooth beneath linework. Watercolour wash where colour appears — never flat digital fill. Pencil underdrawing visible in naturalistic areas. Ink should have the slight variation of a dip pen, not a uniform vector line.",
    typefaceDirection:
      "Annotation text should feel handwritten or hand-set: Cormorant Garamond italic for Latin names, small caps for common names. Specimen labels in a condensed serif reminiscent of Victorian catalogue type. Never set annotations in a sans-serif.",
    typeHierarchy:
      "Scientific names: Cormorant Garamond italic, 9pt. Common names: small caps, 8pt. Catalogue numbers: tabular figures, 7pt monospace. Page headers: display serif, small caps, tracked +150.",
    proseVoice:
      "Precise and taxonomic — the language of the field guide and museum label. Careful observation recorded without embellishment. Numbers and measurements cited where known. The author is a scientist first, a writer second.",
    referencePhrases:
      "\"Collected at altitude…\" | \"Specimen no. [xxx], donated by…\" | \"First described by [naturalist], [year]\" | \"Habitat: damp woodland margins, preferring…\" | \"Distinguishing features: …\"",
    wordsToAvoid:
      "cute, pretty, artistic, creative, beautiful as a standalone descriptor — always qualify. Colloquial names without scientific counterpart. Sensational language of any kind.",
    negativeConstraints:
      "No digital rendering effects (glow, outer glow, drop shadow, bevel). No symmetrical or mechanical patterns — all organic forms must show natural variation. No photography or photorealistic rendering. No flat colour fields. No illustration that could be mistaken for a modern stock vector.",
    productionRules:
      "Line art: 600 DPI minimum for fine linework at final print size. Export as TIFF with transparency for overlay and layering use. Colour variants derived from greyscale master — do not re-illustrate in colour. Print test on uncoated stock before final approval. All artwork approved by the creative director before handoff to print.",
  },
  "Colour & Palette": {
    scopeDescription: "The definitive colour reference for this world — all production work must draw from this palette.",
    colourPalette:
      "Primary palette — 4 named colours with clear hierarchy:\n\n1. Thornwood Green (dominant): C:72 M:28 Y:100 K:18 / #3D6B3A\n2. Foxed Cream (background): C:0 M:5 Y:18 K:8 / #EBE2C8\n3. Iron Gall (ink/text): C:0 M:0 Y:0 K:88 / #2A2A2A\n4. Amber Seal (accent): C:0 M:38 Y:88 K:8 / #EAA020\n\nExtended palette: 2–3 tints and shades of each primary. All colours tested on warm-cream substrate, not pure white. Both digital hex and print CMYK values required for every colour.",
    illustrationStyle:
      "Palette-forward compositions — colour carries the weight of atmospheric communication. All illustration and pattern should demonstrate palette relationships in context, not merely display swatches. At minimum, show the palette working across a full page spread.",
    textureAndMaterials:
      "Colours must be verified on both uncoated (matte) and coated print stock before approval. All palette combinations tested in greyscale — the hierarchy must hold without colour. Digital colour must be visually matched to print target, not assumed equivalent.",
    typefaceDirection:
      "Typography must remain legible on all palette combinations. Dark text on light fields and reversed light text on dark fields — both tested against every primary colour. Minimum WCAG AA contrast ratio for digital contexts.",
    typeHierarchy:
      "Specify text colour for each context: body on paper field, reversed on dark primary, captions on mid-tone, headings on accent. No colour combination used in typography that fails AA contrast standard.",
    proseVoice:
      "Palette rationale reads like a colour theory brief: clear, precise, and rooted in natural or archival sources. Each colour name should evoke its origin — not its hex code.",
    referencePhrases:
      "\"[Colour name] — drawn from [natural/archival source]…\" | \"Used at [x]% of compositions as [dominant/accent/neutral]…\" | \"Not to be combined with…\" | \"At reduced opacity: [name of tint]…\"",
    wordsToAvoid:
      "vibrant (too casual in this context — use 'saturated'), bold (overused — specify the quality), pop (wrong register). Replace general colour adjectives with measured specifications wherever possible.",
    negativeConstraints:
      "No colours outside the defined palette in production work without explicit approval. No RGB-only colour specifications — CMYK equivalents required for all production colours. No colour combinations that produce muddy neutrals without testing. No palette combinations that fail AA contrast standards for text use.",
    productionRules:
      "Colour profiles: ISO Coated v2 for European print, SWOP for US print. Digital: sRGB IEC61966-2.1. Pantone references alongside CMYK where print budget allows spot colour. Bleed areas must carry full palette colour — no white bleed strips. All files delivered with embedded colour profile.",
  },
  "Typography": {
    scopeDescription: "Defines the complete type system for this world — typefaces, scales, hierarchy, and usage rules across all production contexts.",
    colourPalette:
      "Ink colours for text: deep charcoal for body (#2C2C2C — never pure #000000), Ink Navy for headings (#1B2A4A), 70% tint of body ink for captions and labels (#6B6B6B). Accent colour for links and interactive elements. Reversed text on dark fields must meet WCAG AA on every palette colour.",
    illustrationStyle:
      "Typography as the primary visual element in this guide. Compositions must demonstrate typeface pairing, scale relationships, and the visual rhythm of the type system at work. Show at minimum three text sizes in a realistic page context.",
    textureAndMaterials:
      "Letterpress or foil treatment considered for display headlines in premium contexts. Screen-print texture appropriate for secondary headers. All body type legibility tested on textured uncoated stock at 8pt — the minimum viable size.",
    typefaceDirection:
      "Primary (body + headers): Cormorant Garamond Regular, Bold, Italic — old-style serif with pronounced stroke contrast.\nSecondary (UI, annotation, captions): Source Sans Pro Regular and SemiBold.\nDisplay (large headers): Playfair Display SC.\nSystem fallback stack: Georgia, 'Times New Roman', serif.\n\nNever use: Comic Sans, Arial, Helvetica Neue as sole typeface, or any geometric sans in a primary role.",
    typeHierarchy:
      "Display H1: Playfair Display SC, 48pt+, tracked +100, colour: Ink Navy.\nSection H2: Cormorant Garamond Italic, 24pt, tracked +80.\nSub-head H3: Source Sans Pro SemiBold, 16pt.\nBody: Cormorant Garamond Regular, 11–12pt, leading 1.5×.\nCaption: Source Sans Pro Regular, 8pt, tracked +80.\nMicro/legal: Source Sans Pro Regular, 7pt, tracked +100.",
    proseVoice:
      "The typography guide voice is technical and precise — this is a standards document, not an invitation. Every specification must be immediately actionable without further interpretation. Describe, do not suggest.",
    referencePhrases:
      "\"Use at [x]pt with [y] tracking…\" | \"Pair with [font name] only at secondary level…\" | \"Never set below [x]pt in this context…\" | \"In this context, use [weight], not [weight]…\"",
    wordsToAvoid:
      "feel, look, nice, clean — too subjective. Replace with measurable specifications. Avoid 'a bit' or 'slightly' — quantify all adjustments. No designer slang (widows, orphans — define if used).",
    negativeConstraints:
      "No system fonts in primary typeface roles. No faux bold or faux italic — use only true font weights from the defined families. No letter-spacing below -5 units (optical tightening only, never manual tracking compression). No justified body copy. No text set on busy image backgrounds without a protective scrim, veil, or text shadow. No typeface outside the defined system without creative director approval.",
    productionRules:
      "All fonts licensed for both print and digital use — confirm license scope before handoff. Embed all fonts in PDF exports; outline type in artwork files. Minimum body text size: 9pt on uncoated stock, 8pt on coated. Maximum line length: 65–75 characters for body text. All type approved at 100% scale on calibrated display before print sign-off.",
  },
  "Tone & Voice": {
    scopeDescription: "Defines the editorial voice, register, and language rules for all written content associated with this world.",
    colourPalette:
      "Voice palette: warm, authoritative, quietly wondering. If this voice had a colour, it would be the warm amber of a library lamp at dusk — present, considered, unhurried.",
    illustrationStyle:
      "Illustrations paired with this voice should feel observational — as if caught in the moment of discovery, not composed for effect. Avoid stock imagery clichés and anything that reads as commercially staged.",
    textureAndMaterials:
      "Voice texture: the feel of a letter written with a good pen on heavy paper — the writer has thought before setting the nib down. Each sentence has been chosen.",
    typefaceDirection:
      "Typography that accompanies this voice should reinforce its register: a classical serif with genuine historical authority, never a geometric or humanist sans that reads as contemporary or casual.",
    typeHierarchy:
      "Headlines in this voice: declarative statements or archival titles — never questions or commands. Sub-heads: descriptive, noun-first. Body: full sentences. No bullet-pointed prose; the voice earns its structure through syntax, not formatting.",
    proseVoice:
      "A voice of cultivated expertise — one who has spent decades becoming fluent in this particular world. Sentences are precise but warm; the writer knows their subject completely and is generous with that knowledge. First person used sparingly and with intention. Third person for descriptive passages. Second person only when directly addressing the reader with an invitation — never as a command.",
    referencePhrases:
      "\"For those who find themselves drawn to…\" | \"The careful observer will notice…\" | \"This is not a world for haste.\" | \"There is much here that rewards patience.\" | \"A record of the things that endure.\" | \"In this world, [thing] means [meaning].\"",
    wordsToAvoid:
      "amazing, stunning, gorgeous, incredible, unique (overused superlatives that lose meaning), shop now, limited time, don't miss (commercial register), just (minimising), very (strengthless intensifier), utilize (use 'use'), leverage, synergy, journey (wrong register), curated without specificity",
    negativeConstraints:
      "No sales or marketing register in world-building or editorial content. No second-person imperative (\"Do this now!\", \"Get yours today\"). Passive voice used only for deliberate stylistic effect — never as default. No jargon without inline definition the first time it appears. No inconsistency of register within a single document — establish one voice and hold it throughout.",
    productionRules:
      "All public-facing copy must pass a tone review before publication. This guide is shared with any external copywriter before work begins. Review matrix for every piece: (1) Would our author say this? (2) Does it serve the reader generously? (3) Is it precise? If any answer is no, revise before publishing.",
  },
  "Full Suite": {
    scopeDescription: "A complete style guide covering visual language, typography, tone of voice, and production constraints for this world. All production work references this document.",
    colourPalette:
      "Dominant: warm ochre and aged cream (Pantone 7503 / #EBE2C8). Accent: Victorian bottle green and burnt sienna (Pantone 574 / #3D6B3A, Pantone 1525 / #C85A20). Neutrals: charcoal ink (#2A2A2A) and sepia (#8B6E52). Paper never pure white — always warm cream or aged tint. Avoid cool blues, electric tones, or fully saturated primaries.",
    illustrationStyle:
      "Hand-engraved copper plate aesthetic. Fine hatching and cross-hatching for shadow and depth. Line weights varied: 0.25pt detail, 0.75pt outlines, 1.5pt borders. Botanical/archival accuracy paramount. All illustration reads as archival and hand-produced — no photographic realism.",
    textureAndMaterials:
      "Aged wove paper grain at 40–60% opacity as base layer. Foxing and water-stain marks at corners and margins — never obscuring primary illustration. Ink bleeding at extremities suggests original block printing. Letterpress impression on borders where appropriate.",
    typefaceDirection:
      "Primary: Cormorant Garamond / Playfair Display — old-style serif. Annotations: condensed or small-caps variant. Numerals: old-style figures. Display: Playfair Display SC, tracked. Secondary (UI/captions): Source Sans Pro. No geometric sans, rounded fonts, or any typeface that reads as modern in primary roles.",
    typeHierarchy:
      "H1 Display: Playfair Display SC, 48pt+, tracked +200, Ink Navy. H2: Cormorant Garamond italic, 24pt. H3: Source Sans Pro SemiBold, 16pt. Body: Cormorant Garamond 11–12pt, 1.5× leading. Caption: Source Sans Pro 8pt. Micro: 7pt, tracked +100.",
    proseVoice:
      "Victorian naturalist-scholar — learned, precise, quietly passionate. Sentences structured and complex but never opaque. Observation celebrated; enthusiasm restrained. Author has decades of field experience and knows the names of things. First person sparingly; third person for description; second person only as invitation.",
    referencePhrases:
      "\"A remarkable specimen, noteworthy for its…\" | \"The collector will observe that…\" | \"For those who find themselves drawn to…\" | \"There is much here that rewards patience.\" | \"Drawn from the archive of…\"",
    wordsToAvoid:
      "stunning, amazing, beautiful (standalone superlatives), digital, modern, sleek, clean, minimal, vibrant, shop now, limited time, just, very, utilize, leverage, unique (overused), [brand name] (avoid self-reference in voice)",
    negativeConstraints:
      "No sans-serif in primary roles. No pure white (#FFFFFF) backgrounds. No photographic realism. No flat design or colour blocking. No UI/web conventions (drop shadows, rounded buttons). No second-person imperative. No sales or marketing register in editorial content. No jargon without definition.",
    productionRules:
      "All artwork at 300 DPI for print, 144 DPI digital. CMYK for print (ISO Coated v2), sRGB for digital. Bleed: 3mm. Safe zone: 5mm. All fonts embedded and outlined before handoff. Paper simulation reduced for digital-only SKUs. All artwork approved in greyscale. All copy through tone review before publication.",
  },
};

const DEFAULT_GUIDE_SUGGESTIONS: GuideSuggestions = {
  scopeDescription: "Describe the scope of this style guide — which collections, volumes, or product types it governs.",
  colourPalette: "List the dominant, accent, and neutral colours for this world. Include named colour references, CMYK values for print, and hex codes for digital. Describe the atmosphere these colours should evoke.",
  illustrationStyle: "Describe the illustration medium, technique, line weight, rendering approach, and historical or artistic references that define the visual style for this world.",
  textureAndMaterials: "Describe paper simulation, aging effects, overlays, and material textures that should appear throughout the collection.",
  typefaceDirection: "Name the primary and secondary typefaces, their weights, and the contexts in which each is used. Include system font fallbacks.",
  typeHierarchy: "Describe the typographic scale: sizes, weights, tracking, and colours for each heading level, body text, captions, and micro-copy.",
  proseVoice: "Describe the voice in detail — register, person, sentence structure, emotional temperature, and what this voice knows and cares about.",
  referencePhrases: "Provide 4–6 example phrases or sentences that exemplify this voice at its best.",
  wordsToAvoid: "List specific words, phrases, or registers that break the voice or belong to the wrong world.",
  negativeConstraints: "List what is explicitly NOT allowed in this world's visual language — illustration styles, colours, typographic choices, or compositional approaches to avoid.",
  productionRules: "List technical requirements: DPI, colour profiles, bleed and safe zones, font embedding, print stock testing, and approval gates.",
};

// ── Section forms ─────────────────────────────────────────────────────────────

type OnFieldFocus = (field: keyof FormState, label: string) => void;

function IdentitySection({ f, set, onFocus }: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  onFocus?: OnFieldFocus;
}) {
  return (
    <div className="space-y-4">
      <Field label="Style Guide Name" required hint="A clear name that identifies this guide's scope and purpose.">
        <input
          value={f.name}
          onChange={e => set("name", e.target.value)}
          onFocus={() => onFocus?.("name", "Style Guide Name")}
          className={inputCls}
          placeholder="e.g. Volume I — Victorian Garden Journal Visual Language"
        />
      </Field>
      <Field label="Guide Type" required hint="The primary dimension this guide governs.">
        <select value={f.guideType} onChange={e => set("guideType", e.target.value)} className={selectCls}>
          <option value="">Select type…</option>
          <option>Visual Language</option>
          <option>Illustration Style</option>
          <option>Colour &amp; Palette</option>
          <option>Typography</option>
          <option>Tone &amp; Voice</option>
          <option>Full Suite</option>
        </select>
      </Field>
      <Field
        label="Scope Description"
        hint="Which collections, volumes, or product types does this guide govern?"
        action={f.guideType ? (
          <SuggestChip onClick={() => set("scopeDescription", (GUIDE_SUGGESTIONS[f.guideType] ?? DEFAULT_GUIDE_SUGGESTIONS).scopeDescription)} />
        ) : undefined}
      >
        <textarea
          value={f.scopeDescription}
          onChange={e => set("scopeDescription", e.target.value)}
          onFocus={() => onFocus?.("scopeDescription", "Scope Description")}
          className={textareaCls}
          rows={2}
          placeholder="e.g. Governs all visual work for the Victorian Garden Journal Collection, Volumes I–III."
        />
      </Field>
    </div>
  );
}

function VisualSection({ f, set, onFocus, worldId }: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  onFocus?: OnFieldFocus;
  worldId?: string | null;
}) {
  const suggest = GUIDE_SUGGESTIONS[f.guideType] ?? DEFAULT_GUIDE_SUGGESTIONS;
  const hasSuggestions = !!f.guideType;

  return (
    <div className="space-y-4">
      <Field
        label="Colour Palette"
        required
        hint="Named colours, CMYK values, hex codes, and the atmosphere they create."
        action={hasSuggestions ? <SuggestChip onClick={() => set("colourPalette", suggest.colourPalette)} /> : undefined}
      >
        <PaletteLibraryPicker
          value={f.colourPalette}
          onApply={palette => set("colourPalette", paletteReferenceText(palette))}
          worldId={worldId}
        />
        <textarea value={f.colourPalette} onChange={e => set("colourPalette", e.target.value)} onFocus={() => onFocus?.("colourPalette", "Colour Palette")} className={textareaCls} rows={5} placeholder="Dominant, accent, neutral, and background colours with print and digital references…" />
      </Field>
      <Field
        label="Illustration Style"
        required
        hint="Medium, technique, line weight, historical references, and what the art must evoke."
        action={hasSuggestions ? <SuggestChip onClick={() => set("illustrationStyle", suggest.illustrationStyle)} /> : undefined}
      >
        <textarea value={f.illustrationStyle} onChange={e => set("illustrationStyle", e.target.value)} onFocus={() => onFocus?.("illustrationStyle", "Illustration Style")} className={textareaCls} rows={5} placeholder="Describe the illustration approach, rendering method, and visual references…" />
      </Field>
      <Field
        label="Texture & Materials"
        required
        hint="Paper simulation, aging effects, overlays, and tactile qualities."
        action={hasSuggestions ? <SuggestChip onClick={() => set("textureAndMaterials", suggest.textureAndMaterials)} /> : undefined}
      >
        <textarea value={f.textureAndMaterials} onChange={e => set("textureAndMaterials", e.target.value)} onFocus={() => onFocus?.("textureAndMaterials", "Texture & Materials")} className={textareaCls} rows={4} placeholder="Grain, foxing, letterpress impression, ink bleeds, watercolour washes…" />
      </Field>
    </div>
  );
}

function TypographySection({ f, set, onFocus }: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  onFocus?: OnFieldFocus;
}) {
  const suggest = GUIDE_SUGGESTIONS[f.guideType] ?? DEFAULT_GUIDE_SUGGESTIONS;
  const hasSuggestions = !!f.guideType;

  return (
    <div className="space-y-4">
      <Field
        label="Typeface Direction"
        hint="Named families, weights, and usage context for each."
        action={hasSuggestions ? <SuggestChip onClick={() => set("typefaceDirection", suggest.typefaceDirection)} /> : undefined}
      >
        <textarea value={f.typefaceDirection} onChange={e => set("typefaceDirection", e.target.value)} onFocus={() => onFocus?.("typefaceDirection", "Typeface Direction")} className={textareaCls} rows={4} placeholder="Primary, secondary, display typefaces and their contexts…" />
      </Field>
      <Field
        label="Type Hierarchy"
        hint="Sizes, weights, tracking, and colours for each heading level and body text."
        action={hasSuggestions ? <SuggestChip onClick={() => set("typeHierarchy", suggest.typeHierarchy)} /> : undefined}
      >
        <textarea value={f.typeHierarchy} onChange={e => set("typeHierarchy", e.target.value)} onFocus={() => onFocus?.("typeHierarchy", "Type Hierarchy")} className={textareaCls} rows={4} placeholder="H1, H2, H3, body, caption, micro — sizes, weights, leading, colour…" />
      </Field>
      <Field
        label="Prose Voice"
        required
        hint="Describe the editorial voice — register, person, sentence structure, emotional temperature."
        action={hasSuggestions ? <SuggestChip onClick={() => set("proseVoice", suggest.proseVoice)} /> : undefined}
      >
        <textarea value={f.proseVoice} onChange={e => set("proseVoice", e.target.value)} onFocus={() => onFocus?.("proseVoice", "Prose Voice")} className={textareaCls} rows={4} placeholder="Who is the author? What do they know, care about, and sound like?…" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Register">
          <select value={f.register} onChange={e => set("register", e.target.value)} className={selectCls}>
            <option value="">Select…</option>
            <option value="Formal literary">Formal literary</option>
            <option value="Archival">Archival</option>
            <option value="Personal / intimate">Personal / intimate</option>
            <option value="Instructional">Instructional</option>
            <option value="Conversational">Conversational</option>
          </select>
        </Field>
      </div>
      <Field
        label="Reference Phrases"
        hint="4–6 example sentences that exemplify this voice at its best."
        action={hasSuggestions ? <SuggestChip onClick={() => set("referencePhrases", suggest.referencePhrases)} /> : undefined}
      >
        <textarea value={f.referencePhrases} onChange={e => set("referencePhrases", e.target.value)} onFocus={() => onFocus?.("referencePhrases", "Reference Phrases")} className={textareaCls} rows={3} placeholder="Example phrases and sentences that sound exactly right for this world…" />
      </Field>
      <Field
        label="Words & Phrases to Avoid"
        hint="Specific language that breaks the voice or belongs to the wrong world."
        action={hasSuggestions ? <SuggestChip onClick={() => set("wordsToAvoid", suggest.wordsToAvoid)} /> : undefined}
      >
        <textarea value={f.wordsToAvoid} onChange={e => set("wordsToAvoid", e.target.value)} onFocus={() => onFocus?.("wordsToAvoid", "Words to Avoid")} className={textareaCls} rows={3} placeholder="Words, phrases, or registers that must never appear in this world's voice…" />
      </Field>
    </div>
  );
}

function ConstraintsSection({ f, set, onFocus }: {
  f: FormState;
  set: (k: keyof FormState, v: string) => void;
  onFocus?: OnFieldFocus;
}) {
  const suggest = GUIDE_SUGGESTIONS[f.guideType] ?? DEFAULT_GUIDE_SUGGESTIONS;
  const hasSuggestions = !!f.guideType;

  return (
    <div className="space-y-4">
      <Field
        label="Negative Constraints — What NOT to Do"
        required
        hint="Explicit list of visual choices, typefaces, colours, and approaches that are prohibited."
        action={hasSuggestions ? <SuggestChip onClick={() => set("negativeConstraints", suggest.negativeConstraints)} /> : undefined}
      >
        <textarea value={f.negativeConstraints} onChange={e => set("negativeConstraints", e.target.value)} onFocus={() => onFocus?.("negativeConstraints", "Negative Constraints")} className={textareaCls} rows={6} placeholder="List everything explicitly prohibited: illustration styles, typographic choices, colours, compositional approaches…" />
      </Field>
      <Field
        label="Production Rules"
        hint="Technical requirements: DPI, colour profiles, bleed, safe zones, font embedding, approval gates."
        action={hasSuggestions ? <SuggestChip onClick={() => set("productionRules", suggest.productionRules)} /> : undefined}
      >
        <textarea value={f.productionRules} onChange={e => set("productionRules", e.target.value)} onFocus={() => onFocus?.("productionRules", "Production Rules")} className={textareaCls} rows={5} placeholder="Technical specs for print and digital: resolution, colour mode, bleed, font embedding, stock testing…" />
      </Field>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const DRAFT_KEY = (worldId: string | null | undefined) =>
  `daybook:style-guide-draft:${worldId ?? "__none__"}`;

function loadDraft(worldId: string | null | undefined): { form: FormState; section: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(worldId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { form: FormState; section: number };
    // Only restore if there's at least a name
    if (!parsed?.form?.name?.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearDraft(worldId: string | null | undefined) {
  try { localStorage.removeItem(DRAFT_KEY(worldId)); } catch { /* ignore */ }
}

export default function NewStyleGuideFlow() {
  const [, navigate] = useLocation();
  const { selectedWorldId } = useEditorial();
  const { toast } = useToast();

  // Draft restore banner
  const [draftBanner, setDraftBanner] = useState<"idle" | "offered" | "dismissed">("idle");
  const savedDraft = loadDraft(selectedWorldId);

  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [activeSection, setActiveSection] = useState(0);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [activeCoField, setActiveCoField] = useState<ApplyTarget>({ key: "scopeDescription", label: "Scope Description" });
  const copilotSession = useRef(`copilot-style-guide-new-${selectedWorldId ?? "unselected"}-${Math.random().toString(36).slice(2)}`);
  // Offer to restore draft on mount (if one exists)
  useEffect(() => {
    if (savedDraft && draftBanner === "idle") {
      setDraftBanner("offered");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof FormState, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const saveDraft = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_KEY(selectedWorldId), JSON.stringify({ form, section: activeSection }));
      toast({ title: "Draft saved — you can safely leave and return to continue" });
    } catch {
      toast({ title: "Could not save draft", variant: "destructive" });
    }
  }, [form, activeSection, selectedWorldId, toast]);

  const restoreDraft = () => {
    if (!savedDraft) return;
    setForm(savedDraft.form);
    setActiveSection(savedDraft.section);
    setDraftBanner("dismissed");
  };

  const discardDraft = () => {
    clearDraft(selectedWorldId);
    setDraftBanner("dismissed");
  };

  // Completion checks
  const checks = SECTIONS.map(s => {
    const items = s.checks(form);
    const done = items.filter(c => c.done).length;
    return { ...s, items, done, total: items.length };
  });
  const totalDone = checks.reduce((a, c) => a + c.done, 0);
  const totalItems = checks.reduce((a, c) => a + c.total, 0);

  const canSubmit = !!(form.name.trim() && form.guideType && selectedWorldId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const content = assembleContent(form);
      return apiFetch<{ style_guide: { id: string } }>("/v1/editorial/style-guides", {
        method: "POST",
        body: JSON.stringify({
          world_id: selectedWorldId,
          name: form.name.trim(),
          content,
        }),
      });
    },
    onSuccess: () => {
      clearDraft(selectedWorldId);
      toast({ title: "Style guide created" });
      navigate(`/super/worldsmith/editorial/style-guides`);
    },
    onError: () => {
      toast({ title: "Save failed", description: "Please try again.", variant: "destructive" });
    },
  });

  const handleCoFieldFocus: OnFieldFocus = (field, label) => setActiveCoField({ key: field, label });

  const sectionComponents = [
    <IdentitySection f={form} set={set} onFocus={handleCoFieldFocus} />,
    <VisualSection f={form} set={set} onFocus={handleCoFieldFocus} worldId={selectedWorldId} />,
    <TypographySection f={form} set={set} onFocus={handleCoFieldFocus} />,
    <ConstraintsSection f={form} set={set} onFocus={handleCoFieldFocus} />,
  ];

  return (
    <div className="flex h-dvh bg-gray-50">
      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside className="w-64 flex-none bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-5 pb-4 border-b border-gray-100">
          <button
            onClick={() => navigate("/super/worldsmith/editorial/style-guides")}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3"
          >
            <ArrowLeft className="w-3 h-3" /> Style Guides
          </button>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" style={{ color: CLAY }} />
            <span className="font-semibold text-sm text-gray-900">New Style Guide</span>
          </div>
        </div>

        {/* Progress */}
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

        {/* Section nav */}
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

        {/* Checklist for active section */}
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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
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
              onClick={() => setCopilotOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border rounded-lg transition-colors ${
                copilotOpen ? "text-white border-transparent" : "text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
              style={copilotOpen ? { background: INK } : undefined}
            >
              <Sparkles className="w-3.5 h-3.5" /> Co-write
            </button>
            <button
              onClick={saveDraft}
              disabled={!form.name.trim()}
              title="Save your progress — return to finish later"
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save Draft
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!canSubmit || saveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ background: INK }}
            >
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              Create Style Guide
            </button>
          </div>
        </div>

        {/* Form + optional copilot panel */}
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 overflow-y-auto">
            <div className={copilotOpen ? "max-w-2xl px-8 py-8" : "max-w-2xl mx-auto px-8 py-8"}>
              {/* Draft restore banner */}
              {draftBanner === "offered" && (
                <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-sm">
                  <Save className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="flex-1 text-amber-800">You have an unsaved draft. Restore it to pick up where you left off.</span>
                  <button onClick={restoreDraft} className="font-semibold text-amber-900 hover:underline shrink-0">Restore</button>
                  <button onClick={discardDraft} className="text-amber-600 hover:text-amber-800 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
              {sectionComponents[activeSection]}
            </div>
          </div>
          <EditorialCopilot
            isOpen={copilotOpen}
            onClose={() => setCopilotOpen(false)}
            surface="style_guide"
            worldId={selectedWorldId}
            storageKey={copilotSession.current}
            title="Style Guide Copilot"
            greeting={`I'm here to help you write ${form.name ? `"${form.name}"` : "your style guide"}${form.guideType ? ` (${form.guideType})` : ""}. Click into any field and tell me what you'd like to develop, or just describe the world and I'll help shape the voice.`}
            activeTarget={activeCoField}
            context={{
              guideName: form.name,
              guideType: form.guideType,
              draft: form,
            }}
            onApply={(text, key) => set(key as keyof FormState, text.trim())}
          />
        </div>

        {/* Section navigation footer */}
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
              {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              Create Style Guide
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
