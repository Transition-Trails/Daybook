/**
 * SECTION LIBRARY — defined once, never branched on product type.
 *
 * A recipe's `parts` array lists section IDs from this library.
 * The builder renders `recipe.parts.map(id => SECTION_LIBRARY[id])`.
 * Zero product-type conditionals — every product difference is data.
 */
import type { OwnedTheme, OwnedList, OwnedPalette } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectionOption {
  id: string;
  name: string;
  /** One-line descriptor shown under the name */
  desc: string;
  /**
   * Visual swatch:
   *   "#RRGGBB"           → solid colour circle
   *   "palette:c1,c2,c3"  → mini stacked swatches (palette section)
   */
  swatch: string;
}

export interface SectionDef {
  id: string;
  /** Display-serif heading shown in Step 3 centre pane */
  title: string;
  /** One-sentence brief shown under the heading */
  description: string;
  /** Shown in the blush "FROM YOUR THEME" card */
  themeRationale: string;
  /** Uppercase label above the options grid */
  optionGroupLabel: string;
  /** Small note below the label */
  optionGroupNote?: string;
  /** Shown when the section has a hard platform limit */
  limitNote?: string;
  /**
   * When true, options are resolved dynamically from store assets at render time
   * (palette → store palettes; stickers → store packs).
   */
  dynamic?: true;
  /** Empty array when dynamic = true */
  options: SectionOption[];
}

// ── Section Library ───────────────────────────────────────────────────────────

