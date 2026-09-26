import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  auditLogTable,
  db,
  usersTable,
  worldsmithProductionPackagesTable,
  worldsmithSpecPreviewsTable,
  worldsmithWorldsTable,
  wsCanonRecordsTable,
  wsCollectionsTable,
  wsComponentSpecsTable,
  wsPromptModulesTable,
  wsProductionSpecsTable,
  wsStyleGuidesTable,
  wsVolumesTable,
  type InsertWsProductionSpec,
} from "@workspace/db";
import { canonClear, payloadReady, readinessChecks, readinessScore } from "@workspace/api-zod/readiness";
import { z } from "zod";
import { sanitizeEditorialRichText } from "./editorial-rich-text.js";
import { revisionFor } from "./editorial-revision.js";
import { CanonToolError } from "./mcp-canon.js";

const text = (max: number, min = 0) => z.string().min(min).max(max);
const nullableText = (max: number) => text(max).nullable();
const id = text(200, 1);
const arrayIds = z.array(id).max(200);

const specFieldsSchema = {
  production_item: nullableText(500).optional(),
  spec_id: nullableText(200).optional(),
  component_type: nullableText(200).optional(),
  component_set: nullableText(500).optional(),
  design_intent: nullableText(20_000).optional(),
  narrative_purpose: nullableText(20_000).optional(),
  required_content: nullableText(20_000).optional(),
  review_criteria: nullableText(20_000).optional(),
  writing_space_percent: z.number().finite().min(0).max(100).nullable().optional(),
  orientation: nullableText(100).optional(),
  front_back_style: nullableText(200).optional(),
  canon_dependency: text(200).optional(),
  canon_record_ids: arrayIds.nullable().optional(),
  payload_version: nullableText(100).optional(),
  prompt_payload: text(50_000).nullable().optional(),
  style_guide_id: id.nullable().optional(),
  component_spec_id: id.nullable().optional(),
  prompt_module_ids: arrayIds.nullable().optional(),
  collection_id: id.nullable().optional(),
  volume_id: id.nullable().optional(),
};
const commonCreateSchema = z.object({
  record_id: z.string().uuid(),
  world_id: id,
  ...specFieldsSchema,
  wizard_step: z.number().int().min(0).max(4).optional(),
  draft: z.boolean().optional(),
}).strict();
const argsSchemas = {
  list_production_specs: z.object({
    world_id: id,
    status: text(100).optional(),
  }).strict(),
  get_production_spec: z.object({ world_id: id, spec_id: id }).strict(),
  create_production_spec: commonCreateSchema,
  update_production_spec: z.object({
    world_id: id,
    spec_id: id,
    expected_revision: text(100, 1),
    changes: z.object({
      ...specFieldsSchema,
      wizard_step: z.number().int().min(0).max(4).optional(),
      finalize: z.boolean().optional(),
    }).strict().refine(value => Object.keys(value).length > 0, "changes must include editable fields"),
  }).strict(),
} as const;
type ToolName = keyof typeof argsSchemas;

type ToolDescriptor = { name: ToolName; description: string; inputSchema: Record<string, unknown> };
const strSchema = (maxLength: number, minLength?: number) => ({
  type: "string", maxLength, ...(minLength ? { minLength } : {}),
});
const nullableStringSchema = (maxLength: number) => ({
  anyOf: [strSchema(maxLength), { type: "null" }],
});
const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false,
});
const specInputProperties: Record<string, unknown> = {
  production_item: nullableStringSchema(500),
  spec_id: nullableStringSchema(200),
  component_type: nullableStringSchema(200),
  component_set: nullableStringSchema(500),
  design_intent: nullableStringSchema(20_000),
  narrative_purpose: nullableStringSchema(20_000),
  required_content: nullableStringSchema(20_000),
  review_criteria: nullableStringSchema(20_000),
  writing_space_percent: { anyOf: [{ type: "number", minimum: 0, maximum: 100 }, { type: "null" }] },
  orientation: nullableStringSchema(100),
  front_back_style: nullableStringSchema(200),
  canon_dependency: strSchema(200),
  canon_record_ids: { anyOf: [{ type: "array", maxItems: 200, items: strSchema(200, 1) }, { type: "null" }] },
  payload_version: nullableStringSchema(100),
  prompt_payload: nullableStringSchema(50_000),
  style_guide_id: { anyOf: [strSchema(200, 1), { type: "null" }] },
  component_spec_id: { anyOf: [strSchema(200, 1), { type: "null" }] },
  prompt_module_ids: { anyOf: [{ type: "array", maxItems: 200, items: strSchema(200, 1) }, { type: "null" }] },
  collection_id: { anyOf: [strSchema(200, 1), { type: "null" }] },
  volume_id: { anyOf: [strSchema(200, 1), { type: "null" }] },
};

