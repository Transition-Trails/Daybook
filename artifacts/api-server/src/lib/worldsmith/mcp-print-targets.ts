import { and, asc, eq, sql } from "drizzle-orm";
import { ORIENTATION_AWARE_TYPES } from "@workspace/api-zod/readiness";
import { auditLogTable, db, usersTable, worldsmithImageTargetsTable } from "@workspace/db";
import { z } from "zod";
import { CanonToolError } from "./mcp-canon";
import { revisionFor } from "./editorial-revision";

const componentTypeSchema = z.string().min(1).max(200).transform(value => value.trim())
  .refine(value => ORIENTATION_AWARE_TYPES.has(value), {
    message: "component_type must be an orientation-aware WorldSmith component type",
  });
const dimensionSchema = z.number().finite().positive().max(1000);
const dimensionsSchema = z.object({
  print_width_in: dimensionSchema,
  print_height_in: dimensionSchema,
}).strict();

const argsSchemas = {
  list_print_targets: z.object({}).strict(),
  get_print_target: z.object({ component_type: componentTypeSchema }).strict(),
  create_print_target: z.object({
    component_type: componentTypeSchema,
    ...dimensionsSchema.shape,
  }).strict(),
  update_print_target: z.object({
    component_type: componentTypeSchema,
    expected_revision: z.string().min(1).max(100),
    changes: dimensionsSchema,
  }).strict(),
} as const;
type ToolName = keyof typeof argsSchemas;

const stringField = (maxLength: number, minLength?: number) => ({
  type: "string",
  ...(minLength ? { minLength } : {}),
  maxLength,
});
const dimensionsInputSchema = {
  print_width_in: { type: "number", exclusiveMinimum: 0, maximum: 1000 },
  print_height_in: { type: "number", exclusiveMinimum: 0, maximum: 1000 },
};
const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false,
});
type PrintTargetToolDescriptor = {
  name: ToolName;
  description: string;
  inputSchema: Record<string, unknown>;
};

export const PRINT_TARGET_TOOLS: PrintTargetToolDescriptor[] = [
  { name: "list_print_targets", description: "List the read-only catalog of supported WorldSmith print targets.", inputSchema: objectSchema({}) },
  { name: "get_print_target", description: "Read one supported WorldSmith print target and its current revision.", inputSchema: objectSchema({
    component_type: stringField(200, 1),
  }, ["component_type"]) },
  { name: "create_print_target", description: "Create print dimensions for a supported WorldSmith component type; fails if the target already exists.", inputSchema: objectSchema({
    component_type: stringField(200, 1), ...dimensionsInputSchema,
  }, ["component_type", "print_width_in", "print_height_in"]) },
  { name: "update_print_target", description: "Update print dimensions at the expected revision; component types are upserted by the route's componentType key.", inputSchema: objectSchema({
    component_type: stringField(200, 1),
    expected_revision: stringField(100, 1),
    changes: objectSchema(dimensionsInputSchema, ["print_width_in", "print_height_in"]),
  }, ["component_type", "expected_revision", "changes"]) },
];

export const PRINT_TARGET_WRITE_TOOLS = new Set<string>(["create_print_target", "update_print_target"]);

function parseArgs<T extends ToolName>(name: T, args: unknown): z.infer<(typeof argsSchemas)[T]> {
  const parsed = argsSchemas[name].safeParse(args);
  if (!parsed.success) {
    throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  }
  return parsed.data as z.infer<(typeof argsSchemas)[T]>;
}

async function requireSuperAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

function normalizedTarget(row: typeof worldsmithImageTargetsTable.$inferSelect | undefined, componentType: string) {
  const data = {
    component_type: componentType,
    print_width_in: row?.printWidthIn ?? null,
    print_height_in: row?.printHeightIn ?? null,
    updated_at: row?.updatedAt ?? null,
  };
  return { ...data, revision: revisionFor(data) };
}

function invalidComponentType(): never {
  throw new CanonToolError(
    "component_type must be an orientation-aware WorldSmith component type",
    400,
    "INVALID_COMPONENT_TYPE",
  );
}

function conflict(expected: string, current: string): never {
  throw new CanonToolError(`Revision conflict: expected ${expected}, current revision is ${current}`, 409, "REVISION_CONFLICT");
}

function targetAlreadyExists(componentType: string): never {
  throw new CanonToolError(`Print target "${componentType}" already exists`, 409, "PRINT_TARGET_EXISTS");
}

async function lockTarget(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  componentType: string,
): Promise<void> {
  // A transaction-scoped key lock serializes create/update for a component type,
  // including the absent-row case, without table locks or lock-order inversion.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${componentType}, 0))`);
}

