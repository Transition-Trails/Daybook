/**
 * ══════════════════════════════════════════════════════════════════
 *  12-MONTH PDF LINK SURVIVAL TEST
 *
 *  CI job:  pnpm --filter @workspace/api-server run test:links
 *  ── DO NOT include this file in the normal `pnpm test` run ──
 *  It generates four full-weight PDFs (~60–120 s total) and must
 *  live in a separate slow job.
 *
 *  WHAT IS VERIFIED
 *  ─────────────────────────────────────────────────────────────────
 *  Every Link annotation in every generated PDF is extracted with
 *  pdf-lib and checked for four properties:
 *
 *  1. Internal GoTo links  — destination page ref exists in the doc.
 *  2. URI links            — well-formed scheme (https://, webcal://,
 *                            or data:text/calendar).
 *  3. Geometry             — no rect extends outside the page MediaBox.
 *  4. Overlaps             — no two link rects on the same page overlap.
 *
 *  Additional targeted assertions:
 *  • Page-ID set includes the Feb 29 leap-year date (2024) and the
 *    Dec 31 / Jan 1 year-boundary dates (using a 14-month config).
 *  • Undated variant contains zero calendar URI links.
 *  • Landscape variant pages are wider than tall; links are in bounds.
 *  • reMarkable e-ink variant (linksQuality="full") retains all links.
 *
 *  Any failure is logged as "🚨 RELEASE BLOCKER" and fails the suite.
 * ══════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFName,
  PDFRef,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import {
  buildPdf,
  generatePageIds,
  flattenPageIds,
  type GeneratorConfig,
} from "../lib/pdf-generator.js";

// ── Config factory ────────────────────────────────────────────────────────────

function makeConfig(overrides: {
  startYear?:   number;
  startMonth?:  number;
  monthCount?:  number;
  datingMode?:  string;
  orientation?: string;
  calMode?:     string;
  sections?:    string[];
} = {}): GeneratorConfig {
  return {
    setup: {
      startYear:   overrides.startYear  ?? 2024,
      startMonth:  overrides.startMonth ?? 0,    // January
      monthCount:  overrides.monthCount ?? 12,
      weekStart:   "mon",
      orientation: overrides.orientation ?? "vertical",
      datingMode:  overrides.datingMode  ?? "dated",
    } as any,
    style: {
      size:        "a5",
      tabPos:      "right",
      renderStyle: "realistic",
      notePaper:   "dot",
    } as any,
    output: {
      calMode:   (overrides.calMode ?? "link") as "link" | "overlay" | "none",
      eventMins: 60,
      aiInPdf:   false,
    } as any,
    sections: overrides.sections ?? ["Work", "Personal", "Health", "Goals"],
  };
}

// ── Link annotation extractor ─────────────────────────────────────────────────

export interface GoToLink {
  kind:      "goto";
  pageIndex: number;
  pageW:     number;
  pageH:     number;
  rect:      [number, number, number, number];
  destRef:   PDFRef | null;
}
export interface UriLink {
  kind:      "uri";
  pageIndex: number;
  pageW:     number;
  pageH:     number;
  rect:      [number, number, number, number];
  url:       string;
}
export type LinkAnnotation = GoToLink | UriLink;

/**
 * Walk every page's Annots array and return all Link annotations found.
 * Tolerant: silently skips malformed objects without throwing.
 */
