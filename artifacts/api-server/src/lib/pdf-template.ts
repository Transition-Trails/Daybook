/**
 * Planner Template — data-driven link zone system.
 *
 * A PlannerTemplate describes, per page role, the position and targets of every
 * PDF link annotation, expressed as percentages of the page dimensions.
 * The engine (pdf-generator.ts) reads zones from the template; no annotation
 * positions are hardcoded there.
 *
 * Coordinate system:
 *   x, w  — % of pageWidth  (0 = left  edge, 100 = right edge)
 *   y, h  — % of pageHeight (0 = bottom edge, 100 = top  edge — PDF origin)
 *
 * The DEFAULT_TEMPLATE is calibrated against A4 portrait (595 × 842 pt).
 * Percentages naturally scale to landscape or other page sizes.
 */

import {
  PDFDocument,
  PDFPage,
  PDFRef,
  PDFFont,
  rgb,
  PDFName,
  PDFArray,
} from "pdf-lib";

// ── PageIdMap (lives here to break the circular-import if it were in pdf-generator) ──

export interface PageIdMap {
  cover: string;
  home: string;
  year: string;
  monthDividers: string[]; // mdiv0, mdiv1, …
  monthCalendars: string[]; // m0, m1, …
  weeklies: string[]; // w{year}W{ww}
  dailies: string[]; // d{YYYYMMDD}
  todo: string;
  notes: string;
  sectionDividers: string[]; // ns1, ns2, …
  notePaper: string[]; // notes-p0, notes-p1, …
}

// ── Core types ────────────────────────────────────────────────────────────────

export type PageRole =
  | "cover"
  | "home"
  | "year"
  | "month-divider"
  | "month-calendar"
  | "weekly"
  | "daily"
  | "todo"
  | "notes"
  | "section-divider"
  | "note-paper";

/**
 * TargetRule: where a link annotation navigates.
 *
 * "page" pattern tokens (resolved at render time from StampContext):
 *   Static  : "cover" | "home" | "year" | "todo" | "notes"
 *   Indexed : "m{n}"    → monthCalendars[monthIndex]
 *             "mdiv{n}" → monthDividers[monthIndex]
 *   Relative: "prev-mdiv" | "next-mdiv" | "prev-day" | "next-day"
 *   Computed: "month-for-day" | "month-for-week"
 *   (In RepeatingZoneSpec.target_pattern, {n}/{i} = loop counter, {date}/{week-day-n} = date)
 */
export type TargetRule =
  | { kind: "page"; pattern: string }
  | { kind: "url"; href: string };

/** A single link annotation zone. All coordinates are % of page dimensions. */
export interface LinkZone {
  x: number; // left edge, % of pageWidth
  y: number; // bottom edge, % of pageHeight
  w: number; // width, % of pageWidth
  h: number; // height, % of pageHeight
  target: TargetRule;
  label?: string;
}

/**
 * A zone that repeats for each item in a collection.
 * Item n is placed at:
 *   x = x_base + (n % cols) * x_step
 *   y = y_base + floor(n / cols) * y_step   (y_step is negative to step downward)
 *
 * label_token:
 *   "month-label"       → "Jan 2026"
 *   "month-short-label" → "Jan"
 *   "section-name"      → sections[n]
 *   "day-num"           → "1", "2", …
 *   "week-day-label"    → "Mon Jan 1"
 */
export interface RepeatingZoneSpec {
  collection: "months" | "sections" | "days-of-month" | "week-days";
  target_pattern: string;
  label_token: string;
  x_base: number;
  y_base: number;
  x_step: number;
  y_step: number;
  cols: number;
  w: number;
  h: number;
}

/**
 * Grid geometry for month-calendar day cells.
 * Day d (1-indexed) with day-of-week start offset lands at:
 *   slot = d - 1 + weekStartOffset
 *   x    = x_origin_pct + (slot % 7) * col_w_pct
 *   y    = y_origin_pct + floor(slot / 7) * row_h_pct   (row_h_pct < 0 → downward)
 */
export interface DayCellSpec {
  x_origin_pct: number;
  y_origin_pct: number;
  col_w_pct: number;
  row_h_pct: number;
  cell_w_pct: number;
  cell_h_pct: number;
}

export interface PageTemplate {
  role: PageRole;
  zones: LinkZone[];
  repeatingZones?: RepeatingZoneSpec[];
  dayCells?: DayCellSpec;
}

