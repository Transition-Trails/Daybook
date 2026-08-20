const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "blockquote", "h2", "h3", "h4", "div",
]);

const BLOCK_TAGS = /<\/?(?:p|div|h2|h3|h4|blockquote|li|ul|ol)\b[^>]*>/gi;
const BREAK_TAGS = /<br\b[^>]*>/gi;
const TAGS = /<[^>]*>/g;

/**
 * World Bible prose is stored as a deliberately small, attribute-free subset
 * of HTML. This keeps editor formatting without allowing executable markup.
 */
export function sanitizeWorldBibleRichText(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?([a-z0-9]+)(?:\s[^>]*)?>/gi, (match, rawTag: string) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return "";
      return match.startsWith("</") ? `</${tag}>` : tag === "br" ? "<br>" : `<${tag}>`;
    })
    .trim();
}

/** Formatting must never become part of a generation prompt. */
export function worldBibleRichTextToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  return sanitizeWorldBibleRichText(value)
    .replace(BREAK_TAGS, "\n")
    .replace(BLOCK_TAGS, "\n")
    .replace(TAGS, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#0?39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}