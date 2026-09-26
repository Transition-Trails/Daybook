import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLogTable, db, mcpCanonHistoryTable, usersTable, worldsmithWorldsTable, wsCanonRecordsTable,
} from "@workspace/db";
import { z } from "zod";
import { CanonToolError } from "./mcp-canon";
import { canonSummarySourceHash } from "./canon-summary";
import { sanitizeEditorialRichText } from "./editorial-rich-text";
import { resolveTypographyChoices, TypographyValidationError } from "./typography";
import {
  assignCanonImageRoles,
  enforceCanonImageOrder,
  normaliseCanonImageRole,
  type CanonImageGallerySource,
} from "./context-snapshot-images";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() => z.union([
  z.string().max(20_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema).max(500),
  z.record(z.string().min(1).max(200), jsonValueSchema),
]));
const boundedJsonObjectSchema = z.record(z.string().min(1).max(200), jsonValueSchema)
  .superRefine((value, ctx) => {
    let nodes = 0;
    const visit = (node: unknown, depth: number, path: (string | number)[]) => {
      nodes += 1;
      if (depth > 8) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "JSON nesting cannot exceed 8 levels" });
      if (nodes > 5_000) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "JSON value is too large" });
      if (Array.isArray(node)) node.forEach((child, index) => visit(child, depth + 1, [...path, index]));
      else if (node && typeof node === "object") Object.entries(node).forEach(([key, child]) => visit(child, depth + 1, [...path, key]));
    };
    visit(value, 0, []);
  });

const richText = z.string().max(20_000);
const optionalNullableText = (max: number) => z.string().max(max).nullable().optional();
const typographySchema = z.array(z.object({ fontId: z.string().trim().min(1).max(200) }).strict()).max(100);
const galleryEntrySchema = z.object({
  url: z.string().trim().min(1).max(2_000),
  name: z.string().max(200).optional(),
  description: z.string().max(2_000).optional(),
  role: z.string().max(80).optional(),
}).strict();

const changesSchema = z.object({
  name: z.string().trim().min(1).max(500).optional(),
  narrative_details: richText.optional(),
  historical_context: richText.optional(),
  visual_notes: richText.optional(),
  canon_guardrails: richText.optional(),
  relationship_details: richText.optional(),
  character_direction: richText.optional(),
  confirmed_canon: richText.optional(),
  emotional_register: z.union([z.enum(["Withholding", "Intimate", "Guarded", "Trespass", "Absence", "Confidence"]), z.null()]).optional(),
  sensory_clauses: z.string().max(20_000).optional(),
  register_locked: z.boolean().optional(),
  narrative_visibility: z.union([z.enum(["background", "hinted", "explicit"]), z.null()]).optional(),
  temporal_scope: optionalNullableText(500),
  canon_stability: z.union([z.enum(["low", "medium", "high"]), z.null()]).optional(),
  from_entity_id: optionalNullableText(200),
  to_entity_id: optionalNullableText(200),
  emotional_valence: z.union([z.enum(["admiration", "affection", "rivalry", "estrangement", "dependency", "betrayal", "grief", "obligation", "ambivalence"]), z.null()]).optional(),
  portrait_url: optionalNullableText(2_000),
  image_urls: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
  image_gallery: z.array(galleryEntrySchema).max(100).optional(),
  notes: richText.optional(),
  typography: typographySchema.optional(),
  generation_profile: boundedJsonObjectSchema.optional(),
  prompt_summary: z.string().max(3_500).optional(),
  identity_summary: z.string().max(2_000).optional(),
}).strict().refine(value => Object.keys(value).length > 0, "changes must include at least one editorial field");

const argsSchema = z.object({
  record_id: z.string().trim().min(1).max(200),
  expected_version: z.number().int().positive(),
  changes: changesSchema,
}).strict();

type Changes = z.infer<typeof changesSchema>;

