/**
 * The only categories accepted for help articles.
 *
 * These keys deliberately match the owner and buyer support areas so tickets,
 * suggested articles, deep links, and authored help content use one vocabulary.
 */
export const HELP_CATEGORIES = [
  { key: "concepts", label: "Concepts" },
  { key: "building-planner", label: "Building a planner" },
  { key: "stickers-packs", label: "Stickers & packs" },
  { key: "exported-pdf", label: "Exported PDF" },
  { key: "drive-sync", label: "Drive & sync" },
  { key: "my-storefront", label: "My storefront" },
  { key: "account-billing", label: "Account & billing" },
  { key: "opening-planner", label: "Opening my planner" },
  { key: "links-not-working", label: "Links not working" },
  { key: "using-stickers", label: "Using my stickers" },
  { key: "printing-cutting", label: "Printing & cutting" },
  { key: "something-missing", label: "Something is missing" },
  { key: "something-else", label: "Something else" },
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number]["key"];

const helpCategoryKeys = new Set<string>(HELP_CATEGORIES.map(({ key }) => key));

export function isHelpCategory(value: unknown): value is HelpCategory {
  return typeof value === "string" && helpCategoryKeys.has(value);
}

export function helpCategoryLabel(category: string): string {
  return HELP_CATEGORIES.find(({ key }) => key === category)?.label ?? category;
}