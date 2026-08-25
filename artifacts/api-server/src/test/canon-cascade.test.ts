/**
 * canon-cascade.test.ts
 *
 * Tests for POST /v1/editorial/canon-records/:id/cascade-register
 *
 * Graph shapes exercised:
 *   1. Linear unlocked chain (root → child → grandchild): all 2 descendants updated
 *   2. Locked intermediate (root → locked-middle → leaf): 0 updated, 1 skipped
 *   3. Mixed branches (root → [unlocked-A → leaf-A], [locked-B → leaf-B]):
 *      2 updated (root, unlocked-A, leaf-A) except locked-B and leaf-B
 *   4. No register set on source → 422
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
import editorialRouter from "../routes/worldsmith-editorial.js";

// ── Test app ──────────────────────────────────────────────────────────────────

const SUPER_ADMIN: User = {
  id: "u-sa-cascade-test",
  provider: "google",
  email: "cascade-test@daybook.app",
  name: "Cascade Test Admin",
  platformRole: "super_admin",
  avatarUrl: null,
  plan: null,
  owned: [],
  aiEnabled: true,
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

function makeEditorialApp() {
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

const server = makeEditorialApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const RUN = Math.random().toString(36).slice(2, 10);

const WORLD_ID  = `cascade-world-${RUN}`;
// Records for all test cases share one world to keep fixture setup compact.
const R = {
  // Linear chain test
  linearRoot:       `cascade-lr-${RUN}`,
  linearChild:      `cascade-lc-${RUN}`,
  linearGrandchild: `cascade-lg-${RUN}`,
  // Locked middle test
  lockRoot:         `cascade-lock-root-${RUN}`,
  lockMiddle:       `cascade-lock-mid-${RUN}`,
  lockLeaf:         `cascade-lock-leaf-${RUN}`,
  // Mixed branches test
  mixRoot:          `cascade-mix-root-${RUN}`,
  mixUnlockedA:     `cascade-mix-ua-${RUN}`,
  mixLeafA:         `cascade-mix-la-${RUN}`,
  mixLockedB:       `cascade-mix-lb-${RUN}`,
  mixLeafB:         `cascade-mix-leafb-${RUN}`,
  // No-register test
  noRegRoot:        `cascade-noreg-${RUN}`,
};

const allRecordIds = Object.values(R);

beforeAll(async () => {
  // World
  await db.insert(worldsmithWorldsTable).values({
    id: WORLD_ID,
    name: `Cascade Test World ${RUN}`,
    code: `CT${RUN.slice(0, 4).toUpperCase()}`,
    status: "active",
  }).onConflictDoNothing();

  // Records
  const baseRecord = (id: string, locked = false, register?: string) => ({
    id,
    worldId: WORLD_ID,
    name: `Record ${id}`,
    status: "proposed" as const,
    sensoryClauses: "",
    registerLocked: locked,
    specRefCount: 0,
    ...(register ? { emotionalRegister: register } : {}),
  });

  await db.insert(wsCanonRecordsTable).values([
    baseRecord(R.linearRoot,       false, "Intimate"),
    baseRecord(R.linearChild,      false),
    baseRecord(R.linearGrandchild, false),

    baseRecord(R.lockRoot,         false, "Withholding"),
    baseRecord(R.lockMiddle,       true),  // locked — stops cascade
    baseRecord(R.lockLeaf,         false),

    baseRecord(R.mixRoot,          false, "Confidence"),
    baseRecord(R.mixUnlockedA,     false),
    baseRecord(R.mixLeafA,         false),
    baseRecord(R.mixLockedB,       true),  // locked branch
    baseRecord(R.mixLeafB,         false),

    baseRecord(R.noRegRoot,        false), // no emotionalRegister
  ]).onConflictDoNothing();

  // Relations
  await db.insert(wsCanonRecordRelationsTable).values([
    // Linear chain
    { fromRecordId: R.linearRoot,   toRecordId: R.linearChild      },
    { fromRecordId: R.linearChild,  toRecordId: R.linearGrandchild },
    // Locked middle chain
    { fromRecordId: R.lockRoot,     toRecordId: R.lockMiddle       },
    { fromRecordId: R.lockMiddle,   toRecordId: R.lockLeaf         },
    // Mixed: two branches off root
    { fromRecordId: R.mixRoot,      toRecordId: R.mixUnlockedA     },
    { fromRecordId: R.mixUnlockedA, toRecordId: R.mixLeafA         },
    { fromRecordId: R.mixRoot,      toRecordId: R.mixLockedB       },
    { fromRecordId: R.mixLockedB,   toRecordId: R.mixLeafB         },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  // Clean up relations first (FK dependency)
  await db.delete(wsCanonRecordRelationsTable)
    .where(inArray(wsCanonRecordRelationsTable.fromRecordId, allRecordIds))
    .catch(() => {});
  await db.delete(wsCanonRecordRelationsTable)
    .where(inArray(wsCanonRecordRelationsTable.toRecordId, allRecordIds))
    .catch(() => {});
  await db.delete(wsCanonRecordsTable)
    .where(inArray(wsCanonRecordsTable.id, allRecordIds))
    .catch(() => {});
  await db.delete(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, WORLD_ID))
    .catch(() => {});
  const { pool } = await import("@workspace/db");
  await pool.end().catch(() => {});
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("cascade-register — linear unlocked chain", () => {
  it("propagates to child and grandchild, returns updated=2", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${R.linearRoot}/cascade-register`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(res.body.skipped_locked).toBe(0);
    expect(res.body.register).toBe("Intimate");

    // Verify DB state
    const rows = await db
      .select({ id: wsCanonRecordsTable.id, emotionalRegister: wsCanonRecordsTable.emotionalRegister })
      .from(wsCanonRecordsTable)
      .where(inArray(wsCanonRecordsTable.id, [R.linearChild, R.linearGrandchild]));

    for (const row of rows) {
      expect(row.emotionalRegister).toBe("Intimate");
    }
  });
});

describe("cascade-register — locked intermediate node", () => {
  it("stops at locked-middle, updates nothing, skipped_locked=1", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${R.lockRoot}/cascade-register`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);
    expect(res.body.skipped_locked).toBe(1);
    expect(res.body.register).toBe("Withholding");

    // Locked middle must keep its own register (null/unchanged)
    const [middle] = await db
      .select({ emotionalRegister: wsCanonRecordsTable.emotionalRegister })
      .from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, R.lockMiddle));
    // registerLocked=true means it was not overwritten
    expect(middle?.emotionalRegister ?? null).toBeNull();

    // Leaf behind locked node must also be unchanged
    const [leaf] = await db
      .select({ emotionalRegister: wsCanonRecordsTable.emotionalRegister })
      .from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, R.lockLeaf));
    expect(leaf?.emotionalRegister ?? null).toBeNull();
  });
});

describe("cascade-register — mixed branches (one locked, one open)", () => {
  it("updates unlocked branch, stops at locked branch, skipped_locked=1", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${R.mixRoot}/cascade-register`)
      .send({});

    expect(res.status).toBe(200);
    // mixUnlockedA + mixLeafA updated; mixLockedB skipped; mixLeafB not reached
    expect(res.body.updated).toBe(2);
    expect(res.body.skipped_locked).toBe(1);

    const rows = await db
      .select({ id: wsCanonRecordsTable.id, emotionalRegister: wsCanonRecordsTable.emotionalRegister })
      .from(wsCanonRecordsTable)
      .where(inArray(wsCanonRecordsTable.id, [R.mixUnlockedA, R.mixLeafA, R.mixLockedB, R.mixLeafB]));

    const byId = Object.fromEntries(rows.map(r => [r.id, r.emotionalRegister]));
    expect(byId[R.mixUnlockedA]).toBe("Confidence");
    expect(byId[R.mixLeafA]).toBe("Confidence");
    expect(byId[R.mixLockedB] ?? null).toBeNull();
    expect(byId[R.mixLeafB] ?? null).toBeNull();
  });
});

describe("cascade-register — source has no register", () => {
  it("returns 422 with helpful error", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${R.noRegRoot}/cascade-register`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/emotional_register/i);
  });
});

describe("cascade-register — non-existent record", () => {
  it("returns 404", async () => {
    const res = await request(server)
      .post("/v1/editorial/canon-records/does-not-exist-xyz/cascade-register")
      .send({});

    expect(res.status).toBe(404);
  });
});
