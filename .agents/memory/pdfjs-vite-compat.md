---
name: pdfjs-dist Vite compatibility
description: pdfjs-dist as an npm dep corrupts Vite's dep-optimizer graph; use CDN dynamic import instead.
---

## Rule
Never add `pdfjs-dist` (or any large, worker-based PDF library) as an npm dependency in a Vite project.

## Why
Vite's dep optimizer (esbuild) pre-bundles all packages it finds via static or dynamic imports — including `import("pdfjs-dist")` inside a `useEffect`. The 847KB pdfjs-dist bundle broke the optimization graph after a cache clear, causing React (`react-dom`) to fail to load silently. The app showed a blank paper-cream page (from the CSS body background) with no console errors and no React DevTools message.

## How to apply
Load pdf.js from CDN via a `/* @vite-ignore */` dynamic import inside the component that needs it:

```tsx
const PDFJS_BASE = "https://unpkg.com/pdfjs-dist@6.1.200/build";
const pdfjsLib = await import(/* @vite-ignore */ `${PDFJS_BASE}/pdf.min.mjs`);
pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;
```

The `/* @vite-ignore */` comment prevents Vite from crawling the import URL and pre-bundling it.

## Symptoms of the bug
- App shows flat paper-cream background (`hsl(35 52% 94%)`) with zero visible content
- Browser console shows `[vite] connecting... connected.` but NO React DevTools `[info]` message
- No API calls (no 401s in API server logs)
- All dep files present and correct size in `.vite/deps/`
- Error is SILENT — no console.error, no network errors, no overlay

## Diagnosis steps
1. Clear `.vite/deps/` and restart → if React DevTools message disappears, a dep is corrupting the graph
2. Check which dep is new/large: `ls -la node_modules/.vite/deps/`
3. Move that dep to CDN loading with `/* @vite-ignore */`
