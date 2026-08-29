---
name: Planner bounded-slot composition
description: UX and geometry rule for composing widgets in Super Admin planner templates
---

Super Admin planner construction is template-first. Widget placement must use explicit, visible slots inside the page safe area rather than unrestricted freeform positioning. A widget consumes one available slot, an occupied slot cannot accept another widget, and deletion frees that slot.

**Why:** The user found the mode-first and freeform interfaces difficult to understand. The Planify-style model makes capacity and placement consequences visible while guaranteeing that content never exceeds the printable page area.

**How to apply:** Preserve full-page inserts as pages, not overlays. Keep persisted coordinates compatible with canonical preview/export geometry, and make digital and physical output settings contextual to the selected template rather than separate construction flows.

Planner page order is user-authored and persists as stable page-role/index pairs. Reordering changes serialization position only; widget targets and link IDs retain their original identities. Reconcile saved order against the generated page set and append newly generated pages so personalization changes cannot lose pages or corrupt an older template.

**Why:** Page counts can change when planner personalization changes, while widgets and links still need stable targets across drag reordering, preview, and final export.

**How to apply:** Use the same reconciled order in the canvas rail, preview selection, and PDF page creation. Ignore stale or duplicate saved entries and preserve canonical behavior when no order has been saved.

Selected-template Build mode is an immersive workspace: hide the outer template rail and studio mode pills, retain only a compact Templates exit control and the planner's own page rail. A two-page setting must render immediately as a wide spread with a center gutter, including before setup is saved.

**Why:** Stacking the studio mode navigation, template rail, and planner page rail distracts from page construction. Reading only persisted orientation also makes the canvas contradict unsaved Build settings.

**How to apply:** Keep template selection and cross-studio navigation outside focused Build. Drive canvas geometry from the live Build state, falling back to persisted setup only before live state is available.

The shared admin navigation can collapse to a persistent 64px icon rail so focused planner work can reclaim the full content width; icon links must retain accessible labels and active-state styling.

**Why:** The global navigation otherwise competes with the planner workspace even after the studio’s own outer rail is hidden.

**How to apply:** Persist the collapsed preference locally, keep a visible accessible expand/collapse control, and leave the planner page rail and canvas independent of the global rail state.

The Super Admin template canvas uses two persistent panels: Planner personalization contains page/widget composition and PDF preview; Structural visual system & output contains setup, theme, typography, inserts, binding, e-ink, generation, and publishing controls.

**Why:** Separating page-level personalization from system-level template decisions keeps the primary canvas focused while retaining the existing complete build workflow.

**How to apply:** Keep both panels mounted while switching tabs so unsaved local form state is preserved.

Reusable page layouts are immutable snapshots assigned by page, range, or matching page type. Bind scoped widgets to sections on the layout assignment—not on the global widget placement—and hide incompatible widgets per assignment.

**Why:** A matching widget may appear on hundreds of pages. Mutating or deleting its global placement when only one page changes layout silently alters every unaffected page and makes canvas/PDF geometry diverge.

**How to apply:** Resolve the latest applicable assignment in canvas and PDF. Store page-keyed bindings/hides for mixed scopes plus collision-safe defaults for matching placements so future generated pages inherit the same bounds.

Editable planner grids are optional layout metadata layered over the immutable resolved sections contract. Landscape spreads own independent left/right grids; portrait pages own one page grid. Grid edits regenerate stable row/column section IDs without replacing normalized placement geometry.

**Why:** The editor needs row, column, and bounded-size controls without breaking existing saved compositions or creating a second preview/export geometry model.

**How to apply:** Keep each grid inside its page-side safe area, cap the combined result at 24 sections, preserve assignments whose section IDs survive an edit, and warn before removing occupied cells.

Individual grid cells may override their generated horizontal position, width, and height while retaining the same stable section ID. Left- and right-edge resizing must stop at the page-side boundary or neighboring cell and remain part of the resolved sections contract.

**Why:** Equal-size grid controls are not sufficient for mixed widget proportions, but freeform movement would reintroduce overlap and gutter-crossing risks.

**How to apply:** Persist cell geometry as optional overrides keyed by section ID, accept legacy width/height-only overrides, validate values at the API boundary, and reset overrides when the parent grid structure changes.

Landscape layout dimensions are per page, not per spread. For example, a two-column layout creates two columns on the left page and two columns on the right page.

**Why:** Treating a spread-level “two-column” choice as two cells total produces only one usable column per physical page and contradicts the layout label.

**How to apply:** Infer rows and columns from legacy non-grid layouts, create independent left/right grids with those dimensions, and keep grid and cell IDs layout-scoped so saved assignments remain collision-safe.

New landscape defaults reserve a 6% total ring zone at the spread seam: content ends at 47% on the left and begins at 53% on the right.

**Why:** The ring hardware occupies one shared center zone. Reusing the separate 10% physical binding-containment value as a spread gutter makes the two page designs look artificially far apart.

**How to apply:** Keep the editor’s dotted safe-area guides, center gutter, and default grid bounds aligned at 47%/53%. Preserve the separate alternating 10% binding-edge containment rule for physical export.

The Planner Studio assistant receives a compact, template-scoped snapshot only when a question is sent. It includes the active page, bounded-slot state, selected widget, and current personalization/system/output choices, but never raw assets or PDF data.

**Why:** Recommendations need to follow the user’s exact page and unsaved settings without leaking stale state when templates or studio modes change.

**How to apply:** Scope live context to the selected template, clear it outside Build mode, sanitize and bound all text/list values, and keep the assistant read-only.