const changeToColumn: Record<keyof Changes, string> = {
  name: "name",
  narrative_details: "narrativeDetails",
  historical_context: "historicalContext",
  visual_notes: "visualNotes",
  canon_guardrails: "canonGuardrails",
  relationship_details: "relationshipDetails",
  character_direction: "characterDirection",
  confirmed_canon: "confirmedCanon",
  emotional_register: "emotionalRegister",
  sensory_clauses: "sensoryClauses",
  register_locked: "registerLocked",
  narrative_visibility: "narrativeVisibility",
  temporal_scope: "temporalScope",
  canon_stability: "canonStability",
  from_entity_id: "fromEntityId",
  to_entity_id: "toEntityId",
  emotional_valence: "emotionalValence",
  portrait_url: "portraitUrl",
  image_urls: "imageUrls",
  image_gallery: "imageGallery",
  notes: "notes",
  typography: "typography",
  generation_profile: "generationProfile",
  prompt_summary: "promptSummary",
  identity_summary: "identitySummary",
};

const textSchema = (maxLength: number, minLength?: number) => ({
  type: "string", ...(minLength ? { minLength } : {}), maxLength,
});
const nullableTextSchema = (maxLength: number) => ({ anyOf: [textSchema(maxLength), { type: "null" }] });
const jsonObjectSchema = {
  type: "object",
  description: "JSON object; strings up to 20,000 characters, keys up to 200 characters, arrays up to 500 items, maximum nesting depth 8 and 5,000 total values.",
  maxProperties: 5_000,
  additionalProperties: { $ref: "#/$defs/canonJsonValue" },
};
const jsonSchemaDefinitions = {
  canonJsonValue: {
    anyOf: [
      { type: "string", maxLength: 20_000 },
      { type: "number" },
      { type: "boolean" },
      { type: "null" },
      { type: "array", maxItems: 500, items: { $ref: "#/$defs/canonJsonValue" } },
      {
        type: "object",
        maxProperties: 5_000,
        propertyNames: { maxLength: 200, minLength: 1 },
        additionalProperties: { $ref: "#/$defs/canonJsonValue" },
      },
    ],
  },
};
const changesJsonSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 500, pattern: "\\S" },
    narrative_details: textSchema(20_000), historical_context: textSchema(20_000),
    visual_notes: textSchema(20_000), canon_guardrails: textSchema(20_000),
    relationship_details: textSchema(20_000), character_direction: textSchema(20_000),
    confirmed_canon: textSchema(20_000),
    emotional_register: { anyOf: [{ enum: ["Withholding", "Intimate", "Guarded", "Trespass", "Absence", "Confidence"] }, { type: "null" }] },
    sensory_clauses: textSchema(20_000), register_locked: { type: "boolean" },
    narrative_visibility: { anyOf: [{ enum: ["background", "hinted", "explicit"] }, { type: "null" }] },
    temporal_scope: nullableTextSchema(500), canon_stability: { anyOf: [{ enum: ["low", "medium", "high"] }, { type: "null" }] },
    from_entity_id: nullableTextSchema(200), to_entity_id: nullableTextSchema(200),
    emotional_valence: { anyOf: [{ enum: ["admiration", "affection", "rivalry", "estrangement", "dependency", "betrayal", "grief", "obligation", "ambivalence"] }, { type: "null" }] },
    portrait_url: nullableTextSchema(2_000),
    image_urls: { type: "array", maxItems: 100, items: textSchema(2_000, 1) },
    image_gallery: { type: "array", maxItems: 100, items: {
      type: "object", properties: {
        url: textSchema(2_000, 1), name: textSchema(200), description: textSchema(2_000),
    role: textSchema(80),
      }, required: ["url"], additionalProperties: false,
    } },
    notes: textSchema(20_000),
    typography: { type: "array", maxItems: 100, items: {
      type: "object", properties: { fontId: textSchema(200, 1) }, required: ["fontId"], additionalProperties: false,
    } },
    generation_profile: jsonObjectSchema,
    prompt_summary: textSchema(3_500), identity_summary: textSchema(2_000),
  },
  required: [],
  minProperties: 1,
  additionalProperties: false,
};

export const CANON_EDITORIAL_TOOLS = [{
  name: "update_canon_editorial_fields",
  description: "Update a strict whitelist of editorial fields and the basic record name on any canon type using its expected version. Canon type, workflow status, ownership, and unlisted fields cannot be changed. Provide image_gallery or image_urls to replace image collections; portrait_url alone safely synchronizes all three portrait/gallery fields.",
  inputSchema: {
    type: "object",
    properties: {
      record_id: textSchema(200, 1),
      expected_version: { type: "integer", minimum: 1 },
      changes: changesJsonSchema,
    },
    $defs: jsonSchemaDefinitions,
    required: ["record_id", "expected_version", "changes"],
    additionalProperties: false,
  },
}];