/**
 * Tab-rail geometry: one zone per month is stamped on inner pages.
 * Month n lands at: x = x_base + n * x_step, y = y_base + n * y_step.
 */
export interface TabRailSpec {
  x_base: number;
  y_base: number;
  x_step: number;
  y_step: number;
  w: number;
  h: number;
}

export interface PlannerTemplate {
  id: string;
  name: string;
  /**
   * Tab-rail geometry keyed by tabPos.
   * "none" → no per-month tabs; homeZone is stamped on all inner pages instead.
   */
  tabRail: {
    right: TabRailSpec;
    top: TabRailSpec;
    homeZone: LinkZone;
  };
  pages: Partial<Record<PageRole, PageTemplate>>;
}

// ── Low-level PDF annotation helpers (used by stampPageZones + re-exported for engine) ──

export function addGoToAnnotation(
  pdfDoc: PDFDocument,
  sourcePage: PDFPage,
  targetPageRef: PDFRef,
  rect: [number, number, number, number],
): void {
  const annot = pdfDoc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: rect,
    Border: [0, 0, 0],
    Dest: [targetPageRef, PDFName.of("Fit")],
  });
  const annotRef = pdfDoc.context.register(annot);
  const key = PDFName.of("Annots");
  const existing = sourcePage.node.lookupMaybe(key, PDFArray);
  if (existing) existing.push(annotRef);
  else sourcePage.node.set(key, pdfDoc.context.obj([annotRef]));
}

export function addUriAnnotation(
  pdfDoc: PDFDocument,
  page: PDFPage,
  url: string,
  rect: [number, number, number, number],
  label?: string,
  font?: PDFFont,
  textColor?: { r: number; g: number; b: number },
): void {
  if (label && font && textColor) {
    page.drawText(label, {
      x: rect[0] + 3,
      y: rect[1] + 3,
      size: 8,
      font,
      color: rgb(textColor.r, textColor.g, textColor.b),
    });
  }
  const annot = pdfDoc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Link"),
    Rect: rect,
    Border: [0, 0, 0],
    A: pdfDoc.context.obj({ Type: PDFName.of("Action"), S: PDFName.of("URI"), URI: url }),
  });
  const annotRef = pdfDoc.context.register(annot);
  const key = PDFName.of("Annots");
  const existing = page.node.lookupMaybe(key, PDFArray);
  if (existing) existing.push(annotRef);
  else page.node.set(key, pdfDoc.context.obj([annotRef]));
}

// ── Local date helper (avoids circular import with pdf-generator) ─────────────

function _yyyymmdd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
}

// ── DEFAULT_TEMPLATE ──────────────────────────────────────────────────────────
//
// All coordinates are % of A4 portrait (595 × 842 pt) with MARGIN = 40 pt.
// Formula reference:
//   x%  = pts / 595 * 100     y%  = pts / 842 * 100
//   w%  = pts / 595 * 100     h%  = pts / 842 * 100
//
// Notable values:
//   MARGIN_X  = 40/595  = 6.722     MARGIN_Y  = 40/842  = 4.751
//   W_120     = 120/595 = 20.168    W_140     = 140/595 = 23.529
//   W_60      = 60/595  = 10.084    W_80      = 80/595  = 13.445
//   W_160     = 160/595 = 26.891    W_200     = 200/595 = 33.613
//   W_100     = 100/595 = 16.807    W_65      = 65/595  = 10.924
//   W_70_step = 70/595  = 11.765    H_18      = 18/842  = 2.138
//   H_16      = 16/842  = 1.900     H_20      = 20/842  = 2.375

