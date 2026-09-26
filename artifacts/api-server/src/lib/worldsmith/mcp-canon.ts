import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, or } from "drizzle-orm";
import {
  db, usersTable, worldsmithWorldsTable, wsCanonRecordsTable, wsCharacterProfilesTable,
  wsAssetsTable, wsAssetLinksTable, wsVocabulariesTable, wsVocabularyOptionsTable,
  mcpCanonHistoryTable, characterProfileSchema, controlledValueSchema,
} from "@workspace/db";
import { z } from "zod";
import { CANON_METADATA_TOOL, getCanonMetadataFieldOptions, updateCanonMetadata } from "./canon-metadata";

export class CanonToolError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "CanonToolError";
  }
}

const schemaShape = characterProfileSchema.shape;
const listLimits: Record<string, number> = {
  occupation: 10, education: 20, publicReputation: 20, build: 2, eyeCharacter: 3,
  hairArrangement: 20, distinguishingFeatures: 20, posture: 3, movement: 3, palette: 20,
  textilePreference: 20, pattern: 10, accessories: 20, narrativeRole: 20, startingCondition: 20,
  resistedChange: 20, endingCondition: 20, sentenceRhythm: 10, humor: 10, conflictStyle: 20,
  affectionStyle: 20, vocabularyTendencies: 20, portrayalCautions: 20,
};
const characterChangesSchema = characterProfileSchema.partial().strict();

export function validateCharacterProfileChanges(
  existing: unknown,
  changes: unknown,
): { profile: Record<string, unknown>; changes: Record<string, unknown> } {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
    throw new CanonToolError("changes must contain one or more valid Character profile fields", 400, "INVALID_CHANGES");
  }
  const supplied = changes as Record<string, unknown>;
  const keys = Object.keys(supplied);
  const deletions = keys.filter(key => supplied[key] === null);
  const assignments = Object.fromEntries(keys.filter(key => supplied[key] !== null).map(key => [key, supplied[key]]));
  const partial = characterChangesSchema.safeParse(assignments);
  if (!keys.length || deletions.some(key => !Object.hasOwn(schemaShape, key)) || !partial.success) {
    throw new CanonToolError("changes must contain one or more valid Character profile fields", 400, "INVALID_CHANGES");
  }
  const current = characterProfileSchema.safeParse(existing ?? {});
  if (!current.success) {
    throw new CanonToolError("Stored Character profile is invalid and cannot be safely updated", 409, "INVALID_STORED_PROFILE");
  }
  const next = { ...current.data, ...partial.data } as Record<string, unknown>;
  for (const key of deletions) delete next[key];
  const merged = characterProfileSchema.safeParse(next);
  if (!merged.success) {
    throw new CanonToolError(merged.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "), 400, "INVALID_PROFILE");
  }
  return { profile: merged.data as Record<string, unknown>, changes: supplied };
}