export function extractAllLinks(doc: PDFDocument): LinkAnnotation[] {
  const links: LinkAnnotation[] = [];
  const pages = doc.getPages();

  for (const [pageIndex, page] of pages.entries()) {
    const { width: pageW, height: pageH } = page.getSize();

    const rawAnnots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!rawAnnots) continue;

    for (let i = 0; i < rawAnnots.size(); i++) {
      try {
        const item    = rawAnnots.get(i);
        const annotObj =
          item instanceof PDFRef
            ? doc.context.lookup(item, PDFDict)
            : item instanceof PDFDict
              ? item
              : null;
        if (!annotObj) continue;

        const subtype = annotObj.lookupMaybe(PDFName.of("Subtype"), PDFName);
        if (subtype?.asString() !== "/Link") continue;

        const rectArr = annotObj.lookupMaybe(PDFName.of("Rect"), PDFArray);
        const rect: [number, number, number, number] = rectArr
          ? [
              (rectArr.get(0) as PDFNumber).asNumber(),
              (rectArr.get(1) as PDFNumber).asNumber(),
              (rectArr.get(2) as PDFNumber).asNumber(),
              (rectArr.get(3) as PDFNumber).asNumber(),
            ]
          : [0, 0, 0, 0];

        // ── GoTo (internal destination) ──────────────────────────────────────
        const dest = annotObj.lookupMaybe(PDFName.of("Dest"), PDFArray);
        if (dest) {
          const item0 = dest.get(0);
          const destRef = item0 instanceof PDFRef ? item0 : null;
          links.push({ kind: "goto", pageIndex, pageW, pageH, rect, destRef });
          continue;
        }

        // ── URI (calendar / external link) ───────────────────────────────────
        const action = annotObj.lookupMaybe(PDFName.of("A"), PDFDict);
        if (action) {
          const s = action.lookupMaybe(PDFName.of("S"), PDFName);
          if (s?.asString() === "/URI") {
            const uriObj = action.lookup(PDFName.of("URI"));
            let url = "";
            if (uriObj instanceof PDFString) {
              // PDFString: the spec-correct format for URI values
              url = uriObj.decodeText();
            } else if (uriObj) {
              const raw = uriObj.toString();
              if (raw.startsWith("(") && raw.endsWith(")")) {
                // PDF literal string
                url = raw.slice(1, -1);
              } else if (raw.startsWith("<") && raw.endsWith(">")) {
                // PDF hex string
                const hex = raw.slice(1, -1).replace(/\s/g, "");
                url = (hex.match(/.{1,2}/g) ?? [])
                  .map((h) => String.fromCharCode(parseInt(h, 16))).join("");
              } else if (raw.startsWith("/")) {
                // PDF Name (non-standard but used by pdf-lib's context.obj() in some
                // versions when the URI is not explicitly wrapped in PDFString.of()).
                // Decode the #HH percent-encoding and strip the leading slash.
                url = raw.slice(1)
                  .replace(/#([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
              } else {
                url = raw;
              }
            }
            links.push({ kind: "uri", pageIndex, pageW, pageH, rect, url });
          }
        }
      } catch {
        // skip unparseable annotation
      }
    }
  }
  return links;
}

// ── Assertion helpers ─────────────────────────────────────────────────────────

/** Check every GoTo link reaches a real page in the document. */
export function assertInternalLinksResolve(
  links: LinkAnnotation[],
  doc: PDFDocument,
): string[] {
  const validPageRefs = new Set(doc.getPages().map((p) => p.ref.objectNumber));
  const failures: string[] = [];

  for (const link of links) {
    if (link.kind !== "goto") continue;
    if (!link.destRef) {
      failures.push(
        `🚨 RELEASE BLOCKER — GoTo on PDF page ${link.pageIndex + 1} has a null destination ref`,
      );
    } else if (!validPageRefs.has(link.destRef.objectNumber)) {
      failures.push(
        `🚨 RELEASE BLOCKER — GoTo on PDF page ${link.pageIndex + 1} points to ` +
        `non-existent object ref ${link.destRef.objectNumber}/${link.destRef.generationNumber}`,
      );
    }
  }
  return failures;
}

/** Check every URI link has a well-formed scheme. */
export function assertUriLinksWellFormed(links: LinkAnnotation[]): string[] {
  const VALID_PREFIXES = [
    "https://",
    "http://",
    "webcal://",
    "data:text/calendar",
  ];
  const failures: string[] = [];

  for (const link of links) {
    if (link.kind !== "uri") continue;
    if (!VALID_PREFIXES.some((p) => link.url.startsWith(p))) {
      failures.push(
        `🚨 RELEASE BLOCKER — URI on PDF page ${link.pageIndex + 1} has invalid scheme: ` +
        `"${link.url.slice(0, 100)}"`,
      );
    }
  }
  return failures;
}

