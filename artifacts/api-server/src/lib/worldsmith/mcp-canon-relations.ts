import { and, eq, inArray, or } from "drizzle-orm";
import {
  auditLogTable, db, usersTable, wsCanonRecordRelationsTable, wsCanonRecordStoryLinksTable,
  wsCanonRecordsTable, wsStoriesTable,
} from "@workspace/db";
import { z } from "zod";
import { CanonToolError } from "./mcp-canon.js";

const VALID_RELATION_TYPES = [
  "related", "supports", "contradicts", "precedes", "follows",
  "family", "friend", "ally", "rival", "enemy", "mentor", "student", "romantic",
  "owns", "uses", "protects", "seeks", "involved_in", "caused", "witnessed",
  "located_at", "requires", "supersedes", "mentions",
] as const;
const MAX_RELATION_DETAILS = 10_000;

const schemas = {
  create_canon_relation: {
    type: "object",
    properties: {
      from_record_id: { type: "string", minLength: 1, maxLength: 200 },
      to_record_id: { type: "string", minLength: 1, maxLength: 200 },
      relation_type: { type: "string", enum: VALID_RELATION_TYPES },
      details: {
        type: "string", minLength: 20, maxLength: MAX_RELATION_DETAILS,
        description: "Required explicit narrative evidence for this edge; do not create speculative or automatic links.",
      },
      story_id: {
        type: "string", minLength: 1, maxLength: 200,
        description: "Optional storyline evidence context. When supplied, both canon records must already be linked to it.",
      },
      expected_source_version: { type: "integer", minimum: 1 },
      expected_target_version: { type: "integer", minimum: 1 },
    },
    required: [
      "from_record_id", "to_record_id", "relation_type", "details",
      "expected_source_version", "expected_target_version",
    ],
    additionalProperties: false,
  },
} as const;

export const RELATION_TOOLS = [{
  name: "create_canon_relation",
  description: "Create one explicit edge in the Canon Relationships graph (not a relationship-type Canon record). Requires specific evidence; an optional storyline, when supplied, must already be linked to both records. Creates no suggested or inferred links.",
  inputSchema: schemas.create_canon_relation,
}];

export const RELATION_WRITE_TOOLS = new Set<string>(["create_canon_relation"]);

const argsSchema = z.object({
  from_record_id: z.string().trim().min(1).max(200),
  to_record_id: z.string().trim().min(1).max(200),
  relation_type: z.enum(VALID_RELATION_TYPES),
  details: z.string().trim().min(20).max(MAX_RELATION_DETAILS),
  story_id: z.string().trim().min(1).max(200).optional(),
  expected_source_version: z.number().int().positive(),
  expected_target_version: z.number().int().positive(),
}).strict();

async function requireSuperAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.id, userId), eq(usersTable.platformRole, "super_admin"))).limit(1);
  if (!user) throw new CanonToolError("A current super-admin account is required", 403, "FORBIDDEN");
}