export function validateCharacterProfileReplacement(input: unknown): Record<string, unknown> {
  const parsed = characterProfileSchema.safeParse(input);
  if (!parsed.success) {
    throw new CanonToolError(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; "), 400, "INVALID_PROFILE");
  }
  return parsed.data as Record<string, unknown>;
}

async function requireSuperAdminUser(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

async function requireWorld(worldId: string): Promise<void> {
  const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
    .where(eq(worldsmithWorldsTable.id, worldId)).limit(1);
  if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
}

const toolSchemas = {
  search_canon_records: {
    type: "object", properties: {
      world_id: { type: "string", minLength: 1 },
      query: { type: "string", minLength: 1, maxLength: 500 },
      canon_type: { type: "string", minLength: 1 },
      after_id: { type: "string", minLength: 1, maxLength: 200 },
      limit: { type: "integer", minimum: 1, maximum: 100 },
    }, required: ["world_id"], additionalProperties: false,
  },
  get_canon_record: { type: "object", properties: { record_id: { type: "string", minLength: 1 } }, required: ["record_id"], additionalProperties: false },
  get_canon_field_options: { type: "object", properties: { world_id: { type: "string", minLength: 1 }, canon_type: { type: "string", minLength: 1 } }, required: ["world_id", "canon_type"], additionalProperties: false },
  update_canon_metadata: CANON_METADATA_TOOL.inputSchema,
  update_canon_record: {
    type: "object", properties: {
      record_id: { type: "string", minLength: 1 }, expected_revision: { type: "integer", minimum: 1 },
      changes: { type: "object", properties: Object.fromEntries(Object.entries(schemaShape).map(([field]) => [
         field, { anyOf: [listLimits[field] ? {
          type: "array", maxItems: listLimits[field],
          items: { oneOf: [
            { type: "string", minLength: 1, maxLength: 80 },
            { type: "object", properties: { key: { type: "string", minLength: 1, maxLength: 80 }, custom: { type: "string", maxLength: 240 } }, required: ["key"], additionalProperties: false },
          ] },
         } : { type: "string" }, { type: "null" }] },
      ])), additionalProperties: false, minProperties: 1 },
    }, required: ["record_id", "expected_revision", "changes"], additionalProperties: false,
  },
  get_record_change_history: { type: "object", properties: { record_id: { type: "string", minLength: 1 } }, required: ["record_id"], additionalProperties: false },
} as const;

export const CANON_TOOLS = [
  { name: "search_canon_records", description: "Search canon records in a world and return editor links.", inputSchema: toolSchemas.search_canon_records },
  { name: "get_canon_record", description: "Read a complete canon record, Character profile, and linked images.", inputSchema: toolSchemas.get_canon_record },
  { name: "get_canon_field_options", description: "Read Canon globalMetadata and type-specific structuredProfile paths, direct-column distinctions, and current world/global vocabulary options.", inputSchema: toolSchemas.get_canon_field_options },
  CANON_METADATA_TOOL,
  { name: "update_canon_record", description: "Save partial validated Character fields at the expected record revision; pass null to clear an optional field. Does not approve or reject Canon.", inputSchema: toolSchemas.update_canon_record },
  { name: "get_record_change_history", description: "Read audited profile changes for a canon record.", inputSchema: toolSchemas.get_record_change_history },
];

const argsSchemas = {
  search_canon_records: z.object({
    world_id: z.string().min(1).max(200),
    query: z.string().min(1).max(500).optional(),
    canon_type: z.string().min(1).max(200).optional(),
    after_id: z.string().min(1).max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }).strict(),
  get_canon_record: z.object({ record_id: z.string().min(1) }).strict(),
  get_canon_field_options: z.object({ world_id: z.string().min(1), canon_type: z.string().min(1) }).strict(),
  update_canon_metadata: z.unknown(),
  update_canon_record: z.object({ record_id: z.string().min(1), expected_revision: z.number().int().positive(), changes: z.unknown() }).strict(),
  get_record_change_history: z.object({ record_id: z.string().min(1) }).strict(),
};

function parseArgs<T extends keyof typeof argsSchemas>(tool: T, args: unknown): z.infer<(typeof argsSchemas)[T]> {
  const parsed = argsSchemas[tool].safeParse(args);
  if (!parsed.success) throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  return parsed.data as z.infer<(typeof argsSchemas)[T]>;
}

async function getCanonRecord(recordId: string) {
  const [record] = await db.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId)).limit(1);
  if (!record) throw new CanonToolError("Canon record not found", 404, "RECORD_NOT_FOUND");
  await requireWorld(record.worldId);
  return record;
}

function editorUrl(origin: string, worldId: string, recordId: string): string {
  const url = new URL(`/super/worldsmith/editorial/canon/${encodeURIComponent(recordId)}`, origin);
  url.searchParams.set("world_id", worldId);
  return url.toString();
}