export const DEFAULT_TEMPLATE: PlannerTemplate = {
  id: "default",
  name: "Default",

  // ── Tab rail ──────────────────────────────────────────────────────────────
  // right: x=pageWidth-24, y=pageHeight-60-n*30, w=20, h=16
  // top  : x=MARGIN+n*30,  y=pageHeight-20,       w=20, h=16
  tabRail: {
    right: {
      x_base: 95.966, // (595-24)/595
      y_base: 92.875, // (842-60)/842
      x_step: 0,
      y_step: -3.562, // -30/842
      w: 3.361,       // 20/595
      h: 1.900,       // 16/842
    },
    top: {
      x_base: 6.722,  // MARGIN/595
      y_base: 97.624, // (842-20)/842
      x_step: 5.042,  // 30/595
      y_step: 0,
      w: 3.361,
      h: 1.900,
    },
    homeZone: {
      // tabPos="none": stamp "Home" link on all inner pages
      // addLink(src, "home", "Home", MARGIN, pageHeight-50, 24, 18)
      x: 6.722,  // 40/595
      y: 94.062, // (842-50)/842
      w: 4.034,  // 24/595
      h: 2.138,  // 18/842
      target: { kind: "page", pattern: "home" },
      label: "Home",
    },
  },

  pages: {
    // ── Cover ───────────────────────────────────────────────────────────────
    // addLink("cover", "home", "-> Get started", MARGIN, pageHeight/2-40, 120, 20)
    cover: {
      role: "cover",
      zones: [
        {
          x: 6.722, y: 45.249, w: 20.168, h: 2.375,
          target: { kind: "page", pattern: "home" },
          label: "-> Get started",
        },
      ],
    },

    // ── Home ────────────────────────────────────────────────────────────────
    // Static: year(y=752), todo(y=724), notes(y=696)  — step -28/842=-3.326%
    // Repeating: sections (y_base=668/842=79.334%, step -3.326%, w=160/595)
    home: {
      role: "home",
      zones: [
        {
          x: 6.722, y: 89.311, w: 23.529, h: 2.138,
          target: { kind: "page", pattern: "year" },
          label: "Year at a Glance",
        },
        {
          x: 6.722, y: 85.987, w: 13.445, h: 2.138,
          target: { kind: "page", pattern: "todo" },
          label: "To-Do",
        },
        {
          x: 6.722, y: 82.660, w: 13.445, h: 2.138,
          target: { kind: "page", pattern: "notes" },
          label: "Notes",
        },
      ],
      repeatingZones: [
        {
          collection: "sections",
          target_pattern: "ns{i}",
          label_token: "section-name",
          x_base: 6.722, y_base: 79.334,
          x_step: 0,     y_step: -3.326,
          cols: 1,
          w: 26.891, h: 2.138,
        },
      ],
    },

    // ── Year ────────────────────────────────────────────────────────────────
    // 3-column grid: x=MARGIN+(col%3)*160, y=pageHeight-90-floor(col/3)*40
    year: {
      role: "year",
      zones: [],
      repeatingZones: [
        {
          collection: "months",
          target_pattern: "mdiv{n}",
          label_token: "month-label",
          x_base: 6.722, y_base: 89.311,
          x_step: 26.891, y_step: -4.750,
          cols: 3,
          w: 23.529, h: 2.138,
        },
      ],
    },

    // ── Month divider ────────────────────────────────────────────────────────
    // addLink(mdivId, mId, "-> Month view", pageWidth-120, MARGIN, 100, 18)
    "month-divider": {
      role: "month-divider",
      zones: [
        {
          x: 79.832, y: 4.751, w: 16.807, h: 2.138,
          target: { kind: "page", pattern: "m{n}" },
          label: "-> Month view",
        },
      ],
    },

    // ── Month calendar ───────────────────────────────────────────────────────
    // prev: (MARGIN, MARGIN, 60, 18), next: (pageWidth-80, MARGIN, 60, 18)
    // day cells: DayCellSpec
    "month-calendar": {
      role: "month-calendar",
      zones: [
        {
          x: 6.722, y: 4.751, w: 10.084, h: 2.138,
          target: { kind: "page", pattern: "prev-mdiv" },
          label: "<< Prev",
        },
        {
          x: 86.555, y: 4.751, w: 10.084, h: 2.138, // (595-80)/595
          target: { kind: "page", pattern: "next-mdiv" },
          label: "Next >>",
        },
      ],
      dayCells: {
        x_origin_pct: 6.722,   // MARGIN/595
        y_origin_pct: 90.499,  // (842-80)/842
        col_w_pct:    12.101,  // 72/595
        row_h_pct:    -5.938,  // -50/842  (negative = stepping downward)
        cell_w_pct:   10.084,  // 60/595
        cell_h_pct:    2.138,  // 18/842
      },
    },

    // ── Weekly ───────────────────────────────────────────────────────────────
    // Static: back to month (MARGIN, MARGIN, 60, 18)
    // Repeating: 7 day columns (MARGIN+d*70, pageHeight-90, 65, 18)
    weekly: {
      role: "weekly",
      zones: [
        {
          x: 6.722, y: 4.751, w: 10.084, h: 2.138,
          target: { kind: "page", pattern: "month-for-week" },
          label: "Month",
        },
      ],
      repeatingZones: [
        {
          collection: "week-days",
          target_pattern: "d{week-day-n}",
          label_token: "week-day-label",
          x_base: 6.722,  y_base: 89.311,
          x_step: 11.765, y_step: 0,  // 70/595
          cols: 7,
          w: 10.924, h: 2.138,  // 65/595
        },
      ],
    },

    // ── Daily ────────────────────────────────────────────────────────────────
    // month: (MARGIN, MARGIN, 60, 18)
    // prev:  (MARGIN+70, MARGIN, 60, 18)
    // next:  (MARGIN+140, MARGIN, 60, 18)
    daily: {
      role: "daily",
      zones: [
        {
          x: 6.722, y: 4.751, w: 10.084, h: 2.138,
          target: { kind: "page", pattern: "month-for-day" },
          label: "Month",
        },
        {
          x: 18.487, y: 4.751, w: 10.084, h: 2.138, // (40+70)/595
          target: { kind: "page", pattern: "prev-day" },
          label: "<< Prev",
        },
        {
          x: 30.252, y: 4.751, w: 10.084, h: 2.138, // (40+140)/595
          target: { kind: "page", pattern: "next-day" },
          label: "Next >>",
        },
      ],
    },

    // ── Todo ─────────────────────────────────────────────────────────────────
    // No page-specific zones (only tab rail)
    todo: {
      role: "todo",
      zones: [],
    },

    // ── Notes ────────────────────────────────────────────────────────────────
    // Repeating: section links (MARGIN, pageHeight-90-n*28, 200, 18)
    notes: {
      role: "notes",
      zones: [],
      repeatingZones: [
        {
          collection: "sections",
          target_pattern: "ns{i}",
          label_token: "section-name",
          x_base: 6.722, y_base: 89.311,
          x_step: 0,     y_step: -3.326,
          cols: 1,
          w: 33.613, h: 2.138,  // 200/595
        },
      ],
    },

    // ── Section divider ──────────────────────────────────────────────────────
    // addLink(nsId, "notes", "<- Notes", MARGIN, MARGIN, 60, 18)
    "section-divider": {
      role: "section-divider",
      zones: [
        {
          x: 6.722, y: 4.751, w: 10.084, h: 2.138,
          target: { kind: "page", pattern: "notes" },
          label: "<- Notes",
        },
      ],
    },

    // ── Note paper ───────────────────────────────────────────────────────────
    // No page-specific zones (only tab rail)
    "note-paper": {
      role: "note-paper",
      zones: [],
    },
  },
};

