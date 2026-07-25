---
name: Planner gap closure (Items 1-6)
description: Six gap items closed after Planner Studio merged; what's done and what's schema-only.
---

## Item 1 — Hyperlink Maps (FULLY DONE)
- plannerHotspotsTable: DB pushed; routes at /stores/:storeId/planners/hotspots (CRUD + auto-detect)
- planner-hotspots.ts mounted in routes/index.ts
- pdf-template.ts: weeklyIndex in StampContext+StaticResolutionCtx; next-week/prev-week in resolveStaticTarget; stampUserHotspots() function
- pdf-generator.ts: hotspotsByTemplate param in buildPdf; weeklyIndex tracking; stampUserHotspots after every stampPageZones
- planners.ts: runGeneration now accepts and threads hotspotsByTemplate
- store-planners.ts: loads plannerHotspotsTable rows before both runGeneration calls (create + reexport)
- api.ts: plannerHotspotsApi + PlannerHotspot / HotspotInput / ProposedHotspot types
- HotspotEditor.tsx: full SVG draw-mode editor with auto-detect (Claude vision), accept/reject, save

## Item 2 — buildPdf reads stored settings (FULLY DONE)
- PAGE_SIZES: a4/a5/b6/personal/half-letter/letter/ipad-4-3 (points)
- style.size → actual page dimensions in both buildPdf and buildPreviewPdf
- drawBindingHardware(): coil/twin-loop/disc/3-ring × finish colours; vector primitives per page
- cover page: coverTitle/coverSubtitle/coverYear applied; accent stripe on portrait covers
- renderStyle defaults to "realistic" (grain XObject in buildPdf; grain in buildPreviewPdf)

## Item 3 — Undated/Perpetual layouts (FULLY DONE)
- datingMode read from setup JSONB in buildPdf
- Headings adapt: undated→"Month/Week/Day N", perpetual→name only, dated→name+year
- Year overview heading adapts ("Year Overview" vs "${startYear} Overview")

## Item 4 — Migration + taxonomy (FULLY DONE)
- i3 (Washi tape strip) + i6 (Floral cover spray) migrated from insertsTable → stickersLibraryTable
- storeInsertsTable in catalog.ts: seller-authored SVG full-page inserts (no routes yet)
- Both pushed to DB

## Item 5 — Theme model (SCHEMA ONLY — no generator wiring)
- ThemeFontPairing: 5th slot "button" added
- ThemeBackgroundRoles interface: cover/divider/notePaper/calendar/weekly/daily → backgroundId
- backgroundRoles column on themesTable, pushed to DB
- Generator does NOT yet read backgroundRoles; uses existing priority chain

## Item 6 — Tab groups (SCHEMA ONLY — no generator wiring)
- TabGroup interface + tabGroups field on PlannerStyle
- Supports right/top/bottom/spine edge rails with items[] + labels[]
- Generator does NOT yet render tabGroups; tabPos still controls rail placement

**Why:**
Items 5-6 wiring requires non-trivial changes to stampTabRail and background resolution
in pdf-generator.ts + pdf-template.ts. Schema-first was the right order.