async function validatePicklists(worldId: string, changes: Record<string, unknown>): Promise<void> {
  const fields = Object.keys(changes);
  if (!fields.length) return;
  const vocabularies = await db.select().from(wsVocabulariesTable).where(and(
    eq(wsVocabulariesTable.active, true),
    or(isNull(wsVocabulariesTable.worldId), eq(wsVocabulariesTable.worldId, worldId)),
  ));
  const vocabularyForField = new Map<string, Array<typeof vocabularies[number]>>();
  for (const field of fields) {
    const snakeCase = field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    const matches = vocabularies.filter(v => v.key === snakeCase || v.key === field);
    if (matches.length) vocabularyForField.set(field, matches);
  }
  const fieldVocabularies = [...new Set([...vocabularyForField.values()].flat())];
  if (!fieldVocabularies.length) return;
  const options = await db.select().from(wsVocabularyOptionsTable).where(and(
    inArray(wsVocabularyOptionsTable.vocabularyId, fieldVocabularies.map(v => v.id)),
    eq(wsVocabularyOptionsTable.active, true),
    or(isNull(wsVocabularyOptionsTable.worldId), eq(wsVocabularyOptionsTable.worldId, worldId)),
  ));
  for (const [field, fieldVocabs] of vocabularyForField) {
    const supplied = changes[field];
    const values = Array.isArray(supplied) ? supplied : [supplied];
    const vocabularyIds = new Set(fieldVocabs.map(vocabulary => vocabulary.id));
    const allowed = new Set(options.filter(option => vocabularyIds.has(option.vocabularyId)).map(option => option.key));
    for (const value of values) {
      if (value === "custom") {
        throw new CanonToolError(`Custom ${field} choices must include custom text`, 400, "INVALID_PICKLIST_VALUE");
      }
      if (typeof value === "string" && !allowed.has(value)) {
        throw new CanonToolError(`Invalid ${field} value "${value}"; choose a current world/global vocabulary option`, 400, "INVALID_PICKLIST_VALUE");
      }
      if (value && typeof value === "object" && "key" in value) {
        const selected = controlledValueSchema.safeParse(value);
        if (!selected.success) {
          throw new CanonToolError(`Invalid controlled value for ${field}`, 400, "INVALID_PICKLIST_VALUE");
        }
        const choice = selected.data;
        if (choice.key !== "custom" && !allowed.has(choice.key)) {
          throw new CanonToolError(`Invalid ${field} vocabulary option`, 400, "INVALID_PICKLIST_VALUE");
        }
      }
    }
  }
}

/**
 * Shared validated profile update used by MCP and the editorial profile PUT.
 * When expectedVersion is omitted, the locked current version is used for legacy
 * route compatibility; every write still increments the canon row version.
 */
export async function updateCharacterProfile(
  userId: string,
  recordId: string,
  changes: unknown,
  expectedVersion?: number,
  schemaVersion?: number,
  replaceProfile = false,
): Promise<{ record: unknown; profile: Record<string, unknown>; version: number; schemaVersion: number; diff: Record<string, { before: unknown; after: unknown }> }> {
  await requireSuperAdminUser(userId);
  return db.transaction(async tx => {
    const [record] = await tx.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, recordId)).for("update").limit(1);
    if (!record) throw new CanonToolError("Canon record not found", 404, "RECORD_NOT_FOUND");
    await requireWorld(record.worldId);
    if (record.canonType !== "character") throw new CanonToolError("Only Character canon records can be updated with this tool", 422, "WRONG_CANON_TYPE");
    if (expectedVersion !== undefined && record.version !== expectedVersion) {
      throw new CanonToolError(`Version conflict: expected ${expectedVersion}, current version is ${record.version}`, 409, "VERSION_CONFLICT");
    }
    const [profileRow] = await tx.select().from(wsCharacterProfilesTable)
      .where(eq(wsCharacterProfilesTable.recordId, recordId)).limit(1);
    const current = profileRow?.profile ?? {};
    const effectiveSchemaVersion = schemaVersion ?? profileRow?.schemaVersion ?? 1;
    const target = replaceProfile
      ? validateCharacterProfileReplacement(changes)
      : validateCharacterProfileChanges(current, changes).profile;
    const fieldsToValidate = replaceProfile ? target
      : Object.fromEntries(Object.entries(changes as Record<string, unknown>).filter(([, value]) => value !== null));
    await validatePicklists(record.worldId, fieldsToValidate);
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of new Set([...Object.keys(current), ...Object.keys(target)])) {
      if (JSON.stringify(current[key]) !== JSON.stringify(target[key])) {
        diff[key] = { before: current[key] ?? null, after: target[key] ?? null };
      }
    }
    if (profileRow?.schemaVersion !== effectiveSchemaVersion) {
      diff.schemaVersion = { before: profileRow?.schemaVersion ?? null, after: effectiveSchemaVersion };
    }
    if (!Object.keys(diff).length && profileRow?.schemaVersion === effectiveSchemaVersion) {
      return { record, profile: target, version: record.version, schemaVersion: effectiveSchemaVersion, diff };
    }
    if (!replaceProfile && !Object.keys(target).length) {
      await tx.delete(wsCharacterProfilesTable).where(eq(wsCharacterProfilesTable.recordId, recordId));
    } else {
      await tx.insert(wsCharacterProfilesTable).values({
        recordId, schemaVersion: effectiveSchemaVersion, profile: target,
      }).onConflictDoUpdate({
        target: wsCharacterProfilesTable.recordId,
        set: { schemaVersion: effectiveSchemaVersion, profile: target, updatedAt: new Date() },
      });
    }
    const [updated] = await tx.update(wsCanonRecordsTable).set({
      version: record.version + 1,
      updatedAt: new Date(),
    }).where(and(eq(wsCanonRecordsTable.id, recordId), eq(wsCanonRecordsTable.version, record.version))).returning();
    if (!updated) throw new CanonToolError("Canon record changed concurrently; retry with the latest version", 409, "VERSION_CONFLICT");
    await tx.insert(mcpCanonHistoryTable).values({
      id: randomUUID(), recordId, actorUserId: userId, changeType: "character_profile",
      before: current, after: target, diff,
    });
    return { record: updated, profile: target, version: updated.version, schemaVersion: effectiveSchemaVersion, diff };
  });
}