export const PRODUCTION_SPEC_TOOLS: ToolDescriptor[] = [
  { name: "list_production_specs", description: "List Production Specs in one world, optionally filtered by pipeline status.", inputSchema: objectSchema({
    world_id: strSchema(200, 1), status: strSchema(100),
  }, ["world_id"]) },
  { name: "get_production_spec", description: "Read one Production Spec and its linked records from the specified world.", inputSchema: objectSchema({
    world_id: strSchema(200, 1), spec_id: strSchema(200, 1),
  }, ["world_id", "spec_id"]) },
  { name: "create_production_spec", description: "Create a validated Production Spec, optionally as an in-progress wizard draft.", inputSchema: objectSchema({
    record_id: { type: "string", format: "uuid" }, world_id: strSchema(200, 1), ...specInputProperties,
    wizard_step: { type: "integer", minimum: 0, maximum: 4 }, draft: { type: "boolean" },
  }, ["record_id", "world_id"]) },
  { name: "update_production_spec", description: "Patch editable Production Spec fields at an expected revision; compilation state and publication workflow protections are preserved.", inputSchema: objectSchema({
    world_id: strSchema(200, 1), spec_id: strSchema(200, 1), expected_revision: strSchema(100, 1),
    changes: objectSchema({
      ...specInputProperties, wizard_step: { type: "integer", minimum: 0, maximum: 4 },
      finalize: { type: "boolean" },
    }),
  }, ["world_id", "spec_id", "expected_revision", "changes"]) },
];

export const PRODUCTION_SPEC_WRITE_TOOLS = new Set<string>([
  "create_production_spec", "update_production_spec",
]);

async function requireSuperAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function requireWorld(tx: Tx, worldId: string): Promise<{ id: string; code: string }> {
  const [world] = await tx.select({ id: worldsmithWorldsTable.id, code: worldsmithWorldsTable.code })
    .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId)).for("update").limit(1);
  if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
  return world;
}

async function validateLinks(tx: Tx, spec: Partial<InsertWsProductionSpec>): Promise<void> {
  if (!spec.worldId) throw new CanonToolError("World is required.", 422, "LINKED_RECORD_NOT_FOUND");
  const canonIds = [...new Set(spec.canonRecordIds ?? [])];
  const moduleIds = [...new Set(spec.promptModuleIds ?? [])];
  const [
    collections, volumes, styleGuides, componentSpecs, canonRecords, promptModules,
  ]: [
    Array<{ id: string; worldId: string }>,
    Array<{ id: string; worldId: string }>,
    Array<{ id: string; worldId: string }>,
    Array<{ id: string; worldId: string }>,
    Array<{ id: string; worldId: string }>,
    Array<{ id: string; worldId: string }>,
  ] = await Promise.all([
    spec.collectionId ? tx.select({ id: wsCollectionsTable.id, worldId: wsCollectionsTable.worldId })
      .from(wsCollectionsTable).where(eq(wsCollectionsTable.id, spec.collectionId)).limit(1) : Promise.resolve([]),
    spec.volumeId ? tx.select({ id: wsVolumesTable.id, worldId: wsVolumesTable.worldId })
      .from(wsVolumesTable).where(eq(wsVolumesTable.id, spec.volumeId)).limit(1) : Promise.resolve([]),
    spec.styleGuideId ? tx.select({ id: wsStyleGuidesTable.id, worldId: wsStyleGuidesTable.worldId })
      .from(wsStyleGuidesTable).where(eq(wsStyleGuidesTable.id, spec.styleGuideId)).limit(1) : Promise.resolve([]),
    spec.componentSpecId ? tx.select({ id: wsComponentSpecsTable.id, worldId: wsComponentSpecsTable.worldId })
      .from(wsComponentSpecsTable).where(eq(wsComponentSpecsTable.id, spec.componentSpecId)).limit(1) : Promise.resolve([]),
    canonIds.length ? tx.select({ id: wsCanonRecordsTable.id, worldId: wsCanonRecordsTable.worldId })
      .from(wsCanonRecordsTable).where(inArray(wsCanonRecordsTable.id, canonIds)) : Promise.resolve([]),
    moduleIds.length ? tx.select({ id: wsPromptModulesTable.id, worldId: wsPromptModulesTable.worldId })
      .from(wsPromptModulesTable).where(inArray(wsPromptModulesTable.id, moduleIds)) : Promise.resolve([]),
  ]);
  for (const [label, value, record] of [
    ["Collection", spec.collectionId, collections[0]],
    ["Volume", spec.volumeId, volumes[0]],
    ["Style guide", spec.styleGuideId, styleGuides[0]],
    ["Component spec", spec.componentSpecId, componentSpecs[0]],
  ] as const) {
    if (value && (!record || record.worldId !== spec.worldId)) {
      throw new CanonToolError(`${label} must exist and belong to the selected world.`, 422, "LINKED_RECORD_NOT_FOUND");
    }
  }
  if (canonRecords.length !== canonIds.length || canonRecords.some(record => record.worldId !== spec.worldId)) {
    throw new CanonToolError("Every canon record must exist and belong to the selected world.", 422, "LINKED_RECORD_NOT_FOUND");
  }
  if (promptModules.length !== moduleIds.length || promptModules.some(record => record.worldId !== spec.worldId)) {
    throw new CanonToolError("Every prompt module must exist and belong to the selected world.", 422, "LINKED_RECORD_NOT_FOUND");
  }
}