// ── Target resolution ─────────────────────────────────────────────────────────

export interface StaticResolutionCtx {
  map: PageIdMap;
  monthIndex?: number;     // current page's month index (month-divider, month-calendar)
  dailyIndex?: number;     // current daily's index in map.dailies
  weeklyIndex?: number;    // 0-based position in map.weeklies (for next/prev-week)
  weeklyMonthIndex?: number; // which month this weekly falls in
  sectionIndex?: number;   // 0-based section index (section-divider)
}

/** Resolve a static TargetRule pattern to a concrete page ID.  Returns null if unresolvable. */
export function resolveStaticTarget(
  pattern: string,
  ctx: StaticResolutionCtx,
): string | null {
  const { map } = ctx;
  switch (pattern) {
    case "cover": return map.cover;
    case "home":  return map.home;
    case "year":  return map.year;
    case "todo":  return map.todo;
    case "notes": return map.notes;

    case "m{n}":
      return ctx.monthIndex !== undefined
        ? (map.monthCalendars[ctx.monthIndex] ?? null)
        : null;
    case "mdiv{n}":
      return ctx.monthIndex !== undefined
        ? (map.monthDividers[ctx.monthIndex] ?? null)
        : null;

    case "prev-mdiv": {
      const i = ctx.monthIndex ?? 0;
      return i > 0 ? (map.monthDividers[i - 1] ?? null) : null;
    }
    case "next-mdiv": {
      const i = ctx.monthIndex ?? 0;
      return i < map.monthDividers.length - 1
        ? (map.monthDividers[i + 1] ?? null)
        : null;
    }
    case "prev-day": {
      const i = ctx.dailyIndex ?? 0;
      return i > 0 ? (map.dailies[i - 1] ?? null) : null;
    }
    case "next-day": {
      const i = ctx.dailyIndex ?? 0;
      return i < map.dailies.length - 1
        ? (map.dailies[i + 1] ?? null)
        : null;
    }
    // ── Seller-hotspot-only patterns ─────────────────────────────────────────
    case "prev-week": {
      const i = ctx.weeklyIndex ?? 0;
      return i > 0 ? (map.weeklies[i - 1] ?? null) : null;
    }
    case "next-week": {
      const i = ctx.weeklyIndex ?? 0;
      return i < map.weeklies.length - 1
        ? (map.weeklies[i + 1] ?? null)
        : null;
    }
    case "month-for-day":
    case "month-for-week": {
      const idx = ctx.weeklyMonthIndex ?? ctx.monthIndex;
      return idx !== undefined ? (map.monthCalendars[idx] ?? null) : null;
    }

    default:
      // Accept bare concrete IDs that are already in the map
      if (
        map.monthCalendars.includes(pattern) ||
        map.monthDividers.includes(pattern) ||
        map.dailies.includes(pattern) ||
        map.weeklies.includes(pattern) ||
        map.sectionDividers.includes(pattern) ||
        map.notePaper.includes(pattern)
      ) {
        return pattern;
      }
      return null;
  }
}

