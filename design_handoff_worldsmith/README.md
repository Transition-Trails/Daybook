# Handoff: Worldsmith — canon records, assist, and image generation

## Overview

Worldsmith is a feature inside **Daybook** (Replit app, repo `Transition-Trails/Daybook`). It is where a world owner writes and enriches the **canon records** that make a fictional world specific enough for DALL·E to render it consistently. Local tables sync bidirectionally with the Notion **WorldSmith Living Archive**.

The design problem it solves is not data entry. It is that a *complete* canon database still produces generic images. Worldsmith's job is to keep asking the questions whose answers make a picture possible, to surface contradictions before they compound, and — equally — to propose story openings the owner has not thought of.

Four surfaces are specified here. **Canon** is the primary one; build it first.

---

## About the design files

The files in this bundle are **design references written in HTML** — prototypes showing intended look and behavior. They are **not production code to copy**.

They are authored in a small component runtime (`support.js`, `<x-dc>` templates with `{{ }}` holes and `<sc-if>` / `<sc-for>`). **Do not port that runtime.** Recreate these designs in Daybook's existing environment — React + TypeScript, the studio shell in `artifacts/admin/src/components/studio/StudioLayout.tsx`, and the tokens in `artifacts/admin/src/index.css`.

To view a prototype, open the `.dc.html` file directly in a browser.

- **`Worldsmith App.dc.html`** — the design to build. Full app shell, four working tabs.
- **`Worldsmith Explorations.dc.html`** — the option canvas behind it (11 turns, ids `1a`–`11a`). Reference only, for design rationale. It also contains two surfaces **not** in the app file: `8a` world genesis and `5a` platform admin — both specified below as phase 2.

## Fidelity

**High-fidelity.** Exact hex values, type, spacing, and interaction states are given below and are final. The chrome deliberately matches Daybook's existing studio shell — reuse those components rather than rebuilding them.

---

## Data model — required Notion / local table changes

Three new fields on **Canon Records**. Everything else in this design reads existing fields (`Canonical ID`, `Canon Record`, `Category`, `Layer`, `Status`, `Confidence`, `Priority`, `Summary`, `Source`).

| Field | Type | Values | Purpose |
| --- | --- | --- | --- |
| `Emotional register` | Select | Withholding · Intimate · Guarded · Trespass · Absence · Confidence | What a reader should feel before reading a word. Compiles into the prompt. |
| `Sensory clauses` | Multi-line text | Free text, one clause per line | Material/light detail. Compiled verbatim. |
| `Register locked` | Checkbox | true / false | Stops a child record drifting once its register is judged right. |

**Inheritance rule (needs a decision before build).** `Emotional register` cascades down record relations: set it on `INS-001` and `PLC-003` / `ART-002` inherit it unless they override. This is what makes a world cohere, but it means editing one record silently changes others. `Register locked` is the proposed guard. Confirm the cascade depth (direct relations only vs. transitive) before implementing.

Also required, on the world:

- **World rules** — string array, the hard negatives from genesis. Compile last onto every prompt; not overridable by a record.
- **Style guide version** — integer. Every generated asset stores the style version and prompt version that produced it.

---

## Design tokens

Lifted from `artifacts/admin/src/index.css` (Pixel Perfect Plans / Daybook brand). Use the existing CSS variables; hex values are given so the mocks can be matched exactly.

### Color

| Role | Hex |
| --- | --- |
| Page / workspace | `#F7F0E6` |
| Card surface | `#FFFDF9` |
| Sunken / callout panel | `#F1EAE0` |
| Warm panel (secondary) | `#FBF6EE` |
| Hairline border | `#E7DCCB` |
| Border, stronger | `#E2D6C4` |
| Button outline | `#C6BCAA` |
| Chip / inactive pill bg | `#EFE9E1` |
| Ink Navy (primary, headings) | `#1B2A4A` |
| Body text | `#2C2822` |
| Muted text | `#5F574A` |
| Meta text (non-essential only) | `#A99E8E` |
| Clay (accent, active assist) | `#C87560` |
| Clay hover | `#A85B48` |
| Link / secondary action | `#4A6080` |
| Danger text | `#b23b3b` |
| Danger bg | `#fdf0f0` |
| Success text | `#3f6b4c` |
| Success bg | `#edf4f0` |
| Disabled CTA bg | `#E0D5C4` |

