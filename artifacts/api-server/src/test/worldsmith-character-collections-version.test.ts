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
  { path: "variants", key: "variants", row: { variant_name: "Original", life_stage: "adult" }, replacement: { variant_name: "Stale", life_stage: "adult" }, table: wsCharacterVariantsTable },
  { path: "knowledge", key: "knowledge", row: { knowledge_state: "knows", belief: "Original" }, replacement: { knowledge_state: "knows", belief: "Stale" }, table: wsKnowledgeEntriesTable },
  { path: "identity-locks", key: "locks", row: { category: "appearance", value: "Original" }, replacement: { category: "appearance", value: "Stale" }, table: wsIdentityLocksTable },
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
});