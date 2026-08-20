/**
 * canon-relation-fk.test.ts
 *
 * Integration test: confirms that the FK constraints on
 * ws_canon_record_relations.from_record_id and to_record_id are enforced by
 * the live database.
 *
 * Two behaviours are verified:
 *   1. Orphan insert is rejected — inserting a relation that references a
 *      non-existent canon record raises a FK-violation error.
 *   2. Cascade delete — deleting a parent ws_canon_records row removes all
 *      relation rows that reference it (ON DELETE CASCADE).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "@workspace/db";
import {
  wsCanonRecordsTable,
  wsCanonRecordRelationsTable,
  worldsmithWorldsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN = Math.random().toString(36).slice(2, 10);
const WORLD_ID    = `fk-test-world-${RUN}`;
const RECORD_A_ID = `fk-test-rec-a-${RUN}`;
const RECORD_B_ID = `fk-test-rec-b-${RUN}`;
const GHOST_ID    = `fk-test-ghost-${RUN}`; // never inserted

const baseRecord = (id: string) => ({
  id,
  worldId: WORLD_ID,
  name: `FK Test Record ${id}`,
  status: "proposed" as const,
  sensoryClauses: "",
  registerLocked: false,
  specRefCount: 0,
});

beforeAll(async () => {
  await db.insert(worldsmithWorldsTable).values({
    id: WORLD_ID,
    name: `FK Test World ${RUN}`,
    code: `FK${RUN.slice(0, 4).toUpperCase()}`,
    status: "active",
  }).onConflictDoNothing();

  await db.insert(wsCanonRecordsTable).values([
    baseRecord(RECORD_A_ID),
    baseRecord(RECORD_B_ID),
  ]).onConflictDoNothing();
});

afterAll(async () => {
  // Relations are cascade-deleted with the records, but clean up defensively.
  await db.delete(wsCanonRecordRelationsTable)
    .where(inArray(wsCanonRecordRelationsTable.fromRecordId, [RECORD_A_ID, RECORD_B_ID, GHOST_ID]))
    .catch(() => {});
  await db.delete(wsCanonRecordRelationsTable)
    .where(inArray(wsCanonRecordRelationsTable.toRecordId, [RECORD_A_ID, RECORD_B_ID, GHOST_ID]))
    .catch(() => {});
  await db.delete(wsCanonRecordsTable)
    .where(inArray(wsCanonRecordsTable.id, [RECORD_A_ID, RECORD_B_ID]))
    .catch(() => {});
  await db.delete(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, WORLD_ID))
    .catch(() => {});
  await pool.end().catch(() => {});
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ws_canon_record_relations — FK enforcement", () => {
  it("rejects an insert whose from_record_id does not exist in ws_canon_records", async () => {
    await expect(
      db.insert(wsCanonRecordRelationsTable).values({
        fromRecordId: GHOST_ID,   // non-existent
        toRecordId:   RECORD_A_ID,
      })
    ).rejects.toThrow();
  });

  it("rejects an insert whose to_record_id does not exist in ws_canon_records", async () => {
    await expect(
      db.insert(wsCanonRecordRelationsTable).values({
        fromRecordId: RECORD_A_ID,
        toRecordId:   GHOST_ID,   // non-existent
      })
    ).rejects.toThrow();
  });

  it("accepts an insert where both IDs reference real records", async () => {
    await expect(
      db.insert(wsCanonRecordRelationsTable).values({
        fromRecordId: RECORD_A_ID,
        toRecordId:   RECORD_B_ID,
      }).onConflictDoNothing()
    ).resolves.not.toThrow();
  });

  it("cascades deletion of relation rows when the parent record is deleted", async () => {
    // Confirm the valid relation from the previous test is present.
    const before = await db
      .select()
      .from(wsCanonRecordRelationsTable)
      .where(eq(wsCanonRecordRelationsTable.fromRecordId, RECORD_A_ID));
    expect(before.length).toBeGreaterThan(0);

    // Delete the parent record — ON DELETE CASCADE should remove the relation.
    await db.delete(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, RECORD_A_ID));

    const after = await db
      .select()
      .from(wsCanonRecordRelationsTable)
      .where(eq(wsCanonRecordRelationsTable.fromRecordId, RECORD_A_ID));
    expect(after.length).toBe(0);
  });
});
