import type { PlatformPlannerConfig } from "@/lib/api";

export interface PlannerBuildState {
  editionId: string;
  editionName: string;
  startYear: string;
  startMonth: string;
  endYear: string;
  endMonth: string;
  paperSize: "A5" | "HalfLetter";
  weeklyType: "vertical" | "two-page";
  themeId: string;
  themeName: string;
  paletteId: string;
  packIds: string[];
  insertIds: string[];
  productIds: string[];
  productType: string;
  datingMode: "dated" | "undated" | "perpetual";
  weekStart: "mon" | "sun";
  tabPos: "right" | "top" | "bottom" | "none";
  sections: string[];
  headingFont: string;
  subheadingFont: string;
  bodyFont: string;
  accentFont: string;
  backgroundId: string;
  spineStyleId: string;
  bindingType: string;
  bindingFinish: string;
  paperColour: string;
}

export const DEFAULT_BUILD: PlannerBuildState = {
  editionId: "", editionName: "—",
  startYear: String(new Date().getFullYear()), startMonth: "1",
  endYear: String(new Date().getFullYear()), endMonth: "12",
  paperSize: "A5", weeklyType: "vertical",
  themeId: "", themeName: "None", paletteId: "",
  packIds: [], insertIds: [], productIds: [], productType: "planner",
  datingMode: "dated", weekStart: "mon", tabPos: "right", sections: [],
  headingFont: "", subheadingFont: "", bodyFont: "", accentFont: "",
  backgroundId: "", spineStyleId: "", bindingType: "coil", bindingFinish: "gold", paperColour: "white",
};

/** Convert a saved platform planner configuration to the build UI state. */
export function templateToBuildState(t: PlatformPlannerConfig): PlannerBuildState {
  const setup = t.setup as unknown as Record<string, unknown>;
  const style = t.style as unknown as Record<string, unknown>;
  const monthCount = (setup.monthCount as number | undefined) ?? 12;
  const startMonth = (setup.startMonth as number | undefined) ?? 0;
  const startYear = (setup.startYear as number | undefined) ?? (new Date().getFullYear() + 1);
  const totalOffset = startMonth + monthCount - 1;
  const fonts = style.fonts as Record<string, unknown> | undefined;
  const binding = style.binding as Record<string, unknown> | undefined;

  return {
    ...DEFAULT_BUILD,
    editionId: t.editionId ?? "",
    startYear: String(startYear),
    startMonth: String(startMonth + 1),
    endYear: String(startYear + Math.floor(totalOffset / 12)),
    endMonth: String((totalOffset % 12) + 1),
    weeklyType: setup.orientation === "landscape" ? "two-page" : "vertical",
    themeId: (style.themeId as string | undefined) ?? "",
    themeName: "",
    paletteId: (style.paletteId as string | undefined) ?? "",
    datingMode: ((setup.datingMode as string | undefined) ?? "dated") as PlannerBuildState["datingMode"],
    weekStart: ((setup.weekStart as string | undefined) ?? "mon") as PlannerBuildState["weekStart"],
    tabPos: ((style.tabPos as string | undefined) ?? "right") as PlannerBuildState["tabPos"],
    sections: (style.sections as string[] | undefined) ?? [],
    packIds: (style.packIds as string[] | undefined) ?? [],
    insertIds: (style.insertIds as string[] | undefined) ?? [],
    headingFont: (fonts?.heading as string | undefined) ?? "",
    subheadingFont: (fonts?.subheading as string | undefined) ?? "",
    bodyFont: (fonts?.script as string | undefined) ?? "",
    accentFont: (fonts?.accent as string | undefined) ?? "",
    backgroundId: (style.backgroundId as string | undefined) ?? "",
    spineStyleId: (style.spineStyleId as string | undefined) ?? "",
    bindingType: (binding?.type as string | undefined) ?? "coil",
    bindingFinish: (binding?.finish as string | undefined) ?? "gold",
    paperColour: (style.paperColour as string | undefined) ?? "white",
  };
}

/** Serialize persisted style fields without mutating the build state. */
export function buildStateToStylePatch(build: PlannerBuildState) {
  const fonts = build.headingFont || build.subheadingFont || build.bodyFont || build.accentFont
    ? {
        ...(build.headingFont ? { heading: build.headingFont } : {}),
        ...(build.subheadingFont ? { subheading: build.subheadingFont } : {}),
        ...(build.bodyFont ? { script: build.bodyFont } : {}),
        ...(build.accentFont ? { accent: build.accentFont } : {}),
      }
    : undefined;
  const binding = build.bindingType && build.bindingType !== "none"
    ? { type: build.bindingType, finish: build.bindingFinish }
    : undefined;

  return {
    themeId: build.themeId || null,
    paletteId: build.paletteId || null,
    tabPos: build.tabPos,
    sections: build.sections,
    packIds: build.packIds,
    insertIds: build.insertIds,
    ...(fonts ? { fonts } : {}),
    backgroundId: build.backgroundId || null,
    spineStyleId: build.spineStyleId || null,
    ...(binding ? { binding } : {}),
    ...(build.paperColour ? { paperColour: build.paperColour } : {}),
  };
}