const typeAbbreviations: Record<string, string> = {
  "Hero Paper": "HRP", "Decorative Paper": "DCP", "Journal Card": "JRC",
  "Coordinating Paper": "CDP", "Ephemera Sheet": "EPH", Notepaper: "NTP",
  Endpaper: "ENP", "Washi Tape": "WSH",
};

async function generateSpecId(tx: Tx, worldId: string, worldCode: string, componentType: string): Promise<string> {
  const [{ count: total }] = await tx.select({ count: sql<number>`count(*)::int` })
    .from(wsProductionSpecsTable).where(and(
      eq(wsProductionSpecsTable.worldId, worldId),
      eq(wsProductionSpecsTable.componentType, componentType),
    ));
  const prefix = typeAbbreviations[componentType] ?? componentType.slice(0, 3).toUpperCase();
  return `${worldCode.toUpperCase()}-${prefix}-${String((total ?? 0) + 1).padStart(3, "0")}`;
}

function mapInputFields(input: Record<string, unknown>, draftCreate = false): Partial<InsertWsProductionSpec> {
  const result: Record<string, unknown> = {};
  const mapping: Record<string, string> = {
    production_item: "productionItem", spec_id: "specId", component_type: "componentType",
    component_set: "componentSet", design_intent: "designIntent", narrative_purpose: "narrativePurpose",
    required_content: "requiredContent", review_criteria: "reviewCriteria",
    writing_space_percent: "writingSpacePercent", orientation: "orientation",
    front_back_style: "frontBackStyle", canon_dependency: "canonDependency",
    canon_record_ids: "canonRecordIds", payload_version: "payloadVersion",
    prompt_payload: "promptPayload", style_guide_id: "styleGuideId",
    component_spec_id: "componentSpecId", prompt_module_ids: "promptModuleIds",
    collection_id: "collectionId", volume_id: "volumeId",
  };
  for (const [external, internal] of Object.entries(mapping)) {
    if (input[external] === undefined) continue;
    let value = input[external];
    if (["production_item", "spec_id", "component_type", "component_set", "orientation", "front_back_style",
      "payload_version", "style_guide_id", "component_spec_id", "collection_id", "volume_id"].includes(external)) {
      value = typeof value === "string" ? value.trim() || null : value;
    } else if (["design_intent", "narrative_purpose", "required_content", "review_criteria"].includes(external)) {
      value = sanitizeEditorialRichText(typeof value === "string" ? value : "");
    } else if (external === "canon_dependency") {
      value = typeof value === "string" ? value.trim() || "None" : value;
    } else if (["canon_record_ids", "prompt_module_ids"].includes(external)) {
      value = value ?? [];
    } else if (external === "prompt_payload") {
      value = value ?? "";
    }
    result[internal] = value;
  }
  if (draftCreate) {
    result.designIntent ??= "";
    result.narrativePurpose ??= "";
    result.requiredContent ??= "";
    result.reviewCriteria ??= "";
    result.promptPayload ??= "";
    result.canonDependency ??= "None";
    result.canonRecordIds ??= [];
    result.promptModuleIds ??= [];
  }
  return result as Partial<InsertWsProductionSpec>;
}

