---
name: Studio active-chip contrast
description: --primary is clay (fails AA), always use Ink Navy for active chip fills in all studio primitives
---

## Rule
Never use `bg-primary text-primary-foreground` for active chip/pill fills in studio components.

**Why:** `--primary` in this project is clay/coral (HSL 12 49% 58%, ≈ #C87560). White on that background = ~3.5:1, which fails WCAG AA 4.5:1 for normal text.

**How to apply:**
- Import `CHIP_ACTIVE_BG` and `CHIP_ACTIVE_CLS` from `@/components/studio/primitives`
- Apply as: `style={{ background: CHIP_ACTIVE_BG }}` + `className={CHIP_ACTIVE_CLS}` (gives text-white border-[#1B2A4A])
- Ink Navy `#1B2A4A` + white = ~16:1 ✓
- The same rule applies to mode pills in StudioLayout and primary action buttons in the top bar
- SegmentedControl active uses `bg-card text-foreground shadow-sm` (not navy fill) — that's fine, it's an inline toggle not a chip
