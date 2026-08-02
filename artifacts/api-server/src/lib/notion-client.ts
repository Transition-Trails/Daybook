/**
 * Minimal Notion API client.
 * Uses the Notion REST API v1 with an Internal Integration token.
 * No external npm package required.
 */

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

/** Maximum number of 429-retry attempts before giving up. */
const NOTION_MAX_RETRIES = 3;
/** Hard ceiling on any single retry delay (ms). */
const NOTION_MAX_DELAY_MS = 30_000;

function headers() {
  const token = process.env.NOTION_TOKEN;
  if (!token) throw new Error("NOTION_TOKEN environment variable is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/** Resolves after `ms` milliseconds (test-injectable via the module-level setter). */
let _sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Override the sleep implementation (for unit tests). */
export function _setSleep(fn: (ms: number) => Promise<void>): void {
  _sleep = fn;
}

const RETRYABLE_CODES = new Set(["ETIMEDOUT", "ECONNREFUSED", "ECONNRESET"]);

/**
 * Returns true for connection-level errors that are safe to retry:
 * AbortError (request timeout), ETIMEDOUT, ECONNREFUSED, ECONNRESET.
 *
 * Node's native fetch (undici) wraps socket errors as:
 *   TypeError("fetch failed") { cause: Error { code: "ECONNREFUSED" } }
 * so we walk the cause chain in addition to checking the top-level error.
 */
function isRetryableNetworkError(err: unknown): boolean {
  let current: unknown = err;
  while (current instanceof Error) {
    if (current.name === "AbortError") return true;
    const code = (current as NodeJS.ErrnoException).code;
    if (code && RETRYABLE_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Fetch wrapper around the Notion REST API.
 * Automatically retries on HTTP 429 (rate-limited) and on connection-level
 * errors (AbortError, ETIMEDOUT, ECONNREFUSED, ECONNRESET) with exponential
 * back-off, honouring the Retry-After header when present for 429s.
 *
 * - Up to NOTION_MAX_RETRIES retry attempts after the first failure.
 * - Each delay is capped at NOTION_MAX_DELAY_MS (30 s).
 * - After all retries are exhausted a 429 is re-thrown as a plain Error whose
 *   message contains "429" so classifyNotionErr() recognises it as
 *   NOTION_RATE_LIMITED / retry_safe=true.
 */
async function notionFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method ?? "GET";
  let attempt = 0;

  while (true) {
    let res: Response;
    try {
      res = await fetch(`${NOTION_API}${path}`, {
        ...options,
        headers: { ...headers(), ...(options.headers as Record<string, string> ?? {}) },
      });
    } catch (err) {
      // Network-level error — retry if retryable and attempts remain.
      if (attempt < NOTION_MAX_RETRIES && isRetryableNetworkError(err)) {
        const delay = Math.min(1_000 * Math.pow(2, attempt), NOTION_MAX_DELAY_MS);
        attempt++;
        await _sleep(delay);
        continue;
      }
      throw err;
    }

    if (res.status === 429 && attempt < NOTION_MAX_RETRIES) {
      // Honour Retry-After header (seconds) when present; otherwise exponential back-off.
      const retryAfterHeader = res.headers.get("Retry-After");
      const baseDelay = retryAfterHeader
        ? parseFloat(retryAfterHeader) * 1_000
        : 1_000 * Math.pow(2, attempt);
      const delay = Math.min(baseDelay, NOTION_MAX_DELAY_MS);
      attempt++;
      await _sleep(delay);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Notion API ${method} ${path} → ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }
}

// ── Property value extractors ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotionProp = any;

export function extractTitle(prop: NotionProp): string {
  if (!prop) return "";
  if (prop.type === "title") return (prop.title ?? []).map((r: NotionProp) => r.plain_text ?? "").join("");
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((r: NotionProp) => r.plain_text ?? "").join("");
  return "";
}

export function extractRichText(prop: NotionProp): string {
  if (!prop) return "";
  if (prop.type === "rich_text") return (prop.rich_text ?? []).map((r: NotionProp) => r.plain_text ?? "").join("");
  if (prop.type === "title") return (prop.title ?? []).map((r: NotionProp) => r.plain_text ?? "").join("");
  return "";
}

export function extractSelect(prop: NotionProp): string {
  if (!prop) return "";
  if (prop.type === "select") return prop.select?.name ?? "";
  if (prop.type === "status") return prop.status?.name ?? "";
  return "";
}

export function extractMultiSelect(prop: NotionProp): string[] {
  if (!prop) return [];
  if (prop.type === "multi_select") return (prop.multi_select ?? []).map((o: NotionProp) => o.name ?? "");
  return [];
}

export function extractRelation(prop: NotionProp): string[] {
  if (!prop) return [];
  if (prop.type === "relation") return (prop.relation ?? []).map((r: NotionProp) => r.id ?? "");
  return [];
}

export function extractNumber(prop: NotionProp): number | undefined {
  if (!prop) return undefined;
  if (prop.type === "number") return prop.number ?? undefined;
  return undefined;
}

export function extractUrl(prop: NotionProp): string | undefined {
  if (!prop) return undefined;
  if (prop.type === "url") return prop.url ?? undefined;
  return undefined;
}

export function extractCheckbox(prop: NotionProp): boolean {
  if (!prop) return false;
  if (prop.type === "checkbox") return prop.checkbox ?? false;
  return false;
}

// ── Page API ──────────────────────────────────────────────────────────────────

export interface NotionPage {
  id: string;
  properties: Record<string, NotionProp>;
  url: string;
}

export async function getPage(pageId: string): Promise<NotionPage> {
  return notionFetch<NotionPage>(`/pages/${pageId}`);
}

export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>,
): Promise<NotionPage> {
  return notionFetch<NotionPage>(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

// ── Block content extraction ──────────────────────────────────────────────────

interface NotionBlock {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface BlocksResponse {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

/** Recursively fetch all block children and return as plain text. */
export async function getPageText(pageId: string): Promise<string> {
  const lines: string[] = [];
  let cursor: string | null = null;

  do {
    const query: Record<string, string> = { page_size: "100" };
    if (cursor) query.start_cursor = cursor;
    const qs = new URLSearchParams(query).toString();
    const data = await notionFetch<BlocksResponse>(`/blocks/${pageId}/children?${qs}`);

    for (const block of data.results) {
      const text = extractBlockText(block);
      if (text) lines.push(text);
    }

    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return lines.join("\n");
}

function extractBlockText(block: NotionBlock): string {
  const richTextTypes = [
    "paragraph",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list_item",
    "numbered_list_item",
    "quote",
    "callout",
    "toggle",
  ];
  for (const t of richTextTypes) {
    if (block.type === t) {
      const rt = block[t]?.rich_text ?? [];
      return rt.map((r: NotionProp) => r.plain_text ?? "").join("");
    }
  }
  if (block.type === "code") {
    const rt = block.code?.rich_text ?? [];
    return rt.map((r: NotionProp) => r.plain_text ?? "").join("");
  }
  return "";
}

// ── Database API ──────────────────────────────────────────────────────────────

interface QueryFilter {
  property: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export async function queryDatabase(
  databaseId: string,
  filter?: QueryFilter,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = { page_size: 100 };
    if (filter) body.filter = filter;
    if (cursor) body.start_cursor = cursor;

    const data = await notionFetch<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      `/databases/${databaseId}/query`,
      { method: "POST", body: JSON.stringify(body) },
    );

    pages.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return pages;
}

/** Create a new page in a database. */
export async function createPage(
  databaseId: string,
  properties: Record<string, unknown>,
): Promise<NotionPage> {
  return notionFetch<NotionPage>("/pages", {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: databaseId }, properties }),
  });
}

// ── Helpers for writing back to Notion ───────────────────────────────────────

export function richTextProp(text: string): { rich_text: Array<{ text: { content: string } }> } {
  // Notion rich_text max 2000 chars per element
  const chunks: Array<{ text: { content: string } }> = [];
  for (let i = 0; i < text.length; i += 2000) {
    chunks.push({ text: { content: text.slice(i, i + 2000) } });
  }
  return { rich_text: chunks };
}

export function selectProp(name: string): { select: { name: string } } {
  return { select: { name } };
}

export function relationProp(ids: string[]): { relation: Array<{ id: string }> } {
  return { relation: ids.map((id) => ({ id })) };
}

export function urlProp(url: string): { url: string } {
  return { url };
}