export const SECTION_LIBRARY: Record<string, SectionDef> = {
  hardware: {
    id: "hardware",
    title: "Rings, coil or discs",
    description:
      "What binds the pages in the realistic view. Buyers notice this more than you would expect.",
    themeRationale:
      "This hardware reads warm against aged paper — it matches the cover art.",
    optionGroupLabel: "BINDING HARDWARE",
    optionGroupNote: "Any of these work with this template.",
    options: [
      { id: "brass",  name: "Brass",  desc: "coil, m metal, left edge", swatch: "#B5923C" },
      { id: "black",  name: "Black",  desc: "discs, 11 discs",           swatch: "#1A1A1A" },
      { id: "silver", name: "Silver", desc: "rings, cool tone",           swatch: "#9EA4AE" },
      { id: "twin",   name: "Twin",   desc: "loops, tight pitch",         swatch: "#8C8C90" },
      { id: "none",   name: "None",   desc: "flat pages, no binding",     swatch: "#E7DCCB" },
    ],
  },

  tabs: {
    id: "tabs",
    title: "Tab position",
    description:
      "Where the section dividers sit. Side tabs are the most familiar; top tabs work better in landscape.",
    themeRationale:
      "This tab placement complements the cover art and page layout the theme sets up.",
    optionGroupLabel: "TAB PLACEMENT",
    options: [
      { id: "side",  name: "Side tabs",  desc: "right edge, default",  swatch: "#C87560" },
      { id: "left",  name: "Left tabs",  desc: "mirror layout",         swatch: "#C87560" },
      { id: "top",   name: "Top tabs",   desc: "landscape-friendly",    swatch: "#C87560" },
      { id: "none",  name: "No tabs",    desc: "plain page breaks",     swatch: "#E7DCCB" },
    ],
  },

  inserts: {
    id: "inserts",
    title: "Insert pages",
    description:
      "Pre-built page layouts slotted between your planner sections. The theme's insert matches its cover art.",
    themeRationale:
      "This insert was designed alongside the theme — the artwork carries through from the cover.",
    optionGroupLabel: "INSERT STYLE",
    limitNote: "Up to 10 note sections",
    options: [
      { id: "december-daily",  name: "December daily",  desc: "daily log, December dates",   swatch: "#8B2323" },
      { id: "christmas-daily", name: "Christmas daily", desc: "advent-formatted daily",       swatch: "#2B6B3E" },
      { id: "weekly",          name: "Weekly",          desc: "weekly spread format",          swatch: "#4A6080" },
      { id: "monthly",         name: "Monthly",         desc: "monthly overview page",         swatch: "#4A6080" },
      { id: "blank",           name: "Blank",           desc: "no insert pages",              swatch: "#E7DCCB" },
    ],
  },

  doors: {
    id: "doors",
    title: "Advent door style",
    description:
      "How the 25 countdown doors appear. Illustrated doors carry the theme's art; numbered doors let the art breathe.",
    themeRationale:
      "This door style was matched to the theme's illustration palette.",
    optionGroupLabel: "DOOR STYLE",
    options: [
      { id: "numbered",    name: "1–25 numbered",      desc: "clean numerals, each door",  swatch: "#C87560" },
      { id: "illustrated", name: "Illustrated",        desc: "full-art door panels",        swatch: "#8B2323" },
      { id: "watercolour", name: "Advent watercolour", desc: "painted texture, soft edges", swatch: "#A8C4D0" },
    ],
  },

  paper: {
    id: "paper",
    title: "Note paper style",
    description:
      "The ruling or texture of the writing pages. Dotted and blank work for bullet journaling; lined is better for prose.",
    themeRationale:
      "This paper style is the most versatile match for the theme's palette.",
    optionGroupLabel: "PAPER RULING",
    options: [
      { id: "lined",       name: "Lined",       desc: "classic ruled lines",   swatch: "#4A6080" },
      { id: "dotted",      name: "Dotted",      desc: "5 mm dot grid",         swatch: "#4A6080" },
      { id: "blank",       name: "Blank",       desc: "unruled white space",   swatch: "#FFFDF9" },
      { id: "watercolour", name: "Watercolour", desc: "textured wash paper",   swatch: "#A8C4D0" },
    ],
  },

  prompts: {
    id: "prompts",
    title: "Writing prompts",
    description:
      "Structured questions printed above the writing area. They guide the journaling practice without taking over the page.",
    themeRationale:
      "These prompts pair with the theme's focus and reinforce what the journal is for.",
    optionGroupLabel: "PROMPT SET",
    options: [
      { id: "morning-pages",     name: "Morning pages",    desc: "3-question AM ritual",   swatch: "#C87560" },
      { id: "gratitude",         name: "Gratitude",        desc: "5 daily gratitudes",      swatch: "#22A66B" },
      { id: "weekly-reflection", name: "Weekly reflection",desc: "end-of-week review",      swatch: "#4A6080" },
      { id: "none",              name: "No prompts",       desc: "pure writing space",      swatch: "#E7DCCB" },
    ],
  },

  palette: {
    id: "palette",
    title: "Colour palette",
    description:
      "The accent colours used throughout — tabs, headers, link underlines. Palettes come from your theme or your library.",
    themeRationale:
      "This palette was designed to pair with the theme's backgrounds and cover art.",
    optionGroupLabel: "PALETTES",
    dynamic: true,
    options: [],
  },

  stickers: {
    id: "stickers",
    title: "Sticker pack",
    description:
      "The sticker set bundled with this edition. Buyers can place these anywhere in the planner.",
    themeRationale:
      "This pack was illustrated to match the theme's colour and mood.",
    optionGroupLabel: "STICKER PACKS",
    dynamic: true,
    options: [],
  },

  cover: {
    id: "cover",
    title: "Cover art",
    description:
      "What appears on the front of the planner in the realistic preview and the shop listing image.",
    themeRationale:
      "The theme's cover art was built specifically for this product — it anchors the buyer's first impression.",
    optionGroupLabel: "COVER SOURCE",
    options: [
      { id: "theme-cover",   name: "Theme cover art", desc: "uses the theme's artwork",  swatch: "#C87560" },
      { id: "custom-upload", name: "Custom upload",   desc: "your own PNG or SVG",        swatch: "#4A6080" },
      { id: "plain",         name: "Plain",           desc: "palette colour, no art",     swatch: "#E7DCCB" },
    ],
  },

  dating: {
    id: "dating",
    title: "Dating",
    description:
      "Whether the planner has specific dates printed or is reusable across any year.",
    themeRationale:
      "This date mode is the standard for this product type.",
    optionGroupLabel: "DATE MODE",
    options: [
      { id: "dated",     name: "Dated",     desc: "specific year printed", swatch: "#1B2A4A" },
      { id: "undated",   name: "Undated",   desc: "reusable, no year",     swatch: "#4A6080" },
      { id: "perpetual", name: "Perpetual", desc: "month / day, no year",  swatch: "#8A7B6A" },
    ],
  },
};

