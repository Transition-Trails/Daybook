import { and, asc, eq, gt } from "drizzle-orm";
import {
  auditLogTable, db, usersTable, worldsmithWorldsTable,
  wsCollectionsTable, wsVolumesTable, wsStyleGuidesTable, wsComponentSpecsTable,
  wsProductionProfilesTable, wsPunchTemplatesTable, wsPromptModulesTable,
} from "@workspace/db";
import { z } from "zod";
import { CanonToolError } from "./mcp-canon";
import { revisionFor } from "./editorial-revision";
import { sanitizeEditorialRichText } from "./editorial-rich-text";
import { resolveTypographyChoices, TypographyValidationError } from "./typography";

const id = z.string().trim().min(1).max(200);
const text = (max: number, required = false) => z.string().max(max).refine(
  value => !required || value.trim().length > 0, "must not be blank",
);
const nullableNumber = z.number().finite().nullable();
const jsonDependencies = z.array(id).max(100);
const collectionFields = {
  name: text(500, true).optional(), season: text(200).nullable().optional(),
  year: z.number().int().min(0).max(9999).nullable().optional(), description: text(10_000).optional(),
};
const volumeFields = {
  collection_id: id.nullable().optional(), name: text(500, true).optional(),
  code: text(100).nullable().optional(), description: text(10_000).optional(),
};
const styleFields = {
  name: text(500, true).optional(), content: text(20_000).optional(),
  typography: z.array(z.object({ fontId: id }).strict()).max(100).optional(),
};
const componentFields = {
  name: text(500, true).optional(),
  content: text(20_000).optional(), production_profile_id: id.nullable().optional(),
};
const profileFields = {
  name: text(500, true).optional(), code: text(100, true).optional(),
  outputMedium: z.enum(["digital", "print"]).optional(),
  finishedWidth: nullableNumber.optional(), finishedHeight: nullableNumber.optional(),
  units: z.enum(["inches", "millimeters"]).optional(),
  orientationBehavior: z.enum(["fixed_portrait", "fixed_landscape", "supports_both", "square"]).optional(),
  bleed: z.number().finite().min(0).optional(), outerSafeMargin: z.number().finite().min(0).optional(),
  bindingType: z.enum(["none", "disc_bound"]).optional(),
  bindingSafeZone: z.number().finite().min(0).optional(),
  bindingEdgeBehavior: z.enum(["none", "left", "right", "mirrored"]).optional(),
  punchTemplateId: id.nullable().optional(),
};
const punchFields = {
  name: text(500, true).optional(), code: text(100, true).optional(),
  bindingType: z.literal("disc_bound").optional(), units: z.enum(["inches", "millimeters"]).optional(),
  discCount: z.number().int().positive().max(1000).nullable().optional(),
  referencePageHeight: z.number().finite().min(0).nullable().optional(),
  punchCenterSpacing: z.number().finite().min(0).nullable().optional(),
  edgeOffset: z.number().finite().min(0).nullable().optional(),
  mushroomHeadDiameter: z.number().finite().min(0).nullable().optional(),
  stemWidth: z.number().finite().min(0).nullable().optional(),
  stemDepth: z.number().finite().min(0).nullable().optional(),
  topOffset: z.number().finite().min(0).nullable().optional(),
  bottomOffset: z.number().finite().min(0).nullable().optional(),
  manufacturingTolerance: z.number().finite().min(0).nullable().optional(),
  version: z.number().int().positive().max(100_000).optional(),
};
const promptFields = {
  name: text(500, true).optional(), content: text(20_000).optional(),
  dependency_ids: jsonDependencies.optional(), section: z.enum(["world", "style", "general"]).optional(),
};
const specs = {
  collections: { table: wsCollectionsTable, singular: "collection", world: true },
  volumes: { table: wsVolumesTable, singular: "volume", world: true },
  style_guides: { table: wsStyleGuidesTable, singular: "style_guide", world: true },
  component_specs: { table: wsComponentSpecsTable, singular: "component_spec", world: true },
  production_profiles: { table: wsProductionProfilesTable, singular: "production_profile", world: false },
  punch_templates: { table: wsPunchTemplatesTable, singular: "punch_template", world: false },
  prompt_modules: { table: wsPromptModulesTable, singular: "prompt_module", world: true },
} as const;
type Catalog = keyof typeof specs;
type Tool = { name: string; description: string; inputSchema: Record<string, unknown> };

