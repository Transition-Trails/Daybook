# Kickoff prompt for Replit

Paste everything below into the Replit agent, with `design_handoff_worldsmith/` uploaded to the repo.

---

You are building **Worldsmith**, a feature inside our existing Daybook app (this repo). Read `design_handoff_worldsmith/README.md` in full before writing any code — it is the specification. The screenshots in `design_handoff_worldsmith/screens/` show every screen and key state.

**What Worldsmith is.** It is where a world owner writes the canon records that make a fictional world specific enough for DALL·E to render consistently. Its real job is not data entry — a complete canon database still produces generic images. Worldsmith earns its place by asking the questions whose answers make a picture possible, catching contradictions before they compound, and proposing story openings the owner has not thought of.

**Read these first, and match them exactly:**
- `artifacts/admin/src/components/studio/StudioLayout.tsx` — the studio shell. Reuse it; do not rebuild the chrome.
- `artifacts/admin/src/index.css` — the design tokens. Use the existing CSS variables, never raw hex.

**About the HTML files in the handoff.** They are design references, not production code. They run on a design-time component runtime (`support.js`, `image-slot.js`) — do not port either. Open them in a browser to see intended behavior, then rebuild in our React + TypeScript stack using our existing patterns.

## Before you write code

Confirm two things with me:

1. **Register cascade depth.** `Emotional register` inherits down record relations. Direct relations only, or transitive? This changes the data layer.
2. **Notion sync direction** for the three new fields — do we write on approval and let Notion win on conflict, or the reverse?

Then propose your schema migration for review before running it.

## Build in this order — stop after each numbered step and show me

1. **Schema.** Add three fields to Canon Records in Notion and the local synced tables: `Emotional register` (select), `Sensory clauses` (multi-line text), `Register locked` (checkbox). Plus `World rules` (string array) and `Style guide version` (int) on the world.
2. **Canon screen, read-only.** Record editor and chrome, no assist yet. The `EMOTIONAL REGISTER` / `SENSORY CLAUSES` row must be visible without scrolling on a 1080p window — it is the payoff of the whole design.
3. **Margin rail.** Four note states (collapsed, peek, expanded, resolved), two note classes (To resolve, Openings), gap detection only.
4. **The write loop.** Approve → write field → sync to Notion → mark resolved → recompute readiness. Nothing is written before approval, and the UI says so.
5. **Opening generators.** Three relationship reads, described in the README.
6. **Prompt modules** and the compiler, with negatives-last precedence.
7. **Style guides** with rule provenance and versioning.
8. **Visual assets** with provenance and re-flagging on style version change.
9. **Set-level observations.**

Phase 2, not now: world genesis and the platform admin Canon Health view.

## Rules that are not negotiable

- **Assist never blocks.** The record stays visible and editable at all times. No modal ever interrupts writing.
- **Nothing is written without approval,** and every write is reversible from record history.
- **Every note states its scope before you approve it** — global writes cascade to related records, local ones do not. A user who cannot tell them apart will be hurt by the inheritance model.
- **Openings are a distinct class from problems.** Different color, different verbs (Take it / Not this one), and declining one leaves no trace. A margin that only reports faults trains people to dread it.
- **Set-level observations are counts, not judgments.** Always show the distribution that produced the claim.
- **Negatives compile last.** A record can never override a world rule.
- **Every scrollable region scrolls independently** — content column, margin rail, sidebar lists, asset grid. The page itself never scrolls. Use `overflow-y:auto` with `min-height:0` on flex children.
- **Contrast.** `#A99E8E` is decoration only (2.33:1). Anything readable or clickable uses `#5F574A` or `#4A6080`.
- **Rank remedial work by items unblocked, never by severity.** A cosmetic gap blocking the cover outranks a critical-flagged record nothing depends on.
- Follow our existing voice: calm, concrete, second person, no hype, no emoji.

## Definition of done for step 4

I can open `WC-INS-001` with no register set, click "Say what it looks like", pick an option, approve it, and watch the record's own register and sensory-clause fields change from red "Not set" to the value I chose, the PROMPT EFFECT line rewrite itself, and the readiness score climb — with the change present in Notion.