async function insertAudit(
  tx: Tx,
  userId: string,
  action: "create" | "update",
  specId: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await tx.insert(auditLogTable).values({
    actorUserId: userId,
    actorRole: "super_admin",
    scope: "platform",
    action: `worldsmith.editorial.production_spec.${action}`,
    targetType: "worldsmith_production_spec",
    targetId: specId,
    metadata: { actor_user_id: userId, changes },
  });
}

function parseArgs<T extends ToolName>(name: T, args: unknown): z.infer<(typeof argsSchemas)[T]> {
  const parsed = argsSchemas[name].safeParse(args);
  if (!parsed.success) throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  return parsed.data as z.infer<(typeof argsSchemas)[T]>;
}

function conflict(expected: string, current: Record<string, unknown>): never {
  throw new CanonToolError(
    `Revision conflict: expected ${expected}, current revision is ${revisionFor(current)}`,
    409, "REVISION_CONFLICT",
  );
}

export async function executeProductionSpecTool(userId: string, name: string, args: unknown): Promise<unknown> {
  await requireSuperAdmin(userId);
  if (!Object.hasOwn(argsSchemas, name)) {
    throw new CanonToolError(`Unknown production spec tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
  switch (name as ToolName) {
    case "list_production_specs": {
      const input = parseArgs("list_production_specs", args);
      const [world] = await db.select({ id: worldsmithWorldsTable.id }).from(worldsmithWorldsTable)
        .where(eq(worldsmithWorldsTable.id, input.world_id)).limit(1);
      if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
      const conditions = [eq(wsProductionSpecsTable.worldId, input.world_id)];
      if (input.status) conditions.push(eq(wsProductionSpecsTable.status, input.status));
      const rows = await db.select().from(wsProductionSpecsTable).where(and(...conditions))
        .orderBy(desc(wsProductionSpecsTable.updatedAt));
      const [previews, packages] = rows.length ? await Promise.all([
        db.select({
          specPageId: worldsmithSpecPreviewsTable.specPageId,
          previewObjectPath: worldsmithSpecPreviewsTable.previewObjectPath,
        }).from(worldsmithSpecPreviewsTable).where(and(
          inArray(worldsmithSpecPreviewsTable.specPageId, rows.map(row => row.id)),
          eq(worldsmithSpecPreviewsTable.status, "success"),
          eq(worldsmithSpecPreviewsTable.dryRun, false),
        )).orderBy(desc(worldsmithSpecPreviewsTable.createdAt)),
        db.select({ productionSpecId: worldsmithProductionPackagesTable.productionSpecId })
          .from(worldsmithProductionPackagesTable).where(and(
            inArray(worldsmithProductionPackagesTable.productionSpecId, rows.map(row => row.id)),
            eq(worldsmithProductionPackagesTable.status, "success"),
          )),
      ]) : [[], []];
      const latestPreview = new Map<string, string>();
      for (const preview of previews) {
        if (preview.previewObjectPath && !latestPreview.has(preview.specPageId)) {
          latestPreview.set(preview.specPageId, preview.previewObjectPath);
        }
      }
      const finalArtworkIds = new Set(packages.map(row => row.productionSpecId));
      return {
        specs: rows.map(row => ({
          ...row,
          previewUrl: latestPreview.has(row.id) ? `/api/storage${latestPreview.get(row.id)}` : null,
          finalArtworkGenerated: finalArtworkIds.has(row.id),
        })),
      };
    }
    case "get_production_spec": {
      const input = parseArgs("get_production_spec", args);
      const [spec] = await db.select().from(wsProductionSpecsTable).where(and(
        eq(wsProductionSpecsTable.id, input.spec_id),
        eq(wsProductionSpecsTable.worldId, input.world_id),
      )).limit(1);
      if (!spec) throw new CanonToolError("Production Spec not found in this world", 404, "SPEC_NOT_FOUND");
      const [collection, volume, styleGuide, componentSpec, canonRecords, promptModules] = await Promise.all([
        spec.collectionId ? db.select({ id: wsCollectionsTable.id, name: wsCollectionsTable.name })
          .from(wsCollectionsTable).where(eq(wsCollectionsTable.id, spec.collectionId)).limit(1) : [],
        spec.volumeId ? db.select({ id: wsVolumesTable.id, name: wsVolumesTable.name, code: wsVolumesTable.code })
          .from(wsVolumesTable).where(eq(wsVolumesTable.id, spec.volumeId)).limit(1) : [],
        spec.styleGuideId ? db.select().from(wsStyleGuidesTable).where(eq(wsStyleGuidesTable.id, spec.styleGuideId)).limit(1) : [],
        spec.componentSpecId ? db.select().from(wsComponentSpecsTable).where(eq(wsComponentSpecsTable.id, spec.componentSpecId)).limit(1) : [],
        spec.canonRecordIds.length ? db.select().from(wsCanonRecordsTable)
          .where(inArray(wsCanonRecordsTable.id, spec.canonRecordIds)) : [],
        spec.promptModuleIds.length ? db.select().from(wsPromptModulesTable)
          .where(inArray(wsPromptModulesTable.id, spec.promptModuleIds)) : [],
      ]);
      return {
        spec,
        revision: revisionFor(spec),
        relationships: {
          collection: collection[0] ?? null, volume: volume[0] ?? null,
          style_guide: styleGuide[0] ?? null, component_spec: componentSpec[0] ?? null,
          canon_records: canonRecords, prompt_modules: promptModules,
        },
      };
    }
    case "create_production_spec": {
      const input = parseArgs("create_production_spec", args);
      const draft = input.draft === true;
      if (!draft && (!input.production_item?.trim() || !input.component_type?.trim())) {
        throw new CanonToolError("world_id, production_item, and component_type are required", 400, "INCOMPLETE_IDENTITY");
      }
      return db.transaction(async tx => {
        const world = await requireWorld(tx, input.world_id);
        const partial = mapInputFields(input as Record<string, unknown>, draft);
        partial.worldId = input.world_id;
        partial.wizardStep = input.wizard_step ?? 0;
        partial.wizardComplete = !draft;
        if (!partial.specId && partial.productionItem?.trim() && partial.componentType?.trim()) {
          partial.specId = await generateSpecId(tx, input.world_id, world.code, partial.componentType);
        }
        await validateLinks(tx, partial);
        const score = readinessScore(readinessChecks(partial));
        const dependency = partial.canonDependency ?? "None";
        const canonIds = partial.canonRecordIds ?? [];
        const checks = readinessChecks(partial);
        const status = (dependency === "Canon Reference" || dependency === "Canon Defining") && !canonIds.length
          ? "blocked"
          : !partial.productionItem?.trim() || !partial.componentType?.trim() || !(partial.promptPayload ?? "").trim()
            ? "draft"
            : payloadReady(checks) && canonClear(checks) ? "canon_clear"
              : payloadReady(checks) ? "payload_ready" : "draft";
        const [spec] = await tx.insert(wsProductionSpecsTable).values({
          id: input.record_id, ...partial, status, readinessScore: score, createdBy: userId,
        } as InsertWsProductionSpec).onConflictDoNothing({
          target: wsProductionSpecsTable.id,
        }).returning();
        if (!spec) {
          throw new CanonToolError(
            `Production Spec record_id "${input.record_id}" already exists`,
            409,
            "RECORD_ID_EXISTS",
          );
        }
        await insertAudit(tx, userId, "create", spec.id, { created: spec });
        return { spec, revision: revisionFor(spec) };
      });
    }
    case "update_production_spec": {
      const input = parseArgs("update_production_spec", args);
      return db.transaction(async tx => {
        const [existing] = await tx.select().from(wsProductionSpecsTable).where(and(
          eq(wsProductionSpecsTable.id, input.spec_id),
          eq(wsProductionSpecsTable.worldId, input.world_id),
        )).for("update").limit(1);
        if (!existing) throw new CanonToolError("Production Spec not found in this world", 404, "SPEC_NOT_FOUND");
        if (revisionFor(existing) !== input.expected_revision) conflict(input.expected_revision, existing);
        const draft = existing.wizardComplete !== true;
        const changes = input.changes as Record<string, unknown>;
        if (!Object.keys(changes).some(key => key !== "finalize")) {
          throw new CanonToolError(
            draft ? "No draft fields provided." : "No editable fields provided.",
            400, "NO_MUTABLE_FIELDS",
          );
        }
        if (!draft && (changes.canon_dependency !== undefined || changes.wizard_step !== undefined || changes.finalize !== undefined)) {
          throw new CanonToolError("Wizard-only fields cannot be changed after a Production Spec is complete", 400, "INVALID_CHANGES");
        }
        const mutable = mapInputFields(changes);
        if (!draft && changes.wizard_step !== undefined) {
          throw new CanonToolError("wizard_step is only editable on a draft", 400, "INVALID_CHANGES");
        }
        if (draft && changes.wizard_step !== undefined) mutable.wizardStep = changes.wizard_step as number;
        const merged = { ...existing, ...mutable } as typeof existing;
        if (!draft && (!merged.productionItem?.trim() || !merged.componentType?.trim())) {
          throw new CanonToolError("production_item and component_type are required for a completed spec", 400, "INCOMPLETE_IDENTITY");
        }
        await validateLinks(tx, merged);
        if (draft && changes.finalize === true) {
          if (!merged.productionItem?.trim() || !merged.componentType?.trim()) {
            throw new CanonToolError("production_item and component_type are required to finish a draft", 400, "INCOMPLETE_IDENTITY");
          }
          if (!merged.specId) {
            const world = await requireWorld(tx, merged.worldId);
            mutable.specId = await generateSpecId(tx, merged.worldId, world.code, merged.componentType);
            merged.specId = mutable.specId;
          }
          mutable.wizardComplete = true;
          merged.wizardComplete = true;
        }
        const score = readinessScore(readinessChecks(merged));
        const inputColumns = new Set([
          "productionItem", "componentType", "componentSet", "designIntent", "narrativePurpose",
          "requiredContent", "reviewCriteria", "writingSpacePercent", "orientation", "frontBackStyle",
          "promptPayload", "payloadVersion", "collectionId", "volumeId", "canonRecordIds",
          "promptModuleIds", "styleGuideId", "componentSpecId",
        ]);
        const inputChanged = Object.keys(mutable).some(key => inputColumns.has(key)
          && JSON.stringify(existing[key as keyof typeof existing]) !== JSON.stringify(merged[key as keyof typeof merged]));
        const compiled = existing.compiledPromptStatus.trim().toLowerCase() === "compiled"
          || ["compiled", "approved", "published"].includes(existing.status.trim().toLowerCase());
        const compilationAlreadyPending = existing.compiledPromptStatus.trim().toLowerCase() === "recompile required"
          && existing.status.trim().toLowerCase() === "changes_pending";
        const recompileRequired = !draft && (compilationAlreadyPending || (compiled && inputChanged));
        let status: string;
        if (recompileRequired) status = "changes_pending";
        else {
          const dep = merged.canonDependency ?? "None";
          const canonIds = merged.canonRecordIds ?? [];
          const checks = readinessChecks(merged);
          status = (dep === "Canon Reference" || dep === "Canon Defining") && !canonIds.length
            ? "blocked"
            : merged.notionPageId && merged.syncedAt ? "published"
              : merged.compiledPromptStatus === "Compiled" ? "compiled"
                : !merged.productionItem?.trim() || !merged.componentType?.trim() || !merged.promptPayload.trim()
                  ? "draft" : payloadReady(checks) && canonClear(checks) ? "canon_clear"
                    : payloadReady(checks) ? "payload_ready" : "draft";
        }
        const [updated] = await tx.update(wsProductionSpecsTable).set({
          ...mutable,
          readinessScore: score,
          status: !recompileRequired && ["approved", "published"].includes(existing.status.trim().toLowerCase())
            ? existing.status.trim().toLowerCase() : status,
          ...(recompileRequired ? { compiledPromptStatus: "Recompile Required" } : {}),
          updatedAt: new Date(),
        }).where(eq(wsProductionSpecsTable.id, existing.id)).returning();
        const diff = Object.fromEntries(Object.keys(mutable).map(key => [
          key, { before: existing[key as keyof typeof existing] ?? null, after: mutable[key as keyof typeof mutable] },
        ]));
        await insertAudit(tx, userId, "update", existing.id, diff);
        return {
          spec: updated, revision: revisionFor(updated), diff,
          recompile_required: recompileRequired, previous_compilation_preserved: recompileRequired,
        };
      });
    }
  }
}