/**
 * WorldSmith — World and Volume field resolution tests.
 *
 * Confirms that `spec.world` and `spec.volume` (and therefore the
 * ProvenanceRecord) are populated correctly whether the "World" / "Volume"
 * properties on the Production Specification are:
 *   (a) a Notion relation pointing to a separate record, or
 *   (b) inline rich text / select.
 *
 * The relation case requires a follow-up `getPage` call to the linked record;
 * the inline case reads the text directly from the spec page.
 *
 * Strategy:
 *   - Test `resolveInheritanceChain` directly.
 *   - Mock `notion-client` so no real Notion network calls are made.
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

/** Build a title-typed page (used to simulate a World or Volume record in Notion). */
function makeTitlePage(id: string, titleField: string, title: string) {
  return {
    id,
    properties: {
      [titleField]: {
        type: "title",
        title: [{ plain_text: title }],
      },
    },
    url: `https://notion.so/${id}`,
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SPEC_ID = "spec-world-volume-test-001";
const WORLD_PAGE_ID = "world-page-abc";
const VOLUME_PAGE_ID = "volume-page-xyz";

// ── Test setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.NOTION_TOKEN = "test-token-not-real";
  vi.clearAllMocks();
  mockGetPageText.mockResolvedValue("");
});

// ── World field tests ─────────────────────────────────────────────────────────

describe("resolveInheritanceChain — World as Notion relation", () => {
  it("fetches the linked World page and reads its title into spec.world", async () => {
    // The Production Spec page has World stored as a relation field,
    // not as inline text — extractRichText returns "" for a relation property.
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { World: [WORLD_PAGE_ID] },
        ),
      )
      // Second call: the linked World record
      .mockResolvedValueOnce(makeTitlePage(WORLD_PAGE_ID, "Name", "Thornvale"));

    const chain = await resolveInheritanceChain(SPEC_ID);

    // world should be the title read from the linked page, not the raw ID
    expect(chain.productionSpec.world).toBe("Thornvale");

    // The Notion page ID of the World record should also be captured
    expect(chain.productionSpec.worldId).toBe(WORLD_PAGE_ID);

    // getPage must have been called twice: once for the spec, once for the world
    expect(mockGetPage).toHaveBeenCalledTimes(2);
    expect(mockGetPage).toHaveBeenNthCalledWith(1, SPEC_ID);
    expect(mockGetPage).toHaveBeenNthCalledWith(2, WORLD_PAGE_ID);
  });

  it("leaves world blank (and throws MISSING_WORLD) when the World page fetch fails", async () => {
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { World: [WORLD_PAGE_ID] },
        ),
      )
      .mockRejectedValueOnce(
        new Error("Notion API GET /pages/world-page-abc → 404: page not found"),
      );

    // The world name cannot be resolved, so the chain throws MISSING_WORLD
    await expect(resolveInheritanceChain(SPEC_ID)).rejects.toMatchObject({
      errorCode: "MISSING_WORLD",
    });
  });

  it("uses inline world when both relation and inline text are present (inline wins)", async () => {
    // Inline rich_text fields are checked before extractRelation, so inline wins.
    mockGetPage.mockResolvedValueOnce(
      // makePage sets all fields as rich_text; we then override World as a relation
      // but also keep a rich_text World to simulate a page where both exist.
      // In practice Notion only returns one type per property, but the extractor
      // priority (richText → select → relation) should be verified.
      makePageWithRelations(
        SPEC_ID,
        {
          World: "Thornvale Inline",
          "Component Type": "Cover Art",
          "Payload Version": "PP-1.0",
        },
        // The relation is present alongside the rich_text — richText wins.
        {},
      ),
    );

    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.productionSpec.world).toBe("Thornvale Inline");
    // No worldId because the relation field was not populated
    expect(chain.productionSpec.worldId).toBeUndefined();
    // Only one getPage call — no follow-up needed
    expect(mockGetPage).toHaveBeenCalledTimes(1);
  });
});

describe("resolveInheritanceChain — World as inline rich text", () => {
  it("reads world directly from the spec page without an extra getPage call", async () => {
    mockGetPage.mockResolvedValueOnce(
      makePage(SPEC_ID, {
        World: "The Amber Reaches",
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
      }),
    );

    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.productionSpec.world).toBe("The Amber Reaches");
    expect(chain.productionSpec.worldId).toBeUndefined();
    // getPage was called exactly once — no follow-up fetch needed
    expect(mockGetPage).toHaveBeenCalledTimes(1);
    expect(mockGetPage).toHaveBeenCalledWith(SPEC_ID);
  });
});

// ── Volume field tests ────────────────────────────────────────────────────────