/** Check no link rect extends outside the page's MediaBox trim (2 pt tolerance). */
export function assertWithinTrim(links: LinkAnnotation[]): string[] {
  const EPS = 2;
  const failures: string[] = [];

  for (const link of links) {
    const [x1, y1, x2, y2] = link.rect;
    if (
      x1 < -EPS ||
      y1 < -EPS ||
      x2 > link.pageW + EPS ||
      y2 > link.pageH + EPS
    ) {
      failures.push(
        `🚨 RELEASE BLOCKER — Link on PDF page ${link.pageIndex + 1} extends outside trim: ` +
        `rect [${x1.toFixed(0)}, ${y1.toFixed(0)}, ${x2.toFixed(0)}, ${y2.toFixed(0)}] ` +
        `vs page ${link.pageW.toFixed(0)}×${link.pageH.toFixed(0)}`,
      );
    }
  }
  return failures;
}

/**
 * Check no two link rects on the same page have overlapping areas.
 * Touching edges (≤ 1 pt) are allowed.
 */
export function assertNoOverlaps(links: LinkAnnotation[]): string[] {
  // Group by page
  const byPage = new Map<number, LinkAnnotation[]>();
  for (const link of links) {
    const arr = byPage.get(link.pageIndex) ?? [];
    arr.push(link);
    byPage.set(link.pageIndex, arr);
  }

  const failures: string[] = [];
  const EPS = 1;

  for (const [pageIndex, pageLinkArr] of byPage) {
    for (let i = 0; i < pageLinkArr.length; i++) {
      for (let j = i + 1; j < pageLinkArr.length; j++) {
        const a = pageLinkArr[i]!.rect;
        const b = pageLinkArr[j]!.rect;
        const xOverlap = a[0] < b[2] - EPS && a[2] > b[0] + EPS;
        const yOverlap = a[1] < b[3] - EPS && a[3] > b[1] + EPS;
        if (xOverlap && yOverlap) {
          failures.push(
            `🚨 RELEASE BLOCKER — Overlapping links on PDF page ${pageIndex + 1}: ` +
            `[${a.map((n) => n.toFixed(0)).join(",")}] ∩ [${b.map((n) => n.toFixed(0)).join(",")}]`,
          );
          if (failures.length >= 20) return failures; // cap noise
        }
      }
    }
  }
  return failures;
}

// ── Pre-generated PDFs (generated once in beforeAll, validated in sub-tests) ──

let standardResult:   { buffer: Uint8Array; pageCount: number };
let einkResult:       { buffer: Uint8Array; pageCount: number };
let undatedResult:    { buffer: Uint8Array; pageCount: number };
let landscapeResult:  { buffer: Uint8Array; pageCount: number };
let yearBoundaryResult: { buffer: Uint8Array; pageCount: number };

const STANDARD_CFG  = makeConfig();
const YEAR_BOUNDARY_CFG = makeConfig({ startYear: 2023, startMonth: 11, monthCount: 14 });
//  ↑ Dec 2023 → Jan 2024 — covers Dec 31 2023 and Jan 1 2024

beforeAll(async () => {
  [standardResult, einkResult, undatedResult, landscapeResult, yearBoundaryResult] =
    await Promise.all([
      buildPdf(STANDARD_CFG),
      // reMarkable: linksQuality="full" — all GoTo annotations are preserved
      buildPdf(makeConfig(), undefined, undefined, undefined, undefined, undefined, false, "remarkable"),
      // calMode:"none" so the undated suite can meaningfully assert zero URI links
      // (contrast: all dated variants use calMode:"link" and assert > 0 URI links)
      buildPdf(makeConfig({ datingMode: "undated", calMode: "none" })),
      buildPdf(makeConfig({ orientation: "landscape" })),
      buildPdf(YEAR_BOUNDARY_CFG),
    ]);
}, 240_000 /* 4 minutes — 5 real PDFs, generous for CI */);

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 1: Standard 12-month portrait, 2024 (leap year)
// ══════════════════════════════════════════════════════════════════════════════