async function characterFieldOptions(worldId: string) {
  const vocabularies = await db.select().from(wsVocabulariesTable).where(and(
    eq(wsVocabulariesTable.active, true),
    or(isNull(wsVocabulariesTable.worldId), eq(wsVocabulariesTable.worldId, worldId)),
  ));
  const options = vocabularies.length ? await db.select().from(wsVocabularyOptionsTable).where(and(
    inArray(wsVocabularyOptionsTable.vocabularyId, vocabularies.map(v => v.id)),
    eq(wsVocabularyOptionsTable.active, true),
    or(isNull(wsVocabularyOptionsTable.worldId), eq(wsVocabularyOptionsTable.worldId, worldId)),
  )).orderBy(asc(wsVocabularyOptionsTable.displayOrder)) : [];
  const byId = new Map(vocabularies.map(v => [v.id, v]));
  const choices: Record<string, Array<{ key: string; label: string; description: string }>> = {};
  for (const option of options) {
    const vocab = byId.get(option.vocabularyId);
    if (vocab) {
      const camelField = vocab.key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
      if (schemaShape[camelField as keyof typeof schemaShape]) {
        (choices[camelField] ??= []).push({ key: option.key, label: option.label, description: option.description });
      }
    }
  }
  const fields = Object.fromEntries(Object.keys(schemaShape).map(field => [
    field,
    {
      type: listLimits[field] ? "array" : "string",
      ...(listLimits[field] ? {
        maxItems: listLimits[field],
        itemMaxLength: 80,
        customTextMaxLength: 240,
      } : {}),
      choices: choices[field] ?? [],
    },
  ]));
  return {
    canon_type: "character",
    fields,
    vocabularies: vocabularies.map(vocabulary => ({
      key: vocabulary.key,
      label: vocabulary.label,
      description: vocabulary.description,
      scope: vocabulary.scope,
      world_id: vocabulary.worldId,
      active: vocabulary.active,
      version: vocabulary.version,
      options: options.filter(option => option.vocabularyId === vocabulary.id).map(option => ({
        key: option.key,
        label: option.label,
        description: option.description,
        active: option.active,
        world_id: option.worldId,
        version: option.version,
        display_order: option.displayOrder,
      })),
    })),
  };
}

