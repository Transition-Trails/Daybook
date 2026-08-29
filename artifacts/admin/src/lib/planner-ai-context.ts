export interface PlannerCanvasAiContext {
  activeTab: "personalization" | "system";
  view: "compose" | "preview";
  page: {
    position: number;
    total: number;
    type: string;
    index: number;
    label: string;
  } | null;
  slots: {
    total: number;
    available: number;
    occupied: Array<{
      index: number;
      widgetId: string;
      widgetName: string;
    }>;
  };
  layout?: {
    id: string;
    name: string;
    sections: number;
  };
  selectedWidget: {
    id: string;
    name: string;
  } | null;
}

export interface PlannerBuildAiContext {
  personalization: {
    datingMode: string;
    weekStart: string;
    orientation: string;
    startMonth: number;
    startYear: number;
    monthCount: number;
  };
  visualSystem: {
    themeId: string;
    paletteId: string;
    tabPosition: string;
    sections: string[];
    fonts: {
      heading: string;
      subheading: string;
      body: string;
      accent: string;
    };
    backgroundId: string;
    stickerPackCount: number;
    insertCount: number;
    bindingType: string;
    bindingFinish: string;
    paperColour: string;
  };
  output: {
    inkFriendly: boolean;
    einkDevice: string | null;
  };
}

export interface PlannerAiContextInput {
  template: {
    id: string;
    name: string;
    status: string;
    productType: string;
    editionLinked: boolean;
    generated: boolean;
    hasPdf: boolean;
  } | null;
  canvas: PlannerCanvasAiContext | null;
  build: PlannerBuildAiContext | null;
}

const MAX_CONTEXT_CHARS = 6000;
const MAX_TEXT_CHARS = 120;

function safeText(value: unknown, fallback = "not set") {
  const text = typeof value === "string" ? value : String(value ?? "");
  const cleaned = text.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, MAX_TEXT_CHARS) : fallback;
}

function safeList(values: unknown, maxItems: number) {
  return Array.isArray(values)
    ? values.slice(0, maxItems).map((value) => safeText(value))
    : [];
}

function formatList(values: unknown, fallback = "none") {
  const items = safeList(values, 10);
  return items.length ? items.join(", ") : fallback;
}

/**
 * Converts the live Planner Studio state into a small, human-readable prompt
 * section. Asset bytes, SVG markup, and unbounded catalog records never enter
 * the assistant request.
 */
export function formatPlannerAiContext(input: PlannerAiContextInput): string {
  const { template, canvas, build } = input;
  const lines = [
    "Current Daybook Planner Studio workspace context (live at send time):",
    `Template: ${template ? `${safeText(template.name)} [${safeText(template.id)}]` : "none selected"}`,
    ...(template
      ? [
          `Template status: ${safeText(template.status)}; product type: ${safeText(template.productType)}; edition linked: ${template.editionLinked ? "yes" : "no"}; generated: ${template.generated ? "yes" : "no"}; PDF available: ${template.hasPdf ? "yes" : "no"}.`,
        ]
      : []),
    `Canvas panel: ${safeText(canvas?.activeTab, "personalization")}; view: ${safeText(canvas?.view, "compose")}.`,
    canvas?.page
      ? `Active page: ${safeText(canvas.page.label)} (page ${canvas.page.position + 1} of ${canvas.page.total}; type ${safeText(canvas.page.type)}; page index ${canvas.page.index}).`
      : "Active page: none.",
    canvas
      ? `Widget slots: ${canvas.slots.occupied.length} occupied, ${canvas.slots.available} available of ${canvas.slots.total}.`
      : "Widget slots: unavailable.",
    canvas?.layout
      ? `Page layout: ${safeText(canvas.layout.name)} (${canvas.layout.sections} sections; ${safeText(canvas.layout.id)}).`
      : "Page layout: legacy bounded grid.",
    canvas && canvas.slots.occupied.length
      ? `Occupied widgets: ${canvas.slots.occupied
          .slice(0, 8)
          .map((slot) => `slot ${slot.index + 1}=${safeText(slot.widgetName)} (${safeText(slot.widgetId)})`)
          .join("; ")}.`
      : "Occupied widgets: none.",
    `Selected widget: ${canvas?.selectedWidget ? `${safeText(canvas.selectedWidget.name)} (${safeText(canvas.selectedWidget.id)})` : "none"}.`,
    build
      ? `Personalization: ${safeText(build.personalization.datingMode)} planner, ${safeText(build.personalization.weekStart)} week start, ${safeText(build.personalization.orientation)} layout, starts ${safeText(build.personalization.startMonth)}/${safeText(build.personalization.startYear)}, ${build.personalization.monthCount} month(s).`
      : "Personalization: unavailable.",
    build
      ? `Visual system: theme ${safeText(build.visualSystem.themeId)}, palette ${safeText(build.visualSystem.paletteId)}, tabs ${safeText(build.visualSystem.tabPosition)}, background ${safeText(build.visualSystem.backgroundId)}; sections: ${formatList(build.visualSystem.sections)}; sticker packs: ${build.visualSystem.stickerPackCount}; inserts: ${build.visualSystem.insertCount}.`
      : "Visual system: unavailable.",
    build
      ? `Typography: heading ${safeText(build.visualSystem.fonts.heading)}, subheading ${safeText(build.visualSystem.fonts.subheading)}, body ${safeText(build.visualSystem.fonts.body)}, accent ${safeText(build.visualSystem.fonts.accent)}.`
      : "Typography: unavailable.",
    build
      ? `Physical finish: ${safeText(build.visualSystem.bindingType)} binding, ${safeText(build.visualSystem.bindingFinish)} finish, ${safeText(build.visualSystem.paperColour)} paper.`
      : "Physical finish: unavailable.",
    build
      ? `Output: ink-friendly ${build.output.inkFriendly ? "on" : "off"}; e-ink profile ${safeText(build.output.einkDevice, "none")}.`
      : "Output: unavailable.",
  ];

  return lines.join("\n").slice(0, MAX_CONTEXT_CHARS);
}