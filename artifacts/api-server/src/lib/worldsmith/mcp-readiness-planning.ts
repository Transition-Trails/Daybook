import { z } from "zod";
import {
  isReadinessLane,
  listReadinessCards,
  moveReadinessCard,
  ReadinessPlanningError,
} from "./readiness-planning";
import { and, eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

const worldIdSchema = z.string().min(1).max(200);
const listArgs = z.object({ world_id: worldIdSchema }).strict();
const moveArgs = z.object({
  world_id: worldIdSchema,
  entity_type: z.enum(["canon_records", "storylines", "beats"]),
  id: z.string().min(1).max(200),
  lane: z.enum(["backlog", "in_progress", "review", "ready"]),
  expected_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

export const READINESS_PLANNING_TOOLS = [
  {
    name: "list_readiness_cards",
    description: "List Canon Records, storylines, and story beats on their independent readiness planning lanes for a world. Does not change editorial or lifecycle status.",
    inputSchema: {
      type: "object",
      properties: { world_id: { type: "string", minLength: 1, maxLength: 200 } },
      required: ["world_id"],
      additionalProperties: false,
    },
  },
  {
    name: "move_readiness_card",
    description: "Move one Canon Record, storyline, or story beat between backlog, in_progress, review, and ready using its expected readiness revision. Does not approve or change lifecycle status.",
    inputSchema: {
      type: "object",
      properties: {
        world_id: { type: "string", minLength: 1, maxLength: 200 },
        entity_type: { type: "string", enum: ["canon_records", "storylines", "beats"] },
        id: { type: "string", minLength: 1, maxLength: 200 },
        lane: { type: "string", enum: ["backlog", "in_progress", "review", "ready"] },
        expected_revision: { type: "integer", minimum: 0 },
      },
      required: ["world_id", "entity_type", "id", "lane", "expected_revision"],
      additionalProperties: false,
    },
  },
] as const;
export const READINESS_PLANNING_WRITE_TOOLS = new Set(["move_readiness_card"]);

async function requireCurrentSuperAdmin(userId: string): Promise<void> {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(and(
    eq(usersTable.id, userId),
    eq(usersTable.platformRole, "super_admin"),
  )).limit(1);
  if (!user) {
    throw new ReadinessPlanningError("A current super-admin account is required", 403, "forbidden");
  }
}

export async function executeReadinessPlanningTool(userId: string, name: string, args: unknown) {
  if (name === "list_readiness_cards" || name === "move_readiness_card") {
    await requireCurrentSuperAdmin(userId);
  }
  if (name === "list_readiness_cards") {
    const parsed = listArgs.safeParse(args);
    if (!parsed.success) throw new ReadinessPlanningError("Invalid list_readiness_cards arguments", 400, "invalid_input");
    return listReadinessCards(parsed.data.world_id);
  }
  if (name === "move_readiness_card") {
    const parsed = moveArgs.safeParse(args);
    if (!parsed.success) throw new ReadinessPlanningError("Invalid move_readiness_card arguments", 400, "invalid_input");
    if (!isReadinessLane(parsed.data.lane)) {
      throw new ReadinessPlanningError("Invalid readiness planning values", 400, "invalid_input");
    }
    const entityType = ({
      canon_records: "canon_record",
      storylines: "storyline",
      beats: "beat",
    } as const)[parsed.data.entity_type];
    return moveReadinessCard({
      worldId: parsed.data.world_id,
      entityType,
      id: parsed.data.id,
      lane: parsed.data.lane,
      expectedRevision: parsed.data.expected_revision,
      actorUserId: userId,
    });
  }
  throw new ReadinessPlanningError("Unknown readiness planning tool", 400, "invalid_input");
}