export const CANON_EDITORIAL_WRITE_TOOLS = new Set<string>(["update_canon_editorial_fields"]);

function rejectMetadataReplacement(input: unknown): void {
  if (input && typeof input === "object" && !Array.isArray(input)
      && (Object.hasOwn(input, "global_metadata") || Object.hasOwn(input, "structured_profile"))) {
    throw new CanonToolError("Use update_canon_metadata for global_metadata or structured_profile field edits", 400, "USE_FIELD_LEVEL_METADATA_TOOL");
  }
}

export function validateCanonEditorialChanges(input: unknown): Changes {
  rejectMetadataReplacement(input);
  const parsed = changesSchema.safeParse(input);
  if (!parsed.success) {
    throw new CanonToolError(`Invalid canon editorial changes: ${parsed.error.message}`, 400, "INVALID_CHANGES");
  }
  return parsed.data;
}

async function requireSuperAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

export async function executeCanonEditorialTool(
  userId: string,
  name: string,
  args: unknown,
  _origin: string,
): Promise<unknown> {
  await requireSuperAdmin(userId);
  if (name !== "update_canon_editorial_fields") {
    throw new CanonToolError(`Unknown canon editorial tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
  if (args && typeof args === "object" && !Array.isArray(args)
      && "changes" in args) rejectMetadataReplacement((args as { changes: unknown }).changes);
  const parsed = argsSchema.safeParse(args);
  if (!parsed.success) throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  const { record_id: recordId, expected_version: expectedVersion, changes } = parsed.data;

  return db.transaction(async tx => {
    const [record] = await tx.select().from(wsCanonRecordsTable)
      .where(eq(wsCanonRecordsTable.id, recordId)).for("update").limit(1);
    if (!record) throw new CanonToolError("Canon record not found", 404, "RECORD_NOT_FOUND");
    const [world] = await tx.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
      .where(eq(worldsmithWorldsTable.id, record.worldId)).limit(1);
    if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
    if (record.version !== expectedVersion) {
      throw new CanonToolError(`Version conflict: expected ${expectedVersion}, current version is ${record.version}`, 409, "VERSION_CONFLICT");
    }

    const endpointChanges = changes.from_entity_id !== undefined || changes.to_entity_id !== undefined;
    if (endpointChanges && record.canonType !== "relationship") {
      throw new CanonToolError("Relationship endpoints may only be set on relationship canon records", 400, "INVALID_RELATIONSHIP_ENDPOINT");
    }
    const effectiveFrom = changes.from_entity_id !== undefined ? changes.from_entity_id : record.fromEntityId;
    const effectiveTo = changes.to_entity_id !== undefined ? changes.to_entity_id : record.toEntityId;
    const effectiveEndpointIds = [...new Set([effectiveFrom, effectiveTo].filter((id): id is string => typeof id === "string"))];
    if (endpointChanges && (typeof effectiveFrom !== "string" || !effectiveFrom || typeof effectiveTo !== "string" || !effectiveTo)) {
      throw new CanonToolError("A relationship must have both from and to canon record endpoints", 400, "INCOMPLETE_RELATIONSHIP");
    }
    if (effectiveEndpointIds.length) {
      const related = await tx.select({ id: wsCanonRecordsTable.id, worldId: wsCanonRecordsTable.worldId })
        .from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, effectiveEndpointIds));
      for (const id of effectiveEndpointIds) {
        const target = related.find(row => row.id === id);
        if (!target) throw new CanonToolError(`Related canon record "${id}" does not exist`, 400, "INVALID_RELATED_RECORD");
        if (target.worldId !== record.worldId) {
          throw new CanonToolError("Related canon records must belong to the same world", 400, "INVALID_RELATED_RECORD");
        }
      }
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes) as Array<[keyof Changes, unknown]>) {
      if (key === "typography" || value === undefined) continue;
      const column = changeToColumn[key];
      updates[column] = typeof value === "string" && [
        "narrative_details", "historical_context", "visual_notes", "canon_guardrails",
        "relationship_details", "character_direction", "confirmed_canon", "notes",
      ].includes(key) ? sanitizeEditorialRichText(value) : value;
    }
    if (changes.image_gallery !== undefined || changes.image_urls !== undefined || changes.portrait_url !== undefined) {
      const galleryEntries: CanonImageGallerySource[] = changes.image_gallery !== undefined
        ? changes.image_gallery.map(image => {
            const role = image.role === undefined ? undefined : normaliseCanonImageRole(image.role);
            if (image.role !== undefined && !role) {
              throw new CanonToolError(`Unsupported Canon image role: ${image.role.slice(0, 40)}`, 400, "INVALID_IMAGE_ROLE");
            }
            return {
              url: image.url.trim(),
              name: image.name?.trim().slice(0, 200) ?? "",
              description: image.description?.trim().slice(0, 2_000) ?? "",
              ...(role ? { role } : {}),
            };
          })
        : changes.image_urls !== undefined ? changes.image_urls.map((url, index) => ({
            url: url.trim(),
            name: index === 0 ? "Primary Canon portrait" : "",
            description: "",
          })) : changes.portrait_url === null ? [] : [{
            url: changes.portrait_url!,
            name: "Primary Canon portrait",
            description: "",
          }];
      const images = assignCanonImageRoles(enforceCanonImageOrder(galleryEntries));
      const normalizedPortrait = images[0]?.url ?? null;
      if (changes.portrait_url !== undefined && changes.portrait_url !== normalizedPortrait) {
        throw new CanonToolError("portrait_url must match the primary image when an image collection is supplied", 400, "INCONSISTENT_IMAGE_FIELDS");
      }
      updates.imageUrls = images.map(image => image.url);
      updates.imageGallery = images;
      updates.portraitUrl = normalizedPortrait;
    }
    if (changes.typography !== undefined) {
      try {
        updates.typography = await resolveTypographyChoices(changes.typography);
      } catch (error) {
        if (error instanceof TypographyValidationError) {
          throw new CanonToolError(error.message, 400, "INVALID_TYPOGRAPHY");
        }
        throw error;
      }
    }

    const [updated] = await tx.update(wsCanonRecordsTable).set({
      ...updates,
      ...(changes.prompt_summary !== undefined && changes.prompt_summary !== record.promptSummary ? {
        promptSummarySourceHash: canonSummarySourceHash({ ...record, ...updates, promptSummary: changes.prompt_summary } as typeof record, "prompt"),
        promptSummaryGeneratedAt: new Date(),
      } : {}),
      ...(changes.identity_summary !== undefined && changes.identity_summary !== record.identitySummary ? {
        identitySummarySourceHash: record.canonType === "character"
          ? canonSummarySourceHash({ ...record, ...updates, identitySummary: changes.identity_summary } as typeof record, "identity")
          : null,
        identitySummaryGeneratedAt: record.canonType === "character" ? new Date() : null,
      } : {}),
      version: record.version + 1,
      updatedAt: new Date(),
    }).where(and(eq(wsCanonRecordsTable.id, record.id), eq(wsCanonRecordsTable.version, record.version))).returning();
    if (!updated) throw new CanonToolError("Canon record changed concurrently; retry with the latest version", 409, "VERSION_CONFLICT");

    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of [
      ...Object.keys(updates),
      ...(changes.prompt_summary !== undefined && changes.prompt_summary !== record.promptSummary
        ? ["promptSummarySourceHash", "promptSummaryGeneratedAt"] : []),
      ...(changes.identity_summary !== undefined && changes.identity_summary !== record.identitySummary
        ? ["identitySummarySourceHash", "identitySummaryGeneratedAt"] : []),
      "version",
    ]) {
      const before = (record as Record<string, unknown>)[key];
      const after = (updated as Record<string, unknown>)[key];
      if (JSON.stringify(before) !== JSON.stringify(after)) diff[key] = { before: before ?? null, after: after ?? null };
    }
    await tx.insert(mcpCanonHistoryTable).values({
      id: randomUUID(),
      recordId,
      actorUserId: userId,
      changeType: "canon_editorial_mcp",
      before: record as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      diff,
    });
    await tx.insert(auditLogTable).values({
      actorUserId: userId,
      actorRole: "super_admin",
      scope: "platform",
      action: "worldsmith.editorial.canon.update",
      targetType: "worldsmith_canon_record",
      targetId: recordId,
      metadata: { actor_user_id: userId, before_after: diff },
    });
    return { record: updated, revision: updated.version, diff };
  });
}