const textField = (maxLength: number, minLength?: number) => ({
  type: "string", maxLength, ...(minLength ? { minLength } : {}),
});
const obj = (properties: Record<string, unknown>, required: string[] = [], minProperties?: number) => ({
  type: "object", properties, ...(required.length ? { required } : {}),
  ...(minProperties ? { minProperties } : {}), additionalProperties: false,
});
const sharedChangeProps = {
  collection: { name: textField(500, 1), season: { anyOf: [textField(200), { type: "null" }] }, year: { anyOf: [{ type: "integer", minimum: 0, maximum: 9999 }, { type: "null" }] }, description: textField(10_000) },
  volume: { collection_id: { anyOf: [textField(200, 1), { type: "null" }] }, name: textField(500, 1), code: { anyOf: [textField(100), { type: "null" }] }, description: textField(10_000) },
  style_guide: { name: textField(500, 1), content: textField(20_000), typography: { type: "array", maxItems: 100, items: obj({ fontId: textField(200, 1) }, ["fontId"]) } },
  component_spec: { name: textField(500, 1), content: textField(20_000), production_profile_id: { anyOf: [textField(200, 1), { type: "null" }] } },
  production_profile: {
    name: textField(500, 1), code: textField(100, 1), outputMedium: { enum: ["digital", "print"] },
    finishedWidth: { anyOf: [{ type: "number" }, { type: "null" }] }, finishedHeight: { anyOf: [{ type: "number" }, { type: "null" }] },
    units: { enum: ["inches", "millimeters"] }, orientationBehavior: { enum: ["fixed_portrait", "fixed_landscape", "supports_both", "square"] },
    bleed: { type: "number", minimum: 0 }, outerSafeMargin: { type: "number", minimum: 0 },
    bindingType: { enum: ["none", "disc_bound"] }, bindingSafeZone: { type: "number", minimum: 0 },
    bindingEdgeBehavior: { enum: ["none", "left", "right", "mirrored"] }, punchTemplateId: { anyOf: [textField(200, 1), { type: "null" }] },
  },
  punch_template: {
    name: textField(500, 1), code: textField(100, 1), bindingType: { enum: ["disc_bound"] }, units: { enum: ["inches", "millimeters"] },
    discCount: { anyOf: [{ type: "integer", minimum: 1, maximum: 1000 }, { type: "null" }] },
    referencePageHeight: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    punchCenterSpacing: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    edgeOffset: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    mushroomHeadDiameter: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    stemWidth: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    stemDepth: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    topOffset: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    bottomOffset: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    manufacturingTolerance: { anyOf: [{ type: "number", minimum: 0 }, { type: "null" }] },
    version: { type: "integer", minimum: 1, maximum: 100_000 },
  },
  prompt_module: { name: textField(500, 1), content: textField(20_000), dependency_ids: { type: "array", items: textField(200, 1), maxItems: 100 }, section: { enum: ["world", "style", "general"] } },
};
const propertiesFor = (kind: Catalog, create = false) => kind === "component_specs" && create
  ? { ...sharedChangeProps.component_spec, component_type: textField(200, 1) }
  : sharedChangeProps[specs[kind].singular as keyof typeof sharedChangeProps];
