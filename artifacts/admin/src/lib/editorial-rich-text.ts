const RICH_TEXT_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI",
  "BLOCKQUOTE", "H2", "H3", "H4", "DIV",
]);

function escapeRichText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Store only the Editorial Studio's deliberately small, attribute-free HTML subset. */
export function sanitizeEditorialRichText(value: string): string {
  if (!value) return "";
  if (!value.includes("<")) {
    return `<p>${escapeRichText(value).replace(/\r?\n/g, "<br>")}</p>`;
  }

  const doc = new DOMParser().parseFromString(value, "text/html");
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeRichText(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const element = node as HTMLElement;
    const tag = element.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE") return "";
    const inner = Array.from(element.childNodes).map(serialize).join("");
    if (!RICH_TEXT_TAGS.has(tag)) return inner;
    if (tag === "BR") return "<br>";
    return `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`;
  };

  return Array.from(doc.body.childNodes).map(serialize).join("");
}

/** Rich editing is visual only; compilers and AI prompts always receive clean prose. */
export function editorialRichTextToPlainText(value: string): string {
  if (!value) return "";
  const doc = new DOMParser().parseFromString(sanitizeEditorialRichText(value), "text/html");
  return (doc.body.textContent ?? "").replace(/\u00a0/g, " ").trim();
}