---
name: Studio rail scroll
description: StudioLayout aside is overflow-hidden; each rail component owns its own scroller to prevent nested scrollbars
---

## Rule
StudioLayout's left aside is `overflow-hidden flex flex-col`. Each rail content block is responsible for its own scrolling.

**Why:** If aside has `overflow-y-auto` AND the build rail's inner div also has `overflow-y-auto`, browsers show two simultaneous scrollbars — one on the aside and one inside the content. This looks broken and wastes width.

**How to apply:**
- Build rail: wrap in `<div className="flex flex-col h-full">` with inner `<div className="flex-1 overflow-y-auto ...">` for content and a `<div className="border-t ... shrink-0">` for the pinned bottom section. The `h-full` fills the `overflow-hidden flex-col` aside.
- All other rails (Editions, Inserts, Theme, stub): wrap content in `<div className="flex-1 overflow-y-auto">` — the `flex-1` fills the aside's flex layout.
- Apply `style={THIN_SCROLL}` (`scrollbarWidth: "thin", scrollbarColor: "rgba(0,0,0,0.12) transparent"`) to every independently-scrollable div for a slim, unobtrusive scrollbar.
- Rail background: `#FFFDF9` (warm white) with `borderColor: hsl(var(--border))`.
