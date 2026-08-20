/**
 * WorldSmith run recovery tests.
 *
 * Verifies that recoverStaleRuns() and failStaleRunsForSpec() correctly
 * transition in-progress ('compiling' / 'pending') runs to failed/INTERRUPTED,
 * including runs that started only seconds before the simulated restart.
 *
 * Strategy:
 *   - Mock @workspace/db so the select() chain returns controlled test rows.
 *   - Mock drizzle-orm helpers (and, inArray, lt, eq) as pass-through values so
 *     the query builder compiles without touching a real DB.
 *   - Assert that db.update().set().where() is called with the correct INTERRUPTED
 *     payload for every row returned by the select().
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mock state ─────────────────────────────────────────────────────────
// vi.mock factories are hoisted above variable declarations; use vi.hoisted()
// so these references are available inside the factory closures.
const {
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdateFn,
  mockSelectWhere,
  mockSelectFrom,
  mockSelectFn,
  selectRowsRef,
} = vi.hoisted(() => {
  const selectRowsRef = { rows: [] as Array<{ id: string }> };
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  // Typed params so mock.calls[0][0] is not an empty-tuple access
  const mockUpdateSet = vi.fn((_patch: Record<string, unknown>) => ({ where: mockUpdateWhere }));
  const mockUpdateFn = vi.fn(() => ({ set: mockUpdateSet }));
  const mockSelectWhere = vi.fn(async (_where: unknown) => selectRowsRef.rows);
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelectFn = vi.fn(() => ({ from: mockSelectFrom }));
  return { mockUpdateWhere, mockUpdateSet, mockUpdateFn, mockSelectWhere, mockSelectFrom, mockSelectFn, selectRowsRef };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: mockSelectFn,
    update: mockUpdateFn,
  },
  worldsmithRunsTable: {
    id: "id",
    status: "status",
    startedAt: "started_at",
    productionSpecId: "production_spec_id",
  },
}));

// drizzle-orm operators are used only to build the WHERE clause handed to drizzle;
// with the DB mocked they never execute against a real database, so we just
// pass through their arguments so the WHERE value is inspectable in tests.
vi.mock("drizzle-orm", () => ({
  eq: (_col: unknown, val: unknown) => ({ op: "eq", val }),
  and: (...args: unknown[]) => ({ op: "and", args }),
  inArray: (_col: unknown, vals: unknown) => ({ op: "inArray", vals }),
  lt: (_col: unknown, val: unknown) => ({ op: "lt", val }),
  sql: vi.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────────────
import { recoverStaleRuns, failStaleRunsForSpec } from "../lib/worldsmith/run-repository.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function setSelectRows(rows: Array<{ id: string }>) {
  selectRowsRef.rows = rows;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  selectRowsRef.rows = [];
  mockUpdateWhere.mockResolvedValue(undefined);
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  mockUpdateFn.mockReturnValue({ set: mockUpdateSet });
  mockSelectWhere.mockImplementation(async () => selectRowsRef.rows);
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockSelectFn.mockReturnValue({ from: mockSelectFrom });
});

// ── recoverStaleRuns ───────────────────────────────────────────────────────────

describe("recoverStaleRuns(0) — startup sweep with no age filter", () => {
  it("marks a run that started seconds ago as failed/INTERRUPTED", async () => {
    // Simulate a run that started just 3 seconds before the server restarted.
    setSelectRows([{ id: "run-recent-001" }]);

    const count = await recoverStaleRuns(0);

    expect(count).toBe(1);
    expect(mockUpdateFn).toHaveBeenCalledTimes(1);

    const patch = mockUpdateSet.mock.calls[0][0];
    expect(patch.status).toBe("failed");
    expect(patch.errorCode).toBe("INTERRUPTED");
    expect(patch.failedStage).toBe("server_restart");
    expect(patch.completedAt).toBeInstanceOf(Date);
    expect(Array.isArray(patch.errors)).toBe(true);
    const errors = patch.errors as Array<Record<string, string>>;
    expect(errors[0].code).toBe("INTERRUPTED");
  });

  it("marks multiple stuck runs as failed/INTERRUPTED in a single sweep", async () => {
    setSelectRows([
      { id: "run-stuck-001" },
      { id: "run-stuck-002" },
      { id: "run-stuck-003" },
    ]);

    const count = await recoverStaleRuns(0);

    expect(count).toBe(3);
    expect(mockUpdateFn).toHaveBeenCalledTimes(3);
  });

  it("returns 0 and does not touch the DB when there are no stuck runs", async () => {
    setSelectRows([]);

    const count = await recoverStaleRuns(0);

    expect(count).toBe(0);
    expect(mockUpdateFn).not.toHaveBeenCalled();
  });

  it("passes a cutoff of ~now (age=0) to the WHERE clause", async () => {
    setSelectRows([]);
    const before = Date.now();
    await recoverStaleRuns(0);
    const after = Date.now();

    const whereArg = mockSelectWhere.mock.calls[0][0] as {
      op: string;
      args: Array<{ op: string; val: unknown }>;
    };
    expect(whereArg.op).toBe("and");
    const ltClause = whereArg.args.find((a) => a.op === "lt") as { op: string; val: Date };
    expect(ltClause).toBeDefined();
    const cutoff = ltClause.val as Date;
    // With staleAfterMinutes=0 the cutoff is Date.now() − 0 ≈ now
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 10);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after + 10);
  });
});

describe("recoverStaleRuns(30) — periodic sweeper with 30-minute age filter", () => {
  it("marks old stuck runs as failed/INTERRUPTED", async () => {
    setSelectRows([{ id: "run-old-stale-001" }]);

    const count = await recoverStaleRuns(30);

    expect(count).toBe(1);
    const patch = mockUpdateSet.mock.calls[0][0];
    expect(patch.status).toBe("failed");
    expect(patch.errorCode).toBe("INTERRUPTED");
  });

  it("passes a cutoff ~30 minutes in the past to the WHERE clause", async () => {
    setSelectRows([]);
    const before = Date.now();
    await recoverStaleRuns(30);
    const after = Date.now();

    const whereArg = mockSelectWhere.mock.calls[0][0] as {
      op: string;
      args: Array<{ op: string; val: unknown }>;
    };
    const ltClause = whereArg.args.find((a: { op: string }) => a.op === "lt") as { op: string; val: Date };
    const cutoff = ltClause.val as Date;
    const expectedCutoff = Date.now() - 30 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 30 * 60 * 1000 - 50);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - 30 * 60 * 1000 + 50);
    // Sanity: cutoff is meaningfully in the past
    expect(expectedCutoff - cutoff.getTime()).toBeLessThan(100);
  });
});

// ── failStaleRunsForSpec ───────────────────────────────────────────────────────

describe("failStaleRunsForSpec — pre-compile stale check", () => {
  it("marks an in-progress run for the spec as failed/INTERRUPTED before a new compile starts", async () => {
    setSelectRows([{ id: "run-spec-stuck-001" }]);

    const count = await failStaleRunsForSpec("spec-abc123");

    expect(count).toBe(1);
    const patch = mockUpdateSet.mock.calls[0][0];
    expect(patch.status).toBe("failed");
    expect(patch.errorCode).toBe("INTERRUPTED");
    expect(patch.failedStage).toBe("superseded");
    expect(patch.completedAt).toBeInstanceOf(Date);
    const errors = patch.errors as Array<Record<string, string>>;
    expect(errors[0].code).toBe("INTERRUPTED");
    expect(errors[0].recommended_action).toContain("previous run");
  });

  it("returns 0 when the spec has no in-progress runs", async () => {
    setSelectRows([]);

    const count = await failStaleRunsForSpec("spec-no-active");

    expect(count).toBe(0);
    expect(mockUpdateFn).not.toHaveBeenCalled();
  });

  it("marks all in-progress runs for the spec when there are multiple (defensive)", async () => {
    setSelectRows([{ id: "run-dup-a" }, { id: "run-dup-b" }]);

    const count = await failStaleRunsForSpec("spec-multi");

    expect(count).toBe(2);
    expect(mockUpdateFn).toHaveBeenCalledTimes(2);
  });
});