const schemas: Record<string, z.ZodTypeAny> = {};
export const PRODUCTION_CATALOG_TOOLS: Tool[] = [];
for (const kind of Object.keys(specs) as Catalog[]) {
  const config = specs[kind];
  const singular = config.singular;
  const isWorld = config.world;
  const baseProps: Record<string, z.ZodTypeAny> = isWorld ? { world_id: id } : {};
  const jsonBaseProps = isWorld ? { world_id: textField(200, 1) } : {};
  const changesSchema = kind === "collections" ? collectionFields
    : kind === "volumes" ? volumeFields
      : kind === "style_guides" ? styleFields
        : kind === "component_specs" ? componentFields
          : kind === "production_profiles" ? profileFields
            : kind === "punch_templates" ? punchFields : promptFields;
  schemas[`list_${kind}`] = z.object(isWorld
    ? { world_id: id, after_id: id.optional(), limit: z.number().int().min(1).max(100).optional() }
    : { after_id: id.optional(), limit: z.number().int().min(1).max(100).optional() }).strict();
  schemas[`get_${singular}`] = z.object({ id, ...baseProps }).strict();
  const createFields = kind === "collections" ? { ...collectionFields, name: text(500, true) }
    : kind === "volumes" ? { ...volumeFields, name: text(500, true), collection_id: id.nullable().optional() }
      : kind === "style_guides" ? { ...styleFields, name: text(500, true) }
        : kind === "component_specs" ? { ...componentFields, name: text(500, true), component_type: text(200, true) }
          : kind === "production_profiles" ? { ...profileFields, name: text(500, true), code: text(100, true), outputMedium: z.enum(["digital", "print"]), orientationBehavior: z.enum(["fixed_portrait", "fixed_landscape", "supports_both", "square"]) }
            : kind === "punch_templates" ? { ...punchFields, name: text(500, true), code: text(100, true) }
              : { ...promptFields, name: text(500, true) };
  schemas[`create_${singular}`] = z.object({
    record_id: z.string().uuid(),
    ...baseProps,
    ...createFields,
  }).strict();
  schemas[`update_${singular}`] = z.object({
    id, ...(isWorld ? { world_id: id } : {}), expected_revision: z.string().min(1).max(100),
    changes: z.object(changesSchema).strict().refine(value => Object.keys(value).length > 0, "changes must include at least one field"),
  }).strict();
  const readSchema = obj({ ...jsonBaseProps, after_id: textField(200, 1), limit: { type: "integer", minimum: 1, maximum: 100 } }, isWorld ? ["world_id"] : []);
  PRODUCTION_CATALOG_TOOLS.push(
    { name: `list_${kind}`, description: `List ${kind.replaceAll("_", " ")} in stable ID order using after_id and limit (maximum 100)${isWorld ? " within the specified world" : ""}.`, inputSchema: readSchema },
    { name: `get_${singular}`, description: `Read one ${singular}${isWorld ? " in the specified world" : ""}, including its revision.`, inputSchema: obj({ id: textField(200, 1), ...jsonBaseProps }, isWorld ? ["id", "world_id"] : ["id"]) },
    { name: `create_${singular}`, description: `Create a ${singular}${isWorld ? " in the specified world" : ""} using the client-supplied UUID record_id, making retries safe. Workflow status is not set by this tool.`, inputSchema: obj({ record_id: { type: "string", format: "uuid", minLength: 36, maxLength: 36 }, ...jsonBaseProps, ...propertiesFor(kind, true) }, ["record_id", ...(isWorld ? ["world_id"] : []), ...(kind === "volumes" ? ["name"] : kind === "component_specs" ? ["name", "component_type"] : kind === "production_profiles" || kind === "punch_templates" ? ["name", "code"] : ["name"])]) },
    { name: `update_${singular}`, description: `Update whitelisted ${singular} fields at expected_revision; status and publishing transitions are not exposed.`, inputSchema: obj({ id: textField(200, 1), ...(isWorld ? { world_id: textField(200, 1) } : {}), expected_revision: textField(100, 1), changes: obj(propertiesFor(kind), [], 1) }, ["id", ...(isWorld ? ["world_id"] : []), "expected_revision", "changes"]) },
  );
}
export const PRODUCTION_CATALOG_WRITE_TOOLS = new Set<string>(
  PRODUCTION_CATALOG_TOOLS.filter(tool => tool.name.startsWith("create_") || tool.name.startsWith("update_")).map(tool => tool.name),
);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function requireAdmin(userId: string) {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("Global production catalog resources require a current super-admin account", 403, "FORBIDDEN");
}
async function requireWorld(tx: Tx, worldId: string, lock = false): Promise<void> {
  let query = tx.select({ id: worldsmithWorldsTable.id })
    .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
  const [world] = await (lock ? query.for("update") : query).limit(1);
  if (!world) throw new CanonToolError("World not found", 404, "WORLD_NOT_FOUND");
}
function failValidation(message: string): never {
  throw new CanonToolError(message, 400, "INVALID_ARGUMENTS");
}
function conflict(expected: string, row: Record<string, unknown>): never {
  throw new CanonToolError(`Revision conflict: expected ${expected}, current revision is ${revisionFor(row)}`, 409, "REVISION_CONFLICT");
}
function duplicateRecordId(recordId: string): never {
  throw new CanonToolError(`Record ID "${recordId}" already exists; use get by ID to inspect the existing record`, 409, "RECORD_ID_CONFLICT");
}
function validateProfile(v: Record<string, any>) {
  if (typeof v.name !== "string" || !v.name.trim()) return "name is required";
  if (typeof v.code !== "string" || !v.code.trim()) return "code is required";
  if (!["draft", "active", "archived"].includes(v.status)) return "status is invalid";
  if (!v.outputMedium || !v.orientationBehavior) return "outputMedium and orientationBehavior are required";
  if (!["digital", "print"].includes(v.outputMedium)) return "outputMedium is invalid";
  if (!["inches", "millimeters"].includes(v.units)) return "units is invalid";
  if (!["fixed_portrait", "fixed_landscape", "supports_both", "square"].includes(v.orientationBehavior)) return "orientationBehavior is invalid";
  if (!["none", "disc_bound"].includes(v.bindingType)) return "bindingType is invalid";
  if (!["none", "left", "right", "mirrored"].includes(v.bindingEdgeBehavior)) return "bindingEdgeBehavior is invalid";
  for (const field of ["finishedWidth", "finishedHeight"]) if (v[field] != null && (!Number.isFinite(Number(v[field])) || Number(v[field]) <= 0)) return `${field} must be positive`;
  for (const field of ["bleed", "outerSafeMargin", "bindingSafeZone"]) if (v[field] != null && (!Number.isFinite(Number(v[field])) || Number(v[field]) < 0)) return `${field} must be nonnegative`;
  if (v.outputMedium === "print" && (v.finishedWidth == null || v.finishedHeight == null)) return "print profiles require dimensions";
  if (v.bindingType === "disc_bound" && !(Number(v.bindingSafeZone) > 0)) return "disc-bound profiles require a positive bindingSafeZone";
  if (v.bindingType === "disc_bound" && v.bindingEdgeBehavior === "none") return "disc-bound profiles require a binding edge behavior";
  if (v.bindingType === "none" && (Number(v.bindingSafeZone) !== 0 || v.bindingEdgeBehavior !== "none")) return "unbound profiles cannot have a binding zone or binding edge";
  if (v.outputMedium === "digital" && v.punchTemplateId != null) return "digital profiles cannot have a punch template";
  if (v.bindingType !== "disc_bound" && v.punchTemplateId != null) return "only disc-bound profiles can have a punch template";
  if (v.finishedWidth != null && v.finishedHeight != null) {
    const margin = Number(v.outerSafeMargin ?? 0);
    const bindingInset = v.bindingType === "disc_bound" ? Math.max(margin, Number(v.bindingSafeZone ?? 0)) : margin;
    if (Number(v.finishedWidth) - margin - bindingInset <= 0 || Number(v.finishedHeight) - 2 * margin <= 0) return "margins must leave positive usable dimensions";
  }
  return null;
}
function validatePunch(v: Record<string, any>) {
  if (!v.name?.trim()) return "name is required";
  if (!v.code?.trim()) return "code is required";
  if (v.bindingType !== "disc_bound") return "bindingType is invalid";
  if (!["draft", "testing", "approved", "archived"].includes(v.status)) return "status is invalid";
  if (!["inches", "millimeters"].includes(v.units)) return "units is invalid";
  for (const field of ["referencePageHeight", "punchCenterSpacing", "edgeOffset", "mushroomHeadDiameter", "stemWidth", "stemDepth", "topOffset", "bottomOffset", "manufacturingTolerance"]) {
    if (v[field] != null && (!Number.isFinite(Number(v[field])) || Number(v[field]) < 0)) return `${field} must be nonnegative`;
  }
  for (const field of ["discCount", "version"]) if (v[field] != null && (!Number.isInteger(Number(v[field])) || Number(v[field]) <= 0)) return `${field} must be a positive integer`;
  return null;
}
function fromInput(kind: Catalog, values: Record<string, any>) {
  if (kind === "volumes") return {
    ...(values.name !== undefined ? { name: values.name.trim() } : {}),
    ...(values.collection_id !== undefined ? { collectionId: values.collection_id || null } : {}),
    ...(values.code !== undefined ? { code: values.code?.trim() || null } : {}),
    ...(values.description !== undefined ? { description: values.description } : {}),
  };
  if (kind === "component_specs") return {
    ...(values.name !== undefined ? { name: values.name.trim() } : {}),
    ...(values.component_type !== undefined ? { componentType: values.component_type } : {}),
    ...(values.content !== undefined ? { content: values.content } : {}),
    ...(values.production_profile_id !== undefined ? { productionProfileId: values.production_profile_id } : {}),
  };
  if (kind === "prompt_modules") return {
    ...(values.name !== undefined ? { name: values.name.trim() } : {}),
    ...(values.content !== undefined ? { content: sanitizeEditorialRichText(values.content) } : {}),
    ...(values.section !== undefined ? { section: values.section } : {}),
    ...(values.dependency_ids !== undefined ? { dependencyIds: values.dependency_ids } : {}),
  };
  if (kind === "collections") return {
    ...(values.name !== undefined ? { name: values.name.trim() } : {}),
    ...(values.season !== undefined ? { season: values.season } : {}),
    ...(values.year !== undefined ? { year: values.year } : {}),
    ...(values.description !== undefined ? { description: values.description } : {}),
  };
  if (kind === "style_guides") return {
    ...(values.name !== undefined ? { name: values.name.trim() } : {}),
    ...(values.content !== undefined ? { content: sanitizeEditorialRichText(values.content) } : {}),
    ...(values.typography !== undefined ? { typography: values.typography } : {}),
  };
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value]));
}
function defaults(kind: Catalog, values: Record<string, any>) {
  if (kind === "collections") return { description: "", ...values };
  if (kind === "volumes") return { collectionId: null, code: null, description: "", ...values };
  if (kind === "style_guides") return { content: "", typography: [], ...values };
  if (kind === "component_specs") return { content: "", productionProfileId: null, ...values };
  if (kind === "prompt_modules") return { section: "general", content: "", dependencyIds: [], ...values };
  if (kind === "production_profiles") return {
    status: "draft", units: "inches", bleed: 0, outerSafeMargin: 0, bindingType: "none",
    bindingSafeZone: 0, bindingEdgeBehavior: "none", ...values,
  };
  return { bindingType: "disc_bound", status: "draft", units: "inches", version: 1, ...values };
}
async function ensureLinks(tx: Tx, kind: Catalog, values: Record<string, any>, worldId?: string) {
  if (kind === "volumes" && values.collection_id) {
    const [collection] = await tx.select({ id: wsCollectionsTable.id }).from(wsCollectionsTable)
      .where(and(eq(wsCollectionsTable.id, values.collection_id), eq(wsCollectionsTable.worldId, worldId!))).limit(1);
    if (!collection) failValidation("collection_id must belong to world_id");
  }
  if (kind === "component_specs" && values.production_profile_id) {
    const [profile] = await tx.select({ id: wsProductionProfilesTable.id }).from(wsProductionProfilesTable)
      .where(eq(wsProductionProfilesTable.id, values.production_profile_id)).limit(1);
    if (!profile) failValidation("production_profile_id is invalid");
  }
  if (kind === "production_profiles" && values.punchTemplateId) {
    const [template] = await tx.select().from(wsPunchTemplatesTable).where(eq(wsPunchTemplatesTable.id, values.punchTemplateId)).limit(1);
    if (!template) failValidation("punchTemplateId is invalid");
    return template;
  }
  return null;
}
async function audit(tx: Tx, userId: string, actorRole: string, kind: Catalog, idValue: string, action: "create" | "update", diff: Record<string, unknown>) {
  await tx.insert(auditLogTable).values({
    actorUserId: userId, actorRole, scope: "platform",
    action: `worldsmith.production_catalog.${kind}.${action}`,
    targetType: `worldsmith_${kind}`, targetId: idValue,
    metadata: { actor_user_id: userId, before_after: diff },
  });
}
function parseTool<T>(name: string, args: unknown): T {
  const schema = schemas[name];
  if (!schema) throw new CanonToolError(`Unknown production catalog tool "${name}"`, 404, "UNKNOWN_TOOL");
  const parsed = schema.safeParse(args);
  if (!parsed.success) throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  return parsed.data as T;
}

