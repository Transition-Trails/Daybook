import { and, eq } from "drizzle-orm";
import {
  auditLogTable,
  db,
  READINESS_ENTITY_TYPES,
  READINESS_LANES,
  wsCanonRecordsTable,
  wsReadinessAssignmentsTable,
  wsStoriesTable,
  wsStoryBeatsTable,
  worldsmithWorldsTable,
} from "@workspace/db";
import type { ReadinessEntityType, ReadinessLane } from "@workspace/db";

export interface ReadinessCard {
  id: string;
  title: string;
  subtitle: string;
  lane: ReadinessLane;
  revision: number;
  href: string;
  parentTitle?: string;
}

export class ReadinessPlanningError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "ReadinessPlanningError";
  }
}

export function isReadinessLane(value: unknown): value is ReadinessLane {
  return typeof value === "string" && (READINESS_LANES as readonly string[]).includes(value);
}

export function isReadinessEntityType(value: unknown): value is ReadinessEntityType {
  return typeof value === "string" && (READINESS_ENTITY_TYPES as readonly string[]).includes(value);
}

export async function listReadinessCards(worldId: string) {
  const [world] = await db.select({ id: worldsmithWorldsTable.id })
    .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId)).limit(1);
  if (!world) throw new ReadinessPlanningError("World not found", 404, "world_not_found");
  const [records, stories, beats, assignments] = await Promise.all([
    db.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.worldId, worldId)).orderBy(wsCanonRecordsTable.name),
    db.select().from(wsStoriesTable).where(eq(wsStoriesTable.worldId, worldId)).orderBy(wsStoriesTable.sortOrder, wsStoriesTable.title),
    db.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.worldId, worldId)).orderBy(wsStoryBeatsTable.sortOrder, wsStoryBeatsTable.title),
    db.select().from(wsReadinessAssignmentsTable).where(eq(wsReadinessAssignmentsTable.worldId, worldId)),
  ]);
  const assignmentsByKey = new Map(assignments.map(item => [`${item.entityType}:${item.entityId}`, item]));
  const card = (
    type: ReadinessEntityType, id: string, title: string, subtitle: string, href: string, parentTitle?: string,
  ): ReadinessCard => {
    const assignment = assignmentsByKey.get(`${type}:${id}`);
    return {
      id,
      title,
      subtitle,
      lane: (assignment?.lane ?? "backlog") as ReadinessLane,
      revision: assignment?.revision ?? 0,
      href,
      ...(parentTitle === undefined ? {} : { parentTitle }),
    };
  };
  const storyTitles = new Map(stories.map(story => [story.id, story.title]));
  return {
    boards: {
      canon_records: records.map(record => card("canon_record", record.id, record.name, record.canonType ?? "", `/super/worldsmith/editorial/canon/${encodeURIComponent(record.id)}`)),
      storylines: stories.map(story => card("storyline", story.id, story.title, story.summary, `/super/worldsmith/editorial/stories/${encodeURIComponent(story.id)}`)),
      beats: beats.map(beat => card("beat", beat.id, beat.title, beat.summary, `/super/worldsmith/editorial/stories/${encodeURIComponent(beat.storyId)}`, storyTitles.get(beat.storyId) ?? "")),
    },
  };
}

