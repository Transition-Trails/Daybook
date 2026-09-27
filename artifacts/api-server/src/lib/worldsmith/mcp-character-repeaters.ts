import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db, mcpCanonHistoryTable, usersTable, wsCanonRecordsTable,
  wsCharacterVariantsTable, wsIdentityLocksTable, wsKnowledgeEntriesTable,
} from "@workspace/db";
import { z } from "zod";
import { getCharacterRepeaterFieldOptions } from "./canon-metadata";
import { CanonToolError } from "./canon-tool-error";

const id = z.string().trim().min(1).max(160);
const optionalText = z.string().max(10_000).nullish().or(z.literal(""));
const optionalShortText = z.string().max(240).nullish().or(z.literal(""));
const strings = z.array(z.string().min(1).max(160)).max(100);
const profileSchema = z.object({
  story_period_label: z.string().max(240).nullish().or(z.literal("")),
  apparent_age_range: z.string().max(120).nullish().or(z.literal("")),
  hair_changes: optionalText,
  facial_hair_changes: optionalText,
  health_mobility_changes: optionalText,
  wardrobe_profile: optionalText,
  occupation_status: optionalText,
  emotional_baseline: optionalText,
  reference_asset_ids: strings.nullish().transform(value => value ?? []),
  allowed_deviations: optionalText,
  visual_notes: optionalText,
}).strict();

const knowledgeRowSchema = z.object({
  id: id.optional(),
  topic_record_id: id.nullish().or(z.literal("")),
  knowledge_state: z.string().trim().min(1).max(160),
  confidence: optionalShortText,
  source: optionalShortText,
  disclosure: optionalShortText,
  access: optionalShortText,
  applicable_life_stage: optionalShortText,
  applicable_era: optionalShortText,
  belief: optionalText,
  objective_truth: optionalText,
  consequence: optionalText,
}).strict();

const variantRowSchema = z.object({
  id: id.optional(),
  variant_name: z.string().trim().min(1).max(240),
  life_stage: z.string().trim().min(1),
  profile: profileSchema.nullish().transform(value => value ?? {}),
  active: z.boolean().default(true),
  is_default: z.boolean().default(false),
}).strict();

const lockRowSchema = z.object({
  id: id.optional(),
  variant_id: id.nullish().or(z.literal("")),
  category: z.string().trim().min(1).max(160),
  value: z.string().max(10_000),
  strength: z.string().trim().min(1).max(160).default("preferred"),
  applies_to_life_stages: strings.nullish().transform(value => value ?? []),
  positive_prompt: optionalText,
  negative_prompt: optionalText,
  explanation: optionalText,
}).strict();

const inputSchemas = {
  replace_character_knowledge: z.object({
    record_id: id,
    expected_revision: z.number().int().positive(),
    knowledge: z.array(knowledgeRowSchema).max(200),
  }).strict(),
  replace_character_variants: z.object({
    record_id: id,
    expected_revision: z.number().int().positive(),
    variants: z.array(variantRowSchema).max(200),
  }).strict(),
  replace_character_identity_locks: z.object({
    record_id: id,
    expected_revision: z.number().int().positive(),
    locks: z.array(lockRowSchema).max(200),
  }).strict(),
};

