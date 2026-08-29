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

The Planner Studio assistant receives a compact, template-scoped snapshot only when a question is sent. It includes the active page, bounded-slot state, selected widget, and current personalization/system/output choices, but never raw assets or PDF data.

**Why:** Recommendations need to follow the user’s exact page and unsaved settings without leaking stale state when templates or studio modes change.

**How to apply:** Scope live context to the selected template, clear it outside Build mode, sanitize and bound all text/list values, and keep the assistant read-only.