**Accessibility constraint (learned the hard way in review).** `#A99E8E` is 2.33:1 on `#F7F0E6` — it is legal **only** for decorative meta (the "Worldsmith, in the margin" label, record-id monospace stamps). Any text a user must read or click uses `#5F574A` (6.30:1) or `#4A6080` (5.67:1). Do not use `#A99E8E` for links, provenance lines, or collapsed-state affordances.

### Typography

- **Spectral** (serif) — record titles, questions, section headings, numerals in stats
- **Instrument Sans** — all body and UI
- **Space Mono** — eyebrow labels, record IDs, compiled prompt text

| Use | Spec |
| --- | --- |
| Record title | Spectral 600 / 29px / 1.15 |
| Page heading | Spectral 600 / 23–25px / 1.2 |
| Assist question | Spectral 400 / 15px / 1.4 (rail), 31px / 1.35 (full-width) |
| Body | Instrument Sans 400 / 14.5px / 1.65–1.7 |
| Rail body | Instrument Sans 400 / 12.5px / 1.6 |
| Eyebrow label | Space Mono 700 / 9.5px / letter-spacing .1em, uppercase |
| Record ID | Space Mono 700 / 9.5–11px |
| Compiled prompt | Space Mono 400 / 12.5–13.5px / 1.65–1.75 |
| Pill / chip | Instrument Sans 500–600 / 11–13px |

### Geometry

- Radius: 6–8px (rows, chips), 9–10px (cards, panels), 999px (pills)
- Card border: `1px solid #E7DCCB`; active assist card: `1.5px solid #C87560`
- Shadow, assist card: `0 4px 16px rgba(200,117,96,.14)`
- Shadow, clay CTA: `0 2px 8px rgba(200,117,96,.32)`
- Top bar: 52px, `#FFFDF9`, 1px bottom border, 22px horizontal padding
- Left rail: 236px fixed
- Margin rail: 300–352px depending on tab, `border-left: 1px dashed #DCCFBB`
- Content column padding: 24px 8px 24px 28px
- Motion: 120–320ms ease-out. No bounce, no scale-on-hover.

### Layout shell

`height:100vh` → 52px top bar → `flex:1` row of [236px rail | main]. **Every content column, margin rail, and list is its own scroll region** (`overflow-y:auto` + `min-height:0` on flex children). The page itself never scrolls. This was a real bug in review — with `overflow:hidden` the record's register fields and the asset grid's second row were unreachable with no scrollbar.

---

## Screen 1 — Canon (primary)

**Purpose.** Read and enrich one canon record, with assistance in the margin that never blocks the work.

### Layout

Three columns: 236px record rail | fluid record editor | 352px margin rail.

**Left rail:** world header (code `WC`, name, one-line description, register pill in Clay), then the record list. Rows are 8px padding, 7px radius; the selected row has `#EFE9E1` background and a 3px Clay rule at its left edge. Row shows name (12px, 600 when selected) and right-aligned monospace ID. List ends with a "14 more · show all" row — never claim a count the list does not render.

**Record editor (top to bottom):**
1. ID stamp + category / layer / priority pills. Priority `Critical` uses danger colors.
2. Record title, Spectral 600 29px.
3. Card: three-column grid of Status / Confidence / Source. Confidence shows a 7px dot in its state color.
4. Divider, then `SUMMARY` and `DETAILS` blocks. Any phrase flagged in a margin note is highlighted inline: `background:#F6E7CC; border-bottom:1.5px solid #C87560`.
5. Divider, then two-column grid: **EMOTIONAL REGISTER** and **SENSORY CLAUSES**. Unset renders `Not set` / `None` in `#b23b3b`; once written, the value in `#1B2A4A`. **These two fields are the payoff of the design — they must be visible without scrolling on a 1080p window.**
6. Card: RELATED CANON as pill chips, each `ID + name`.
7. `PROMPT EFFECT` bar on `#F1EAE0` — one sentence naming what the record does and does not give the image model. Its copy changes when the materials note is answered.

