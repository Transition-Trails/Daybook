/**
 * Area definitions for the support form.
 * Kept in a separate file so SupportPage.tsx (default export = component)
 * is compatible with Vite React Fast Refresh — which requires that
 * files exporting non-component values don't also export a default component.
 */

import {
  Notebook, Sparkles, FileText, Cloud, Store, CreditCard,
  BookOpen, Link2, Scissors, Printer, Package, HelpCircle,
} from "lucide-react";
import type React from "react";

export interface AreaDef {
  key: string;
  label: string;
  desc: string;
  Icon: React.FC<{ size?: number; strokeWidth?: number; color?: string; style?: React.CSSProperties }>;
  symptoms: string[];
}

export const OWNER_AREAS: AreaDef[] = [
  {
    key: "building-planner",
    label: "Building a planner",
    desc: "Studio, AI generation, preview failures",
    Icon: Notebook,
    symptoms: [
      "Generation timed out or failed",
      "Preview shows wrong layout",
      "Wrong date range generated",
      "Fonts look different from preview",
      "Stickers didn't apply",
      "AI copilot not responding",
      "Recipe not loading in studio",
    ],
  },
  {
    key: "stickers-packs",
    label: "Stickers & packs",
    desc: "Cut paths, SVG exports, index sheets",
    Icon: Sparkles,
    symptoms: [
      "Cut path misaligned",
      "Halo / shadow cropped",
      "Index sheet blank or wrong size",
      "Pack won't export to SVG",
      "Sticker shows as placeholder",
      "Wrong sticker appears in pack",
    ],
  },
  {
    key: "exported-pdf",
    label: "Exported PDF",
    desc: "File links, page size, e-ink export",
    Icon: FileText,
    symptoms: [
      "File link is broken or missing",
      "Wrong page size in exported file",
      "Ink-friendly export looks wrong",
      "e-ink device profile incorrect",
      "Links in PDF don't work",
      "Font appears as fallback in PDF",
    ],
  },
  {
    key: "drive-sync",
    label: "Drive & sync",
    desc: "Google Drive permissions, folder location",
    Icon: Cloud,
    symptoms: [
      "File didn't appear in Drive folder",
      "Drive permission denied",
      "Synced to wrong folder",
      "Drive connection lost",
      "File overwrote wrong version",
    ],
  },
  {
    key: "my-storefront",
    label: "My storefront",
    desc: "Listings, themes, edition visibility",
    Icon: Store,
    symptoms: [
      "Edition not showing in storefront",
      "Theme not applied correctly",
      "Wrong price displayed",
      "Listing shows wrong cover",
      "Edition marked wrong tier",
    ],
  },
  {
    key: "account-billing",
    label: "Account & billing",
    desc: "Plan, seats, invoices",
    Icon: CreditCard,
    symptoms: [
      "Feature locked I should have access to",
      "Plan shows wrong tier",
      "Seat limit reached unexpectedly",
      "Invoice missing or incorrect",
      "Can't add a team member",
    ],
  },
];

export const BUYER_AREAS: AreaDef[] = [
  {
    key: "opening-planner",
    label: "Opening my planner",
    desc: "GoodNotes, Notability, app import",
    Icon: BookOpen,
    symptoms: [
      "File won't open in my app",
      "Pages appear blank or black",
      "File size seems too large",
      "App says file is corrupted",
      "Import failed with error",
    ],
  },
  {
    key: "links-not-working",
    label: "Links not working",
    desc: "Date tabs, navigation, hyperlinks",
    Icon: Link2,
    symptoms: [
      "Date tabs don't jump to the right page",
      "Monthly overview link is broken",
      "Back-to-menu link missing",
      "Index page links wrong",
      "Custom cover link not working",
    ],
  },
  {
    key: "using-stickers",
    label: "Using my stickers",
    desc: "Import, resize, placement in apps",
    Icon: Sparkles,
    symptoms: [
      "Stickers appear pixelated",
      "Background isn't transparent",
      "Cut path doesn't match design",
      "Stickers won't import to app",
      "Wrong size after importing",
    ],
  },
  {
    key: "printing-cutting",
    label: "Printing & cutting",
    desc: "Cricut, Silhouette, home printer",
    Icon: Scissors,
    symptoms: [
      "Cut path misaligned on print",
      "Registration marks in wrong place",
      "Colours different when printed",
      "Machine can't read SVG file",
      "Bleed margins incorrect",
    ],
  },
  {
    key: "something-missing",
    label: "Something is missing",
    desc: "Download not arrived, file incomplete",
    Icon: Package,
    symptoms: [
      "Download link not in email",
      "File seems incomplete",
      "Missing month or week pages",
      "Bonus file not included",
      "Different from what was shown",
    ],
  },
  {
    key: "something-else",
    label: "Something else",
    desc: "Not covered above",
    Icon: HelpCircle,
    symptoms: [
      "General question",
      "Feedback or suggestion",
      "Accessibility issue",
      "Other issue",
    ],
  },
];