describe("PDF link survival — standard 12-month portrait 2024 (leap year)", () => {

  it("generates a non-trivial PDF (sanity gate)", () => {
    expect(standardResult.buffer.length).toBeGreaterThan(100_000);
    expect(standardResult.pageCount).toBeGreaterThan(300);
  });

  it("page-ID set contains all required structural and date IDs", () => {
    const map  = generatePageIds(STANDARD_CFG);
    const flat = flattenPageIds(map);
    const ids  = new Set(flat);

    // Core structure
    expect(ids.has("cover"), "cover page").toBe(true);
    expect(ids.has("home"),  "home page").toBe(true);
    expect(ids.has("year"),  "year page").toBe(true);
    expect(ids.has("todo"),  "todo page").toBe(true);
    expect(ids.has("notes"), "notes page").toBe(true);

    // 12 months
    expect(map.monthDividers).toHaveLength(12);
    expect(map.monthCalendars).toHaveLength(12);

    // 4 sections → 4 section dividers
    expect(map.sectionDividers).toHaveLength(4);

    // Leap-year boundary
    expect(ids.has("d20240101"), "Jan 1 2024").toBe(true);
    expect(ids.has("d20241231"), "Dec 31 2024").toBe(true);
    expect(ids.has("d20240228"), "Feb 28 2024").toBe(true);
    expect(ids.has("d20240229"), "Feb 29 2024 (leap day)").toBe(true);
  });

  it("page count in generated PDF covers all flattenPageIds pages", async () => {
    const doc  = await PDFDocument.load(standardResult.buffer);
    const flat = flattenPageIds(generatePageIds(STANDARD_CFG));
    // The generator may add extra structural pages (e.g. even-up blank for print).
    // Assert at least one PDF page per modelled page ID.
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(flat.length);
    // Log the delta for visibility
    const delta = doc.getPageCount() - flat.length;
    if (delta > 0) console.log(`[link-survival] ${delta} extra structural page(s) beyond pageIdMap`);
  }, 30_000);

  it("every GoTo link resolves to a real page", async () => {
    const doc      = await PDFDocument.load(standardResult.buffer);
    const links    = extractAllLinks(doc);
    const failures = assertInternalLinksResolve(links, doc);
    const gotos    = links.filter((l) => l.kind === "goto");

    if (failures.length) console.error(failures.slice(0, 20).join("\n"));

    console.log(
      `[link-survival/standard] ${links.length} total annotations, ` +
      `${gotos.length} GoTo, ${links.length - gotos.length} URI — ` +
      `${doc.getPageCount()} pages`,
    );

    expect(gotos.length, "planner must have many GoTo links").toBeGreaterThan(200);
    expect(failures, "Release blockers — see log above").toHaveLength(0);
  }, 60_000);

  it("URI links are present and every one is well-formed", async () => {
    const doc   = await PDFDocument.load(standardResult.buffer);
    const links = extractAllLinks(doc);
    const uris  = links.filter((l) => l.kind === "uri");
    // With calMode="link", the generator emits a Google Calendar URI on every
    // weekly and daily page — so a 12-month planner must have hundreds of them.
    expect(uris.length, "dated planner with calMode=link must emit URI annotations").toBeGreaterThan(300);
    const failures = assertUriLinksWellFormed(links);
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures, "Release blockers — see log above").toHaveLength(0);
  }, 60_000);

  it("calendar.google.com URI annotations appear on dated day pages (calMode=link)", async () => {
    // Regression guard: calMode="link" must emit real Google Calendar deep-links,
    // not just any URI.  Previously this was vacuously true because neither dated
    // nor undated variants produced URI annotations — the generator silently
    // ignored a non-supported calMode value.
    //
    // Architecture note: calendar integration is annotation-only (no QR codes,
    // no separate ICS file).  calMode="link" → calendar.google.com deep-links;
    // calMode="overlay" → data:text/calendar ICS URIs; calMode="none" → no URIs.
    const doc  = await PDFDocument.load(standardResult.buffer);
    const uris = extractAllLinks(doc).filter((l): l is UriLink => l.kind === "uri");

    const calendarUris = uris.filter((l) => l.url.includes("calendar.google.com"));
    console.log(
      `[link-survival/standard] ${calendarUris.length} calendar.google.com URI annotations ` +
      `out of ${uris.length} total URIs`,
    );
    expect(
      calendarUris.length,
      "🚨 RELEASE BLOCKER — calMode=link must produce calendar.google.com annotations on dated pages",
    ).toBeGreaterThan(0);

    // Spot-check: every google calendar URI must carry the expected query params.
    const malformed = calendarUris.filter(
      (l) => !l.url.includes("action=TEMPLATE") || !l.url.includes("dates="),
    );
    if (malformed.length) {
      console.error(
        "Malformed Google Calendar URIs:\n" +
        malformed.slice(0, 5).map((l) => `  page ${l.pageIndex + 1}: ${l.url}`).join("\n"),
      );
    }
    expect(malformed, "Google Calendar URIs must include action=TEMPLATE and dates= params").toHaveLength(0);
  }, 60_000);

  it("no link rect extends outside the page trim", async () => {
    const doc      = await PDFDocument.load(standardResult.buffer);
    const failures = assertWithinTrim(extractAllLinks(doc));
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures, "Release blockers — see log above").toHaveLength(0);
  }, 60_000);

  it("no two link hotspots overlap on the same page", async () => {
    const doc      = await PDFDocument.load(standardResult.buffer);
    const failures = assertNoOverlaps(extractAllLinks(doc));
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures, "Release blockers — see log above").toHaveLength(0);
  }, 60_000);

});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 2: Date-boundary assertions
// ══════════════════════════════════════════════════════════════════════════════

