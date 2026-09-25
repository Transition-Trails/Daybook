import { Router, type Request, type Response } from "express";
import { CANON_TOOLS, executeCanonTool } from "../lib/worldsmith/mcp-canon";
import { getMcpIssuer, verifyMcpAccessToken } from "../lib/mcp-oauth";
import { logger } from "../lib/logger";

const router = Router();
const PROTOCOL_VERSION = "2025-11-25";
const READ_SCOPE = "worldsmith:canon:read";
const WRITE_SCOPE = "worldsmith:canon:write";
const MCP_RESOURCE = "/mcp";
const MAX_BODY_BYTES = 1_000_000;

function publicOrigin(req: Request): string {
  return getMcpIssuer();
}

function challenge(req: Request, res: Response, error = "invalid_token"): void {
  const url = `${publicOrigin(req)}/.well-known/oauth-protected-resource/mcp`;
  const requiredScopes = `${READ_SCOPE} ${WRITE_SCOPE}`;
  res.set("WWW-Authenticate", `Bearer realm="WorldSmith", error="${error}", resource_metadata="${url}", scope="${requiredScopes}"`);
  res.status(error === "insufficient_scope" ? 403 : 401).json({ error });
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

router.all(MCP_RESOURCE, async (req: Request, res: Response): Promise<void> => {
  if (req.method === "OPTIONS") {
    res.set("Allow", "POST, OPTIONS").status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.set("Allow", "POST, OPTIONS").status(405).end();
    return;
  }
  if (!req.is("application/json")) {
    res.status(415).json({ error: "Content-Type must be application/json" });
    return;
  }
  const authorization = req.get("authorization");
  const bearer = /^Bearer ([A-Za-z0-9._~+/-]+)$/i.exec(authorization ?? "");
  if (!bearer) {
    challenge(req, res);
    return;
  }
  let identity: Awaited<ReturnType<typeof verifyMcpAccessToken>>;
  try {
    identity = await verifyMcpAccessToken(bearer[1]!);
  } catch {
    challenge(req, res);
    return;
  }
  if (!identity.scopes.includes(READ_SCOPE)) {
    challenge(req, res, "insufficient_scope");
    return;
  }
  if (Number(req.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    res.status(413).json({ error: "MCP request too large" });
    return;
  }
  const message = req.body as Record<string, unknown> | null;
  if (!message || Array.isArray(message) || typeof message !== "object" || message.jsonrpc !== "2.0"
      || typeof message.method !== "string") {
    res.status(400).json(rpcError(null, -32600, "Invalid JSON-RPC request"));
    return;
  }
  const id = message.id;
  const method = message.method;
  if (id === undefined) {
    // Stateless MCP notifications (including notifications/initialized) have no response body.
    res.status(202).end();
    return;
  }
  if (typeof id !== "string" && typeof id !== "number") {
    res.status(400).json(rpcError(null, -32600, "Invalid JSON-RPC id"));
    return;
  }
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "no-store");
  const reply = (result: unknown) => res.status(200).json({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      reply({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "worldsmith-canon", version: "1.0.0" },
      });
      return;
    case "ping":
      reply({});
      return;
    case "tools/list":
      reply({ tools: CANON_TOOLS });
      return;
    case "tools/call": {
      const params = message.params;
      if (!params || typeof params !== "object" || Array.isArray(params)) {
        res.status(200).json(rpcError(id, -32602, "Invalid tool parameters"));
        return;
      }
      const { name, arguments: args } = params as { name?: unknown; arguments?: unknown };
      if (typeof name !== "string" || !CANON_TOOLS.some(tool => tool.name === name)) {
        res.status(200).json(rpcError(id, -32602, "Unknown tool"));
        return;
      }
      if (name === "update_character_attributes" && !identity.scopes.includes(WRITE_SCOPE)) {
        challenge(req, res, "insufficient_scope");
        return;
      }
      try {
        const data = await executeCanonTool(identity.userId, name, args ?? {}, publicOrigin(req));
        reply({
          content: [{ type: "text", text: JSON.stringify(data) }],
          structuredContent: data,
        });
      } catch (err) {
        const error = err as Error & { code?: string; status?: number };
        if (error.status && error.status >= 500) {
          logger.error({ err, method: name }, "MCP canon tool failed");
        }
        reply({
          isError: true,
          content: [{ type: "text", text: JSON.stringify({
            code: error.code ?? "tool_error",
            message: error.status && error.status < 500 ? error.message : "The operation could not be completed",
          }) }],
        });
      }
      return;
    }
    default:
      res.status(200).json(rpcError(id, -32601, "Method not found"));
  }
});

export default router;