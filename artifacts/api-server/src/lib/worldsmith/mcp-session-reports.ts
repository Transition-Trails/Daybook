import { randomUUID } from "node:crypto";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  db, mcpOAuthClientsTable, usersTable, worldsmithWorldsTable, wsSessionReportsTable,
} from "@workspace/db";

const item = z.string().trim().min(1).max(1000);
const items = z.array(item).max(25);
export const sessionReportInput = z.object({
  session_key: z.string().trim().min(1).max(120),
  world_id: z.string().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(5000),
  work_done: items.default([]),
  decisions: items.default([]),
  open_questions: items.default([]),
  next_steps: items.default([]),
}).strict();

export const SESSION_REPORT_TOOLS = [{
  name: "save_session_report",
  description: "After a working session, save one client-authored structured summary for platform admins to review. This does not capture a chat transcript or automatically verify the described work. Generate a unique session_key per session and reuse it only when retrying that same report.",
  inputSchema: {
    type: "object",
    properties: {
      session_key: { type: "string", minLength: 1, maxLength: 120, description: "Stable identifier for this working session; reuse on retries." },
      world_id: { type: "string", minLength: 1, maxLength: 200, description: "Optional related WorldSmith world ID." },
      title: { type: "string", minLength: 1, maxLength: 200 },
      summary: { type: "string", minLength: 1, maxLength: 5000 },
      work_done: { type: "array", items: { type: "string", maxLength: 1000 }, maxItems: 25 },
      decisions: { type: "array", items: { type: "string", maxLength: 1000 }, maxItems: 25 },
      open_questions: { type: "array", items: { type: "string", maxLength: 1000 }, maxItems: 25 },
      next_steps: { type: "array", items: { type: "string", maxLength: 1000 }, maxItems: 25 },
    },
    required: ["session_key", "title", "summary"],
    additionalProperties: false,
  },
}, {
  name: "list_my_session_reports",
  description: "List reports previously submitted by this same signed-in user and MCP client. Reports from other clients or users are not included.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 50 },
      offset: { type: "integer", minimum: 0, maximum: 100000 },
    },
    additionalProperties: false,
  },
}, {
  name: "get_my_session_report",
  description: "Retrieve one saved working-session report by ID, only if it was submitted by this same user and MCP client.",
  inputSchema: {
    type: "object",
    properties: { report_id: { type: "string", format: "uuid" } },
    required: ["report_id"],
    additionalProperties: false,
  },
}] as const;
export const SESSION_REPORT_TOOL_NAMES = new Set<string>(SESSION_REPORT_TOOLS.map(tool => tool.name));

export class SessionReportError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); }
}

export async function saveSessionReport(userId: string, clientId: string, input: unknown) {
  const parsed = sessionReportInput.safeParse(input);
  if (!parsed.success) throw new SessionReportError("Invalid session report fields", 400, "invalid_input");
  const value = parsed.data;
  const fields = {
    authorUserId: userId, clientId, sessionKey: value.session_key, worldId: value.world_id ?? null,
    title: value.title, summary: value.summary, workDone: value.work_done,
    decisions: value.decisions, openQuestions: value.open_questions, nextSteps: value.next_steps,
  };
  const lookup = () => db.select().from(wsSessionReportsTable).where(and(
    eq(wsSessionReportsTable.authorUserId, userId),
    eq(wsSessionReportsTable.clientId, clientId),
    eq(wsSessionReportsTable.sessionKey, value.session_key),
  )).limit(1);
  const resultForExisting = (existing: typeof wsSessionReportsTable.$inferSelect) => {
    const same = Object.entries(fields).every(([key, fieldValue]) =>
      JSON.stringify(existing[key as keyof typeof fields]) === JSON.stringify(fieldValue));
    if (!same) throw new SessionReportError("A different report already uses this session key", 409, "session_key_conflict");
    return { report: existing, created: false };
  };
  // Existing reports survive world deletion; an idempotent retry must too.
  const [previous] = await lookup();
  if (previous) return resultForExisting(previous);
  if (value.world_id) {
    const [world] = await db.select({ id: worldsmithWorldsTable.id })
      .from(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, value.world_id)).limit(1);
    if (!world) throw new SessionReportError("World not found", 404, "world_not_found");
  }
  const [inserted] = await db.insert(wsSessionReportsTable)
    .values({ id: randomUUID(), ...fields })
    .onConflictDoNothing({ target: [wsSessionReportsTable.authorUserId, wsSessionReportsTable.clientId, wsSessionReportsTable.sessionKey] })
    .returning();
  if (inserted) return { report: inserted, created: true };
  const [existing] = await lookup();
  if (!existing) throw new SessionReportError("Could not retrieve saved session report", 500, "report_unavailable");
  return resultForExisting(existing);
}