export async function executeCanonTool(userId: string, name: string, args: unknown, editorOrigin: string): Promise<unknown> {
  await requireSuperAdminUser(userId);
  switch (name) {
    case "search_canon_records": {
      const input = parseArgs("search_canon_records", args);
      await requireWorld(input.world_id);
      const conditions = [eq(wsCanonRecordsTable.worldId, input.world_id)];
      if (input.query !== undefined) {
        conditions.push(or(
          ilike(wsCanonRecordsTable.name, `%${input.query}%`),
          ilike(wsCanonRecordsTable.narrativeDetails, `%${input.query}%`),
          ilike(wsCanonRecordsTable.notes, `%${input.query}%`),
        )!);
      }
      if (input.canon_type) conditions.push(eq(wsCanonRecordsTable.canonType, input.canon_type));
      const totalConditions = and(...conditions);
      const [totalRow] = await db.select({ total: count() }).from(wsCanonRecordsTable).where(totalConditions);
      const pageConditions = input.after_id
        ? [...conditions, gt(wsCanonRecordsTable.id, input.after_id)]
        : conditions;
      const pageSize = input.limit ?? 100;
      const rows = await db.select({
        id: wsCanonRecordsTable.id, name: wsCanonRecordsTable.name, canonType: wsCanonRecordsTable.canonType,
        status: wsCanonRecordsTable.status, version: wsCanonRecordsTable.version,
      }).from(wsCanonRecordsTable).where(and(...pageConditions))
        .orderBy(asc(wsCanonRecordsTable.id)).limit(pageSize + 1);
      const hasMore = rows.length > pageSize;
      const page = rows.slice(0, pageSize);
      return {
        records: page.map(row => ({ ...row, revision: row.version, editor_url: editorUrl(editorOrigin, input.world_id, row.id) })),
        total: totalRow?.total ?? 0,
        has_more: hasMore,
        next_cursor: hasMore ? page.at(-1)?.id ?? null : null,
      };
    }
    case "get_canon_record": {
      const input = parseArgs("get_canon_record", args);
      const record = await getCanonRecord(input.record_id);
      const [profile] = record.canonType === "character" ? await db.select().from(wsCharacterProfilesTable).where(eq(wsCharacterProfilesTable.recordId, record.id)).limit(1) : [];
      const [directAssets, links] = await Promise.all([
        db.select().from(wsAssetsTable).where(eq(wsAssetsTable.recordId, record.id)),
        db.select().from(wsAssetLinksTable).where(eq(wsAssetLinksTable.recordId, record.id)),
      ]);
      const linkedIds = links.map(link => link.assetId).filter(id => !directAssets.some(asset => asset.id === id));
      const linkedAssets = linkedIds.length ? await db.select().from(wsAssetsTable).where(inArray(wsAssetsTable.id, linkedIds)) : [];
      const gallery = Array.isArray(record.imageGallery) ? record.imageGallery : [];
      const urls = Array.isArray(record.imageUrls) ? record.imageUrls : [];
      return {
        record, character_profile: profile?.profile ?? null, character_profile_schema_version: profile?.schemaVersion ?? null,
        linked_images: { gallery, image_urls: urls, assets: [...directAssets, ...linkedAssets] },
        workflow_status: record.status, version: record.version, revision: record.version,
      };
    }
    case "get_canon_field_options": {
      const input = parseArgs("get_canon_field_options", args);
      await requireWorld(input.world_id);
      if (input.canon_type === "character") {
        const character = await characterFieldOptions(input.world_id);
        const metadata = await getCanonMetadataFieldOptions(input.world_id, input.canon_type);
        const vocabulariesByScope = new Map<string, (typeof metadata.vocabularies)[number] | (typeof character.vocabularies)[number]>();
        for (const vocabulary of [...metadata.vocabularies, ...character.vocabularies]) {
          const worldId = "world_id" in vocabulary ? vocabulary.world_id : null;
          const identity = `${vocabulary.key}\u0000${worldId ?? "global"}`;
          if (!vocabulariesByScope.has(identity)) vocabulariesByScope.set(identity, vocabulary);
        }
        return {
          ...metadata,
          fields: character.fields,
          vocabularies: [...vocabulariesByScope.values()],
          character_profile: { storage_path: "ws_character_profiles.profile", ...character },
        };
      }
      return getCanonMetadataFieldOptions(input.world_id, input.canon_type);
    }
    case "update_canon_metadata": {
      return updateCanonMetadata(userId, args);
    }
    case "update_canon_record": {
      const input = parseArgs("update_canon_record", args);
      const updated = await updateCharacterProfile(userId, input.record_id, input.changes, input.expected_revision);
      return {
        record: updated.record,
        character_profile: updated.profile,
        character_profile_schema_version: updated.schemaVersion,
        revision: updated.version,
        diff: updated.diff,
      };
    }
    case "get_record_change_history": {
      const input = parseArgs("get_record_change_history", args);
      const record = await getCanonRecord(input.record_id);
      const history = await db.select().from(mcpCanonHistoryTable)
        .where(eq(mcpCanonHistoryTable.recordId, record.id)).orderBy(desc(mcpCanonHistoryTable.createdAt)).limit(100);
      return { record_id: record.id, history };
    }
    default:
      throw new CanonToolError(`Unknown canon tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
}