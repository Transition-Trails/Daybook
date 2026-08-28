import type { PlannerPageOrderItem, PlannerSetup, PlannerStyle } from "./schema/planner";

export const PLANNER_PAGE_TYPES = [
  "cover",
  "home",
  "year",
  "month-divider",
  "month-calendar",
  "weekly",
  "daily",
  "todo",
  "notes",
  "section-divider",
  "note-paper",
] as const;

export type PlannerPageType = (typeof PLANNER_PAGE_TYPES)[number];

export type PlannerPageDescriptor = {
  type: PlannerPageType;
  index: number;
};

export function plannerPageKey(page: PlannerPageOrderItem): string {
  return `${page.type}:${page.index}`;
}

export function reconcilePlannerPageOrder(
  pages: PlannerPageDescriptor[],
  savedOrder?: PlannerPageOrderItem[],
): PlannerPageDescriptor[] {
  if (!savedOrder?.length) return pages;
  const available = new Map(pages.map((page) => [plannerPageKey(page), page]));
  const ordered: PlannerPageDescriptor[] = [];
  const seen = new Set<string>();
  for (const item of savedOrder) {
    const key = plannerPageKey(item);
    const page = available.get(key);
    if (page && !seen.has(key)) {
      ordered.push(page);
      seen.add(key);
    }
  }
  for (const page of pages) {
    const key = plannerPageKey(page);
    if (!seen.has(key)) ordered.push(page);
  }
  return ordered;
}

export function getPlannerPageCounts(
  setup: PlannerSetup,
  style: Pick<PlannerStyle, "sections" | "notePaper">,
): Record<PlannerPageType, number> {
  const start = new Date(Date.UTC(setup.startYear, setup.startMonth, 1));
  const end = new Date(Date.UTC(setup.startYear, setup.startMonth + setup.monthCount, 1));
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const leadingDays = (start.getUTCDay() - (setup.weekStart === "mon" ? 1 : 0) + 7) % 7;

  return {
    cover: 1,
    home: 1,
    year: 1,
    "month-divider": setup.monthCount,
    "month-calendar": setup.monthCount,
    weekly: Math.ceil((days + leadingDays) / 7),
    daily: days,
    todo: 1,
    notes: 1,
    "section-divider": style.sections?.length ?? 0,
    "note-paper": style.notePaper === "mixed" ? 3 : 1,
  };
}

export function getPlannerPageDescriptors(
  setup: PlannerSetup,
  style: Pick<PlannerStyle, "sections" | "notePaper" | "pageOrder">,
): PlannerPageDescriptor[] {
  const counts = getPlannerPageCounts(setup, style);
  const pages: PlannerPageDescriptor[] = [];
  for (const type of PLANNER_PAGE_TYPES) {
    for (let index = 0; index < counts[type]; index += 1) {
      pages.push({ type, index });
    }
  }
  return reconcilePlannerPageOrder(pages, style.pageOrder);
}