---
name: Planner bounded-slot composition
description: UX and geometry rule for composing widgets in Super Admin planner templates
---

Super Admin planner construction is template-first. Widget placement must use explicit, visible slots inside the page safe area rather than unrestricted freeform positioning. A widget consumes one available slot, an occupied slot cannot accept another widget, and deletion frees that slot.

**Why:** The user found the mode-first and freeform interfaces difficult to understand. The Planify-style model makes capacity and placement consequences visible while guaranteeing that content never exceeds the printable page area.

**How to apply:** Preserve full-page inserts as pages, not overlays. Keep persisted coordinates compatible with canonical preview/export geometry, and make digital and physical output settings contextual to the selected template rather than separate construction flows.