// ── Seller hotspot stamping ───────────────────────────────────────────────────
// Stamps seller-defined normalized-rect hotspots onto a page after the standard
// stampPageZones call. Uses the same StampContext for resolution so next-week,
// prev-day etc. are computed correctly per page instance.

export interface UserHotspot {
  x: number;        // 0-1 fraction of page width  (left edge)
  y: number;        // 0-1 fraction of page height (bottom edge — PDF origin)
  w: number;
  h: number;
  targetType: string;   // see VALID_TARGET_TYPES in planner-hotspots.ts
  targetRef?: string | null;
  label?: string | null;
}

/** Map a seller hotspot targetType to a resolveStaticTarget pattern string. */
function hotspotTypeToPattern(targetType: string, sectionRef: string | null | undefined): string | null {
  switch (targetType) {
    case "home":          return "home";
    case "cover":         return "cover";
    case "year":          return "year";
    case "todo":          return "todo";
    case "notes":         return "notes";
    case "next-day":      return "next-day";
    case "prev-day":      return "prev-day";
    case "next-week":     return "next-week";
    case "prev-week":     return "prev-week";
    case "next-month":    return "next-mdiv";
    case "prev-month":    return "prev-mdiv";
    case "month-for-day": return "month-for-day";
    case "month-for-week":return "month-for-week";
    case "month-divider": return "mdiv{n}";
    case "month-calendar":return "m{n}";
    case "section-n": {
      // targetRef is the 0-based section index as a string
      return null; // handled separately
    }
    default: return null;
  }
}

/**
 * Stamp seller-defined hotspots for the given page context.
 * Called after stampPageZones in the engine — completely separate from the
 * stampPageZones mechanism; hotspots are an additive annotation layer.
 *
 * Template memory is implicit: hotspots are keyed by templateKey (= PageRole),
 * not by generated page instance.  The engine passes the right StampContext,
 * so next-week/prev-day/etc. resolve correctly per instance automatically.
 */
export function stampUserHotspots(ctx: StampContext, hotspots: UserHotspot[]): void {
  if (!hotspots.length) return;

  const resCtx: StaticResolutionCtx = {
    map: ctx.map,
    monthIndex:       ctx.monthIndex,
    dailyIndex:       ctx.dailyIndex,
    weeklyIndex:      ctx.weeklyIndex,
    weeklyMonthIndex: ctx.weeklyMonthIndex,
    sectionIndex:     ctx.sectionIndex,
  };

  for (const h of hotspots) {
    const absX = h.x * ctx.pageWidth;
    const absY = h.y * ctx.pageHeight;
    const absW = h.w * ctx.pageWidth;
    const absH = h.h * ctx.pageHeight;
    const rect: [number, number, number, number] = [absX, absY - 2, absX + absW, absY - 2 + absH];

    if (h.targetType === "url") {
      if (h.targetRef) {
        addUriAnnotation(ctx.pdfDoc, ctx.page, h.targetRef, rect, h.label ?? undefined);
      }
      continue;
    }

    if (h.targetType === "section-n") {
      // targetRef = section index (0-based) as string; resolve to ns{n}
      const idx = h.targetRef !== null && h.targetRef !== undefined ? parseInt(h.targetRef, 10) : NaN;
      if (!Number.isNaN(idx) && idx >= 0 && idx < ctx.map.sectionDividers.length) {
        const ref = ctx.pageMap.get(ctx.map.sectionDividers[idx]!)?.pageRef ?? null;
        if (ref) addGoToAnnotation(ctx.pdfDoc, ctx.page, ref, rect);
      }
      continue;
    }

    const pattern = hotspotTypeToPattern(h.targetType, h.targetRef);
    if (!pattern) continue;

    const targetId = resolveStaticTarget(pattern, resCtx);
    if (!targetId) continue;

    const ref = ctx.pageMap.get(targetId)?.pageRef ?? null;
    if (ref) addGoToAnnotation(ctx.pdfDoc, ctx.page, ref, rect);
  }
}

