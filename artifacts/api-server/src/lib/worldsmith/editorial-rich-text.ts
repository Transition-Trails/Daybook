const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li",
  "blockquote", "h2", "h3", "h4", "div",
]);

const BLOCK_TAGS = /<\/?(?:p|div|h2|h3|h4|blockquote|li|ul|ol)\b[^>]*>/gi;
const BREAK_TAGS = /<br\b[^>]*>/gi;
const TAGS = /<[^>]*>/g;

/** Store only the deliberately small, attribute-free Editorial Studio HTML subset. */
export function sanitizeEditorialRichText(value: string): string {
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

/** Formatting must never be included in compiler or AI text context. */
export function editorialRichTextToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  return sanitizeEditorialRichText(value)
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