const rowSchemaProperties = {
  knowledge: {
    id: { type: "string", description: "Optional existing row ID to preserve." },
    topic_record_id: { type: ["string", "null"], description: "Related canon record, if any." },
    knowledge_state: { type: "string", minLength: 1, description: "What the character knows or believes." },
    confidence: { type: ["string", "null"] }, source: { type: ["string", "null"] },
    disclosure: { type: ["string", "null"] }, access: { type: ["string", "null"] },
    applicable_life_stage: { type: ["string", "null"] }, applicable_era: { type: ["string", "null"] },
    belief: { type: ["string", "null"] }, objective_truth: { type: ["string", "null"] },
    consequence: { type: ["string", "null"] },
  },
  variants: {
    id: { type: "string", description: "Optional existing row ID to preserve." },
    variant_name: { type: "string", minLength: 1, maxLength: 240 },
    life_stage: { type: "string", minLength: 1 },
    profile: {
      anyOf: [{ type: "null" }, {
        type: "object", properties: {
          story_period_label: { type: ["string", "null"], maxLength: 240 },
          apparent_age_range: { type: ["string", "null"], maxLength: 120 },
          hair_changes: { type: ["string", "null"] }, facial_hair_changes: { type: ["string", "null"] },
          health_mobility_changes: { type: ["string", "null"] }, wardrobe_profile: { type: ["string", "null"] },
          occupation_status: { type: ["string", "null"] }, emotional_baseline: { type: ["string", "null"] },
          reference_asset_ids: { anyOf: [{ type: "null" }, { type: "array", maxItems: 100, items: { type: "string" } }] },
          allowed_deviations: { type: ["string", "null"] }, visual_notes: { type: ["string", "null"] },
        }, additionalProperties: false,
      }],
    },
    active: { type: "boolean" }, is_default: { type: "boolean" },
  },
  locks: {
    id: { type: "string", description: "Optional existing row ID to preserve." },
    variant_id: { type: ["string", "null"], description: "Optional variant belonging to this Character." },
    category: { type: "string", minLength: 1, description: "Controlled identity-lock category." },
    value: { type: "string", description: "Identity constraint value." },
    strength: { type: "string", description: "Controlled strength: suggestion, preferred, required, or immutable." },
    applies_to_life_stages: { anyOf: [{ type: "null" }, { type: "array", maxItems: 100, items: { type: "string" } }] },
    positive_prompt: { type: ["string", "null"] }, negative_prompt: { type: ["string", "null"] },
    explanation: { type: ["string", "null"] },
  },
} as const;

const toolCollectionSchemas = [
  {
    name: "replace_character_knowledge",
    collection: "knowledge",
    description: "Atomically replace the Character's complete knowledge collection. Rows omitted from the array are deleted; optional row IDs preserve identity. An empty array clears this collection only.",
  },
  {
    name: "replace_character_variants",
    collection: "variants",
    description: "Atomically replace the Character's complete life-stage variants collection. Rows omitted from the array are deleted; optional row IDs preserve identity. An empty array clears this collection only.",
  },
  {
    name: "replace_character_identity_locks",
    collection: "locks",
    description: "Atomically replace the Character's complete visual identity-lock collection. Rows omitted from the array are deleted; optional row IDs preserve identity. An empty array clears this collection only.",
  },
] as const;

export const CHARACTER_REPEATER_TOOLS = toolCollectionSchemas.map(({ name, collection, description }) => ({
  name,
  description,
  inputSchema: {
    type: "object",
    properties: {
      record_id: { type: "string", minLength: 1, description: "Character canon record ID." },
      expected_revision: { type: "integer", minimum: 1, description: "Current Canon revision; prevents overwriting concurrent edits." },
      [collection]: {
        type: "array", maxItems: 200,
        description: "Complete replacement rows; never truncated. Optional row IDs preserve identity; omitted IDs are generated.",
        items: {
          type: "object",
          properties: rowSchemaProperties[collection],
          required: collection === "knowledge" ? ["knowledge_state"]
            : collection === "variants" ? ["variant_name", "life_stage"] : ["category", "value"],
          additionalProperties: false,
        },
      },
    },
    required: ["record_id", "expected_revision", collection],
    additionalProperties: false,
  },
}));

export const CHARACTER_REPEATER_WRITE_TOOLS = new Set<string>(
  toolCollectionSchemas.map(tool => tool.name),
);

const collectionConfig = {
  replace_character_knowledge: {
    argument: "knowledge", collection: "knowledge", table: wsKnowledgeEntriesTable,
  },
  replace_character_variants: {
    argument: "variants", collection: "variants", table: wsCharacterVariantsTable,
  },
  replace_character_identity_locks: {
    argument: "locks", collection: "identity_locks", table: wsIdentityLocksTable,
  },
} as const;

function parseInput(name: keyof typeof inputSchemas, args: unknown) {
  const parsed = inputSchemas[name].safeParse(args);
  if (!parsed.success) {
    throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  }
  return parsed.data as Record<string, any>;
}

async function assertSuperAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

function snakeRow(row: object): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "createdAt" || key === "updatedAt" || key === "recordId") continue;
    const snake = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snake] = value;
  }
  return result;
}

function optionKeys(fieldOptions: any, field: string): Set<string> {
  return new Set((fieldOptions[field]?.choices ?? [])
    .filter((choice: { allowed: boolean }) => choice.allowed)
    .map((choice: { key: string }) => choice.key));
}