/** Resolve a repeating zone target_pattern for loop index n (or a given date). */
function resolveRepeatingTarget(
  pattern: string,
  n: number,
  date: Date | null,
  map: PageIdMap,
): string | null {
  if (pattern === "mdiv{n}") return map.monthDividers[n] ?? null;
  if (pattern === "m{n}")    return map.monthCalendars[n] ?? null;
  if (pattern === "ns{i}")   return map.sectionDividers[n] ?? null;
  if (pattern === "notes-p{i}") return map.notePaper[n] ?? null;
  if ((pattern === "d{date}" || pattern === "d{week-day-n}") && date) {
    return `d${_yyyymmdd(date)}`;
  }
  return null;
}

// ── validateTemplate ──────────────────────────────────────────────────────────

/** Warn (never throw) on template issues: unresolvable targets, overlapping zones, bad URLs. */
export function validateTemplate(
  template: PlannerTemplate,
  map: PageIdMap,
  sections: string[],
): void {
  const allIds = new Set([
    map.cover, map.home, map.year, map.todo, map.notes,
    ...map.monthDividers, ...map.monthCalendars,
    ...map.weeklies, ...map.dailies,
    ...map.sectionDividers, ...map.notePaper,
  ]);

  // Helper: check a single zone's target
  const checkZone = (zone: LinkZone, pageRole: string) => {
    if (zone.target.kind === "url") {
      if (!/^https?:\/\//i.test(zone.target.href)) {
        console.warn(
          `[template:${template.id}] Page "${pageRole}": external URL zone has invalid href: ${zone.target.href}`,
        );
      }
    } else {
      // "page" pattern — check resolvability with a representative context
      const resolved = resolveStaticTarget(zone.target.pattern, { map, monthIndex: 0, dailyIndex: 0, weeklyMonthIndex: 0, sectionIndex: 0 });
      if (!resolved || !allIds.has(resolved)) {
        // Some patterns like "prev-mdiv" on monthIndex=0 intentionally return null — skip those
        const knownNullable = ["prev-mdiv", "prev-day", "next-day", "next-mdiv"];
        if (!knownNullable.includes(zone.target.pattern)) {
          console.warn(
            `[template:${template.id}] Page "${pageRole}": zone target "${zone.target.pattern}" did not resolve to a known page ID`,
          );
        }
      }
    }
  };

  // Check static zones and detect overlaps per page role
  for (const [role, pt] of Object.entries(template.pages) as [PageRole, PageTemplate][]) {
    if (!pt) continue;
    for (const zone of pt.zones) {
      checkZone(zone, role);
    }
    // Overlap detection on static zones
    for (let a = 0; a < pt.zones.length; a++) {
      for (let b = a + 1; b < pt.zones.length; b++) {
        const za = pt.zones[a];
        const zb = pt.zones[b];
        const overlapX = za.x < zb.x + zb.w && za.x + za.w > zb.x;
        const overlapY = za.y < zb.y + zb.h && za.y + za.h > zb.y;
        if (overlapX && overlapY) {
          console.warn(
            `[template:${template.id}] Page "${role}": zones [${a}] and [${b}] overlap`,
          );
        }
      }
    }
    // Check repeating zone target patterns
    for (const rz of pt.repeatingZones ?? []) {
      const sampleDate = new Date(2026, 0, 1);
      const resolved = resolveRepeatingTarget(rz.target_pattern, 0, sampleDate, map);
      if (resolved === null) {
        // Only warn if the map is non-empty for this collection
        const hasItems =
          (rz.collection === "months" && map.monthDividers.length > 0) ||
          (rz.collection === "sections" && sections.length > 0) ||
          rz.collection === "days-of-month" ||
          rz.collection === "week-days";
        if (hasItems) {
          console.warn(
            `[template:${template.id}] Page "${role}": repeating zone target_pattern "${rz.target_pattern}" unresolvable`,
          );
        }
      }
    }
  }
}