describe("PDF link survival — date boundary assertions", () => {

  it("Dec 31 → Jan 1 year boundary: both dailies exist and links resolve", async () => {
    const map  = generatePageIds(YEAR_BOUNDARY_CFG);
    const flat = flattenPageIds(map);
    const ids  = new Set(flat);

    // Both sides of the Dec 31 / Jan 1 year boundary must be present
    expect(ids.has("d20231231"), "Dec 31 2023").toBe(true);
    expect(ids.has("d20240101"), "Jan 1 2024").toBe(true);
    // They must be adjacent in the daily list
    const dec31 = map.dailies.indexOf("d20231231");
    const jan1  = map.dailies.indexOf("d20240101");
    expect(jan1 - dec31).toBe(1);

    const doc      = await PDFDocument.load(yearBoundaryResult.buffer);
    const failures = assertInternalLinksResolve(extractAllLinks(doc), doc);
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(flat.length);
    expect(failures, "Release blockers — see log above").toHaveLength(0);
  }, 60_000);

  it("Feb 29 leap year (2024): exists, adjacent to Feb 28, links resolve", async () => {
    const map = generatePageIds(STANDARD_CFG);
    expect(map.dailies.includes("d20240229"), "Feb 29 in dailies (leap year 2024)").toBe(true);
    expect(map.dailies.includes("d20240228"), "Feb 28 in dailies").toBe(true);
    const feb28 = map.dailies.indexOf("d20240228");
    const feb29 = map.dailies.indexOf("d20240229");
    expect(feb29 - feb28).toBe(1);

    const doc      = await PDFDocument.load(standardResult.buffer);
    const failures = assertInternalLinksResolve(extractAllLinks(doc), doc);
    expect(failures, "no broken GoTo links in Feb around leap day").toHaveLength(0);
  }, 60_000);

  it("Feb 29 non-leap year (2025): NOT present, Feb 28 is last Feb daily", () => {
    const cfg25 = makeConfig({ startYear: 2025, startMonth: 0, monthCount: 12 });
    const map   = generatePageIds(cfg25);
    expect(map.dailies.includes("d20250229"), "Feb 29 must NOT exist in 2025").toBe(false);
    expect(map.dailies.includes("d20250228"), "Feb 28 2025 must exist").toBe(true);
    // March 1 should immediately follow Feb 28 in the dailies list
    const feb28 = map.dailies.indexOf("d20250228");
    const mar1  = map.dailies.indexOf("d20250301");
    expect(mar1 - feb28).toBe(1);
  });

});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 3: reMarkable e-ink variant (linksQuality = "full")
// ══════════════════════════════════════════════════════════════════════════════

