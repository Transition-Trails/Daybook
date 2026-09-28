import { createHash, randomBytes, randomUUID } from "node:crypto";
import express from "express";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { db, mcpOAuthClientsTable, mcpOAuthTokensTable, usersTable, worldsmithWorldsTable, wsSessionReportsTable } from "@workspace/db";
import { getMcpResource, hasWriteWithoutRead } from "../lib/mcp-oauth";
import { formatSessionReportMarkdown, readOwnSessionReports } from "../lib/worldsmith/mcp-session-reports";
import mcpRouter from "../routes/mcp";
import reportsRouter from "../routes/session-reports";

describe("session report Markdown", () => {
  it("escapes saved text without losing attribution, sections, or multiline content", () => {
    const markdown = formatSessionReportMarkdown({
      id: randomUUID(), title: "# A <script>", summary: "First line\n## Not a heading",
      authorUserId: "author-id", authorName: "Alice & Bob",
      clientId: "client-id", clientName: null,
      worldId: "world-id", worldName: null,
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
      workDone: ["Completed *task*\n- not another item"],
      decisions: ["[Link](https://example.com)"], openQuestions: [],
      nextSteps: ["Review > approve"],
    });
    expect(markdown).toContain("# \\# A &lt;script&gt;");
    expect(markdown).toContain("**Summary:** First line  \n\\#\\# Not a heading");
    expect(markdown).toContain("**Author:** Alice &amp; Bob");
    expect(markdown).toContain("**Client:** client\\-id");
    expect(markdown).toContain("**Created:** 2026-09-28T12:00:00.000Z");
    expect(markdown).toContain("**World:** world\\-id");
    expect(markdown).toContain("## Work done\n\n- Completed \\*task\\*  \n  \\- not another item");
    expect(markdown).toContain("## Decisions\n\n- \\[Link\\]\\(https://example\\.com\\)");
    expect(markdown).toContain("## Open questions\n\nNone recorded.");
    expect(markdown).toContain("## Next steps\n\n- Review &gt; approve");
    expect(markdown).not.toContain("<script>");
  });
});

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
      expect(withoutGrant.body.result.tools.some((tool: { name: string }) => tool.name === "list_my_session_reports")).toBe(false);
      const denied = await rpc("tools/call", { name: "save_session_report", arguments: input });
      expect(denied.status).toBe(403);

      await db.update(mcpOAuthTokensTable)
        .set({ scopes: ["worldsmith:canon:read", "worldsmith:sessions:write"] })
        .where(eq(mcpOAuthTokensTable.tokenHash, tokenHash));
      const withGrant = await rpc("tools/list", {});
      expect(withGrant.body.result.tools.some((tool: { name: string }) => tool.name === "save_session_report")).toBe(true);
      expect(withGrant.body.result.tools.some((tool: { name: string }) => tool.name === "get_my_session_report")).toBe(true);
      const invalid = await rpc("tools/call", {
        name: "save_session_report", arguments: { ...input, transcript: "not allowed" },
      });
      expect(invalid.body.result.isError).toBe(true);
      const saved = await rpc("tools/call", { name: "save_session_report", arguments: input });
      expect(saved.body.result.structuredContent.created).toBe(true);
      const reportId = saved.body.result.structuredContent.report.id;
      const ownList = await rpc("tools/call", { name: "list_my_session_reports", arguments: {} });
      expect(ownList.body.result.structuredContent.reports.some((report: { id: string }) => report.id === reportId)).toBe(true);
      const ownDetail = await rpc("tools/call", {
        name: "get_my_session_report", arguments: { report_id: reportId },
      });
      expect(ownDetail.body.result.structuredContent.report.id).toBe(reportId);
      expect((await readOwnSessionReports(user.id, "other-client", "list_my_session_reports", {})).total).toBe(0);
      await expect(readOwnSessionReports(user.id, "other-client", "get_my_session_report", { report_id: reportId }))
        .rejects.toMatchObject({ status: 404 });
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
      const download = await request(api).get(`/api/worldsmith/session-reports/${reportId}/markdown`);
      expect(download.status).toBe(200);
      expect(download.headers["content-type"]).toMatch(/^text\/markdown/);
      expect(download.headers["content-disposition"])
        .toBe(`attachment; filename="worldsmith-session-report-${reportId}.md"`);
      expect(download.text).toContain("# Working session");
      expect(download.text).toContain("**Summary:** Reviewed the story map");
      expect(download.text).toContain("**Author:**");
      expect(download.text).toContain("**Client:** Report test client");
      expect(download.text).toContain(`**World:** ${worldId.replaceAll("-", "\\-")}`);
      expect(download.text).toContain("## Work done\n\n- Reviewed chronology");
      expect(download.text).toContain("## Decisions\n\n- Keep the timeline");
      expect(download.text).toContain("## Open questions\n\n- Which era?");
      expect(download.text).toContain("## Next steps\n\n- Review the Bible");
      expect((await request(api).get(`/api/worldsmith/session-reports/${randomUUID()}/markdown`)).status).toBe(404);
      expect((await request(api).get("/api/worldsmith/session-reports/bad-id/markdown")).status).toBe(400);
      await db.delete(mcpOAuthTokensTable).where(eq(mcpOAuthTokensTable.clientId, clientId));
      await db.delete(mcpOAuthClientsTable).where(eq(mcpOAuthClientsTable.clientId, clientId));
      const afterClientDeletion = await request(api).get(`/api/worldsmith/session-reports/${reportId}`);
      expect(afterClientDeletion.body.report).toMatchObject({ clientId, clientName: null });
      const afterClientDeletionMarkdown = await request(api).get(`/api/worldsmith/session-reports/${reportId}/markdown`);
      expect(afterClientDeletionMarkdown.text).toContain(`**Client:** ${clientId.replaceAll("-", "\\-")}`);
      expect(afterClientDeletionMarkdown.text).toContain(`**World:** ${worldId.replaceAll("-", "\\-")}`);
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