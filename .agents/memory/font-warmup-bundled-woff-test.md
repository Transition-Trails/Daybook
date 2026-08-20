---
name: Font warmup bundled-WOFF test pattern
description: When bundled WOFFs exist in src/lib/fonts/, warmup tests that poll /tmp disk files will always time-out.
---

## Rule
Do NOT poll `_diskCachePath(family, weight)` as a warmup-completion proxy when the family has a bundled WOFF in `src/lib/fonts/`.

`fetchGoogleFontBytes` has three resolution levels:
1. In-process cache (fastest)
2. **Bundled WOFF** — `src/lib/fonts/<Family>-<weight>.woff` (shipped with server)
3. Disk cache `/tmp/gfont-cache/<Family>-<weight>.ttf` (network path only)

When the bundled file is found AND passes `detectFontFormat` (77 4f 46 46 magic), the function returns immediately **without calling `_writeDiskFontCache`**. The /tmp file is never written.

**Why:** The bundled shortcut was added to make PDF generation offline-safe. Tests written before bundling assumed all fonts came from the network and would land in /tmp.

## How to apply
In warmup tests:
- Use `waitForWarmupDone()` (polls `getWarmupStatus().phase === "done"`) instead of `waitForFile(diskPath…)`.
- Assert the **in-process cache** (`_googleFontCache.has("Family:weight")`) rather than disk presence.
- If you need to check the disk path anyway, gate the assertion on `!existsSync(_bundledFontPath(family, weight))`.

Lora, Playfair Display, and all 17 bundled families follow this pattern as of the current codebase.