async function validateEnumeratedFields(worldId: string, rows: Record<string, any>[], name: string, beforeRows: Record<string, any>[]): Promise<void> {
  const fields = name === "replace_character_identity_locks"
    ? ["category", "strength"]
    : name === "replace_character_variants" ? ["life_stage"]
    : ["knowledge_state", "confidence", "source", "disclosure", "access"];
  const options = await getCharacterRepeaterFieldOptions(worldId);
  const previousById = new Map(beforeRows.map(row => [row.id, snakeRow(row)]));
  for (const field of fields) {
    if (!rows.some(row => row[field] !== undefined && row[field] !== null && row[field] !== "")) continue;
    const allowed = optionKeys(options, field);
    for (const [index, row] of rows.entries()) {
      const value = row[field];
      if (value === undefined || value === null || value === "") continue;
      // Existing values may predate an option's deactivation; allow an unchanged
      // row to round-trip without granting new writes of that value.
      if (allowed.has(value) || (row.id && previousById.get(row.id)?.[field] === value)) continue;
      throw new CanonToolError(`Invalid ${field} value "${value}" in row ${index + 1}; choose an active Character option`, 400, "INVALID_REPEATER_OPTION");
    }
  }
}

function ensureUniqueIds(rows: Record<string, any>[]): void {
  const ids = rows.flatMap(row => row.id ? [row.id] : []);
  if (new Set(ids).size !== ids.length) {
    throw new CanonToolError("Repeater rows cannot contain duplicate IDs", 400, "DUPLICATE_ROW_ID");
  }
}

async function validateReferences(
  tx: any,
  record: Record<string, any>,
  rows: Record<string, any>[],
  name: string,
): Promise<void> {
  if (name === "replace_character_knowledge") {
    const topicIds = [...new Set(rows.map(row => row.topic_record_id).filter(Boolean))] as string[];
    if (!topicIds.length) return;
    const owned = await tx.select({ id: wsCanonRecordsTable.id }).from(wsCanonRecordsTable)
      .where(and(eq(wsCanonRecordsTable.worldId, record.worldId), inArray(wsCanonRecordsTable.id, topicIds)));
    if (owned.length !== topicIds.length) {
      throw new CanonToolError("topic_record_id must belong to the Character's world", 422, "INVALID_TOPIC_RECORD");
    }
  }
  if (name === "replace_character_identity_locks") {
    const variantIds = [...new Set(rows.map(row => row.variant_id).filter(Boolean))] as string[];
    if (!variantIds.length) return;
    const owned = await tx.select({ id: wsCharacterVariantsTable.id }).from(wsCharacterVariantsTable)
      .where(and(eq(wsCharacterVariantsTable.recordId, record.id), inArray(wsCharacterVariantsTable.id, variantIds)));
    if (owned.length !== variantIds.length) {
      throw new CanonToolError("variant_id must belong to this Character record", 422, "INVALID_VARIANT_REFERENCE");
    }
  }
}

function toInsertValues(recordId: string, rows: Record<string, any>[], name: string): Record<string, any>[] {
  return rows.map(row => {
    const common = { id: row.id ?? randomUUID(), recordId };
    if (name === "replace_character_knowledge") {
      return {
        ...common, topicRecordId: row.topic_record_id || null, knowledgeState: row.knowledge_state,
        confidence: row.confidence || null, source: row.source || null, disclosure: row.disclosure || null,
        access: row.access || null, applicableLifeStage: row.applicable_life_stage || null,
        applicableEra: row.applicable_era || null, belief: row.belief || null,
        objectiveTruth: row.objective_truth || null, consequence: row.consequence || null,
      };
    }
    if (name === "replace_character_variants") {
      return {
        ...common, variantName: row.variant_name, lifeStage: row.life_stage, profile: row.profile,
        active: row.active, isDefault: row.is_default,
      };
    }
    return {
      ...common, variantId: row.variant_id || null, category: row.category, value: row.value,
      strength: row.strength, appliesToLifeStages: row.applies_to_life_stages,
      positivePrompt: row.positive_prompt || null, negativePrompt: row.negative_prompt || null,
      explanation: row.explanation || null,
    };
  });
}