### Margin rail — the assist

Header: italic Spectral "Worldsmith, in the margin", then three filter pills: **All · To resolve · Openings**.

Two note classes, visually distinguished on purpose:

| | To resolve | Openings |
| --- | --- | --- |
| Rule color | `#b23b3b` (confidence/contradiction) or `#C87560` (gap) | `#1B2A4A` |
| Eyebrow | `CONFIDENCE`, `SUMMARY`, `DETAILS · LINE 3` | `AN OPENING` |
| Extra line | — | Provenance: "Found by reading CHR-001 and CHR-002 against ART-002." (`#5F574A`, 10.5px) |
| Verbs | Close / Approve and write | Not this one / Take it |
| Resolved chip | `WRITTEN` | `TAKEN` |
| Semantics | Declining leaves the problem open | Declining is not a debt — it disappears |

Every note carries a 2px vertical rule at its left, the eyebrow, and body copy at 12.5px/1.6.

**Openings are found by reading records *against each other*** — that is the whole point, and it is the one thing a canon database knows that a writer staring at one record does not. Ship at least these three generators:
- two related characters that share no record → the missing scene
- a counted artifact set (`The Seven Keys`) against a thin category (`Symbol Dictionary`, 1 record) → symbolize the set
- a Place record that supplies a product (`Stationery House` → `The Chronicle`) → the object the customer holds is an object in the story

### Note states — implement all four

1. **Collapsed** (nothing open) — eyebrow, body, action link in `#4A6080` 11.5px 600.
2. **Peek** (another note open) — eyebrow + single truncated action line, `#4A6080` 500 11.5px, ellipsis, still clickable. This is what keeps all notes visible while one is answered.
3. **Expanded** — inline card, `1.5px solid #C87560`: question (Spectral 15px), sub-note, 2–3 options, a WRITES line, a scope line, and a two-button row. **Expanded card must stay under ~340px** or the rail overflows; keep option tag pills inline with their labels, and WRITES on one line.
4. **Resolved** — collapses to an `#edf4f0` chip: verb, chosen tag, "synced".

Options render as a row: tag pill (Clay when selected) + label. Selecting one enables the CTA (`#E0D5C4`/`#7A6F5F` when disabled → `#C87560`/white when armed).

**Scope must be stated on every note before approval.** Some writes are global ("the Estate and the Keys inherit it"), some local ("Local to this record"). A user who cannot tell those apart at the moment of approving will be hurt by the inheritance model.

### State

```
tab            'canon' | 'modules' | 'style' | 'assets'
selectedRecord index
openNote       noteId | null      // only one expanded at a time
selections     { [noteId]: optionIndex }
resolved       { [noteId]: chosenTag }
noteFilter     'all' | 'gap' | 'idea'
```

On approve: write the field(s), push to Notion, mark resolved, close the note, recompute readiness (+7 per resolution in the mock; real formula below). Nothing is written before approval — say so in the UI.

---

## Screen 2 — Prompt modules

**Purpose.** Show how canon becomes instruction. The valuable thing is the *assembly*, not the text.

Left rail lists five modules in compile order. Each row: order numeral, name, and `kind · count`.

| # | Module | Kind | Source |
| --- | --- | --- | --- |
| 1 | Subject | Per record | Record `Summary` |
| 2 | Materials | Per record | Record `Sensory clauses` |
| 3 | Register | Inherited | Style guide, unless record overrides |
| 4 | Palette & light | Global | Style guide, not overridable |
| 5 | Negatives | Global | World rules + learned rules |

