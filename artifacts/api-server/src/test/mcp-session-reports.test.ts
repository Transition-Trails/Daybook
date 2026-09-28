import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { db, mcpOAuthClientsTable, mcpOAuthTokensTable, usersTable, worldsmithWorldsTable, wsSessionReportsTable } from "@workspace/db";
import { getMcpResource, hasWriteWithoutRead } from "../lib/mcp-oauth";
import mcpRouter from "../routes/mcp";
import reportsRouter from "../routes/session-reports";

describe("WorldSmith MCP session reports", () => {
  it("requires distinct consent, stores one summary per client session, and lets admins retrieve it", async () => {
    const [user] = await db.select().from(usersTable)
      .where(eq(usersTable.platformRole, "super_admin")).limit(1);
    if (!user) throw new Error("Integration test needs a seeded super-admin user");
    const clientId = `report-test-${randomUUID()}`;
    const worldId = `report-test-${randomUUID()}`;
    const sessionKey = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const api = express();
    api.use(express.json());
    api.use(mcpRouter);
    api.use((req, _res, next) => {
      req.user = user;
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      next();
    });
    api.use("/api", reportsRouter);
    const rpc = (method: string, params: Record<string, unknown>) =>
      request(api).post("/mcp").set("Authorization", `Bearer ${token}`)
        .send({ jsonrpc: "2.0", id: 1, method, params });
    const input = {
      session_key: sessionKey, world_id: worldId, title: "Working session", summary: "Reviewed the story map",
      work_done: ["Reviewed chronology"], decisions: ["Keep the timeline"],
      open_questions: ["Which era?"], next_steps: ["Review the Bible"],
    };
    try {
      await db.insert(worldsmithWorldsTable).values({
        id: worldId, name: "Disposable report world", code: "TST",
      });
      await db.insert(mcpOAuthClientsTable).values({
        clientId, clientName: "Report test client", redirectUris: ["https://example.com/callback"],
      });
      await db.insert(mcpOAuthTokensTable).values({
        tokenHash, kind: "access", familyId: randomUUID(), clientId, userId: user.id,
        resource: getMcpResource(), scopes: ["worldsmith:canon:read"],
        expiresAt: new Date(Date.now() + 60_000),
      });
      expect(hasWriteWithoutRead(["worldsmith:sessions:write"])).toBe(true);
      expect(hasWriteWithoutRead(["worldsmith:canon:read", "worldsmith:sessions:write"])).toBe(false);
      const withoutGrant = await rpc("tools/list", {});
      expect(withoutGrant.body.result.tools.some((tool: { name: string }) => tool.name === "save_session_report")).toBe(false);
      const denied = await rpc("tools/call", { name: "save_session_report", arguments: input });
      expect(denied.status).toBe(403);

      await db.update(mcpOAuthTokensTable)
        .set({ scopes: ["worldsmith:canon:read", "worldsmith:sessions:write"] })
        .where(eq(mcpOAuthTokensTable.tokenHash, tokenHash));
      const withGrant = await rpc("tools/list", {});
      expect(withGrant.body.result.tools.some((tool: { name: string }) => tool.name === "save_session_report")).toBe(true);
      const invalid = await rpc("tools/call", {
        name: "save_session_report", arguments: { ...input, transcript: "not allowed" },
      });
      expect(invalid.body.result.isError).toBe(true);
      const saved = await rpc("tools/call", { name: "save_session_report", arguments: input });
      expect(saved.body.result.structuredContent.created).toBe(true);
      const reportId = saved.body.result.structuredContent.report.id;
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
      const retry = await rpc("tools/call", { name: "save_session_report", arguments: input });
      expect(retry.body.result.structuredContent.created).toBe(false);
      expect(retry.body.result.structuredContent.report.id).toBe(reportId);
      const conflict = await rpc("tools/call", {
        name: "save_session_report", arguments: { ...input, summary: "Different report" },
      });
      expect(conflict.body.result.isError).toBe(true);
      const list = await request(api).get("/api/worldsmith/session-reports?limit=20&offset=0");
      expect(list.status).toBe(200);
      expect(list.body.reports.find((report: { id: string }) => report.id === reportId)).toMatchObject({
        title: input.title, authorName: user.name, authorUserId: user.id,
        clientId, clientName: "Report test client", worldId, worldName: null,
      });
      const detail = await request(api).get(`/api/worldsmith/session-reports/${reportId}`);
      expect(detail.body.report).toMatchObject({
        id: reportId, workDone: input.work_done, decisions: input.decisions,
        openQuestions: input.open_questions, nextSteps: input.next_steps,
      });
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
      const afterClientDeletion = await request(api).get(`/api/worldsmith/session-reports/${reportId}`);
      expect(afterClientDeletion.body.report).toMatchObject({ clientId, clientName: null });
    } finally {
      await db.delete(wsSessionReportsTable).where(and(
        eq(wsSessionReportsTable.authorUserId, user.id),
        eq(wsSessionReportsTable.clientId, clientId),
      ));
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
      await db.delete(worldsmithWorldsTable).where(eq(worldsmithWorldsTable.id, worldId));
    }
  });
});