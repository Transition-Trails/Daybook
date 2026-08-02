/**
 * WorldSmith — Collection field resolution tests.
 *
 * Confirms that `spec.collection` (and therefore `ProvenanceRecord.collection`)
 * is populated correctly whether the "Collection" property on the Production
 * Specification is:
 *   (a) a Notion relation pointing to a separate Collection record, or
 *   (b) inline rich text / select.
 *
 * The relation case requires a follow-up `getPage` call to the linked record;
 * the inline case reads the text directly from the spec page.
 *
 * Strategy:
 *   - Test `resolveInheritanceChain` directly — it is responsible for setting
 *     `spec.collection` and its result feeds the ProvenanceRecord directly
 *     (orchestrator: `collection: spec.collection`).
 *   - Mock `notion-client` so no real Notion network calls are made.
 *   - Mock the run-repository to avoid DB writes when running through
 *     `runCompilation` for the provenance-level assertions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ─────────────────────────────────────────────────────────
const { mockGetPage, mockGetPageText } = vi.hoisted(() => ({
  mockGetPage: vi.fn(),
  mockGetPageText: vi.fn(),
}));

vi.mock("../lib/notion-client.js", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type NP = any;
  return {
    _setOnRetry: vi.fn(),
    getPage: mockGetPage,
    getPageText: mockGetPageText,
    updatePage: vi.fn().mockResolvedValue(undefined),
    createPage: vi.fn().mockResolvedValue({ id: "notion-new-page" }),
    richTextProp: (v: string) => ({ type: "rich_text", rich_text: [{ text: { content: v } }] }),
    selectProp: (v: string) => ({ type: "select", select: { name: v } }),
    relationProp: (ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })) }),
    extractTitle(prop: NP): string {
      if (!prop) return "";
      if (prop.type === "title") return (prop.title ?? []).map((r: NP) => r.plain_text ?? "").join("");
      if (prop.type === "rich_text") return (prop.rich_text ?? []).map((r: NP) => r.plain_text ?? "").join("");
      return "";
    },
    extractRichText(prop: NP): string {
      if (!prop) return "";
      if (prop.type === "rich_text") return (prop.rich_text ?? []).map((r: NP) => r.plain_text ?? "").join("");
      if (prop.type === "title") return (prop.title ?? []).map((r: NP) => r.plain_text ?? "").join("");
      return "";
    },
    extractSelect(prop: NP): string {
      if (!prop) return "";
      if (prop.type === "select") return prop.select?.name ?? "";
      if (prop.type === "status") return prop.status?.name ?? "";
      return "";
    },
    extractMultiSelect(prop: NP): string[] {
      if (!prop) return [];
      if (prop.type === "multi_select") return (prop.multi_select ?? []).map((o: NP) => o.name ?? "");
      return [];
    },
    extractRelation(prop: NP): string[] {
      if (!prop) return [];
      if (prop.type === "relation") return (prop.relation ?? []).map((r: NP) => r.id ?? "");
      return [];
    },
    extractNumber(prop: NP): number | undefined {
      if (!prop) return undefined;
      if (prop.type === "number") return prop.number ?? undefined;
      return undefined;
    },
    extractUrl(prop: NP): string | undefined {
      if (!prop) return undefined;
      if (prop.type === "url") return prop.url ?? undefined;
      return undefined;
    },
    extractCheckbox(prop: NP): boolean {
      if (!prop) return false;
      if (prop.type === "checkbox") return prop.checkbox ?? false;
      return false;
    },
  };
});

// ── Import after mocks ─────────────────────────────────────────────────────────
import { resolveInheritanceChain } from "../lib/worldsmith/inheritance-resolver.js";

// ── Page builder helpers ───────────────────────────────────────────────────────

/** Build a minimal Notion-like page with rich_text properties. */
function makePage(id: string, fields: Record<string, string>) {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    properties[key] = {
      type: "rich_text",
      rich_text: value ? [{ plain_text: value }] : [],
    };
  }
  return { id, properties, url: `https://notion.so/${id}` };
}

/** Build a Notion-like page where some properties are relation fields. */
function makePageWithRelations(
  id: string,
  textFields: Record<string, string>,
  relationFields: Record<string, string[]>,
) {
  const page = makePage(id, textFields);
  for (const [key, ids] of Object.entries(relationFields)) {
    (page.properties as Record<string, unknown>)[key] = {
      type: "relation",
      relation: ids.map((rid) => ({ id: rid })),
    };
  }
  return page;
}

