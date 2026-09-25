/**
 * canon-sync-relation-types.test.ts
 *
 * Regression test: manually-set relation types (e.g. "contradicts") must
 * survive a Notion re-sync without being reset to "related".
 *
 * The sync route (POST /v1/editorial/canon-records/sync-notion) previously
 * deleted all outgoing edges for synced records and reinserted them as
 * "related". This test verifies the differential-sync fix: existing edges
 * are preserved; manually-authored edges are never removed by Notion sync.
 *
 * Strategy:
 *   - Mock `notion-client.queryDatabase` to return two controlled pages
 *     with a relation between them.
 *   - Insert matching local records with the same notionPageIds.
 *   - Pre-insert a "contradicts" edge between them.
 *   - Trigger the sync endpoint and verify the edge type is still "contradicts".
 *   - Also verifies stale edges (no longer in Notion) are removed.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  wsCanonRecordsTable,
  wsCanonRecordRelationsTable,
  worldsmithWorldsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import type { User } from "@workspace/db";

// ── Mock notion-client ────────────────────────────────────────────────────────
// Must be hoisted before any imports that transitively load notion-client.

const { mockQueryDatabase } = vi.hoisted(() => ({
  mockQueryDatabase: vi.fn(),
}));

vi.mock("../lib/notion-client.js", () => ({
  queryDatabase: mockQueryDatabase,
  getPage: vi.fn(),
  updatePage: vi.fn().mockResolvedValue(undefined),
  createPage: vi.fn().mockResolvedValue({ id: "new-page" }),
  richTextProp: (v: string) => ({ rich_text: [{ text: { content: v } }] }),
  selectProp: (v: string) => ({ select: { name: v } }),
  relationProp: (ids: string[]) => ({ relation: ids.map((id: string) => ({ id })) }),
  extractTitle(prop: Record<string, unknown>): string {
    if (!prop) return "";
    if (prop.type === "title") return ((prop.title ?? []) as Array<{ plain_text?: string }>).map(r => r.plain_text ?? "").join("");
    return "";
  },
  extractRichText(prop: Record<string, unknown>): string {
    if (!prop) return "";
    if (prop.type === "rich_text") return ((prop.rich_text ?? []) as Array<{ plain_text?: string }>).map(r => r.plain_text ?? "").join("");
    return "";
  },
  extractSelect(prop: Record<string, unknown>): string {
    if (!prop) return "";
    if (prop.type === "select") return (prop.select as { name?: string })?.name ?? "";
    return "";
  },
  extractRelation(prop: Record<string, unknown>): string[] {
    if (!prop) return [];
    if (prop.type === "relation") return ((prop.relation ?? []) as Array<{ id?: string }>).map(r => r.id ?? "");
    return [];
  },
  extractCheckbox(prop: Record<string, unknown>): boolean {
    if (!prop) return false;
    if (prop.type === "checkbox") return !!(prop.checkbox);
    return false;
  },
}));

// ── Import router after mock ───────────────────────────────────────────────────
import editorialRouter from "../routes/worldsmith-editorial.js";

// ── Test app ──────────────────────────────────────────────────────────────────

const SUPER_ADMIN: User = {
  id: "u-sync-rel-test",
  provider: "google",
  email: "sync-rel-test@daybook.app",
  name: "Sync Relations Test Admin",
  platformRole: "super_admin",
  avatarUrl: null,
  plan: null,
  owned: [],
  aiEnabled: false,
  aiProvider: "claude",
  connections: { googleDrive: false, googleCalendar: false, googleTasks: false, googleDocs: false, notion: false },
  googleId: null,
  googleAccessToken: null,
  googleRefreshToken: null,
  googleTokenExpiry: null,
  notionToken: null,
  passwordHash: null,
  stripeCustomerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as User;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_req as any).log = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    next();
  });
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = req as any;
    r.isAuthenticated = () => true;
    r.user = SUPER_ADMIN;
    next();
  });
  app.use("/", editorialRouter);
  return app;
}

const server = makeApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN = Math.random().toString(36).slice(2, 10);
const WORLD_ID  = `sync-rel-world-${RUN}`;
const NOTION_A  = `notion-sync-a-${RUN}`;   // Notion page IDs
const NOTION_B  = `notion-sync-b-${RUN}`;
const NOTION_C  = `notion-sync-stale-${RUN}`; // will be a stale edge target

let localA: string;
let localB: string;
let localC: string;

// ── Minimal Notion page builder ───────────────────────────────────────────────

function makeNotionPage(pageId: string, name: string, relatedNotionIds: string[] = []) {
  return {
    id: pageId,
    properties: {
      Name: {
        type: "title",
        title: [{ plain_text: name }],
      },
      ...(relatedNotionIds.length > 0
        ? {
            "Related Canon": {
              type: "relation",
              relation: relatedNotionIds.map(id => ({ id })),
            },
          }
        : {}),
    },
  };
}

beforeAll(async () => {
  // Ensure NOTION_TOKEN is set so the route doesn't bail out early
  process.env.NOTION_TOKEN = "test-notion-token-sync-rel";

  // Insert world with a notionCanonDbId so the route resolves the DB
  await db.insert(worldsmithWorldsTable).values({
    id: WORLD_ID,
    name: `Sync Relations Test World ${RUN}`,
    code: `SR${RUN.slice(0, 4).toUpperCase()}`,
    status: "active",
    notionCanonDbId: `fake-notion-db-${RUN}`,
  }).onConflictDoNothing();

  // Insert two records pre-linked to Notion pages
  const [rowA] = await db.insert(wsCanonRecordsTable).values({
    id: crypto.randomUUID(),
    worldId: WORLD_ID,
    name: "Sync Record A",
    status: "proposed",
    sensoryClauses: "",
    registerLocked: false,
    specRefCount: 0,
    notionPageId: NOTION_A,
    syncedAt: new Date(),
  }).returning({ id: wsCanonRecordsTable.id });

  const [rowB] = await db.insert(wsCanonRecordsTable).values({
    id: crypto.randomUUID(),
    worldId: WORLD_ID,
    name: "Sync Record B",
    status: "proposed",
    sensoryClauses: "",
    registerLocked: false,
    specRefCount: 0,
    notionPageId: NOTION_B,
    syncedAt: new Date(),
  }).returning({ id: wsCanonRecordsTable.id });

  // Third record for stale-edge test
  const [rowC] = await db.insert(wsCanonRecordsTable).values({
    id: crypto.randomUUID(),
    worldId: WORLD_ID,
    name: "Sync Record C (stale target)",
    status: "proposed",
    sensoryClauses: "",
    registerLocked: false,
    specRefCount: 0,
    notionPageId: NOTION_C,
    syncedAt: new Date(),
  }).returning({ id: wsCanonRecordsTable.id });

  localA = rowA!.id;
  localB = rowB!.id;
  localC = rowC!.id;

  // Pre-insert manually-authored edges. Notion sync must not delete manual edges.
  await db.insert(wsCanonRecordRelationsTable).values([
    { fromRecordId: localA, toRecordId: localB, relationType: "contradicts" },
    { fromRecordId: localA, toRecordId: localC, relationType: "precedes" },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  delete process.env.NOTION_TOKEN;

  const allIds = [localA, localB, localC].filter(Boolean);
  await db.delete(wsCanonRecordRelationsTable)
    .where(inArray(wsCanonRecordRelationsTable.fromRecordId, allIds))
    .catch(() => {});
  await db.delete(wsCanonRecordRelationsTable)
    .where(inArray(wsCanonRecordRelationsTable.toRecordId, allIds))
    .catch(() => {});
  await db.delete(wsCanonRecordsTable)
    .where(inArray(wsCanonRecordsTable.id, allIds))
    .catch(() => {});
  await db.delete(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, WORLD_ID))
    .catch(() => {});
  const { pool } = await import("@workspace/db");
  await pool.end().catch(() => {});
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Notion sync — relation type preservation", () => {
  it("preserves a manually-set 'contradicts' type on re-sync", async () => {
    // Notion now only lists A→B (not A→C). The A→C edge is manual, so it survives.
    mockQueryDatabase.mockResolvedValue([
      makeNotionPage(NOTION_A, "Sync Record A", [NOTION_B]),
      makeNotionPage(NOTION_B, "Sync Record B"),
      // NOTION_C is absent from this sync.
    ]);

    const res = await request(server)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);

    // Both manually-authored edges from A remain unchanged.
    const allEdgesFromA = await db
      .select()
      .from(wsCanonRecordRelationsTable)
      .where(eq(wsCanonRecordRelationsTable.fromRecordId, localA));

    expect(allEdgesFromA).toHaveLength(2);
    expect(allEdgesFromA.find(edge => edge.toRecordId === localB)?.relationType).toBe("contradicts");
    expect(allEdgesFromA.find(edge => edge.toRecordId === localC)?.relationType).toBe("precedes");
  });

  it("preserves a manually-set edge (A→C) that Notion no longer lists", async () => {
    // Manually-authored edges remain even when Notion no longer lists them.
    const edgesFromA = await db
      .select()
      .from(wsCanonRecordRelationsTable)
      .where(eq(wsCanonRecordRelationsTable.fromRecordId, localA));

    const stale = edgesFromA.find(e => e.toRecordId === localC);
    expect(stale?.relationType).toBe("precedes");
  });

  it("preserves an existing manual edge when Notion lists it again", async () => {
    // Notion lists A→C again; the existing manual edge retains its type.
    mockQueryDatabase.mockResolvedValue([
      makeNotionPage(NOTION_A, "Sync Record A", [NOTION_B, NOTION_C]),
      makeNotionPage(NOTION_B, "Sync Record B"),
      makeNotionPage(NOTION_C, "Sync Record C (stale target)"),
    ]);

    const res = await request(server)
      .post("/v1/editorial/canon-records/sync-notion")
      .send({ world_id: WORLD_ID });

    expect(res.status).toBe(200);

    const edgesFromA = await db
      .select()
      .from(wsCanonRecordRelationsTable)
      .where(eq(wsCanonRecordRelationsTable.fromRecordId, localA));

    // Two edges: A→B ("contradicts") and A→C ("precedes"), both preserved.
    expect(edgesFromA.length).toBe(2);

    const edgeToB = edgesFromA.find(e => e.toRecordId === localB);
    expect(edgeToB?.relationType).toBe("contradicts"); // preserved

    const edgeToC = edgesFromA.find(e => e.toRecordId === localC);
    expect(edgeToC?.relationType).toBe("precedes"); // existing manual type is preserved
  });
});