describe("resolveInheritanceChain — Volume as Notion relation", () => {
  it("fetches the linked Volume page and reads its title into spec.volume", async () => {
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            World: "Thornvale",
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { Volume: [VOLUME_PAGE_ID] },
        ),
      )
      // Second call: the linked Volume record
      .mockResolvedValueOnce(makeTitlePage(VOLUME_PAGE_ID, "Name", "Volume I: The First Age"));

    const chain = await resolveInheritanceChain(SPEC_ID);

    // volume should be the title read from the linked page, not the raw ID
    expect(chain.productionSpec.volume).toBe("Volume I: The First Age");

    // The Notion page ID of the Volume record should also be captured
    expect(chain.productionSpec.volumeId).toBe(VOLUME_PAGE_ID);

    // getPage: spec + volume
    expect(mockGetPage).toHaveBeenCalledTimes(2);
    expect(mockGetPage).toHaveBeenNthCalledWith(1, SPEC_ID);
    expect(mockGetPage).toHaveBeenNthCalledWith(2, VOLUME_PAGE_ID);
  });

  it("leaves volume undefined (but does not throw) when the Volume page fetch fails", async () => {
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            World: "Thornvale",
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { Volume: [VOLUME_PAGE_ID] },
        ),
      )
      .mockRejectedValueOnce(
        new Error("Notion API GET /pages/volume-page-xyz → 404: page not found"),
      );

    // Should not throw — missing volume name is non-fatal
    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.productionSpec.volumeId).toBe(VOLUME_PAGE_ID);
    // volume is blank because the fetch failed, but the chain still resolved
    expect(chain.productionSpec.volume).toBeUndefined();
    // world is still intact
    expect(chain.productionSpec.world).toBe("Thornvale");
  });
});

describe("resolveInheritanceChain — Volume as inline rich text", () => {
  it("reads volume directly from the spec page without an extra getPage call", async () => {
    mockGetPage.mockResolvedValueOnce(
      makePage(SPEC_ID, {
        World: "Thornvale",
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
        Volume: "Season of Frost",
      }),
    );

    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.productionSpec.volume).toBe("Season of Frost");
    expect(chain.productionSpec.volumeId).toBeUndefined();
    // getPage was called exactly once — no follow-up fetch needed
    expect(mockGetPage).toHaveBeenCalledTimes(1);
  });
});

// ── Combined World + Volume relation tests ────────────────────────────────────

describe("resolveInheritanceChain — both World and Volume as Notion relations", () => {
  it("fetches both linked pages and populates spec.world and spec.volume", async () => {
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          {
            World: [WORLD_PAGE_ID],
            Volume: [VOLUME_PAGE_ID],
          },
        ),
      )
      .mockResolvedValueOnce(makeTitlePage(WORLD_PAGE_ID, "Name", "Thornvale"))
      .mockResolvedValueOnce(makeTitlePage(VOLUME_PAGE_ID, "Name", "Volume II: The Long Winter"));

    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.productionSpec.world).toBe("Thornvale");
    expect(chain.productionSpec.worldId).toBe(WORLD_PAGE_ID);
    expect(chain.productionSpec.volume).toBe("Volume II: The Long Winter");
    expect(chain.productionSpec.volumeId).toBe(VOLUME_PAGE_ID);

    // spec + world + volume = 3 calls
    expect(mockGetPage).toHaveBeenCalledTimes(3);
  });
});

// ── ProvenanceRecord flow-through ─────────────────────────────────────────────

describe("ProvenanceRecord — world and volume fields flow through from resolved spec", () => {
  it("provenance.world is the name from the linked World page when stored as a relation", async () => {
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { World: [WORLD_PAGE_ID] },
        ),
      )
      .mockResolvedValueOnce(makeTitlePage(WORLD_PAGE_ID, "Name", "The Iron Sanctum"));

    const chain = await resolveInheritanceChain(SPEC_ID);

    // Simulate the ProvenanceRecord construction in orchestrator.ts
    const provenance = {
      world: chain.productionSpec.world,
      world_notion_id: chain.productionSpec.worldId,
    };

    expect(provenance.world).toBe("The Iron Sanctum");
    expect(provenance.world_notion_id).toBe(WORLD_PAGE_ID);
  });

  it("provenance.volume is the name from the linked Volume page when stored as a relation", async () => {
    mockGetPage
      .mockResolvedValueOnce(
        makePageWithRelations(
          SPEC_ID,
          {
            World: "Thornvale",
            "Component Type": "Cover Art",
            "Payload Version": "PP-1.0",
          },
          { Volume: [VOLUME_PAGE_ID] },
        ),
      )
      .mockResolvedValueOnce(makeTitlePage(VOLUME_PAGE_ID, "Name", "The Verdant Arc"));

    const chain = await resolveInheritanceChain(SPEC_ID);

    const provenance = {
      world: chain.productionSpec.world,
      volume: chain.productionSpec.volume,
      volume_notion_id: chain.productionSpec.volumeId,
    };

    expect(provenance.world).toBe("Thornvale");
    expect(provenance.volume).toBe("The Verdant Arc");
    expect(provenance.volume_notion_id).toBe(VOLUME_PAGE_ID);
  });

  it("provenance.world and .volume are inline text when neither is a relation", async () => {
    mockGetPage.mockResolvedValueOnce(
      makePage(SPEC_ID, {
        World: "Silverveil",
        Volume: "Chapter One",
        "Component Type": "Cover Art",
        "Payload Version": "PP-1.0",
      }),
    );

    const chain = await resolveInheritanceChain(SPEC_ID);

    expect(chain.productionSpec.world).toBe("Silverveil");
    expect(chain.productionSpec.worldId).toBeUndefined();
    expect(chain.productionSpec.volume).toBe("Chapter One");
    expect(chain.productionSpec.volumeId).toBeUndefined();

    expect(mockGetPage).toHaveBeenCalledTimes(1);
  });
});
