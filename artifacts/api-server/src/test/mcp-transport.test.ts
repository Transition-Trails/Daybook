import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  verify: vi.fn(),
  execute: vi.fn(),
  executeCanonEditorial: vi.fn(),
  executeScene: vi.fn(),
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
    { name: "update_canon_record", description: "Write", inputSchema: { type: "object" } },
    { name: "get_record_change_history", description: "History", inputSchema: { type: "object" } },
  ],
  executeCanonTool: mocked.execute,
}));
vi.mock("../lib/worldsmith/mcp-canon-editorial", () => ({
  CANON_EDITORIAL_TOOLS: [
    { name: "update_canon_editorial_fields", description: "Edit Canon editorial fields", inputSchema: { type: "object" } },
  ],
  CANON_EDITORIAL_WRITE_TOOLS: new Set(["update_canon_editorial_fields"]),
  executeCanonEditorialTool: mocked.executeCanonEditorial,
}));
vi.mock("../lib/worldsmith/mcp-editorial-scenes", () => ({
  SCENE_TOOLS: [
    { name: "search_scenes", description: "Search scenes", inputSchema: { type: "object" } },
    { name: "get_scene", description: "Get scene", inputSchema: { type: "object" } },
    { name: "update_scene", description: "Update scene", inputSchema: { type: "object" } },
  ],
  SCENE_WRITE_TOOLS: new Set(["update_scene"]),
  executeSceneTool: mocked.executeScene,
}));

import mcpRouter from "../routes/mcp";

const app = express();
app.post("/mcp", express.text({ type: () => true, limit: "1mb" }));
app.use(express.json());
app.use(mcpRouter);

function call(name: string, args: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } };
}