// ── StampContext ───────────────────────────────────────────────────────────────

export interface StampContext {
  // Identity of the page being stamped
  pageId: string;
  page: PDFPage;
  role: PageRole;
  pageWidth: number;
  pageHeight: number;

  // PDF internals
  pdfDoc: PDFDocument;
  /** Full page map — zones whose targets are absent are silently skipped. */
  pageMap: Map<string, { page: PDFPage; pageRef: PDFRef }>;

  // Theme
  accent: { r: number; g: number; b: number };
  ink:    { r: number; g: number; b: number };
  font: PDFFont;

  // Generation context
  map: PageIdMap;
  sections: string[];
  /** Pre-computed month sequence: monthList[n] = { year, month } for the n-th month. */
  monthList: Array<{ year: number; month: number }>;

  // Per-page instance context (set by the engine for the current page)
  monthIndex?: number;        // month-divider / month-calendar
  dailyIndex?: number;        // daily (index in map.dailies)
  weeklyIndex?: number;       // weekly (0-based position in map.weeklies — for next/prev-week)
  weeklyMonthIndex?: number;  // weekly (which month this week falls in)
  sectionIndex?: number;      // section-divider (0-based)

  // For month-calendar day cells
  dayOfMonthContext?: {
    year: number;
    month: number;
    weekStartOffset: number; // day-of-week offset for the 1st of month (0=Sun/Mon depending on weekStart)
  };

  // For weekly day-column repeating zones
  weekStartDate?: Date;

  // Tab rail config
  tabPos: "right" | "top" | "none";
  includeTabRail: boolean;

  // Template
  template: PlannerTemplate;
}

// ── Zone stamping (core engine) ───────────────────────────────────────────────

/** Convert a percentage coordinate to absolute points. */
function pct(value: number, dimension: number): number {
  return (value / 100) * dimension;
}

/** Draw the tinted button + text + annotation for a single resolved zone. */
function stampSingleZone(
  zone: LinkZone,
  targetIdOrUrl: string | null,
  isUrl: boolean,
  ctx: StampContext,
): void {
  if (!targetIdOrUrl) return;

  const absX = pct(zone.x, ctx.pageWidth);
  const absY = pct(zone.y, ctx.pageHeight);
  const absW = pct(zone.w, ctx.pageWidth);
  const absH = pct(zone.h, ctx.pageHeight);
  // pdf-lib rect: [x1, y1, x2, y2] — matches the original addLink y-2 offset
  const rect: [number, number, number, number] = [
    absX, absY - 2, absX + absW, absY - 2 + absH,
  ];

  if (zone.label) {
    ctx.page.drawRectangle({
      x: absX, y: absY - 2, width: absW, height: absH,
      color: rgb(ctx.accent.r, ctx.accent.g, ctx.accent.b),
      opacity: 0.15,
    });
    ctx.page.drawText(zone.label, {
      x: absX + 4, y: absY + 2,
      size: 8, font: ctx.font,
      color: rgb(ctx.ink.r, ctx.ink.g, ctx.ink.b),
    });
  }

  if (isUrl) {
    addUriAnnotation(ctx.pdfDoc, ctx.page, targetIdOrUrl, rect);
  } else {
    const ref = ctx.pageMap.get(targetIdOrUrl)?.pageRef ?? null;
    if (ref) addGoToAnnotation(ctx.pdfDoc, ctx.page, ref, rect);
  }
}

/**
 * Stamp all link zones for the given page context.
 * Called once per page by the engine; handles static zones, repeating zones,
 * day-cell grids, and the tab rail.
 */
