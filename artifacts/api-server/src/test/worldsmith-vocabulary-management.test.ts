import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  db, worldsmithWorldsTable, wsVocabulariesTable, wsVocabularyOptionsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import type { User } from "@workspace/db";
import { getCanonMetadataFieldOptions } from "../lib/worldsmith/canon-metadata";

vi.mock("../middleware/requireRole", () => ({
  requireSuperAdmin: (req: Request, res: Response, next: NextFunction) => {
    if ((req.user as User | undefined)?.platformRole !== "super_admin") {
      res.status(403).json({ error: "Forbidden: super_admin required" });
      return;
    }
    next();
  },
}));

import worldsmithFoundationRouter from "../routes/worldsmith-foundation.js";

const suffix = randomUUID();
const worldId = `vocab-world-${suffix}`;
const otherWorldId = `vocab-other-world-${suffix}`;
const globalVocabId = `global-vocab-${suffix}`;
const otherWorldVocabId = `other-vocab-${suffix}`;

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as any).isAuthenticated = () => true;
  req.user = { id: `vocab-admin-${suffix}`, platformRole: "super_admin" } as User;
  next();
});
app.use("/api", worldsmithFoundationRouter);

const route = "/api/v1/editorial/vocabulary-management";

describe("world-scoped vocabulary management", () => {
  afterAll(async () => {
    await db.delete(wsVocabularyOptionsTable).where(inArray(wsVocabularyOptionsTable.worldId, [worldId, otherWorldId]));
    await db.delete(wsVocabularyOptionsTable).where(eq(wsVocabularyOptionsTable.vocabularyId, globalVocabId));
    await db.delete(wsVocabulariesTable).where(inArray(wsVocabulariesTable.id, [globalVocabId, otherWorldVocabId]));
    await db.delete(wsVocabulariesTable).where(inArray(wsVocabulariesTable.worldId, [worldId, otherWorldId]));
    await db.delete(worldsmithWorldsTable).where(inArray(worldsmithWorldsTable.id, [worldId, otherWorldId]));
  });

  it("creates and edits world-owned vocabularies/options with version checks and world isolation", async () => {
    await db.insert(worldsmithWorldsTable).values([
      { id: worldId, name: "Vocabulary Test World", code: `V${suffix.slice(0, 2).toUpperCase()}` },
      { id: otherWorldId, name: "Other Vocabulary World", code: `O${suffix.slice(0, 2).toUpperCase()}` },
    ]);
    await db.insert(wsVocabulariesTable).values([
      { id: globalVocabId, key: `global_${suffix}`, label: "Global vocabulary", scope: "global", worldId: null },
      { id: otherWorldVocabId, key: `other_${suffix}`, label: "Other world vocabulary", scope: "world", worldId: otherWorldId },
    ]);

    const created = await request(app).post(`${route}/vocabularies`).send({
      world_id: worldId, key: `tone_${suffix}`, label: "Tone",
    });
    expect(created.status).toBe(201);
    expect(created.body.vocabulary).toMatchObject({
      worldId, scope: "world", key: `tone_${suffix}`, label: "Tone", description: "", active: true, version: 1,
    });
    const vocabularyId = created.body.vocabulary.id as string;

    const createdOption = await request(app).post(`${route}/options`).send({
      world_id: worldId, vocabulary_id: vocabularyId, key: "quiet", label: "Quiet",
    });
    expect(createdOption.status).toBe(201);
    expect(createdOption.body.option).toMatchObject({
      worldId, vocabularyId, key: "quiet", label: "Quiet", active: true, version: 1,
    });
    const optionId = createdOption.body.option.id as string;
    const duplicateOption = await request(app).post(`${route}/options`).send({
      world_id: worldId, vocabulary_id: vocabularyId, key: "quiet", label: "Duplicate",
    });
    expect(duplicateOption.status).toBe(409);
    expect(duplicateOption.body.code).toBe("DUPLICATE_KEY");

    const vocabularyEdit = await request(app).patch(`${route}/vocabularies/${vocabularyId}`).send({
      world_id: worldId, expected_version: 1, label: "Atmosphere",
    });
    expect(vocabularyEdit.status).toBe(200);
    expect(vocabularyEdit.body.vocabulary).toMatchObject({ label: "Atmosphere", version: 2 });

    const optionEdit = await request(app).patch(`${route}/options/${optionId}`).send({
      world_id: worldId, expected_version: 1, label: "Stillness", active: false,
    });
    expect(optionEdit.status).toBe(200);
    expect(optionEdit.body.option).toMatchObject({ label: "Stillness", active: false, version: 2 });

    const stale = await request(app).patch(`${route}/vocabularies/${vocabularyId}`).send({
      world_id: worldId, expected_version: 1, active: false,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");

    const wrongWorldVocabulary = await request(app).patch(`${route}/vocabularies/${vocabularyId}`).send({
      world_id: otherWorldId, expected_version: 2, label: "Cross-world edit",
    });
    expect(wrongWorldVocabulary.status).toBe(404);

    const globalEdit = await request(app).patch(`${route}/vocabularies/${globalVocabId}`).send({
      world_id: worldId, expected_version: 1, label: "Global mutation",
    });
    expect(globalEdit.status).toBe(409);
    expect(globalEdit.body.code).toBe("IMMUTABLE_SCOPE");

    const otherWorldOptionCreate = await request(app).post(`${route}/options`).send({
      world_id: worldId, vocabulary_id: otherWorldVocabId, key: "bad", label: "Wrong world",
    });
    expect(otherWorldOptionCreate.status).toBe(404);
    const globalOptionCreate = await request(app).post(`${route}/options`).send({
      world_id: worldId, vocabulary_id: globalVocabId, key: "bad", label: "Global parent",
    });
    expect(globalOptionCreate.status).toBe(409);
    expect(globalOptionCreate.body.code).toBe("IMMUTABLE_SCOPE");

    const immutableKeyAttempt = await request(app).patch(`${route}/vocabularies/${vocabularyId}`).send({
      world_id: worldId, expected_version: 2, key: "changed_key", label: "Should not save",
    });
    expect(immutableKeyAttempt.status).toBe(400);
    expect(immutableKeyAttempt.body.error).toContain("key");

    const immutableScopeAttempt = await request(app).patch(`${route}/vocabularies/${vocabularyId}`).send({
      world_id: worldId, expected_version: 2, scope: "global", label: "Should not save",
    });
    expect(immutableScopeAttempt.status).toBe(400);
    expect(immutableScopeAttempt.body.error).toContain("scope");
    const immutableOptionKeyAttempt = await request(app).patch(`${route}/options/${optionId}`).send({
      world_id: worldId, expected_version: 2, key: "changed", label: "Should not save",
    });
    expect(immutableOptionKeyAttempt.status).toBe(400);
    expect(immutableOptionKeyAttempt.body.error).toContain("key");

    const missingWorld = await request(app).post(`${route}/vocabularies`).send({
      world_id: `missing-${suffix}`, key: "new", label: "Missing world",
    });
    expect(missingWorld.status).toBe(404);

    const duplicate = await request(app).post(`${route}/vocabularies`).send({
      world_id: worldId, key: `tone_${suffix}`, label: "Duplicate",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("DUPLICATE_KEY");

    const objectSet = await request(app).post(`${route}/vocabularies`).send({
      world_id: worldId, record_type: "object", key: `tone_${suffix}`, label: "Object tone",
    });
    const locationSet = await request(app).post(`${route}/vocabularies`).send({
      world_id: worldId, record_type: "location", key: `tone_${suffix}`, label: "Location tone",
    });
    expect(objectSet.status).toBe(201);
    expect(locationSet.status).toBe(201);
    expect(objectSet.body.vocabulary).toMatchObject({ recordType: "object", worldId, key: `tone_${suffix}` });
    expect(locationSet.body.vocabulary).toMatchObject({ recordType: "location", worldId, key: `tone_${suffix}` });
    const sameType = await request(app).post(`${route}/vocabularies`).send({
      world_id: worldId, record_type: "object", key: `tone_${suffix}`, label: "Duplicate Object tone",
    });
    expect(sameType.status).toBe(409);
    const wrongType = await request(app).post(`${route}/vocabularies`).send({
      world_id: worldId, record_type: "not_a_canon_type", key: "wrong_type", label: "Wrong type",
    });
    expect(wrongType.status).toBe(400);
    const immutableRecordType = await request(app).patch(`${route}/vocabularies/${objectSet.body.vocabulary.id}`).send({
      world_id: worldId, expected_version: 1, record_type: "location", label: "Wrong type change",
    });
    expect(immutableRecordType.status).toBe(400);
    const register = await request(app).get("/api/v1/editorial/vocabularies").query({ world_id: worldId });
    expect(register.status).toBe(200);
    expect(register.body.vocabularies).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: objectSet.body.vocabulary.id, recordType: "object" }),
      expect.objectContaining({ id: locationSet.body.vocabulary.id, recordType: "location" }),
    ]));

    const scopedRows = await db.select().from(wsVocabulariesTable)
      .where(and(eq(wsVocabulariesTable.id, vocabularyId), eq(wsVocabulariesTable.worldId, worldId)));
    const untouchedOtherWorld = await db.select().from(wsVocabulariesTable)
      .where(eq(wsVocabulariesTable.id, otherWorldVocabId));
    expect(scopedRows[0]).toMatchObject({ label: "Atmosphere", version: 2, active: true, scope: "world", worldId });
    expect(untouchedOtherWorld[0]).toMatchObject({
      label: "Other world vocabulary", version: 1, active: true, scope: "world", worldId: otherWorldId,
    });
    const otherWorldOptions = await db.select().from(wsVocabularyOptionsTable)
      .where(eq(wsVocabularyOptionsTable.worldId, otherWorldId));
    expect(otherWorldOptions).toHaveLength(0);
  });

  it("imports built-in choices by record type without changing curated or shared sets", async () => {
    const curatedId = randomUUID();
    const sharedId = randomUUID();
    await db.insert(wsVocabulariesTable).values([
      { id: curatedId, worldId, recordType: "object", key: "object_class", label: "Curated classes", scope: "world", active: false },
      { id: sharedId, worldId, key: "condition", label: "Shared condition", scope: "world" },
    ]);
    await db.insert(wsVocabularyOptionsTable).values({
      id: randomUUID(), vocabularyId: curatedId, worldId, key: "only_this", label: "Only this", active: false,
    });
    await db.insert(wsVocabularyOptionsTable).values([
      { id: randomUUID(), vocabularyId: sharedId, worldId, key: "worn", label: "Previously disabled", active: false },
      { id: randomUUID(), vocabularyId: sharedId, worldId, key: "handmade", label: "Handmade", active: true },
    ]);
    const invalid = await request(app).post(`${route}/import-defaults`).send({
      world_id: worldId, record_type: "invalid",
    });
    expect(invalid.status).toBe(400);
    const first = await request(app).post(`${route}/import-defaults`).send({
      world_id: worldId, record_type: "object",
    });
    expect(first.status).toBe(200);
    expect(first.body.createdVocabularies).toBeGreaterThan(0);
    expect(first.body.createdOptions).toBeGreaterThan(0);
    const typedCondition = await db.select().from(wsVocabulariesTable)
      .where(and(eq(wsVocabulariesTable.worldId, worldId), eq(wsVocabulariesTable.recordType, "object"), eq(wsVocabulariesTable.key, "condition")));
    expect(typedCondition).toHaveLength(1);
    const conditionOptions = await db.select().from(wsVocabularyOptionsTable)
      .where(eq(wsVocabularyOptionsTable.vocabularyId, typedCondition[0]!.id));
    expect(conditionOptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "worn", label: "Previously disabled", active: false }),
      expect.objectContaining({ key: "handmade", label: "Handmade", active: true }),
      expect.objectContaining({ key: "new", label: "New", active: true }),
    ]));
    const metadata = await getCanonMetadataFieldOptions(worldId, "object");
    expect(metadata.paths.structured_profile.fields.condition.choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "handmade", allowed: true }),
      expect.objectContaining({ key: "worn", allowed: false }),
    ]));
    const originalShared = await db.select().from(wsVocabulariesTable).where(eq(wsVocabulariesTable.id, sharedId));
    expect(originalShared[0]).toMatchObject({ label: "Shared condition", recordType: null });
    const originalCurated = await db.select().from(wsVocabulariesTable).where(eq(wsVocabulariesTable.id, curatedId));
    expect(originalCurated[0]).toMatchObject({ label: "Curated classes", active: false });
    const curatedOptions = await db.select().from(wsVocabularyOptionsTable).where(eq(wsVocabularyOptionsTable.vocabularyId, curatedId));
    expect(curatedOptions).toEqual([expect.objectContaining({ key: "only_this", active: false })]);

    const second = await request(app).post(`${route}/import-defaults`).send({
      world_id: worldId, record_type: "object",
    });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ createdVocabularies: 0, createdOptions: 0 });
    const otherWorldOptions = await db.select().from(wsVocabularyOptionsTable).where(eq(wsVocabularyOptionsTable.worldId, otherWorldId));
    expect(otherWorldOptions).toHaveLength(0);
  });
});