export async function moveReadinessCard(args: {
  worldId: string;
  entityType: ReadinessEntityType;
  id: string;
  lane: ReadinessLane;
  expectedRevision: number;
  actorUserId: string;
}) {
  return db.transaction(async tx => {
    let worldId: string | undefined;
    let title = "";
    let subtitle = "";
    let parentTitle: string | undefined;
    let href = "";

    if (args.entityType === "canon_record") {
      const [record] = await tx.select().from(wsCanonRecordsTable).where(eq(wsCanonRecordsTable.id, args.id)).for("update").limit(1);
      if (!record) throw new ReadinessPlanningError("Entity not found", 404, "not_found");
      worldId = record.worldId;
      title = record.name;
      subtitle = record.canonType ?? "";
      href = `/super/worldsmith/editorial/canon/${encodeURIComponent(record.id)}`;
    } else if (args.entityType === "storyline") {
      const [story] = await tx.select().from(wsStoriesTable).where(eq(wsStoriesTable.id, args.id)).for("update").limit(1);
      if (!story) throw new ReadinessPlanningError("Entity not found", 404, "not_found");
      worldId = story.worldId;
      title = story.title;
      subtitle = story.summary;
      href = `/super/worldsmith/editorial/stories/${encodeURIComponent(story.id)}`;
    } else {
      const [beat] = await tx.select().from(wsStoryBeatsTable).where(eq(wsStoryBeatsTable.id, args.id)).for("update").limit(1);
      if (!beat) throw new ReadinessPlanningError("Entity not found", 404, "not_found");
      const [story] = await tx.select().from(wsStoriesTable).where(and(
        eq(wsStoriesTable.id, beat.storyId),
        eq(wsStoriesTable.worldId, beat.worldId),
      )).for("update").limit(1);
      if (!story) throw new ReadinessPlanningError("Beat parent does not belong to the requested world", 400, "parent_world_mismatch");
      worldId = beat.worldId;
      title = beat.title;
      subtitle = beat.summary;
      parentTitle = story.title;
      href = `/super/worldsmith/editorial/stories/${encodeURIComponent(story.id)}`;
    }

    if (worldId !== args.worldId) throw new ReadinessPlanningError("Entity does not belong to the requested world", 400, "world_mismatch");
    const [current] = await tx.select().from(wsReadinessAssignmentsTable).where(and(
      eq(wsReadinessAssignmentsTable.entityType, args.entityType),
      eq(wsReadinessAssignmentsTable.entityId, args.id),
    )).for("update").limit(1);
    if (current && current.worldId !== args.worldId) {
      throw new ReadinessPlanningError("Existing readiness assignment belongs to another world", 400, "world_mismatch");
    }
    const currentRevision = current?.revision ?? 0;
    if (currentRevision !== args.expectedRevision) {
      throw new ReadinessPlanningError("Readiness lane revision is stale", 409, "stale_revision");
    }
    let assigned: typeof wsReadinessAssignmentsTable.$inferSelect | undefined;
    if (current) {
      [assigned] = await tx.update(wsReadinessAssignmentsTable).set({
        lane: args.lane,
        revision: currentRevision + 1,
        updatedBy: args.actorUserId,
        updatedAt: new Date(),
      }).where(and(
        eq(wsReadinessAssignmentsTable.entityType, args.entityType),
        eq(wsReadinessAssignmentsTable.entityId, args.id),
        eq(wsReadinessAssignmentsTable.worldId, args.worldId),
        eq(wsReadinessAssignmentsTable.revision, args.expectedRevision),
      )).returning();
    } else {
      [assigned] = await tx.insert(wsReadinessAssignmentsTable).values({
        worldId: args.worldId,
        entityType: args.entityType,
        entityId: args.id,
        lane: args.lane,
        revision: 1,
        updatedBy: args.actorUserId,
      }).onConflictDoNothing().returning();
    }
    if (!assigned) throw new ReadinessPlanningError("Readiness lane revision is stale", 409, "stale_revision");

    const after = { worldId: args.worldId, entityType: args.entityType, entityId: args.id, lane: assigned.lane, revision: assigned.revision };
    await tx.insert(auditLogTable).values({
      actorUserId: args.actorUserId,
      actorRole: "super_admin",
      scope: "platform",
      action: "worldsmith.readiness_lane.move",
      targetType: args.entityType,
      targetId: args.id,
      metadata: { before: current ? { lane: current.lane, revision: current.revision } : { lane: "backlog", revision: 0 }, after },
    });
    return {
      card: {
        id: args.id, title, subtitle, lane: assigned.lane as ReadinessLane, revision: assigned.revision, href,
        ...(parentTitle === undefined ? {} : { parentTitle }),
      } satisfies ReadinessCard,
    };
  });
}