describe("PDF link survival — reMarkable e-ink variant", () => {

  it("generates a non-empty PDF with reMarkable page dimensions", async () => {
    expect(einkResult.buffer.length).toBeGreaterThan(50_000);
    const doc   = await PDFDocument.load(einkResult.buffer);
    const pages = doc.getPages();
    expect(pages.length).toBeGreaterThan(100);
    // reMarkable: 447 × 597 pt (portrait)
    const { width, height } = pages[0]!.getSize();
    expect(width).toBeCloseTo(447, -1);   // within 10 pt
    expect(height).toBeCloseTo(597, -1);
  }, 30_000);

  it("every GoTo link resolves to a real page", async () => {
    const doc      = await PDFDocument.load(einkResult.buffer);
    const links    = extractAllLinks(doc);
    const failures = assertInternalLinksResolve(links, doc);
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    const gotos = links.filter((l) => l.kind === "goto");
    console.log(`[link-survival/eink-remarkable] ${gotos.length} GoTo, ${links.length - gotos.length} URI`);
    expect(failures, "Release blockers").toHaveLength(0);
  }, 60_000);

  it("URI links are present (linksQuality=full) and every one is well-formed", async () => {
    const doc   = await PDFDocument.load(einkResult.buffer);
    const links = extractAllLinks(doc);
    const uris  = links.filter((l) => l.kind === "uri");
    // reMarkable linksQuality="full" — URI annotations must be preserved
    expect(uris.length, "reMarkable variant must retain URI annotations (linksQuality=full)").toBeGreaterThan(100);
    const failures = assertUriLinksWellFormed(links);
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures).toHaveLength(0);
  }, 60_000);

  it("no link rect extends outside the reMarkable page trim", async () => {
    const doc      = await PDFDocument.load(einkResult.buffer);
    const failures = assertWithinTrim(extractAllLinks(doc));
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures, "Release blockers — see log above").toHaveLength(0);
  }, 60_000);

});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 4: Undated variant
// ══════════════════════════════════════════════════════════════════════════════

describe("PDF link survival — undated variant", () => {

  it("contains zero URI links — calMode=none disables all calendar annotations", async () => {
    // The undated config was built with calMode:"none" so the generator
    // emits no URI annotations at all.  This provides a meaningful contrast
    // with all dated variants (which use calMode:"link" and assert > 0 URIs).
    const doc   = await PDFDocument.load(undatedResult.buffer);
    const links = extractAllLinks(doc);
    const uris  = links.filter((l) => l.kind === "uri");
    console.log(
      `[link-survival/undated] ${links.length} total, ${uris.length} URI annotations`,
    );
    expect(uris, "Undated + calMode=none must produce zero URI annotations").toHaveLength(0);
  }, 60_000);

  it("every GoTo link still resolves to a real page", async () => {
    const doc      = await PDFDocument.load(undatedResult.buffer);
    const failures = assertInternalLinksResolve(extractAllLinks(doc), doc);
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures, "Release blockers").toHaveLength(0);
  }, 60_000);

  it("no link rect extends outside the undated page trim", async () => {
    const doc      = await PDFDocument.load(undatedResult.buffer);
    const failures = assertWithinTrim(extractAllLinks(doc));
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures).toHaveLength(0);
  }, 60_000);

});

// ══════════════════════════════════════════════════════════════════════════════
//  Suite 5: Landscape two-page variant
// ══════════════════════════════════════════════════════════════════════════════

describe("PDF link survival — landscape variant", () => {

  it("generates a non-empty PDF with landscape page dimensions", async () => {
    const doc   = await PDFDocument.load(landscapeResult.buffer);
    const pages = doc.getPages();
    expect(pages.length).toBeGreaterThan(100);
    // Non-cover pages should be wider than tall
    const { width, height } = pages[1]!.getSize();
    expect(width, "landscape: width > height").toBeGreaterThan(height);
  }, 30_000);

  it("every GoTo link resolves to a real page", async () => {
    const doc      = await PDFDocument.load(landscapeResult.buffer);
    const links    = extractAllLinks(doc);
    const failures = assertInternalLinksResolve(links, doc);
    const gotos    = links.filter((l) => l.kind === "goto");
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    console.log(`[link-survival/landscape] ${gotos.length} GoTo, ${links.length - gotos.length} URI`);
    expect(failures, "Release blockers").toHaveLength(0);
  }, 60_000);

  it("URI links are present and every one is well-formed", async () => {
    const doc   = await PDFDocument.load(landscapeResult.buffer);
    const links = extractAllLinks(doc);
    const uris  = links.filter((l) => l.kind === "uri");
    expect(uris.length, "landscape planner with calMode=link must emit URI annotations").toBeGreaterThan(100);
    const failures = assertUriLinksWellFormed(links);
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures).toHaveLength(0);
  }, 60_000);

  it("no link rect extends outside the landscape page trim", async () => {
    const doc      = await PDFDocument.load(landscapeResult.buffer);
    const failures = assertWithinTrim(extractAllLinks(doc));
    if (failures.length) console.error(failures.slice(0, 10).join("\n"));
    expect(failures).toHaveLength(0);
  }, 60_000);

});