export async function getCharacterRepeaters(recordId: string): Promise<{
  knowledge: Record<string, unknown>[];
  variants: Record<string, unknown>[];
  identity_locks: Record<string, unknown>[];
}> {
  const [record] = await db.select().from(wsCanonRecordsTable)
    .where(eq(wsCanonRecordsTable.id, recordId)).limit(1);
  if (!record) throw new CanonToolError("Canon record not found", 404, "RECORD_NOT_FOUND");
  if (record.canonType !== "character") {
    throw new CanonToolError("Character repeater collections are available only for Character records", 422, "WRONG_CANON_TYPE");
  }
  const [knowledge, variants, identityLocks] = await Promise.all([
    db.select().from(wsKnowledgeEntriesTable).where(eq(wsKnowledgeEntriesTable.recordId, recordId)),
    db.select().from(wsCharacterVariantsTable).where(eq(wsCharacterVariantsTable.recordId, recordId)),
    db.select().from(wsIdentityLocksTable).where(eq(wsIdentityLocksTable.recordId, recordId)),
  ]);
  return {
    knowledge: knowledge.map(row => snakeRow(row)),
    variants: variants.map(row => snakeRow(row)),
    identity_locks: identityLocks.map(row => snakeRow(row)),
  };
}

export async function executeCharacterRepeaterTool(userId: string, name: string, args: unknown): Promise<unknown> {
  if (!CHARACTER_REPEATER_WRITE_TOOLS.has(name)) {
    throw new CanonToolError(`Unknown Character repeater tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
  await assertSuperAdmin(userId);
  const toolName = name as keyof typeof inputSchemas;
  const input = parseInput(toolName, args);
  const { argument, collection, table } = collectionConfig[toolName];
  const rows = input[argument] as Record<string, any>[];
  ensureUniqueIds(rows);

  return db.transaction(async tx => {
    const [current] = await tx.select().from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, input.record_id)).for("update").limit(1);
    if (!current) throw new CanonToolError("Canon record not found", 404, "RECORD_NOT_FOUND");
    if (current.canonType !== "character") {
      throw new CanonToolError("Only Character canon records support repeater replacement", 422, "WRONG_CANON_TYPE");
    }
    if (current.version !== input.expected_revision) {
      throw new CanonToolError(
        `Version conflict: expected ${input.expected_revision}, current version is ${current.version}`,
        409,
        "VERSION_CONFLICT",
      );
    }
    const [user] = await tx.select({ id: usersTable.id }).from(usersTable)
      .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
    if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");

    const beforeRows = await tx.select().from(table as any).where(eq((table as any).recordId, current.id));
    await validateEnumeratedFields(current.worldId, rows, toolName, beforeRows);
    await validateReferences(tx, current, rows, toolName);
    const suppliedIds = rows.flatMap(row => row.id ? [row.id] : []);
    if (suppliedIds.length) {
      const collisions = await tx.select({ id: (table as any).id }).from(table as any)
        .where(inArray((table as any).id, suppliedIds));
      const allowedExistingIds = new Set(beforeRows.map((row: any) => row.id));
      if (collisions.some((row: any) => !allowedExistingIds.has(row.id))) {
        throw new CanonToolError("A supplied row ID belongs to another record", 422, "ROW_ID_OWNERSHIP");
      }
    }

    const before = beforeRows.map((row: any) => snakeRow(row));
    const insertedValues = toInsertValues(current.id, rows, toolName);
    await tx.delete(table as any).where(eq((table as any).recordId, current.id));
    const inserted = insertedValues.length
      ? await tx.insert(table as any).values(insertedValues as any).returning() as any[]
      : [];
    const [updated] = await tx.update(wsCanonRecordsTable).set({
      version: sql`${wsCanonRecordsTable.version} + 1`,
      updatedAt: new Date(),
    }).where(and(
      eq(wsCanonRecordsTable.id, current.id),
      eq(wsCanonRecordsTable.version, input.expected_revision),
    )).returning();
    if (!updated) {
      throw new CanonToolError("Canon record changed concurrently; retry with the latest revision", 409, "VERSION_CONFLICT");
    }
    const after = inserted.map((row: any) => snakeRow(row));
    const diff = { [collection]: { before, after } };
    await tx.insert(mcpCanonHistoryTable).values({
      id: randomUUID(),
      recordId: current.id,
      actorUserId: userId,
      changeType: `character_${collection}_replacement`,
      before: { [collection]: before },
      after: { [collection]: after },
      diff,
    });
    return {
      record_id: current.id,
      revision: updated.version,
      workflow_status: updated.status,
      [collection]: after,
    };
  });
}