export function stampPageZones(ctx: StampContext): void {
  const pt = ctx.template.pages[ctx.role];

  const resCtx: StaticResolutionCtx = {
    map: ctx.map,
    monthIndex: ctx.monthIndex,
    dailyIndex: ctx.dailyIndex,
    weeklyMonthIndex: ctx.weeklyMonthIndex,
    sectionIndex: ctx.sectionIndex,
  };

  // ── 1. Static zones ──────────────────────────────────────────────────────
  for (const zone of pt?.zones ?? []) {
    if (zone.target.kind === "url") {
      stampSingleZone(zone, zone.target.href, true, ctx);
    } else {
      const targetId = resolveStaticTarget(zone.target.pattern, resCtx);
      stampSingleZone(zone, targetId, false, ctx);
    }
  }

  // ── 2. Repeating zones ────────────────────────────────────────────────────
  for (const rz of pt?.repeatingZones ?? []) {
    let items: Array<{ n: number; date: Date | null; label: string }>;

    if (rz.collection === "months") {
      items = ctx.monthList.map((m, n) => {
        const date = new Date(m.year, m.month, 1);
        const label =
          rz.label_token === "month-short-label"
            ? date.toLocaleString("en-US", { month: "short" })
            : rz.label_token === "month-label"
              ? date.toLocaleString("en-US", { month: "short" }) + " " + m.year
              : rz.label_token;
        return { n, date, label };
      });
    } else if (rz.collection === "sections") {
      items = ctx.sections.map((s, n) => ({
        n,
        date: null,
        label: rz.label_token === "section-name" ? s : rz.label_token,
      }));
    } else if (rz.collection === "week-days") {
      const weekStartDate = ctx.weekStartDate;
      if (!weekStartDate) { items = []; }
      else {
        items = Array.from({ length: 7 }, (_, d) => {
          const date = new Date(weekStartDate);
          date.setDate(weekStartDate.getDate() + d);
          const label =
            rz.label_token === "week-day-label"
              ? date.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" })
              : rz.label_token;
          return { n: d, date, label };
        });
      }
    } else {
      items = [];
    }

    for (const item of items) {
      const col = rz.cols > 1 ? item.n % rz.cols : 0;
      const row = rz.cols > 1 ? Math.floor(item.n / rz.cols) : item.n;
      const x = rz.x_base + col * rz.x_step;
      const y = rz.y_base + row * rz.y_step;
      const zone: LinkZone = {
        x, y, w: rz.w, h: rz.h,
        target: { kind: "page", pattern: rz.target_pattern },
        label: item.label,
      };
      const targetId = resolveRepeatingTarget(rz.target_pattern, item.n, item.date, ctx.map);
      stampSingleZone(zone, targetId, false, ctx);
    }
  }

  // ── 3. Day-cell grid (month-calendar only) ────────────────────────────────
  const dc = pt?.dayCells;
  if (dc && ctx.dayOfMonthContext) {
    const { year, month, weekStartOffset } = ctx.dayOfMonthContext;
    const days = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month, d);
      const dayId = `d${_yyyymmdd(date)}`;
      const slot = d - 1 + weekStartOffset;
      const col = slot % 7;
      const row = Math.floor(slot / 7);
      const x = dc.x_origin_pct + col * dc.col_w_pct;
      const y = dc.y_origin_pct + row * dc.row_h_pct;
      const zone: LinkZone = {
        x, y, w: dc.cell_w_pct, h: dc.cell_h_pct,
        target: { kind: "page", pattern: "d{date}" },
        label: String(d),
      };
      stampSingleZone(zone, dayId, false, ctx);
    }
  }

  // ── 4. Tab rail ───────────────────────────────────────────────────────────
  if (!ctx.includeTabRail) return;

  if (ctx.tabPos === "none") {
    stampSingleZone(ctx.template.tabRail.homeZone, ctx.template.tabRail.homeZone.target.kind === "page"
      ? resolveStaticTarget(ctx.template.tabRail.homeZone.target.pattern, resCtx)
      : null, false, ctx);
    return;
  }

  const rail = ctx.tabPos === "right"
    ? ctx.template.tabRail.right
    : ctx.template.tabRail.top;

  for (let n = 0; n < ctx.monthList.length; n++) {
    const m = ctx.monthList[n];
    const label = new Date(m.year, m.month, 1).toLocaleString("en-US", { month: "short" });
    const x = rail.x_base + n * rail.x_step;
    const y = rail.y_base + n * rail.y_step;
    const zone: LinkZone = {
      x, y, w: rail.w, h: rail.h,
      target: { kind: "page", pattern: "m{n}" },
      label,
    };
    const targetId = ctx.map.monthCalendars[n] ?? null;
    stampSingleZone(zone, targetId, false, ctx);
  }
}
