/**
 * WorldSmith — Run history Notion link persistence tests.
 *
 * Confirms that world_notion_id and volume_notion_id written into
 * resolved_source_ids by orchestrator.ts survive a full
 * createRun → updateRun → getRun round-trip so the run history table
 * can deep-link back to the correct Notion record even after the World
 * or Volume has been renamed in Notion.
 *
 * Strategy:
 *   - Mock @workspace/db with an in-memory store that tracks what
 *     updateRun writes and returns it from getRun.
 *   - No real database is touched.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ─────────────────────────────────────────────────────────

const { insertedRows, patchedRows } = vi.hoisted(() => ({
  insertedRows: new Map<string, Record<string, unknown>>(),
  patchedRows: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@workspace/db", () => {
  const mockLimit   = vi.fn();
  const mockWhere   = vi.fn(() => ({ limit: mockLimit }));
  const mockFrom    = vi.fn(() => ({ where: mockWhere }));
  const mockSelect  = vi.fn(() => ({ from: mockFrom }));

  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet   = vi.fn((patch: Record<string, unknown>) => ({
    where: (clause: { val: string }) => {
      const id = clause.val;
      const existing = patchedRows.get(id) ?? {};
      patchedRows.set(id, { ...existing, ...patch });
      return mockUpdateWhere();
    },
  }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  const mockValues = vi.fn((row: Record<string, unknown>) => {
    insertedRows.set(row.id as string, { ...row });
    return Promise.resolve();
  });
  const mockInsert = vi.fn(() => ({ values: mockValues }));

  // getRun uses select().from().where().limit(1)
  // Wire limit() to read from the combined insert + patch store.
  mockLimit.mockImplementation(async (_n: number) => {
    // The where clause holds { val: runId } from the eq() mock below.
    const whereArg = (mockWhere.mock.calls.at(-1) as unknown[] | undefined)?.[0] as { val: string } | undefined;
    const id = whereArg?.val;
    if (!id) return [];
    const base = insertedRows.get(id) ?? {};
    const patch = patchedRows.get(id) ?? {};
    const row = { ...base, ...patch };
    return Object.keys(row).length ? [row] : [];
  });

  return {
    db: {
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
    },
    worldsmithRunsTable: {
      id: "id",
      status: "status",
      startedAt: "started_at",
      productionSpecId: "production_spec_id",
    },
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ op: "eq", val }),
  and: (...args: unknown[]) => ({ op: "and", args }),
  inArray: (_col: unknown, vals: unknown) => ({ op: "inArray", vals }),
  lt: (_col: unknown, val: unknown) => ({ op: "lt", val }),
  sql: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { createRun, updateRun, getRun } from "../lib/worldsmith/run-repository.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const WORLD_NOTION_ID      = "world-notion-abc123";
const VOLUME_NOTION_ID     = "volume-notion-xyz789";
const COLLECTION_NOTION_ID = "collection-notion-def456";

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  insertedRows.clear();
  patchedRows.clear();
});

// ── Round-trip tests ───────────────────────────────────────────────────────────

describe("run history — world_notion_id persists through createRun → updateRun → getRun", () => {
  it("stores world_notion_id in resolved_source_ids and returns it from getRun", async () => {
    const runId = await createRun({
      productionSpecId: "spec-001",
      operation: "validate_and_compile",
      dryRun: false,
    });

    // Simulate what orchestrator.ts does after resolveInheritanceChain succeeds.
    await updateRun(runId, {
      resolvedSourceIds: {
        world_name:      "Thornvale",
        world_notion_id: WORLD_NOTION_ID,
      },
    });

    const run = await getRun(runId);

    expect(run).not.toBeNull();
    const src = run!.resolvedSourceIds as Record<string, string>;
    expect(src.world_notion_id).toBe(WORLD_NOTION_ID);
    expect(src.world_name).toBe("Thornvale");
  });

  it("stores volume_notion_id in resolved_source_ids and returns it from getRun", async () => {
    const runId = await createRun({
      productionSpecId: "spec-002",
      operation: "validate_and_compile",
      dryRun: false,
    });

    await updateRun(runId, {
      resolvedSourceIds: {
        world_name:       "Thornvale",
        volume_name:      "Volume I: The First Age",
        volume_notion_id: VOLUME_NOTION_ID,
      },
    });

    const run = await getRun(runId);

    expect(run).not.toBeNull();
    const src = run!.resolvedSourceIds as Record<string, string>;
    expect(src.volume_notion_id).toBe(VOLUME_NOTION_ID);
    expect(src.volume_name).toBe("Volume I: The First Age");
  });

  it("persists the full extendedSourceIds shape orchestrator.ts writes — world + collection + volume", async () => {
    const runId = await createRun({
      productionSpecId: "spec-003",
      operation: "validate_and_compile",
      dryRun: false,
    });

    // This is the exact shape the extendedSourceIds block in orchestrator.ts
    // produces after a successful resolveInheritanceChain call.
    const extendedSourceIds = {
      world_name:           "The Iron Sanctum",
      world_notion_id:      WORLD_NOTION_ID,
      collection_name:      "Autumn Folio",
      collection_notion_id: COLLECTION_NOTION_ID,
      volume_name:          "Volume II: The Long Winter",
      volume_notion_id:     VOLUME_NOTION_ID,
    };

    await updateRun(runId, { resolvedSourceIds: extendedSourceIds });

    const run = await getRun(runId);

    expect(run).not.toBeNull();
    const src = run!.resolvedSourceIds as Record<string, string>;

    expect(src.world_name).toBe("The Iron Sanctum");
    expect(src.world_notion_id).toBe(WORLD_NOTION_ID);
    expect(src.collection_name).toBe("Autumn Folio");
    expect(src.collection_notion_id).toBe(COLLECTION_NOTION_ID);
    expect(src.volume_name).toBe("Volume II: The Long Winter");
    expect(src.volume_notion_id).toBe(VOLUME_NOTION_ID);
  });

  it("returns null world_notion_id / volume_notion_id when the spec had only inline text (no Notion relation)", async () => {
    // When World / Volume are stored as inline rich_text in Notion, the
    // resolver never fetches a linked page, so worldId / volumeId are
    // undefined — and orchestrator.ts omits them from extendedSourceIds.
    const runId = await createRun({
      productionSpecId: "spec-004",
      operation: "validate_and_compile",
      dryRun: false,
    });

    // No *_notion_id keys — only the human-readable names are present.
    await updateRun(runId, {
      resolvedSourceIds: {
        world_name:  "Silverveil",
        volume_name: "Chapter One",
      },
    });

    const run = await getRun(runId);

    expect(run).not.toBeNull();
    const src = run!.resolvedSourceIds as Record<string, string | undefined>;

    expect(src.world_name).toBe("Silverveil");
    expect(src.volume_name).toBe("Chapter One");
    // No Notion ID → no deep-link, but the name is still preserved.
    expect(src.world_notion_id).toBeUndefined();
    expect(src.volume_notion_id).toBeUndefined();
  });

  it("preserves existing resolved_source_ids keys when a second updateRun merges new keys", async () => {
    // Covers the race-safe merge that worldsmith.ts uses when patching
    // collection_name after a rename event.
    const runId = await createRun({
      productionSpecId: "spec-005",
      operation: "validate_and_compile",
      dryRun: false,
    });

    // First update: core source IDs written by orchestrator after compilation.
    await updateRun(runId, {
      resolvedSourceIds: {
        world_name:      "Thornvale",
        world_notion_id: WORLD_NOTION_ID,
      },
    });

    // Second update: collection name patched in later (e.g. via PATCH endpoint).
    const run1 = await getRun(runId);
    const merged = {
      ...(run1?.resolvedSourceIds as Record<string, string>),
      collection_name:      "Winter Folio",
      collection_notion_id: COLLECTION_NOTION_ID,
    };
    await updateRun(runId, { resolvedSourceIds: merged });

    const run2 = await getRun(runId);
    const src = run2!.resolvedSourceIds as Record<string, string>;

    // Original world IDs must still be present.
    expect(src.world_notion_id).toBe(WORLD_NOTION_ID);
    expect(src.world_name).toBe("Thornvale");
    // New collection keys must also be present.
    expect(src.collection_notion_id).toBe(COLLECTION_NOTION_ID);
    expect(src.collection_name).toBe("Winter Folio");
  });
});
