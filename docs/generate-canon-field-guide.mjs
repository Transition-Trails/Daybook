import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const forms = readFileSync(join(here, "../artifacts/admin/src/components/worldsmith/editorial/CanonTypeForms.tsx"), "utf8");
const editor = readFileSync(join(here, "../artifacts/admin/src/pages/super/worldsmith-editorial/CanonRecordEditor.tsx"), "utf8");
const escape = value => String(value ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Each purpose describes why an editor would fill in this field, not its storage shape.
const purpose = {
  "Record name": "Names the entity or fact so editors can find and reference it.",
  "Canon type": "Selects the kind of record and its type-specific profile.",
  "Workflow Status": "Shows where the record sits in the editorial approval process; changed through workflow actions.",
  "Canon Stability": "Signals how open the fact is to revision.",
  "Narrative Visibility": "Controls who in the story can know or encounter the fact.",
  "Temporal Scope": "States the period or phase in which the fact applies.",
  "Importance": "Ranks the fact’s significance to the world or story.",
  "Spoiler Level": "Flags how much the record reveals about future events.",
  "Evidence Confidence": "Records the strength or dispute of supporting evidence.",
  "Source Type": "Identifies the kinds of evidence or authority behind the fact.",
  "Location Scale": "Defines the physical size or geographic level of a place.",
  "Primary Function": "Describes what the place is chiefly used for.",
  "Ownership": "Identifies who owns or claims the place.",
  "Condition": "Records the present physical state of a place or object.",
  "Access": "Describes who can enter a place or reach a piece of knowledge.",
  "Population Density": "Indicates how inhabited or busy a place is.",
  "Setting Character": "Captures the atmosphere and social feel of a location.",
  "Dominant Materials": "Identifies the visible or structural materials of a setting.",
  "Object Class": "Classifies what kind of physical object this is.",
  "Scale": "Specifies the object's approximate physical size.",
  "Material": "Lists the substances from which the object is made.",
  "Authenticity": "Distinguishes an original from a modification, replacement, replica, or forgery.",
  "Story Function": "Explains the role an object or relationship plays in the narrative.",
  "Event Type": "Classifies what happened or is expected to happen.",
  "Temporal Precision": "Indicates how precisely the event can be dated.",
  "Event Status": "Separates events that occurred from plans, rumors, disputes, or ongoing events.",
  "Consequence Scale": "Describes the social or geographic reach of the event's effects.",
  "Lore Type": "Classifies a belief, practice, principle, tradition, or story.",
  "Origin": "Identifies where the lore came from or who originated it.",
  "Acceptance": "Indicates how widely the lore is believed or observed.",
  "Truth Status": "Separates the lore's objective truth from its in-world acceptance.",
  "Emotional Register": "Sets the prevailing emotional tone of an atmosphere.",
  "Intensity": "Indicates how strongly that atmosphere is felt.",
  "Duration": "Specifies how long or how broadly the atmosphere persists.",
  "Motif Class": "Identifies the sensory or material form of a recurring motif.",
  "Recurrence": "States how often the motif returns.",
  "Evolution": "Shows how the motif’s meaning changes over time.",
  "From Entity": "Selects the first Canon entity in a relationship.",
  "To Entity": "Selects the second Canon entity in a relationship.",
  "Relationship Type": "Classifies the bond or social tie between the entities.",
  "Directionality": "Shows whether the relationship is mutual or weighted toward one side.",
  "Phase": "Describes the relationship’s current stage.",
  "Emotional Valence": "Describes the dominant feeling between the entities.",
  "Trust": "Rates how far the parties trust one another.",
  "Power Balance": "Shows which entity has more leverage or authority.",
  "Public Visibility": "States who knows about the relationship.",
  "Dependency": "Lists ways one party relies on the other.",
  "Primary Tension": "Captures the main source of friction in the relationship.",
  "Pronouns": "Records how the character should be referred to.",
  "Life Stage": "Places the character or a visual variant in a phase of life.",
  "Occupation or Role": "Records work, social duties, and roles the character performs.",
  "Social Position": "Places the character within the world’s class or status structure.",
  "Family Position": "Describes the character’s role within a family.",
  "Marital State": "Tracks the character’s relationship or marital status.",
  "Education": "Records learning and training that shape the character's capabilities.",
  "Financial Security": "Describes the character's access to reliable resources.",
  "Public Reputation": "Captures how other people generally perceive the character.",
  "Apparent Life Stage": "Specifies how old the character appears in visual depictions.",
  "Height": "Establishes relative physical stature.",
  "Build": "Describes the character's body shape for prose and visual continuity.",
  "Face Shape": "Defines the broad structure of the face.",
  "Complexion Depth": "Describes the depth of skin color for visual consistency.",
  "Skin Undertone": "Describes the underlying tone of the complexion.",
  "Eye Color": "Fixes the color of the eyes across depictions.",
  "Eye Character": "Captures distinctive visual qualities of the eyes or gaze.",
  "Hair Color": "Fixes hair color across depictions.",
  "Hair Texture": "Describes the texture of the hair.",
  "Hair Length": "Defines the baseline length of the hair.",
  "Hair Arrangement": "Describes the usual hairstyle or arrangement.",
  "Facial Hair": "Records the presence and style of facial hair.",
  "Distinguishing Features": "Lists recognizable physical identifiers.",
  "Posture": "Captures how the character habitually holds their body.",
  "Movement": "Describes the character’s typical manner of moving.",
  "Wardrobe Formality": "Sets the everyday level or context of dress.",
  "Garment Condition": "Shows how worn or maintained the clothing is.",
  "Palette": "Sets characteristic clothing colors for visual continuity.",
  "Textile Preference": "Identifies characteristic fabrics in the wardrobe.",
  "Pattern": "Records recurring clothing or textile patterns.",
  "Accessories": "Lists recognizable objects carried or worn.",
  "Grooming": "Describes the character’s typical personal presentation.",
  "Narrative Role": "Identifies the character's functions in the story.",
  "Arc Type": "Summarizes the pattern of change in the character's arc.",
  "Starting Condition": "Captures the character’s state at the beginning of their arc.",
  "Core Desire": "States what the character consciously wants.",
  "Core Need": "States what the character must learn or develop.",
  "Core Fear": "Names the fear influencing the character’s decisions.",
  "Misconception": "Identifies a mistaken belief the story may challenge.",
  "Resisted Change": "Names changes the character resists making.",
  "Ending Condition": "Captures the intended state at the end of the arc.",
  "Speech Register": "Sets the general formality and social tone of speech.",
  "Sentence Rhythm": "Describes recurring pacing and structure in dialogue.",
  "Directness": "Indicates how plainly the character says what they mean.",
  "Emotional Openness": "Indicates how readily the character voices feelings.",
  "Humor": "Describes the character’s habitual style of humor.",
  "Conflict Style": "Shows how the character responds to disagreement.",
  "Affection Style": "Shows how the character expresses care.",
  "Vocabulary Tendencies": "Identifies subject areas that color the character's word choice.",
  "Category": "Selects which visual trait an identity lock governs.",
  "Canonical Value": "States the exact trait the generated image must preserve.",
  "Strength": "Sets how strictly the visual trait must be enforced.",
  "Topic or Linked Canon": "Identifies the subject the character knows or believes something about.",
  "Knowledge State": "Tracks how much the character knows about the topic.",
  "Confidence": "Records how certain the character feels about their knowledge.",
  "Source": "Identifies how the character learned or inferred the information.",
  "Disclosure": "Controls who may be told or shown this information.",
  "What the character believes": "Records the character's interpretation, which may differ from the truth.",
  "Dramatic consequence": "Explains how that knowledge affects choices or conflict.",
  "Variant Name": "Names an alternate depiction of the same character.",
  "Apparent Age Range": "Gives the visible age range for this variant.",
  "Story Period Label": "Links the variant to a particular story period.",
  "Hair & Facial Hair Changes": "Describes hair changes specific to this variant.",
  "Facial Hair Changes": "Describes facial-hair changes specific to this variant.",
  "Health / Mobility Changes": "Records health or mobility differences in this period.",
  "Wardrobe Profile": "Describes clothing specific to this variant.",
  "Occupation Status": "Records the character’s work or position at this stage.",
  "Emotional Baseline": "Describes the character’s usual emotional state at this stage.",
  "Visual Notes": "Adds visual continuity instructions for this variant.",
  "Reference Asset IDs": "Links visual references that anchor this variant.",
  "Allowed Deviations": "Lists ways this variant may differ from the base identity.",
  "Material Class": "Classifies what kind of substance the material is.",
  "Rarity": "Indicates how difficult this material is to find in the world.",
  "Primary Properties": "Records practical or sensory properties that matter to its use."
};

function picks(source) {
  return [...source.matchAll(/<(SingleSelect|MultiChipSelect|CanonPicker)\b([\s\S]*?)\/>/g)].map(([, widget, attrs]) => {
    const label = attrs.match(/\blabel="([^"]+)"/)?.[1];
    if (!label) return null;
    if (!purpose[label]) throw new Error(`Missing purpose for ${label}`);
    const options = attrs.match(/\boptions=\{\[([\s\S]*?)\]\}/)?.[1] ?? "";
    const labels = [...options.matchAll(/\{\s*key:\s*"[^"]+",\s*label:\s*"([^"]+)"\s*\}/g)].map(m => m[1]);
    const vocab = attrs.match(/\bvocabKey="([^"]+)"/)?.[1] ?? "";
    const max = attrs.match(/\bmax=\{(\d+)\}/)?.[1];
    return { label, widget, vocab, max, custom: /\ballowCustom\b/.test(attrs), labels };
  }).filter(Boolean);
}

