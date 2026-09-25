import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  verify: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../lib/mcp-oauth", () => ({
  getMcpIssuer: () => "https://daybook.example",
  verifyMcpAccessToken: mocked.verify,
}));
vi.mock("../lib/worldsmith/mcp-canon", () => ({
  CANON_TOOLS: [
    { name: "search_canon_records", description: "Search", inputSchema: { type: "object" } },
    { name: "get_canon_record", description: "Read", inputSchema: { type: "object" } },
    { name: "get_canon_field_options", description: "Options", inputSchema: { type: "object" } },
    { name: "update_character_attributes", description: "Write", inputSchema: { type: "object" } },
    { name: "get_record_change_history", description: "History", inputSchema: { type: "object" } },
  ],
  executeCanonTool: mocked.execute,
}));

import mcpRouter from "../routes/mcp";

const app = express();
app.use(express.json());
app.use(mcpRouter);

function call(name: string, args: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } };
}

describe("WorldSmith Streamable HTTP MCP", () => {
  beforeEach(() => {
    mocked.verify.mockReset();
    mocked.execute.mockReset();
    mocked.verify.mockResolvedValue({
      userId: "super-admin",
      clientId: "client-1",
      scopes: ["worldsmith:canon:read", "worldsmith:canon:write"],
    });
  });

  it("challenges anonymous callers with protected-resource metadata", async () => {
    const response = await request(app).post("/mcp").send({
      jsonrpc: "2.0", id: 1, method: "initialize", params: {},
    });
    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toContain(
      "https://daybook.example/.well-known/oauth-protected-resource/mcp",
    );
    expect(response.headers["www-authenticate"]).toContain(
      'scope="worldsmith:canon:read worldsmith:canon:write"',
    );
    expect(mocked.execute).not.toHaveBeenCalled();
  });

  it("negotiates and lists exactly the five tools", async () => {
    const initialized = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
    expect(initialized.status).toBe(200);
    expect(initialized.body.result.capabilities.tools).toBeDefined();
    const listed = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search_canon_records", "get_canon_record", "get_canon_field_options",
      "update_character_attributes", "get_record_change_history",
    ]);
  });

  it("returns a read result and forwards the OAuth user identity", async () => {
    mocked.execute.mockResolvedValue({ record: { id: "canon-1", status: "proposed" }, version: 3 });
    const response = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("get_canon_record", { record_id: "canon-1" }));
    expect(response.body.result.structuredContent.version).toBe(3);
    expect(mocked.execute).toHaveBeenCalledWith(
      "super-admin", "get_canon_record", { record_id: "canon-1" }, "https://daybook.example",
    );
  });

  it("forbids writes without the write scope", async () => {
    mocked.verify.mockResolvedValue({
      userId: "super-admin", clientId: "client-1", scopes: ["worldsmith:canon:read"],
    });
    const response = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("update_character_attributes", {
        record_id: "canon-1", expected_version: 3, changes: { pronouns: "she/her" },
      }));
    expect(response.status).toBe(403);
    expect(mocked.execute).not.toHaveBeenCalled();
  });

  it("surfaces invalid picklists and stale versions as tool errors without changing workflow", async () => {
    for (const code of ["INVALID_PICKLIST_VALUE", "VERSION_CONFLICT"]) {
      mocked.execute.mockRejectedValueOnce(Object.assign(new Error(code), { status: code === "VERSION_CONFLICT" ? 409 : 400, code }));
      const response = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
        .send(call("update_character_attributes", {
          record_id: "canon-1", expected_version: 3, changes: { lifeStage: "adult" },
        }));
      expect(response.status).toBe(200);
      expect(response.body.result.isError).toBe(true);
      expect(response.body.result.content[0].text).toContain(code);
    }
  });
});