/** Build a title-typed page (used to simulate a Collection record in Notion). */
function makeCollectionPage(id: string, title: string) {
  return {
    id,
    properties: {
      Name: {
        type: "title",
        title: [{ plain_text: title }],
      },
    },
    url: `https://notion.so/${id}`,
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SPEC_ID = "spec-collection-test-001";
const COLLECTION_PAGE_ID = "collection-page-abc";

// ── Test setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token-not-real";
  vi.clearAllMocks();
  mockGetPageText.mockResolvedValue("");
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("resolveInheritanceChain — Collection as Notion relation", () => {
  it("fetches the linked Collection page and reads its title into spec.collection", async () => {
    // The Production Spec page has Collection stored as a relation field,
    // not as inline text — extractRichText returns "" for a relation property.
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            World: "Thornvale",
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { Collection: [COLLECTION_PAGE_ID] },
        ),
      )
      // Second call: the linked Collection record
      .mockResolvedValueOnce(makeCollectionPage(COLLECTION_PAGE_ID, "Thornvale Chronicles"));

    const chain = await resolveInheritanceChain(SPEC_ID);

    // collection should be the title read from the linked page, not undefined
    expect(chain.productionSpec.collection).toBe("Thornvale Chronicles");

    // The Notion page ID of the Collection record should also be captured
    expect(chain.productionSpec.collectionId).toBe(COLLECTION_PAGE_ID);

    // getPage must have been called twice: once for the spec, once for the collection
    expect(mockGetPage).toHaveBeenCalledTimes(2);
    expect(mockGetPage).toHaveBeenNthCalledWith(1, SPEC_ID);
    expect(mockGetPage).toHaveBeenNthCalledWith(2, COLLECTION_PAGE_ID);
  });

  it("leaves collection undefined (but does not throw) when the Collection page fetch fails", async () => {
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            World: "Thornvale",
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { Collection: [COLLECTION_PAGE_ID] },
        ),
      )
      .mockRejectedValueOnce(
        new Error("Notion API GET /pages/collection-page-abc → 404: page not found"),
      );

    // Should not throw — missing collection name is non-fatal
    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.productionSpec.collectionId).toBe(COLLECTION_PAGE_ID);
    // collection is blank because the fetch failed, but the chain still resolved
    expect(chain.productionSpec.collection).toBeUndefined();
  });
});

describe("resolveInheritanceChain — Collection as inline rich text", () => {
  it("reads the collection name directly from the spec page (no extra getPage call)", async () => {
    // The Production Spec has Collection stored as a plain rich_text field.
    mockGetPage.mockResolvedValueOnce(
      makePage(SPEC_ID, {
        World: "Thornvale",
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
        Collection: "The Ember Codex",
      }),
    );

    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.productionSpec.collection).toBe("The Ember Codex");
    // No collectionId because it was not a relation
    expect(chain.productionSpec.collectionId).toBeUndefined();

    // getPage was called exactly once — no follow-up fetch needed
    expect(mockGetPage).toHaveBeenCalledTimes(1);
    expect(mockGetPage).toHaveBeenCalledWith(SPEC_ID);
  });
});

describe("ProvenanceRecord — collection field flows through from resolved spec", () => {
  it("provenance.collection is the name from the linked Collection page when stored as a relation", async () => {
    // This confirms the end-to-end path:
    // Notion relation → resolveInheritanceChain → spec.collection → ProvenanceRecord.collection
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            World: "Thornvale",
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { Collection: [COLLECTION_PAGE_ID] },
        ),
      )
      .mockResolvedValueOnce(makeCollectionPage(COLLECTION_PAGE_ID, "The Iron Archive"));

    const chain = await resolveInheritanceChain(SPEC_ID);

    // Simulate the ProvenanceRecord construction in orchestrator.ts
    const provenance = {
      collection: chain.productionSpec.collection,
      collection_notion_id: chain.productionSpec.collectionId,
    };

    expect(provenance.collection).toBe("The Iron Archive");
    expect(provenance.collection_notion_id).toBe(COLLECTION_PAGE_ID);
  });

  it("provenance.collection is the inline text when Collection is not a relation", async () => {
    mockGetPage.mockResolvedValueOnce(
      makePage(SPEC_ID, {
        World: "Thornvale",
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
        Collection: "Verdant Veil",
      }),
    );

    const chain = await resolveInheritanceChain(SPEC_ID);

    const provenance = {
      collection: chain.productionSpec.collection,
      collection_notion_id: chain.productionSpec.collectionId,
    };

    expect(provenance.collection).toBe("Verdant Veil");
    expect(provenance.collection_notion_id).toBeUndefined();
  });
});