Main column: module name + kind pill + count; module text in Space Mono on a card; two side-by-side cards (`ASSEMBLED FROM` — source record and field; `NOTE`); then the **compiled prompt**, rendered as five stacked lines, with the selected module's line highlighted in place (`background:#F0D5CC; border:1.5px solid #C87560`). Unselected lines are `#5F574A`.

**Precedence is a hard rule: negatives compile last.** A record can never talk its way past a world rule. State it in the UI.

Margin: coverage note ("Eight records have no Materials module — those eight produce every generic render"), plus a cross-world opening.

---

## Screen 3 — Style guides

**Purpose.** The visual law every image inherits, and where the world has drifted from it.

Four section pills: **Palette & light · Materials · Composition · Never.**

Each section: title, the rule in Spectral 15px, then a `WHY` bar on `#F1EAE0` with a right-aligned "applies to" count.

- **Palette & light** — five swatches (68px block, name, hex in mono, usage note), then two reference plates side by side: `APPROVED REFERENCE` (2px `#3f6b4c` border) and `REJECTED · WHY THE RULE EXISTS` (2px `#b23b3b`). A rejected plate teaches a collaborator faster than the rule text.
- **Materials / Composition** — rows of `term | description | source`.
- **Never** — two-column grid of hard negatives, each with its origin.

**Every rule states where it came from.** The left rail counts them: *derived from register 7 · learned from drift 4 · authored by you 6*. Most of the guide writes itself — the user judges images and the system writes rules. Implement rule provenance as a first-class field.

Margin: drift ("three approved images use lamplight as key source; they predate the rule and are now the reference set new renders imitate"), conflict (a register override without the composition change it implies), and an opening.

Versioning: style guide is versioned. Changing a rule **re-flags every image made under the previous version**. Nothing is deleted.

---

## Screen 4 — Visual assets

Left rail switches two views.

### View A — grid

Filter pills All / Approved / Flagged / Draft, with an honest "N of 6 shown" count. Grid is `repeat(3, 1fr)` with **fixed 330px rows and `align-content:start`** — never `1fr` rows, or a two-result filter stretches cards into slivers.

Card: image area with a state pill top-left (Approved `#edf4f0`/`#3f6b4c`, Flagged `#fdf0f0`/`#b23b3b`, Draft `#EFE9E1`/`#7A6F5F`), then a metadata footer with ID + title, `record · Style vN · prompt vN`, and a red violation line when flagged. Flagged cards get a `#b23b3b` border.

**Provenance is the point of this screen.** Every asset stores the record, prompt version and style version that made it, so a style change produces a precise list of images now living under a law they were not made for.

### View B — "What the set is missing"

The third class of note. It cannot come from a record or an image — only from the shape of the collection.

Left: four observations (headline + count). Right: the selected one as **a distribution, not a claim** — labelled bars with counts, zero-count rows in `#b23b3b` reading "none of them" — then `WHAT IT MEANS`, `WHAT IT WOULD UNLOCK`, and a suggested action with Not this one / Take it.

Shipped observations: all interiors (6/6) · all one camera distance · nobody appears (0/6) · always the same hour.

**The rule that makes this welcome: every observation is a count, not a judgment.** State it in the panel. The user can reject the conclusion and still trust the fact. Note that three of the four are patterns nobody chose — they are what happens when a style rule works too well, which is precisely what no record-level or image-level view can see.

---

## Readiness score

Shown in the top bar as a 70×6px track plus a Spectral numeral. It is **generation readiness** — the share of planned production items whose prompts can compile — not a completeness percentage. Suggested formula:

```
readiness = compilable_items / total_planned_items
compilable = record has Summary AND ≥1 sensory clause AND a register
             AND no unresolved contradiction on it or its relations
```

Rank all remedial work by **items unblocked**, never by severity. A cosmetic gap that blocks the cover outranks a critical-flagged record nothing depends on.

---

## Phase 2 — two surfaces not in the app file

Both are in `Worldsmith Explorations.dc.html`.