export async function executeProductionCatalogTool(userId: string, name: string, args: unknown): Promise<unknown> {
  if (!schemas[name]) throw new CanonToolError(`Unknown production catalog tool "${name}"`, 404, "UNKNOWN_TOOL");
  const kind = (Object.keys(specs) as Catalog[]).find(candidate => {
    const { singular } = specs[candidate];
    return name === `list_${candidate}` || name === `get_${singular}`
      || name === `create_${singular}` || name === `update_${singular}`;
  });
  if (!kind) throw new CanonToolError(`Unknown production catalog tool "${name}"`, 404, "UNKNOWN_TOOL");
  await requireAdmin(userId);
  const operation = name.split("_", 1)[0];
  const config = specs[kind];
  const table: any = config.table;
  const singular = config.singular;
  const input: any = parseTool(name, args);
  if (operation === "list") {
    const limit = input.limit ?? 100;
    if (config.world) await requireWorld(db as unknown as Tx, input.world_id);
    const conditions = [];
    if (config.world) conditions.push(eq(table.worldId, input.world_id));
    if (input.after_id) conditions.push(gt(table.id, input.after_id));
    const rows = await db.select().from(table)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(table.id)).limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return {
      [kind]: page.map((row: Record<string, unknown>) => ({ ...row, revision: revisionFor(row) })),
      has_more: hasMore,
      next_cursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }
  if (operation === "get") {
    if (config.world) await requireWorld(db as unknown as Tx, input.world_id);
    const conditions = [eq(table.id, input.id)];
    if (config.world) conditions.push(eq(table.worldId, input.world_id));
    const [row] = await db.select().from(table).where(and(...conditions)).limit(1);
    if (!row) throw new CanonToolError(`${singular} not found`, 404, "RECORD_NOT_FOUND");
    return { [singular]: row, revision: revisionFor(row) };
  }
  if (operation === "create") {
    const worldId = config.world ? input.world_id : undefined;
    try {
      return await db.transaction(async tx => {
      if (worldId) await requireWorld(tx, worldId, true);
      const [existing] = await tx.select({ id: table.id }).from(table)
        .where(eq(table.id, input.record_id)).limit(1);
      if (existing) duplicateRecordId(input.record_id);
      const values: Record<string, any> = defaults(kind, fromInput(kind, input));
      if (kind === "production_profiles" || kind === "punch_templates") {
        values.name = values.name.trim();
        values.code = values.code.trim().toUpperCase();
      }
      if (kind === "production_profiles") {
        const error = validateProfile(values);
        if (error) failValidation(error);
      }
      if (kind === "punch_templates") {
        const error = validatePunch(values);
        if (error) failValidation(error);
      }
      if (kind === "style_guides" && input.typography !== undefined) {
        try { values.typography = await resolveTypographyChoices(input.typography); }
        catch (error) {
          if (error instanceof TypographyValidationError) throw new CanonToolError(error.message, 400, "INVALID_TYPOGRAPHY");
          throw error;
        }
      }
      const template = await ensureLinks(tx, kind, input, worldId);
      if (kind === "production_profiles" && values.punchTemplateId) {
        values.punchTemplateVersion = template!.version;
        values.punchTemplateSnapshot = template;
      }
      if (worldId) values.worldId = worldId;
      const idValue = input.record_id;
      const inserted: any = await tx.insert(table).values({ id: idValue, ...values }).returning();
      const [row] = inserted;
      await audit(tx, userId, "super_admin", kind, idValue, "create", { after: row });
      return { [singular]: { ...row, revision: revisionFor(row) } };
      });
    } catch (error) {
      const [existing] = await db.select({ id: table.id }).from(table)
        .where(eq(table.id, input.record_id)).limit(1);
      if (existing) duplicateRecordId(input.record_id);
      throw error;
    }
  }
  return db.transaction(async tx => {
    const conditions = [eq(table.id, input.id)];
    if (config.world) conditions.push(eq(table.worldId, input.world_id));
    const [row] = await tx.select().from(table).where(and(...conditions)).for("update").limit(1);
    if (!row) throw new CanonToolError(`${singular} not found`, 404, "RECORD_NOT_FOUND");
    if (config.world) await requireWorld(tx, row.worldId, true);
    if (revisionFor(row) !== input.expected_revision) conflict(input.expected_revision, row);
    const values = fromInput(kind, input.changes);
    if (!Object.keys(values).length) failValidation("changes must include at least one field");
    if (kind === "production_profiles" || kind === "punch_templates") {
      if (values.name !== undefined) values.name = values.name.trim();
      if (values.code !== undefined) values.code = values.code.trim().toUpperCase();
    }
    const merged = { ...row, ...values };
    if (kind === "production_profiles") {
      const error = validateProfile(merged);
      if (error) failValidation(error);
    }
    if (kind === "punch_templates") {
      const error = validatePunch(merged);
      if (error) failValidation(error);
    }
    if (kind === "volumes" && input.changes.collection_id !== undefined) {
      await ensureLinks(tx, kind, input.changes, row.worldId);
    }
    if (kind === "component_specs" && input.changes.production_profile_id !== undefined) {
      await ensureLinks(tx, kind, input.changes);
    }
    if (kind === "style_guides" && input.changes.typography !== undefined) {
      try { values.typography = await resolveTypographyChoices(input.changes.typography); }
      catch (error) {
        if (error instanceof TypographyValidationError) throw new CanonToolError(error.message, 400, "INVALID_TYPOGRAPHY");
        throw error;
      }
    }
    if (kind === "production_profiles") {
      const targetId = input.changes.punchTemplateId;
      const unlinked = input.changes.punchTemplateId === null;
      const template = targetId ? await ensureLinks(tx, kind, { punchTemplateId: targetId }) : null;
      if (unlinked) {
        values.punchTemplateVersion = null;
        values.punchTemplateSnapshot = null;
      } else if (template) {
        values.punchTemplateVersion = template.version;
        values.punchTemplateSnapshot = template;
      } else if (row.punchTemplateId && row.punchTemplateId !== merged.punchTemplateId) {
        values.punchTemplateVersion = null;
        values.punchTemplateSnapshot = null;
      }
    }
    const diff = Object.fromEntries(Object.entries(values).map(([key, after]) => [key, { before: row[key] ?? null, after }]));
    const [updated] = await tx.update(table).set(values).where(eq(table.id, row.id)).returning();
    await audit(tx, userId, "super_admin", kind, row.id, "update", diff);
    return { [singular]: { ...updated, revision: revisionFor(updated) }, diff };
  });
}