// ── Theme defaults ────────────────────────────────────────────────────────────

/**
 * Returns the option ID + display label that the selected theme contributes
 * for the given section. Returns null if the theme has no preference for
 * this section.
 *
 * Note: OwnedTheme only carries palettes[] and fontPairing from the API.
 * Hardware, inserts, etc. are inferred from theme name heuristics in Round 1
 * and will be replaced with explicit DB fields in Round 2.
 */
export function resolveThemeDefault(
  sectionId: string,
  theme: OwnedTheme | null,
  ownedList: OwnedList | null,
): { optionId: string; label: string } | null {
  if (!theme) return null;

  switch (sectionId) {
    case "palette": {
      const pal = theme.palettes?.[0];
      if (!pal) return null;
      return { optionId: pal.id, label: pal.name };
    }

    case "stickers": {
      const pack = ownedList?.packs?.[0];
      if (!pack) return null;
      return { optionId: pack.id, label: pack.name };
    }

    case "cover":
      return { optionId: "theme-cover", label: "Theme cover art" };

    case "dating":
      return { optionId: "dated", label: "Dated" };

    case "tabs":
      return { optionId: "side", label: "Side tabs" };

    case "hardware": {
      // Heuristic from theme name — replaced by explicit DB field in Round 2
      const n = theme.name.toLowerCase();
      if (n.includes("christmas") || n.includes("vintage"))
        return { optionId: "brass",  label: "Brass coil" };
      if (n.includes("earth") || n.includes("warm"))
        return { optionId: "black",  label: "Black discs" };
      if (n.includes("botanical") || n.includes("ocean") || n.includes("deep"))
        return { optionId: "silver", label: "Silver rings" };
      return { optionId: "brass", label: "Brass coil" };
    }

    case "inserts": {
      const n = theme.name.toLowerCase();
      if (n.includes("christmas") || n.includes("advent") || n.includes("december"))
        return { optionId: "december-daily", label: "December daily" };
      return { optionId: "blank", label: "Blank" };
    }

    case "doors":
      return { optionId: "numbered", label: "1–25 numbered" };

    case "paper":
      return { optionId: "lined", label: "Lined" };

    case "prompts":
      return { optionId: "morning-pages", label: "Morning pages" };

    default:
      return null;
  }
}

/**
 * Resolves options for dynamic sections (palette, stickers).
 * For palette: prefers theme's own palettes, falls back to all owned palettes.
 * For stickers: uses the store's owned packs.
 */
export function resolveDynamicOptions(
  sectionId: string,
  ownedList: OwnedList | null,
  theme: OwnedTheme | null,
): SectionOption[] {
  if (sectionId === "palette") {
    const palettes: OwnedPalette[] =
      (theme?.palettes?.length ? theme.palettes : ownedList?.palettes) ?? [];
    return palettes.map((p) => ({
      id: p.id,
      name: p.name,
      desc: (p.colors ?? []).slice(0, 3).join(" · ") || "palette",
      swatch: `palette:${(p.colors ?? []).join(",")}`,
    }));
  }
  if (sectionId === "stickers") {
    return (ownedList?.packs ?? []).map((pk) => ({
      id: pk.id,
      name: pk.name,
      desc: (pk.tags ?? []).slice(0, 2).join(" · ") || "sticker pack",
      swatch: "#C87560",
    }));
  }
  return [];
}