### World genesis (`8a`) — the front door

Five questions, then six starter records. Do **not** build a settings form; the blank state is what kills worlds (see the Saltfen case below).

1. The seed — one sentence, four suggested framings
2. When — period, because it drives material and light more than anything else
3. What kind — mystery / chronicle / folklore / realism; sets which categories get pushed first
4. How it feels — the default `Emotional register`
5. The rules — multi-select negatives; these become world rules

Ends by creating `PLC-001`, `INS-001`, `CHR-001`, `ART-001`, `SYM-001`, `MYS-001`, **each with a one-line reason attached**, plus the compiled base prompt. `SYM-001` is seeded deliberately because Symbol is the category that always starves.

Left rail states the constraint honestly: *every extra question at setup is a question answered badly.* The rest gets asked in the margin later, when the user has something to answer against.

### Platform admin — Canon Health (`5a`)

Daybook admin chrome, not Worldsmith's. The unit is the **world**, and the signal is **trend**, not count. Four aggregate stats, a world table (owner, records, blocker, readiness bar, state pill), an archived/draft footer row, a "What moved this week" cross-world event list, and a detail aside with coverage bars and the highest-leverage move.

The action set is platform-level — *Book a guided session* is primary, *Send a nudge* secondary. The case that justifies the view: a world with nine records, all Foundation, none linked, no sessions in three weeks. That is the blank-field wall, and no in-app nudge fixes it — the correct intervention is a person.

---

## Assets

No image assets are included. Image areas use a drop-in placeholder component (`image-slot.js`, design-time only — do not port it). In production these are DALL·E outputs stored against their asset record.

Icons: none are drawn. Daybook uses Unicode glyphs; if a real icon set is needed, Lucide at ~1.75px stroke matches the brand — confirm before standardizing.

---

## Files in this bundle

| File | Role |
| --- | --- |
| `Worldsmith App.dc.html` | **The design to build.** Four tabs, full app shell. |
| `Worldsmith Explorations.dc.html` | Option canvas, ids `1a`–`11a`. Rationale, plus genesis `8a` and admin `5a`. |
| `screens/` | Reference screenshots of every screen and key state (1440px wide). |
| `support.js` | Design-time runtime. **Do not port.** Required to open the files. |
| `image-slot.js` | Design-time image placeholder. **Do not port.** |

### Screenshots

| File | Shows |
| --- | --- |
| `01-canon-record.png` | Canon, resting state. All four margin notes collapsed; register and sensory clauses unset (red). |
| `02-canon-note-expanded.png` | A note expanded in place — the other three drop to peek lines. |
| `03-canon-openings.png` | The Openings filter — the second note class, navy, with provenance lines. |
| `04-prompt-modules.png` | Module selected, highlighted in place inside the compiled prompt. |
| `05-style-guides.png` | Palette & light with swatches and approved/rejected reference plates. |
| `06-visual-assets.png` | Asset grid with state pills, provenance lines and flagged violations. |
| `07-set-observations.png` | "What the set is missing" — observations as distributions. |

Screenshots are captured at 1440px logical width. Empty image areas are drop-target placeholders, not missing assets.

Source of truth for the chrome: `artifacts/admin/src/components/studio/StudioLayout.tsx` and `artifacts/admin/src/index.css` in `Transition-Trails/Daybook`. Record IDs, categories, layers and field vocabulary come from the Notion WorldSmith Living Archive (Canon Records).

---

## Build order

1. Add the three Canon Records fields in Notion + local tables, with the cascade decision made.
2. Canon screen, read-only — record editor and chrome.
3. Margin rail with the four note states, the two note classes, and gap detection.
4. Approve → write → Notion sync → readiness recompute.
5. Opening generators (the three relationship reads above).
6. Prompt modules and the compiler, with negatives-last precedence.
7. Style guides with rule provenance and versioning.
8. Visual assets with provenance and re-flagging.
9. Set-level observations.
10. Phase 2: genesis, then platform Canon Health.