describe("WorldSmith Streamable HTTP MCP", () => {
  beforeEach(() => {
    mocked.verify.mockReset();
    mocked.execute.mockReset();
    mocked.executeCanonEditorial.mockReset();
    mocked.executeScene.mockReset();
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
      'scope="worldsmith:canon:read worldsmith:canon:write worldsmith:editorial:read worldsmith:editorial:write worldsmith:editorial:references:write worldsmith:editorial:story-details:write worldsmith:canon:editorial:write worldsmith:editorial:scenes:read worldsmith:editorial:scenes:write"',
    );
    expect(mocked.execute).not.toHaveBeenCalled();
  });

  it("challenges an anonymous host before examining its JSON media type", async () => {
    const response = await request(app).post("/mcp")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    expect(response.status).toBe(401);
    expect(response.headers["www-authenticate"]).toContain("oauth-protected-resource/mcp");
  });

  it("negotiates and retains the five original canon tools", async () => {
    const initialized = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
    expect(initialized.status).toBe(200);
    expect(initialized.body.result.capabilities.tools).toBeDefined();
    const listed = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(expect.arrayContaining([
      "search_canon_records", "get_canon_record", "get_canon_field_options",
      "update_canon_record", "get_record_change_history",
    ]));
  });

  it("accepts a bounded JSON-RPC body even when a host labels it as text", async () => {
    const response = await request(app).post("/mcp")
      .set("Authorization", "Bearer opaque-token")
      .set("Content-Type", "text/plain")
      .send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }));
    expect(response.status).toBe(200);
    expect(response.body.result.tools.some((tool: { name: string }) => tool.name === "update_canon_record")).toBe(true);
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
      .send(call("update_canon_record", {
        record_id: "canon-1", expected_revision: 3, changes: { pronouns: "she/her" },
      }));
    expect(response.status).toBe(403);
    expect(mocked.execute).not.toHaveBeenCalled();
  });

  it("surfaces invalid picklists and stale versions as tool errors without changing workflow", async () => {
    for (const code of ["INVALID_PICKLIST_VALUE", "VERSION_CONFLICT"]) {
      mocked.execute.mockRejectedValueOnce(Object.assign(new Error(code), { status: code === "VERSION_CONFLICT" ? 409 : 400, code }));
      const response = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
        .send(call("update_canon_record", {
          record_id: "canon-1", expected_revision: 3, changes: { lifeStage: "adult" },
        }));
      expect(response.status).toBe(200);
      expect(response.body.result.isError).toBe(true);
      expect(response.body.result.content[0].text).toContain(code);
    }
  });

  it("lists Canon editorial writes only with their separate write grant", async () => {
    mocked.verify.mockResolvedValue({
      userId: "super-admin", clientId: "client-1", scopes: ["worldsmith:canon:read"],
    });
    const list = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(list.body.result.tools.map((tool: { name: string }) => tool.name))
      .not.toContain("update_canon_editorial_fields");
    const denied = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("update_canon_editorial_fields"));
    expect(denied.status).toBe(403);
    expect(mocked.executeCanonEditorial).not.toHaveBeenCalled();

    mocked.verify.mockResolvedValue({
      userId: "super-admin", clientId: "client-1",
      scopes: ["worldsmith:canon:read", "worldsmith:canon:editorial:write"],
    });
    mocked.executeCanonEditorial.mockResolvedValue({ updated: true });
    const granted = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(granted.body.result.tools.map((tool: { name: string }) => tool.name))
      .toContain("update_canon_editorial_fields");
    const allowed = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("update_canon_editorial_fields", { record_id: "canon-1" }));
    expect(allowed.body.result.structuredContent).toEqual({ updated: true });
    expect(mocked.executeCanonEditorial).toHaveBeenCalledWith(
      "super-admin", "update_canon_editorial_fields", { record_id: "canon-1" }, "https://daybook.example",
    );
  });

  it("lists and authorizes scenes only with the explicit scenes read scope", async () => {
    mocked.verify.mockResolvedValue({
      userId: "super-admin", clientId: "client-1", scopes: ["worldsmith:editorial:read"],
    });
    const legacyList = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(legacyList.body.result.tools.map((tool: { name: string }) => tool.name))
      .not.toContain("search_scenes");
    expect((await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("search_scenes"))).status).toBe(403);

    mocked.verify.mockResolvedValue({
      userId: "super-admin", clientId: "client-1", scopes: ["worldsmith:editorial:scenes:read"],
    });
    mocked.executeScene.mockResolvedValue({ scenes: [] });
    const list = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(list.body.result.tools.map((tool: { name: string }) => tool.name))
      .toEqual(expect.arrayContaining(["search_scenes", "get_scene"]));
    expect(list.body.result.tools.map((tool: { name: string }) => tool.name))
      .not.toContain("update_scene");
    expect((await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("update_scene"))).status).toBe(403);

    mocked.verify.mockResolvedValue({
      userId: "super-admin", clientId: "client-1",
      scopes: ["worldsmith:editorial:scenes:read", "worldsmith:editorial:scenes:write"],
    });
    const writeList = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} });
    expect(writeList.body.result.tools.map((tool: { name: string }) => tool.name))
      .toContain("update_scene");
    const allowed = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("update_scene", { scene_id: "scene-1" }));
    expect(allowed.body.result.structuredContent).toEqual({ scenes: [] });
    expect(mocked.executeScene).toHaveBeenCalledWith(
      "super-admin", "update_scene", { scene_id: "scene-1" }, "https://daybook.example",
    );
  });

  it("requires editorial read scope to discover or call creative world context", async () => {
    mocked.verify.mockResolvedValue({
      userId: "super-admin", clientId: "client-1", scopes: ["worldsmith:canon:read"],
    });
    const canonOnly = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
    expect(canonOnly.body.result.tools.map((tool: { name: string }) => tool.name))
      .not.toContain("get_world_creative_context");
    expect((await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("get_world_creative_context", { world_id: "world-1" }))).status).toBe(403);

    mocked.verify.mockResolvedValue({
      userId: "super-admin", clientId: "client-1", scopes: ["worldsmith:editorial:read"],
    });
    const editorialRead = await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(editorialRead.body.result.tools.map((tool: { name: string }) => tool.name))
      .toContain("get_world_creative_context");
    expect(editorialRead.body.result.tools.map((tool: { name: string }) => tool.name))
      .not.toContain("update_world");
    expect((await request(app).post("/mcp").set("Authorization", "Bearer opaque-token")
      .send(call("update_world", { world_id: "world-1", expected_revision: "r", changes: { worldPremise: "x" } }))).status)
      .toBe(403);
  });
});