import { randomUUID } from "node:crypto";
import express from "express";
import { and, eq, sql } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  db, usersTable, worldsmithWorldsTable, wsCanonRecordsTable,
  wsCharacterVariantsTable, wsKnowledgeEntriesTable, wsIdentityLocksTable,
} from "@workspace/db";
import foundationRouter from "../routes/worldsmith-foundation";

const collections = [
  { path: "variants", directPath: "character-variants", key: "variants", row: { variant_name: "Original", life_stage: "adult" }, change: { variant_name: "Edited" }, replacement: { variant_name: "Stale", life_stage: "adult" }, table: wsCharacterVariantsTable },
  { path: "knowledge", directPath: "knowledge", key: "knowledge", row: { knowledge_state: "knows", belief: "Original" }, change: { belief: "Edited" }, replacement: { knowledge_state: "knows", belief: "Stale" }, table: wsKnowledgeEntriesTable },
  { path: "identity-locks", directPath: "identity-locks", key: "locks", row: { category: "appearance", value: "Original" }, change: { value: "Edited" }, replacement: { category: "appearance", value: "Stale" }, table: wsIdentityLocksTable },
] as const;

describe("Character collection replacement version checks", () => {
  it.each(collections)("does not replace $path when another editor saves after the version read", async ({ path, key, row, replacement, table }) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.platformRole, "super_admin")).limit(1);
    const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable).limit(1);
    if (!user || !world) throw new Error("Integration test needs a seeded world and super-admin user");

    const recordId = `collection-test-${randomUUID()}`;
    const api = express();
    api.use(express.json());
    api.use((req, _res, next) => {
      req.user = user;
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      next();
    });
    api.use("/api", foundationRouter);
    const url = `/api/v1/editorial/canon-records/${recordId}/${path}`;
    const body = (expected_version: number, value: object) =>
      ({ world_id: world.id, expected_version, [key]: [value] });

    try {
      await db.insert(wsCanonRecordsTable).values({
        id: recordId, worldId: world.id, name: "Disposable Character",
        canonType: "character", status: "proposed",
      });
      const missingVersion = await request(api).put(url).send({ world_id: world.id, [key]: [row] });
      expect(missingVersion.status).toBe(400);
      const first = await request(api).put(url).send(body(1, row));
      expect(first.status).toBe(200);
      expect(first.body.version).toBe(2);

      // Editor A reads version 2. Editor B commits before A's collection PUT.
      await db.update(wsCanonRecordsTable)
        .set({ version: sql`${wsCanonRecordsTable.version} + 1` })
        .where(eq(wsCanonRecordsTable.id, recordId));
      const stale = await request(api).put(url).send(body(2, replacement));
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe("VERSION_CONFLICT");
      const existing = await db.select().from(table).where(eq(table.recordId, recordId));
      expect(existing).toHaveLength(1);
      expect(existing[0]).toMatchObject(
        path === "variants" ? { variantName: "Original" } :
        path === "knowledge" ? { belief: "Original" } : { value: "Original" },
      );
      const [canon] = await db.select({ version: wsCanonRecordsTable.version }).from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId));
      expect(canon.version).toBe(3);
      const current = await request(api).put(url).send(body(3, replacement));
      expect(current.status).toBe(200);
      expect(current.body.version).toBe(4);
    } finally {
      await db.delete(table).where(eq(table.recordId, recordId));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId));
    }
  });

  it.each(collections)("serializes direct $directPath create, patch and delete with batch replacement", async ({ path, directPath, key, row, change, replacement, table }) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.platformRole, "super_admin")).limit(1);
    const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable).limit(1);
    if (!user || !world) throw new Error("Integration test needs a seeded world and super-admin user");
    const recordId = `direct-metadata-${randomUUID()}`;
    const api = express();
    api.use(express.json());
    api.use((req, _res, next) => {
      req.user = user;
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      next();
    });
    api.use("/api", foundationRouter);
    const batchUrl = `/api/v1/editorial/canon-records/${recordId}/${path}`;
    const directUrl = `/api/v1/editorial/${directPath}`;
    const staleBatch = (version: number) =>
      request(api).put(batchUrl).send({ world_id: world.id, expected_version: version, [key]: [replacement] });
    try {
      await db.insert(wsCanonRecordsTable).values({
        id: recordId, worldId: world.id, name: "Disposable Character",
        canonType: "character", status: "proposed",
      });
      expect((await request(api).post(directUrl).send({ world_id: world.id, record_id: recordId, ...row })).status).toBe(400);
      // Editor A reads version 1, then B creates a row directly before A's batch PUT.
      const created = await request(api).post(directUrl).send({
        world_id: world.id, record_id: recordId, expected_version: 1, ...row,
      });
      expect(created.status).toBe(201);
      expect(created.body.version).toBe(2);
      const rowId = created.body[key.slice(0, -1)].id as string;
      expect((await staleBatch(1)).body.code).toBe("VERSION_CONFLICT");

      const itemUrl = `${directUrl}/${rowId}?world_id=${encodeURIComponent(world.id)}`;
      expect((await request(api).patch(itemUrl).send(change)).status).toBe(400);
      expect((await request(api).patch(itemUrl).send({ expected_version: 2, record_id: "other", ...change })).status).toBe(400);
      const patched = await request(api).patch(itemUrl).send({ expected_version: 2, ...change });
      expect(patched.status).toBe(200);
      expect(patched.body.version).toBe(3);
      expect(patched.body[key.slice(0, -1)].id).toBe(rowId);
      const staleAfterPatch = await staleBatch(2);
      expect(staleAfterPatch.status).toBe(409);
      expect(staleAfterPatch.body.code).toBe("VERSION_CONFLICT");
      const [saved] = await db.select().from(table).where(eq(table.recordId, recordId));
      expect(saved).toMatchObject(
        path === "variants" ? { variantName: "Edited" } :
        path === "knowledge" ? { belief: "Edited" } : { value: "Edited" },
      );
      expect((await request(api).delete(itemUrl)).status).toBe(400);
      const deleted = await request(api).delete(`${itemUrl}&expected_version=3`);
      expect(deleted.status).toBe(200);
      expect(deleted.body.version).toBe(4);
      const staleAfterDelete = await staleBatch(3);
      expect(staleAfterDelete.status).toBe(409);
      expect(staleAfterDelete.body.code).toBe("VERSION_CONFLICT");
      expect(await db.select().from(table).where(eq(table.recordId, recordId))).toHaveLength(0);
      const [canon] = await db.select({ version: wsCanonRecordsTable.version }).from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId));
      expect(canon.version).toBe(4);
      const freshBatch = await staleBatch(4);
      expect(freshBatch.status).toBe(200);
      expect(freshBatch.body.version).toBe(5);
      const staleDirect = await request(api).post(directUrl).send({
        world_id: world.id, record_id: recordId, expected_version: 4, ...row,
      });
      expect(staleDirect.status).toBe(409);
      expect(staleDirect.body.code).toBe("VERSION_CONFLICT");
      const [current] = await db.select().from(table).where(eq(table.recordId, recordId));
      expect(current).toMatchObject(
        path === "variants" ? { variantName: "Stale" } :
        path === "knowledge" ? { belief: "Stale" } : { value: "Stale" },
      );
    } finally {
      await db.delete(table).where(eq(table.recordId, recordId));
      await db.delete(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId));
    }
  });
});