export async function executeRelationTool(userId: string, name: string, args: unknown): Promise<unknown> {
  await requireSuperAdmin(userId);
  if (name !== "create_canon_relation") {
    throw new CanonToolError(`Unknown Canon relationship tool "${name}"`, 404, "UNKNOWN_TOOL");
  }
  const parsed = argsSchema.safeParse(args);
  if (!parsed.success) {
    throw new CanonToolError(`Invalid tool arguments: ${parsed.error.message}`, 400, "INVALID_ARGUMENTS");
  }
  const input = parsed.data;
  if (input.from_record_id === input.to_record_id) {
    throw new CanonToolError("Cannot link a record to itself", 400, "INVALID_RELATION");
  }

  return db.transaction(async tx => {
    // Lock this tool's endpoint records in stable ID order to serialize competing edge creates.
    const lockedRecords = await tx.select({
      id: wsCanonRecordsTable.id,
      worldId: wsCanonRecordsTable.worldId,
      version: wsCanonRecordsTable.version,
      name: wsCanonRecordsTable.name,
      canonType: wsCanonRecordsTable.canonType,
      status: wsCanonRecordsTable.status,
    }).from(wsCanonRecordsTable)
      .where(inArray(wsCanonRecordsTable.id, [input.from_record_id, input.to_record_id]))
      .orderBy(wsCanonRecordsTable.id)
      .for("update");
    const source = lockedRecords.find(record => record.id === input.from_record_id);
    const target = lockedRecords.find(record => record.id === input.to_record_id);
    if (!source) throw new CanonToolError("Source canon record not found", 404, "RECORD_NOT_FOUND");
    if (!target) throw new CanonToolError("Target canon record not found", 404, "RECORD_NOT_FOUND");
    if (source.worldId !== target.worldId) {
      throw new CanonToolError("Canon records must belong to the same world", 400, "INVALID_RELATION");
    }
    if (source.version !== input.expected_source_version || target.version !== input.expected_target_version) {
      throw new CanonToolError("Canon records changed after they were reviewed; refresh and retry.", 409, "VERSION_CONFLICT");
    }

    if (input.story_id) {
      const linkedRecords = await tx.select({
        canonRecordId: wsCanonRecordStoryLinksTable.canonRecordId,
      }).from(wsCanonRecordStoryLinksTable)
        .innerJoin(wsStoriesTable, and(
          eq(wsCanonRecordStoryLinksTable.storyId, wsStoriesTable.id),
          eq(wsStoriesTable.worldId, source.worldId),
        ))
        .where(and(
          eq(wsCanonRecordStoryLinksTable.storyId, input.story_id),
          inArray(wsCanonRecordStoryLinksTable.canonRecordId, [source.id, target.id]),
        ));
      if (new Set(linkedRecords.map(row => row.canonRecordId)).size !== 2) {
        throw new CanonToolError("Both canon records must already be linked to the supplied storyline.", 409, "STORY_EVIDENCE_REQUIRED");
      }
    }

    const existing = await tx.select({ fromRecordId: wsCanonRecordRelationsTable.fromRecordId })
      .from(wsCanonRecordRelationsTable)
      .where(or(
        and(
          eq(wsCanonRecordRelationsTable.fromRecordId, source.id),
          eq(wsCanonRecordRelationsTable.toRecordId, target.id),
        ),
        and(
          eq(wsCanonRecordRelationsTable.fromRecordId, target.id),
          eq(wsCanonRecordRelationsTable.toRecordId, source.id),
        ),
      )).limit(1);
    if (existing.length) {
      throw new CanonToolError("A relation between these canon records already exists.", 409, "RELATION_EXISTS");
    }

    const [inserted] = await tx.insert(wsCanonRecordRelationsTable).values({
      fromRecordId: source.id,
      toRecordId: target.id,
      relationType: input.relation_type,
      details: input.details,
      source: "manual",
      createdBy: userId,
    }).onConflictDoNothing({
      target: [wsCanonRecordRelationsTable.fromRecordId, wsCanonRecordRelationsTable.toRecordId],
    }).returning();
    if (!inserted) {
      throw new CanonToolError("A relation between these canon records already exists.", 409, "RELATION_EXISTS");
    }

    await tx.insert(auditLogTable).values({
      actorUserId: userId,
      actorRole: "super_admin",
      scope: "platform",
      action: "worldsmith.editorial.canon_relation.create",
      targetType: "worldsmith_canon_relation",
      targetId: `${source.id}->${target.id}`,
      metadata: {
        source_record_id: source.id,
        target_record_id: target.id,
        relation_type: input.relation_type,
        details: input.details,
        ...(input.story_id ? { story_id: input.story_id } : {}),
      },
    });

    return {
      relation: {
        ...inserted,
        targetName: target.name,
        targetCanonType: target.canonType,
        targetStatus: target.status,
      },
    };
  });
}