const reportSelect = {
  id: wsSessionReportsTable.id,
  authorUserId: wsSessionReportsTable.authorUserId,
  clientId: wsSessionReportsTable.clientId,
  title: wsSessionReportsTable.title,
  summary: wsSessionReportsTable.summary,
  workDone: wsSessionReportsTable.workDone,
  decisions: wsSessionReportsTable.decisions,
  openQuestions: wsSessionReportsTable.openQuestions,
  nextSteps: wsSessionReportsTable.nextSteps,
  worldId: wsSessionReportsTable.worldId,
  worldName: worldsmithWorldsTable.name,
  createdAt: wsSessionReportsTable.createdAt,
  authorName: usersTable.name,
  clientName: mcpOAuthClientsTable.clientName,
};

function reportQuery() {
  return db.select(reportSelect).from(wsSessionReportsTable)
    .leftJoin(worldsmithWorldsTable, eq(wsSessionReportsTable.worldId, worldsmithWorldsTable.id))
    .leftJoin(usersTable, eq(wsSessionReportsTable.authorUserId, usersTable.id))
    .leftJoin(mcpOAuthClientsTable, eq(wsSessionReportsTable.clientId, mcpOAuthClientsTable.clientId));
}

export async function listSessionReports(limit: number, offset: number) {
  const [reports, totalRows] = await Promise.all([
    reportQuery().orderBy(desc(wsSessionReportsTable.createdAt), desc(wsSessionReportsTable.id)).limit(limit).offset(offset),
    db.select({ total: count() }).from(wsSessionReportsTable),
  ]);
  return { reports, total: totalRows[0]?.total ?? 0 };
}

export async function getSessionReport(id: string) {
  const [report] = await reportQuery().where(eq(wsSessionReportsTable.id, id)).limit(1);
  return report ?? null;
}

const ownListInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).max(100_000).default(0),
}).strict();
const ownGetInput = z.object({ report_id: z.string().uuid() }).strict();

export async function readOwnSessionReports(userId: string, clientId: string, name: string, input: unknown) {
  const owner = and(
    eq(wsSessionReportsTable.authorUserId, userId),
    eq(wsSessionReportsTable.clientId, clientId),
  );
  if (name === "list_my_session_reports") {
    const parsed = ownListInput.safeParse(input);
    if (!parsed.success) throw new SessionReportError("Invalid report list options", 400, "invalid_input");
    const [reports, totals] = await Promise.all([
      db.select().from(wsSessionReportsTable).where(owner)
        .orderBy(desc(wsSessionReportsTable.createdAt), desc(wsSessionReportsTable.id))
        .limit(parsed.data.limit).offset(parsed.data.offset),
      db.select({ total: count() }).from(wsSessionReportsTable).where(owner),
    ]);
    return { reports, total: totals[0]?.total ?? 0 };
  }
  if (name === "get_my_session_report") {
    const parsed = ownGetInput.safeParse(input);
    if (!parsed.success) throw new SessionReportError("Invalid report ID", 400, "invalid_input");
    const [report] = await db.select().from(wsSessionReportsTable).where(and(
      owner, eq(wsSessionReportsTable.id, parsed.data.report_id),
    )).limit(1);
    if (!report) throw new SessionReportError("Session report not found", 404, "report_not_found");
    return { report };
  }
  throw new SessionReportError("Unknown report tool", 400, "invalid_tool");
}