async function insertAudit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  row: typeof worldsmithImageTargetsTable.$inferSelect,
  action: "create" | "update",
  before: { print_width_in: number | null; print_height_in: number | null },
): Promise<void> {
  await tx.insert(auditLogTable).values({
    actorUserId: userId,
    actorRole: "super_admin",
    scope: "platform",
    action: `worldsmith.editorial.print_target.${action}`,
    targetType: "worldsmith_image_target",
    targetId: row.componentType,
    metadata: {
      actor_user_id: userId,
      before_after: {
        print_width_in: { before: before.print_width_in, after: row.printWidthIn },
        print_height_in: { before: before.print_height_in, after: row.printHeightIn },
      },
    },
  });
}

export async function executePrintTargetTool(userId: string, name: string, args: unknown): Promise<unknown> {
  await requireSuperAdmin(userId);
  if (!Object.hasOwn(argsSchemas, name)) {
    throw new CanonToolError(`Unknown print target tool "${name}"`, 404, "UNKNOWN_TOOL");
  }

  switch (name as ToolName) {
    case "list_print_targets": {
      parseArgs("list_print_targets", args);
      const rows = await db.select().from(worldsmithImageTargetsTable)
        .orderBy(asc(worldsmithImageTargetsTable.componentType));
      const byType = new Map(rows.map(row => [row.componentType, row]));
      return {
        print_targets: [...ORIENTATION_AWARE_TYPES].map(componentType => normalizedTarget(byType.get(componentType), componentType)),
      };
    }
    case "get_print_target": {
      const { component_type } = parseArgs("get_print_target", args);
      const [row] = await db.select().from(worldsmithImageTargetsTable)
        .where(eq(worldsmithImageTargetsTable.componentType, component_type)).limit(1);
      return { print_target: normalizedTarget(row, component_type) };
    }
    case "create_print_target": {
      const input = parseArgs("create_print_target", args);
      return db.transaction(async tx => {
        // The catalog is configuration, not user-generated component types.
        if (!ORIENTATION_AWARE_TYPES.has(input.component_type)) invalidComponentType();
        await lockTarget(tx, input.component_type);
        const [existing] = await tx.select().from(worldsmithImageTargetsTable)
          .where(eq(worldsmithImageTargetsTable.componentType, input.component_type)).for("update").limit(1);
        if (existing) targetAlreadyExists(input.component_type);
        const [row] = await tx.insert(worldsmithImageTargetsTable).values({
          componentType: input.component_type,
          printWidthIn: input.print_width_in,
          printHeightIn: input.print_height_in,
        }).onConflictDoNothing({
          target: worldsmithImageTargetsTable.componentType,
        }).returning();
        if (!row) targetAlreadyExists(input.component_type);
        await insertAudit(tx, userId, row, "create", { print_width_in: null, print_height_in: null });
        return { print_target: normalizedTarget(row, row.componentType) };
      });
    }
    case "update_print_target": {
      const input = parseArgs("update_print_target", args);
      return db.transaction(async tx => {
        await lockTarget(tx, input.component_type);
        const [existing] = await tx.select().from(worldsmithImageTargetsTable)
          .where(eq(worldsmithImageTargetsTable.componentType, input.component_type)).for("update").limit(1);
        const currentRevision = normalizedTarget(existing, input.component_type).revision;
        if (currentRevision !== input.expected_revision) conflict(input.expected_revision, currentRevision);
        const stillExpected = existing ? undefined : sql`false`;
        const [row] = await tx.insert(worldsmithImageTargetsTable).values({
          componentType: input.component_type,
          printWidthIn: input.changes.print_width_in,
          printHeightIn: input.changes.print_height_in,
        }).onConflictDoUpdate({
          target: worldsmithImageTargetsTable.componentType,
          // Guard the upsert against a non-MCP writer creating the missing
          // row after the revision read. Existing rows are locked above.
          setWhere: stillExpected,
          set: {
            printWidthIn: input.changes.print_width_in,
            printHeightIn: input.changes.print_height_in,
            updatedAt: new Date(),
          },
        }).returning();
        if (!row) {
          const [latest] = await tx.select().from(worldsmithImageTargetsTable)
            .where(eq(worldsmithImageTargetsTable.componentType, input.component_type)).limit(1);
          if (latest) conflict(input.expected_revision, normalizedTarget(latest, input.component_type).revision);
          throw new CanonToolError("Could not save print target", 500, "SAVE_FAILED");
        }
        await insertAudit(tx, userId, row, "update", {
          print_width_in: existing?.printWidthIn ?? null,
          print_height_in: existing?.printHeightIn ?? null,
        });
        return { print_target: normalizedTarget(row, row.componentType) };
      });
    }
  }
}