const sections = [
  ["Character", "A person or other character: identity, appearance, motivation, voice, knowledge, and version-specific appearance.", ["CharacterIdentityForm", "CharacterKnowledgeForm", "LifeStageVariantForm", "GenerationLocksForm"]],
  ["Location", "A place: its scale, use, ownership, access, and material or sensory character.", ["LocationForm"]],
  ["Object", "A physical item: its form, material, condition, authenticity, and narrative role.", ["ObjectForm"]],
  ["Event", "Something that happened, is rumored, is planned, or is ongoing.", ["EventForm"]],
  ["Lore", "An in-world belief, custom, principle, memory, or legend.", ["LoreForm"]],
  ["Atmosphere", "A recurring or bounded mood attached to a scene, place, or story.", ["AtmosphereForm"]],
  ["Material", "A substance or material with identity, scarcity, and defining properties.", ["MaterialForm"]],
  ["Relationship", "An explicit tie between two Canon entities, with emotional and social dynamics.", ["RelationshipForm"]],
  ["Motif", "A recurring sensory, visual, verbal, or material element with evolving meaning.", ["MotifForm"]],
];
const formContents = Object.fromEntries([...forms.matchAll(/export function (\w+)\(/g)].map((match, index, list) =>
  [match[1], forms.slice(match.index, list[index + 1]?.index ?? forms.length)]));
const metaStart = editor.indexOf('label="Workflow Status"');
const metaEnd = editor.indexOf('{form.canonType === "character"', metaStart);
const metadata = picks(editor.slice(editor.lastIndexOf("<SingleSelect", metaStart), metaEnd));
if (metadata.length !== 8) throw new Error(`Expected 8 global metadata selectors, found ${metadata.length}`);
const inventory = sections.map(([name, description, names]) => ({
  name, description,
  parts: names.map(formName => {
    const rows = picks(formContents[formName] ?? "");
    if (!rows.length) throw new Error(`No selectors found for ${formName}`);
    return { formName, rows };
  }),
}));

function row(label, input, why, choices = "", note = "") {
  return `<tr><th scope="row">${escape(label)}</th><td>${escape(input)}</td><td>${escape(why)}</td><td>${escape(choices)}${note ? `<small>${escape(note)}</small>` : ""}</td></tr>`;
}
function table(rows) {
  return `<table><thead><tr><th>Field</th><th>Input</th><th>Purpose</th><th>Built-in choices / notes</th></tr></thead><tbody>${rows.join("\n")}</tbody></table>`;
}
function selectorRow(item) {
  const input = item.widget === "CanonPicker" ? "Canon search" : item.widget === "MultiChipSelect"
    ? `Multi-select${item.max ? ` (up to ${item.max})` : ""}` : "Single-select";
  const choices = item.widget === "CanonPicker" ? "Searches Canon records in the selected world; no fixed list."
    : item.labels.length ? item.labels.join(" · ") : "No built-in options; use world vocabulary or a custom value.";
  return row(item.label, input, purpose[item.label], choices,
    [item.vocab && `Vocabulary: ${item.vocab}`, item.custom && "Custom entry available"].filter(Boolean).join(" · "));
}

const extras = {
  Character: [
    ["performanceEnergy", "Desired energy or presence in a portrayal."],
    ["audienceAlignment", "How the audience is meant to relate to the character."],
    ["moralFraming", "Intended ethical framing of the character's actions."],
    ["portrayalCautions", "Constraints or sensitivities for depicting the character (list)."],
  ],
  Location: [
    ["naturalLight", "Quality of daylight at the setting."],
    ["artificialLight", "Sources or qualities of man-made light (list)."],
    ["weatherExposure", "How exposed the setting is to the elements."],
    ["seasonalBehavior", "How the place changes across seasons (list)."],
    ["sensorySound", "Recurring sounds in the place (list)."],
    ["sensoryScent", "Recurring smells in the place (list)."],
    ["sensoryTactile", "Touch and texture cues of the place (list)."],
    ["sensoryAtmosphere", "Other sensory impressions of the setting (list)."],
  ],
  Object: [
    ["craftLevel", "Quality or sophistication of workmanship."],
    ["rarity", "How scarce the object is in the world."],
    ["custody", "Who has possession or responsibility for the object."],
  ],
  Event: [
    ["certainty", "Strength of evidence that the event happened as described."],
    ["narrativeFunction", "Story roles served by the event (list)."],
    ["visibility", "How widely the event is known."],
    ["participants", "People or entities who took part (list)."],
    ["witnesses", "People or entities who observed it (list)."],
    ["causes", "Events or factors that caused it (list)."],
    ["immediateConsequences", "Direct short-term effects (list)."],
    ["longTermConsequences", "Lasting or generational effects (list)."],
    ["evidence", "Evidence for the event (list)."],
    ["affectedCanonRecords", "Other Canon records changed or implicated (list)."],
  ],
  Lore: [
    ["enforcement", "How the lore or rule is upheld."],
    ["flexibility", "Whether it allows interpretation or exceptions."],
    ["transmission", "Ways it is passed on (list)."],
    ["storyUse", "Narrative uses of the lore (list)."],
  ],
  Atmosphere: [
    ["sensoryEmphasis", "Sensory details that evoke the mood (list)."],
    ["narrativeVisibility", "How directly the atmosphere should be described."],
  ],
  Motif: [
    ["function", "Narrative functions of the motif (list)."],
  ],
  Material: [
    ["scale", "Physical size of an object made from the material."],
    ["condition", "Current physical condition of the object."],
    ["craftLevel", "Quality of workmanship."],
    ["authenticity", "Whether an object is an original or a reproduction."],
    ["custody", "Current keeper or owner of an object."],
    ["storyFunction", "The object’s roles in a story (list)."],
  ],
};
const proseRows = [
  ["Narrative details", "Rich text", "The record’s story, purpose, and significance in the world."],
  ["Historical context", "Rich text", "Origins, era, provenance, and changes over time."],
  ["Visual notes", "Rich text", "Color, light, texture, materials, and physical presence for creators."],
  ["Editorial notes", "Rich text", "Working questions, flags, and cross-references for the team."],
];
const characterProse = [
  ["Canon Guardrails", "Boundaries and truths that future writing must not contradict."],
  ["Relationship details", "Important bonds, tensions, loyalties, and relational history."],
  ["Character Direction", "Intended trajectory, pressures, and development."],
  ["Confirmed Canon", "Established, approved facts about the character."],
];
const knowledgeText = [
  ["Topic or Linked Canon", "Topic being tracked; this is a text field, not the world Canon search picker."],
  ["What the character believes", "Subjective belief, whether true or false."],
  ["Dramatic consequence", "How the knowledge changes choices or conflict."],
];
const variantText = [
  "Variant Name", "Apparent Age Range", "Story Period Label", "Hair & Facial Hair Changes",
  "Facial Hair Changes", "Health / Mobility Changes", "Wardrobe Profile", "Occupation Status",
  "Emotional Baseline", "Visual Notes", "Reference Asset IDs", "Allowed Deviations",
];
const sectionsHtml = inventory.map(({ name, description, parts }) => {
  const htmlParts = parts.map(({ formName, rows }) => {
    const heading = { CharacterIdentityForm: "Identity, appearance, wardrobe, arc and voice",
      CharacterKnowledgeForm: "Knowledge records (repeatable)", LifeStageVariantForm: "Life-stage variants (repeatable)",
      GenerationLocksForm: "Visual identity locks (repeatable)" }[formName];
    const otherRows = formName === "CharacterKnowledgeForm" ? knowledgeText.map(([label, why]) => row(label, "Text", why))
      : formName === "LifeStageVariantForm" ? variantText.map(label => row(label, label === "Reference Asset IDs" ? "Comma-separated IDs" : "Text", purpose[label]))
      : formName === "GenerationLocksForm" ? [row("Canonical Value", "Text", purpose["Canonical Value"])] : [];
    return `${heading ? `<h3>${heading}</h3>` : ""}${table([...rows.map(selectorRow), ...otherRows])}`;
  }).join("\n");
  const prose = name === "Character" ? `<h3>Additional character prose</h3>${table(characterProse.map(([label, why]) => row(label, "Rich text", why)))}` : "";
  const apiExtras = (extras[name] ?? []).length
    ? `<details open><summary>Additional profile schema fields not shown in this editor</summary><p>These fields are accepted by the typed profile schema, but the current Canon form does not offer a picklist for them. No fixed options are defined in this form.</p>${table(extras[name].map(([label, why]) => row(label, "Text / list", why, "No editor choices defined")))}</details>`
    : "";
  const footnote = name === "Material"
    ? "<p class='callout'>Material reuses the object profile schema. Its Material Class vocabulary key is <code>object_class</code>, and Primary Properties uses <code>material</code>; world-specific vocabularies may therefore affect both Material and Object pickers.</p>"
    : name === "Relationship" ? "<p class='callout'>The editor also stores relationship data through a dedicated relationship endpoint. “From” and “To” search existing Canon records in the selected world rather than using fixed choices.</p>" : "";
  return `<section id="${name.toLowerCase()}" class="record-type"><div class="section-kicker">CANON TYPE</div><h2>${name}</h2><p class="lead">${description}</p>${htmlParts}${prose}${apiExtras}${footnote}</section>`;
}).join("\n");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>WorldSmith Canon · Record Types & Field Guide</title><style>
:root{--ink:#1B2A4A;--clay:#B96550;--paper:#FFFDF9;--line:#E7DCCB;--sub:#48566B}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#F7F3ED;color:var(--ink);font:14px/1.6 Arial,Helvetica,sans-serif}
.page{max-width:1050px;margin:0 auto;background:var(--paper);padding:55px 68px 70px;box-shadow:0 15px 50px #1b2a4a14}
h1,h2,h3{font-family:Georgia,serif;line-height:1.2}h1{font-size:39px;margin:8px 0 8px}h2{font-size:27px;margin:6px 0 12px}h3{font-size:18px;margin:24px 0 10px}
p{margin:8px 0 13px}.eyebrow,.section-kicker{font-size:10px;letter-spacing:.18em;font-weight:800;color:var(--clay)}.subtitle{font-size:17px;color:var(--sub);max-width:700px}.meta{color:var(--sub);font-size:11px}
.note,.callout{border-left:3px solid var(--clay);padding:11px 16px;background:#F7F0E9;color:#36445A;margin:20px 0}
.contents{margin:30px 0;padding:20px 24px;background:#F7F2EC;border-radius:10px}.contents a{display:inline-block;margin:4px 16px 4px 0;color:var(--ink);text-decoration:none;border-bottom:1px solid var(--clay)}
.record-type{border-top:2px solid var(--ink);margin-top:45px;padding-top:28px}.lead{color:var(--sub);max-width:760px}
table{width:100%;border-collapse:collapse;table-layout:fixed;margin:15px 0 25px;font-size:11px}th,td{padding:9px 10px;vertical-align:top;text-align:left;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
thead th{background:#F0E9DF;color:var(--ink);font-size:10px;text-transform:uppercase;letter-spacing:.06em}
tbody th{color:var(--ink);font-weight:700;width:18%}thead th:nth-child(1){width:19%}thead th:nth-child(2){width:12%}thead th:nth-child(3){width:30%}thead th:nth-child(4){width:39%}
tbody tr:nth-child(even){background:#FCF9F5}td:nth-child(2){color:#9B5B47;font-weight:600}td:nth-child(3){color:#334155}small{display:block;color:#6E7786;margin-top:4px;font-size:10px}
details{margin:22px 0;border:1px solid var(--line);padding:13px 16px;border-radius:8px}summary{cursor:pointer;font-weight:700;color:var(--ink)}details p{font-size:12px;color:var(--sub)}
.sources{margin-top:40px;border-top:1px solid var(--line);padding-top:20px;color:var(--sub);font-size:11px}code{font-size:10px}
@page{size:A4;margin:14mm 12mm}@media print{body{background:white}.page{max-width:none;padding:0;box-shadow:none}.record-type{break-before:page;margin-top:0;padding-top:12px}table{font-size:9px}th,td{padding:6px 7px}thead{display:table-header-group}tr{break-inside:avoid}details{break-inside:auto}details> *{display:block}summary{list-style:none}.contents a{border:0}}
</style></head><body><main class="page">
<div class="eyebrow">DAYBOOK / WORLDSMITH · EDITORIAL REFERENCE</div>
<h1>Canon record types & field guide</h1>
<p class="subtitle">A working reference to every record type in the Canon editor: what each field is for, whether it accepts one or several choices, and the choices built into the interface.</p>
<p class="meta">Prepared from the current editor and profile schema · September 2026</p>
<div class="note"><strong>How to read this guide.</strong> Record name is required. The other profile fields are optional in the current editor. “Single-select” allows one choice; “multi-select” allows several. A field marked “Custom entry available” accepts an entered value. The listed choices are built-in editor choices, not a guarantee of every world's live options: active world/global vocabularies can replace labels or add options. A blank field means “not specified,” not necessarily “Unknown.”</div>
<div class="note"><strong>Workflow status nuance.</strong> The Global Metadata status control does not change the record. Actual lifecycle actions use Proposed → Under Review → Accepted / Superseded / Rejected (with allowed reopen paths). The displayed selector currently lists Draft and Archived although the workflow uses Proposed and Rejected; treat the workflow state as authoritative. The Event type’s “Event Status” is a separate description of an event, not its approval status.</div>
<div class="note"><strong>Source spelling.</strong> The Character → Core Need built-in choices reproduce the current editor exactly. “Courourage” appears there as written in the source; it likely means “Courage.”</div>
<nav class="contents"><strong>Browse record types</strong><br>${sections.map(([name]) => `<a href="#${name.toLowerCase()}">${name}</a>`).join("")}<a href="#shared">Shared fields</a><a href="#system">System fields</a></nav>
<section id="shared" class="record-type"><div class="section-kicker">ALL RECORD TYPES</div><h2>Shared fields</h2>
${table([
  row("Record name", "Required text", purpose["Record name"]),
  row("Canon type", "Single choice", purpose["Canon type"], sections.map(([name]) => name).join(" · ")),
  ...metadata.map(selectorRow),
  ...proseRows.map(([label, input, why]) => row(label, input, why)),
  row("Prompt summary", "Editable generated text", "Compact, reviewed Canon context used to ground image-generation prompts.", "Generated or edited; current/stale status shown."),
  row("Identity summary", "Editable generated text · Character only", "Repeatable visual-identity constraints for the character.", "Generated or edited; current/stale status shown."),
  row("Images", "Upload / generate gallery", "Holds the primary portrait and supporting references for Canon.", "One primary image plus optional additional images."),
  row("Asset Title", "Text · Images", "Names a primary or additional image for editors and viewers."),
  row("Asset Role", "Single-select · Additional images", "Identifies how a supporting image should be used.", "Reference · Alternate Portrait · Full Body · Life-Stage Reference · Wardrobe Reference · Expression Reference · Location Exterior · Location Interior · Object Reference · Mood Reference · Historical Reference · Generated Concept. The primary image is designated separately."),
  row("Rights Status", "Single-select · Images", "Records permission or provenance for image use.", "Owned · Licensed · Public Domain · Generated (No Copyright) · Unknown"),
  row("Creator / Source", "Text · Images", "Credits the creator or records the source link."),
  row("Image Workflow Status", "Single-select · Additional images", "Tracks whether a supporting image has been reviewed for use.", "Suggested · Pending Approval · Approved · Rejected. Separate from Canon record Workflow Status."),
  row("Description & Alt Text", "Text · Images", "Describes image content and supports accessible reading."),
  row("Linked Canon / specs / stories", "Linked records", "Shows which other records, storylines, scenes, or production items depend on this Canon.", "Search/relationship links, not a fixed picklist."),
])}
</section>
${sectionsHtml}
<section id="system" class="record-type"><div class="section-kicker">DATA MODEL</div><h2>System-managed and schema-only fields</h2>
<p class="lead">These fields exist in storage or supporting APIs, but they are not additional general-purpose picklists in the Canon editor.</p>
${table([
  row("Record ID / World ID", "System identifiers", "Identify the record and the world to which it belongs."),
  row("Structured profile", "Typed profile document", "Stores the type-specific fields in this guide; older records may also carry a compatibility JSON profile."),
  row("Global metadata", "Structured metadata", "Stores shared stability, visibility, temporal scope, importance, spoiler, evidence, and source classifications."),
  row("Schema-only global metadata", "Text / list / semantic state", "Can hold a one-line definition, tags, and a reason a classification is not filled in.", "Semantic state: Unknown · Unresolved · Not Applicable · Withheld · Custom. No current editor controls for these profile fields."),
  row("Generation profile", "Structured settings", "Stores image-generation constraints including character identity locks."),
  row("Prompt/identity summary hashes & generated timestamps", "System provenance", "Mark whether generated summaries still match the source Canon."),
  row("Typography", "Linked font roles", "Carries selected font families, weights, and roles when a record has typography guidance."),
  row("Legacy emotional register / sensory clauses / register lock", "Authorial prompt controls", "Constrain inherited emotional tone and sensory description; the lock prevents downstream cascade from overwriting the register.", "Legacy register values: Withholding · Intimate · Guarded · Trespass · Absence · Confidence."),
  row("Legacy narrative visibility / temporal scope / canon stability", "Legacy text metadata", "Older top-level classifications may coexist with newer global-metadata choices; they are not the same picklists."),
  row("From / To entity IDs, emotional valence", "Relationship links", "Connect relationship records to two Canon entities and their emotional tenor."),
  row("Spec reference count", "Calculated count", "Counts linked production specs for display."),
  row("Primary portrait / image URLs / image gallery", "Stored asset references", "Stores portrait and supporting image references; primary portrait mirrors the first gallery entry."),
  row("Notion page ID / synced at", "Sync metadata", "Tracks an associated Notion record and last synchronization."),
  row("Created by / created at / updated at", "Audit metadata", "Records authorship and timestamps."),
  row("Record relations", "Separate linked entity", "Stores directed Canon-to-Canon relations with relation type, details, scope, source, and audit information."),
])}
</section>
<footer class="sources"><strong>Source of truth:</strong> Canon editor and type forms in <code>artifacts/admin/src/pages/super/worldsmith-editorial/CanonRecordEditor.tsx</code> and <code>artifacts/admin/src/components/worldsmith/editorial/CanonTypeForms.tsx</code>; vocabulary behavior in <code>EditorialFields.tsx</code>; persisted models in <code>lib/db/src/schema/worldsmith-editorial.ts</code> and <code>worldsmith-foundation.ts</code>. This is a snapshot of the current code, not an export of a particular world's live vocabulary values.</footer>
</main></body></html>`;

const output = join(here, "WorldSmith-Canon-Field-Guide.html");
writeFileSync(output, html, "utf8");
console.log(`Wrote ${output}: ${inventory.reduce((n, section) => n + section.parts.reduce((m, part) => m + part.rows.length, 0), 0)} type-specific selectors and ${metadata.length} shared selectors.`);