/**
 * canon-relations.test.ts
 *
 * Integration tests for the semantic relation edge CRUD routes:
 *   GET  /v1/editorial/canon-records/:id/relations
 *   POST /v1/editorial/canon-records/:id/relations
 *   PATCH /v1/editorial/canon-records/:id/relations/:toId
 *   DELETE /v1/editorial/canon-records/:id/relations/:toId
 *   GET  /v1/editorial/canon-records/:id/inbound-relations
 *
 * Also covers input validation:
 *   • self-link → 400
 *   • unknown relation_type → 400
 *   • non-existent source → 404
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
  id: "u-rel-test",
  provider: "google",
  email: "rel-test@daybook.app",
  name: "Relations Test Admin",
  role: "owner",
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
const WORLD_ID = `rel-world-${RUN}`;
const RA = `rel-record-a-${RUN}`;  // source for most tests
const RB = `rel-record-b-${RUN}`;  // target
const RC = `rel-record-c-${RUN}`;  // second target / inbound source

const allRecordIds = [RA, RB, RC];

beforeAll(async () => {
  await db.insert(worldsmithWorldsTable).values({
    id: WORLD_ID,
    name: `Relations Test World ${RUN}`,
    code: `RT${RUN.slice(0, 4).toUpperCase()}`,
    status: "active",
  }).onConflictDoNothing();

  await db.insert(wsCanonRecordsTable).values([
    { id: RA, worldId: WORLD_ID, name: "Record A", status: "proposed", sensoryClauses: "", registerLocked: false, specRefCount: 0 },
    { id: RB, worldId: WORLD_ID, name: "Record B", status: "proposed", sensoryClauses: "", registerLocked: false, specRefCount: 0 },
    { id: RC, worldId: WORLD_ID, name: "Record C", status: "accepted", sensoryClauses: "", registerLocked: false, specRefCount: 0 },
  ]).onConflictDoNothing();
});

afterAll(async () => {
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

// ── GET /relations — initially empty ─────────────────────────────────────────

describe("GET /relations — empty", () => {
  it("returns an empty relations array for a record with no edges", async () => {
    const res = await request(server)
      .get(`/v1/editorial/canon-records/${RA}/relations`);
    expect(res.status).toBe(200);
    expect(res.body.relations).toEqual([]);
  });
});

// ── POST /relations — add ─────────────────────────────────────────────────────

describe("POST /relations — add edge", () => {
  it("adds a relation with default type 'related'", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${RA}/relations`)
      .send({ to_record_id: RB });

    expect(res.status).toBe(201);
    expect(res.body.relation.fromRecordId).toBe(RA);
    expect(res.body.relation.toRecordId).toBe(RB);
    expect(res.body.relation.relationType).toBe("related");
    expect(res.body.relation.targetName).toBe("Record B");
  });

  it("adds a 'contradicts' edge between A and C", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${RA}/relations`)
      .send({ to_record_id: RC, relation_type: "contradicts" });

    expect(res.status).toBe(201);
    expect(res.body.relation.relationType).toBe("contradicts");
    expect(res.body.relation.targetCanonType).toBeNull(); // C has no canon_type set
  });

  it("upserts (updates type) when the edge already exists", async () => {
    // Edge A→B was added as "related" above; re-POST with "supports" should update it
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${RA}/relations`)
      .send({ to_record_id: RB, relation_type: "supports" });

    expect(res.status).toBe(201);
    expect(res.body.relation.relationType).toBe("supports");
  });

  it("returns 400 when to_record_id is missing", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${RA}/relations`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/to_record_id/i);
  });

  it("returns 400 when linking a record to itself", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${RA}/relations`)
      .send({ to_record_id: RA });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/itself/i);
  });

  it("returns 400 for an unknown relation_type", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${RA}/relations`)
      .send({ to_record_id: RB, relation_type: "enemies" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/relation_type/i);
  });

  it("returns 404 when the source record does not exist", async () => {
    const res = await request(server)
      .post("/v1/editorial/canon-records/does-not-exist/relations")
      .send({ to_record_id: RB });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the target record does not exist", async () => {
    const res = await request(server)
      .post(`/v1/editorial/canon-records/${RA}/relations`)
      .send({ to_record_id: "ghost-record-xyz" });
    expect(res.status).toBe(404);
  });
});

// ── GET /relations — after inserts ────────────────────────────────────────────

describe("GET /relations — enriched response", () => {
  it("returns outgoing edges with targetName and targetCanonType", async () => {
    const res = await request(server)
      .get(`/v1/editorial/canon-records/${RA}/relations`);

    expect(res.status).toBe(200);
    const rels: Array<{ toRecordId: string; relationType: string; targetName: string }> = res.body.relations;
    expect(rels.length).toBe(2); // B (supports) + C (contradicts)

    const relToB = rels.find(r => r.toRecordId === RB);
    expect(relToB?.relationType).toBe("supports");
    expect(relToB?.targetName).toBe("Record B");

    const relToC = rels.find(r => r.toRecordId === RC);
    expect(relToC?.relationType).toBe("contradicts");
    expect(relToC?.targetName).toBe("Record C");
  });
});

// ── PATCH /relations/:toId ────────────────────────────────────────────────────

describe("PATCH /relations/:toId — update type", () => {
  it("changes relation type from 'supports' to 'precedes'", async () => {
    const res = await request(server)
      .patch(`/v1/editorial/canon-records/${RA}/relations/${RB}`)
      .send({ relation_type: "precedes" });

    expect(res.status).toBe(200);
    expect(res.body.relation.relationType).toBe("precedes");
  });

  it("returns 400 for an invalid relation_type", async () => {
    const res = await request(server)
      .patch(`/v1/editorial/canon-records/${RA}/relations/${RB}`)
      .send({ relation_type: "friends" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when relation_type is omitted", async () => {
    const res = await request(server)
      .patch(`/v1/editorial/canon-records/${RA}/relations/${RB}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 for a relation that does not exist", async () => {
    const res = await request(server)
      .patch(`/v1/editorial/canon-records/${RA}/relations/ghost-xyz`)
      .send({ relation_type: "follows" });
    expect(res.status).toBe(404);
  });
});

// ── GET /inbound-relations ────────────────────────────────────────────────────

describe("GET /inbound-relations — contradiction detection", () => {
  it("shows RA's 'contradicts' edge pointing at C", async () => {
    const res = await request(server)
      .get(`/v1/editorial/canon-records/${RC}/inbound-relations`);

    expect(res.status).toBe(200);
    const inbound: Array<{ fromRecordId: string; relationType: string; sourceName: string }> =
      res.body.inbound_relations;

    expect(inbound.length).toBeGreaterThanOrEqual(1);
    const contradiction = inbound.find(r => r.fromRecordId === RA && r.relationType === "contradicts");
    expect(contradiction).toBeDefined();
    expect(contradiction?.sourceName).toBe("Record A");
  });

  it("returns empty array for a record with no inbound edges", async () => {
    const res = await request(server)
      .get(`/v1/editorial/canon-records/${RA}/inbound-relations`);
    expect(res.status).toBe(200);
    expect(res.body.inbound_relations).toEqual([]);
  });
});

// ── DELETE /relations/:toId ───────────────────────────────────────────────────

describe("DELETE /relations/:toId", () => {
  it("removes the A→B edge and GET confirms it is gone", async () => {
    const del = await request(server)
      .delete(`/v1/editorial/canon-records/${RA}/relations/${RB}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);

    const list = await request(server)
      .get(`/v1/editorial/canon-records/${RA}/relations`);
    const remaining = list.body.relations as Array<{ toRecordId: string }>;
    expect(remaining.find(r => r.toRecordId === RB)).toBeUndefined();
  });

  it("returns 404 when the edge does not exist", async () => {
    const res = await request(server)
      .delete(`/v1/editorial/canon-records/${RA}/relations/ghost-xyz`);
    expect(res.status).toBe(404);
  });
});

// ── All valid relation types are accepted ─────────────────────────────────────

describe("POST /relations — all valid types accepted", () => {
  const VALID_TYPES = ["related", "supports", "contradicts", "precedes", "follows"] as const;

  // Re-use A→B for each type check (upsert semantics)
  for (const type of VALID_TYPES) {
    it(`accepts relation_type="${type}"`, async () => {
      const res = await request(server)
        .post(`/v1/editorial/canon-records/${RA}/relations`)
        .send({ to_record_id: RB, relation_type: type });
      expect(res.status).toBe(201);
      expect(res.body.relation.relationType).toBe(type);
    });
  }
});
